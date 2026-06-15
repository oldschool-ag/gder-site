# GDER intake MVP on Supabase

This directory adds a deployable-ish Supabase scaffold for the public representative intake.

## What is here

- `config.toml` — local/Supabase CLI project scaffold with public edge functions marked `verify_jwt = false`
- `migrations/20260604150000_gder_intake_mvp.sql` — private intake schema, evidence URLs, attachment metadata, event log, email verification, wallet challenges, wallet proofs
- `functions/` — edge-function handlers for the minimal public intake API
- `.env.example` — required and optional environment variables

## Public edge functions

Expected function routes:

- `intake-draft` — `GET` resume by `draft_token`, `POST` create/update draft
- `intake-submit` — `POST` submit draft, issue email verification when needed
- `intake-confirm-email` — `POST` confirm representative email challenge
- `intake-status` — `GET/POST` applicant-safe status lookup with `caseReference + statusToken`
- `wallet-challenge` — `POST` create optional breadcrumb challenge
- `wallet-verify-tx` — `POST` verify submitted wallet tx hash or mark manual review if RPC is unavailable

## Required secrets / env

Minimum:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GDER_PUBLIC_SITE_URL`

Optional but recommended:

- `RESEND_API_KEY`
- `GDER_INTAKE_EMAIL_FROM`
- `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN=false`
- `GDER_INTAKE_BREADCRUMB_ADDRESS`
- `GDER_INTAKE_WALLET_CHAIN_ID=eip155:1`
- `GDER_INTAKE_WALLET_CHAIN_LABEL=Ethereum mainnet`
- `GDER_INTAKE_EVM_RPC_URL`

## Manual deployment notes

1. Apply the SQL migration to a Supabase project.
2. Deploy the six edge functions.
3. Set the env vars above in Supabase function secrets.
4. Rebuild the static site with `GDER_INTAKE_FUNCTIONS_BASE_URL` or the per-endpoint override env vars set.
5. Redeploy the static site.

For the exact rollout order, env map, rollback posture, and smoke tests, use:
- [`DEPLOYMENT_CHECKLIST.md`](./DEPLOYMENT_CHECKLIST.md)
- [`SMOKE_TESTS.md`](./SMOKE_TESTS.md)

## Important product boundaries baked into the schema/code

- submissions create **private case files**, not public records
- email verification is required before a case becomes fully submitted
- wallet breadcrumb proof supports only a claim of wallet control
- no automatic publication path exists in this MVP

## Still manual / intentionally scaffolded

- actual attachment upload flow and storage bucket wiring
- internal triage/admin surfaces
- cross-device applicant auth beyond browser-held `draftToken` + applicant-safe status token
- robust chain-specific wallet proofing beyond the configured EVM RPC path
