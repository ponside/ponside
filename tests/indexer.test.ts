import { describe, expect, it } from "vitest";
import {
  chunkEnd,
  dedupeLogs,
  INDEXER_RETRY_BACKOFF_MS,
  indexerRetryDelayMs,
  isSplittableIndexerLogError,
  isTransientIndexerError,
  logIdentity,
  stableIndexerHead,
} from "../lib/pons/indexer-utils";

describe("indexer idempotency", () => {
  it("uses transaction hash and log index as a stable identity", () => {
    expect(logIdentity({ transactionHash: "0xABC", logIndex: 7 })).toBe("0xabc:7");
  });

  it("deduplicates retries without collapsing distinct logs in one transaction", () => {
    const values = [
      { transactionHash: "0xABC", logIndex: 1, value: "first" },
      { transactionHash: "0xabc", logIndex: 1, value: "retry" },
      { transactionHash: "0xabc", logIndex: 2, value: "second event" },
    ];
    const result = dedupeLogs(values);
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.logIndex)).toEqual([1, 2]);
  });

  it("indexes only stable blocks and never underflows near genesis", () => {
    expect(stableIndexerHead(1_000n, 12)).toBe(988n);
    expect(stableIndexerHead(5n, 12)).toBe(0n);
  });

  it("caps each retrieval chunk at the stable target", () => {
    expect(chunkEnd(100n, 1_000n, 200)).toBe(299n);
    expect(chunkEnd(900n, 1_000n, 200)).toBe(1_000n);
  });

  it("uses bounded exponential provider backoff with small jitter", () => {
    expect(INDEXER_RETRY_BACKOFF_MS).toEqual([2_000, 4_000, 8_000, 16_000, 30_000]);
    expect(INDEXER_RETRY_BACKOFF_MS.map((_, index) => indexerRetryDelayMs(index, 0))).toEqual(INDEXER_RETRY_BACKOFF_MS);
    expect(indexerRetryDelayMs(4, 1)).toBe(30_251);
  });

  it("retries temporary provider failures but not deterministic contract errors", () => {
    expect(isTransientIndexerError({ code: -32603 })).toBe(true);
    expect(isTransientIndexerError({ status: 429 })).toBe(true);
    expect(isTransientIndexerError(new Error("request timed out"))).toBe(true);
    expect(isTransientIndexerError(new Error("the request took too long to respond"))).toBe(true);
    expect(isTransientIndexerError(new Error("execution reverted: unauthorized"))).toBe(false);
  });

  it("subdivides provider-limited log ranges, including wrapped timeout errors", () => {
    const wrapped = new Error("log request failed", { cause: new Error("the request took too long to respond") });
    expect(isSplittableIndexerLogError(wrapped)).toBe(true);
    expect(isSplittableIndexerLogError({ code: -32603 })).toBe(true);
    expect(isSplittableIndexerLogError(new Error("execution reverted"))).toBe(false);
  });
});
