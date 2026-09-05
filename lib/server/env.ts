import "server-only";
import { isAddress } from "viem";
import { DEFAULT_INDEXER_CHUNK_DELAY_MS } from "@/lib/pons/indexer-utils";

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_ERROR";
  constructor(public readonly missing: string[]) {
    super(`Missing required server configuration: ${missing.join(", ")}`);
    this.name = "ConfigurationError";
  }
}

function requireValues(names: string[]) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length) throw new ConfigurationError(missing);
  return Object.fromEntries(names.map((name) => [name, process.env[name]!.trim()]));
}

export function getSupabaseEnv() {
  const values = requireValues(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  return { url: values.NEXT_PUBLIC_SUPABASE_URL, serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY };
}

export function getPrivyEnv() {
  const values = requireValues(["NEXT_PUBLIC_PRIVY_APP_ID", "PRIVY_APP_SECRET"]);
  return { appId: values.NEXT_PUBLIC_PRIVY_APP_ID, appSecret: values.PRIVY_APP_SECRET };
}

export function getChainEnv() {
  const values = requireValues(["ROBINHOOD_RPC_URL"]);
  const factoryAddress = process.env.PONS_V2_FACTORY_ADDRESS?.trim() || "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e";
  const launchAndBuyAddress = process.env.PONS_V2_LAUNCH_AND_BUY_ADDRESS?.trim() || "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948";
  const deploymentBlockText = process.env.PONS_V2_DEPLOYMENT_BLOCK?.trim() || "26841846";
  const blockChunkSize = Number(process.env.INDEXER_BLOCK_CHUNK_SIZE?.trim() || "2000");
  const maxChunksPerRun = Number(process.env.INDEXER_MAX_CHUNKS_PER_RUN?.trim() || "20");
  const confirmations = Number(process.env.INDEXER_CONFIRMATIONS?.trim() || "12");
  const chunkDelayMs = Number(process.env.INDEXER_CHUNK_DELAY_MS?.trim() || String(DEFAULT_INDEXER_CHUNK_DELAY_MS));
  let rpcUrl: URL;
  try { rpcUrl = new URL(values.ROBINHOOD_RPC_URL); } catch { throw new ConfigurationError(["ROBINHOOD_RPC_URL (invalid URL)"]); }
  if (!/^https?:$/.test(rpcUrl.protocol)) throw new ConfigurationError(["ROBINHOOD_RPC_URL (must use HTTP or HTTPS)"]);
  if (!isAddress(factoryAddress) || !isAddress(launchAndBuyAddress)) throw new ConfigurationError(["PONS_V2 contract address (invalid)"]);
  if (!/^\d+$/.test(deploymentBlockText)) throw new ConfigurationError(["PONS_V2_DEPLOYMENT_BLOCK (invalid)"]);
  if (!Number.isInteger(blockChunkSize) || blockChunkSize < 1 || blockChunkSize > 10_000) throw new ConfigurationError(["INDEXER_BLOCK_CHUNK_SIZE (invalid)"]);
  if (!Number.isInteger(maxChunksPerRun) || maxChunksPerRun < 1 || maxChunksPerRun > 1_000) throw new ConfigurationError(["INDEXER_MAX_CHUNKS_PER_RUN (invalid)"]);
  if (!Number.isInteger(confirmations) || confirmations < 0 || confirmations > 1_000) throw new ConfigurationError(["INDEXER_CONFIRMATIONS (invalid)"]);
  if (!Number.isInteger(chunkDelayMs) || chunkDelayMs < 0 || chunkDelayMs > 60_000) throw new ConfigurationError(["INDEXER_CHUNK_DELAY_MS (invalid)"]);
  return {
    rpcUrl: rpcUrl.toString(),
    factoryAddress: factoryAddress as `0x${string}`,
    launchAndBuyAddress: launchAndBuyAddress as `0x${string}`,
    deploymentBlock: BigInt(deploymentBlockText),
    blockChunkSize,
    maxChunksPerRun,
    confirmations,
    chunkDelayMs,
  };
}

export function getIndexerRpcUrl() {
  const fallback = getChainEnv().rpcUrl;
  const value = process.env.ROBINHOOD_INDEXER_RPC_URL?.trim();
  if (!value) return fallback;
  let rpcUrl: URL;
  try { rpcUrl = new URL(value); } catch { throw new ConfigurationError(["ROBINHOOD_INDEXER_RPC_URL (invalid URL)"]); }
  if (!/^https?:$/.test(rpcUrl.protocol)) throw new ConfigurationError(["ROBINHOOD_INDEXER_RPC_URL (must use HTTP or HTTPS)"]);
  return rpcUrl.toString();
}

export function getIndexerSecret() {
  return requireValues(["INDEXER_SECRET"]).INDEXER_SECRET;
}

export function getDiscoveryRefreshSecret() {
  return requireValues(["PONS_DISCOVERY_REFRESH_SECRET"]).PONS_DISCOVERY_REFRESH_SECRET;
}

export function getStorageBuckets() {
  return {
    postMedia: process.env.SUPABASE_POST_MEDIA_BUCKET?.trim() || "post-media",
    tokenLogos: process.env.SUPABASE_TOKEN_LOGO_BUCKET?.trim() || "token-logos",
  };
}

export function getFeaturedTokenAddress(): `0x${string}` | null {
  const value = process.env.PONSIDE_FEATURED_TOKEN_ADDRESS?.trim();
  return value && isAddress(value) ? value.toLowerCase() as `0x${string}` : null;
}

export function productConfigurationStatus() {
  const auth = ["NEXT_PUBLIC_PRIVY_APP_ID", "PRIVY_APP_SECRET"].every((name) => Boolean(process.env[name]?.trim()));
  const social = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].every((name) => Boolean(process.env[name]?.trim()));
  const chain = Boolean(process.env.ROBINHOOD_RPC_URL?.trim());
  const indexer = social && chain && Boolean(process.env.INDEXER_SECRET?.trim());
  const discovery = social && chain && Boolean(process.env.PONS_DISCOVERY_REFRESH_SECRET?.trim());
  const metadata = Boolean(process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim());
  return { configured: auth && social && chain && discovery && metadata, services: { auth, social, chain, discovery, indexer, metadata } };
}
