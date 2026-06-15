# GDER site

Static public site for the Governed Digital Entity Register.

## Build the site

```bash
node scripts/build-pages.mjs
```

## Representative intake MVP

The public intake page now supports two modes:

- local-only package fallback when no backend is configured
- Supabase-backed private intake case files when function endpoints are configured at build time

### Frontend build env vars

Set either a base URL for all functions:

- `GDER_INTAKE_FUNCTIONS_BASE_URL=https://<project>.supabase.co/functions/v1`

Or set individual overrides:

- `GDER_INTAKE_DRAFT_ENDPOINT`
- `GDER_INTAKE_SUBMIT_ENDPOINT`
- `GDER_INTAKE_CONFIRM_EMAIL_ENDPOINT`
- `GDER_INTAKE_STATUS_ENDPOINT`
- `GDER_INTAKE_WALLET_CHALLENGE_ENDPOINT`
- `GDER_INTAKE_WALLET_VERIFY_TX_ENDPOINT`

Optional frontend metadata:

- `GDER_PUBLIC_SITE_URL`
- `GDER_INTAKE_BREADCRUMB_ADDRESS`
- `GDER_INTAKE_WALLET_CHAIN_ID`
- `GDER_INTAKE_WALLET_CHAIN_LABEL`

Then rebuild:

```bash
GDER_INTAKE_FUNCTIONS_BASE_URL=https://YOUR_PROJECT.supabase.co/functions/v1 \
GDER_PUBLIC_SITE_URL=https://gder.net \
node scripts/build-pages.mjs
```

## Supabase scaffold

See:
- [`supabase/README.md`](./supabase/README.md)
- [`supabase/DEPLOYMENT_CHECKLIST.md`](./supabase/DEPLOYMENT_CHECKLIST.md)
- [`supabase/SMOKE_TESTS.md`](./supabase/SMOKE_TESTS.md)

Highlights:

- private intake case schema + evidence URLs + attachments metadata + events
- email verification challenge flow before full submission
- applicant-safe status lookup
- optional wallet breadcrumb proof flow
- no automatic publication path
