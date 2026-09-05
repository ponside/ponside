import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationDirectory = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationDirectory).filter((name) => name.endsWith(".sql")).sort();
if (!migrations.length) throw new Error("No Supabase migrations were found.");
const sql = migrations.map((name) => readFileSync(join(migrationDirectory, name), "utf8")).join("\n");

function requireMatch(pattern, label) {
  if (!pattern.test(sql)) throw new Error(`Supabase validation failed: ${label}.`);
}

requireMatch(/^\s*begin;/i, "migration chain must begin transactionally");
requireMatch(/commit;\s*$/i, "migration chain must commit");
requireMatch(/create extension if not exists pg_trgm;/i, "trigram search extension is missing");

const tables = ["profiles", "posts", "post_media", "likes", "reposts", "follows", "notifications", "pons_launches", "pons_market_snapshots", "pons_trades", "pons_curve_events", "indexer_state", "rate_limit_events"];
for (const table of tables) {
  requireMatch(new RegExp(`create table public\\.${table}\\s*\\(`, "i"), `${table} table is missing`);
  requireMatch(new RegExp(`alter table public\\.${table} enable row level security;`, "i"), `${table} does not enable RLS`);
}

for (const forbidden of [/\bdrop\s+table\b/i, /\btruncate\b/i, /\bdelete\s+from\s+public\.(profiles|posts|pons_launches|pons_trades)\b/i]) {
  if (forbidden.test(sql)) throw new Error(`Supabase validation failed: destructive SQL matched ${forbidden}.`);
}

for (const match of sql.matchAll(/create function\s+([\w.]+)\s*\([^]*?\)\s*returns[^]*?\$\$;/gi)) {
  const block = match[0];
  if (/security definer/i.test(block) && !/set search_path = pg_catalog, public/i.test(block)) {
    throw new Error(`Supabase validation failed: ${match[1]} is SECURITY DEFINER without a fixed search_path.`);
  }
}

requireMatch(/primary key \(tx_hash, log_index\)/i, "event deduplication key is missing");
requireMatch(/quote_amount text not null/i, "blockchain amounts must stay lossless through PostgREST");
requireMatch(/revoke all on all tables in schema public from anon, authenticated;/i, "browser table grants are not explicitly restricted");
requireMatch(/revoke create on schema public from public;/i, "untrusted roles can create objects in the privileged function search path");
if (/grant execute on all functions in schema public to service_role;/i.test(sql)) throw new Error("Supabase validation failed: service role has an unnecessarily broad function grant.");
requireMatch(/create policy posts_public_read[\s\S]*using \(deleted_at is null\)/i, "soft-deleted posts are not hidden by RLS");
requireMatch(/create function public\.enforce_rate_limit[\s\S]*pg_advisory_xact_lock/i, "rate limiter is not atomic");
requireMatch(/create function public\.advance_indexer_state[\s\S]*greatest\(public\.indexer_state\.last_processed_block/i, "indexer state is not monotonic");
requireMatch(/create function public\.create_post_with_media/i, "transactional post creation is missing");
requireMatch(/create function public\.record_verified_launch_activity/i, "transactional launch activity is missing");
requireMatch(/add column is_ponside_launch boolean not null default false/i, "verified Ponside launch origin is missing");
requireMatch(/create function public\.get_token_discovery_metrics/i, "windowed real discovery metrics are missing");
requireMatch(/create index pons_trades_token_timestamp_idx/i, "windowed token trade index is missing");
requireMatch(/create function public\.get_token_market_snapshot_metrics/i, "official market snapshot metrics are missing");
requireMatch(/create function public\.invoke_pons_discovery_refresh/i, "scheduled discovery refresh helper is missing");
if (/cron\.schedule\(/i.test(sql)) throw new Error("Supabase validation failed: production Cron must not activate inside the additive schema migration.");

console.log(`Supabase static validation passed: ${migrations.length} migration, ${tables.length} RLS tables, no destructive production SQL.`);
