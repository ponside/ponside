import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ getRobinhoodIndexerClient }, { getChainEnv }, { stableIndexerHead }, { getServiceSupabase }] = await Promise.all([
    import("../lib/pons/chain"),
    import("../lib/server/env"),
    import("../lib/pons/indexer-utils"),
    import("../lib/server/supabase"),
  ]);
  const { factoryAddress, confirmations } = getChainEnv();
  const client = getRobinhoodIndexerClient();
  const supabase = getServiceSupabase();
  const chainId = await client.getChainId();
  if (chainId !== 4_663) throw new Error(`Indexer RPC returned unexpected chain ID ${chainId}.`);

  const indexerName = `pons-v2:${factoryAddress.toLowerCase()}`;
  const forwardStartName = `pons-v2-forward-start:${factoryAddress.toLowerCase()}`;
  const bootstrapStateName = "pons-v2-bootstrap-7d:global";
  const existing = await supabase.from("indexer_state").select("indexer_name, last_processed_block, updated_at").in("indexer_name", [indexerName, forwardStartName, bootstrapStateName]);
  if (existing.error) throw new Error(`Indexer-state lookup failed: ${existing.error.message}`);
  const existingForwardStart = existing.data?.find((row) => row.indexer_name === forwardStartName) ?? null;

  let forwardStartBlock: bigint;
  if (existingForwardStart) {
    forwardStartBlock = BigInt(existingForwardStart.last_processed_block);
  } else {
    const chainHead = await client.getBlockNumber();
    forwardStartBlock = stableIndexerHead(chainHead, confirmations);
    const marker = await supabase.rpc("advance_indexer_state", { p_indexer_name: forwardStartName, p_last_processed_block: Number(forwardStartBlock) });
    if (marker.error) throw new Error(`Forward-start marker failed: ${marker.error.message}`);
  }

  const advance = await supabase.rpc("advance_indexer_state", { p_indexer_name: indexerName, p_last_processed_block: Number(forwardStartBlock) });
  if (advance.error) throw new Error(`Forward indexer initialization failed: ${advance.error.message}`);
  const verified = await supabase.from("indexer_state").select("indexer_name, last_processed_block, updated_at").in("indexer_name", [indexerName, forwardStartName, bootstrapStateName]);
  if (verified.error) throw new Error(`Initialized indexer verification failed: ${verified.error.message}`);
  const mainState = verified.data?.find((row) => row.indexer_name === indexerName);
  const markerState = verified.data?.find((row) => row.indexer_name === forwardStartName);
  const bootstrapState = verified.data?.find((row) => row.indexer_name === bootstrapStateName);
  if (!mainState || !markerState || BigInt(mainState.last_processed_block) < forwardStartBlock || BigInt(markerState.last_processed_block) !== forwardStartBlock) throw new Error("Forward indexer state verification failed.");

  process.stdout.write(`${JSON.stringify({
    chainId,
    forwardStartBlock: forwardStartBlock.toString(),
    forwardStartedAt: markerState.updated_at,
    currentForwardCheckpoint: mainState.last_processed_block,
    historicalBootstrapCheckpoint: bootstrapState?.last_processed_block ?? null,
    historicalBootstrapPreserved: bootstrapState !== undefined,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
