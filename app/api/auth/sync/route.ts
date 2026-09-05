import { assertSameOrigin, ok, routeError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/auth";
import { getOwnProfile } from "@/lib/server/social";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    return ok({ profile: await getOwnProfile(auth.id) });
  } catch (error) { return routeError(error, request); }
}

