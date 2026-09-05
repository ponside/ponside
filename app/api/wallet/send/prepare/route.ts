import { sendSchema } from "@/lib/pons/validation";
import { requireAuth } from "@/lib/server/auth";
import { assertSameOrigin, HttpError, ok, routeError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { prepareWalletSend } from "@/lib/server/wallet";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    if (!auth.walletAddress) throw new HttpError(409, "WALLET_NOT_READY", "Your embedded wallet is still being created.");
    await enforceRateLimit(auth.id, "transaction");
    const input = sendSchema.parse(await request.json());
    return ok(await prepareWalletSend(input, auth.walletAddress));
  } catch (error) {
    return routeError(error, request);
  }
}
