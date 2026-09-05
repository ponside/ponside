import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const social = readFileSync("lib/server/social.ts", "utf8");
const market = readFileSync("lib/server/market.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260905010000_profile_visibility.sql", "utf8");

describe("database-backed profile visibility", () => {
  it("fails closed across public profile, search, follow, feed, and ranking paths", () => {
    expect(social).toContain('query = query.eq("is_public", true)');
    expect(social).toContain('(!data.is_public && viewerId !== data.id)');
    expect(social).toContain('.eq("is_public", true).or(');
    expect(social).toContain('.eq("id", followingId).eq("is_public", true)');
    expect(migration).toContain("join public.profiles author on author.id = post.author_id and author.is_public");
    expect(migration).toContain("where profile.is_public");
  });

  it("preserves private authenticated access and immutable identity fields", () => {
    expect(social).toContain("viewerId === profileId");
    expect(migration).toContain("Authentication, Privy identity, and wallet ownership are unaffected.");
    expect(migration).not.toMatch(/update\s+public\.profiles\s+set\s+(privy_user_id|x_user_id|wallet_address)/i);
    expect(migration).not.toMatch(/delete\s+from\s+public\.profiles/i);
  });

  it("excludes hidden social activity from public token ranking and creator discovery", () => {
    expect(market).toContain('rpc("get_public_token_social_engagement"');
    expect(market).toContain('.eq("is_public", true)');
    expect(migration).toContain("join public.profiles actor on actor.id = item.user_id and actor.is_public");
    expect(migration).toContain("join public.profiles reply_author on reply_author.id = reply.author_id and reply_author.is_public");
  });
});
