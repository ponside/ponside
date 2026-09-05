import { timingSafeEqual } from "node:crypto";
import { refreshPonsMarketDiscovery } from "@/lib/pons/discovery-refresh";
import { getDiscoveryRefreshSecret } from "@/lib/server/env";
import { HttpError, ok, routeError } from "@/lib/server/http";

export const maxDuration = 60;

function validSecret(provided: string | null, expected: string) {
  if (!provided) return false;
  const candidate = Buffer.from(provided);
  const configured = Buffer.from(expected);
  return candidate.length === configured.length && timingSafeEqual(candidate, configured);
}

export async function POST(request: Request) {
  try {
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
    if (!validSecret(provided, getDiscoveryRefreshSecret())) throw new HttpError(401, "INVALID_DISCOVERY_REFRESH_SECRET", "Discovery refresh authorization failed.");
    return ok(await refreshPonsMarketDiscovery());
  } catch (error) {
    return routeError(error, request);
  }
}
