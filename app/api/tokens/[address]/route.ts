import { optionalAuth } from "@/lib/server/auth";
import { ok, routeError } from "@/lib/server/http";
import { getTokenMarket, listTokenTrades } from "@/lib/server/market";
import { listTokenPosts } from "@/lib/server/social";

type Context = { params: Promise<{ address: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const auth = await optionalAuth(request);
    const { address } = await context.params;
    const [token, trades, posts] = await Promise.all([getTokenMarket(address), listTokenTrades(address), listTokenPosts(address, auth?.id || null)]);
    return ok({ token, trades, posts });
  } catch (error) { return routeError(error, request); }
}
