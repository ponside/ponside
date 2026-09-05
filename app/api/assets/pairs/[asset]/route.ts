import { authoritativePairLogoSource } from "@/lib/pons/launch-pairs";

type Context = { params: Promise<{ asset: string }> };

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=2592000, s-maxage=31536000, stale-while-revalidate=31536000";

export const runtime = "nodejs";

export async function GET(_request: Request, context: Context) {
  const { asset } = await context.params;
  const source = authoritativePairLogoSource(asset.toLowerCase());
  if (!source) return new Response("Not found", { status: 404 });

  try {
    const upstream = await fetch(source, {
      cache: "force-cache",
      next: { revalidate: 2_592_000 },
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = upstream.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
    const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
    if (!upstream.ok || !contentType.startsWith("image/") || declaredLength > MAX_LOGO_BYTES) {
      return new Response("Authoritative logo unavailable", { status: 502 });
    }

    const bytes = await upstream.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_LOGO_BYTES) {
      return new Response("Authoritative logo unavailable", { status: 502 });
    }

    return new Response(bytes, {
      headers: {
        "Cache-Control": CACHE_CONTROL,
        "Content-Type": contentType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Authoritative logo unavailable", { status: 502 });
  }
}
