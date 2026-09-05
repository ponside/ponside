import { optionalAuth } from "@/lib/server/auth";
import { ok, routeError } from "@/lib/server/http";
import { listTrendingProfiles } from "@/lib/server/social";

export async function GET(request: Request) {
  try { const auth = await optionalAuth(request); return ok({ profiles: await listTrendingProfiles(auth?.id || null) }); } catch (error) { return routeError(error, request); }
}
