import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[redacted RPC URL]");
}

async function main() {
  const [{ getRobinhoodIndexerClient }, { getChainEnv }, { getServiceSupabase }] = await Promise.all([
    import("../lib/pons/chain"),
    import("../lib/server/env"),
    import("../lib/server/supabase"),
  ]);
  const { factoryAddress, deploymentBlock, blockChunkSize } = getChainEnv();
  if (blockChunkSize !== 2_000) throw new Error(`Expected an exact 2,000-block health range, received ${blockChunkSize}.`);

  const supabase = getServiceSupabase();
  const indexerName = `pons-v2:${factoryAddress.toLowerCase()}`;
  const { data, error } = await supabase.from("indexer_state").select("last_processed_block").eq("indexer_name", indexerName).maybeSingle();
  if (error) throw new Error(`Indexer state health query failed: ${error.message}`);

  const fromBlock = data ? BigInt(data.last_processed_block) + 1n : deploymentBlock;
  const toBlock = fromBlock + 1_999n;
  const client = getRobinhoodIndexerClient();
  const chainId = await client.getChainId();
  if (chainId !== 4_663) throw new Error(`Indexer RPC returned unexpected chain ID ${chainId}.`);
  const chainHead = await client.getBlockNumber();
  const logs = await client.getLogs({ address: factoryAddress, fromBlock, toBlock });

  process.stdout.write(`${JSON.stringify({ healthy: true, chainId, chainHead: chainHead.toString(), fromBlock: fromBlock.toString(), toBlock: toBlock.toString(), logCount: logs.length }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
