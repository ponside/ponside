begin;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'ponside_discovery_refresh_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'ponside_discovery_refresh_secret')
  then
    raise exception using errcode = '55000', message = 'Pons discovery refresh Vault configuration is incomplete';
  end if;
  if exists (select 1 from cron.job where jobname = 'ponside-market-discovery-refresh') then
    raise exception using errcode = '55000', message = 'Pons discovery refresh Cron is already active';
  end if;
end;
$$;

select cron.schedule(
  'ponside-market-discovery-refresh',
  '*/5 * * * *',
  'select public.invoke_pons_discovery_refresh();'
);

commit;
