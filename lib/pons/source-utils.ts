import { isAddress } from "viem";

const E18 = 10n ** 18n;

export type OfficialPonsMarket = {
  factoryAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  deployerAddress: `0x${string}`;
  pairToken: `0x${string}`;
  transactionHash: `0x${string}`;
  launchBlock: number;
  launchTimestamp: string;
  graduated: boolean;
  graduatedBlock: number | null;
  graduatedTimestamp: string | null;
  marketCapUsdE18: string;
  priceUsdE18: string | null;
  latestBuyAt: string | null;
  latestBuyBlock: number | null;
  graduationProgressBps: number | null;
  observedAt: string;
};

type RawMarket = Record<string, unknown>;

export function usdNumberToE18(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const micros = BigInt(Math.round(value * 1_000_000));
  return (micros * (E18 / 1_000_000n)).toString();
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function date(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function percentageBps(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) return null;
  return Math.round(value * 100);
}

function address(value: unknown): `0x${string}` | null {
  return typeof value === "string" && isAddress(value) ? value.toLowerCase() as `0x${string}` : null;
}

function transactionHash(value: unknown): `0x${string}` | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? value.toLowerCase() as `0x${string}` : null;
}

export function parseOfficialPonsMarket(value: unknown, observedAt: string): OfficialPonsMarket | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as RawMarket;
  if (raw.version !== "v2" || typeof raw.graduated !== "boolean") return null;
  const factoryAddress = address(raw.factory);
  const tokenAddress = address(raw.token);
  const deployerAddress = address(raw.deployer);
  const pairToken = address(raw.pairToken);
  const txHash = transactionHash(raw.transactionHash);
  const launchBlock = integer(raw.blockNumber);
  const launchTimestamp = date(raw.launchedAt);
  const graduatedBlock = raw.graduated ? integer(raw.graduatedBlockNumber) : null;
  const graduatedTimestamp = raw.graduated ? date(raw.graduatedAt) : null;
  const marketCapUsdE18 = usdNumberToE18(raw.marketCapUsd);
  const priceUsdE18 = usdNumberToE18(raw.priceUsd);
  const latestBuyAt = raw.latestBuyAt === null || raw.latestBuyAt === undefined ? null : date(raw.latestBuyAt);
  const latestBuyBlock = raw.latestBuyBlockNumber === null || raw.latestBuyBlockNumber === undefined ? null : integer(raw.latestBuyBlockNumber);
  const graduationProgressBps = raw.graduationProgressPct === null || raw.graduationProgressPct === undefined ? null : percentageBps(raw.graduationProgressPct);
  if (!factoryAddress || !tokenAddress || !deployerAddress || !pairToken || !txHash || launchBlock === null || !launchTimestamp || (raw.graduated && (graduatedBlock === null || !graduatedTimestamp)) || marketCapUsdE18 === null) return null;
  if ((raw.latestBuyAt !== null && raw.latestBuyAt !== undefined && latestBuyAt === null)
    || (raw.latestBuyBlockNumber !== null && raw.latestBuyBlockNumber !== undefined && latestBuyBlock === null)
    || (raw.graduationProgressPct !== null && raw.graduationProgressPct !== undefined && graduationProgressBps === null)) return null;
  return { factoryAddress, tokenAddress, deployerAddress, pairToken, transactionHash: txHash, launchBlock, launchTimestamp, graduated: raw.graduated, graduatedBlock, graduatedTimestamp, marketCapUsdE18, priceUsdE18, latestBuyAt, latestBuyBlock, graduationProgressBps, observedAt };
}
