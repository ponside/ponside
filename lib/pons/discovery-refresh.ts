import "server-only";
import { parseEventLogs, zeroAddress } from "viem";
import { EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18 } from "@/lib/discovery";
import { factoryAbi, tokenAbi } from "@/lib/pons/contracts";
import { getRobinhoodClient } from "@/lib/pons/chain";
import type { OfficialPonsMarket } from "@/lib/pons/source-utils";
import { getChainEnv } from "@/lib/server/env";
import {
  getOfficialPonsV2ActiveMarketCandidates,
  getOfficialPonsV2GraduatedMarkets,
  getOfficialPonsV2MarketByAddress,
  getOfficialPonsV2RecentMarkets,
} from "@/lib/server/pons-source";
import { getServiceSupabase } from "@/lib/server/supabase";

type StoredLaunch = {
  token_address: string;
  curve_address: string;
  deployer_address: string;
  pair_token: string;
  pair_token_decimals: number | null;
  pair_token_symbol: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_decimals: number | null;
  total_supply: string | null;
  launch_tx_hash: string;
  launch_block: number;
  launch_timestamp: string;
  is_ponside_launch: boolean;
};

function safeErrorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).replace(/https?:\/\/\S+/g, "[redacted RPC URL]");
}

function storedIdentityMatches(row: StoredLaunch, market: OfficialPonsMarket) {
  return row.token_address === market.tokenAddress
    && row.deployer_address === market.deployerAddress
    && row.pair_token === market.pairToken
    && row.launch_tx_hash === market.transactionHash
    && Number(row.launch_block) === market.launchBlock
    && Math.abs(Date.parse(row.launch_timestamp) - Date.parse(market.launchTimestamp)) <= 5_000
    && row.pair_token_decimals !== null
    && row.pair_token_symbol !== null
    && row.token_name !== null
    && row.token_symbol !== null
    && row.token_decimals !== null
    && row.total_supply !== null;
}

async function verifyAndStoreNewMarket(market: OfficialPonsMarket) {
  const client = getRobinhoodClient();
  const supabase = getServiceSupabase();
  const { factoryAddress } = getChainEnv();
  const factory = factoryAddress.toLowerCase();
  const receipt = await client.getTransactionReceipt({ hash: market.transactionHash });
  if (receipt.status !== "success" || receipt.blockNumber !== BigInt(market.launchBlock)) throw new Error("Official launch transaction does not match its successful on-chain receipt.");
  const launchEvent = parseEventLogs({ abi: factoryAbi, logs: receipt.logs, strict: true }).find((entry) => entry.eventName === "TokenLaunched" && entry.address.toLowerCase() === factory && entry.args.token.toLowerCase() === market.tokenAddress);
  if (!launchEvent || launchEvent.eventName !== "TokenLaunched") throw new Error("Verified factory TokenLaunched event was not found.");
  if (launchEvent.args.deployer.toLowerCase() !== market.deployerAddress || launchEvent.args.pairToken.toLowerCase() !== market.pairToken) throw new Error("Official source identity does not match the factory event.");

  const launch = await client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchedToken", args: [market.tokenAddress] });
  if (!launch.exists || launch.token.toLowerCase() !== market.tokenAddress || launch.deployer.toLowerCase() !== market.deployerAddress || launch.pairToken.toLowerCase() !== market.pairToken || launch.curve.toLowerCase() !== launchEvent.args.curve.toLowerCase()) throw new Error("Factory launch state does not match the official source and launch receipt.");
  if (launch.graduationThreshold !== launchEvent.args.graduationThreshold) throw new Error("Launch economics do not match the verified event.");

  let pairDecimals = 18;
  let pairSymbol = "ETH";
  if (market.pairToken === zeroAddress) {
    const config = await client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchConfig", args: [launchEvent.args.launchConfigId] });
    if (config.phantomQuote === 0n || config.graduationThreshold === 0n || config.graduationThreshold !== launch.graduationThreshold) throw new Error("Native launch economics do not match the verified launch config.");
  } else {
    const [approved, economics, decimals, symbol] = await Promise.all([
      client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "approvedPairTokens", args: [market.pairToken] }),
      client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "pairTokenEconomics", args: [market.pairToken] }),
      client.readContract({ address: market.pairToken, abi: tokenAbi, functionName: "decimals" }),
      client.readContract({ address: market.pairToken, abi: tokenAbi, functionName: "symbol" }),
    ]);
    if (!approved || economics[0] === 0n || economics[1] === 0n) throw new Error("The custom pair is not currently approved with real Pons V2 economics.");
    pairDecimals = Number(decimals);
    pairSymbol = symbol;
    if (pairDecimals !== Number(economics[2])) throw new Error("Pair decimals do not match Pons V2 economics.");
  }

  const [name, symbol, decimals, totalSupply, tokenInfo] = await Promise.all([
    client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "name" }),
    client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "symbol" }),
    client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "decimals" }),
    client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "totalSupply" }),
    client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "getTokenInfo" }),
  ]);
  if ((Number(launch.phase) >= 2) !== market.graduated) throw new Error("Official market phase conflicts with live factory state.");

  const creator = await supabase.from("profiles").select("id").ilike("wallet_address", launch.deployer).maybeSingle();
  if (creator.error) throw new Error(`Creator lookup failed: ${creator.error.message}`);
  const upsert = await supabase.from("pons_launches").insert({
    token_address: market.tokenAddress,
    curve_address: launch.curve.toLowerCase(),
    deployer_address: launch.deployer.toLowerCase(),
    creator_profile_id: creator.data?.id ?? null,
    is_ponside_launch: false,
    pair_token: launch.pairToken.toLowerCase(),
    pair_token_decimals: pairDecimals,
    pair_token_symbol: pairSymbol,
    token_name: name,
    token_symbol: symbol,
    token_decimals: Number(decimals),
    token_logo_url: tokenInfo[1] || null,
    token_description: tokenInfo[2] || "",
    total_supply: totalSupply.toString(),
    launch_config_id: launchEvent.args.launchConfigId.toString(),
    graduation_threshold: launch.graduationThreshold.toString(),
    launch_tx_hash: market.transactionHash,
    launch_block: market.launchBlock,
    launch_timestamp: market.launchTimestamp,
    phase: Number(launch.phase),
    graduated_block: market.graduatedBlock,
    last_synced_block: market.graduatedBlock ?? market.launchBlock,
    indexed_at: new Date().toISOString(),
  });
  if (upsert.error) throw new Error(`Verified launch upsert failed: ${upsert.error.message}`);
}

export async function refreshPonsMarketDiscovery() {
  const supabase = getServiceSupabase();
  const { factoryAddress } = getChainEnv();
  const factory = factoryAddress.toLowerCase();
  const storedResult = await supabase.from("pons_launches").select("token_address, curve_address, deployer_address, pair_token, pair_token_decimals, pair_token_symbol, token_name, token_symbol, token_decimals, total_supply, launch_tx_hash, launch_block, launch_timestamp, is_ponside_launch");
  if (storedResult.error) throw new Error(`Stored market lookup failed: ${storedResult.error.message}`);
  const stored = storedResult.data as StoredLaunch[];
  const storedByToken = new Map(stored.map((row) => [row.token_address, row]));

  const [graduated, active, recent] = await Promise.all([
    getOfficialPonsV2GraduatedMarkets(),
    getOfficialPonsV2ActiveMarketCandidates(EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18),
    getOfficialPonsV2RecentMarkets(),
  ]);
  const sourceMarkets = new Map<string, OfficialPonsMarket>();
  for (const market of [...graduated, ...active.observedMarkets, ...recent]) {
    if (market.factoryAddress === factory) sourceMarkets.set(market.tokenAddress, market);
  }
  for (const row of stored.filter((item) => item.is_ponside_launch && !sourceMarkets.has(item.token_address))) {
    const market = await getOfficialPonsV2MarketByAddress(row.token_address);
    if (market?.factoryAddress === factory) sourceMarkets.set(market.tokenAddress, market);
  }

  let newMarketsVerified = 0;
  const verificationFailures: Array<{ tokenAddress: string; reason: string }> = [];
  const verifiedForSnapshot: OfficialPonsMarket[] = [];
  const ordered = [...sourceMarkets.values()].sort((left, right) => right.launchBlock - left.launchBlock || left.tokenAddress.localeCompare(right.tokenAddress));
  for (const market of ordered) {
    const existing = storedByToken.get(market.tokenAddress);
    if (existing) {
      if (!storedIdentityMatches(existing, market)) {
        verificationFailures.push({ tokenAddress: market.tokenAddress, reason: "Official identity conflicts with the stored verified launch." });
        continue;
      }
      if (market.graduated && market.graduatedBlock !== null) {
        const phase = await supabase.rpc("advance_launch_phase", { p_token_address: market.tokenAddress, p_phase: 2, p_lifecycle_block: market.graduatedBlock, p_last_synced_block: market.graduatedBlock });
        if (phase.error) {
          verificationFailures.push({ tokenAddress: market.tokenAddress, reason: `Authoritative phase refresh failed: ${phase.error.message}` });
          continue;
        }
      }
      verifiedForSnapshot.push(market);
      continue;
    }
    if (BigInt(market.marketCapUsdE18) < EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18) continue;
    try {
      await verifyAndStoreNewMarket(market);
      newMarketsVerified += 1;
      verifiedForSnapshot.push(market);
    } catch (error) {
      verificationFailures.push({ tokenAddress: market.tokenAddress, reason: safeErrorMessage(error) });
    }
  }

  const snapshotRows = verifiedForSnapshot.map((market) => ({
    token_address: market.tokenAddress,
    observed_at: market.observedAt,
    price_usd_e18: market.priceUsdE18,
    market_cap_usd_e18: market.marketCapUsdE18,
    latest_buy_at: market.latestBuyAt,
    latest_buy_block: market.latestBuyBlock,
    graduation_progress_bps: market.graduationProgressBps,
    source: "official-pons-launchpad" as const,
  }));
  for (let offset = 0; offset < snapshotRows.length; offset += 500) {
    const result = await supabase.from("pons_market_snapshots").upsert(snapshotRows.slice(offset, offset + 500), { onConflict: "token_address,observed_at" });
    if (result.error) throw new Error(`Official market snapshot persistence failed: ${result.error.message}`);
  }

  const nowSeconds = Math.floor(Date.now() / 1_000);
  const startName = "pons-discovery-snapshot-start:v1";
  const refreshName = "pons-discovery-refresh:v1";
  const start = await supabase.from("indexer_state").select("indexer_name").eq("indexer_name", startName).maybeSingle();
  if (start.error) throw new Error(`Discovery snapshot start lookup failed: ${start.error.message}`);
  if (!start.data) {
    const initialized = await supabase.rpc("advance_indexer_state", { p_indexer_name: startName, p_last_processed_block: nowSeconds });
    if (initialized.error) throw new Error(`Discovery snapshot start initialization failed: ${initialized.error.message}`);
  }
  const refreshed = await supabase.rpc("advance_indexer_state", { p_indexer_name: refreshName, p_last_processed_block: nowSeconds });
  if (refreshed.error) throw new Error(`Discovery refresh checkpoint failed: ${refreshed.error.message}`);

  return {
    officialMarketsObserved: sourceMarkets.size,
    snapshotsStored: snapshotRows.length,
    newMarketsVerified,
    verificationFailures,
    refreshedAt: new Date(nowSeconds * 1_000).toISOString(),
  };
}
