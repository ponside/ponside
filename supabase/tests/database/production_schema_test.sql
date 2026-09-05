begin;

set local search_path = public, extensions;
select plan(63);

create function pg_temp.raised_state(statement text, expected_state text)
returns boolean language plpgsql as $$
begin
  execute statement;
  return false;
exception when others then
  return sqlstate = expected_state;
end;
$$;

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'posts', 'posts exists');
select has_table('public', 'post_media', 'post_media exists');
select has_table('public', 'likes', 'likes exists');
select has_table('public', 'reposts', 'reposts exists');
select has_table('public', 'follows', 'follows exists');
select has_table('public', 'notifications', 'notifications exists');
select has_table('public', 'pons_launches', 'pons_launches exists');
select has_table('public', 'pons_market_snapshots', 'official Pons market snapshots exist');
select has_table('public', 'pons_trades', 'pons_trades exists');
select has_table('public', 'pons_curve_events', 'pons_curve_events exists');
select has_table('public', 'indexer_state', 'indexer_state exists');
select has_table('public', 'rate_limit_events', 'rate_limit_events exists');
select has_column('public', 'profiles', 'is_public', 'profile visibility flag exists');
select has_column('public', 'pons_launches', 'is_ponside_launch', 'launch origin is persisted explicitly');
select has_function('public', 'get_token_discovery_metrics', array['text[]', 'timestamp with time zone'], 'windowed discovery metrics exist');
select has_function('public', 'get_token_market_snapshot_metrics', array['text[]', 'timestamp with time zone'], 'snapshot discovery metrics exist');

select ok(not has_table_privilege('anon', 'public.posts', 'INSERT'), 'anon cannot insert posts');
select ok(not has_table_privilege('anon', 'public.indexer_state', 'SELECT'), 'anon cannot read indexer state');
select ok(not has_table_privilege('anon', 'public.rate_limit_events', 'SELECT'), 'anon cannot read rate limits');
select ok(not has_schema_privilege('anon', 'public', 'CREATE'), 'anon cannot shadow privileged function dependencies');
select ok(not has_function_privilege('anon', 'public.enforce_rate_limit(uuid,text,integer,integer)', 'EXECUTE'), 'anon cannot execute privileged mutation helpers');
select ok(has_table_privilege('anon', 'public.pons_market_snapshots', 'SELECT'), 'anon can read official market snapshots');
select ok(not has_table_privilege('anon', 'public.pons_market_snapshots', 'INSERT'), 'anon cannot write official market snapshots');
select ok(not has_function_privilege('anon', 'public.invoke_pons_discovery_refresh()', 'EXECUTE'), 'anon cannot invoke discovery refresh');

insert into public.profiles (id, privy_user_id, x_user_id, x_handle, display_name, wallet_address)
values
  ('11111111-1111-4111-8111-111111111111', 'privy:one', 'x-one', 'one', 'One', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
  ('22222222-2222-4222-8222-222222222222', 'privy:two', 'x-two', 'two', 'Two', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
select is((select count(*)::integer from public.profiles), 2, 'profiles insert cleanly');
select ok(pg_temp.raised_state($$insert into public.profiles (privy_user_id, display_name, wallet_address) values ('privy:one', 'Duplicate', '0xcccccccccccccccccccccccccccccccccccccccc')$$, '23505'), 'privy identity is unique');
select ok(pg_temp.raised_state($$insert into public.profiles (privy_user_id, x_user_id, x_handle, display_name, wallet_address) values ('privy:three', 'x-one', 'three', 'Duplicate', '0xcccccccccccccccccccccccccccccccccccccccc')$$, '23505'), 'X identity is unique');
select ok(pg_temp.raised_state($$update public.profiles set x_user_id = 'changed' where id = '11111111-1111-4111-8111-111111111111'$$, '23514'), 'assigned X identity is immutable');
select ok(pg_temp.raised_state($$insert into public.profiles (privy_user_id, display_name, wallet_address) values ('privy:four', 'Duplicate', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')$$, '23505'), 'wallet address is unique');
select ok((select bool_and(is_public) from public.profiles), 'normal profiles are public by default');

select ok(pg_temp.raised_state($$insert into public.follows (follower_id, following_id) values ('11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111')$$, '23514'), 'self follow is rejected');
insert into public.follows (follower_id, following_id) values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222');
select ok(pg_temp.raised_state($$insert into public.follows (follower_id, following_id) values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')$$, '23505'), 'duplicate follow is rejected');

insert into public.posts (id, author_id, content)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Production post');
insert into public.likes (user_id, post_id) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select ok(pg_temp.raised_state($$insert into public.likes (user_id, post_id) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '23505'), 'duplicate like is rejected');
insert into public.reposts (user_id, post_id) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select ok(pg_temp.raised_state($$insert into public.reposts (user_id, post_id) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '23505'), 'duplicate repost is rejected');
select ok(pg_temp.raised_state($$insert into public.posts (author_id, content, reply_to_post_id) values ('22222222-2222-4222-8222-222222222222', 'Missing parent', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc')$$, '23503'), 'reply foreign key is enforced');
select is((select count(*)::integer from public.notifications where actor_id = recipient_id), 0, 'own actions do not notify');
insert into public.likes (user_id, post_id) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is((select count(*)::integer from public.notifications where type = 'like' and actor_id = '22222222-2222-4222-8222-222222222222'), 1, 'like notification is created once');
insert into public.posts (id, author_id, content, reply_to_post_id)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'A reply', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select is((select count(*)::integer from public.notifications where type = 'reply' and post_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1, 'reply notification targets the reply post');
select ok((select posts_count = 1 and followers = 0 and following = 1 and launches_count = 0 from public.get_profile_stats(array['11111111-1111-4111-8111-111111111111'::uuid])), 'profile aggregates are real');

do $$ begin
  perform public.create_post_with_media(
    '11111111-1111-4111-8111-111111111111',
    '',
    null,
    null,
    '[{"url":"http://localhost:54321/storage/v1/object/public/post-media/11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png","storagePath":"11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333.png","type":"image/png"}]'::jsonb
  );
end $$;
select is((select count(*)::integer from public.post_media), 1, 'post and media are created atomically');
select ok(pg_temp.raised_state($$insert into public.post_media (post_id, media_url, storage_path, media_type, sort_order) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'https://example.com/a.png', '11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.png', 'image/png', -1)$$, '23514'), 'invalid media ordering is rejected');
set constraints posts_not_empty_after_write immediate;
select ok(pg_temp.raised_state($$insert into public.posts (author_id, content) values ('11111111-1111-4111-8111-111111111111', '')$$, '23514'), 'empty posts are rejected');
insert into public.posts (author_id, content) values ('11111111-1111-4111-8111-111111111111', 'Hello @two');
select is((select count(*)::integer from public.notifications where type = 'mention' and recipient_id = '22222222-2222-4222-8222-222222222222'), 1, 'mention notification is created without self-notification');

insert into public.pons_launches (token_address, curve_address, deployer_address, creator_profile_id, pair_token, pair_token_decimals, pair_token_symbol, token_name, token_symbol, token_decimals, total_supply, launch_config_id, graduation_threshold, launch_tx_hash, launch_block, launch_timestamp, phase)
values ('0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '0x3333333333333333333333333333333333333333', 6, 'USDC', 'Precision', 'PREC', 18, '115792089237316195423570985008687907853269984665640564039457584007913129639935', '340282366920938463463374607431768211455', '99999999999999999999999999999999999999', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 26841846, now(), 0);
select is((select total_supply from public.pons_launches where token_address = '0x1111111111111111111111111111111111111111'), '115792089237316195423570985008687907853269984665640564039457584007913129639935', 'uint256 text is exact with non-18 pair decimals');
select ok((select not is_ponside_launch from public.pons_launches where token_address = '0x1111111111111111111111111111111111111111'), 'protocol indexing alone does not mark a launch as Ponside-origin');
insert into public.pons_market_snapshots (token_address, observed_at, price_usd_e18, market_cap_usd_e18, latest_buy_at, graduation_progress_bps)
values
  ('0x1111111111111111111111111111111111111111', now() - interval '10 minutes', '100000000000000000', '300000000000000000000000', now() - interval '11 minutes', 5000),
  ('0x1111111111111111111111111111111111111111', now(), '110000000000000000', '330000000000000000000000', now(), 5500);
select ok((select activity_count = 1 and first_price_usd_e18 = '100000000000000000' and last_price_usd_e18 = '110000000000000000' and market_cap_usd_e18 = '330000000000000000000000' from public.get_token_market_snapshot_metrics(array['0x1111111111111111111111111111111111111111'], now() - interval '1 hour')), 'snapshot metrics derive real movement from accumulated observations');
do $$ begin
  perform public.record_verified_launch_activity('0x1111111111111111111111111111111111111111', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Verified Ponside launch');
end $$;
select ok((select is_ponside_launch from public.pons_launches where token_address = '0x1111111111111111111111111111111111111111'), 'verified Ponside launch activity marks discovery origin atomically');
select ok(pg_temp.raised_state($$insert into public.pons_launches (token_address, curve_address, deployer_address, pair_token, launch_config_id, graduation_threshold, launch_tx_hash, launch_block, launch_timestamp) values ('0x4444444444444444444444444444444444444444', '0x5555555555555555555555555555555555555555', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '0x0000000000000000000000000000000000000000', '0', '1', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 26841847, now())$$, '23505'), 'launch transaction is deduplicated');

insert into public.pons_trades (tx_hash, log_index, token_address, curve_address, trader_address, recipient_address, side, quote_amount, token_amount, fee_amount, creator_tax_amount, block_number, block_timestamp)
values ('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 7, '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'buy', '1000001', '99999999999999999999999999999999999999', '101', '12', 26841848, now());
select is((select token_amount from public.pons_trades where log_index = 7), '99999999999999999999999999999999999999', 'trade base units remain exact text');
select ok((select trade_count = 1 and volume_raw = '1000001' from public.get_token_discovery_metrics(array['0x1111111111111111111111111111111111111111'], now() - interval '24 hours')), 'discovery metrics use real trades inside the requested time window');
select ok(pg_temp.raised_state($$insert into public.pons_trades (tx_hash, log_index, token_address, curve_address, trader_address, recipient_address, side, quote_amount, token_amount, fee_amount, creator_tax_amount, block_number, block_timestamp) values ('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 7, '0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'buy', '1', '1', '0', '0', 26841848, now())$$, '23505'), 'trade hash and log index are deduplicated');

do $$ begin
  perform public.advance_launch_phase('0x1111111111111111111111111111111111111111', 2::smallint, 26841850, 26841850);
  perform public.advance_launch_phase('0x1111111111111111111111111111111111111111', 1::smallint, 26841849, 26841851);
end $$;
select is((select phase::integer from public.pons_launches where token_address = '0x1111111111111111111111111111111111111111'), 2, 'launch phase cannot regress');
do $$ begin
  perform public.advance_indexer_state('pons-v2:test', 200);
  perform public.advance_indexer_state('pons-v2:test', 100);
end $$;
select is((select last_processed_block::integer from public.indexer_state where indexer_name = 'pons-v2:test'), 200, 'indexer state cannot regress');
select ok(public.enforce_rate_limit('11111111-1111-4111-8111-111111111111', 'post', 1, 60), 'first rate-limited action is accepted');
select ok(not public.enforce_rate_limit('11111111-1111-4111-8111-111111111111', 'post', 1, 60), 'rate limit increment is atomic');

insert into public.posts (id, author_id, content, deleted_at)
values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '11111111-1111-4111-8111-111111111111', 'Deleted', now());
select is((select count(*)::integer from public.get_feed_page(null, false, 50, null, null) where id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'), 0, 'soft-deleted posts are excluded from feeds');
select ok((select likes = 2 and reposts = 1 and replies = 1 from public.get_post_engagement(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid])), 'post engagement aggregates are exact');

update public.profiles set is_public = false where id = '22222222-2222-4222-8222-222222222222';
select ok((select privy_user_id = 'privy:two' and x_user_id = 'x-two' and wallet_address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' from public.profiles where id = '22222222-2222-4222-8222-222222222222'), 'hiding preserves immutable identity and wallet');
insert into public.posts (id, author_id, content)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'Hidden profile post');
select is((select count(*)::integer from public.get_feed_page(null, false, 50, null, null) where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 0, 'hidden profile posts are excluded from public feeds');
select is((select count(*)::integer from public.get_trending_profile_ids(20) where profile_id = '22222222-2222-4222-8222-222222222222'), 0, 'hidden profile is excluded from trending people');
select ok((select following = 0 from public.get_profile_stats(array['11111111-1111-4111-8111-111111111111'::uuid])), 'hidden relationships do not contribute to public profile aggregates');
select ok((select likes = 1 and reposts = 0 and replies = 0 from public.get_post_engagement(array['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid])), 'hidden activity does not contribute to public engagement');

select * from finish();
rollback;
