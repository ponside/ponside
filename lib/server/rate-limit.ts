import "server-only";
import { HttpError } from "@/lib/server/http";
import { getServiceSupabase } from "@/lib/server/supabase";
import { RATE_LIMITS, type RateLimitAction } from "@/lib/rate-policy";

export async function enforceRateLimit(profileId: string, action: RateLimitAction) {
  const policy = RATE_LIMITS[action];
  const { data, error } = await getServiceSupabase().rpc("enforce_rate_limit", {
    p_profile_id: profileId,
    p_action: action,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });
  if (error) throw new Error(`Rate limit check failed: ${error.message}`);
  if (!data) throw new HttpError(429, "RATE_LIMITED", "Too many requests. Please try again shortly.");
}
