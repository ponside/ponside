import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, HttpError, ok, routeError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { prepareTrade } from "@/lib/server/transactions";
import { quoteSchema } from "@/lib/pons/validation";

export async function POST(request: Request) {
  try { assertSameOrigin(request); const auth = await requireAuth(request); if (!auth.walletAddress) throw new HttpError(409, "WALLET_NOT_READY", "Your embedded wallet is still being created."); await enforceRateLimit(auth.id, "transaction"); const input = quoteSchema.parse(await request.json()); return ok(await prepareTrade(input, auth.walletAddress)); } catch (error) { return routeError(error, request); }
}
