import "server-only";
import type { NotificationItem, Profile, SocialPost } from "@/lib/domain";
import { HttpError } from "@/lib/server/http";
import { getServiceSupabase, throwDatabaseError } from "@/lib/server/supabase";
import { canModifyResource } from "@/lib/permissions";
import { getStorageBuckets } from "@/lib/server/env";
import { getSupabaseEnv } from "@/lib/server/env";
import { createFeedCursor, parseFeedCursor } from "@/lib/pagination";

type ProfileRow = {
  id: string;
  display_name: string;
  x_handle: string;
  bio: string;
  avatar_url: string | null;
  wallet_address: string | null;
  is_public: boolean;
};

type PostRow = {
  id: string;
  author_id: string;
  content: string;
  token_address: string | null;
  reply_to_post_id: string | null;
  created_at: string;
};

type MediaRow = { id: string; post_id: string; media_url: string; media_type: string; sort_order: number };
type NotificationRow = { id: string; type: NotificationItem["type"]; actor_id: string; post_id: string | null; read_at: string | null; created_at: string };

function profileFromRow(row: ProfileRow, extras: Partial<Profile> = {}): Profile {
  return {
    id: row.id,
    name: row.display_name,
    handle: row.x_handle,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    walletAddress: row.wallet_address,
    followers: 0,
    following: 0,
    ...extras,
  };
}

async function getProfileRows(ids: string[], includeHidden = false) {
  if (!ids.length) return new Map<string, ProfileRow>();
  let query = getServiceSupabase().from("profiles").select("id, display_name, x_handle, bio, avatar_url, wallet_address, is_public").in("id", [...new Set(ids)]);
  if (!includeHidden) query = query.eq("is_public", true);
  const { data, error } = await query;
  if (error) throw new Error(`Profiles query failed: ${error.message}`);
  return new Map((data as unknown as ProfileRow[]).map((row) => [row.id, row]));
}

async function getProfileStats(ids: string[]) {
  if (!ids.length) return new Map<string, { followers: number; following: number }>();
  const { data, error } = await getServiceSupabase().rpc("get_profile_stats", { p_profile_ids: [...new Set(ids)] });
  if (error) throw new Error(`Profile stats query failed: ${error.message}`);
  return new Map((data as Array<{ profile_id: string; followers: number | string; following: number | string }>).map((row) => [row.profile_id, { followers: Number(row.followers), following: Number(row.following) }]));
}

async function relationCounts(postIds: string[]) {
  const output = new Map<string, { likes: number; reposts: number; replies: number }>();
  postIds.forEach((id) => output.set(id, { likes: 0, reposts: 0, replies: 0 }));
  if (!postIds.length) return output;
  const { data, error } = await getServiceSupabase().rpc("get_post_engagement", { p_post_ids: postIds });
  if (error) throw new Error(`Engagement query failed: ${error.message}`);
  for (const row of data as Array<{ post_id: string; likes: number | string; reposts: number | string; replies: number | string }>) {
    output.set(row.post_id, { likes: Number(row.likes), reposts: Number(row.reposts), replies: Number(row.replies) });
  }
  return output;
}

async function shapePosts(rows: PostRow[], viewerId?: string | null, includeHiddenAuthors = false): Promise<SocialPost[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [profiles, profileStats, counts, mediaResult, likedResult, repostedResult] = await Promise.all([
    getProfileRows(rows.map((row) => row.author_id), includeHiddenAuthors),
    getProfileStats(rows.map((row) => row.author_id)),
    relationCounts(ids),
    getServiceSupabase().from("post_media").select("id, post_id, media_url, media_type, sort_order").in("post_id", ids).order("sort_order"),
    viewerId ? getServiceSupabase().from("likes").select("post_id").eq("user_id", viewerId).in("post_id", ids) : Promise.resolve({ data: [], error: null }),
    viewerId ? getServiceSupabase().from("reposts").select("post_id").eq("user_id", viewerId).in("post_id", ids) : Promise.resolve({ data: [], error: null }),
  ]);
  if (mediaResult.error || likedResult.error || repostedResult.error) throw new Error(`Post relationships query failed: ${mediaResult.error?.message || likedResult.error?.message || repostedResult.error?.message}`);
  const media = mediaResult.data as unknown as MediaRow[];
  const liked = new Set((likedResult.data as Array<{ post_id: string }>).map((row) => row.post_id));
  const reposted = new Set((repostedResult.data as Array<{ post_id: string }>).map((row) => row.post_id));
  return rows.flatMap((row) => {
    const author = profiles.get(row.author_id);
    if (!author) return [];
    const count = counts.get(row.id)!;
    return [{
      id: row.id,
      body: row.content,
      createdAt: row.created_at,
      author: profileFromRow(author, { ...(profileStats.get(author.id) || { followers: 0, following: 0 }), isOwn: viewerId === author.id }),
      tokenAddress: row.token_address,
      replyToPostId: row.reply_to_post_id,
      media: media.filter((item) => item.post_id === row.id).map((item) => ({ id: item.id, url: item.media_url, type: item.media_type })),
      ...count,
      liked: liked.has(row.id),
      reposted: reposted.has(row.id),
      canDelete: viewerId === row.author_id,
    }];
  });
}

export async function listFeed(viewerId: string | null, followingOnly = false, limit = 30, cursor?: string | null) {
  const supabase = getServiceSupabase();
  const safeLimit = Math.max(1, Math.min(limit, 50));
  if (followingOnly && !viewerId) throw new HttpError(401, "AUTH_REQUIRED", "Sign in to view your following feed.");
  let parsedCursor: string | null;
  let cursorId: string | null = null;
  try {
    const parsed = parseFeedCursor(cursor);
    parsedCursor = parsed?.createdAt || null;
    cursorId = parsed?.id || null;
  } catch { throw new HttpError(400, "INVALID_CURSOR", "The feed cursor is invalid."); }
  const { data, error } = await supabase.rpc("get_feed_page", {
    // PostgreSQL accepts NULL here; generated function types do not retain argument nullability.
    p_viewer_id: viewerId as string,
    p_following_only: followingOnly,
    p_limit: safeLimit + 1,
    ...(parsedCursor ? { p_cursor_created_at: parsedCursor } : {}),
    ...(cursorId ? { p_cursor_id: cursorId } : {}),
  });
  if (error) throw new Error(`Feed query failed: ${error.message}`);
  const rows = data as unknown as PostRow[];
  const page = rows.slice(0, safeLimit);
  const last = page[page.length - 1];
  return { posts: await shapePosts(page, viewerId), nextCursor: rows.length > safeLimit && last ? createFeedCursor({ createdAt: last.created_at, id: last.id }) : null };
}

export async function getPost(postId: string, viewerId: string | null) {
  const { data, error } = await getServiceSupabase().from("posts").select("id, author_id, content, token_address, reply_to_post_id, created_at").eq("id", postId).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Post query failed: ${error.message}`);
  if (!data) throw new HttpError(404, "POST_NOT_FOUND", "This post does not exist.");
  const post = (await shapePosts([data as unknown as PostRow], viewerId))[0];
  if (!post) throw new HttpError(404, "POST_NOT_FOUND", "This post does not exist.");
  return post;
}

export async function listReplies(postId: string, viewerId: string | null) {
  const { data, error } = await getServiceSupabase().from("posts").select("id, author_id, content, token_address, reply_to_post_id, created_at").eq("reply_to_post_id", postId).is("deleted_at", null).order("created_at");
  if (error) throw new Error(`Replies query failed: ${error.message}`);
  return shapePosts(data as unknown as PostRow[], viewerId);
}

export async function createPost(input: { authorId: string; content: string; tokenAddress?: string | null; replyToPostId?: string | null; media?: Array<{ url: string; storagePath: string; type: string }> }) {
  const supabase = getServiceSupabase();
  if (input.replyToPostId) {
    const { data, error } = await supabase.from("posts").select("id").eq("id", input.replyToPostId).is("deleted_at", null).maybeSingle();
    if (error) throw new Error(`Reply target validation failed: ${error.message}`);
    if (!data) throw new HttpError(404, "POST_NOT_FOUND", "The post you are replying to does not exist.");
  }
  if (input.tokenAddress) {
    const { data, error } = await supabase.from("pons_launches").select("token_address").eq("token_address", input.tokenAddress.toLowerCase()).maybeSingle();
    if (error) throw new Error(`Token attachment validation failed: ${error.message}`);
    if (!data) throw new HttpError(400, "INVALID_TOKEN_ATTACHMENT", "Only an indexed Pons V2 token can be attached.");
  }
  if (input.media?.length) {
    const prefix = `${getSupabaseEnv().url.replace(/\/$/, "")}/storage/v1/object/public/${getStorageBuckets().postMedia}/${input.authorId}/`;
    if (input.media.some((item) => !item.storagePath.startsWith(`${input.authorId}/`) || item.url !== `${prefix}${item.storagePath.slice(input.authorId.length + 1)}`)) throw new HttpError(400, "INVALID_MEDIA_URL", "Post media must be uploaded through Ponside.");
  }
  const { data, error } = await supabase.rpc("create_post_with_media", {
    p_author_id: input.authorId,
    p_content: input.content.trim(),
    p_media: input.media || [],
    ...(input.tokenAddress ? { p_token_address: input.tokenAddress.toLowerCase() } : {}),
    ...(input.replyToPostId ? { p_reply_to_post_id: input.replyToPostId } : {}),
  }).single();
  if (error) {
    if (input.media?.length) await supabase.storage.from(getStorageBuckets().postMedia).remove(input.media.map((item) => item.storagePath));
    throwDatabaseError(error, "Post creation");
  }
  return (await shapePosts([data as unknown as PostRow], input.authorId, true))[0];
}

export async function deletePost(postId: string, profileId: string) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("posts").select("author_id, deleted_at").eq("id", postId).maybeSingle();
  if (error) throw new Error(`Post ownership query failed: ${error.message}`);
  if (!data) throw new HttpError(404, "POST_NOT_FOUND", "This post does not exist.");
  if (!canModifyResource(data.author_id, profileId)) throw new HttpError(403, "NOT_OWNER", "You cannot delete this post.");
  const { data: media, error: mediaError } = await supabase.from("post_media").select("storage_path").eq("post_id", postId);
  if (mediaError) throwDatabaseError(mediaError, "Post media lookup");
  if (!data.deleted_at) {
    const { error: updateError } = await supabase.from("posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId).is("deleted_at", null);
    if (updateError) throwDatabaseError(updateError, "Post deletion");
  }
  const storagePaths = media.map((item) => item.storage_path);
  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage.from(getStorageBuckets().postMedia).remove(storagePaths);
    if (storageError) throw new Error(`Post media cleanup failed: ${storageError.message}`);
    const { error: rowError } = await supabase.from("post_media").delete().eq("post_id", postId);
    if (rowError) throwDatabaseError(rowError, "Post media cleanup");
  }
}

export async function setPostRelation(table: "likes" | "reposts", postId: string, profileId: string, enabled: boolean) {
  const supabase = getServiceSupabase();
  const { data: post, error: postError } = await supabase.from("posts").select("id").eq("id", postId).is("deleted_at", null).maybeSingle();
  if (postError) throw new Error(`Post lookup failed: ${postError.message}`);
  if (!post) throw new HttpError(404, "POST_NOT_FOUND", "This post does not exist.");
  const result = enabled
    ? await supabase.from(table).upsert({ user_id: profileId, post_id: postId }, { onConflict: "user_id,post_id" })
    : await supabase.from(table).delete().eq("user_id", profileId).eq("post_id", postId);
  if (result.error) throwDatabaseError(result.error, `${table} mutation`);
}

export async function getProfileByHandle(handle: string, viewerId: string | null) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) throw new HttpError(404, "PROFILE_NOT_FOUND", "This profile does not exist.");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.from("profiles").select("id, display_name, x_handle, bio, avatar_url, wallet_address, is_public").ilike("x_handle", handle).maybeSingle();
  if (error) throw new Error(`Profile query failed: ${error.message}`);
  if (!data || (!data.is_public && viewerId !== data.id)) throw new HttpError(404, "PROFILE_NOT_FOUND", "This profile does not exist.");
  const row = data as unknown as ProfileRow;
  const [{ count: followers, error: followerError }, { count: following, error: followingError }, relation] = await Promise.all([
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", row.id),
    supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", row.id),
    viewerId ? supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", row.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (followerError || followingError || relation.error) throw new Error(`Profile counts query failed: ${followerError?.message || followingError?.message || relation.error?.message}`);
  return profileFromRow(row, { followers: followers || 0, following: following || 0, isFollowing: Boolean(relation.data), isOwn: viewerId === row.id });
}

export async function getOwnProfile(profileId: string) {
  const { data, error } = await getServiceSupabase().from("profiles").select("x_handle").eq("id", profileId).single();
  if (error) throw new Error(`Profile query failed: ${error.message}`);
  return getProfileByHandle(String(data.x_handle), profileId);
}

export async function updateProfile(profileId: string, input: { displayName?: string; bio?: string }) {
  const updates: { display_name?: string; bio?: string } = {};
  if (input.displayName !== undefined) updates.display_name = input.displayName.trim();
  if (input.bio !== undefined) updates.bio = input.bio.trim();
  const { data, error } = await getServiceSupabase().from("profiles").update(updates).eq("id", profileId).select("x_handle").single();
  if (error) throwDatabaseError(error, "Profile update");
  return getProfileByHandle(String(data.x_handle), profileId);
}

export async function setFollow(followingId: string, followerId: string, enabled: boolean) {
  if (followingId === followerId) throw new HttpError(400, "SELF_FOLLOW", "You cannot follow yourself.");
  const supabase = getServiceSupabase();
  const { data: target, error: targetError } = await supabase.from("profiles").select("id").eq("id", followingId).eq("is_public", true).maybeSingle();
  if (targetError) throw new Error(`Profile lookup failed: ${targetError.message}`);
  if (!target) throw new HttpError(404, "PROFILE_NOT_FOUND", "This profile does not exist.");
  const result = enabled
    ? await supabase.from("follows").upsert({ follower_id: followerId, following_id: followingId }, { onConflict: "follower_id,following_id" })
    : await supabase.from("follows").delete().eq("follower_id", followerId).eq("following_id", followingId);
  if (result.error) throwDatabaseError(result.error, "Follow mutation");
}

export async function listProfilePosts(profileId: string, viewerId: string | null, replies = false) {
  let query = getServiceSupabase().from("posts").select("id, author_id, content, token_address, reply_to_post_id, created_at").eq("author_id", profileId).is("deleted_at", null).order("created_at", { ascending: false }).limit(40);
  query = replies ? query.not("reply_to_post_id", "is", null) : query.is("reply_to_post_id", null);
  const { data, error } = await query;
  if (error) throw new Error(`Profile posts query failed: ${error.message}`);
  return shapePosts(data as unknown as PostRow[], viewerId, viewerId === profileId);
}

export async function listTokenPosts(tokenAddress: string, viewerId: string | null, limit = 50) {
  const { data, error } = await getServiceSupabase().from("posts").select("id, author_id, content, token_address, reply_to_post_id, created_at").eq("token_address", tokenAddress.toLowerCase()).is("deleted_at", null).is("reply_to_post_id", null).order("created_at", { ascending: false }).limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(`Token posts query failed: ${error.message}`);
  return shapePosts(data as unknown as PostRow[], viewerId);
}

export async function searchProfiles(query: string, limit = 10) {
  if (!query.trim()) return [];
  const escaped = query.trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").slice(0, 80);
  if (!escaped) return [];
  const { data, error } = await getServiceSupabase().from("profiles").select("id, display_name, x_handle, bio, avatar_url, wallet_address, is_public").eq("is_public", true).or(`display_name.ilike.%${escaped}%,x_handle.ilike.%${escaped}%`).limit(limit);
  if (error) throw new Error(`Profile search failed: ${error.message}`);
  const rows = data as unknown as ProfileRow[];
  const stats = await getProfileStats(rows.map((row) => row.id));
  return rows.map((row) => profileFromRow(row, stats.get(row.id) || { followers: 0, following: 0 }));
}

export async function listTrendingProfiles(viewerId: string | null, limit = 5) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc("get_trending_profile_ids", { p_limit: Math.min(limit, 20) });
  if (error) throw new Error(`Trending profiles query failed: ${error.message}`);
  const ids = (data as Array<{ profile_id: string }>).map((row) => row.profile_id);
  const [profiles, stats] = await Promise.all([getProfileRows(ids), getProfileStats(ids)]);
  let following = new Set<string>();
  if (viewerId && ids.length) {
    const { data: relations, error: relationError } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", ids);
    if (relationError) throw new Error(`Trending follow state failed: ${relationError.message}`);
    following = new Set((relations as Array<{ following_id: string }>).map((row) => row.following_id));
  }
  return ids.flatMap((id) => { const profile = profiles.get(id); return profile ? [profileFromRow(profile, { ...(stats.get(id) || { followers: 0, following: 0 }), isFollowing: following.has(id), isOwn: viewerId === id })] : []; });
}

export async function listNotifications(profileId: string) {
  const { data, error } = await getServiceSupabase().rpc("get_notifications", { p_recipient_id: profileId, p_limit: 50 });
  if (error) throw new Error(`Notifications query failed: ${error.message}`);
  const rows = data as unknown as NotificationRow[];
  const actorIds = rows.map((row) => row.actor_id);
  const [profiles, stats] = await Promise.all([getProfileRows(actorIds, true), getProfileStats(actorIds)]);
  return rows.flatMap((row): NotificationItem[] => {
    const actor = profiles.get(row.actor_id);
    return actor ? [{ id: row.id, type: row.type, actor: profileFromRow(actor, stats.get(actor.id) || { followers: 0, following: 0 }), postId: row.post_id, createdAt: row.created_at, read: Boolean(row.read_at) }] : [];
  });
}

export async function markNotificationsRead(profileId: string) {
  const { error } = await getServiceSupabase().from("notifications").update({ read_at: new Date().toISOString() }).eq("recipient_id", profileId).is("read_at", null);
  if (error) throw new Error(`Notifications update failed: ${error.message}`);
}
