import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Privy authentication integration", () => {
  it("restricts login to X and creates one primary embedded Ethereum wallet", () => {
    const provider = read("components/product/product-providers.tsx");
    expect(provider).toContain('loginMethods: ["twitter"]');
    expect(provider).toContain('createOnLogin: "all-users"');
    expect(provider).toContain('item.walletClientType === "privy" && item.walletIndex === 0');
    expect(provider).toContain("supportedChains: [robinhoodChain]");
    expect(provider).toContain("defaultChain: robinhoodChain");
  });

  it("verifies Privy tokens and binds profiles to immutable provider identifiers", () => {
    const auth = read("lib/server/auth.ts");
    expect(auth).toContain("verifyAuthToken(token)");
    expect(auth).toContain("claims.user_id");
    expect(auth).toContain("x_user_id: xUserId");
    expect(auth).toContain("wallet_index === 0");
    expect(auth).toContain("X_IDENTITY_MISMATCH");
    expect(auth).toContain("WALLET_IDENTITY_MISMATCH");
  });

  it("verifies authentication inside every protected product mutation", () => {
    const protectedMutations = [
      "app/api/auth/sync/route.ts",
      "app/api/follows/[id]/route.ts",
      "app/api/notifications/route.ts",
      "app/api/pons/launch/confirm/route.ts",
      "app/api/pons/launch/prepare/route.ts",
      "app/api/pons/quote/route.ts",
      "app/api/pons/trade/prepare/route.ts",
      "app/api/wallet/send/prepare/route.ts",
      "app/api/posts/route.ts",
      "app/api/posts/[id]/route.ts",
      "app/api/posts/[id]/like/route.ts",
      "app/api/posts/[id]/repost/route.ts",
      "app/api/profile/route.ts",
      "app/api/upload/route.ts",
    ];
    for (const path of protectedMutations) expect(read(path), path).toContain("requireAuth(request)");
  });

  it("keeps the Privy secret out of browser modules", () => {
    const browserModules = [
      "components/product/product-providers.tsx",
      "components/product/app-shell.tsx",
      "components/product/profile-view.tsx",
    ];
    for (const path of browserModules) expect(read(path), path).not.toContain("PRIVY_APP_SECRET");
  });
});
