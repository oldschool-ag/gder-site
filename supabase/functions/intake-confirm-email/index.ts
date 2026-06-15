import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, intakeSchema } from '../_shared/db.ts';
import {
  buildApplicantCaseResponse,
  fetchLatestWalletState,
  parseJson,
  recordEvent,
  sha256Hex,
} from '../_shared/intake.ts';

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST to confirm an email challenge.');
  }

  try {
    const client = createAdminClient();
    const body = await parseJson(request);
    const token = typeof body.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return errorResponse(400, 'token_required', 'Email confirmation token is required.');
    }

    const tokenHash = await sha256Hex(token);
    const { data: challenge, error: challengeError } = await intakeSchema(client)
      .from('email_verification_challenges')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (challengeError) throw challengeError;
    if (!challenge) {
      return errorResponse(404, 'challenge_not_found', 'Email confirmation token was not found.');
    }

    const now = new Date().toISOString();
    if (challenge.status === 'used') {
      const { data: existingCase, error } = await intakeSchema(client)
        .from('intake_cases')
        .select('*')
        .eq('id', challenge.case_id)
        .single();
      if (error) throw error;
      const walletState = await fetchLatestWalletState(client, existingCase.id);
      return jsonResponse({ ok: true, alreadyConfirmed: true, ...buildApplicantCaseResponse(existingCase, walletState) });
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      const { error } = await intakeSchema(client)
        .from('email_verification_challenges')
        .update({ status: 'expired' })
        .eq('id', challenge.id);
      if (error) throw error;
      return errorResponse(410, 'challenge_expired', 'This email confirmation link has expired. Submit the draft again to issue a new one.');
    }

    const { error: markUsedError } = await intakeSchema(client)
      .from('email_verification_challenges')
      .update({ status: 'used', used_at: now })
      .eq('id', challenge.id);
    if (markUsedError) throw markUsedError;

    const { error: cancelOtherError } = await intakeSchema(client)
      .from('email_verification_challenges')
      .update({ status: 'canceled' })
      .eq('case_id', challenge.case_id)
      .in('status', ['pending', 'sent']);
    if (cancelOtherError) throw cancelOtherError;

    const { data: updatedCase, error: caseError } = await intakeSchema(client)
      .from('intake_cases')
      .update({
        email_verified_at: now,
        status: 'submitted',
        submitted_at: now,
        submit_requested_at: now,
        last_client_seen_at: now,
      })
      .eq('id', challenge.case_id)
      .select('*')
      .single();
    if (caseError) throw caseError;

    await recordEvent(client, updatedCase.id, 'email_verified', 'system', { challengeId: challenge.id });
    await recordEvent(client, updatedCase.id, 'case_submitted', 'system', { path: 'email_confirmation' });

    const walletState = await fetchLatestWalletState(client, updatedCase.id);
    return jsonResponse({ ok: true, ...buildApplicantCaseResponse(updatedCase, walletState) });
  } catch (error) {
    return errorResponse(500, 'email_confirm_failed', error instanceof Error ? error.message : 'Email confirmation failed.');
  }
});
