import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const [{ EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18 }, { listTokens }, source, { getServiceSupabase }, { getChainEnv }] = await Promise.all([
    import("../lib/discovery"),
    import("../lib/server/market"),
    import("../lib/server/pons-source"),
    import("../lib/server/supabase"),
    import("../lib/server/env"),
  ]);
  const supabase = getServiceSupabase();
  const { factoryAddress } = getChainEnv();
  const [rowsResult, graduated, active] = await Promise.all([
    supabase.from("pons_launches").select("token_address, is_ponside_launch"),
    source.getOfficialPonsV2GraduatedMarkets(),
    source.getOfficialPonsV2ActiveMarketCandidates(EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18),
  ]);
  if (rowsResult.error) throw new Error(`Discovery inventory failed: ${rowsResult.error.message}`);
  const officialEligible = new Set<string>([...graduated, ...active.markets]
    .filter((market) => market.factoryAddress === factoryAddress.toLowerCase() && BigInt(market.marketCapUsdE18) >= EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18)
    .map((market) => market.tokenAddress));
  const publicEligibleMarkets = (rowsResult.data ?? []).filter((row) => row.is_ponside_launch || officialEligible.has(row.token_address)).length;
  const results: Record<string, { count: number; addresses: string[] }> = {};
  for (const [label, sort, window] of [
    ["trending", "trending", "7d"],
    ["newest", "newest", "7d"],
    ["oldest", "oldest", "7d"],
    ["recentLaunches", "newest", "all"],
  ] as const) {
    const tokens = await listTokens("", 20, sort, window);
    results[label] = { count: tokens.length, addresses: tokens.map((token) => token.address) };
  }
  process.stdout.write(`${JSON.stringify({
    officialV2GraduatedMarkets: graduated.filter((market) => market.factoryAddress === factoryAddress.toLowerCase()).length,
    officialEligibleSourceMarkets: officialEligible.size,
    storedVerifiedMarkets: rowsResult.data?.length ?? 0,
    storedPonsideMarkets: (rowsResult.data ?? []).filter((row) => row.is_ponside_launch).length,
    publicEligibleMarkets,
    ...results,
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
