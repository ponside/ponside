import { z } from "zod";
import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, HttpError, ok, routeError } from "@/lib/server/http";
import { confirmLaunch } from "@/lib/server/transactions";
import { transactionHashSchema } from "@/lib/pons/validation";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({ transactionHash: transactionHashSchema });
export async function POST(request: Request) {
  try { assertSameOrigin(request); const auth = await requireAuth(request); if (!auth.walletAddress) throw new HttpError(409, "WALLET_NOT_READY", "Your embedded wallet is still being created."); await enforceRateLimit(auth.id, "transaction"); const { transactionHash } = schema.parse(await request.json()); return ok(await confirmLaunch(transactionHash, auth.id, auth.walletAddress)); } catch (error) { return routeError(error, request); }
}
