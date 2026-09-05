import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("public-readable product", () => {
  it("loads public resources without waiting for authentication", () => {
    const hook = read("components/product/use-resource.ts");
    expect(hook).toContain("options.requiresAuth && (!ready || !authenticated)");
    expect(hook).toContain("ready && authenticated ? await getToken() : null");
    expect(hook).not.toContain("!path || !ready ||");
  });

  it("keeps every public social and market GET route optionally authenticated or anonymous", () => {
    const optionalRoutes = [
      "app/api/feed/route.ts",
      "app/api/posts/[id]/route.ts",
      "app/api/profiles/[handle]/route.ts",
      "app/api/tokens/[address]/route.ts",
      "app/api/trending/people/route.ts",
    ];
    for (const path of optionalRoutes) expect(read(path), path).toContain("optionalAuth(request)");

    const anonymousRoutes = ["app/api/search/route.ts", "app/api/tokens/route.ts"];
    for (const path of anonymousRoutes) expect(read(path), path).not.toContain("requireAuth(request)");
  });

  it("does not place a login gate in front of Home or Explore", () => {
    expect(read("components/product/home-feed.tsx")).not.toContain("Sign in to view the feed");
    expect(read("components/product/explore-view.tsx")).not.toContain("Sign in to explore");
  });

  it("preserves the current app route and scroll context through Privy login", () => {
    const provider = read("components/product/product-providers.tsx");
    expect(provider).toContain('sessionStorage.setItem("ponside:auth-return"');
    expect(provider).toContain("window.location.pathname");
    expect(provider).toContain("window.location.assign(value.path)");
    expect(provider).toContain("window.scrollTo");
  });
});
