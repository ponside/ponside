import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pairs = readFileSync(new URL("../lib/pons/launch-pairs.ts", import.meta.url), "utf8");
const selector = readFileSync(new URL("../components/product/launch-studio.tsx", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../app/api/assets/pairs/[asset]/route.ts", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

describe("launch pair asset identity", () => {
  it("keeps the exact supported pair set without duplicate contract addresses", () => {
    const expected = ["USDG", "NVDA", "SPCX", "MSFT", "CRCL", "HIMS", "BB", "GLD", "cbBTC", "GOOGL", "TSLA", "GME", "AAPL", "RBLX", "META", "SPY"];
    for (const symbol of expected) expect(pairs).toContain(`symbol: "${symbol}"`);
    const addresses = [...pairs.matchAll(/address: "(0x[0-9A-Fa-f]{40})"/g)].map((match) => match[1].toLowerCase());
    expect(addresses).toHaveLength(expected.length);
    expect(new Set(addresses).size).toBe(expected.length);
  });

  it("derives same-origin cached delivery and authoritative Robinhood sources from canonical addresses", () => {
    expect(pairs).toContain("/api/assets/pairs/${address.toLowerCase()}.png");
    expect(pairs).toContain("/ncw_assets/logos/${address.toLowerCase()}.png");
    expect(pairs).toContain("authoritativePairLogoSource");
    expect(proxy).toContain("authoritativePairLogoSource(asset.toLowerCase())");
    expect(proxy).toContain('cache: "force-cache"');
    expect(proxy).toContain('contentType.startsWith("image/")');
    expect(proxy).toContain('"X-Content-Type-Options": "nosniff"');
    expect(nextConfig).not.toContain("cdn.robinhood.com");
    expect(pairs).toContain('functionName: "name"');
    expect(pairs).toContain('functionName: "symbol"');
    expect(pairs).toContain('functionName: "decimals"');
    expect(pairs).toContain("symbol: liveSymbol, name: liveName, decimals: liveDecimals");
    expect(pairs).toContain("liveSymbol !== candidate.symbol");
  });

  it("uses the official Ether identity and renders high-resolution originals with failure-only fallback", () => {
    expect(pairs).toContain('symbol: "ETH"');
    expect(pairs).toContain('name: "Ether"');
    expect(pairs).toContain('logoUrl: "/api/assets/pairs/eth.svg"');
    expect(pairs).toContain('const ETH_LOGO_SOURCE = "https://ethereum.org/images/assets/svgs/eth-diamond-black.svg"');
    expect(selector).toContain('width={64} height={64} sizes="32px" quality={95} unoptimized');
    expect(selector).toContain("onError={() => setFailed(true)}");
    expect(selector).toContain("!failed && pair.logoUrl");
  });
});
