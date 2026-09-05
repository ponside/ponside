import "server-only";
import { encodeFunctionData, formatUnits, getAddress, parseUnits, toHex, zeroAddress } from "viem";
import { z } from "zod";
import type { PreparedTransaction } from "@/lib/domain";
import { getRobinhoodClient } from "@/lib/pons/chain";
import { ROBINHOOD_CHAIN_ID, tokenAbi } from "@/lib/pons/contracts";
import { sendSchema } from "@/lib/pons/validation";
import { HttpError } from "@/lib/server/http";
import { getServiceSupabase } from "@/lib/server/supabase";

const UINT256_MAX = 2n ** 256n - 1n;

function parseExactAmount(value: string, decimals: number) {
  const fraction = value.split(".")[1] || "";
  if (fraction.length > decimals) throw new HttpError(400, "AMOUNT_PRECISION", `This asset supports at most ${decimals} decimal places.`);
  const amount = parseUnits(value, decimals);
  if (amount <= 0n) throw new HttpError(400, "ZERO_AMOUNT", "Amount must be greater than zero.");
  if (amount > UINT256_MAX) throw new HttpError(400, "AMOUNT_TOO_LARGE", "The amount is too large.");
  return amount;
}

async function assertIndexedAsset(address: `0x${string}`) {
  const normalized = address.toLowerCase();
  const { data, error } = await getServiceSupabase().from("pons_launches").select("token_address")
    .or(`token_address.eq.${normalized},pair_token.eq.${normalized}`).limit(1);
  if (error) throw new Error(`Wallet asset lookup failed: ${error.message}`);
  if (!data?.length) throw new HttpError(404, "ASSET_NOT_SUPPORTED", "This asset is not a verified Pons market or quote asset.");
}

export async function prepareWalletSend(input: z.infer<typeof sendSchema>, walletAddress: `0x${string}`) {
  const client = getRobinhoodClient();
  const chainId = await client.getChainId();
  if (chainId !== ROBINHOOD_CHAIN_ID) throw new HttpError(503, "CHAIN_MISMATCH", "The configured RPC is not Robinhood Chain.");
  const recipient = getAddress(input.recipient);
  const nativeBalance = await client.getBalance({ address: walletAddress });
  const gasPrice = await client.getGasPrice();

  if (input.asset === "native") {
    const amount = parseExactAmount(input.amount, 18);
    if (amount > nativeBalance) throw new HttpError(409, "INSUFFICIENT_BALANCE", "Your ETH balance is too low for this transfer.");
    let estimate: bigint;
    try { estimate = await client.estimateGas({ account: walletAddress, to: recipient, value: amount }); }
    catch { throw new HttpError(409, "TRANSFER_SIMULATION_FAILED", "The native transfer could not be simulated. Check the recipient and available ETH for gas."); }
    const gasLimit = estimate * 12n / 10n;
    if (amount + gasLimit * gasPrice > nativeBalance) throw new HttpError(409, "INSUFFICIENT_GAS", "Your ETH balance does not cover the transfer and estimated network fee.");
    const transaction: PreparedTransaction = { chainId: ROBINHOOD_CHAIN_ID, to: recipient, data: "0x", value: toHex(amount), gas: toHex(gasLimit), summary: `Send ${input.amount} ETH` };
    return { transaction, asset: { kind: "native" as const, address: null, name: "Ether", symbol: "ETH", decimals: 18, amountRaw: amount.toString(), amountFormatted: formatUnits(amount, 18) }, estimatedGas: estimate.toString(), estimatedNetworkFeeWei: (gasLimit * gasPrice).toString() };
  }

  const address = getAddress(input.asset);
  if (address === zeroAddress) throw new HttpError(400, "INVALID_ASSET", "Use the native ETH asset for native transfers.");
  await assertIndexedAsset(address);
  const [name, symbol, decimalsValue, balance] = await Promise.all([
    client.readContract({ address, abi: tokenAbi, functionName: "name" }),
    client.readContract({ address, abi: tokenAbi, functionName: "symbol" }),
    client.readContract({ address, abi: tokenAbi, functionName: "decimals" }),
    client.readContract({ address, abi: tokenAbi, functionName: "balanceOf", args: [walletAddress] }),
  ]);
  const decimals = Number(decimalsValue);
  const amount = parseExactAmount(input.amount, decimals);
  if (amount > balance) throw new HttpError(409, "INSUFFICIENT_BALANCE", `Your ${symbol} balance is too low for this transfer.`);
  const args = [recipient, amount] as const;
  let estimate: bigint;
  try {
    await client.simulateContract({ account: walletAddress, address, abi: tokenAbi, functionName: "transfer", args });
    estimate = await client.estimateContractGas({ account: walletAddress, address, abi: tokenAbi, functionName: "transfer", args });
  } catch { throw new HttpError(409, "TRANSFER_SIMULATION_FAILED", "The token transfer could not be simulated with current onchain state."); }
  const gasLimit = estimate * 12n / 10n;
  if (gasLimit * gasPrice > nativeBalance) throw new HttpError(409, "INSUFFICIENT_GAS", "Your ETH balance does not cover the estimated network fee.");
  const transaction: PreparedTransaction = { chainId: ROBINHOOD_CHAIN_ID, to: address, data: encodeFunctionData({ abi: tokenAbi, functionName: "transfer", args }), value: "0x0", gas: toHex(gasLimit), summary: `Send ${input.amount} ${symbol}` };
  return { transaction, asset: { kind: "erc20" as const, address: address.toLowerCase(), name, symbol, decimals, amountRaw: amount.toString(), amountFormatted: formatUnits(amount, decimals) }, estimatedGas: estimate.toString(), estimatedNetworkFeeWei: (gasLimit * gasPrice).toString() };
}
