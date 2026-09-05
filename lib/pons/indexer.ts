import "server-only";
import { getAbiItem, zeroAddress } from "viem";
import { curveAbi, factoryAbi, tokenAbi } from "@/lib/pons/contracts";
import { getRobinhoodIndexerClient } from "@/lib/pons/chain";
import { getChainEnv } from "@/lib/server/env";
import { logEvent } from "@/lib/server/logging";
import { getServiceSupabase } from "@/lib/server/supabase";
import {
  chunkEnd,
  INDEXER_RETRY_BACKOFF_MS,
  indexerRetryDelayMs,
  isSplittableIndexerLogError,
  isTransientIndexerError,
  stableIndexerHead,
} from "@/lib/pons/indexer-utils";

const tokenLaunchedEvent = getAbiItem({ abi: factoryAbi, name: "TokenLaunched" });
const launchSweptEvent = getAbiItem({ abi: factoryAbi, name: "LaunchSwept" });
const poolGraduatedEvent = getAbiItem({ abi: factoryAbi, name: "PoolGraduated" });
const curveBuyEvent = getAbiItem({ abi: curveAbi, name: "CurveBuy" });
const curveSellEvent = getAbiItem({ abi: curveAbi, name: "CurveSell" });
const curveBuyRefundedEvent = getAbiItem({ abi: curveAbi, name: "CurveBuyRefunded" });
const curveCompletedEvent = getAbiItem({ abi: curveAbi, name: "CurveCompleted" });
const CURVE_ADDRESS_BATCH_SIZE = 5;

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[redacted RPC URL]");
}

type RetryStats = { providerRetries: number };
type LaunchEnrichmentRow = {
  token_address: string;
  curve_address: string;
  pair_token_decimals: number | null;
  pair_token_symbol: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_decimals: number | null;
  total_supply: string | null;
};

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function retry<T>(work: () => Promise<T>, label: string, stats: RetryStats): Promise<T> {
  let last: unknown;
  const attempts = INDEXER_RETRY_BACKOFF_MS.length + 1;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return await work(); } catch (error) {
      last = error;
      const transient = isTransientIndexerError(error);
      if (!transient || attempt >= attempts) {
        logEvent("warn", "indexer.rpc_stopped", { label, attempt, transient, message: safeErrorMessage(error) });
        break;
      }
      const delayMs = indexerRetryDelayMs(attempt - 1);
      stats.providerRetries += 1;
      logEvent("warn", "indexer.retry", { label, attempt, nextAttempt: attempt + 1, delayMs, message: safeErrorMessage(error) });
      await wait(delayMs);
    }
  }
  throw new Error(safeErrorMessage(last), { cause: last });
}

async function getLogsWithSplit<T>(
  fromBlock: bigint,
  toBlock: bigint,
  label: string,
  read: (from: bigint, to: bigint) => Promise<T[]>,
  stats: RetryStats,
  splitDepth = 0,
): Promise<T[]> {
  try {
    return await retry(() => read(fromBlock, toBlock), `${label}:${fromBlock}-${toBlock}`, stats);
  } catch (error) {
    if (fromBlock >= toBlock || splitDepth >= 3 || !isSplittableIndexerLogError(error)) throw error;
    const midpoint = fromBlock + (toBlock - fromBlock) / 2n;
    logEvent("warn", "indexer.split_log_range", { label, fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), midpoint: midpoint.toString() });
    const left = await getLogsWithSplit(fromBlock, midpoint, label, read, stats, splitDepth + 1);
    const right = await getLogsWithSplit(midpoint + 1n, toBlock, label, read, stats, splitDepth + 1);
    return [...left, ...right];
  }
}

async function blockTimes(blocks: bigint[], stats: RetryStats) {
  const unique = [...new Set(blocks.map(String))].map(BigInt);
  const entries: Array<readonly [string, string]> = [];
  for (const block of unique) {
    const value = await retry(() => getRobinhoodIndexerClient().getBlock({ blockNumber: block }), `block:${block}`, stats);
    entries.push([block.toString(), new Date(Number(value.timestamp) * 1000).toISOString()] as const);
  }
  return new Map(entries);
}

async function enrichLaunch(tokenAddress: `0x${string}`, curveAddress: `0x${string}`, lastSyncedBlock: bigint, stats: RetryStats) {
  const client = getRobinhoodIndexerClient();
  const { factoryAddress } = getChainEnv();
  const name = await retry(() => client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "name" }), `name:${tokenAddress}`, stats);
  const symbol = await retry(() => client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "symbol" }), `symbol:${tokenAddress}`, stats);
  const decimals = await retry(() => client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "decimals" }), `decimals:${tokenAddress}`, stats);
  const totalSupply = await retry(() => client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "totalSupply" }), `supply:${tokenAddress}`, stats);
  const info = await retry(() => client.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "getTokenInfo" }), `metadata:${tokenAddress}`, stats);
  const launch = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchedToken", args: [tokenAddress] }), `launch:${tokenAddress}`, stats);
  let pairDecimals = 18;
  let pairSymbol = "ETH";
  if (launch.pairToken !== zeroAddress) {
    const pairEconomics = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "pairTokenEconomics", args: [launch.pairToken] }), `pair-economics:${launch.pairToken}`, stats);
    if (pairEconomics[0] === 0n || pairEconomics[1] === 0n) throw new Error(`Pair economics are unavailable for ${launch.pairToken}.`);
    pairDecimals = await retry(() => client.readContract({ address: launch.pairToken, abi: tokenAbi, functionName: "decimals" }).then(Number), `pair-decimals:${launch.pairToken}`, stats);
    pairSymbol = await retry(() => client.readContract({ address: launch.pairToken, abi: tokenAbi, functionName: "symbol" }), `pair-symbol:${launch.pairToken}`, stats);
    if (pairDecimals !== Number(pairEconomics[2])) throw new Error(`Pair decimals do not match factory economics for ${launch.pairToken}.`);
  }
  const supabase = getServiceSupabase();
  const { data: creator } = await supabase.from("profiles").select("id").ilike("wallet_address", launch.deployer).maybeSingle();
  const { error } = await supabase.from("pons_launches").update({
    creator_profile_id: creator?.id ?? null,
    deployer_address: launch.deployer.toLowerCase(),
    pair_token: launch.pairToken.toLowerCase(),
    pair_token_decimals: pairDecimals,
    pair_token_symbol: pairSymbol,
    token_name: name,
    token_symbol: symbol,
    token_decimals: Number(decimals),
    token_logo_url: info[1] || null,
    token_description: info[2] || "",
    total_supply: totalSupply.toString(),
    indexed_at: new Date().toISOString(),
    last_synced_block: Number(lastSyncedBlock),
  }).eq("token_address", tokenAddress.toLowerCase()).eq("curve_address", curveAddress.toLowerCase());
  if (error) throw new Error(`Launch enrichment failed: ${error.message}`);
  // PostgreSQL function arguments are nullable, but generated Supabase types cannot express that metadata.
  const { error: phaseError } = await supabase.rpc("advance_launch_phase", { p_token_address: tokenAddress.toLowerCase(), p_phase: Number(launch.phase), p_lifecycle_block: null as unknown as number, p_last_synced_block: Number(lastSyncedBlock) });
  if (phaseError) throw new Error(`Launch phase enrichment failed: ${phaseError.message}`);
}

async function trackedLaunchTokens(tokens: string[]) {
  const normalized = [...new Set(tokens.map((token) => token.toLowerCase()))];
  if (!normalized.length) return new Set<string>();
  const { data, error } = await getServiceSupabase().from("pons_launches").select("token_address").in("token_address", normalized);
  if (error) throw new Error(`Tracked launch lookup failed: ${error.message}`);
  return new Set((data || []).map((row) => row.token_address));
}

function launchIsEnriched(row: LaunchEnrichmentRow | undefined, curveAddress: string) {
  return Boolean(row
    && row.curve_address === curveAddress.toLowerCase()
    && row.pair_token_decimals !== null
    && row.pair_token_symbol !== null
    && row.token_name !== null
    && row.token_symbol !== null
    && row.token_decimals !== null
    && row.total_supply !== null);
}

async function syncRange(fromBlock: bigint, toBlock: bigint, persistState = true, stats: RetryStats = { providerRetries: 0 }) {
  const client = getRobinhoodIndexerClient();
  const { factoryAddress } = getChainEnv();
  const indexerName = `pons-v2:${factoryAddress.toLowerCase()}`;
  const launchLogs = await getLogsWithSplit(fromBlock, toBlock, "launches", (from, to) => client.getLogs({ address: factoryAddress, event: tokenLaunchedEvent, fromBlock: from, toBlock: to }), stats);
  const sweptLogs = await getLogsWithSplit(fromBlock, toBlock, "swept", (from, to) => client.getLogs({ address: factoryAddress, event: launchSweptEvent, fromBlock: from, toBlock: to }), stats);
  const graduatedLogs = await getLogsWithSplit(fromBlock, toBlock, "graduated", (from, to) => client.getLogs({ address: factoryAddress, event: poolGraduatedEvent, fromBlock: from, toBlock: to }), stats);
  const allBlocks = [...launchLogs, ...sweptLogs, ...graduatedLogs].flatMap((entry) => entry.blockNumber === null ? [] : [entry.blockNumber]);
  const times = await blockTimes(allBlocks, stats);
  const supabase = getServiceSupabase();
  const launchTokens = [...new Set(launchLogs.flatMap((entry) => entry.args.token ? [entry.args.token.toLowerCase()] : []))];
  const existingLaunches = launchTokens.length
    ? await supabase.from("pons_launches").select("token_address, curve_address, pair_token_decimals, pair_token_symbol, token_name, token_symbol, token_decimals, total_supply").in("token_address", launchTokens)
    : { data: [], error: null };
  if (existingLaunches.error) throw new Error(`Launch enrichment lookup failed: ${existingLaunches.error.message}`);
  const enrichedLaunches = new Map((existingLaunches.data as LaunchEnrichmentRow[]).map((row) => [row.token_address, row]));
  const enrichedLaunchTokens = new Set([...enrichedLaunches].flatMap(([tokenAddress, row]) => launchIsEnriched(row, row.curve_address) ? [tokenAddress] : []));
  for (const entry of launchLogs) {
    const { token, curve, deployer, pairToken, launchConfigId, graduationThreshold } = entry.args;
    if (!token || !curve || !deployer || pairToken === undefined || launchConfigId === undefined || graduationThreshold === undefined || entry.blockNumber === null || !entry.transactionHash) continue;
    const { data: creator } = await supabase.from("profiles").select("id").ilike("wallet_address", deployer).maybeSingle();
    const { error } = await supabase.from("pons_launches").upsert({
      token_address: token.toLowerCase(), curve_address: curve.toLowerCase(), deployer_address: deployer.toLowerCase(), creator_profile_id: creator?.id ?? null,
      pair_token: pairToken.toLowerCase(), launch_config_id: launchConfigId.toString(), graduation_threshold: graduationThreshold.toString(),
      launch_tx_hash: entry.transactionHash.toLowerCase(), launch_block: Number(entry.blockNumber), launch_timestamp: times.get(entry.blockNumber.toString())!, phase: 0,
      last_synced_block: Number(toBlock), indexed_at: new Date().toISOString(),
    }, { onConflict: "token_address", ignoreDuplicates: true });
    if (error) throw new Error(`Launch upsert failed: ${error.message}`);
    const storedLaunch = enrichedLaunches.get(token.toLowerCase());
    if (!enrichedLaunchTokens.has(token.toLowerCase()) || (storedLaunch && storedLaunch.curve_address !== curve.toLowerCase())) {
      await enrichLaunch(token, curve, toBlock, stats);
      enrichedLaunchTokens.add(token.toLowerCase());
    }
  }
  const lifecycleTokens = await trackedLaunchTokens([...sweptLogs, ...graduatedLogs].flatMap((entry) => entry.args.token ? [entry.args.token] : []));
  for (const entry of sweptLogs) {
    if (!entry.args.token || entry.blockNumber === null) continue;
    if (!lifecycleTokens.has(entry.args.token.toLowerCase())) {
      logEvent("warn", "indexer.untracked_historical_lifecycle", { lifecycleEvent: "LaunchSwept", tokenAddress: entry.args.token.toLowerCase(), blockNumber: entry.blockNumber.toString() });
      continue;
    }
    const { error } = await supabase.rpc("advance_launch_phase", { p_token_address: entry.args.token.toLowerCase(), p_phase: 1, p_lifecycle_block: Number(entry.blockNumber), p_last_synced_block: Number(toBlock) });
    if (error) throw new Error(`Swept phase update failed: ${error.message}`);
  }
  for (const entry of graduatedLogs) {
    if (!entry.args.token || entry.blockNumber === null) continue;
    if (!lifecycleTokens.has(entry.args.token.toLowerCase())) {
      logEvent("warn", "indexer.untracked_historical_lifecycle", { lifecycleEvent: "PoolGraduated", tokenAddress: entry.args.token.toLowerCase(), blockNumber: entry.blockNumber.toString() });
      continue;
    }
    const { error } = await supabase.rpc("advance_launch_phase", { p_token_address: entry.args.token.toLowerCase(), p_phase: 2, p_lifecycle_block: Number(entry.blockNumber), p_last_synced_block: Number(toBlock) });
    if (error) throw new Error(`Graduated phase update failed: ${error.message}`);
  }

  const { data: launches, error: launchError } = await supabase.from("pons_launches").select("token_address, curve_address, phase").lte("launch_block", Number(toBlock)).or(`phase.lt.2,swept_block.gte.${Number(fromBlock)},graduated_block.gte.${Number(fromBlock)}`);
  if (launchError) throw new Error(`Curve list failed: ${launchError.message}`);
  const curveRows = launches as Array<{ token_address: string; curve_address: string; phase: number }>;
  const curveToToken = new Map(curveRows.map((row) => [row.curve_address.toLowerCase(), row.token_address.toLowerCase()]));
  const addresses = curveRows.map((row) => row.curve_address as `0x${string}`);
  for (let offset = 0; offset < addresses.length; offset += CURVE_ADDRESS_BATCH_SIZE) {
    const batch = addresses.slice(offset, offset + CURVE_ADDRESS_BATCH_SIZE);
    if (!batch.length) continue;
    const buys = await getLogsWithSplit(fromBlock, toBlock, `buys:${offset}`, (from, to) => client.getLogs({ address: batch, event: curveBuyEvent, fromBlock: from, toBlock: to }), stats);
    const sells = await getLogsWithSplit(fromBlock, toBlock, `sells:${offset}`, (from, to) => client.getLogs({ address: batch, event: curveSellEvent, fromBlock: from, toBlock: to }), stats);
    const refunds = await getLogsWithSplit(fromBlock, toBlock, `refunds:${offset}`, (from, to) => client.getLogs({ address: batch, event: curveBuyRefundedEvent, fromBlock: from, toBlock: to }), stats);
    const completions = await getLogsWithSplit(fromBlock, toBlock, `completed:${offset}`, (from, to) => client.getLogs({ address: batch, event: curveCompletedEvent, fromBlock: from, toBlock: to }), stats);
    const tradeTimes = await blockTimes([...buys, ...sells, ...refunds, ...completions].flatMap((entry) => entry.blockNumber === null ? [] : [entry.blockNumber]), stats);
    const rows = [...buys.map((entry) => ({ entry, side: "buy" as const })), ...sells.map((entry) => ({ entry, side: "sell" as const }))].flatMap(({ entry, side }) => {
      const trader = side === "buy" ? entry.args.buyer : entry.args.seller;
      const { recipient, fee, tax } = entry.args;
      const quote = side === "buy" ? entry.args.quoteIn : entry.args.quoteOut;
      const tokens = side === "buy" ? entry.args.tokensOut : entry.args.tokensIn;
      const tokenAddress = curveToToken.get(entry.address.toLowerCase());
      if (!tokenAddress || !trader || !recipient || quote === undefined || tokens === undefined || fee === undefined || tax === undefined || entry.blockNumber === null || entry.logIndex === null || !entry.transactionHash) return [];
      return [{ tx_hash: entry.transactionHash.toLowerCase(), log_index: entry.logIndex, token_address: tokenAddress, curve_address: entry.address.toLowerCase(), trader_address: trader.toLowerCase(), recipient_address: recipient.toLowerCase(), side, quote_amount: quote.toString(), token_amount: tokens.toString(), fee_amount: fee.toString(), creator_tax_amount: tax.toString(), block_number: Number(entry.blockNumber), block_timestamp: tradeTimes.get(entry.blockNumber.toString())! }];
    });
    if (rows.length) {
      const { error } = await supabase.from("pons_trades").upsert(rows, { onConflict: "tx_hash,log_index" });
      if (error) throw new Error(`Trade upsert failed: ${error.message}`);
    }
    const curveEvents = [
      ...refunds.flatMap((entry) => {
        const tokenAddress = curveToToken.get(entry.address.toLowerCase());
        if (!tokenAddress || !entry.args.buyer || entry.args.refund === undefined || entry.blockNumber === null || entry.logIndex === null || !entry.transactionHash) return [];
        return [{ tx_hash: entry.transactionHash.toLowerCase(), log_index: entry.logIndex, token_address: tokenAddress, curve_address: entry.address.toLowerCase(), event_type: "buy_refunded", account_address: entry.args.buyer.toLowerCase(), quote_amount: entry.args.refund.toString(), token_amount: "0", block_number: Number(entry.blockNumber), block_timestamp: tradeTimes.get(entry.blockNumber.toString())! }];
      }),
      ...completions.flatMap((entry) => {
        const tokenAddress = curveToToken.get(entry.address.toLowerCase());
        if (!tokenAddress || !entry.args.recipient || entry.args.quoteOut === undefined || entry.args.tokenOut === undefined || entry.blockNumber === null || entry.logIndex === null || !entry.transactionHash) return [];
        return [{ tx_hash: entry.transactionHash.toLowerCase(), log_index: entry.logIndex, token_address: tokenAddress, curve_address: entry.address.toLowerCase(), event_type: "completed", account_address: entry.args.recipient.toLowerCase(), quote_amount: entry.args.quoteOut.toString(), token_amount: entry.args.tokenOut.toString(), block_number: Number(entry.blockNumber), block_timestamp: tradeTimes.get(entry.blockNumber.toString())! }];
      }),
    ];
    if (curveEvents.length) {
      const { error } = await supabase.from("pons_curve_events").upsert(curveEvents, { onConflict: "tx_hash,log_index" });
      if (error) throw new Error(`Curve lifecycle event upsert failed: ${error.message}`);
    }
  }
  for (const row of curveRows) {
    const launch = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchedToken", args: [row.token_address as `0x${string}`] }), `phase:${row.token_address}`, stats);
    const phase = Number(launch.phase);
    if (phase === row.phase) continue;
    const { error } = await supabase.rpc("advance_launch_phase", { p_token_address: row.token_address, p_phase: phase, p_lifecycle_block: null as unknown as number, p_last_synced_block: Number(toBlock) });
    if (error) throw new Error(`Phase refresh failed: ${error.message}`);
  }
  const { error: creatorError } = await supabase.rpc("backfill_launch_creators");
  if (creatorError) throw new Error(`Launch creator backfill failed: ${creatorError.message}`);
  if (persistState) {
    const { error: stateError } = await supabase.rpc("advance_indexer_state", { p_indexer_name: indexerName, p_last_processed_block: Number(toBlock) });
    if (stateError) throw new Error(`Indexer state update failed: ${stateError.message}`);
  }
  return { launches: launchLogs.length, swept: sweptLogs.length, graduated: graduatedLogs.length };
}

export async function syncPonsIndexer() {
  const { deploymentBlock, blockChunkSize, maxChunksPerRun, confirmations, chunkDelayMs, factoryAddress } = getChainEnv();
  const indexerName = `pons-v2:${factoryAddress.toLowerCase()}`;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("indexer_state").select("last_processed_block").eq("indexer_name", indexerName).maybeSingle();
  if (error) throw new Error(`Indexer state query failed: ${error.message}`);
  const stats: RetryStats = { providerRetries: 0 };
  const chainHead = await retry(() => getRobinhoodIndexerClient().getBlockNumber(), "chain-head", stats);
  const head = stableIndexerHead(chainHead, confirmations);
  let cursor = data ? BigInt(data.last_processed_block) + 1n : deploymentBlock;
  let chunks = 0;
  let launchEvents = 0;
  while (cursor <= head && chunks < maxChunksPerRun) {
    const end = chunkEnd(cursor, head, blockChunkSize);
    const result = await syncRange(cursor, end, true, stats);
    launchEvents += result.launches;
    chunks += 1;
    cursor = end + 1n;
    if (chunkDelayMs > 0 && cursor <= head && chunks < maxChunksPerRun) await wait(chunkDelayMs);
  }
  const { count: launches } = await supabase.from("pons_launches").select("*", { count: "exact", head: true });
  const { count: trades } = await supabase.from("pons_trades").select("*", { count: "exact", head: true });
  const { count: curveEvents } = await supabase.from("pons_curve_events").select("*", { count: "exact", head: true });
  const result = { chainHead: chainHead.toString(), targetBlock: head.toString(), confirmations, chunkDelayMs, lastProcessedBlock: (cursor - 1n).toString(), caughtUp: cursor > head, chunks, launchEvents, indexedLaunches: launches || 0, indexedTrades: trades || 0, indexedCurveEvents: curveEvents || 0, providerRetries: stats.providerRetries };
  logEvent("info", "indexer.sync_complete", result);
  return result;
}

export async function indexTransactionBlock(blockNumber: bigint) {
  return syncRange(blockNumber, blockNumber, false);
}
