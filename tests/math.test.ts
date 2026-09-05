import { describe, expect, it } from "vitest";
import { ceilDiv, constantProductIn, constantProductOut, deductBps, minAfterSlippage, normalizedPriceRaw, progressBps, quoteCurveBuy, quoteCurveBuyDetailed, quoteCurveSell, spotPriceRaw } from "../lib/pons/math";

describe("Pons curve math", () => {
  it("rounds division upward only when needed", () => {
    expect(ceilDiv(10n, 5n)).toBe(2n);
    expect(ceilDiv(11n, 5n)).toBe(3n);
  });

  it("uses constant product pricing with integer precision", () => {
    expect(constantProductOut(100n, 1_000n, 1_000n)).toBe(90n);
    expect(constantProductIn(90n, 1_000n, 1_000n)).toBe(99n);
  });

  it("returns zero for an empty input", () => {
    expect(constantProductOut(0n, 1_000n, 1_000n)).toBe(0n);
  });

  it("deducts each fee independently using basis points", () => {
    expect(deductBps(10_000n, 100n, 200n)).toBe(9_700n);
  });

  it("quotes a buy after curve, creator, and opening taxes", () => {
    const out = quoteCurveBuy({ quoteIn: 10_000n, quoteReserve: 100_000n, tokenReserve: 1_000_000n, sellableTokens: 900_000n, feeBps: 100n, creatorTaxBps: 100n, snipeTaxBps: 300n });
    expect(out).toBe(constantProductOut(9_500n, 100_000n, 1_000_000n));
  });

  it("clamps a finishing buy to sellable supply", () => {
    expect(quoteCurveBuy({ quoteIn: 1_000_000n, quoteReserve: 1n, tokenReserve: 1_000n, sellableTokens: 25n, feeBps: 0n, creatorTaxBps: 0n, snipeTaxBps: 0n })).toBe(25n);
  });

  it("reprices a finishing buy and reports the unused quote refund", () => {
    const quote = quoteCurveBuyDetailed({ quoteIn: 1_000_000n, quoteReserve: 1_000n, tokenReserve: 10_000n, sellableTokens: 100n, feeBps: 100n, creatorTaxBps: 100n, snipeTaxBps: 0n });
    expect(quote.tokensOut).toBe(100n);
    expect(quote.rateTokensOut).toBeGreaterThan(quote.tokensOut);
    expect(quote.quoteSpent).toBeLessThan(1_000_000n);
    expect(quote.quoteRefund).toBe(1_000_000n - quote.quoteSpent);
  });

  it("caps opening tax so a buy always retains one percent after fixed fees", () => {
    const quote = quoteCurveBuyDetailed({ quoteIn: 10_000n, quoteReserve: 10_000n, tokenReserve: 100_000n, sellableTokens: 100_000n, feeBps: 100n, creatorTaxBps: 100n, snipeTaxBps: 20_000n });
    expect(quote.snipeTaxBps).toBe(9_700n);
    expect(quote.tokensOut).toBeGreaterThan(0n);
  });

  it("quotes a sell and subtracts trade fees", () => {
    const gross = constantProductOut(10_000n, 1_000_000n, 100_000n);
    expect(quoteCurveSell({ tokensIn: 10_000n, quoteReserve: 100_000n, tokenReserve: 1_000_000n, feeBps: 100n, creatorTaxBps: 100n })).toBe(deductBps(gross, 100n, 100n));
  });

  it("applies minimum output slippage with bigint arithmetic", () => {
    expect(minAfterSlippage(1_000_000n, 100n)).toBe(990_000n);
  });

  it("caps graduation progress at 100 percent", () => {
    expect(progressBps(12_000n, 10_000n)).toBe(10_000);
  });

  it("normalizes spot price to a chosen precision", () => {
    expect(spotPriceRaw(5n, 10n, 18)).toBe(500_000_000_000_000_000n);
    expect(spotPriceRaw(5n, 0n, 18)).toBeNull();
  });

  it("normalizes quote and token decimals before displaying price", () => {
    expect(normalizedPriceRaw(2_000_000n, 4_000_000_000_000_000_000n, 6, 18)).toBe(500_000_000_000_000_000n);
  });
});
