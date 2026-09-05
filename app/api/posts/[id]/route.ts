import { optionalAuth, requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, ok, routeError } from "@/lib/server/http";
import { deletePost, getPost, listReplies } from "@/lib/server/social";
import { enforceRateLimit } from "@/lib/server/rate-limit";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const auth = await optionalAuth(request);
    const { id } = await context.params;
    const [post, replies] = await Promise.all([getPost(id, auth?.id || null), listReplies(id, auth?.id || null)]);
    return ok({ post, replies });
  } catch (error) { return routeError(error, request); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    await enforceRateLimit(auth.id, "social");
    const { id } = await context.params;
    await deletePost(id, auth.id);
    return ok({ deleted: true });
  } catch (error) { return routeError(error, request); }
}
