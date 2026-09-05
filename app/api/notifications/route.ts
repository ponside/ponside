import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, ok, routeError } from "@/lib/server/http";
import { listNotifications, markNotificationsRead } from "@/lib/server/social";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function GET(request: Request) {
  try { const auth = await requireAuth(request); return ok({ notifications: await listNotifications(auth.id) }); } catch (error) { return routeError(error, request); }
}
export async function PATCH(request: Request) {
  try { assertSameOrigin(request); const auth = await requireAuth(request); await enforceRateLimit(auth.id, "social"); await markNotificationsRead(auth.id); return ok({ read: true }); } catch (error) { return routeError(error, request); }
}
