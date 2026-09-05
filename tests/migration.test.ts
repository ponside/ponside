import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const directory = join(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(directory).filter((name) => name.endsWith(".sql")).sort();
const sql = migrations.map((name) => readFileSync(join(directory, name), "utf8")).join("\n");

describe("fresh Supabase schema", () => {
  it("has ordered transactional migrations", () => {
    expect(migrations).toEqual(["20260904000000_production_schema.sql", "20260904010000_token_discovery.sql", "20260905000000_market_discovery_refresh.sql", "20260905010000_profile_visibility.sql"]);
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("enables RLS on every production table", () => {
    for (const table of ["profiles", "posts", "post_media", "likes", "reposts", "follows", "notifications", "pons_launches", "pons_market_snapshots", "pons_trades", "pons_curve_events", "indexer_state", "rate_limit_events"]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
    }
  });

  it("deduplicates indexed events by transaction hash and log index", () => {
    expect(sql).toMatch(/create table public\.pons_trades[\s\S]*?primary key \(tx_hash, log_index\)/);
    expect(sql).toMatch(/create table public\.pons_curve_events[\s\S]*?primary key \(tx_hash, log_index\)/);
  });

  it("enforces social identity and relationship integrity", () => {
    expect(sql).toMatch(/privy_user_id text not null unique/);
    expect(sql).toMatch(/x_user_id text unique/);
    expect(sql).toMatch(/wallet_address text not null/);
    expect(sql).toContain("constraint profiles_x_identity_pair");
    expect(sql).toContain("constraint follows_no_self_follow");
    expect(sql).toMatch(/create table public\.likes[\s\S]*?primary key \(user_id, post_id\)/);
    expect(sql).toMatch(/create table public\.reposts[\s\S]*?primary key \(user_id, post_id\)/);
    expect(sql).toContain("x_user_id is immutable once assigned");
    expect(sql).toContain("add column is_public boolean not null default true");
    expect(sql).toContain("where profile.is_public");
  });

  it("supports atomic posts with validated durable media references", () => {
    expect(sql).toMatch(/create table public\.post_media[\s\S]*?storage_path text not null/);
    expect(sql).toContain("constraint post_media_order check (sort_order between 0 and 3)");
    expect(sql).toContain("create function public.create_post_with_media");
    expect(sql).toContain("a post requires text or media");
    expect(sql).toContain("reply_to_post_id uuid references public.posts(id) on delete restrict");
  });

  it("preserves blockchain integers as canonical base-unit strings", () => {
    for (const column of ["total_supply", "launch_config_id", "graduation_threshold", "quote_amount", "token_amount", "fee_amount", "creator_tax_amount"]) {
      expect(sql).toMatch(new RegExp(`${column} text`));
    }
    expect(sql).toContain("[0-9]{0,77}");
    expect(sql).not.toMatch(/(quote_amount|token_amount|fee_amount|creator_tax_amount) (real|float|double precision)/i);
  });

  it("uses stable feed pagination and aggregate RPCs", () => {
    expect(sql).toContain("create function public.get_feed_page");
    expect(sql).toContain("post.created_at = p_cursor_created_at and post.id < p_cursor_id");
    expect(sql).toContain("create function public.get_post_engagement");
    expect(sql).toContain("posts_count bigint");
    expect(sql).toContain("launches_count bigint");
  });

  it("makes launch and indexer progression monotonic and transactional", () => {
    expect(sql).toContain("create function public.record_verified_launch_activity");
    expect(sql).toContain("create function public.advance_launch_phase");
    expect(sql).toContain("phase = greatest(phase, p_phase)");
    expect(sql).toContain("last_processed_block = greatest(public.indexer_state.last_processed_block, excluded.last_processed_block)");
  });

  it("separates protocol indexing from public token discovery", () => {
    expect(sql).toContain("add column is_ponside_launch boolean not null default false");
    expect(sql).toContain("is_ponside_launch = true");
    expect(sql).toContain("create function public.get_token_discovery_metrics");
    expect(sql).toContain("p_since timestamptz default null");
    expect(sql).not.toMatch(/delete from public\.pons_launches/i);
  });

  it("uses official market snapshots and a five-minute refresh without historical backfill", () => {
    expect(sql).toContain("create table public.pons_market_snapshots");
    expect(sql).toContain("create function public.get_token_market_snapshot_metrics");
    expect(sql).toContain("create function public.invoke_pons_discovery_refresh");
    expect(sql).toContain("extensions.gen_random_bytes(32)");
    expect(sql).toContain("vault.create_secret");
    expect(sql).toContain("ponside_discovery_refresh_url");
    expect(sql).toContain("ponside_discovery_refresh_secret");
    expect(sql).not.toContain("cron.schedule(");
  });

  it("creates deduplicated notifications without exposing deleted post activity", () => {
    expect(sql).toContain("create function public.notify_mentions()");
    expect(sql).toContain("where profile.id <> new.author_id");
    expect(sql).toContain("create unique index notifications_unique_action_idx");
    expect(sql).toContain("create function public.get_notifications");
    expect(sql).toContain("post.deleted_at is null");
  });

  it("keeps browser writes and system reads closed", () => {
    expect(sql).toContain("revoke all on all tables in schema public from anon, authenticated;");
    expect(sql).toContain("revoke execute on all functions in schema public from anon, authenticated;");
    expect(sql).not.toContain("grant execute on all functions in schema public to service_role;");
    expect(sql).not.toMatch(/create policy .* for (insert|update|delete|all) to (anon|authenticated)/i);
  });

  it("has no production seed identities or destructive table operations", () => {
    expect(sql).not.toMatch(/\bdrop table\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/insert into public\.(profiles|likes|reposts|follows|pons_launches|pons_trades)\b/i);
  });

  it("keeps privileged mutation helpers restricted to the service role", () => {
    expect(sql).toContain("revoke create on schema public from public;");
    expect(sql).not.toMatch(/security definer\s+set search_path = public/i);
    for (const signature of ["advance_indexer_state(text, bigint)", "advance_launch_phase(text, smallint, bigint, bigint)", "create_post_with_media(uuid, text, text, uuid, jsonb)", "record_verified_launch_activity(text, text, uuid, text, text)", "enforce_rate_limit(uuid, text, integer, integer)", "backfill_launch_creators()", "invoke_pons_discovery_refresh()"]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
  });
});
