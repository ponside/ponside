import "server-only";
import { encodeFunctionData, parseUnits, toHex, zeroAddress } from "viem";
import { z } from "zod";
import type { PreparedTransaction } from "@/lib/domain";
import { getRobinhoodClient } from "@/lib/pons/chain";
import { curveAbi, factoryAbi, launchAndBuyAbi, tokenAbi, type TokenParams } from "@/lib/pons/contracts";
import { discoverUsableLaunchPairs } from "@/lib/pons/launch-pairs";
import { constantProductOut, minAfterSlippage, quoteCurveBuyDetailed, quoteCurveSell } from "@/lib/pons/math";
import { getChainEnv } from "@/lib/server/env";
import { HttpError } from "@/lib/server/http";
import { getServiceSupabase } from "@/lib/server/supabase";
import { indexTransactionBlock } from "@/lib/pons/indexer";
import { launchSchema, quoteSchema, transactionHashSchema } from "@/lib/pons/validation";

type LaunchDbRow = { token_address: string; curve_address: string; pair_token: string; pair_token_decimals: number | null; pair_token_symbol: string | null; token_decimals: number | null; token_symbol: string | null; phase: number };
const UINT256_MAX = 2n ** 256n - 1n;

function parseExactUnits(value: string, decimals: number) {
  const fraction = value.split(".")[1] || "";
  if (fraction.length > decimals) throw new HttpError(400, "AMOUNT_PRECISION", `This asset supports at most ${decimals} decimal places.`);
  const parsed = parseUnits(value, decimals);
  if (parsed > UINT256_MAX) throw new HttpError(400, "AMOUNT_TOO_LARGE", "The amount is too large.");
  return parsed;
}

async function getLaunchRow(address: string) {
  const { data, error } = await getServiceSupabase().from("pons_launches").select("token_address, curve_address, pair_token, pair_token_decimals, pair_token_symbol, token_decimals, token_symbol, phase").eq("token_address", address).maybeSingle();
  if (error) throw new Error(`Launch lookup failed: ${error.message}`);
  if (!data) throw new HttpError(404, "TOKEN_NOT_FOUND", "This token is not indexed by Ponside.");
  const row = data as unknown as LaunchDbRow;
  if (row.pair_token_decimals === null || row.token_decimals === null || row.token_symbol === null || (row.pair_token !== zeroAddress && row.pair_token_symbol === null)) throw new HttpError(503, "TOKEN_INDEXING", "This launch is still being enriched from onchain state.");
  return row as LaunchDbRow & { pair_token_decimals: number; token_decimals: number; token_symbol: string };
}

async function validateCurvePair(row: LaunchDbRow) {
  const client = getRobinhoodClient();
  const curve = row.curve_address as `0x${string}`;
  const { factoryAddress } = getChainEnv();
  const [pairToken, nativeQuote, economics] = await Promise.all([
    client.readContract({ address: curve, abi: curveAbi, functionName: "pairToken" }),
    client.readContract({ address: curve, abi: curveAbi, functionName: "isNativeQuote" }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "pairTokenEconomics", args: [row.pair_token as `0x${string}`] }),
  ]);
  if (pairToken.toLowerCase() !== row.pair_token.toLowerCase() || nativeQuote !== (pairToken === zeroAddress)) {
    throw new HttpError(409, "PAIR_STATE_MISMATCH", "The indexed quote asset does not match current curve state.");
  }
  if (economics[0] === 0n || economics[1] === 0n || Number(economics[2]) !== row.pair_token_decimals) {
    throw new HttpError(409, "PAIR_ECONOMICS_MISMATCH", "The quote asset economics do not match indexed launch state.");
  }
  if (pairToken !== zeroAddress) {
    const decimals = await client.readContract({ address: pairToken, abi: tokenAbi, functionName: "decimals" });
    if (Number(decimals) !== row.pair_token_decimals) throw new HttpError(409, "PAIR_DECIMALS_MISMATCH", "The quote asset decimals do not match indexed launch state.");
  } else if (row.pair_token_decimals !== 18) {
    throw new HttpError(409, "PAIR_DECIMALS_MISMATCH", "The native quote asset must use 18 decimals.");
  }
}

async function assertUsableLaunchPair(pairToken: `0x${string}`) {
  if (pairToken === zeroAddress) return { phantomQuote: 0n, graduationThreshold: 0n, decimals: 18 } as const;
  const client = getRobinhoodClient();
  const { factoryAddress } = getChainEnv();
  const [approved, economics] = await Promise.all([
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "approvedPairTokens", args: [pairToken] }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "pairTokenEconomics", args: [pairToken] }),
  ]);
  if (!approved || economics[0] === 0n || economics[1] === 0n) throw new HttpError(409, "PAIR_NOT_AVAILABLE", "This quote asset is not currently approved for new Pons V2 launches.");
  return { phantomQuote: economics[0], graduationThreshold: economics[1], decimals: Number(economics[2]) } as const;
}

async function readCurveQuote(row: LaunchDbRow, side: "buy" | "sell", amount: bigint, recipient: `0x${string}`) {
  if (row.phase !== 0) throw new HttpError(409, "GRADUATED_MARKET_UNAVAILABLE", "Trading integration for this graduated market is not available yet.");
  const client = getRobinhoodClient();
  const curve = row.curve_address as `0x${string}`;
  await validateCurvePair(row);
  const [reserves, feeBps, creatorTaxBps, readyToGraduate, graduated] = await Promise.all([
    client.readContract({ address: curve, abi: curveAbi, functionName: "getReserves" }),
    client.readContract({ address: curve, abi: curveAbi, functionName: "feeBps" }),
    client.readContract({ address: curve, abi: curveAbi, functionName: "creatorTaxBps" }),
    client.readContract({ address: curve, abi: curveAbi, functionName: "readyToGraduate" }),
    client.readContract({ address: curve, abi: curveAbi, functionName: "graduated" }),
  ]);
  if (graduated) throw new HttpError(409, "CURVE_CLOSED", "The bonding curve is complete and cannot accept another internal trade.");
  if (side === "buy") {
    const [sellableTokens, snipeTaxBps] = await Promise.all([
      client.readContract({ address: curve, abi: curveAbi, functionName: "sellableTokens" }),
      client.readContract({ address: curve, abi: curveAbi, functionName: "currentSnipeTaxBps", args: [recipient] }),
    ]);
    if (sellableTokens === 0n) throw new HttpError(409, "CURVE_CLOSED", "The bonding curve has no tokens left to sell.");
    const quote = quoteCurveBuyDetailed({ quoteIn: amount, quoteReserve: reserves[0], tokenReserve: reserves[1], sellableTokens, feeBps, creatorTaxBps, snipeTaxBps });
    const idealOut = reserves[0] > 0n ? quote.quoteSpent * reserves[1] / reserves[0] : 0n;
    const curveOutWithoutFees = constantProductOut(quote.quoteSpent, reserves[0], reserves[1]);
    const comparableCurveOut = curveOutWithoutFees > sellableTokens ? sellableTokens : curveOutWithoutFees;
    const priceImpactBps = idealOut > comparableCurveOut && idealOut > 0n ? Number((idealOut - comparableCurveOut) * 10_000n / idealOut) : 0;
    return { amountOut: quote.tokensOut, rateAmountOut: quote.rateTokensOut, quoteSpent: quote.quoteSpent, quoteRefund: quote.quoteRefund, feeBps: Number(feeBps + creatorTaxBps + snipeTaxBps), priceImpactBps };
  }
  if (readyToGraduate) throw new HttpError(409, "CURVE_CLOSED", "The bonding curve is ready to graduate and no longer accepts sells.");
  const amountOut = quoteCurveSell({ tokensIn: amount, quoteReserve: reserves[0], tokenReserve: reserves[1], feeBps, creatorTaxBps });
  const idealOut = reserves[1] > 0n ? amount * reserves[0] / reserves[1] : 0n;
  const curveOutWithoutFees = constantProductOut(amount, reserves[1], reserves[0]);
  const priceImpactBps = idealOut > curveOutWithoutFees && idealOut > 0n ? Number((idealOut - curveOutWithoutFees) * 10_000n / idealOut) : 0;
  return { amountOut, rateAmountOut: amountOut, quoteSpent: amount, quoteRefund: 0n, feeBps: Number(feeBps + creatorTaxBps), priceImpactBps };
}

export async function quoteTrade(input: z.infer<typeof quoteSchema>, recipient: `0x${string}`) {
  const row = await getLaunchRow(input.tokenAddress);
  const inputDecimals = input.side === "buy" ? row.pair_token_decimals! : row.token_decimals!;
  const outputDecimals = input.side === "buy" ? row.token_decimals! : row.pair_token_decimals!;
  const amountIn = parseExactUnits(input.amount, inputDecimals);
  if (amountIn <= 0n) throw new HttpError(400, "ZERO_AMOUNT", "Amount must be greater than zero.");
  const result = await readCurveQuote(row, input.side, amountIn, recipient);
  const minAmountOut = minAfterSlippage(result.rateAmountOut, BigInt(input.slippageBps));
  if (result.amountOut <= 0n || result.rateAmountOut <= 0n || minAmountOut <= 0n) throw new HttpError(409, "ZERO_OUTPUT", "This amount cannot produce a non-zero protected output.");
  const pairSymbol = row.pair_token === zeroAddress ? "ETH" : row.pair_token_symbol!;
  return { amountIn: amountIn.toString(), amountOut: result.amountOut.toString(), minAmountOut: minAmountOut.toString(), quoteSpent: result.quoteSpent.toString(), quoteRefund: result.quoteRefund.toString(), inputDecimals, outputDecimals, inputSymbol: input.side === "buy" ? pairSymbol : row.token_symbol!, outputSymbol: input.side === "buy" ? row.token_symbol! : pairSymbol, feeBps: result.feeBps, priceImpactBps: result.priceImpactBps };
}

function prepared(to: `0x${string}`, data: `0x${string}`, value: bigint, summary: string): PreparedTransaction {
  return { chainId: 4663, to, data, value: toHex(value), summary };
}

export async function prepareTrade(input: z.infer<typeof quoteSchema>, walletAddress: `0x${string}`) {
  const row = await getLaunchRow(input.tokenAddress);
  const quote = await quoteTrade(input, walletAddress);
  const curve = row.curve_address as `0x${string}`;
  const amountIn = BigInt(quote.amountIn);
  const minOut = BigInt(quote.minAmountOut);
  if (input.side === "buy") {
    const value = row.pair_token === zeroAddress ? amountIn : 0n;
    const buy = prepared(curve, encodeFunctionData({ abi: curveAbi, functionName: "buy", args: [amountIn, minOut, walletAddress] }), value, `Buy ${quote.outputSymbol}`);
    if (row.pair_token !== zeroAddress) {
      const pair = row.pair_token as `0x${string}`;
      const allowance = await getRobinhoodClient().readContract({ address: pair, abi: tokenAbi, functionName: "allowance", args: [walletAddress, curve] });
      if (allowance < amountIn) {
        await getRobinhoodClient().simulateContract({ account: walletAddress, address: pair, abi: tokenAbi, functionName: "approve", args: [curve, amountIn] });
        return { quote, transactions: [prepared(pair, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [curve, amountIn] }), 0n, `Approve ${quote.inputSymbol}`)], requiresApproval: true };
      }
    }
    await getRobinhoodClient().simulateContract({ account: walletAddress, address: curve, abi: curveAbi, functionName: "buy", args: [amountIn, minOut, walletAddress], value });
    return { quote, transactions: [buy], requiresApproval: false };
  }
  const token = row.token_address as `0x${string}`;
  const allowance = await getRobinhoodClient().readContract({ address: token, abi: tokenAbi, functionName: "allowance", args: [walletAddress, curve] });
  const approval = allowance < amountIn ? prepared(token, encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [curve, amountIn] }), 0n, `Approve ${quote.inputSymbol}`) : null;
  if (approval) await getRobinhoodClient().simulateContract({ account: walletAddress, address: token, abi: tokenAbi, functionName: "approve", args: [curve, amountIn] });
  else await getRobinhoodClient().simulateContract({ account: walletAddress, address: curve, abi: curveAbi, functionName: "sell", args: [amountIn, minOut, walletAddress] });
  return { quote, transactions: approval ? [approval] : [prepared(curve, encodeFunctionData({ abi: curveAbi, functionName: "sell", args: [amountIn, minOut, walletAddress] }), 0n, `Sell ${quote.inputSymbol}`)], requiresApproval: Boolean(approval) };
}

export async function listLaunchConfiguration(walletAddress?: `0x${string}` | null) {
  const { factoryAddress } = getChainEnv();
  const client = getRobinhoodClient();
  const [count, launchFee, maxCreatorTaxBps, canLaunch, pairs] = await Promise.all([
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "launchConfigCount" }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "launchFee" }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "maxCreatorTaxBps" }),
    walletAddress ? client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "canLaunch", args: [walletAddress] }) : Promise.resolve(false),
    discoverUsableLaunchPairs(),
  ]);
  const configs = await Promise.all(Array.from({ length: Number(count) }, async (_, id) => {
    const config = await client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchConfig", args: [BigInt(id)] });
    return { id: String(id), supply: config.supply.toString(), curveFeeBps: Number(config.curveFeeBps), phantomQuote: config.phantomQuote.toString(), graduationThreshold: config.graduationThreshold.toString(), poolFee: Number(config.poolFee), tickSpacing: Number(config.tickSpacing), enabled: config.enabled };
  }));
  return { factoryAddress, launchFee: launchFee.toString(), maxCreatorTaxBps: Number(maxCreatorTaxBps), canLaunch, pairs, configs: configs.filter((config) => config.enabled), riskNotice: "Pons V2 is deployed but its published audits are still in progress. Transactions are irreversible and tokens can lose all value." };
}

export async function prepareLaunch(input: z.infer<typeof launchSchema>, walletAddress: `0x${string}`) {
  if (input.pairToken !== zeroAddress) throw new HttpError(409, "CUSTOM_PAIR_NOT_ENABLED", "Ponside currently enables only the authoritative native ETH pair.");
  const client = getRobinhoodClient();
  const { factoryAddress, launchAndBuyAddress } = getChainEnv();
  const launchConfigId = BigInt(input.launchConfigId);
  await assertUsableLaunchPair(input.pairToken);
  const [canLaunch, launchFee, maxTax, economics, config] = await Promise.all([
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "canLaunch", args: [walletAddress] }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "launchFee" }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "maxCreatorTaxBps" }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "previewLaunchEconomics", args: [launchConfigId, input.pairToken] }),
    client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchConfig", args: [launchConfigId] }),
  ]);
  if (!canLaunch) throw new HttpError(403, "LAUNCH_NOT_ALLOWED", "This wallet is not currently permitted by the Pons V2 launch gate.");
  if (BigInt(input.creatorTaxBps) > maxTax) throw new HttpError(400, "CREATOR_TAX_TOO_HIGH", `Creator tax cannot exceed ${maxTax} bps.`);
  if (!config.enabled) throw new HttpError(409, "LAUNCH_CONFIG_DISABLED", "This launch configuration is no longer enabled.");
  const saltBytes = new Uint8Array(32);
  crypto.getRandomValues(saltBytes);
  const params: TokenParams = {
    name: input.name,
    symbol: input.symbol,
    logo: input.logo,
    description: input.description,
    socials: { twitter: input.twitter, telegram: input.telegram, discord: input.discord, website: input.website, farcaster: input.farcaster },
    creatorFeeRecipient: walletAddress,
    creatorTaxBps: input.creatorTaxBps,
    buybackEnabled: input.buybackEnabled,
    expectedEconomics: economics,
    salt: toHex(saltBytes),
  };
  const devBuy = parseExactUnits(input.devBuy, 18);
  if (devBuy === 0n) {
    const data = encodeFunctionData({ abi: factoryAbi, functionName: "launchToken", args: [params, launchConfigId, input.pairToken] });
    await client.simulateContract({ account: walletAddress, address: factoryAddress, abi: factoryAbi, functionName: "launchToken", args: [params, launchConfigId, input.pairToken], value: launchFee });
    const gas = await client.estimateContractGas({ account: walletAddress, address: factoryAddress, abi: factoryAbi, functionName: "launchToken", args: [params, launchConfigId, input.pairToken], value: launchFee });
    return { transaction: { ...prepared(factoryAddress, data, launchFee, `Launch $${input.symbol}`), gas: toHex(gas * 12n / 10n) }, estimatedGas: gas.toString(), launchConfigId: input.launchConfigId };
  }
  const reserved = config.supply * config.phantomQuote / (config.phantomQuote + config.graduationThreshold);
  const expected = quoteCurveBuyDetailed({ quoteIn: devBuy, quoteReserve: config.phantomQuote, tokenReserve: config.supply, sellableTokens: config.supply - reserved, feeBps: config.curveFeeBps, creatorTaxBps: BigInt(input.creatorTaxBps), snipeTaxBps: 0n });
  const minOut = minAfterSlippage(expected.rateTokensOut, BigInt(input.slippageBps));
  const value = launchFee + devBuy;
  const args = [params, launchConfigId, input.pairToken, devBuy, minOut, walletAddress, []] as const;
  const data = encodeFunctionData({ abi: launchAndBuyAbi, functionName: "launchAndBuy", args });
  await client.simulateContract({ account: walletAddress, address: launchAndBuyAddress, abi: launchAndBuyAbi, functionName: "launchAndBuy", args, value });
  const gas = await client.estimateContractGas({ account: walletAddress, address: launchAndBuyAddress, abi: launchAndBuyAbi, functionName: "launchAndBuy", args, value });
  return { transaction: { ...prepared(launchAndBuyAddress, data, value, `Launch and buy $${input.symbol}`), gas: toHex(gas * 12n / 10n) }, estimatedGas: gas.toString(), launchConfigId: input.launchConfigId };
}

export async function confirmLaunch(transactionHash: string, profileId: string, walletAddress: `0x${string}`) {
  const hash = transactionHashSchema.parse(transactionHash).toLowerCase() as `0x${string}`;
  let receipt;
  try {
    receipt = await getRobinhoodClient().getTransactionReceipt({ hash });
  } catch {
    throw new HttpError(409, "TRANSACTION_PENDING", "The transaction is not confirmed yet.");
  }
  if (receipt.status !== "success") throw new HttpError(409, "TRANSACTION_REVERTED", "The launch transaction reverted.");
  await indexTransactionBlock(receipt.blockNumber);
  const supabase = getServiceSupabase();
  const { data: launch, error } = await supabase.from("pons_launches").select("token_address, deployer_address, token_symbol").eq("launch_tx_hash", hash).maybeSingle();
  if (error) throw new Error(`Launch confirmation query failed: ${error.message}`);
  if (!launch) throw new HttpError(409, "LAUNCH_EVENT_NOT_FOUND", "The confirmed transaction did not emit a Pons V2 launch event.");
  if (String(launch.deployer_address).toLowerCase() !== walletAddress.toLowerCase()) throw new HttpError(403, "LAUNCH_WALLET_MISMATCH", "The launch was not created by your authenticated wallet.");
  if (!launch.token_symbol) throw new HttpError(503, "TOKEN_INDEXING", "The launch was confirmed, but its onchain metadata has not finished indexing.");
  const content = `$${String(launch.token_symbol)} is live on Ponside.`;
  const { error: activityError } = await supabase.rpc("record_verified_launch_activity", {
    p_token_address: launch.token_address,
    p_transaction_hash: hash,
    p_profile_id: profileId,
    p_wallet_address: walletAddress.toLowerCase(),
    p_content: content,
  });
  if (activityError) throw new Error(`Launch activity creation failed: ${activityError.message}`);
  return { tokenAddress: String(launch.token_address), transactionHash: hash };
}
