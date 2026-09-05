import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const MINIMUM_MARKET_CAP_USD_E18 = 300_000n * 10n ** 18n;
const SEVEN_DAYS_SECONDS = 7n * 24n * 60n * 60n;

type RetryStats = { providerRetries: number };
type VerifiedMarket = {
  tokenAddress: string;
  curveAddress: string;
  launchBlock: number;
  graduatedBlock: number | null;
};

type TradeInsert = {
  tx_hash: string;
  log_index: number;
  token_address: string;
  curve_address: string;
  trader_address: string;
  recipient_address: string;
  side: string;
  quote_amount: string;
  token_amount: string;
  fee_amount: string;
  creator_tax_amount: string;
  block_number: number;
  block_timestamp: string;
};

type CurveEventInsert = {
  tx_hash: string;
  log_index: number;
  token_address: string;
  curve_address: string;
  event_type: string;
  account_address: string | null;
  quote_amount: string;
  token_amount: string;
  block_number: number;
  block_timestamp: string;
};

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[redacted RPC URL]");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const [viem, contracts, chain, env, indexerUtils, source, supabaseModule] = await Promise.all([
    import("viem"),
    import("../lib/pons/contracts"),
    import("../lib/pons/chain"),
    import("../lib/server/env"),
    import("../lib/pons/indexer-utils"),
    import("../lib/server/pons-source"),
    import("../lib/server/supabase"),
  ]);
  const { factoryAbi, curveAbi, tokenAbi } = contracts;
  const { getRobinhoodIndexerClient } = chain;
  const { getChainEnv } = env;
  const { INDEXER_RETRY_BACKOFF_MS, indexerRetryDelayMs, isTransientIndexerError, chunkEnd, stableIndexerHead } = indexerUtils;
  const { getOfficialPonsV2GraduatedMarkets, getOfficialPonsV2ActiveMarketCandidates } = source;
  const { getServiceSupabase } = supabaseModule;
  const { factoryAddress, deploymentBlock, blockChunkSize, confirmations, chunkDelayMs } = getChainEnv();
  if (blockChunkSize !== 2_000) throw new Error(`The bootstrap requires the verified 2,000-block chunk size; received ${blockChunkSize}.`);
  const client = getRobinhoodIndexerClient();
  const supabase = getServiceSupabase();
  const stats: RetryStats = { providerRetries: 0 };

  async function retry<T>(work: () => Promise<T>, label: string): Promise<T> {
    let last: unknown;
    for (let attempt = 1; attempt <= INDEXER_RETRY_BACKOFF_MS.length + 1; attempt += 1) {
      try {
        return await work();
      } catch (error) {
        last = error;
        if (!isTransientIndexerError(error) || attempt > INDEXER_RETRY_BACKOFF_MS.length) break;
        const delayMs = indexerRetryDelayMs(attempt - 1);
        stats.providerRetries += 1;
        process.stderr.write(`${JSON.stringify({ event: "pons.bootstrap_retry", label, attempt, delayMs, message: safeErrorMessage(error) })}\n`);
        await wait(delayMs);
      }
    }
    throw new Error(`${label}: ${safeErrorMessage(last)}`, { cause: last });
  }

  function isSplittableLogError(error: unknown) {
    let current: unknown = error;
    for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
      const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
      if (candidate.code === -32603) return true;
      if (typeof candidate.message === "string" && /block range|response size|too many|timeout|internal error/i.test(candidate.message)) return true;
      current = candidate.cause;
    }
    return false;
  }

  async function getLogsWithSplit<T>(fromBlock: bigint, toBlock: bigint, label: string, read: (from: bigint, to: bigint) => Promise<T[]>, splitDepth = 0): Promise<T[]> {
    try {
      return await retry(() => read(fromBlock, toBlock), `${label}:${fromBlock}-${toBlock}`);
    } catch (error) {
      if (fromBlock >= toBlock || splitDepth >= 1 || !isSplittableLogError(error)) throw error;
      const midpoint = fromBlock + (toBlock - fromBlock) / 2n;
      process.stderr.write(`${JSON.stringify({ event: "pons.bootstrap_split_log_range", label, fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), midpoint: midpoint.toString() })}\n`);
      const left = await getLogsWithSplit(fromBlock, midpoint, label, read, splitDepth + 1);
      const right = await getLogsWithSplit(midpoint + 1n, toBlock, label, read, splitDepth + 1);
      return [...left, ...right];
    }
  }

  const chainId = await retry(() => client.getChainId(), "chain-id");
  if (chainId !== 4_663) throw new Error(`Indexer RPC returned unexpected chain ID ${chainId}.`);
  const chainHead = await retry(() => client.getBlockNumber(), "chain-head");
  const confirmedHead = stableIndexerHead(chainHead, confirmations);
  const confirmedHeadBlock = await retry(() => client.getBlock({ blockNumber: confirmedHead }), `block:${confirmedHead}`);
  const cutoffTimestamp = confirmedHeadBlock.timestamp > SEVEN_DAYS_SECONDS ? confirmedHeadBlock.timestamp - SEVEN_DAYS_SECONDS : 0n;

  async function findFirstBlockAtOrAfterTimestamp(timestamp: bigint) {
    let low = deploymentBlock;
    let high = confirmedHead;
    while (low < high) {
      const midpoint = low + (high - low) / 2n;
      const block = await retry(() => client.getBlock({ blockNumber: midpoint }), `boundary-block:${midpoint}`);
      if (block.timestamp < timestamp) low = midpoint + 1n;
      else high = midpoint;
    }
    const boundary = await retry(() => client.getBlock({ blockNumber: low }), `boundary-block:${low}`);
    if (boundary.timestamp < timestamp) throw new Error("Unable to resolve the seven-day boundary from real block timestamps.");
    return low;
  }

  const sevenDayStartBlock = await findFirstBlockAtOrAfterTimestamp(cutoffTimestamp);
  const graduatedMarkets = await getOfficialPonsV2GraduatedMarkets();
  const activeResult = await getOfficialPonsV2ActiveMarketCandidates(MINIMUM_MARKET_CAP_USD_E18);
  const officialFactory = factoryAddress.toLowerCase();
  const factoryGraduated = graduatedMarkets.filter((market) => market.factoryAddress === officialFactory);
  const candidateMap = new Map([...factoryGraduated, ...activeResult.markets]
    .filter((market) => market.factoryAddress === officialFactory && BigInt(market.marketCapUsdE18) >= MINIMUM_MARKET_CAP_USD_E18)
    .map((market) => [market.tokenAddress, market]));
  const candidates = [...candidateMap.values()].sort((left, right) => left.launchBlock - right.launchBlock || left.tokenAddress.localeCompare(right.tokenAddress));
  if (!candidates.length) throw new Error("The official Pons source returned no V2 markets meeting the production discovery threshold.");

  const poolGraduatedEvent = viem.getAbiItem({ abi: factoryAbi, name: "PoolGraduated" });
  const curveEvents = [
    viem.getAbiItem({ abi: curveAbi, name: "CurveBuy" }),
    viem.getAbiItem({ abi: curveAbi, name: "CurveSell" }),
    viem.getAbiItem({ abi: curveAbi, name: "CurveBuyRefunded" }),
    viem.getAbiItem({ abi: curveAbi, name: "CurveCompleted" }),
  ] as const;
  const verified: VerifiedMarket[] = [];
  const verificationFailures: Array<{ tokenAddress: string; reason: string }> = [];
  const existingCandidates = await supabase.from("pons_launches")
    .select("token_address, curve_address, deployer_address, pair_token, launch_tx_hash, launch_block, launch_timestamp, graduated_block")
    .in("token_address", candidates.map((market) => market.tokenAddress));
  if (existingCandidates.error) throw new Error(`Existing verified-market lookup failed: ${existingCandidates.error.message}`);
  const existingByToken = new Map((existingCandidates.data ?? []).map((row) => [row.token_address, row]));
  const resumableVerified = candidates.flatMap((market) => {
    const row = existingByToken.get(market.tokenAddress);
    if (!row
      || row.deployer_address !== market.deployerAddress
      || row.pair_token !== market.pairToken
      || row.launch_tx_hash !== market.transactionHash
      || Number(row.launch_block) !== market.launchBlock
      || (row.graduated_block === null ? null : Number(row.graduated_block)) !== market.graduatedBlock
      || Math.abs(Date.parse(row.launch_timestamp) - Date.parse(market.launchTimestamp)) > 5_000) return [];
    return [{ tokenAddress: row.token_address, curveAddress: row.curve_address, launchBlock: Number(row.launch_block), graduatedBlock: row.graduated_block === null ? null : Number(row.graduated_block) } satisfies VerifiedMarket];
  });
  const ponsideResult = await supabase.from("pons_launches").select("token_address, curve_address, launch_block, graduated_block").eq("is_ponside_launch", true);
  if (ponsideResult.error) throw new Error(`Ponside launch lookup failed: ${ponsideResult.error.message}`);
  const resumableByToken = new Map(resumableVerified.map((market) => [market.tokenAddress, market]));
  const bootstrapProof = await supabase.from("indexer_state").select("indexer_name, last_processed_block").like("indexer_name", "pons-v2-bootstrap-7d:%").limit(1);
  if (bootstrapProof.error) throw new Error(`Bootstrap resume proof query failed: ${bootstrapProof.error.message}`);
  const hasBootstrapProof = (bootstrapProof.data?.length ?? 0) > 0;

  for (const [candidateIndex, market] of candidates.entries()) {
    const resumableMarket = resumableByToken.get(market.tokenAddress);
    if (hasBootstrapProof && resumableMarket) {
      verified.push(resumableMarket);
      if ((candidateIndex + 1) % 10 === 0 || candidateIndex + 1 === candidates.length) process.stderr.write(`${JSON.stringify({ event: "pons.bootstrap_verification_progress", processed: candidateIndex + 1, total: candidates.length, verified: verified.length, failures: verificationFailures.length, reused: true })}\n`);
      continue;
    }
    try {
      const receipt = await retry(() => client.getTransactionReceipt({ hash: market.transactionHash }), `receipt:${market.tokenAddress}`);
      if (receipt.status !== "success" || receipt.blockNumber !== BigInt(market.launchBlock)) throw new Error("Official launch transaction does not match its successful on-chain receipt.");
      const launchEvent = viem.parseEventLogs({ abi: factoryAbi, logs: receipt.logs, strict: true }).find((entry) => entry.eventName === "TokenLaunched" && entry.address.toLowerCase() === officialFactory && entry.args.token.toLowerCase() === market.tokenAddress);
      if (!launchEvent || launchEvent.eventName !== "TokenLaunched") throw new Error("Verified factory TokenLaunched event was not found.");
      if (launchEvent.args.deployer.toLowerCase() !== market.deployerAddress || launchEvent.args.pairToken.toLowerCase() !== market.pairToken) throw new Error("Official source identity does not match the factory event.");

      const launch = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchedToken", args: [market.tokenAddress] }), `launch:${market.tokenAddress}`);
      if (!launch.exists || launch.token.toLowerCase() !== market.tokenAddress || launch.deployer.toLowerCase() !== market.deployerAddress || launch.pairToken.toLowerCase() !== market.pairToken || launch.curve.toLowerCase() !== launchEvent.args.curve.toLowerCase()) throw new Error("Factory launch state does not match the source and event provenance.");
      if (launch.graduationThreshold !== launchEvent.args.graduationThreshold) throw new Error("Launch graduation economics do not match the emitted event.");

      let expectedPairDecimals = 18;
      if (market.pairToken === viem.zeroAddress) {
        const launchConfig = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "getLaunchConfig", args: [launchEvent.args.launchConfigId] }), `launch-config:${launchEvent.args.launchConfigId}`);
        if (launchConfig.phantomQuote === 0n || launchConfig.graduationThreshold === 0n || launchConfig.graduationThreshold !== launch.graduationThreshold) throw new Error("Native ETH launch-config economics do not match the verified launch.");
      } else {
        const approvedPair = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "approvedPairTokens", args: [market.pairToken] }), `pair-approved:${market.pairToken}`);
        const pairEconomics = await retry(() => client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "pairTokenEconomics", args: [market.pairToken] }), `pair-economics:${market.pairToken}`);
        if (!approvedPair) throw new Error("The source market uses a pair token that is no longer approved by Pons V2.");
        if (pairEconomics[0] === 0n || pairEconomics[1] === 0n) throw new Error("Pons V2 pair economics are unavailable.");
        expectedPairDecimals = Number(pairEconomics[2]);
      }

      const name = await retry(() => client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "name" }), `name:${market.tokenAddress}`);
      const symbol = await retry(() => client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "symbol" }), `symbol:${market.tokenAddress}`);
      const decimals = await retry(() => client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "decimals" }), `decimals:${market.tokenAddress}`);
      const totalSupply = await retry(() => client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "totalSupply" }), `supply:${market.tokenAddress}`);
      const tokenInfo = await retry(() => client.readContract({ address: market.tokenAddress, abi: tokenAbi, functionName: "getTokenInfo" }), `metadata:${market.tokenAddress}`);
      let pairDecimals = 18;
      let pairSymbol = "ETH";
      if (market.pairToken !== viem.zeroAddress) {
        pairDecimals = Number(await retry(() => client.readContract({ address: market.pairToken, abi: tokenAbi, functionName: "decimals" }), `pair-decimals:${market.pairToken}`));
        pairSymbol = await retry(() => client.readContract({ address: market.pairToken, abi: tokenAbi, functionName: "symbol" }), `pair-symbol:${market.pairToken}`);
      }
      if (pairDecimals !== expectedPairDecimals) throw new Error("Pair decimals do not match the Pons V2 economics record.");

      const launchBlock = await retry(() => client.getBlock({ blockNumber: receipt.blockNumber }), `launch-block:${market.tokenAddress}`);
      const launchTimestamp = new Date(Number(launchBlock.timestamp) * 1_000).toISOString();
      if (Math.abs(Date.parse(launchTimestamp) - Date.parse(market.launchTimestamp)) > 5_000) throw new Error("Official launch timestamp does not match the on-chain block.");
      let graduatedBlock: number | null = null;
      if (Number(launch.phase) >= 2) {
        const sourceGraduatedBlock = market.graduatedBlock;
        if (sourceGraduatedBlock === null) throw new Error("Graduated factory state has no official graduation block provenance.");
        const graduationLogs = await retry(() => client.getLogs({ address: factoryAddress, event: poolGraduatedEvent, args: { token: market.tokenAddress }, fromBlock: BigInt(sourceGraduatedBlock), toBlock: BigInt(sourceGraduatedBlock) }), `graduation:${market.tokenAddress}`);
        if (!graduationLogs.length) throw new Error("Official graduation block has no matching PoolGraduated event.");
        graduatedBlock = sourceGraduatedBlock;
      } else if (market.graduatedBlock !== null) {
        throw new Error("Official graduation provenance conflicts with live factory phase.");
      }

      const existing = await supabase.from("pons_launches").select("is_ponside_launch").eq("token_address", market.tokenAddress).maybeSingle();
      if (existing.error) throw new Error(`Existing launch lookup failed: ${existing.error.message}`);
      const creator = await supabase.from("profiles").select("id").ilike("wallet_address", launch.deployer).maybeSingle();
      if (creator.error) throw new Error(`Creator lookup failed: ${creator.error.message}`);
      const upsert = await supabase.from("pons_launches").upsert({
        token_address: market.tokenAddress,
        curve_address: launch.curve.toLowerCase(),
        deployer_address: launch.deployer.toLowerCase(),
        creator_profile_id: creator.data?.id ?? null,
        is_ponside_launch: existing.data?.is_ponside_launch ?? false,
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
        launch_timestamp: launchTimestamp,
        phase: Number(launch.phase),
        graduated_block: graduatedBlock,
        last_synced_block: Number(confirmedHead),
        indexed_at: new Date().toISOString(),
      }, { onConflict: "token_address" });
      if (upsert.error) throw new Error(`Verified launch upsert failed: ${upsert.error.message}`);
      verified.push({ tokenAddress: market.tokenAddress, curveAddress: launch.curve.toLowerCase(), launchBlock: market.launchBlock, graduatedBlock });
    } catch (error) {
      const reason = safeErrorMessage(error);
      verificationFailures.push({ tokenAddress: market.tokenAddress, reason });
      process.stderr.write(`${JSON.stringify({ event: "pons.bootstrap_verification_failed", tokenAddress: market.tokenAddress, reason })}\n`);
    }
    if ((candidateIndex + 1) % 10 === 0 || candidateIndex + 1 === candidates.length) process.stderr.write(`${JSON.stringify({ event: "pons.bootstrap_verification_progress", processed: candidateIndex + 1, total: candidates.length, verified: verified.length, failures: verificationFailures.length })}\n`);
  }
  if (verificationFailures.length) throw new Error(`Market verification failed for ${verificationFailures.length}/${candidates.length} candidates. Main indexer checkpoint was not advanced. First failure: ${verificationFailures[0].tokenAddress} ${verificationFailures[0].reason}`);

  const storedMarkets = await supabase.from("pons_launches").select("token_address, curve_address, launch_block, graduated_block");
  if (storedMarkets.error) throw new Error(`Stored verified-market lookup failed: ${storedMarkets.error.message}`);
  const activityMap = new Map<string, VerifiedMarket>((storedMarkets.data ?? []).map((row) => [row.token_address, { tokenAddress: row.token_address, curveAddress: row.curve_address, launchBlock: Number(row.launch_block), graduatedBlock: row.graduated_block === null ? null : Number(row.graduated_block) }]));
  for (const market of verified) activityMap.set(market.tokenAddress, market);
  const activityMarkets = [...activityMap.values()];
  const bootstrapStateName = "pons-v2-bootstrap-7d:global";
  const bootstrapState = await supabase.from("indexer_state").select("last_processed_block").eq("indexer_name", bootstrapStateName).maybeSingle();
  if (bootstrapState.error) throw new Error(`Bootstrap checkpoint query failed: ${bootstrapState.error.message}`);
  let cursor = bootstrapState.data ? BigInt(bootstrapState.data.last_processed_block) + 1n : sevenDayStartBlock;
  if (cursor < sevenDayStartBlock) cursor = sevenDayStartBlock;
  let activityChunks = 0;
  let skippedEmptyRanges = 0;
  let activityLogs = 0;
  const blockTimeCache = new Map<string, string>();

  async function persistActivityChunk(activeMarkets: VerifiedMarket[], fromBlock: bigint, toBlock: bigint) {
    if (activeMarkets.length) {
      const curveToToken = new Map(activeMarkets.map((market) => [market.curveAddress.toLowerCase(), market.tokenAddress.toLowerCase()]));
      const logs = await getLogsWithSplit(fromBlock, toBlock, "activity", (rangeStart, rangeEnd) => client.getLogs({ address: activeMarkets.map((market) => market.curveAddress as `0x${string}`), events: curveEvents, fromBlock: rangeStart, toBlock: rangeEnd }));
      const uniqueBlocks = [...new Set(logs.flatMap((entry) => entry.blockNumber === null ? [] : [entry.blockNumber.toString()]))];
      for (const blockText of uniqueBlocks) {
        if (blockTimeCache.has(blockText)) continue;
        const block = await retry(() => client.getBlock({ blockNumber: BigInt(blockText) }), `activity-block:${blockText}`);
        blockTimeCache.set(blockText, new Date(Number(block.timestamp) * 1_000).toISOString());
      }
      const tradeRows: TradeInsert[] = [];
      const curveRows: CurveEventInsert[] = [];
      for (const entry of logs) {
        if (entry.blockNumber === null || entry.logIndex === null || !entry.transactionHash) continue;
        const tokenAddress = curveToToken.get(entry.address.toLowerCase());
        const blockTimestamp = blockTimeCache.get(entry.blockNumber.toString());
        if (!tokenAddress || !blockTimestamp) continue;
        const args = entry.args as Record<string, `0x${string}` | bigint | undefined>;
        if (entry.eventName === "CurveBuy" || entry.eventName === "CurveSell") {
          const side = entry.eventName === "CurveBuy" ? "buy" : "sell";
          const trader = side === "buy" ? args.buyer : args.seller;
          const quote = side === "buy" ? args.quoteIn : args.quoteOut;
          const tokens = side === "buy" ? args.tokensOut : args.tokensIn;
          if (typeof trader !== "string" || typeof args.recipient !== "string" || typeof quote !== "bigint" || typeof tokens !== "bigint" || typeof args.fee !== "bigint" || typeof args.tax !== "bigint") continue;
          tradeRows.push({ tx_hash: entry.transactionHash.toLowerCase(), log_index: entry.logIndex, token_address: tokenAddress, curve_address: entry.address.toLowerCase(), trader_address: trader.toLowerCase(), recipient_address: args.recipient.toLowerCase(), side, quote_amount: quote.toString(), token_amount: tokens.toString(), fee_amount: args.fee.toString(), creator_tax_amount: args.tax.toString(), block_number: Number(entry.blockNumber), block_timestamp: blockTimestamp });
        } else if (entry.eventName === "CurveBuyRefunded" && typeof args.buyer === "string" && typeof args.refund === "bigint") {
          curveRows.push({ tx_hash: entry.transactionHash.toLowerCase(), log_index: entry.logIndex, token_address: tokenAddress, curve_address: entry.address.toLowerCase(), event_type: "buy_refunded", account_address: args.buyer.toLowerCase(), quote_amount: args.refund.toString(), token_amount: "0", block_number: Number(entry.blockNumber), block_timestamp: blockTimestamp });
        } else if (entry.eventName === "CurveCompleted" && typeof args.recipient === "string" && typeof args.quoteOut === "bigint" && typeof args.tokenOut === "bigint") {
          curveRows.push({ tx_hash: entry.transactionHash.toLowerCase(), log_index: entry.logIndex, token_address: tokenAddress, curve_address: entry.address.toLowerCase(), event_type: "completed", account_address: args.recipient.toLowerCase(), quote_amount: args.quoteOut.toString(), token_amount: args.tokenOut.toString(), block_number: Number(entry.blockNumber), block_timestamp: blockTimestamp });
        }
      }
      if (tradeRows.length) {
        const result = await supabase.from("pons_trades").upsert(tradeRows, { onConflict: "tx_hash,log_index" });
        if (result.error) throw new Error(`Recent trade upsert failed: ${result.error.message}`);
      }
      if (curveRows.length) {
        const result = await supabase.from("pons_curve_events").upsert(curveRows, { onConflict: "tx_hash,log_index" });
        if (result.error) throw new Error(`Recent curve-event upsert failed: ${result.error.message}`);
      }
      activityLogs += logs.length;
    }
  }

  const membershipNames = activityMarkets.flatMap((market) => [`pons-v2-bootstrap-7d:member:${market.tokenAddress}`, `pons-v2-bootstrap-7d:catchup:${market.tokenAddress}`]);
  const membershipResult = membershipNames.length
    ? await supabase.from("indexer_state").select("indexer_name, last_processed_block").in("indexer_name", membershipNames)
    : { data: [], error: null };
  if (membershipResult.error) throw new Error(`Bootstrap membership query failed: ${membershipResult.error.message}`);
  const membershipStates = new Map((membershipResult.data ?? []).map((row) => [row.indexer_name, BigInt(row.last_processed_block)]));
  const joinThroughBlock = cursor - 1n;
  if (!bootstrapState.data) {
    const initialMemberships = activityMarkets
      .map((market) => `pons-v2-bootstrap-7d:member:${market.tokenAddress}`)
      .filter((membershipName) => !membershipStates.has(membershipName));
    if (initialMemberships.length) {
      const membershipInsert = await supabase.from("indexer_state").insert(initialMemberships.map((indexerName) => ({ indexer_name: indexerName, last_processed_block: Number(joinThroughBlock) })));
      if (membershipInsert.error) throw new Error(`Initial bootstrap membership insert failed: ${membershipInsert.error.message}`);
      for (const membershipName of initialMemberships) membershipStates.set(membershipName, joinThroughBlock);
    }
  }
  for (const market of activityMarkets) {
    const membershipName = `pons-v2-bootstrap-7d:member:${market.tokenAddress}`;
    const catchupName = `pons-v2-bootstrap-7d:catchup:${market.tokenAddress}`;
    if (membershipStates.has(membershipName)) continue;
    let marketCursor = BigInt(market.launchBlock) > sevenDayStartBlock ? BigInt(market.launchBlock) : sevenDayStartBlock;
    const catchupCheckpoint = membershipStates.get(catchupName);
    if (catchupCheckpoint !== undefined && catchupCheckpoint + 1n > marketCursor) marketCursor = catchupCheckpoint + 1n;
    const graduatedBlock = BigInt(market.graduatedBlock ?? Number(joinThroughBlock));
    const marketTarget = graduatedBlock < joinThroughBlock ? graduatedBlock : joinThroughBlock;
    while (marketCursor <= marketTarget) {
      const marketEnd = chunkEnd(marketCursor, marketTarget, blockChunkSize);
      await persistActivityChunk([market], marketCursor, marketEnd);
      const marketCheckpoint = await supabase.rpc("advance_indexer_state", { p_indexer_name: catchupName, p_last_processed_block: Number(marketEnd) });
      if (marketCheckpoint.error) throw new Error(`Bootstrap market checkpoint failed: ${marketCheckpoint.error.message}`);
      activityChunks += 1;
      marketCursor = marketEnd + 1n;
      if (marketCursor <= marketTarget && chunkDelayMs > 0) await wait(chunkDelayMs);
    }
    const membership = await supabase.rpc("advance_indexer_state", { p_indexer_name: membershipName, p_last_processed_block: Number(joinThroughBlock) });
    if (membership.error) throw new Error(`Bootstrap market membership failed: ${membership.error.message}`);
    membershipStates.set(membershipName, joinThroughBlock);
  }

  while (cursor <= confirmedHead) {
    let end = chunkEnd(cursor, confirmedHead, blockChunkSize);
    const activeMarkets = activityMarkets.filter((market) => BigInt(market.launchBlock) <= end && BigInt(market.graduatedBlock ?? Number(confirmedHead)) >= cursor);
    if (!activeMarkets.length) {
      const nextLaunchBlock = activityMarkets
        .map((market) => BigInt(market.launchBlock))
        .filter((launchBlock) => launchBlock > end && launchBlock <= confirmedHead)
        .reduce<bigint | null>((earliest, launchBlock) => earliest === null || launchBlock < earliest ? launchBlock : earliest, null);
      end = nextLaunchBlock === null ? confirmedHead : nextLaunchBlock - 1n;
      skippedEmptyRanges += 1;
    }
    await persistActivityChunk(activeMarkets, cursor, end);
    const checkpoint = await supabase.rpc("advance_indexer_state", { p_indexer_name: bootstrapStateName, p_last_processed_block: Number(end) });
    if (checkpoint.error) throw new Error(`Bootstrap activity checkpoint failed: ${checkpoint.error.message}`);
    activityChunks += 1;
    cursor = end + 1n;
    if (activityChunks % 100 === 0 || cursor > confirmedHead) process.stderr.write(`${JSON.stringify({ event: "pons.bootstrap_activity_progress", chunks: activityChunks, skippedEmptyRanges, lastProcessedBlock: end.toString(), targetBlock: confirmedHead.toString(), logs: activityLogs })}\n`);
    if (activeMarkets.length && cursor <= confirmedHead && chunkDelayMs > 0) await wait(chunkDelayMs);
  }

  const mainIndexerName = `pons-v2:${officialFactory}`;
  const advance = await supabase.rpc("advance_indexer_state", { p_indexer_name: mainIndexerName, p_last_processed_block: Number(confirmedHead) });
  if (advance.error) throw new Error(`Main indexer checkpoint advance failed: ${advance.error.message}`);
  const launchCount = await supabase.from("pons_launches").select("*", { count: "exact", head: true });
  const tradeCount = await supabase.from("pons_trades").select("*", { count: "exact", head: true });
  const curveEventCount = await supabase.from("pons_curve_events").select("*", { count: "exact", head: true });
  if (launchCount.error || tradeCount.error || curveEventCount.error) throw new Error(`Final count query failed: ${launchCount.error?.message || tradeCount.error?.message || curveEventCount.error?.message}`);
  process.stdout.write(`${JSON.stringify({
    source: "official-pons-launchpad",
    chainId,
    confirmedHead: confirmedHead.toString(),
    sevenDayStartBlock: sevenDayStartBlock.toString(),
    officialV2GraduatedMarkets: factoryGraduated.length,
    officialActiveMarketsWithMarketData: activeResult.total,
    eligibleCandidates: candidates.length,
    verifiedMarkets: verified.length,
    activityChunks,
    skippedEmptyRanges,
    activityLogs,
    providerRetries: stats.providerRetries,
    launchesStored: launchCount.count ?? 0,
    tradesStored: tradeCount.count ?? 0,
    curveEventsStored: curveEventCount.count ?? 0,
    indexerCheckpoint: confirmedHead.toString(),
    readyForForwardSync: true,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
