import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("official Pons discovery architecture", () => {
  it("discovers and snapshots markets without historical log retrieval", () => {
    const refresh = read("lib/pons/discovery-refresh.ts");
    expect(refresh).toContain("getOfficialPonsV2GraduatedMarkets");
    expect(refresh).toContain("getOfficialPonsV2ActiveMarketCandidates");
    expect(refresh).toContain("getOfficialPonsV2RecentMarkets");
    expect(refresh).toContain('from("pons_market_snapshots").upsert');
    expect(refresh).not.toContain(".getLogs(");
    expect(refresh).not.toContain("syncPonsIndexer");
  });

  it("verifies new identities and pair economics directly against Pons V2", () => {
    const refresh = read("lib/pons/discovery-refresh.ts");
    expect(refresh).toContain("getTransactionReceipt");
    expect(refresh).toContain('functionName: "getLaunchedToken"');
    expect(refresh).toContain('functionName: "approvedPairTokens"');
    expect(refresh).toContain('functionName: "pairTokenEconomics"');
  });

  it("serves Explore from snapshots without checking blockchain indexer coverage", () => {
    const market = read("lib/server/market.ts");
    expect(market).toContain("get_token_market_snapshot_metrics");
    expect(market).not.toContain("getBlockNumber");
    expect(market).not.toContain("getOfficialPonsV2MarketMap");
  });

  it("prepares a five-minute server-authenticated refresh", () => {
    const migration = read("supabase/migrations/20260905000000_market_discovery_refresh.sql");
    const activation = read("supabase/scheduler/activate_pons_discovery_refresh.sql");
    const route = read("app/api/internal/discovery/refresh/route.ts");
    expect(migration).toContain("ponside_discovery_refresh_secret");
    expect(migration).not.toContain("cron.schedule(");
    expect(activation).toContain("'*/5 * * * *'");
    expect(activation).toContain("Cron is already active");
    expect(route).toContain("getDiscoveryRefreshSecret");
  });
});
