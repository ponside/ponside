import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ getChainEnv }, { getServiceSupabase }] = await Promise.all([
    import("../lib/server/env"),
    import("../lib/server/supabase"),
  ]);
  const { factoryAddress } = getChainEnv();
  const supabase = getServiceSupabase();
  const indexerName = `pons-v2:${factoryAddress.toLowerCase()}`;
  const state = await supabase.from("indexer_state").select("last_processed_block").eq("indexer_name", indexerName).maybeSingle();
  if (state.error) throw new Error(`Indexer state query failed: ${state.error.message}`);
  const launches = await supabase.from("pons_launches").select("*", { count: "exact", head: true });
  if (launches.error) throw new Error(`Launch count failed: ${launches.error.message}`);
  const trades = await supabase.from("pons_trades").select("*", { count: "exact", head: true });
  if (trades.error) throw new Error(`Trade count failed: ${trades.error.message}`);
  const curveEvents = await supabase.from("pons_curve_events").select("*", { count: "exact", head: true });
  if (curveEvents.error) throw new Error(`Curve-event count failed: ${curveEvents.error.message}`);

  process.stdout.write(`${JSON.stringify({
    lastProcessedBlock: state.data?.last_processed_block ?? null,
    indexedLaunches: launches.count ?? 0,
    indexedTrades: trades.count ?? 0,
    indexedCurveEvents: curveEvents.count ?? 0,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
