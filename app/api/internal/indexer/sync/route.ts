import { timingSafeEqual } from "node:crypto";
import { syncPonsIndexer } from "@/lib/pons/indexer";
import { assertSameOrigin, HttpError, ok, routeError } from "@/lib/server/http";
import { getIndexerSecret } from "@/lib/server/env";

function validSecret(provided: string | null, expected: string | undefined) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
    if (!validSecret(provided, getIndexerSecret())) throw new HttpError(401, "INVALID_INDEXER_SECRET", "Indexer authorization failed.");
    return ok(await syncPonsIndexer());
  } catch (error) { return routeError(error, request); }
}
