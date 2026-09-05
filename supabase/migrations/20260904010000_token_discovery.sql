begin;

alter table public.pons_launches
  add column is_ponside_launch boolean not null default false;

comment on column public.pons_launches.is_ponside_launch is
  'Set only after Ponside verifies the successful factory event and records its launch activity.';

update public.pons_launches launch
set is_ponside_launch = true
where exists (
  select 1
  from public.posts post
  where post.launch_tx_hash = launch.launch_tx_hash
    and post.token_address = launch.token_address
    and post.author_id = launch.creator_profile_id
);

create index pons_launches_discovery_idx
  on public.pons_launches (is_ponside_launch, launch_block desc, token_address);

create index pons_trades_token_timestamp_idx
  on public.pons_trades (token_address, block_timestamp, block_number, log_index);

create or replace function public.record_verified_launch_activity(
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
  set creator_profile_id = p_profile_id,
      is_ponside_launch = true
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

create function public.get_token_discovery_metrics(
  p_token_addresses text[],
  p_since timestamptz default null
)
returns table (
  token_address text,
  volume_raw text,
  trade_count bigint,
  first_quote_amount text,
  first_token_amount text,
  last_quote_amount text,
  last_token_amount text,
  social_engagement bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with requested as (
    select distinct lower(value) as token_address
    from unnest(p_token_addresses[1:50]) value
    where lower(value) ~ '^0x[0-9a-f]{40}$'
  ), trade_metrics as (
    select requested.token_address,
      coalesce(sum(trade.quote_amount::numeric), 0)::text as volume_raw,
      count(trade.tx_hash)::bigint as trade_count,
      (array_agg(trade.quote_amount order by trade.block_number asc, trade.log_index asc) filter (where trade.tx_hash is not null))[1] as first_quote_amount,
      (array_agg(trade.token_amount order by trade.block_number asc, trade.log_index asc) filter (where trade.tx_hash is not null))[1] as first_token_amount,
      (array_agg(trade.quote_amount order by trade.block_number desc, trade.log_index desc) filter (where trade.tx_hash is not null))[1] as last_quote_amount,
      (array_agg(trade.token_amount order by trade.block_number desc, trade.log_index desc) filter (where trade.tx_hash is not null))[1] as last_token_amount
    from requested
    left join public.pons_trades trade
      on trade.token_address = requested.token_address
      and (p_since is null or trade.block_timestamp >= p_since)
    group by requested.token_address
  ), social_metrics as (
    select requested.token_address,
      (
        (select count(*) from public.posts post
          where post.token_address = requested.token_address and post.deleted_at is null
            and (p_since is null or post.created_at >= p_since))
        + (select count(*) from public.likes item join public.posts post on post.id = item.post_id
          where post.token_address = requested.token_address and post.deleted_at is null
            and (p_since is null or item.created_at >= p_since))
        + (select count(*) from public.reposts item join public.posts post on post.id = item.post_id
          where post.token_address = requested.token_address and post.deleted_at is null
            and (p_since is null or item.created_at >= p_since))
        + (select count(*) from public.posts reply join public.posts post on post.id = reply.reply_to_post_id
          where post.token_address = requested.token_address and post.deleted_at is null and reply.deleted_at is null
            and (p_since is null or reply.created_at >= p_since))
      )::bigint as social_engagement
    from requested
  )
  select trade_metrics.token_address, trade_metrics.volume_raw, trade_metrics.trade_count,
    trade_metrics.first_quote_amount, trade_metrics.first_token_amount,
    trade_metrics.last_quote_amount, trade_metrics.last_token_amount,
    social_metrics.social_engagement
  from trade_metrics
  join social_metrics using (token_address);
$$;

revoke all on function public.get_token_discovery_metrics(text[], timestamptz) from public;
grant execute on function public.get_token_discovery_metrics(text[], timestamptz) to service_role;
revoke all on function public.record_verified_launch_activity(text, text, uuid, text, text) from public;
grant execute on function public.record_verified_launch_activity(text, text, uuid, text, text) to service_role;

commit;
