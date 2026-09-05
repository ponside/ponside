import { formatEther, formatUnits, isAddress, zeroAddress } from "viem";
import type { WalletAsset, WalletMarketReference } from "@/lib/domain";
import { pinFeaturedToken } from "@/lib/discovery";
import { requireAuth } from "@/lib/server/auth";
import { getRobinhoodClient } from "@/lib/pons/chain";
import { tokenAbi } from "@/lib/pons/contracts";
import { HttpError, ok, routeError } from "@/lib/server/http";
import { getServiceSupabase } from "@/lib/server/supabase";
import { getFeaturedTokenAddress } from "@/lib/server/env";

export async function GET(request: Request) {
  try {
    const auth = await requireAuth(request);
    if (!auth.walletAddress) throw new HttpError(409, "WALLET_NOT_READY", "Your embedded wallet is still being created. Please try again.");
    const client = getRobinhoodClient();
    const native = await client.getBalance({ address: auth.walletAddress });
    const tokenAddress = new URL(request.url).searchParams.get("token");
    let token = null;
    let pair = null;
    if (tokenAddress) {
      if (!isAddress(tokenAddress)) throw new HttpError(400, "INVALID_ADDRESS", "The token address is invalid.");
      const address = tokenAddress as `0x${string}`;
      const { data: launch, error } = await getServiceSupabase().from("pons_launches").select("pair_token, pair_token_symbol, pair_token_decimals").eq("token_address", address.toLowerCase()).maybeSingle();
      if (error) throw new Error(`Quote-asset lookup failed: ${error.message}`);
      if (!launch) throw new HttpError(404, "TOKEN_NOT_FOUND", "This token is not indexed by Ponside.");
      const [balance, symbol, decimals] = await Promise.all([
        client.readContract({ address, abi: tokenAbi, functionName: "balanceOf", args: [auth.walletAddress] }),
        client.readContract({ address, abi: tokenAbi, functionName: "symbol" }),
        client.readContract({ address, abi: tokenAbi, functionName: "decimals" }),
      ]);
      token = { address, raw: balance.toString(), formatted: formatUnits(balance, decimals), symbol, decimals: Number(decimals) };
      if (launch.pair_token !== zeroAddress) {
        const pairAddress = launch.pair_token as `0x${string}`;
        const pairBalance = await client.readContract({ address: pairAddress, abi: tokenAbi, functionName: "balanceOf", args: [auth.walletAddress] });
        if (launch.pair_token_decimals === null || launch.pair_token_symbol === null) throw new HttpError(503, "TOKEN_INDEXING", "The quote asset metadata has not finished indexing.");
        pair = { address: pairAddress, raw: pairBalance.toString(), formatted: formatUnits(pairBalance, launch.pair_token_decimals), symbol: launch.pair_token_symbol, decimals: launch.pair_token_decimals };
      }
    }
    let portfolio: WalletAsset[] | null = null;
    if (new URL(request.url).searchParams.get("portfolio") === "1") {
      type Row = { token_address: string; token_name: string | null; token_symbol: string | null; token_decimals: number; token_logo_url: string | null; pair_token: string; pair_token_symbol: string | null; pair_token_decimals: number | null; phase: number };
      const rows: Row[] = [];
      for (let offset = 0; ; offset += 1_000) {
        const { data, error } = await getServiceSupabase().from("pons_launches").select("token_address, token_name, token_symbol, token_decimals, token_logo_url, pair_token, pair_token_symbol, pair_token_decimals, phase").not("token_decimals", "is", null).order("launch_block", { ascending: true }).range(offset, offset + 999);
        if (error) throw new Error(`Portfolio token query failed: ${error.message}`);
        const page = data as Row[];
        rows.push(...page);
        if (page.length < 1_000) break;
      }
      const candidates = new Map<string, { address: `0x${string}`; logoUrl: string | null; market: WalletMarketReference | null }>();
      for (const row of rows) {
        const market = row.token_name && row.token_symbol && row.pair_token_decimals !== null && row.pair_token_symbol ? {
          tokenAddress: row.token_address,
          tokenName: row.token_name,
          tokenSymbol: row.token_symbol,
          tokenDecimals: row.token_decimals,
          tokenLogoUrl: row.token_logo_url,
          pairAddress: row.pair_token,
          pairSymbol: row.pair_token === zeroAddress ? "ETH" : row.pair_token_symbol,
          pairDecimals: row.pair_token_decimals,
          phase: row.phase,
        } satisfies WalletMarketReference : null;
        candidates.set(row.token_address.toLowerCase(), { address: row.token_address as `0x${string}`, logoUrl: row.token_logo_url, market });
        if (row.pair_token !== zeroAddress && !candidates.has(row.pair_token.toLowerCase())) candidates.set(row.pair_token.toLowerCase(), { address: row.pair_token as `0x${string}`, logoUrl: null, market: null });
      }
      const balances: WalletAsset[] = [];
      const values = [...candidates.values()];
      for (let offset = 0; offset < values.length; offset += 40) {
        const settled = await Promise.allSettled(values.slice(offset, offset + 40).map(async (candidate): Promise<WalletAsset> => {
          const [balance, name, symbol, decimalsValue] = await Promise.all([
            client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "balanceOf", args: [auth.walletAddress!] }),
            client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "name" }),
            client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "symbol" }),
            client.readContract({ address: candidate.address, abi: tokenAbi, functionName: "decimals" }),
          ]);
          const decimals = Number(decimalsValue);
          return { kind: "erc20", address: candidate.address.toLowerCase(), raw: balance.toString(), formatted: formatUnits(balance, decimals), name, symbol, decimals, logoUrl: candidate.logoUrl, market: candidate.market };
        }));
        for (const result of settled) if (result.status === "fulfilled" && BigInt(result.value.raw) > 0n) balances.push(result.value);
      }
      portfolio = pinFeaturedToken(balances, getFeaturedTokenAddress());
    }
    return ok({ walletAddress: auth.walletAddress, native: { kind: "native", address: null, raw: native.toString(), formatted: formatEther(native), name: "Ether", symbol: "ETH", decimals: 18, logoUrl: null, market: null }, token, pair, portfolio });
  } catch (error) { return routeError(error, request); }
}
