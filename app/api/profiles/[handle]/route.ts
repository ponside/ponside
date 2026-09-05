import { optionalAuth } from "@/lib/server/auth";
import { ok, routeError } from "@/lib/server/http";
import { getProfileByHandle, listProfilePosts } from "@/lib/server/social";
import { listProfileTokens } from "@/lib/server/market";

type Context = { params: Promise<{ handle: string }> };
export async function GET(request: Request, context: Context) {
  try { const auth = await optionalAuth(request); const { handle } = await context.params; const profile = await getProfileByHandle(handle, auth?.id || null); const [posts, replies, launchResult] = await Promise.all([listProfilePosts(profile.id, auth?.id || null), listProfilePosts(profile.id, auth?.id || null, true), listProfileTokens(profile.id).then((launches) => ({ launches, launchesError: null })).catch(() => ({ launches: null, launchesError: "Onchain launch data is unavailable." }))]); return ok({ profile, posts, replies, ...launchResult }); } catch (error) { return routeError(error, request); }
}
