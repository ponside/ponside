import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, ok, routeError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { createPost } from "@/lib/server/social";

const schema = z.object({ content: z.string().trim().max(2000), tokenAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(), replyToPostId: z.string().uuid().nullable().optional(), media: z.array(z.object({ url: z.string().url().max(1000), storagePath: z.string().max(200), type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]) })).max(4).optional() }).refine((value) => value.content.length > 0 || Boolean(value.media?.length), { message: "A post requires text or an image." });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    const input = schema.parse(await request.json());
    await enforceRateLimit(auth.id, input.replyToPostId ? "reply" : "post");
    return ok({ post: await createPost({ authorId: auth.id, ...input }) }, { status: 201 });
  } catch (error) { return routeError(error, request); }
}
