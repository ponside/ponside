import { ok, routeError } from "@/lib/server/http";
import { optionalAuth } from "@/lib/server/auth";
import { listFeed } from "@/lib/server/social";

export async function GET(request: Request) {
  try {
    const auth = await optionalAuth(request);
    const url = new URL(request.url);
    const following = url.searchParams.get("mode") === "following";
    const limit = Number(url.searchParams.get("limit") || "30");
    return ok(await listFeed(auth?.id || null, following, Number.isFinite(limit) ? limit : 30, url.searchParams.get("cursor")));
  } catch (error) { return routeError(error, request); }
}
