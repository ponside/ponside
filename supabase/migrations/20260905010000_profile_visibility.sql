begin;

alter table public.profiles
  add column is_public boolean not null default true;

comment on column public.profiles.is_public is
  'Service-controlled public discovery visibility. Authentication, Privy identity, and wallet ownership are unaffected.';

create index profiles_public_discovery_idx
  on public.profiles (created_at, id)
  where is_public;

create or replace function public.get_feed_page(
  p_viewer_id uuid,
  p_following_only boolean,
  p_limit integer,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  author_id uuid,
  content text,
  token_address text,
  reply_to_post_id uuid,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select post.id, post.author_id, post.content, post.token_address, post.reply_to_post_id, post.created_at
  from public.posts post
  join public.profiles author on author.id = post.author_id and author.is_public
  where post.deleted_at is null
    and post.reply_to_post_id is null
    and (
      not p_following_only
      or post.author_id = p_viewer_id
      or exists (
        select 1 from public.follows relation
        where relation.follower_id = p_viewer_id
          and relation.following_id = post.author_id
      )
    )
    and (
      p_cursor_created_at is null
      or post.created_at < p_cursor_created_at
      or (post.created_at = p_cursor_created_at and post.id < p_cursor_id)
    )
  order by post.created_at desc, post.id desc
  limit greatest(1, least(p_limit, 51));
$$;

create or replace function public.get_post_engagement(p_post_ids uuid[])
returns table (post_id uuid, likes bigint, reposts bigint, replies bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select requested.post_id,
    (select count(*) from public.likes item
      join public.profiles actor on actor.id = item.user_id and actor.is_public
      join public.posts target on target.id = item.post_id and target.deleted_at is null
      join public.profiles author on author.id = target.author_id and author.is_public
      where item.post_id = requested.post_id)::bigint,
    (select count(*) from public.reposts item
      join public.profiles actor on actor.id = item.user_id and actor.is_public
      join public.posts target on target.id = item.post_id and target.deleted_at is null
      join public.profiles author on author.id = target.author_id and author.is_public
      where item.post_id = requested.post_id)::bigint,
    (select count(*) from public.posts reply
      join public.profiles reply_author on reply_author.id = reply.author_id and reply_author.is_public
      join public.posts target on target.id = reply.reply_to_post_id and target.deleted_at is null
      join public.profiles author on author.id = target.author_id and author.is_public
      where reply.reply_to_post_id = requested.post_id and reply.deleted_at is null)::bigint
  from unnest(p_post_ids[1:100]) as requested(post_id);
$$;

create or replace function public.get_trending_profile_ids(p_limit integer default 5)
returns table (profile_id uuid, score bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select profile.id,
    (coalesce(follower_stats.total, 0) * 5 + coalesce(post_stats.total, 0) * 3 + coalesce(engagement_stats.total, 0))::bigint as score
  from public.profiles profile
  left join lateral (
    select count(*)::bigint as total
    from public.follows relation
    join public.profiles follower on follower.id = relation.follower_id and follower.is_public
    where relation.following_id = profile.id
  ) follower_stats on true
  left join lateral (
    select count(*)::bigint as total from public.posts post
      where post.author_id = profile.id and post.deleted_at is null and post.created_at >= now() - interval '7 days'
  ) post_stats on true
  left join lateral (
    select count(*)::bigint as total
    from (
      select item.post_id from public.likes item
        join public.profiles actor on actor.id = item.user_id and actor.is_public
        join public.posts post on post.id = item.post_id
        where post.author_id = profile.id and post.deleted_at is null and item.created_at >= now() - interval '7 days'
      union all
      select item.post_id from public.reposts item
        join public.profiles actor on actor.id = item.user_id and actor.is_public
        join public.posts post on post.id = item.post_id
        where post.author_id = profile.id and post.deleted_at is null and item.created_at >= now() - interval '7 days'
      union all
      select reply.id from public.posts reply
        join public.profiles actor on actor.id = reply.author_id and actor.is_public
        join public.posts parent on parent.id = reply.reply_to_post_id
        where parent.author_id = profile.id and reply.deleted_at is null and reply.created_at >= now() - interval '7 days'
    ) activity
  ) engagement_stats on true
  where profile.is_public
  order by score desc, profile.created_at asc, profile.id asc
  limit greatest(1, least(p_limit, 20));
$$;

create or replace function public.get_profile_stats(p_profile_ids uuid[])
returns table (profile_id uuid, posts_count bigint, followers bigint, following bigint, launches_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select profile.id,
    (select count(*) from public.posts post where post.author_id = profile.id and post.deleted_at is null)::bigint,
    (select count(*) from public.follows relation
      join public.profiles follower on follower.id = relation.follower_id and follower.is_public
      where relation.following_id = profile.id)::bigint,
    (select count(*) from public.follows relation
      join public.profiles followed on followed.id = relation.following_id and followed.is_public
      where relation.follower_id = profile.id)::bigint,
    (select count(*) from public.pons_launches launch where launch.creator_profile_id = profile.id)::bigint
  from public.profiles profile
  where profile.id = any(p_profile_ids[1:100]);
$$;

create function public.get_public_token_social_engagement(
  p_token_addresses text[],
  p_since timestamptz default null
)
returns table (token_address text, social_engagement bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (
    select distinct lower(value) as token_address
    from unnest(p_token_addresses[1:50]) value
    where lower(value) ~ '^0x[0-9a-f]{40}$'
  )
  select requested.token_address,
    (
      (select count(*) from public.posts post
        join public.profiles author on author.id = post.author_id and author.is_public
        where post.token_address = requested.token_address and post.deleted_at is null
          and (p_since is null or post.created_at >= p_since))
      + (select count(*) from public.likes item
        join public.profiles actor on actor.id = item.user_id and actor.is_public
        join public.posts post on post.id = item.post_id and post.deleted_at is null
        join public.profiles author on author.id = post.author_id and author.is_public
        where post.token_address = requested.token_address
          and (p_since is null or item.created_at >= p_since))
      + (select count(*) from public.reposts item
        join public.profiles actor on actor.id = item.user_id and actor.is_public
        join public.posts post on post.id = item.post_id and post.deleted_at is null
        join public.profiles author on author.id = post.author_id and author.is_public
        where post.token_address = requested.token_address
          and (p_since is null or item.created_at >= p_since))
      + (select count(*) from public.posts reply
        join public.profiles reply_author on reply_author.id = reply.author_id and reply_author.is_public
        join public.posts post on post.id = reply.reply_to_post_id and post.deleted_at is null
        join public.profiles author on author.id = post.author_id and author.is_public
        where post.token_address = requested.token_address and reply.deleted_at is null
          and (p_since is null or reply.created_at >= p_since))
    )::bigint as social_engagement
  from requested;
$$;

revoke all on function public.get_public_token_social_engagement(text[], timestamptz) from public;
grant execute on function public.get_public_token_social_engagement(text[], timestamptz) to service_role;

drop policy if exists profiles_public_read on public.profiles;
create policy profiles_public_read on public.profiles for select to anon, authenticated using (is_public);

drop policy if exists posts_public_read on public.posts;
create policy posts_public_read on public.posts for select to anon, authenticated using (
  deleted_at is null and exists (
    select 1 from public.profiles author where author.id = posts.author_id and author.is_public
  )
);

drop policy if exists post_media_public_read on public.post_media;
create policy post_media_public_read on public.post_media for select to anon, authenticated using (
  exists (
    select 1 from public.posts post
    join public.profiles author on author.id = post.author_id and author.is_public
    where post.id = post_media.post_id and post.deleted_at is null
  )
);

drop policy if exists likes_public_read on public.likes;
create policy likes_public_read on public.likes for select to anon, authenticated using (
  exists (select 1 from public.profiles actor where actor.id = likes.user_id and actor.is_public)
  and exists (
    select 1 from public.posts post
    join public.profiles author on author.id = post.author_id and author.is_public
    where post.id = likes.post_id and post.deleted_at is null
  )
);

drop policy if exists reposts_public_read on public.reposts;
create policy reposts_public_read on public.reposts for select to anon, authenticated using (
  exists (select 1 from public.profiles actor where actor.id = reposts.user_id and actor.is_public)
  and exists (
    select 1 from public.posts post
    join public.profiles author on author.id = post.author_id and author.is_public
    where post.id = reposts.post_id and post.deleted_at is null
  )
);

drop policy if exists follows_public_read on public.follows;
create policy follows_public_read on public.follows for select to anon, authenticated using (
  exists (select 1 from public.profiles follower where follower.id = follows.follower_id and follower.is_public)
  and exists (select 1 from public.profiles followed where followed.id = follows.following_id and followed.is_public)
);

commit;
