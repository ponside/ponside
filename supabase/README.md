# Ponside Supabase schema

The migration directory is the source of truth for the production database. It initializes a clean database and intentionally contains no user, social, launch, trade, or engagement seed rows.

## Application-to-database checklist

| Application requirement | Database object |
| --- | --- |
| Privy/X identity and embedded wallet | `profiles`, immutable identity trigger, unique identity/address constraints |
| Posts, replies, attachments, soft deletion | `posts`, `post_media`, `create_post_with_media`, deferred non-empty-post triggers |
| Likes, reposts, follows | `likes`, `reposts`, `follows`, composite primary keys and self-follow constraint |
| Notifications | `notifications` plus follow, like, repost, reply, and mention triggers |
| Feed and engagement | `get_feed_page`, `get_post_engagement`, `get_profile_stats` |
| Discovery | trigram indexes, explicit verified-Ponside origin, windowed real activity metrics, and fail-closed external eligibility |
| Pons launches and lifecycle | `pons_launches`, `advance_launch_phase`, `record_verified_launch_activity` |
| Pons trades and lifecycle events | `pons_trades`, `pons_curve_events`, transaction-hash/log-index primary keys |
| Restart-safe indexing | `indexer_state`, `advance_indexer_state` |
| Durable abuse controls | `rate_limit_events`, `enforce_rate_limit` with an advisory transaction lock |
| Images and token logos | public-read `post-media` and `token-logos` buckets; service-role-only writes |

Blockchain uint256 values are stored as validated canonical base-unit decimal text. PostgreSQL casts them to `numeric` only while aggregating, preventing PostgREST/JavaScript JSON parsing from losing integer precision.

Notifications for follows, likes, reposts, replies, and `@handle` mentions are trigger-generated, retry-safe, and suppressed for self-actions. Notification reads hide activity whose referenced post has been soft-deleted.

Post deletion is a server-authorized soft delete. The server then removes stored media by its persisted, non-user-selected `storage_path` and deletes the media metadata. If storage cleanup fails, the hidden post and metadata remain available for an idempotent retry instead of risking deletion of unrelated objects.

## Local fresh-database validation

Install the Supabase CLI and a Docker-compatible runtime, then initialize the local configuration if `supabase/config.toml` is not present:

```powershell
supabase init
supabase start
supabase db reset --local
supabase db lint --local --level error
supabase test db
supabase gen types --lang typescript --local > lib/supabase/database.types.ts
```

`db reset --local` is destructive only to the local Supabase database. Never use `db reset --linked` for production.

The repository-only validator does not require Docker:

```powershell
npm.cmd run validate:supabase
```

## Applying to the intended remote project

Only after identifying and confirming the Ponside project:

```powershell
supabase login
supabase link --project-ref <confirmed-ponside-project-ref>
supabase migration list
supabase db push --dry-run
supabase db push
supabase db lint --linked --level error
supabase gen types --lang typescript --linked > lib/supabase/database.types.ts
```

Do not include seed data in the remote push. The configured storage bucket names must remain `post-media` and `token-logos`, or a reviewed migration must create any deliberately renamed buckets before the environment overrides are changed.
