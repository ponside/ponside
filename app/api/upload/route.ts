import { requireAuth } from "@/lib/server/auth";
import { getStorageBuckets } from "@/lib/server/env";
import { assertSameOrigin, HttpError, ok, routeError } from "@/lib/server/http";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getServiceSupabase } from "@/lib/server/supabase";
import { extensionMatchesMime, matchesImageSignature } from "@/lib/media";

const allowedPost = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const allowedLogo = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await requireAuth(request);
    await enforceRateLimit(auth.id, "upload");
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > 9_000_000) throw new HttpError(413, "FILE_TOO_LARGE", "The upload request is too large.");
    const form = await request.formData();
    const file = form.get("file");
    const purpose = form.get("purpose") === "token-logo" ? "token-logo" : "post-media";
    if (!(file instanceof File)) throw new HttpError(400, "FILE_REQUIRED", "Choose an image to upload.");
    const allowed = purpose === "token-logo" ? allowedLogo : allowedPost;
    const limit = purpose === "token-logo" ? 5_242_880 : 8_388_608;
    if (!allowed.has(file.type)) throw new HttpError(415, "UNSUPPORTED_MEDIA", "Use a JPEG, PNG, WebP, or supported GIF image.");
    if (!extensionMatchesMime(file.name, file.type)) throw new HttpError(415, "INVALID_EXTENSION", "The filename extension does not match the image format.");
    if (file.size <= 0 || file.size > limit) throw new HttpError(413, "FILE_TOO_LARGE", `The image must be smaller than ${limit / 1_048_576} MB.`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!matchesImageSignature(bytes, file.type)) throw new HttpError(415, "INVALID_MEDIA", "The uploaded file does not match its declared image format.");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const bucket = purpose === "token-logo" ? getStorageBuckets().tokenLogos : getStorageBuckets().postMedia;
    const path = `${auth.id}/${crypto.randomUUID()}.${extension}`;
    const supabase = getServiceSupabase();
    const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return ok({ url: data.publicUrl, storagePath: path, type: file.type });
  } catch (error) { return routeError(error, request); }
}
