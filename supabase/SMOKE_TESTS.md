# GDER intake MVP — smoke tests

Use these tests after migration + function deploy and before treating the intake as live.

Set these locally first:

```bash
export BASE_URL="https://YOUR_PROJECT.supabase.co/functions/v1"
export DRAFT_URL="$BASE_URL/intake-draft"
export SUBMIT_URL="$BASE_URL/intake-submit"
export CONFIRM_URL="$BASE_URL/intake-confirm-email"
export STATUS_URL="$BASE_URL/intake-status"
export WALLET_CHALLENGE_URL="$BASE_URL/wallet-challenge"
export WALLET_VERIFY_URL="$BASE_URL/wallet-verify-tx"
```

---

## 1. Create a draft

```bash
curl -sS "$DRAFT_URL" \
  -H 'content-type: application/json' \
  -d '{
    "submissionType": "review",
    "entityName": "Test Entity Foundation",
    "legalName": "Test Entity Foundation",
    "entityType": "foundation",
    "legalWrapperType": "foundation",
    "jurisdiction": "Cayman Islands",
    "officialWebsite": "https://example.org",
    "requestSummary": "Test reviewed-record request.",
    "governance": "Board-supervised governance.",
    "operatingControl": "Operations executed by designated signers.",
    "evidenceLinks": "https://example.org\nhttps://example.org/governance",
    "representativeName": "Test Representative",
    "representativeRole": "Operations lead",
    "officialEmail": "intake-test@example.org"
  }'
```

Expected:
- `ok: true`
- a `draftToken`
- a `statusToken`
- a `caseReference`
- `status: "draft"`

Save these values for later steps.

---

## 2. Resume the draft

```bash
curl -sS "$DRAFT_URL?draft_token=<DRAFT_TOKEN>"
```

Expected:
- same `caseReference`
- same `draftToken`
- same `statusToken`
- `draft.formValues` present

---

## 3. Update the draft

```bash
curl -sS "$DRAFT_URL" \
  -H 'content-type: application/json' \
  -d '{
    "draftToken": "<DRAFT_TOKEN>",
    "submissionType": "review",
    "entityName": "Test Entity Foundation",
    "legalName": "Test Entity Foundation",
    "entityType": "foundation",
    "legalWrapperType": "foundation",
    "jurisdiction": "Cayman Islands",
    "officialWebsite": "https://example.org",
    "requestSummary": "Updated reviewed-record request.",
    "governance": "Board-supervised governance.",
    "operatingControl": "Operations executed by designated signers.",
    "evidenceLinks": "https://example.org\nhttps://example.org/governance\nhttps://example.org/legal",
    "representativeName": "Test Representative",
    "representativeRole": "Operations lead",
    "officialEmail": "intake-test@example.org"
  }'
```

Expected:
- `ok: true`
- same `caseReference`
- still `status: "draft"`

---

## 4. Submit the draft

```bash
curl -sS "$SUBMIT_URL" \
  -H 'content-type: application/json' \
  -d '{
    "draftToken": "<DRAFT_TOKEN>"
  }'
```

Expected:
- `ok: true`
- `status: "email_pending"` if the email is not already verified
- `emailVerification.required: true`
- `emailVerification.status: "sent"` or `"pending"`

If `GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN=true`, the response may also include a dev confirmation token or confirm URL. Use that only for testing.

---

## 5. Confirm the representative email

### Production-style path
Use the actual email link sent to the representative email address.

### Dev/test path
If dev confirm tokens are enabled:

```bash
curl -sS "$CONFIRM_URL" \
  -H 'content-type: application/json' \
  -d '{
    "token": "<EMAIL_CONFIRM_TOKEN>"
  }'
```

Expected:
- `ok: true`
- `status: "submitted"`
- `emailVerification.status: "verified"`

---

## 6. Applicant-safe status lookup

```bash
curl -sS "$STATUS_URL?case_reference=<CASE_REFERENCE>&status_token=<STATUS_TOKEN>"
```

Expected:
- `ok: true`
- matching `caseReference`
- `status` reflects current state
- `intakePrivateNotice` present
- wallet block present even if not started

This is the public-safe status credential pair:
- `caseReference`
- `statusToken`

Do not expose status by email address or by bare case reference alone.

---

## 7. Wallet challenge creation (optional)

Only run this if `GDER_INTAKE_BREADCRUMB_ADDRESS` is configured.

```bash
curl -sS "$WALLET_CHALLENGE_URL" \
  -H 'content-type: application/json' \
  -d '{
    "draftToken": "<DRAFT_TOKEN>",
    "walletAddress": "0x1111111111111111111111111111111111111111",
    "chainId": "eip155:1"
  }'
```

Expected:
- `ok: true`
- `wallet.challengeReference`
- `wallet.breadcrumbAddress`
- `wallet.exactAmountWei`
- `wallet.proofStatus: "challenge_issued"`
- disclaimer text making clear this is not legal-authority proof

---

## 8. Wallet tx verification (optional)

After sending the exact breadcrumb tx from the claimed wallet:

```bash
curl -sS "$WALLET_VERIFY_URL" \
  -H 'content-type: application/json' \
  -d '{
    "draftToken": "<DRAFT_TOKEN>",
    "challengeReference": "<CHALLENGE_REFERENCE>",
    "transactionHash": "<TX_HASH>"
  }'
```

Expected if RPC is configured and tx is correct:
- `ok: true`
- `wallet.verificationState: "verified"`
- `wallet.proofStatus: "verified"`

Expected if RPC is not configured:
- `ok: true`
- `wallet.verificationState: "manual_review_pending"`

Expected if tx is not yet indexed/found:
- `ok: true`
- `wallet.verificationState: "pending_lookup"`
- `wallet.proofStatus: "proof_submitted"`

---

## 9. Frontend smoke test

After rebuilding the static site with live endpoint config:

1. Open `/newlisting/`
2. Confirm the intake state card no longer says backend is disconnected
3. Create a draft and refresh the page
4. Confirm the draft resumes and private case file info persists
5. Submit and verify the representative email flow
6. Confirm the applicant-safe case status panel updates
7. If wallet proof is enabled, create a wallet challenge and verify a tx hash

---

## 10. Failure cases worth testing

### Invalid evidence URL
Submit a draft with a malformed URL.
Expected:
- validation fails
- no successful submission

### Missing required reviewed-record fields
Remove legal name or governance from a `review` request.
Expected:
- submit rejects as incomplete

### Invalid email confirm token
Call `intake-confirm-email` with a bad token.
Expected:
- 404-like error response

### Expired email challenge
Confirm after expiry.
Expected:
- token marked expired
- response tells you to submit again

### Invalid wallet address
Create a wallet challenge with non-EVM address format.
Expected:
- 422-like validation response

### Invalid tx hash
Submit malformed tx hash.
Expected:
- validation error

---

## 11. Launch gate

Do not treat intake as live until these all pass:
- draft create works
- draft resume works
- draft update works
- submit reaches `email_pending`
- email confirmation reaches `submitted`
- applicant-safe status lookup works
- optional wallet proof behaves correctly if enabled
- no step writes to a public record surface
