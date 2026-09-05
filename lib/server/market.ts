import "server-only";
import { formatUnits, isAddress } from "viem";
import type { Profile, TokenMarket } from "@/lib/domain";
import { effectiveDiscoveryStart, isDiscoveryWindowComplete, pinFeaturedToken, sortDiscovery, type DiscoverySort, type DiscoveryWindow } from "@/lib/discovery";
import { curveAbi } from "@/lib/pons/contracts";
import { getRobinhoodClient } from "@/lib/pons/chain";
import { normalizedPriceRaw, progressBps } from "@/lib/pons/math";
import { getFeaturedTokenAddress } from "@/lib/server/env";
import { HttpError } from "@/lib/server/http";
import { getReliableQuoteUsdPrices, type QuoteUsdPrice } from "@/lib/server/quote-usd";
import { getServiceSupabase } from "@/lib/server/supabase";

type LaunchRow = {
  token_address: string;
  curve_address: string;
  creator_profile_id: string | null;
  is_ponside_launch: boolean;
  pair_token: string;
  pair_token_decimals: number | null;
  pair_token_symbol: string | null;
  token_name: string | null;
  token_symbol: string | null;
  token_decimals: number | null;
  token_logo_url: string | null;
  token_description: string | null;
  total_supply: string | null;
  graduation_threshold: string;
  launch_tx_hash: string;
  launch_block: number;
  launch_timestamp: string;
  phase: number;
};

type TradeRow = { tx_hash: string; log_index: number; trader_address: string; recipient_address: string; side: "buy" | "sell"; quote_amount: string; token_amount: string; fee_amount: string; creator_tax_amount: string; block_number: number; block_timestamp: string };
type MetricRow = { token_address: string; price_usd_e18: string | null; market_cap_usd_e18: string | null; graduation_progress_bps: number | null; latest_snapshot_at: string | null; observation_count: number; activity_count: number; first_price_usd_e18: string | null; last_price_usd_e18: string | null; social_engagement: number };
type ProfileRow = { id: string; display_name: string; x_handle: string; bio: string; avatar_url: string | null; wallet_address: string | null; is_public: boolean };
type MarketContext = {
  coverage: { fresh: boolean; latestRefreshAt: string | null; activityStartedAt: string | null };
  metrics: Map<string, MetricRow>;
  creators: Map<string, Profile>;
  quoteUsd: Map<string, QuoteUsdPrice>;
  window: DiscoveryWindow;
};

const launchColumns = "token_address, curve_address, creator_profile_id, is_ponside_launch, pair_token, pair_token_decimals, pair_token_symbol, token_name, token_symbol, token_decimals, token_logo_url, token_description, total_supply, graduation_threshold, launch_tx_hash, launch_block, launch_timestamp, phase";

function phaseLabel(phase: number) {
  return phase === 0 ? "Bonding" : phase === 1 ? "Swept" : phase === 2 ? "Graduated" : "Rescued";
}

function profileFromRow(row: ProfileRow, followers: number, following: number): Profile {
  return { id: row.id, name: row.display_name, handle: row.x_handle, bio: row.bio, avatarUrl: row.avatar_url, walletAddress: row.wallet_address, followers, following };
}

function executionPriceRaw(trade: Pick<TradeRow, "quote_amount" | "token_amount">, tokenDecimals: number, pairDecimals: number) {
  const tokens = BigInt(trade.token_amount);
  if (tokens === 0n) return 0n;
  return BigInt(trade.quote_amount) * 10n ** BigInt(tokenDecimals) * 10n ** 18n / (tokens * 10n ** BigInt(pairDecimals));
}

function verifiedTokenLogoUrl(value: string | null) {
  if (!value) return null;
  if (value.startsWith("ipfs://")) {
    const path = value.slice(7).replace(/^ipfs\//, "");
    return path && !/[?#]/.test(path) ? `https://ipfs.io/ipfs/${path}` : null;
  }
  if (value.startsWith("ar://")) {
    const path = value.slice(5);
    return path && !/[?#]/.test(path) ? `https://arweave.net/${path}` : null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const DISCOVERY_REFRESH_MAX_AGE_MS = 15 * 60 * 1_000;
let coverageCache: { expires: number; fresh: boolean; latestRefreshAt: string | null; activityStartedAt: string | null } | null = null;
async function getIndexCoverage() {
  if (coverageCache && coverageCache.expires > Date.now()) return coverageCache;
  const startName = "pons-discovery-snapshot-start:v1";
  const refreshName = "pons-discovery-refresh:v1";
  const { data, error } = await getServiceSupabase().from("indexer_state").select("indexer_name, updated_at").in("indexer_name", [startName, refreshName]);
  if (error) throw new Error(`Discovery refresh coverage query failed: ${error.message}`);
  const start = data?.find((row) => row.indexer_name === startName)?.updated_at ?? null;
  const refreshedAt = data?.find((row) => row.indexer_name === refreshName)?.updated_at ?? null;
  const fresh = refreshedAt !== null && Date.now() - Date.parse(refreshedAt) <= DISCOVERY_REFRESH_MAX_AGE_MS;
  coverageCache = { expires: Date.now() + 30_000, fresh, latestRefreshAt: refreshedAt, activityStartedAt: start };
  return coverageCache;
}

function chunks<T>(values: T[], size: number) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, (index + 1) * size));
}

async function loadMarketContext(rows: LaunchRow[], window: DiscoveryWindow): Promise<MarketContext> {
  const coverage = await getIndexCoverage();
  const supabase = getServiceSupabase();
  const addresses = rows.map((row) => row.token_address);
  const creatorIds = [...new Set(rows.flatMap((row) => row.creator_profile_id ? [row.creator_profile_id] : []))];
  const since = effectiveDiscoveryStart(window, coverage.activityStartedAt);
  const [metricResults, socialResults] = await Promise.all([
    Promise.all(chunks(addresses, 50).map((batch) => supabase.rpc("get_token_market_snapshot_metrics", { p_token_addresses: batch, p_since: since }))),
    Promise.all(chunks(addresses, 50).map((batch) => supabase.rpc("get_public_token_social_engagement", { p_token_addresses: batch, p_since: since }))),
  ]);
  const metricError = metricResults.find((result) => result.error)?.error;
  const socialError = socialResults.find((result) => result.error)?.error;
  const [profileResult, statsResult, quoteUsd] = await Promise.all([
    creatorIds.length ? supabase.from("profiles").select("id, display_name, x_handle, bio, avatar_url, wallet_address, is_public").in("id", creatorIds).eq("is_public", true) : Promise.resolve({ data: [], error: null }),
    creatorIds.length ? supabase.rpc("get_profile_stats", { p_profile_ids: creatorIds }) : Promise.resolve({ data: [], error: null }),
    getReliableQuoteUsdPrices(rows.map((row) => row.pair_token)),
  ]);
  if (metricError || socialError || profileResult.error || statsResult.error) throw new Error(`Market context query failed: ${metricError?.message || socialError?.message || profileResult.error?.message || statsResult.error?.message}`);
  const publicSocial = new Map(socialResults.flatMap((result) => result.data ?? []).map((row) => [row.token_address, Number(row.social_engagement)]));
  const metricRows = (metricResults.flatMap((result) => result.data ?? []) as MetricRow[]).map((metric) => ({ ...metric, social_engagement: publicSocial.get(metric.token_address) || 0 }));
  const metrics = new Map(metricRows.map((metric) => [metric.token_address, metric]));
  const stats = new Map((statsResult.data as Array<{ profile_id: string; followers: number | string; following: number | string }>).map((item) => [item.profile_id, item]));
  const creators = new Map((profileResult.data as unknown as ProfileRow[]).map((profile) => {
    const aggregate = stats.get(profile.id);
    return [profile.id, profileFromRow(profile, Number(aggregate?.followers || 0), Number(aggregate?.following || 0))];
  }));
  return { coverage, metrics, creators, quoteUsd, window };
}

async function loadMarket(row: LaunchRow, includeHistory = false, suppliedContext?: MarketContext): Promise<TokenMarket> {
  if (row.pair_token_decimals === null || row.token_decimals === null || row.total_supply === null || row.token_name === null || row.token_symbol === null || row.pair_token_symbol === null) {
    throw new HttpError(503, "TOKEN_INDEXING", "This launch is still being enriched from onchain state.");
  }
  const context = suppliedContext || await loadMarketContext([row], "24h");
  const tokenDecimals = row.token_decimals;
  const pairDecimals = row.pair_token_decimals;
  let currentPriceRaw: bigint | null = null;
  let realReserve: bigint | null = null;
  let threshold = BigInt(row.graduation_threshold);
  let sellableTokens: bigint | null = null;
  let readyToGraduate: boolean | null = null;
  let graduated = row.phase >= 2;
  if (includeHistory && row.phase === 0) {
    try {
      const client = getRobinhoodClient();
      const [reserves, real, onchainThreshold, sellable, ready, curveGraduated] = await Promise.all([
        client.readContract({ address: row.curve_address as `0x${string}`, abi: curveAbi, functionName: "getReserves" }),
        client.readContract({ address: row.curve_address as `0x${string}`, abi: curveAbi, functionName: "realQuoteReserve" }),
        client.readContract({ address: row.curve_address as `0x${string}`, abi: curveAbi, functionName: "graduationThreshold" }),
        client.readContract({ address: row.curve_address as `0x${string}`, abi: curveAbi, functionName: "sellableTokens" }),
        client.readContract({ address: row.curve_address as `0x${string}`, abi: curveAbi, functionName: "readyToGraduate" }),
        client.readContract({ address: row.curve_address as `0x${string}`, abi: curveAbi, functionName: "graduated" }),
      ]);
      realReserve = real;
      threshold = onchainThreshold;
      sellableTokens = sellable;
      readyToGraduate = ready;
      graduated = curveGraduated;
      currentPriceRaw = normalizedPriceRaw(reserves[0], reserves[1], pairDecimals, tokenDecimals);
    } catch {
      currentPriceRaw = null;
    }
  }

  const supabase = getServiceSupabase();
  const historyResult = includeHistory ? await supabase.from("pons_trades").select("tx_hash, log_index, trader_address, recipient_address, side, quote_amount, token_amount, fee_amount, creator_tax_amount, block_number, block_timestamp").eq("token_address", row.token_address).order("block_number", { ascending: false }).order("log_index", { ascending: false }).limit(500) : { data: [], error: null };
  if (historyResult.error) throw new Error(`Market metrics query failed: ${historyResult.error.message}`);
  const trades = (historyResult.data as unknown as TradeRow[]).reverse();
  const metric = context.metrics.get(row.token_address) || null;
  const metricFresh = context.coverage.fresh && metric?.latest_snapshot_at !== null && metric?.latest_snapshot_at !== undefined && Date.now() - Date.parse(metric.latest_snapshot_at) <= DISCOVERY_REFRESH_MAX_AGE_MS;
  const firstPriceUsd = metricFresh && metric?.first_price_usd_e18 ? BigInt(metric.first_price_usd_e18) : null;
  const lastPriceUsd = metricFresh && metric?.last_price_usd_e18 ? BigInt(metric.last_price_usd_e18) : null;
  const quoteUsd = context.quoteUsd.get(row.pair_token.toLowerCase()) || null;
  const snapshotPriceRaw = metricFresh && metric?.price_usd_e18 && quoteUsd ? BigInt(metric.price_usd_e18) * 10n ** 18n / BigInt(quoteUsd.priceE18) : null;
  const displayPriceRaw = currentPriceRaw ?? snapshotPriceRaw;
  const changeBps = firstPriceUsd && lastPriceUsd && firstPriceUsd > 0n ? Number((lastPriceUsd - firstPriceUsd) * 10_000n / firstPriceUsd) : null;
  const totalSupply = BigInt(row.total_supply);
  const marketCapRaw = currentPriceRaw === null ? null : currentPriceRaw * totalSupply * 10n ** BigInt(pairDecimals) / (10n ** 18n * 10n ** BigInt(tokenDecimals));
  const marketCapUsdE18 = marketCapRaw !== null && quoteUsd ? marketCapRaw * BigInt(quoteUsd.priceE18) / 10n ** BigInt(pairDecimals) : metricFresh && metric?.market_cap_usd_e18 ? BigInt(metric.market_cap_usd_e18) : null;
  const creator = row.creator_profile_id ? context.creators.get(row.creator_profile_id) || null : null;
  const chart = trades.filter((trade) => BigInt(trade.token_amount) > 0n).map((trade) => ({ timestamp: trade.block_timestamp, priceRaw: executionPriceRaw(trade, tokenDecimals, pairDecimals).toString() }));

  return {
    address: row.token_address,
    curveAddress: row.curve_address,
    name: row.token_name,
    symbol: row.token_symbol,
    logoUrl: verifiedTokenLogoUrl(row.token_logo_url),
    description: row.token_description || "",
    pairAddress: row.pair_token,
    pairSymbol: row.pair_token_symbol,
    pairDecimals,
    tokenDecimals,
    totalSupply: totalSupply.toString(),
    phase: row.phase,
    phaseLabel: phaseLabel(row.phase),
    creator,
    isPonsideLaunch: row.is_ponside_launch,
    launchBlock: Number(row.launch_block),
    launchTimestamp: row.launch_timestamp,
    launchTxHash: row.launch_tx_hash,
    priceRaw: displayPriceRaw?.toString() ?? null,
    marketCapRaw: marketCapRaw?.toString() ?? null,
    marketCapUsdE18: marketCapUsdE18?.toString() ?? null,
    quoteUsdPriceE18: quoteUsd?.priceE18 ?? null,
    quoteUsdObservedAt: quoteUsd?.observedAt ?? null,
    activityWindow: context.window,
    activityCoverageStartedAt: context.coverage.activityStartedAt,
    activityWindowComplete: metricFresh && isDiscoveryWindowComplete(context.window, context.coverage.activityStartedAt),
    activityCount: metricFresh && metric ? Number(metric.activity_count) : 0,
    volumeRaw: null,
    volumeUsdE18: null,
    tradeCount: includeHistory ? trades.length : 0,
    changeBps,
    socialEngagement: metric ? Number(metric.social_engagement) : 0,
    bondingProgressBps: realReserve !== null ? progressBps(realReserve, threshold) : metricFresh ? metric?.graduation_progress_bps ?? null : null,
    realQuoteReserve: realReserve?.toString() ?? null,
    graduationThreshold: threshold.toString(),
    chart,
    sellableTokens: sellableTokens?.toString() ?? null,
    readyToGraduate,
    graduated,
    marketDataFresh: metricFresh,
    marketDataObservedAt: metricFresh ? metric?.latest_snapshot_at ?? null : null,
  };
}

async function listLaunchRows(search: string) {
  const supabase = getServiceSupabase();
  const rows: LaunchRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from("pons_launches").select(launchColumns)
      .not("pair_token_decimals", "is", null).not("pair_token_symbol", "is", null)
      .not("token_name", "is", null).not("token_symbol", "is", null)
      .not("token_decimals", "is", null).not("total_supply", "is", null)
      .order("launch_block", { ascending: false }).order("token_address", { ascending: true })
      .range(from, from + pageSize - 1);
    if (search.trim()) {
      const safe = search.trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 80);
      if (isAddress(search.trim())) query = query.eq("token_address", search.trim().toLowerCase());
      else query = query.or(`token_name.ilike.%${safe}%,token_symbol.ilike.%${safe}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Token list query failed: ${error.message}`);
    const page = data as unknown as LaunchRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function loadMarketsInBatches(rows: LaunchRow[], context: MarketContext) {
  const markets: TokenMarket[] = [];
  for (const batch of chunks(rows, 10)) markets.push(...await Promise.all(batch.map((row) => loadMarket(row, false, context))));
  return markets;
}

export async function listTokens(search = "", limit = 20, sort: DiscoverySort = "trending", window: DiscoveryWindow = "all") {
  const safeLimit = Math.max(1, Math.min(limit, 50));
  const rows = await listLaunchRows(search);
  if (!rows.length) return [];
  const context = await loadMarketContext(rows, window);
  const markets = await loadMarketsInBatches(rows, context);
  return pinFeaturedToken(sortDiscovery(markets, sort), getFeaturedTokenAddress()).slice(0, safeLimit);
}

export async function getTokenMarket(address: string) {
  if (!isAddress(address)) throw new HttpError(400, "INVALID_ADDRESS", "The token address is invalid.");
  const { data, error } = await getServiceSupabase().from("pons_launches").select(launchColumns).eq("token_address", address.toLowerCase()).maybeSingle();
  if (error) throw new Error(`Token query failed: ${error.message}`);
  if (!data) throw new HttpError(404, "TOKEN_NOT_FOUND", "This token is not indexed by Ponside.");
  return loadMarket(data as unknown as LaunchRow, true);
}

export async function listProfileTokens(profileId: string, limit = 50) {
  const { data, error } = await getServiceSupabase().from("pons_launches").select(launchColumns).eq("creator_profile_id", profileId)
    .not("pair_token_decimals", "is", null).not("pair_token_symbol", "is", null).not("token_name", "is", null)
    .not("token_symbol", "is", null).not("token_decimals", "is", null).not("total_supply", "is", null)
    .order("launch_block", { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(`Profile launches query failed: ${error.message}`);
  const rows = data as unknown as LaunchRow[];
  const context = await loadMarketContext(rows, "all");
  return Promise.all(rows.map((row) => loadMarket(row, false, context)));
}

export async function listTokenTrades(address: string, limit = 50) {
  if (!isAddress(address)) throw new HttpError(400, "INVALID_ADDRESS", "The token address is invalid.");
  const { data, error } = await getServiceSupabase().from("pons_trades").select("tx_hash, log_index, trader_address, recipient_address, side, quote_amount, token_amount, fee_amount, creator_tax_amount, block_number, block_timestamp").eq("token_address", address.toLowerCase()).order("block_timestamp", { ascending: false }).limit(Math.min(limit, 100));
  if (error) throw new Error(`Token trades query failed: ${error.message}`);
  return (data as unknown as TradeRow[]).map((row) => ({ txHash: row.tx_hash, logIndex: row.log_index, traderAddress: row.trader_address, recipientAddress: row.recipient_address, side: row.side, quoteAmount: row.quote_amount, tokenAmount: row.token_amount, feeAmount: row.fee_amount, creatorTaxAmount: row.creator_tax_amount, blockNumber: Number(row.block_number), timestamp: row.block_timestamp }));
}

export function formatMarketAmount(raw: string | null, decimals: number, maximumFractionDigits = 6) {
  if (raw === null) return "Unavailable";
  const value = formatUnits(BigInt(raw), decimals);
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, maximumFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}
