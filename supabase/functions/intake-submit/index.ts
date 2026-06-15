import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, intakeSchema } from '../_shared/db.ts';
import { sendVerificationEmail } from '../_shared/email.ts';
import { getAppConfig } from '../_shared/env.ts';
import {
  buildApplicantCaseResponse,
  cancelActiveEmailChallenges,
  fetchCaseByDraftToken,
  normalizeDraftInput,
  parseJson,
  randomToken,
  recordEvent,
  sha256Hex,
  validateDraftForSubmission,
} from '../_shared/intake.ts';

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST to submit a draft.');
  }

  try {
    const client = createAdminClient();
    const config = getAppConfig();
    const body = await parseJson(request);
    const draftToken = typeof body.draftToken === 'string' ? body.draftToken.trim() : '';

    if (!draftToken) {
      return errorResponse(400, 'draft_token_required', 'draftToken is required.');
    }

    const caseRow = await fetchCaseByDraftToken(client, draftToken);
    if (!caseRow) {
      return errorResponse(404, 'draft_not_found', 'No case draft exists for that token.');
    }

    const draft = normalizeDraftInput({ form: caseRow.draft_payload?.formValues ?? {} });
    const validationErrors = validateDraftForSubmission(draft);
    if (validationErrors.length) {
      return errorResponse(422, 'validation_failed', 'Draft is incomplete.', validationErrors);
    }

    const submissionSnapshot = {
      formValues: draft.formValues,
      attachments: Array.isArray(caseRow.draft_payload?.attachments) ? caseRow.draft_payload.attachments : [],
      submittedFrom: 'public_site',
      submittedAt: new Date().toISOString(),
    };

    if (caseRow.email_verified_at) {
      const { data, error } = await intakeSchema(client)
        .from('intake_cases')
        .update({
          status: 'submitted',
          submit_requested_at: caseRow.submit_requested_at ?? new Date().toISOString(),
          submitted_at: caseRow.submitted_at ?? new Date().toISOString(),
          submission_snapshot: submissionSnapshot,
          last_client_seen_at: new Date().toISOString(),
        })
        .eq('id', caseRow.id)
        .select('*')
        .single();

      if (error) throw error;
      await recordEvent(client, data.id, 'case_submitted', 'public_applicant', {
        path: 'email_already_verified',
      });
      return jsonResponse({
        ok: true,
        ...buildApplicantCaseResponse(data),
        emailVerification: {
          required: true,
          status: 'verified',
          verifiedAt: data.email_verified_at,
        },
      });
    }

    await cancelActiveEmailChallenges(client, caseRow.id);

    const rawToken = randomToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const confirmUrl = `${config.publicSiteUrl.replace(/\/$/, '')}/newlisting/?case=${encodeURIComponent(caseRow.case_reference)}&email_challenge=${encodeURIComponent(rawToken)}`;

    const { data: challengeRow, error: challengeError } = await intakeSchema(client)
      .from('email_verification_challenges')
      .insert({
        case_id: caseRow.id,
        email_address: draft.officialEmail,
        token_hash: tokenHash,
        challenge_url: confirmUrl,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (challengeError) throw challengeError;

    const emailResult = await sendVerificationEmail({
      to: draft.officialEmail,
      caseReference: caseRow.case_reference,
      confirmUrl,
      expiresAt,
    });

    if (emailResult.sent) {
      const { error } = await intakeSchema(client)
        .from('email_verification_challenges')
        .update({
          status: 'sent',
          send_provider: emailResult.provider,
          provider_message_id: emailResult.providerMessageId ?? null,
          sent_at: new Date().toISOString(),
        })
        .eq('id', challengeRow.id);
      if (error) throw error;
    }

    const { data: updatedCase, error: caseError } = await intakeSchema(client)
      .from('intake_cases')
      .update({
        status: 'email_pending',
        submit_requested_at: new Date().toISOString(),
        submission_snapshot: submissionSnapshot,
        last_client_seen_at: new Date().toISOString(),
      })
      .eq('id', caseRow.id)
      .select('*')
      .single();

    if (caseError) throw caseError;

    await recordEvent(client, updatedCase.id, 'submission_requested', 'public_applicant', {
      emailDelivery: emailResult.provider,
      emailSent: emailResult.sent,
      expiresAt,
    });

    return jsonResponse({
      ok: true,
      ...buildApplicantCaseResponse(updatedCase),
      emailVerification: {
        required: true,
        status: emailResult.sent ? 'sent' : 'pending',
        delivery: emailResult.provider,
        expiresAt,
        confirmUrl: config.allowDevEmailConfirmToken ? confirmUrl : undefined,
        devConfirmToken: config.allowDevEmailConfirmToken ? rawToken : undefined,
        deliveryError: emailResult.error ?? null,
      },
    });
  } catch (error) {
    return errorResponse(500, 'submit_failed', error instanceof Error ? error.message : 'Submit failed.');
  }
});
