import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, ok, routeError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getOwnProfile, listProfilePosts, updateProfile } from "@/lib/server/social";
import { listProfileTokens } from "@/lib/server/market";

const schema = z.object({ displayName: z.string().trim().min(1).max(80).optional(), bio: z.string().trim().max(300).optional() }).refine((value) => Object.keys(value).length > 0, "No profile changes were provided.");
export async function GET(request: Request) {
  try { const auth = await requireAuth(request); const [profile, posts, launchResult] = await Promise.all([getOwnProfile(auth.id), listProfilePosts(auth.id, auth.id), listProfileTokens(auth.id).then((launches) => ({ launches, launchesError: null })).catch(() => ({ launches: null, launchesError: "Onchain launch data is unavailable." }))]); return ok({ profile, posts, ...launchResult }); } catch (error) { return routeError(error, request); }
}
export async function PATCH(request: Request) {
  try { assertSameOrigin(request); const auth = await requireAuth(request); await enforceRateLimit(auth.id, "profile"); const input = schema.parse(await request.json()); return ok({ profile: await updateProfile(auth.id, input) }); } catch (error) { return routeError(error, request); }
}
