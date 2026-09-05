import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productRoot = "app/(product)";
const routeFiles = [
  "page.tsx",
  "explore/page.tsx",
  "launch/page.tsx",
  "notifications/page.tsx",
  "profile/page.tsx",
  "post/[id]/page.tsx",
  "u/[handle]/page.tsx",
  "token/[address]/page.tsx",
];

describe("production root routes", () => {
  it("exposes every product page without the temporary app prefix", () => {
    for (const route of routeFiles) expect(existsSync(`${productRoot}/${route}`), route).toBe(true);
    expect(existsSync("app/page.tsx")).toBe(false);
    expect(existsSync("app/app") ? readdirSync("app/app", { recursive: true }).length : 0).toBe(0);
  });

  it("removes the Coming Soon root experience", () => {
    expect(existsSync("components/hero.tsx")).toBe(false);
    expect(existsSync("components/abstract-background.tsx")).toBe(false);
    expect(existsSync("components/follow-x-button.tsx")).toBe(false);
    expect(readFileSync("app/layout.tsx", "utf8")).not.toMatch(/coming soon/i);
  });

  it("contains no stale application navigation under /app", () => {
    const files = [
      "components/product/app-shell.tsx",
      "components/product/explore-view.tsx",
      "components/product/launch-studio.tsx",
      "components/product/market-cards.tsx",
      "components/product/notifications-view.tsx",
      "components/product/post-card.tsx",
      "components/product/primitives.tsx",
      "components/product/product-providers.tsx",
      "components/product/wallet-actions.tsx",
    ];
    for (const file of files) expect(readFileSync(file, "utf8"), file).not.toMatch(/["'`]\/app(?:\/|["'`?#])/);
  });
});
