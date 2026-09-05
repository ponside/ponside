import { ok, routeError } from "@/lib/server/http";
import { productConfigurationStatus } from "@/lib/server/env";

export async function GET(request: Request) {
  try { return ok(productConfigurationStatus()); } catch (error) { return routeError(error, request); }
}

