import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { launchSchema, quoteSchema, sendSchema, transactionHashSchema } from "../lib/pons/validation";

describe("transaction input validation", () => {
  it("normalizes token addresses and applies quote slippage defaults", () => {
    const result = quoteSchema.parse({ tokenAddress: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e", side: "buy", amount: "1.25" });
    expect(result.tokenAddress).toBe("0x7ed598bcef8bd9edd8c97a195c6d13f40801ec7e");
    expect(result.slippageBps).toBe(100);
  });

  it("rejects exponent and negative amount notation", () => {
    expect(() => quoteSchema.parse({ tokenAddress: zeroAddress, side: "buy", amount: "1e18" })).toThrow();
    expect(() => quoteSchema.parse({ tokenAddress: zeroAddress, side: "sell", amount: "-1" })).toThrow();
  });

  it("rejects excessive slippage", () => {
    expect(() => quoteSchema.parse({ tokenAddress: zeroAddress, side: "buy", amount: "1", slippageBps: 2_001 })).toThrow();
  });

  it("uppercases a launch ticker and defaults to the native pair", () => {
    const result = launchSchema.parse({ name: "Ponside", symbol: "side", logo: "", description: "", twitter: "", website: "", launchConfigId: "0", creatorTaxBps: 0, buybackEnabled: false });
    expect(result.symbol).toBe("SIDE");
    expect(result.pairToken).toBe(zeroAddress);
    expect(result.devBuy).toBe("0");
  });

  it("rejects invalid tickers and oversized creator tax", () => {
    expect(() => launchSchema.parse({ name: "Ponside", symbol: "SIDE!", logo: "", description: "", launchConfigId: "0", creatorTaxBps: 0, buybackEnabled: false })).toThrow();
    expect(() => launchSchema.parse({ name: "Ponside", symbol: "SIDE", logo: "", description: "", launchConfigId: "0", creatorTaxBps: 10_001, buybackEnabled: false })).toThrow();
  });

  it("accepts only a full transaction hash", () => {
    expect(transactionHashSchema.safeParse(`0x${"a".repeat(64)}`).success).toBe(true);
    expect(transactionHashSchema.safeParse("0x1234").success).toBe(false);
  });

  it("validates wallet sends without allowing zero-address recipients", () => {
    const recipient = "0x1111111111111111111111111111111111111111";
    expect(sendSchema.parse({ asset: "native", recipient, amount: "0.25" })).toEqual({ asset: "native", recipient, amount: "0.25" });
    expect(() => sendSchema.parse({ asset: "native", recipient: zeroAddress, amount: "1" })).toThrow();
    expect(() => sendSchema.parse({ asset: "native", recipient, amount: "1e18" })).toThrow();
  });
});
