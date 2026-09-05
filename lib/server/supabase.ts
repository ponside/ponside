import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/server/env";
import type { Database } from "@/lib/supabase/database.types";
import { HttpError } from "@/lib/server/http";

let client: SupabaseClient<Database> | undefined;

export function getServiceSupabase() {
  if (!client) {
    const { url, serviceRoleKey } = getSupabaseEnv();
    client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { "X-Client-Info": "ponside-server" } },
    });
  }
  return client;
}

export function throwDatabaseError(error: { code?: string; message?: string }, operation: string): never {
  if (error.code === "23505") throw new HttpError(409, "DATABASE_CONFLICT", "That action has already been recorded.");
  if (error.code === "23503" || error.code === "P0002") throw new HttpError(409, "RELATED_RECORD_UNAVAILABLE", "A related record is no longer available.");
  if (error.code === "23514" || error.code === "22023") throw new HttpError(400, "DATABASE_CONSTRAINT", "The requested data violates a database constraint.");
  if (error.code === "42501") throw new HttpError(403, "DATABASE_FORBIDDEN", "The database rejected this operation.");
  throw new Error(`${operation} failed: ${error.message || error.code || "database unavailable"}`);
}
