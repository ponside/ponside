begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1
    from vault.secrets
    where name = 'ponside_discovery_refresh_secret'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'ponside_discovery_refresh_secret',
      'Shared secret for the Ponside discovery refresh endpoint.'
    );
  end if;

  if not exists (
    select 1
    from vault.secrets
    where name = 'ponside_discovery_refresh_url'
  ) then
    perform vault.create_secret(
      'https://ponside.fun/api/internal/discovery/refresh',
      'ponside_discovery_refresh_url',
      'Production Ponside discovery refresh endpoint.'
    );
  end if;
end;
$$;

create table public.pons_market_snapshots (
  token_address text not null references public.pons_launches(token_address) on delete cascade,
  observed_at timestamptz not null,
  price_usd_e18 text,
  market_cap_usd_e18 text not null,
  latest_buy_at timestamptz,
  latest_buy_block bigint,
  graduation_progress_bps integer,
  source text not null default 'official-pons-launchpad',
  created_at timestamptz not null default now(),
  primary key (token_address, observed_at),
  constraint pons_market_snapshots_token_address_format check (token_address ~ '^0x[0-9a-f]{40}$'),
  constraint pons_market_snapshots_uint256_text check (
    market_cap_usd_e18 ~ '^(0|[1-9][0-9]{0,77})$'
    and (price_usd_e18 is null or price_usd_e18 ~ '^(0|[1-9][0-9]{0,77})$')
  ),
  constraint pons_market_snapshots_nonnegative check (
    (latest_buy_block is null or latest_buy_block >= 0)
    and (graduation_progress_bps is null or graduation_progress_bps between 0 and 10000)
  ),
  constraint pons_market_snapshots_source check (source = 'official-pons-launchpad')
);

create index pons_market_snapshots_observed_idx
  on public.pons_market_snapshots (observed_at desc, token_address);

create index pons_market_snapshots_token_observed_idx
  on public.pons_market_snapshots (token_address, observed_at desc);

create function public.get_token_market_snapshot_metrics(
  p_token_addresses text[],
  p_since timestamptz default null
)
returns table (
  token_address text,
  price_usd_e18 text,
  market_cap_usd_e18 text,
  graduation_progress_bps integer,
  latest_snapshot_at timestamptz,
  observation_count bigint,
  activity_count bigint,
  first_price_usd_e18 text,
  last_price_usd_e18 text,
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
  ), current_snapshot as (
    select requested.token_address,
      latest.price_usd_e18,
      latest.market_cap_usd_e18,
      latest.graduation_progress_bps,
      latest.observed_at as latest_snapshot_at
    from requested
    left join lateral (
      select snapshot.price_usd_e18, snapshot.market_cap_usd_e18,
        snapshot.graduation_progress_bps, snapshot.observed_at
      from public.pons_market_snapshots snapshot
      where snapshot.token_address = requested.token_address
      order by snapshot.observed_at desc
      limit 1
    ) latest on true
  ), ordered_window as (
    select snapshot.token_address, snapshot.observed_at, snapshot.price_usd_e18,
      lag(snapshot.price_usd_e18) over token_history as previous_price,
      snapshot.market_cap_usd_e18,
      lag(snapshot.market_cap_usd_e18) over token_history as previous_market_cap,
      snapshot.latest_buy_at,
      lag(snapshot.latest_buy_at) over token_history as previous_latest_buy
    from public.pons_market_snapshots snapshot
    join requested using (token_address)
    where p_since is null or snapshot.observed_at >= p_since
    window token_history as (partition by snapshot.token_address order by snapshot.observed_at)
  ), snapshot_metrics as (
    select requested.token_address,
      count(ordered_window.observed_at)::bigint as observation_count,
      count(*) filter (
        where ordered_window.previous_price is not null
          and (
            ordered_window.price_usd_e18 is distinct from ordered_window.previous_price
            or ordered_window.market_cap_usd_e18 is distinct from ordered_window.previous_market_cap
            or ordered_window.latest_buy_at is distinct from ordered_window.previous_latest_buy
          )
      )::bigint as activity_count,
      (array_agg(ordered_window.price_usd_e18 order by ordered_window.observed_at asc)
        filter (where ordered_window.price_usd_e18 is not null))[1] as first_price_usd_e18,
      (array_agg(ordered_window.price_usd_e18 order by ordered_window.observed_at desc)
        filter (where ordered_window.price_usd_e18 is not null))[1] as last_price_usd_e18
    from requested
    left join ordered_window using (token_address)
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
  select requested.token_address, current_snapshot.price_usd_e18,
    current_snapshot.market_cap_usd_e18, current_snapshot.graduation_progress_bps,
    current_snapshot.latest_snapshot_at, snapshot_metrics.observation_count,
    snapshot_metrics.activity_count, snapshot_metrics.first_price_usd_e18,
    snapshot_metrics.last_price_usd_e18, social_metrics.social_engagement
  from requested
  join current_snapshot using (token_address)
  join snapshot_metrics using (token_address)
  join social_metrics using (token_address);
$$;

create function public.invoke_pons_discovery_refresh()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  refresh_url text;
  refresh_secret text;
  request_id bigint;
begin
  select decrypted_secret into refresh_url
  from vault.decrypted_secrets where name = 'ponside_discovery_refresh_url' limit 1;
  select decrypted_secret into refresh_secret
  from vault.decrypted_secrets where name = 'ponside_discovery_refresh_secret' limit 1;
  if refresh_url is null or refresh_secret is null then
    raise exception using errcode = '55000', message = 'Pons discovery refresh Vault secrets are not configured';
  end if;
  select net.http_post(
    url := refresh_url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || refresh_secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  ) into request_id;
  return request_id;
end;
$$;

alter table public.pons_market_snapshots enable row level security;
create policy pons_market_snapshots_public_read on public.pons_market_snapshots
  for select to anon, authenticated using (true);

revoke all on table public.pons_market_snapshots from anon, authenticated;
grant select on table public.pons_market_snapshots to anon, authenticated;
revoke all on function public.get_token_market_snapshot_metrics(text[], timestamptz) from public;
grant execute on function public.get_token_market_snapshot_metrics(text[], timestamptz) to service_role;
revoke all on function public.invoke_pons_discovery_refresh() from public;
grant execute on function public.invoke_pons_discovery_refresh() to service_role;

commit;
