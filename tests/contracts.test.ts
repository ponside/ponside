import { describe, expect, it } from "vitest";
import { getAbiItem, toFunctionSelector } from "viem";
import { curveAbi, factoryAbi, tokenAbi } from "../lib/pons/contracts";

describe("authoritative Pons V2 integration ABI", () => {
  it("keys the opening-tax read to the receiving wallet", () => {
    const item = getAbiItem({ abi: curveAbi, name: "currentSnipeTaxBps" });
    expect(toFunctionSelector(item)).toBe(toFunctionSelector("currentSnipeTaxBps(address)"));
  });

  it("includes both quote-asset approval and decimal-aware economics reads", () => {
    expect(getAbiItem({ abi: factoryAbi, name: "approvedPairTokens" }).name).toBe("approvedPairTokens");
    const item = getAbiItem({ abi: factoryAbi, name: "pairTokenEconomics" });
    expect(toFunctionSelector(item)).toBe(toFunctionSelector("pairTokenEconomics(address)"));
  });

  it("includes the standard ERC-20 transfer used by wallet sends", () => {
    expect(toFunctionSelector(getAbiItem({ abi: tokenAbi, name: "transfer" }))).toBe(toFunctionSelector("transfer(address,uint256)"));
  });
});
