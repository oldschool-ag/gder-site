import { createAdminClient, intakeSchema } from './db.ts';

export const CASE_MUTABLE_STATUSES = new Set(['draft', 'email_pending', 'needs_more_info']);

export type NormalizedAttachment = {
  clientFileName: string;
  mimeType: string | null;
  byteSize: number | null;
  sha256Hex: string | null;
  storageBucket: string | null;
  storageObjectPath: string | null;
  uploadStatus: 'not_uploaded' | 'pending_upload' | 'uploaded' | 'quarantined' | 'rejected' | 'deleted';
  uploadNote: string | null;
};

export type NormalizedDraft = {
  submissionType: 'review' | 'correction';
  entitySlug: string;
  entityName: string;
  legalName: string;
  entityType: string;
  legalWrapperType: string;
  jurisdiction: string;
  officialWebsite: string;
  requestSummary: string;
  governance: string;
  operatingControl: string;
  evidenceUrls: string[];
  notes: string;
  representativeName: string;
  representativeRole: string;
  officialEmail: string;
  officialEmailNormalized: string;
  walletChainId: string;
  walletAddress: string;
  walletTxHash: string;
  walletChallengeReference: string;
  attachments: NormalizedAttachment[];
  formValues: Record<string, string>;
};

export async function parseJson(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return {};
  return await request.json();
}

export function normalizeDraftInput(input: Record<string, unknown>): NormalizedDraft {
  const values = isRecord(input.form) ? input.form : input;
  const evidenceUrls = normalizeEvidenceUrls(values.evidenceLinks ?? values.evidenceUrls ?? '');
  const attachments = normalizeAttachments(input.attachments);
  const submissionType = normalizeMode(values.submissionType ?? values.mode ?? values.requestType);
  const entityName = stringValue(values.entityName);
  const entitySlug = stringValue(values.entitySlug) || slugify(entityName);

  const formValues = {
    mode: submissionType,
    submissionType,
    entitySlug,
    entityName,
    legalName: stringValue(values.legalName),
    entityType: stringValue(values.entityType),
    legalWrapperType: stringValue(values.legalWrapperType),
    jurisdiction: stringValue(values.jurisdiction),
    officialWebsite: normalizeUrl(values.officialWebsite) ?? stringValue(values.officialWebsite),
    requestSummary: stringValue(values.requestSummary),
    governance: stringValue(values.governance),
    operatingControl: stringValue(values.operatingControl),
    evidenceLinks: evidenceUrls.join('\n'),
    notes: stringValue(values.notes),
    representativeName: stringValue(values.representativeName),
    representativeRole: stringValue(values.representativeRole),
    officialEmail: normalizeEmail(values.officialEmail),
    walletChainId: stringValue(values.walletChainId),
    walletAddress: normalizeWalletAddress(values.walletAddress),
    walletTxHash: normalizeTxHash(values.walletTxHash),
    walletChallengeReference: stringValue(values.walletChallengeReference),
  };

  return {
    submissionType,
    entitySlug,
    entityName,
    legalName: formValues.legalName,
    entityType: formValues.entityType,
    legalWrapperType: formValues.legalWrapperType,
    jurisdiction: formValues.jurisdiction,
    officialWebsite: formValues.officialWebsite || '',
    requestSummary: formValues.requestSummary,
    governance: formValues.governance,
    operatingControl: formValues.operatingControl,
    evidenceUrls,
    notes: formValues.notes,
    representativeName: formValues.representativeName,
    representativeRole: formValues.representativeRole,
    officialEmail: formValues.officialEmail,
    officialEmailNormalized: formValues.officialEmail.toLowerCase(),
    walletChainId: formValues.walletChainId,
    walletAddress: formValues.walletAddress,
    walletTxHash: formValues.walletTxHash,
    walletChallengeReference: formValues.walletChallengeReference,
    attachments,
    formValues,
  };
}

export function validateDraftForSubmission(draft: NormalizedDraft): string[] {
  const errors: string[] = [];
  if (!draft.entityName) errors.push('Entity name is required.');
  if (!draft.requestSummary) errors.push('Request summary is required.');
  if (!draft.evidenceUrls.length) errors.push('At least one evidence URL is required.');
  if (!draft.representativeName) errors.push('Representative name is required.');
  if (!draft.representativeRole) errors.push('Representative role is required.');
  if (!draft.officialEmail || !isEmail(draft.officialEmail)) errors.push('Official entity email must be valid.');

  if (draft.submissionType === 'review') {
    if (!draft.legalName) errors.push('Legal name is required for reviewed-record requests.');
    if (!draft.entityType) errors.push('Entity type is required for reviewed-record requests.');
    if (!draft.legalWrapperType) errors.push('Documented wrapper is required for reviewed-record requests.');
    if (!draft.jurisdiction) errors.push('Jurisdiction is required for reviewed-record requests.');
    if (!draft.governance) errors.push('Governance context is required for reviewed-record requests.');
    if (!draft.operatingControl) errors.push('Operating control context is required for reviewed-record requests.');
  }

  if (draft.officialWebsite && normalizeUrl(draft.officialWebsite) == null) {
    errors.push('Official website must be a valid URL.');
  }

  return errors;
}

export function createCaseReference(): string {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
  ].join('');
  return `GDER-${stamp}-${randomAlphaNum(6)}`;
}

export function createWalletChallengeReference(): string {
  return `wallet-${randomAlphaNum(12).toLowerCase()}`;
}

export function createWalletAmountWei(): string {
  const floor = 1_000_000_000_000n;
  const offset = BigInt(Math.floor(Math.random() * 900_000) + 100_000);
  return (floor + offset).toString();
}

export function createChallengeNonce(): string {
  return randomAlphaNum(24).toLowerCase();
}

export async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
}

export async function fetchCaseByDraftToken(client: ReturnType<typeof createAdminClient>, draftToken: string) {
  const { data, error } = await intakeSchema(client)
    .from('intake_cases')
    .select('*')
    .eq('draft_token', draftToken)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchCaseByStatusLookup(
  client: ReturnType<typeof createAdminClient>,
  caseReference: string,
  statusToken: string,
) {
  const { data, error } = await intakeSchema(client)
    .from('intake_cases')
    .select('*')
    .eq('case_reference', caseReference)
    .eq('applicant_status_token', statusToken)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function syncEvidenceRows(
  client: ReturnType<typeof createAdminClient>,
  caseId: string,
  evidenceUrls: string[],
) {
  const schema = intakeSchema(client);
  const { error: deleteError } = await schema.from('intake_evidence_urls').delete().eq('case_id', caseId);
  if (deleteError) throw deleteError;

  if (!evidenceUrls.length) return;

  const rows = evidenceUrls.map((url, index) => {
    const parsed = safeUrl(url);
    return {
      case_id: caseId,
      position: index + 1,
      url,
      hostname: parsed?.hostname ?? null,
      evidence_kind: parsed?.hostname ? 'supporting_url' : 'other',
    };
  });

  const { error: insertError } = await schema.from('intake_evidence_urls').insert(rows);
  if (insertError) throw insertError;
}

export async function syncAttachmentRows(
  client: ReturnType<typeof createAdminClient>,
  caseId: string,
  attachments: NormalizedAttachment[],
) {
  const schema = intakeSchema(client);
  const { error: deleteError } = await schema.from('intake_attachment_metadata').delete().eq('case_id', caseId);
  if (deleteError) throw deleteError;

  if (!attachments.length) return;

  const rows = attachments.map((attachment) => ({
    case_id: caseId,
    client_file_name: attachment.clientFileName,
    mime_type: attachment.mimeType,
    byte_size: attachment.byteSize,
    sha256_hex: attachment.sha256Hex,
    storage_bucket: attachment.storageBucket,
    storage_object_path: attachment.storageObjectPath,
    upload_status: attachment.uploadStatus,
    upload_note: attachment.uploadNote,
  }));

  const { error: insertError } = await schema.from('intake_attachment_metadata').insert(rows);
  if (insertError) throw insertError;
}

export async function recordEvent(
  client: ReturnType<typeof createAdminClient>,
  caseId: string,
  eventType: string,
  actorScope: 'public_applicant' | 'system' | 'internal_triage',
  payload: Record<string, unknown> = {},
) {
  const { error } = await intakeSchema(client).from('intake_events').insert({
    case_id: caseId,
    event_type: eventType,
    actor_scope: actorScope,
    payload,
  });

  if (error) throw error;
}

export async function cancelActiveEmailChallenges(client: ReturnType<typeof createAdminClient>, caseId: string) {
  const { error } = await intakeSchema(client)
    .from('email_verification_challenges')
    .update({ status: 'canceled' })
    .eq('case_id', caseId)
    .in('status', ['pending', 'sent']);

  if (error) throw error;
}

export async function cancelActiveWalletChallenges(client: ReturnType<typeof createAdminClient>, caseId: string) {
  const { error } = await intakeSchema(client)
    .from('wallet_challenges')
    .update({ status: 'canceled' })
    .eq('case_id', caseId)
    .eq('status', 'pending');

  if (error) throw error;
}

export async function fetchLatestWalletState(client: ReturnType<typeof createAdminClient>, caseId: string) {
  const schema = intakeSchema(client);
  const { data: challenge, error: challengeError } = await schema
    .from('wallet_challenges')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (challengeError) throw challengeError;

  const { data: proof, error: proofError } = await schema
    .from('wallet_proofs')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (proofError) throw proofError;

  return { challenge, proof };
}

export function buildApplicantCaseResponse(caseRow: any, walletState?: { challenge?: any; proof?: any }) {
  return {
    caseReference: caseRow.case_reference,
    status: caseRow.status,
    submissionType: caseRow.submission_type,
    updatedAt: caseRow.updated_at,
    submittedAt: caseRow.submitted_at,
    intakePrivateNotice:
      'This is a private intake case file only. It does not create or publish a public GDER record automatically.',
    emailVerification: {
      required: true,
      status: caseRow.email_verified_at ? 'verified' : caseRow.status === 'email_pending' ? 'pending' : 'not_started',
      verifiedAt: caseRow.email_verified_at,
    },
    wallet: {
      claimedAddress: caseRow.wallet_claimed_address,
      chainId: caseRow.wallet_claimed_chain_id,
      proofStatus: caseRow.wallet_proof_status,
      latestChallenge: walletState?.challenge
        ? {
            challengeReference: walletState.challenge.challenge_reference,
            status: walletState.challenge.status,
            breadcrumbAddress: walletState.challenge.breadcrumb_address,
            exactAmountWei: walletState.challenge.exact_amount_wei,
            expiresAt: walletState.challenge.expires_at,
          }
        : null,
      latestProof: walletState?.proof
        ? {
            transactionHash: walletState.proof.transaction_hash,
            verificationState: walletState.proof.verification_state,
            verifiedAt: walletState.proof.verified_at,
          }
        : null,
      disclaimer:
        'Wallet breadcrumb proof only supports the claim that the applicant controls the submitted wallet. It does not prove legal authority, governance mandate, or registry status.',
    },
  };
}

export function buildDraftResumeResponse(caseRow: any) {
  const formValues = isRecord(caseRow.draft_payload?.formValues) ? caseRow.draft_payload.formValues : {};
  return {
    caseReference: caseRow.case_reference,
    draftToken: caseRow.draft_token,
    statusToken: caseRow.applicant_status_token,
    status: caseRow.status,
    updatedAt: caseRow.updated_at,
    emailVerifiedAt: caseRow.email_verified_at,
    walletProofStatus: caseRow.wallet_proof_status,
    draft: {
      formValues,
      attachments: Array.isArray(caseRow.draft_payload?.attachments) ? caseRow.draft_payload.attachments : [],
    },
  };
}

function normalizeMode(value: unknown): 'review' | 'correction' {
  const normalized = stringValue(value).toLowerCase();
  return normalized === 'correction' || normalized === 'edit' ? 'correction' : 'review';
}

function normalizeEvidenceUrls(value: unknown): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((url) => normalizeUrl(url) ?? url)
    .filter(Boolean) as string[];
}

function normalizeAttachments(value: unknown): NormalizedAttachment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((item) => ({
      clientFileName: stringValue(item.clientFileName ?? item.name),
      mimeType: nullableString(item.mimeType ?? item.type),
      byteSize: numberValue(item.byteSize ?? item.size),
      sha256Hex: nullableString(item.sha256Hex),
      storageBucket: nullableString(item.storageBucket),
      storageObjectPath: nullableString(item.storageObjectPath),
      uploadStatus: uploadStatusValue(item.uploadStatus),
      uploadNote: nullableString(item.uploadNote),
    }))
    .filter((item) => item.clientFileName);
}

function uploadStatusValue(value: unknown): NormalizedAttachment['uploadStatus'] {
  const normalized = stringValue(value).toLowerCase();
  if (['pending_upload', 'uploaded', 'quarantined', 'rejected', 'deleted'].includes(normalized)) {
    return normalized as NormalizedAttachment['uploadStatus'];
  }
  return 'not_uploaded';
}

function normalizeEmail(value: unknown): string {
  return stringValue(value).trim().toLowerCase();
}

export function normalizeWalletAddress(value: unknown): string {
  const normalized = stringValue(value).trim();
  if (!normalized) return '';
  return /^0x[a-fA-F0-9]{40}$/.test(normalized) ? normalized : normalized;
}

export function normalizeTxHash(value: unknown): string {
  const normalized = stringValue(value).trim();
  if (!normalized) return '';
  return /^0x[a-fA-F0-9]{64}$/.test(normalized) ? normalized.toLowerCase() : normalized;
}

function normalizeUrl(value: unknown): string | null {
  const trimmed = stringValue(value).trim();
  if (!trimmed) return '';
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.toString();
  } catch {
    return null;
  }
}

function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function nullableString(value: unknown): string | null {
  const next = stringValue(value);
  return next || null;
}

function numberValue(value: unknown): number | null {
  if (value == null || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function randomAlphaNum(length: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}
