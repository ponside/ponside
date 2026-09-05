import "server-only";
import { isAddress } from "viem";

const ASSETS_URL = "https://api.robinhood.com/rhj/assets";
const PRICE_URL = "https://api.robinhood.com/rhj/prices";
const CHAIN_ID = 4663;
const SCALE = 10n ** 18n;
const MAX_QUOTE_AGE_MS = 10 * 60 * 1_000;

type Deployment = { contractAddress?: string; chainId?: number };
type Asset = { tokenSymbol?: string; currentMultiplier?: string; status?: string; deployments?: Deployment[] };
type Quote = { tokenSymbol?: string; deployments?: Deployment[]; bid?: string; ask?: string; currency?: string; generatedAt?: string };

export type QuoteUsdPrice = { priceE18: string; observedAt: string; source: "robinhood-stock-token-api" };

function decimalE18(value: string | undefined): bigint | null {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > 18) return null;
  return BigInt(whole) * SCALE + BigInt((fraction + "0".repeat(18)).slice(0, 18));
}

function deploymentMatches(deployments: Deployment[] | undefined, address: string) {
  return deployments?.some((deployment) => deployment.chainId === CHAIN_ID && deployment.contractAddress?.toLowerCase() === address) ?? false;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" }, next: { revalidate: 60 } });
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export async function getReliableQuoteUsdPrices(pairAddresses: string[], now = Date.now()) {
  const requested = [...new Set(pairAddresses.map((address) => address.toLowerCase()).filter((address) => isAddress(address)))];
  const result = new Map<string, QuoteUsdPrice>();
  if (!requested.length) return result;

  const assetsPayload = await fetchJson<{ assets?: Asset[] }>(ASSETS_URL);
  const assets = assetsPayload?.assets ?? [];
  const matched = requested.flatMap((address) => {
    const asset = assets.find((item) => item.status === "ASSET_STATUS_ACTIVE" && deploymentMatches(item.deployments, address));
    return asset?.tokenSymbol && asset.currentMultiplier ? [{ address, asset }] : [];
  });

  await Promise.all(matched.map(async ({ address, asset }) => {
    const payload = await fetchJson<{ quotes?: Quote[] }>(`${PRICE_URL}/${encodeURIComponent(asset.tokenSymbol!)}`);
    const quote = payload?.quotes?.find((item) => item.tokenSymbol === asset.tokenSymbol && item.currency === "USD" && deploymentMatches(item.deployments, address));
    const observedAt = quote?.generatedAt ? Date.parse(quote.generatedAt) : Number.NaN;
    const bid = decimalE18(quote?.bid);
    const ask = decimalE18(quote?.ask);
    const multiplier = decimalE18(asset.currentMultiplier);
    if (!bid || !ask || !multiplier || bid <= 0n || ask <= 0n || multiplier <= 0n || !Number.isFinite(observedAt) || observedAt > now + 60_000 || now - observedAt > MAX_QUOTE_AGE_MS) return;
    const midpoint = (bid + ask) / 2n;
    result.set(address, { priceE18: (midpoint * multiplier / SCALE).toString(), observedAt: new Date(observedAt).toISOString(), source: "robinhood-stock-token-api" });
  }));
  return result;
}
