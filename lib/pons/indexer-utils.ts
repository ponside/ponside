export type LogIdentity = { transactionHash: string; logIndex: number };

export const INDEXER_RETRY_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;
export const DEFAULT_INDEXER_CHUNK_DELAY_MS = 1_000;

export function indexerRetryDelayMs(retryIndex: number, randomValue = Math.random()) {
  const base = INDEXER_RETRY_BACKOFF_MS[Math.min(Math.max(retryIndex, 0), INDEXER_RETRY_BACKOFF_MS.length - 1)];
  const boundedRandom = Math.min(Math.max(randomValue, 0), 1);
  return base + Math.floor(boundedRandom * 251);
}

export function isTransientIndexerError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; status?: unknown; name?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === -32603 || candidate.code === 429 || candidate.status === 429) return true;
    if (typeof candidate.status === "number" && [408, 500, 502, 503, 504].includes(candidate.status)) return true;
    if (candidate.name === "TimeoutError") return true;
    if (typeof candidate.message === "string" && /(?:-32603|\b429\b|timed?\s*out|took too long|temporary|rate.?limit|too many requests|internal error|fetch failed|network error|econn|socket hang up|bad gateway|service unavailable|gateway timeout)/i.test(candidate.message)) return true;
    current = candidate.cause;
  }
  return false;
}

export function isSplittableIndexerLogError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (candidate.code === -32603) return true;
    if (typeof candidate.message === "string" && /block range|response size|too many|timeout|timed out|took too long|internal error/i.test(candidate.message)) return true;
    current = candidate.cause;
  }
  return false;
}

export function logIdentity(value: LogIdentity) {
  return `${value.transactionHash.toLowerCase()}:${value.logIndex}`;
}

export function dedupeLogs<T extends LogIdentity>(values: T[]) {
  return [...new Map(values.map((value) => [logIdentity(value), value])).values()];
}

export function stableIndexerHead(chainHead: bigint, confirmations: number) {
  const depth = BigInt(confirmations);
  return chainHead > depth ? chainHead - depth : 0n;
}

export function chunkEnd(fromBlock: bigint, targetBlock: bigint, chunkSize: number) {
  const candidate = fromBlock + BigInt(chunkSize) - 1n;
  return candidate > targetBlock ? targetBlock : candidate;
}
