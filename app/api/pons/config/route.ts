import { optionalAuth } from "@/lib/server/auth";
import { ok, routeError } from "@/lib/server/http";
import { listLaunchConfiguration } from "@/lib/server/transactions";

export async function GET(request: Request) {
  try { const auth = await optionalAuth(request); return ok(await listLaunchConfiguration(auth?.walletAddress)); } catch (error) { return routeError(error, request); }
}

