import { describe, expect, it } from "vitest";
import { parseOfficialPonsMarket, usdNumberToE18 } from "../lib/pons/source-utils";

describe("official Pons market source", () => {
  it("converts only finite non-negative USD numbers to six-decimal E18 precision", () => {
    expect(usdNumberToE18(300_000.125)).toBe("300000125000000000000000");
    expect(usdNumberToE18(Number.NaN)).toBeNull();
    expect(usdNumberToE18(-1)).toBeNull();
  });

  it("accepts only complete V2 records and requires graduation provenance when graduated", () => {
    const observedAt = "2026-09-05T00:00:00.000Z";
    const input = {
      version: "v2",
      graduated: true,
      factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
      token: "0x1111111111111111111111111111111111111111",
      deployer: "0x2222222222222222222222222222222222222222",
      pairToken: "0x0000000000000000000000000000000000000000",
      transactionHash: `0x${"a".repeat(64)}`,
      blockNumber: 100,
      launchedAt: "2026-09-01T00:00:00.000Z",
      graduatedBlockNumber: 200,
      graduatedAt: "2026-09-02T00:00:00.000Z",
      marketCapUsd: 500_000,
      priceUsd: 0.5,
      latestBuyAt: "2026-09-02T01:00:00.000Z",
      latestBuyBlockNumber: 201,
      graduationProgressPct: 100,
    };
    expect(parseOfficialPonsMarket(input, observedAt)).toMatchObject({ tokenAddress: input.token, graduated: true, latestBuyBlock: 201, graduationProgressBps: 10_000 });
    expect(parseOfficialPonsMarket({ ...input, version: "v1" }, observedAt)).toBeNull();
    expect(parseOfficialPonsMarket({ ...input, marketCapUsd: null }, observedAt)).toBeNull();
    expect(parseOfficialPonsMarket({ ...input, graduatedBlockNumber: null }, observedAt)).toBeNull();
    expect(parseOfficialPonsMarket({ ...input, graduated: false, graduatedBlockNumber: null, graduatedAt: null }, observedAt)?.graduatedBlock).toBeNull();
    expect(parseOfficialPonsMarket({ ...input, graduationProgressPct: 101 }, observedAt)).toBeNull();
  });
});
