export const EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18 = 300_000n * 10n ** 18n;

export type DiscoverySort = "trending" | "newest" | "oldest";
export type DiscoveryWindow = "all" | "24h" | "7d";

export type DiscoveryCandidate = {
  address: string;
  isPonsideLaunch: boolean;
  marketCapUsdE18: string | null;
  launchBlock: number;
  launchTimestamp: string;
  activityCount: number;
  tradeCount: number;
  volumeUsdE18: string | null;
  changeBps: number | null;
  socialEngagement: number;
};

export function discoveryWindowStart(window: DiscoveryWindow, now = new Date()): string | null {
  if (window === "all") return null;
  const duration = window === "24h" ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
  return new Date(now.getTime() - duration).toISOString();
}

export function effectiveDiscoveryStart(window: DiscoveryWindow, activityStartedAt: string | null, now = new Date()): string | null {
  const windowStart = discoveryWindowStart(window, now);
  if (!activityStartedAt) return windowStart;
  const normalizedActivityStart = new Date(activityStartedAt).toISOString();
  if (windowStart === null) return normalizedActivityStart;
  return normalizedActivityStart > windowStart ? normalizedActivityStart : windowStart;
}

export function isDiscoveryWindowComplete(window: DiscoveryWindow, activityStartedAt: string | null, now = new Date()) {
  if (!activityStartedAt) return true;
  if (window === "all") return false;
  const duration = window === "24h" ? 24 * 60 * 60 * 1_000 : 7 * 24 * 60 * 60 * 1_000;
  return now.getTime() - new Date(activityStartedAt).getTime() >= duration;
}

export function isDiscoveryEligible(candidate: Pick<DiscoveryCandidate, "isPonsideLaunch" | "marketCapUsdE18">) {
  if (candidate.isPonsideLaunch) return true;
  if (candidate.marketCapUsdE18 === null) return false;
  return BigInt(candidate.marketCapUsdE18) >= EXTERNAL_DISCOVERY_MIN_MARKET_CAP_USD_E18;
}

function compareBigIntDesc(left: string | null, right: string | null) {
  const a = left === null ? 0n : BigInt(left);
  const b = right === null ? 0n : BigInt(right);
  return a === b ? 0 : a > b ? -1 : 1;
}

function newest(left: DiscoveryCandidate, right: DiscoveryCandidate) {
  if (left.launchBlock !== right.launchBlock) return right.launchBlock - left.launchBlock;
  const timestamp = right.launchTimestamp.localeCompare(left.launchTimestamp);
  return timestamp || left.address.localeCompare(right.address);
}

export function sortDiscovery<T extends DiscoveryCandidate>(candidates: T[], sort: DiscoverySort): T[] {
  const eligible = candidates.filter(isDiscoveryEligible);
  return eligible.sort((left, right) => {
    if (sort === "newest") return newest(left, right);
    if (sort === "oldest") return -newest(left, right);

    if (left.activityCount !== right.activityCount) return right.activityCount - left.activityCount;
    const leftMovement = Math.abs(left.changeBps ?? 0);
    const rightMovement = Math.abs(right.changeBps ?? 0);
    if (leftMovement !== rightMovement) return rightMovement - leftMovement;
    if (left.socialEngagement !== right.socialEngagement) return right.socialEngagement - left.socialEngagement;
    const marketCap = compareBigIntDesc(left.marketCapUsdE18, right.marketCapUsdE18);
    if (marketCap) return marketCap;
    return newest(left, right);
  });
}

export function pinFeaturedToken<T extends { address: string | null }>(items: T[], featuredAddress: string | null): T[] {
  if (!featuredAddress) return items;
  const index = items.findIndex((item) => item.address?.toLowerCase() === featuredAddress.toLowerCase());
  if (index <= 0) return items;
  return [items[index], ...items.slice(0, index), ...items.slice(index + 1)];
}
