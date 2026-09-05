# Ponside

A production social-trading application built with Next.js, TypeScript, Supabase, Privy, and the App Router.

## Edit brand settings

Update all external branding values in `lib/config.ts`:

- `PROJECT_NAME`
- `SITE_URL`
- `OG_IMAGE`

## Run locally

```bash
npm install
npm run dev
```

## Verify production readiness

```bash
npm run lint
npm run typecheck
npm run build
```

The project uses standard Next.js conventions and can be imported directly into Vercel.

## Pons market discovery refresh

`npm run discovery:refresh` discovers markets from the official Pons catalog, verifies previously unseen eligible markets against Pons V2, and stores current real market snapshots. Explore reads these snapshots and does not require a historical log backfill.

The additive Supabase migration prepares `public.invoke_pons_discovery_refresh()` but deliberately does not activate Cron. It idempotently provisions these two server-only values in Supabase Vault:

- `ponside_discovery_refresh_url`: the deployed `/api/internal/discovery/refresh` URL
- `ponside_discovery_refresh_secret`: a database-generated 256-bit secret

Historical indexer checkpoints and `diagnostic:indexer-bootstrap` are retained only for explicit diagnostics. They are not part of application startup, market discovery, or production readiness.

After the deployed refresh endpoint is reachable, securely copy the existing `ponside_discovery_refresh_secret` Vault value into the production application's server-only `PONS_DISCOVERY_REFRESH_SECRET` environment variable. Then apply `supabase/scheduler/activate_pons_discovery_refresh.sql` once. It refuses to create a duplicate job and must not be applied before deployment.
