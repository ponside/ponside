import "server-only";
import { parseOfficialPonsMarket, usdNumberToE18, type OfficialPonsMarket } from "@/lib/pons/source-utils";

export type { OfficialPonsMarket } from "@/lib/pons/source-utils";

const OFFICIAL_PONS_GRADUATED_MARKETS_URL = "https://robinhood.ponslaunchpad.com/api/pons-launches/graduations?catalog=1&v=8";
const SOURCE_CACHE_MS = 15_000;
let sourceCache: { expires: number; markets: OfficialPonsMarket[] } | null = null;

function payloadObservedAt(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return new Date().toISOString();
  return new Date(value).toISOString();
}

async function getOfficialExplorePage(parameters: URLSearchParams) {
  const response = await fetch(`https://robinhood.ponslaunchpad.com/api/pons-launches?${parameters}`, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official Pons Explore source returned HTTP ${response.status}.`);
  const payload = await response.json() as { generatedAt?: unknown; active?: { items?: unknown[]; total?: number } };
  const items = Array.isArray(payload.active?.items) ? payload.active.items : [];
  const observedAt = payloadObservedAt(payload.generatedAt);
  return {
    total: Number.isSafeInteger(payload.active?.total) ? payload.active!.total! : 0,
    rawItems: items,
    markets: items.flatMap((value) => {
      const market = parseOfficialPonsMarket(value, observedAt);
      return market ? [market] : [];
    }),
  };
}

export async function getOfficialPonsV2ActiveMarketCandidates(minimumMarketCapUsdE18: bigint) {
  const pageSize = 100;
  const markets: OfficialPonsMarket[] = [];
  const observedMarkets: OfficialPonsMarket[] = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    const parameters = new URLSearchParams({ explore: "1", sort: "marketCap", age: "all", page: String(page), pageSize: String(pageSize), graduatedPage: "1", graduatedPageSize: "1", includeGraduated: "0", v: "10" });
    const result = await getOfficialExplorePage(parameters);
    total = result.total || total;
    observedMarkets.push(...result.markets);
    markets.push(...result.markets.filter((market) => BigInt(market.marketCapUsdE18) >= minimumMarketCapUsdE18));
    const lastItem = result.rawItems.at(-1);
    const lastMarketCap = lastItem && typeof lastItem === "object" ? usdNumberToE18((lastItem as Record<string, unknown>).marketCapUsd) : null;
    if (result.rawItems.length < pageSize || lastMarketCap === null || BigInt(lastMarketCap) < minimumMarketCapUsdE18) break;
  }
  return { total, markets, observedMarkets };
}

export async function getOfficialPonsV2RecentMarkets(pageSize = 100) {
  const parameters = new URLSearchParams({ explore: "1", sort: "newest", age: "all", page: "1", pageSize: String(Math.max(1, Math.min(pageSize, 100))), graduatedPage: "1", graduatedPageSize: "1", includeGraduated: "0", fresh: "1", v: "10" });
  return (await getOfficialExplorePage(parameters)).markets;
}

export async function getOfficialPonsV2MarketByAddress(tokenAddress: string) {
  const parameters = new URLSearchParams({ q: tokenAddress, v: "10" });
  const response = await fetch(`https://robinhood.ponslaunchpad.com/api/pons-launches/search?${parameters}`, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official Pons search source returned HTTP ${response.status}.`);
  const payload = await response.json() as { items?: unknown[] };
  const observedAt = new Date().toISOString();
  return (Array.isArray(payload.items) ? payload.items : []).flatMap((value) => {
    const market = parseOfficialPonsMarket(value, observedAt);
    return market ? [market] : [];
  }).find((market) => market.tokenAddress === tokenAddress.toLowerCase()) ?? null;
}

export async function getOfficialPonsV2GraduatedMarkets() {
  if (sourceCache && sourceCache.expires > Date.now()) return sourceCache.markets;
  const response = await fetch(OFFICIAL_PONS_GRADUATED_MARKETS_URL, { cache: "no-store", headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official Pons market source returned HTTP ${response.status}.`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error("Official Pons market source returned an invalid payload.");
  const observedAt = new Date().toISOString();
  const markets = payload.flatMap((value) => {
    const market = parseOfficialPonsMarket(value, observedAt);
    return market && market.graduatedBlock !== null ? [market] : [];
  });
  if (!markets.length) throw new Error("Official Pons market source returned no valid V2 markets.");
  sourceCache = { expires: Date.now() + SOURCE_CACHE_MS, markets };
  return markets;
}

export async function getOfficialPonsV2MarketMap(factoryAddress: string) {
  try {
    const markets = await getOfficialPonsV2GraduatedMarkets();
    return new Map(markets.filter((market) => market.factoryAddress === factoryAddress.toLowerCase()).map((market) => [market.tokenAddress, market]));
  } catch {
    return new Map<string, OfficialPonsMarket>();
  }
}
