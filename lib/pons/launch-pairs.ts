import "server-only";
import { zeroAddress } from "viem";
import { getRobinhoodClient } from "@/lib/pons/chain";
import { factoryAbi, tokenAbi } from "@/lib/pons/contracts";
import { getChainEnv } from "@/lib/server/env";

export type LaunchPair = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  label: string;
  logoUrl: string;
};

export type PairCandidate = Omit<LaunchPair, "label">;

const ETH_LOGO_SOURCE = "https://ethereum.org/images/assets/svgs/eth-diamond-black.svg";

export const robinhoodLogoSource = (address: string) => `https://cdn.robinhood.com/ncw_assets/logos/${address.toLowerCase()}.png`;
export const robinhoodLogo = (address: string) => `/api/assets/pairs/${address.toLowerCase()}.png`;

export const customPairCandidates: PairCandidate[] = [
  { address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", symbol: "USDG", name: "Global Dollar", decimals: 6, logoUrl: robinhoodLogo("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168") },
  { address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", symbol: "NVDA", name: "NVIDIA", decimals: 18, logoUrl: robinhoodLogo("0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec") },
  { address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", symbol: "SPCX", name: "SpaceX", decimals: 18, logoUrl: robinhoodLogo("0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea") },
  { address: "0xe93237c50d904957cf27e7b1133b510c669c2e74", symbol: "MSFT", name: "Microsoft", decimals: 18, logoUrl: robinhoodLogo("0xe93237c50d904957cf27e7b1133b510c669c2e74") },
  { address: "0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5", symbol: "CRCL", name: "Circle Internet Group", decimals: 18, logoUrl: robinhoodLogo("0xdf0992e440dd0be65bd8439b609d6d4366bf1cb5") },
  { address: "0xCceE82fE024c36fA15E1005edE3E9e4787e23D09", symbol: "HIMS", name: "Hims & Hers Health", decimals: 18, logoUrl: robinhoodLogo("0xCceE82fE024c36fA15E1005edE3E9e4787e23D09") },
  { address: "0x48E39E56aCdbA37b09020C0b734A613C9a2f100A", symbol: "BB", name: "BlackBerry", decimals: 18, logoUrl: robinhoodLogo("0x48E39E56aCdbA37b09020C0b734A613C9a2f100A") },
  { address: "0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e", symbol: "GLD", name: "SPDR Gold Trust", decimals: 18, logoUrl: robinhoodLogo("0xC9a981FEE1F9DEc688bb123ccDeCc63D0deBFC4e") },
  { address: "0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8, logoUrl: robinhoodLogo("0xCEC185eB182c47d1bA1EFc84e6959e18cd620Be4") },
  { address: "0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3", symbol: "GOOGL", name: "Alphabet Class A", decimals: 18, logoUrl: robinhoodLogo("0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3") },
  { address: "0x322F0929c4625eD5bAd873c95208D54E1c003b2d", symbol: "TSLA", name: "Tesla", decimals: 18, logoUrl: robinhoodLogo("0x322F0929c4625eD5bAd873c95208D54E1c003b2d") },
  { address: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E", symbol: "GME", name: "GameStop", decimals: 18, logoUrl: robinhoodLogo("0x1b0E319c6A659F002271B69dB8A7df2F911c153E") },
  { address: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", symbol: "AAPL", name: "Apple", decimals: 18, logoUrl: robinhoodLogo("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9") },
  { address: "0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8", symbol: "RBLX", name: "Roblox", decimals: 18, logoUrl: robinhoodLogo("0xF0C4BF4C582cb3836e98394b1d4e7B7281101bE8") },
  { address: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", symbol: "META", name: "Meta Platforms", decimals: 18, logoUrl: robinhoodLogo("0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35") },
  { address: "0x117cc2133c37B721F49dE2A7a74833232B3B4C0C", symbol: "SPY", name: "SPDR S&P 500 ETF Trust", decimals: 18, logoUrl: robinhoodLogo("0x117cc2133c37B721F49dE2A7a74833232B3B4C0C") },
];

export function authoritativePairLogoSource(assetFile: string): string | null {
  if (assetFile === "eth.svg") return ETH_LOGO_SOURCE;
  const match = /^(0x[0-9a-f]{40})\.png$/.exec(assetFile);
  if (!match || !customPairCandidates.some((candidate) => candidate.address.toLowerCase() === match[1])) return null;
  return robinhoodLogoSource(match[1]);
}

export async function discoverUsableLaunchPairs(): Promise<LaunchPair[]> {
  const client = getRobinhoodClient();
  const { factoryAddress } = getChainEnv();
  const native: LaunchPair = {
    address: zeroAddress,
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    label: "Native",
    logoUrl: "/api/assets/pairs/eth.svg",
  };
  const verified = await Promise.all(customPairCandidates.map(async (candidate) => {
    try {
      const [approved, economics, decimals, symbol, name] = await Promise.all([
        client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "approvedPairTokens", args: [candidate.address] }),
        client.readContract({ address: factoryAddress, abi: factoryAbi, functionName: "pairTokenEconomics", args: [candidate.address] }),
        client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "decimals" }),
        client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "symbol" }),
        client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "name" }),
      ]);
      const liveDecimals = Number(decimals);
      const liveSymbol = symbol.trim();
      const liveName = name.trim();
      if (!approved || economics[0] === 0n || economics[1] === 0n || Number(economics[2]) !== liveDecimals || liveDecimals !== candidate.decimals || liveSymbol !== candidate.symbol || !liveName) return null;
      return { ...candidate, symbol: liveSymbol, name: liveName, decimals: liveDecimals, label: liveName } satisfies LaunchPair;
    } catch {
      return null;
    }
  }));
  return [native, ...verified.filter((pair): pair is LaunchPair => pair !== null)];
}
