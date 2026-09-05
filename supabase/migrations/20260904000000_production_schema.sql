begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  privy_user_id text not null unique,
  x_user_id text unique,
  x_handle text,
  display_name text not null,
  bio text not null default '',
  avatar_url text,
  wallet_address text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_privy_user_id_nonempty check (char_length(btrim(privy_user_id)) > 0),
  constraint profiles_x_handle_format check (x_handle is null or x_handle ~ '^[A-Za-z0-9_]{1,15}$'),
  constraint profiles_x_identity_pair check ((x_user_id is null) = (x_handle is null)),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 80),
  constraint profiles_bio_length check (char_length(bio) <= 300),
  constraint profiles_wallet_address_format check (wallet_address ~ '^0x[0-9a-f]{40}$')
);

create unique index profiles_x_handle_lower_unique on public.profiles (lower(x_handle)) where x_handle is not null;
create unique index profiles_wallet_address_lower_unique on public.profiles (lower(wallet_address));
create index profiles_x_handle_search_idx on public.profiles using gin (x_handle gin_trgm_ops) where x_handle is not null;
create index profiles_display_name_search_idx on public.profiles using gin (display_name gin_trgm_ops);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  token_address text,
  reply_to_post_id uuid references public.posts(id) on delete restrict,
  launch_tx_hash text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint posts_content_length check (char_length(content) <= 2000),
  constraint posts_token_address_format check (token_address is null or token_address ~ '^0x[0-9a-f]{40}$'),
  constraint posts_launch_tx_hash_format check (launch_tx_hash is null or launch_tx_hash ~ '^0x[0-9a-f]{64}$')
);

create index posts_author_created_idx on public.posts (author_id, created_at desc, id desc) where deleted_at is null;
create index posts_created_idx on public.posts (created_at desc, id desc) where deleted_at is null;
create index posts_reply_idx on public.posts (reply_to_post_id, created_at, id) where deleted_at is null;
create index posts_token_idx on public.posts (token_address, created_at desc, id desc) where token_address is not null and deleted_at is null;

create table public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  media_url text not null,
  storage_path text not null,
  media_type text not null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint post_media_url check (media_url ~ '^https?://'),
  constraint post_media_storage_path check (storage_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif)$'),
  constraint post_media_type check (media_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  constraint post_media_type_extension_match check (
    (media_type = 'image/jpeg' and storage_path ~ '\.jpg$')
    or (media_type = 'image/png' and storage_path ~ '\.png$')
    or (media_type = 'image/webp' and storage_path ~ '\.webp$')
    or (media_type = 'image/gif' and storage_path ~ '\.gif$')
  ),
  constraint post_media_order check (sort_order between 0 and 3)
);

create unique index post_media_unique_order_idx on public.post_media (post_id, sort_order);
create unique index post_media_storage_path_unique on public.post_media (storage_path);
create index post_media_post_idx on public.post_media (post_id, sort_order);

create table public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index likes_post_created_idx on public.likes (post_id, created_at desc);
create index likes_user_created_idx on public.likes (user_id, created_at desc);

create table public.reposts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index reposts_post_created_idx on public.reposts (post_id, created_at desc);
create index reposts_user_created_idx on public.reposts (user_id, created_at desc);
create index reposts_created_idx on public.reposts (created_at desc);

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self_follow check (follower_id <> following_id)
);

create index follows_following_created_idx on public.follows (following_id, created_at desc);
create index follows_follower_created_idx on public.follows (follower_id, created_at desc);
create index follows_created_idx on public.follows (created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  post_id uuid references public.posts(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type check (type in ('follow', 'like', 'reply', 'repost', 'mention')),
  constraint notifications_not_self check (recipient_id <> actor_id),
  constraint notifications_target_shape check ((type = 'follow' and post_id is null) or (type <> 'follow' and post_id is not null))
);

create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_recipient_read_idx on public.notifications (recipient_id, read_at, created_at desc);
create index notifications_actor_idx on public.notifications (actor_id, created_at desc);
create index notifications_post_idx on public.notifications (post_id, created_at desc) where post_id is not null;
create unique index notifications_unique_action_idx on public.notifications (recipient_id, actor_id, type, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.pons_launches (
  token_address text primary key,
  curve_address text not null unique,
  deployer_address text not null,
  creator_profile_id uuid references public.profiles(id) on delete set null,
  pair_token text not null,
  pair_token_decimals smallint,
  pair_token_symbol text,
  token_name text,
  token_symbol text,
  token_decimals smallint,
  token_logo_url text,
  token_description text,
  total_supply text,
  launch_config_id text not null,
  graduation_threshold text not null,
  launch_tx_hash text not null,
  launch_block bigint not null,
  launch_timestamp timestamptz not null,
  phase smallint not null default 0,
  swept_block bigint,
  graduated_block bigint,
  created_at timestamptz not null default now(),
  indexed_at timestamptz not null default now(),
  last_synced_block bigint,
  constraint pons_launches_token_address_format check (token_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_launches_curve_address_format check (curve_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_launches_deployer_address_format check (deployer_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_launches_pair_token_format check (pair_token ~ '^0x[0-9a-f]{40}$'),
  constraint pons_launches_tx_hash_format check (launch_tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint pons_launches_phase check (phase between 0 and 3),
  constraint pons_launches_decimals check ((pair_token_decimals is null or pair_token_decimals between 0 and 255) and (token_decimals is null or token_decimals between 0 and 255)),
  constraint pons_launches_uint256_text check (launch_config_id ~ '^(0|[1-9][0-9]{0,77})$' and graduation_threshold ~ '^(0|[1-9][0-9]{0,77})$' and (total_supply is null or total_supply ~ '^(0|[1-9][0-9]{0,77})$')),
  constraint pons_launches_nonnegative check (launch_block >= 0 and (swept_block is null or swept_block >= launch_block) and (graduated_block is null or graduated_block >= launch_block) and (last_synced_block is null or last_synced_block >= 0))
);

create unique index pons_launches_tx_hash_unique on public.pons_launches (launch_tx_hash);
create index pons_launches_block_idx on public.pons_launches (launch_block desc);
create index pons_launches_creator_idx on public.pons_launches (creator_profile_id, launch_timestamp desc);
create index pons_launches_pair_idx on public.pons_launches (pair_token, launch_timestamp desc);
create index pons_launches_phase_idx on public.pons_launches (phase, launch_timestamp desc);
create index pons_launches_deployer_idx on public.pons_launches (deployer_address, launch_block desc);
create index pons_launches_timestamp_idx on public.pons_launches (launch_timestamp desc, token_address);
create index pons_launches_name_search_idx on public.pons_launches using gin (token_name gin_trgm_ops) where token_name is not null;
create index pons_launches_symbol_search_idx on public.pons_launches using gin (token_symbol gin_trgm_ops) where token_symbol is not null;
create index pons_launches_lifecycle_block_idx on public.pons_launches (phase, swept_block, graduated_block);

create table public.pons_trades (
  tx_hash text not null,
  log_index integer not null,
  token_address text not null references public.pons_launches(token_address) on delete cascade,
  curve_address text not null,
  trader_address text not null,
  recipient_address text not null,
  side text not null,
  quote_amount text not null,
  token_amount text not null,
  fee_amount text not null,
  creator_tax_amount text not null,
  block_number bigint not null,
  block_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (tx_hash, log_index),
  constraint pons_trades_tx_hash_format check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint pons_trades_token_address_format check (token_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_trades_curve_address_format check (curve_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_trades_trader_address_format check (trader_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_trades_recipient_address_format check (recipient_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_trades_side check (side in ('buy', 'sell')),
  constraint pons_trades_uint256_text check (quote_amount ~ '^(0|[1-9][0-9]{0,77})$' and token_amount ~ '^(0|[1-9][0-9]{0,77})$' and fee_amount ~ '^(0|[1-9][0-9]{0,77})$' and creator_tax_amount ~ '^(0|[1-9][0-9]{0,77})$'),
  constraint pons_trades_nonnegative check (log_index >= 0 and block_number >= 0)
);

create index pons_trades_token_block_idx on public.pons_trades (token_address, block_number desc, log_index desc);
create index pons_trades_curve_block_idx on public.pons_trades (curve_address, block_number desc, log_index desc);
create index pons_trades_trader_block_idx on public.pons_trades (trader_address, block_number desc, log_index desc);
create index pons_trades_timestamp_idx on public.pons_trades (block_timestamp desc, tx_hash, log_index);
create index pons_trades_side_idx on public.pons_trades (side, block_number desc);
create index pons_trades_block_idx on public.pons_trades (block_number, log_index);

create table public.pons_curve_events (
  tx_hash text not null,
  log_index integer not null,
  token_address text not null references public.pons_launches(token_address) on delete cascade,
  curve_address text not null,
  event_type text not null,
  account_address text,
  quote_amount text not null default '0',
  token_amount text not null default '0',
  block_number bigint not null,
  block_timestamp timestamptz not null,
  primary key (tx_hash, log_index),
  constraint pons_curve_events_type check (event_type in ('buy_refunded', 'completed')),
  constraint pons_curve_events_tx_hash_format check (tx_hash ~ '^0x[0-9a-f]{64}$'),
  constraint pons_curve_events_token_address_format check (token_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_curve_events_curve_address_format check (curve_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_curve_events_account_format check (account_address is null or account_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_curve_events_uint256_text check (quote_amount ~ '^(0|[1-9][0-9]{0,77})$' and token_amount ~ '^(0|[1-9][0-9]{0,77})$'),
  constraint pons_curve_events_nonnegative check (log_index >= 0 and block_number >= 0)
);

create index pons_curve_events_token_time_idx on public.pons_curve_events (token_address, block_timestamp desc);
create index pons_curve_events_block_idx on public.pons_curve_events (block_number, log_index);

create table public.indexer_state (
  indexer_name text primary key,
  last_processed_block bigint not null,
  updated_at timestamptz not null default now(),
  constraint indexer_state_name_length check (char_length(btrim(indexer_name)) between 1 and 100),
  constraint indexer_state_nonnegative check (last_processed_block >= 0)
);

create function public.advance_indexer_state(p_indexer_name text, p_last_processed_block bigint)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  stored_block bigint;
begin
  if p_indexer_name is null or char_length(btrim(p_indexer_name)) not between 1 and 100
    or p_last_processed_block is null or p_last_processed_block < 0
  then
    raise exception using errcode = '22023', message = 'invalid indexer state';
  end if;
  insert into public.indexer_state (indexer_name, last_processed_block, updated_at)
  values (p_indexer_name, p_last_processed_block, now())
  on conflict (indexer_name) do update set
    last_processed_block = greatest(public.indexer_state.last_processed_block, excluded.last_processed_block),
    updated_at = case when excluded.last_processed_block > public.indexer_state.last_processed_block then now() else public.indexer_state.updated_at end
  returning last_processed_block into stored_block;
  return stored_block;
end;
$$;

revoke all on function public.advance_indexer_state(text, bigint) from public;
grant execute on function public.advance_indexer_state(text, bigint) to service_role;

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  created_at timestamptz not null default now(),
  constraint rate_limit_action check (action in ('post', 'reply', 'social', 'upload', 'transaction', 'quote', 'profile'))
);

create index rate_limit_events_lookup_idx on public.rate_limit_events (profile_id, action, created_at desc);

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.protect_profile_identity() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.privy_user_id is distinct from old.privy_user_id then
    raise exception using errcode = '23514', message = 'privy_user_id is immutable';
  end if;
  if old.x_user_id is not null and new.x_user_id is distinct from old.x_user_id then
    raise exception using errcode = '23514', message = 'x_user_id is immutable once assigned';
  end if;
  return new;
end;
$$;

create function public.ensure_post_not_empty() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is null
    and char_length(btrim(new.content)) = 0
    and not exists (select 1 from public.post_media media where media.post_id = new.id)
  then
    raise exception using errcode = '23514', message = 'a post requires text or media';
  end if;
  return new;
end;
$$;

create function public.ensure_media_parent_not_empty() returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent public.posts%rowtype;
begin
  select * into parent from public.posts where id = old.post_id;
  if found and parent.deleted_at is null
    and char_length(btrim(parent.content)) = 0
    and not exists (select 1 from public.post_media media where media.post_id = old.post_id)
  then
    raise exception using errcode = '23514', message = 'a post requires text or media';
  end if;
  return old;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger posts_set_updated_at before update on public.posts for each row execute function public.set_updated_at();
create trigger profiles_protect_identity before update on public.profiles for each row execute function public.protect_profile_identity();
create constraint trigger posts_not_empty_after_write after insert or update on public.posts deferrable initially deferred for each row execute function public.ensure_post_not_empty();
create constraint trigger post_media_parent_not_empty_after_delete after delete on public.post_media deferrable initially deferred for each row execute function public.ensure_media_parent_not_empty();

create function public.create_post_with_media(
  p_author_id uuid,
  p_content text default '',
  p_token_address text default null,
  p_reply_to_post_id uuid default null,
  p_media jsonb default '[]'::jsonb
)
returns setof public.posts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  created_post public.posts%rowtype;
  media_item jsonb;
  media_position bigint;
begin
  if p_author_id is null or char_length(coalesce(p_content, '')) > 2000
    or (p_token_address is not null and lower(p_token_address) !~ '^0x[0-9a-f]{40}$')
  then
    raise exception using errcode = '22023', message = 'invalid post input';
  end if;
  if p_media is null or jsonb_typeof(p_media) <> 'array' or jsonb_array_length(p_media) > 4 then
    raise exception using errcode = '22023', message = 'post media must be an array with at most four items';
  end if;
  if char_length(btrim(coalesce(p_content, ''))) = 0 and jsonb_array_length(p_media) = 0 then
    raise exception using errcode = '23514', message = 'a post requires text or media';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_media) item
    where jsonb_typeof(item) <> 'object'
      or coalesce(item ->> 'storagePath', '') !~ ('^' || p_author_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp|gif)$')
      or coalesce(item ->> 'url', '') !~ '^https?://'
      or coalesce(item ->> 'type', '') not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ) then
    raise exception using errcode = '22023', message = 'invalid post media metadata';
  end if;
  if p_reply_to_post_id is not null and not exists (
    select 1 from public.posts where id = p_reply_to_post_id and deleted_at is null
  ) then
    raise exception using errcode = '23503', message = 'reply target does not exist';
  end if;

  insert into public.posts (author_id, content, token_address, reply_to_post_id)
  values (p_author_id, btrim(coalesce(p_content, '')), lower(p_token_address), p_reply_to_post_id)
  returning * into created_post;

  for media_item, media_position in
    select value, ordinality from jsonb_array_elements(p_media) with ordinality
  loop
    insert into public.post_media (post_id, media_url, storage_path, media_type, sort_order)
    values (
      created_post.id,
      media_item ->> 'url',
      media_item ->> 'storagePath',
      media_item ->> 'type',
      media_position - 1
    );
  end loop;

  return next created_post;
  return;
end;
$$;

create function public.record_verified_launch_activity(
  p_token_address text,
  p_transaction_hash text,
  p_profile_id uuid,
  p_wallet_address text,
  p_content text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  launch_record public.pons_launches%rowtype;
  activity_id uuid;
begin
  if p_token_address is null or lower(p_token_address) !~ '^0x[0-9a-f]{40}$'
    or p_transaction_hash is null or lower(p_transaction_hash) !~ '^0x[0-9a-f]{64}$'
    or p_profile_id is null
    or p_wallet_address is null or lower(p_wallet_address) !~ '^0x[0-9a-f]{40}$'
    or char_length(btrim(coalesce(p_content, ''))) not between 1 and 2000
  then
    raise exception using errcode = '22023', message = 'invalid verified launch activity';
  end if;
  select * into launch_record
  from public.pons_launches
  where token_address = lower(p_token_address)
    and launch_tx_hash = lower(p_transaction_hash)
    and deployer_address = lower(p_wallet_address)
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'verified launch was not found';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_profile_id and wallet_address = lower(p_wallet_address)
  ) then
    raise exception using errcode = '23503', message = 'profile wallet does not match launch deployer';
  end if;
  if launch_record.creator_profile_id is not null and launch_record.creator_profile_id <> p_profile_id then
    raise exception using errcode = '23514', message = 'launch is already linked to another profile';
  end if;

  update public.pons_launches
  set creator_profile_id = p_profile_id
  where token_address = launch_record.token_address;

  insert into public.posts (author_id, content, token_address, launch_tx_hash)
  values (p_profile_id, btrim(p_content), launch_record.token_address, launch_record.launch_tx_hash)
  on conflict (launch_tx_hash) do nothing
  returning id into activity_id;

  if activity_id is null then
    select id into activity_id from public.posts
    where launch_tx_hash = launch_record.launch_tx_hash
      and author_id = p_profile_id
      and token_address = launch_record.token_address;
    if activity_id is null then
      raise exception using errcode = '23505', message = 'launch activity conflicts with another post';
    end if;
  end if;
  return activity_id;
end;
$$;

create function public.advance_launch_phase(
  p_token_address text,
  p_phase smallint,
  p_lifecycle_block bigint,
  p_last_synced_block bigint
)
returns smallint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  stored_phase smallint;
begin
  if p_token_address is null or lower(p_token_address) !~ '^0x[0-9a-f]{40}$'
    or p_phase is null or p_phase < 0 or p_phase > 3
    or p_last_synced_block is null or p_last_synced_block < 0
    or (p_lifecycle_block is not null and p_lifecycle_block < 0)
  then
    raise exception using errcode = '22023', message = 'invalid launch phase progression';
  end if;
  update public.pons_launches
  set
    phase = greatest(phase, p_phase),
    swept_block = case when p_phase = 1 and p_lifecycle_block is not null then
      least(coalesce(swept_block, p_lifecycle_block), p_lifecycle_block) else swept_block end,
    graduated_block = case when p_phase = 2 and p_lifecycle_block is not null then
      least(coalesce(graduated_block, p_lifecycle_block), p_lifecycle_block) else graduated_block end,
    last_synced_block = greatest(coalesce(last_synced_block, p_last_synced_block), p_last_synced_block),
    indexed_at = now()
  where token_address = lower(p_token_address)
  returning phase into stored_phase;
  if stored_phase is null then
    raise exception using errcode = 'P0002', message = 'launch was not found';
  end if;
  return stored_phase;
end;
$$;

create function public.notify_follow() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if new.following_id <> new.follower_id then
    insert into public.notifications (recipient_id, actor_id, type)
    values (new.following_id, new.follower_id, 'follow')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create function public.notify_post_action() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  target_profile uuid;
begin
  select author_id into target_profile
    from public.posts where id = new.post_id and deleted_at is null;
  if target_profile is not null and target_profile <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (target_profile, new.user_id, tg_argv[0], new.post_id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create function public.notify_reply() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  target_profile uuid;
begin
  select author_id into target_profile
    from public.posts where id = new.reply_to_post_id and deleted_at is null;
  if target_profile is not null and target_profile <> new.author_id then
    insert into public.notifications (recipient_id, actor_id, type, post_id)
    values (target_profile, new.author_id, 'reply', new.id)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create function public.notify_mentions() returns trigger
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, post_id)
  select distinct profile.id, new.author_id, 'mention', new.id
  from regexp_matches(new.content, '@([A-Za-z0-9_]{1,15})', 'g') as mention(matches)
  join public.profiles profile on lower(profile.x_handle) = lower(mention.matches[1])
  where profile.id <> new.author_id
  on conflict do nothing;
  return new;
end;
$$;

create trigger follows_notify after insert on public.follows for each row execute function public.notify_follow();
create trigger likes_notify after insert on public.likes for each row execute function public.notify_post_action('like');
create trigger reposts_notify after insert on public.reposts for each row execute function public.notify_post_action('repost');
create trigger replies_notify after insert on public.posts for each row when (new.reply_to_post_id is not null) execute function public.notify_reply();
create trigger mentions_notify after insert on public.posts for each row when (new.deleted_at is null and new.content <> '') execute function public.notify_mentions();

revoke all on function public.notify_follow() from public;
revoke all on function public.notify_post_action() from public;
revoke all on function public.notify_reply() from public;
revoke all on function public.notify_mentions() from public;

create function public.enforce_rate_limit(p_profile_id uuid, p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  recent_count integer;
begin
  if p_profile_id is null or p_action is null
    or p_action not in ('post', 'reply', 'social', 'upload', 'transaction', 'quote', 'profile')
    or p_limit is null or p_limit < 1 or p_limit > 10000
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400
  then
    raise exception 'Invalid rate-limit policy';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_action, 0));
  delete from public.rate_limit_events
    where profile_id = p_profile_id
      and action = p_action
      and created_at < now() - make_interval(secs => p_window_seconds);

  select count(*) into recent_count
    from public.rate_limit_events
    where profile_id = p_profile_id
      and action = p_action
      and created_at >= now() - make_interval(secs => p_window_seconds);

  if recent_count >= p_limit then
    return false;
  end if;

  insert into public.rate_limit_events (profile_id, action) values (p_profile_id, p_action);
  return true;
end;
$$;

revoke all on function public.enforce_rate_limit(uuid, text, integer, integer) from public;
grant execute on function public.enforce_rate_limit(uuid, text, integer, integer) to service_role;

create function public.get_feed_page(
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

revoke all on function public.get_feed_page(uuid, boolean, integer, timestamptz, uuid) from public;
grant execute on function public.get_feed_page(uuid, boolean, integer, timestamptz, uuid) to service_role;

create function public.get_post_engagement(p_post_ids uuid[])
returns table (post_id uuid, likes bigint, reposts bigint, replies bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select requested.post_id,
    (select count(*) from public.likes item where item.post_id = requested.post_id)::bigint,
    (select count(*) from public.reposts item where item.post_id = requested.post_id)::bigint,
    (select count(*) from public.posts reply where reply.reply_to_post_id = requested.post_id and reply.deleted_at is null)::bigint
  from unnest(p_post_ids[1:100]) as requested(post_id);
$$;

revoke all on function public.get_post_engagement(uuid[]) from public;
grant execute on function public.get_post_engagement(uuid[]) to service_role;

create function public.get_notifications(p_recipient_id uuid, p_limit integer default 50)
returns table (id uuid, type text, actor_id uuid, post_id uuid, read_at timestamptz, created_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select notification.id, notification.type, notification.actor_id, notification.post_id, notification.read_at, notification.created_at
  from public.notifications notification
  where notification.recipient_id = p_recipient_id
    and (
      notification.post_id is null
      or exists (
        select 1 from public.posts post
        where post.id = notification.post_id and post.deleted_at is null
      )
    )
  order by notification.created_at desc, notification.id desc
  limit greatest(1, least(p_limit, 100));
$$;

revoke all on function public.get_notifications(uuid, integer) from public;
grant execute on function public.get_notifications(uuid, integer) to service_role;

create function public.get_trending_profile_ids(p_limit integer default 5)
returns table (profile_id uuid, score bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id,
    (coalesce(follower_stats.total, 0) * 5 + coalesce(post_stats.total, 0) * 3 + coalesce(engagement_stats.total, 0))::bigint as score
  from public.profiles p
  left join lateral (
    select count(*)::bigint as total from public.follows f where f.following_id = p.id
  ) follower_stats on true
  left join lateral (
    select count(*)::bigint as total from public.posts po
      where po.author_id = p.id and po.deleted_at is null and po.created_at >= now() - interval '7 days'
  ) post_stats on true
  left join lateral (
    select count(*)::bigint as total
    from (
      select l.post_id from public.likes l join public.posts po on po.id = l.post_id where po.author_id = p.id and po.deleted_at is null and l.created_at >= now() - interval '7 days'
      union all
      select r.post_id from public.reposts r join public.posts po on po.id = r.post_id where po.author_id = p.id and po.deleted_at is null and r.created_at >= now() - interval '7 days'
      union all
      select reply.id from public.posts reply join public.posts parent on parent.id = reply.reply_to_post_id where parent.author_id = p.id and reply.deleted_at is null and reply.created_at >= now() - interval '7 days'
    ) activity
  ) engagement_stats on true
  order by score desc, p.created_at asc, p.id asc
  limit greatest(1, least(p_limit, 20));
$$;

revoke all on function public.get_trending_profile_ids(integer) from public;
grant execute on function public.get_trending_profile_ids(integer) to service_role;

create function public.get_profile_stats(p_profile_ids uuid[])
returns table (profile_id uuid, posts_count bigint, followers bigint, following bigint, launches_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select profile.id,
    (select count(*) from public.posts post where post.author_id = profile.id and post.deleted_at is null)::bigint,
    (select count(*) from public.follows follower where follower.following_id = profile.id)::bigint,
    (select count(*) from public.follows following where following.follower_id = profile.id)::bigint,
    (select count(*) from public.pons_launches launch where launch.creator_profile_id = profile.id)::bigint
  from public.profiles profile
  where profile.id = any(p_profile_ids[1:100]);
$$;

revoke all on function public.get_profile_stats(uuid[]) from public;
grant execute on function public.get_profile_stats(uuid[]) to service_role;

create function public.get_trending_token_addresses(p_limit integer default 20)
returns table (token_address text, volume_24h text, trade_count_24h bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select launch.token_address,
    coalesce(sum(trade.quote_amount::numeric) filter (where trade.block_timestamp >= now() - interval '24 hours'), 0)::text as volume_24h,
    count(trade.tx_hash) filter (where trade.block_timestamp >= now() - interval '24 hours')::bigint as trade_count_24h
  from public.pons_launches launch
  left join public.pons_trades trade on trade.token_address = launch.token_address
  group by launch.token_address, launch.launch_timestamp
  order by coalesce(sum(trade.quote_amount::numeric) filter (where trade.block_timestamp >= now() - interval '24 hours'), 0) desc,
    count(trade.tx_hash) filter (where trade.block_timestamp >= now() - interval '24 hours') desc,
    launch.launch_timestamp desc, launch.token_address asc
  limit greatest(1, least(p_limit, 50));
$$;

revoke all on function public.get_trending_token_addresses(integer) from public;
grant execute on function public.get_trending_token_addresses(integer) to service_role;

create function public.get_tokens_24h_metrics(p_token_addresses text[])
returns table (
  token_address text,
  volume_24h text,
  trade_count_24h bigint,
  first_quote_amount text,
  first_token_amount text,
  last_quote_amount text,
  last_token_amount text
)
language sql
stable
security invoker
set search_path = public
as $$
  select requested.token_address,
    coalesce(sum(trade.quote_amount::numeric), 0)::text,
    count(trade.tx_hash)::bigint,
    (array_agg(trade.quote_amount order by trade.block_number asc, trade.log_index asc) filter (where trade.tx_hash is not null))[1],
    (array_agg(trade.token_amount order by trade.block_number asc, trade.log_index asc) filter (where trade.tx_hash is not null))[1],
    (array_agg(trade.quote_amount order by trade.block_number desc, trade.log_index desc) filter (where trade.tx_hash is not null))[1],
    (array_agg(trade.token_amount order by trade.block_number desc, trade.log_index desc) filter (where trade.tx_hash is not null))[1]
  from unnest(p_token_addresses[1:50]) as requested(token_address)
  left join public.pons_trades trade
    on trade.token_address = requested.token_address
    and trade.block_timestamp >= now() - interval '24 hours'
  group by requested.token_address;
$$;

revoke all on function public.get_tokens_24h_metrics(text[]) from public;
grant execute on function public.get_tokens_24h_metrics(text[]) to service_role;

create function public.get_token_24h_metrics(p_token_address text)
returns table (
  volume_24h text,
  trade_count_24h bigint,
  first_quote_amount text,
  first_token_amount text,
  last_quote_amount text,
  last_token_amount text
)
language sql
stable
security invoker
set search_path = public
as $$
  select metrics.volume_24h, metrics.trade_count_24h, metrics.first_quote_amount, metrics.first_token_amount, metrics.last_quote_amount, metrics.last_token_amount
  from public.get_tokens_24h_metrics(array[lower(p_token_address)]) metrics;
$$;

revoke all on function public.get_token_24h_metrics(text) from public;
grant execute on function public.get_token_24h_metrics(text) to service_role;

create function public.backfill_launch_creators()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  changed integer;
begin
  update public.pons_launches launch
    set creator_profile_id = profile.id
    from public.profiles profile
    where launch.creator_profile_id is null
      and profile.wallet_address is not null
      and lower(profile.wallet_address) = lower(launch.deployer_address);
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.backfill_launch_creators() from public;
grant execute on function public.backfill_launch_creators() to service_role;

revoke all on function public.set_updated_at() from public;
revoke all on function public.protect_profile_identity() from public;
revoke all on function public.ensure_post_not_empty() from public;
revoke all on function public.ensure_media_parent_not_empty() from public;
revoke all on function public.create_post_with_media(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.create_post_with_media(uuid, text, text, uuid, jsonb) to service_role;
revoke all on function public.record_verified_launch_activity(text, text, uuid, text, text) from public;
grant execute on function public.record_verified_launch_activity(text, text, uuid, text, text) to service_role;
revoke all on function public.advance_launch_phase(text, smallint, bigint, bigint) from public;
grant execute on function public.advance_launch_phase(text, smallint, bigint, bigint) to service_role;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.post_media enable row level security;
alter table public.likes enable row level security;
alter table public.reposts enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.pons_launches enable row level security;
alter table public.pons_trades enable row level security;
alter table public.pons_curve_events enable row level security;
alter table public.indexer_state enable row level security;
alter table public.rate_limit_events enable row level security;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy posts_public_read on public.posts for select to anon, authenticated using (deleted_at is null);
create policy post_media_public_read on public.post_media for select to anon, authenticated using (exists (select 1 from public.posts post where post.id = post_media.post_id and post.deleted_at is null));
create policy likes_public_read on public.likes for select to anon, authenticated using (exists (select 1 from public.posts post where post.id = likes.post_id and post.deleted_at is null));
create policy reposts_public_read on public.reposts for select to anon, authenticated using (exists (select 1 from public.posts post where post.id = reposts.post_id and post.deleted_at is null));
create policy follows_public_read on public.follows for select to anon, authenticated using (true);
create policy pons_launches_public_read on public.pons_launches for select to anon, authenticated using (true);
create policy pons_trades_public_read on public.pons_trades for select to anon, authenticated using (true);
create policy pons_curve_events_public_read on public.pons_curve_events for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
revoke create on schema public from public;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select (id, x_handle, display_name, bio, avatar_url, wallet_address, created_at) on public.profiles to anon, authenticated;
grant select on public.posts, public.likes, public.reposts, public.follows, public.pons_launches, public.pons_trades, public.pons_curve_events to anon, authenticated;
grant select (id, post_id, media_url, media_type, sort_order, created_at) on public.post_media to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-media', 'post-media', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('token-logos', 'token-logos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy public_media_read on storage.objects for select to public using (bucket_id in ('post-media', 'token-logos'));

commit;
