import { ok, routeError } from "@/lib/server/http";
import { searchProfiles } from "@/lib/server/social";
import { listTokens } from "@/lib/server/market";

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q")?.slice(0, 80) || "";
    const [profiles, tokens] = await Promise.all([searchProfiles(query), listTokens(query, 10)]);
    return ok({ profiles, tokens });
  } catch (error) { return routeError(error, request); }
}

