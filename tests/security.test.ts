import { describe, expect, it } from "vitest";
import { canModifyResource } from "../lib/permissions";
import { RATE_LIMITS } from "../lib/rate-policy";

describe("authorization and abuse policy", () => {
  it("allows only the resource owner", () => {
    expect(canModifyResource("profile-a", "profile-a")).toBe(true);
    expect(canModifyResource("profile-a", "profile-b")).toBe(false);
  });

  it("keeps transaction preparation rate limited", () => {
    expect(RATE_LIMITS.transaction.limit).toBeGreaterThan(0);
    expect(RATE_LIMITS.transaction.windowSeconds).toBeGreaterThan(0);
  });

  it("rate limits authenticated onchain quote reads", () => {
    expect(RATE_LIMITS.quote.limit).toBeGreaterThan(RATE_LIMITS.transaction.limit);
    expect(RATE_LIMITS.quote.windowSeconds).toBe(60);
  });

  it("uses a tighter upload policy than social toggles", () => {
    expect(RATE_LIMITS.upload.limit).toBeLessThan(RATE_LIMITS.social.limit);
    expect(RATE_LIMITS.upload.windowSeconds).toBeGreaterThan(RATE_LIMITS.social.windowSeconds);
  });
});
