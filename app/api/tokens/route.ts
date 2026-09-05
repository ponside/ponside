import { ok, routeError } from "@/lib/server/http";
import { listTokens } from "@/lib/server/market";
import type { DiscoverySort, DiscoveryWindow } from "@/lib/discovery";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = params.get("q")?.slice(0, 80) || "";
    const requestedSort = params.get("sort");
    const requestedWindow = params.get("window");
    const sort: DiscoverySort = requestedSort === "newest" || requestedSort === "oldest" ? requestedSort : "trending";
    const window: DiscoveryWindow = requestedWindow === "24h" || requestedWindow === "7d" ? requestedWindow : "all";
    return ok({ tokens: await listTokens(query, 20, sort, window) });
  } catch (error) { return routeError(error, request); }
}
