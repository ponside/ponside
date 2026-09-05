import { describe, expect, it } from "vitest";
import { discoveryWindowStart, effectiveDiscoveryStart, isDiscoveryEligible, isDiscoveryWindowComplete, pinFeaturedToken, sortDiscovery, type DiscoveryCandidate } from "../lib/discovery";

const base: DiscoveryCandidate = {
  address: "0x0000000000000000000000000000000000000001",
  isPonsideLaunch: false,
  marketCapUsdE18: (300_000n * 10n ** 18n).toString(),
  launchBlock: 100,
  launchTimestamp: "2026-09-01T00:00:00.000Z",
  activityCount: 1,
  tradeCount: 1,
  volumeUsdE18: null,
  changeBps: null,
  socialEngagement: 0,
};

describe("Pons token discovery", () => {
  it("hides an external Pons token below $300K", () => {
    expect(isDiscoveryEligible({ ...base, marketCapUsdE18: (299_999n * 10n ** 18n).toString() })).toBe(false);
  });

  it("shows an external Pons token at or above $300K", () => {
    expect(isDiscoveryEligible(base)).toBe(true);
  });

  it("shows a Ponside launch below $300K", () => {
    expect(isDiscoveryEligible({ ...base, isPonsideLaunch: true, marketCapUsdE18: "0" })).toBe(true);
  });

  it("allows Trending to mix Ponside and external Pons tokens using real activity", () => {
    const external = { ...base, address: "external", activityCount: 8 };
    const ponside = { ...base, address: "ponside", isPonsideLaunch: true, marketCapUsdE18: null, activityCount: 10 };
    expect(sortDiscovery([external, ponside], "trending").map((item) => item.address)).toEqual(["ponside", "external"]);
  });

  it("orders Newest by real launch block descending", () => {
    const older = { ...base, address: "older", launchBlock: 10 };
    const newer = { ...base, address: "newer", launchBlock: 20 };
    expect(sortDiscovery([older, newer], "newest").map((item) => item.address)).toEqual(["newer", "older"]);
  });

  it("orders Oldest by real launch block ascending", () => {
    const older = { ...base, address: "older", launchBlock: 10 };
    const newer = { ...base, address: "newer", launchBlock: 20 };
    expect(sortDiscovery([newer, older], "oldest").map((item) => item.address)).toEqual(["older", "newer"]);
  });

  it("uses the last 24 hours for 24H activity", () => {
    expect(discoveryWindowStart("24h", new Date("2026-09-04T12:00:00.000Z"))).toBe("2026-09-03T12:00:00.000Z");
  });

  it("uses the last 7 days for 7D activity", () => {
    expect(discoveryWindowStart("7d", new Date("2026-09-04T12:00:00.000Z"))).toBe("2026-08-28T12:00:00.000Z");
  });

  it("uses complete indexed history for ALL activity", () => {
    expect(discoveryWindowStart("all", new Date("2026-09-04T12:00:00.000Z"))).toBeNull();
  });

  it("excludes partial bootstrap history before the forward-indexing start", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    expect(effectiveDiscoveryStart("7d", "2026-09-05T10:00:00.000Z", now)).toBe("2026-09-05T10:00:00.000Z");
    expect(effectiveDiscoveryStart("24h", "2026-09-01T00:00:00.000Z", now)).toBe("2026-09-04T12:00:00.000Z");
    expect(effectiveDiscoveryStart("all", "2026-09-05T10:00:00.000Z", now)).toBe("2026-09-05T10:00:00.000Z");
  });

  it("marks 24H and 7D windows complete only after enough forward data exists", () => {
    const now = new Date("2026-09-08T12:00:00.000Z");
    expect(isDiscoveryWindowComplete("24h", "2026-09-07T11:59:59.000Z", now)).toBe(true);
    expect(isDiscoveryWindowComplete("7d", "2026-09-05T12:00:00.000Z", now)).toBe(false);
    expect(isDiscoveryWindowComplete("all", "2026-09-01T00:00:00.000Z", now)).toBe(false);
  });

  it("does not fabricate market cap when USD conversion is missing", () => {
    expect(isDiscoveryEligible({ ...base, marketCapUsdE18: null })).toBe(false);
  });
});

describe("featured token pinning", () => {
  const first = { address: "0x1111111111111111111111111111111111111111", value: 1 };
  const featured = { address: "0x2222222222222222222222222222222222222222", value: 2 };

  it("is completely dormant without a configured address", () => {
    expect(pinFeaturedToken([first, featured], null)).toEqual([first, featured]);
  });

  it("pins only a real resolved item and does not alter its data", () => {
    expect(pinFeaturedToken([first, featured], featured.address)).toEqual([featured, first]);
    expect(pinFeaturedToken([first], featured.address)).toEqual([first]);
    expect(featured.value).toBe(2);
  });
});
