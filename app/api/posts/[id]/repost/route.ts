import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, ok, routeError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { setPostRelation } from "@/lib/server/social";

type Context = { params: Promise<{ id: string }> };
async function mutate(request: Request, context: Context, enabled: boolean) {
  try { assertSameOrigin(request); const auth = await requireAuth(request); await enforceRateLimit(auth.id, "social"); const { id } = await context.params; await setPostRelation("reposts", id, auth.id, enabled); return ok({ reposted: enabled }); } catch (error) { return routeError(error, request); }
}
export function POST(request: Request, context: Context) { return mutate(request, context, true); }
export function DELETE(request: Request, context: Context) { return mutate(request, context, false); }

