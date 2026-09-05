import { assertSameOrigin, HttpError, ok, routeError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/auth";
import { quoteTrade } from "@/lib/server/transactions";
import { quoteSchema } from "@/lib/pons/validation";
import { enforceRateLimit } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try { assertSameOrigin(request); const auth = await requireAuth(request); if (!auth.walletAddress) throw new HttpError(409, "WALLET_NOT_READY", "Your embedded wallet is still being created."); await enforceRateLimit(auth.id, "quote"); const input = quoteSchema.parse(await request.json()); return ok(await quoteTrade(input, auth.walletAddress)); } catch (error) { return routeError(error, request); }
}
