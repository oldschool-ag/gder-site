import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, intakeSchema } from '../_shared/db.ts';
import {
  buildDraftResumeResponse,
  cancelActiveEmailChallenges,
  createCaseReference,
  fetchCaseByDraftToken,
  normalizeDraftInput,
  parseJson,
  recordEvent,
  syncAttachmentRows,
  syncEvidenceRows,
  CASE_MUTABLE_STATUSES,
} from '../_shared/intake.ts';

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  try {
    const client = createAdminClient();

    if (request.method === 'GET') {
      const url = new URL(request.url);
      const draftToken = url.searchParams.get('draft_token')?.trim();
      if (!draftToken) {
        return errorResponse(400, 'draft_token_required', 'draft_token is required.');
      }

      const caseRow = await fetchCaseByDraftToken(client, draftToken);
      if (!caseRow) {
        return errorResponse(404, 'draft_not_found', 'No draft exists for the supplied token.');
      }

      return jsonResponse({ ok: true, ...buildDraftResumeResponse(caseRow) });
    }

    if (request.method !== 'POST') {
      return errorResponse(405, 'method_not_allowed', 'Use GET to resume a draft or POST to create/update a draft.');
    }

    const body = await parseJson(request);
    const draft = normalizeDraftInput(body);
    const incomingDraftToken = typeof body.draftToken === 'string' ? body.draftToken.trim() : '';
    const now = new Date().toISOString();

    let caseRow = incomingDraftToken ? await fetchCaseByDraftToken(client, incomingDraftToken) : null;
    const isNewCase = !caseRow;

    if (caseRow && !CASE_MUTABLE_STATUSES.has(caseRow.status)) {
      return errorResponse(
        409,
        'case_locked',
        'This case is no longer mutable through the public draft endpoint. Start a new correction case if updates are needed.',
      );
    }

    const emailChanged =
      Boolean(caseRow) &&
      String(caseRow?.official_email_normalized ?? '') !== String(draft.officialEmailNormalized ?? '');

    const payload = {
      status: emailChanged && caseRow?.status === 'email_pending' ? 'draft' : caseRow?.status ?? 'draft',
      submission_type: draft.submissionType,
      entity_slug: draft.entitySlug || null,
      entity_name: draft.entityName || null,
      legal_name: draft.legalName || null,
      entity_type: draft.entityType || null,
      legal_wrapper_type: draft.legalWrapperType || null,
      jurisdiction: draft.jurisdiction || null,
      official_website: draft.officialWebsite || null,
      request_summary: draft.requestSummary || null,
      governance: draft.governance || null,
      operating_control: draft.operatingControl || null,
      notes: draft.notes || null,
      representative_name: draft.representativeName || null,
      representative_role: draft.representativeRole || null,
      official_email: draft.officialEmail || null,
      official_email_normalized: draft.officialEmailNormalized || null,
      email_verified_at: emailChanged ? null : caseRow?.email_verified_at ?? null,
      submit_requested_at: emailChanged ? null : caseRow?.submit_requested_at ?? null,
      wallet_claimed_chain_id: draft.walletChainId || null,
      wallet_claimed_address: draft.walletAddress || null,
      draft_payload: {
        formValues: draft.formValues,
        attachments: draft.attachments,
        savedAt: now,
        source: 'public_site',
      },
      last_client_seen_at: now,
    };

    if (!caseRow) {
      const { data, error } = await intakeSchema(client)
        .from('intake_cases')
        .insert({
          case_reference: createCaseReference(),
          ...payload,
        })
        .select('*')
        .single();

      if (error) throw error;
      caseRow = data;
    } else {
      const { data, error } = await intakeSchema(client)
        .from('intake_cases')
        .update(payload)
        .eq('id', caseRow.id)
        .select('*')
        .single();

      if (error) throw error;
      caseRow = data;
    }

    if (emailChanged) {
      await cancelActiveEmailChallenges(client, caseRow.id);
    }

    await syncEvidenceRows(client, caseRow.id, draft.evidenceUrls);
    await syncAttachmentRows(client, caseRow.id, draft.attachments);
    await recordEvent(client, caseRow.id, isNewCase ? 'draft_created' : 'draft_updated', 'public_applicant', {
      status: caseRow.status,
      submissionType: draft.submissionType,
      emailChanged,
      evidenceUrlCount: draft.evidenceUrls.length,
      attachmentCount: draft.attachments.length,
    });

    return jsonResponse({ ok: true, ...buildDraftResumeResponse(caseRow) });
  } catch (error) {
    return errorResponse(500, 'draft_save_failed', error instanceof Error ? error.message : 'Draft save failed.');
  }
});
