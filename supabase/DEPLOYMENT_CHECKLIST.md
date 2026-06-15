# GDER intake MVP — deployment checklist

This document is the practical rollout path for the Supabase-backed GDER representative intake.

The target state is:
- `/newlisting/` creates and updates **private intake case files**
- submit triggers **representative email verification**
- applicant-safe status lookup works
- optional **wallet breadcrumb proof** works
- nothing auto-publishes to the public register

---

## 1. What gets deployed

### Database
Apply:
- `supabase/migrations/20260604150000_gder_intake_mvp.sql`

This creates the private `gder_intake` schema and the intake tables.

### Edge functions
Deploy these six public functions:
- `intake-draft`
- `intake-submit`
- `intake-confirm-email`
- `intake-status`
- `wallet-challenge`
- `wallet-verify-tx`

### Static site rebuild
Rebuild `gder-site` with the intake function URLs injected into the generated frontend config.

---

## 2. Minimum production secrets

Set these as Supabase function secrets.

### Required
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GDER_PUBLIC_SITE_URL`

### Recommended for real submission flow
- `RESEND_API_KEY`
- `GDER_INTAKE_EMAIL_FROM`

### Recommended for wallet breadcrumb proof
- `GDER_INTAKE_BREADCRUMB_ADDRESS`
- `GDER_INTAKE_WALLET_CHAIN_ID`
- `GDER_INTAKE_WALLET_CHAIN_LABEL`
- `GDER_INTAKE_EVM_RPC_URL`

### Dev/test only
- `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN`

**Production stance:**
- set `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN=false`
- only enable it temporarily in a non-production test environment

---

## 3. Exact env map

### Supabase edge-function secrets

| Secret | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | yes | project URL used by the function admin client |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | private server-side access to `gder_intake` schema |
| `GDER_PUBLIC_SITE_URL` | yes | builds email confirmation URLs back to the public intake page |
| `RESEND_API_KEY` | recommended | sends representative email verification |
| `GDER_INTAKE_EMAIL_FROM` | recommended | sender identity for verification mail |
| `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN` | no | if `true`, submit responses return raw confirm token for testing |
| `GDER_INTAKE_BREADCRUMB_ADDRESS` | recommended | GDER-controlled wallet address used for breadcrumb proof challenges |
| `GDER_INTAKE_WALLET_CHAIN_ID` | no | defaults to `eip155:1` |
| `GDER_INTAKE_WALLET_CHAIN_LABEL` | no | defaults to `Ethereum mainnet` |
| `GDER_INTAKE_EVM_RPC_URL` | recommended | enables automatic tx verification instead of manual-review-pending fallback |

### Static-site build env vars

Set one of the following:

#### Option A — one shared base URL
- `GDER_INTAKE_FUNCTIONS_BASE_URL=https://<project>.supabase.co/functions/v1`

#### Option B — explicit per-function URLs
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

---

## 4. Deployment sequence

### Step 1 — create a private intake project context
If this is going into an existing Supabase project, confirm that using a private schema named `gder_intake` is acceptable.

The migration is deliberately private:
- RLS enabled
- anon/authenticated access revoked
- no public record tables touched

### Step 2 — apply the SQL migration
Use either:
- Supabase CLI migration flow, or
- Supabase SQL Editor pasted from `supabase/migrations/20260604150000_gder_intake_mvp.sql`

After applying, verify these tables exist under schema `gder_intake`:
- `intake_cases`
- `intake_evidence_urls`
- `intake_attachment_metadata`
- `intake_events`
- `email_verification_challenges`
- `wallet_challenges`
- `wallet_proofs`

### Step 3 — configure secrets
Set the secrets listed above before deploying functions.

Minimum real-world set:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GDER_PUBLIC_SITE_URL=https://gder.net`
- `RESEND_API_KEY=<real key>`
- `GDER_INTAKE_EMAIL_FROM=GDER <intake@gder.net>`
- `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN=false`

If wallet proof should be live immediately, also set:
- `GDER_INTAKE_BREADCRUMB_ADDRESS=<GDER controlled EVM address>`
- `GDER_INTAKE_WALLET_CHAIN_ID=eip155:1`
- `GDER_INTAKE_WALLET_CHAIN_LABEL=Ethereum mainnet`
- `GDER_INTAKE_EVM_RPC_URL=<RPC URL>`

### Step 4 — deploy edge functions
Deploy these folders:
- `supabase/functions/intake-draft`
- `supabase/functions/intake-submit`
- `supabase/functions/intake-confirm-email`
- `supabase/functions/intake-status`
- `supabase/functions/wallet-challenge`
- `supabase/functions/wallet-verify-tx`

Expected production routes:
- `https://<project>.supabase.co/functions/v1/intake-draft`
- `https://<project>.supabase.co/functions/v1/intake-submit`
- `https://<project>.supabase.co/functions/v1/intake-confirm-email`
- `https://<project>.supabase.co/functions/v1/intake-status`
- `https://<project>.supabase.co/functions/v1/wallet-challenge`
- `https://<project>.supabase.co/functions/v1/wallet-verify-tx`

### Step 5 — rebuild the static site with live function URLs
Example:

```bash
GDER_INTAKE_FUNCTIONS_BASE_URL=https://YOUR_PROJECT.supabase.co/functions/v1 \
GDER_PUBLIC_SITE_URL=https://gder.net \
GDER_INTAKE_BREADCRUMB_ADDRESS=0xYOURBREADCRUMBADDRESS \
GDER_INTAKE_WALLET_CHAIN_ID=eip155:1 \
GDER_INTAKE_WALLET_CHAIN_LABEL="Ethereum mainnet" \
node scripts/build-pages.mjs
```

Then deploy the rebuilt static site.

### Step 6 — smoke test before public announcement
Run the sequence in `supabase/SMOKE_TESTS.md`.

Do not announce the intake as live before:
- draft create/update works
- submit produces email verification flow
- email confirmation transitions case to `submitted`
- applicant-safe status lookup works

---

## 5. Production defaults I recommend

### Email flow
- use a real sender domain
- keep `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN=false`
- treat email verification as mandatory for full submission

### Wallet proof
- launch as **optional**
- EVM only at first
- do not market it as authority proof
- copy should stay: proves claimed wallet control only

### Public-site posture
Keep the copy explicit:
- submission creates a **private case file**
- it does not create a public record automatically
- wallet breadcrumb does not prove legal authority

---

## 6. Known MVP boundaries

These are still intentionally not complete:
- attachment upload UI/storage flow
- internal triage dashboard
- request-more-information loop
- admin review workflow
- non-EVM wallet proof rails
- automatic publication to reviewed-record surfaces

That is acceptable for this phase. The current scope is intake, not full registry operations.

---

## 7. Rollback posture

If something is wrong after frontend deploy:
- rebuild without `GDER_INTAKE_FUNCTIONS_BASE_URL`
- redeploy static site
- `/newlisting/` will fall back to local-only packaging mode

This gives a clean soft rollback without touching the public research set.

If a function rollout is wrong:
- disable the broken function deployment or remove the frontend endpoint config
- keep the database schema intact
- no public data corruption path exists because this MVP does not publish records

---

## 8. Launch gate

Consider the intake operational only when all of the following are true:
- migration applied successfully
- all six function routes deployed
- function secrets set correctly
- site rebuilt with live endpoints
- submit sends a real email verification
- confirmation marks the case `submitted`
- status lookup works with `caseReference + statusToken`
- wallet challenge works if enabled
- no step publishes anything publicly
