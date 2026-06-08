import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, intakeSchema } from '../_shared/db.ts';
import { getAppConfig } from '../_shared/env.ts';
import {
  cancelActiveWalletChallenges,
  createChallengeNonce,
  createWalletAmountWei,
  createWalletChallengeReference,
  fetchCaseByDraftToken,
  normalizeWalletAddress,
  parseJson,
  recordEvent,
} from '../_shared/intake.ts';

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST to create a wallet breadcrumb challenge.');
  }

  try {
    const client = createAdminClient();
    const config = getAppConfig();
    if (!config.walletBreadcrumbAddress) {
      return errorResponse(409, 'wallet_breadcrumb_unconfigured', 'GDER_INTAKE_BREADCRUMB_ADDRESS is not configured.');
    }

    const body = await parseJson(request);
    const draftToken = typeof body.draftToken === 'string' ? body.draftToken.trim() : '';
    const requestedWalletAddress = normalizeWalletAddress(body.walletAddress);
    const chainId = typeof body.chainId === 'string' && body.chainId.trim() ? body.chainId.trim() : config.walletChainId;

    if (!draftToken) {
      return errorResponse(400, 'draft_token_required', 'draftToken is required.');
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(requestedWalletAddress)) {
      return errorResponse(422, 'wallet_address_invalid', 'Wallet address must be a valid 0x-prefixed EVM address.');
    }

    const caseRow = await fetchCaseByDraftToken(client, draftToken);
    if (!caseRow) {
      return errorResponse(404, 'draft_not_found', 'No case draft exists for that token.');
    }

    await cancelActiveWalletChallenges(client, caseRow.id);

    const exactAmountWei = createWalletAmountWei();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const challengeReference = createWalletChallengeReference();

    const { data: challenge, error: challengeError } = await intakeSchema(client)
      .from('wallet_challenges')
      .insert({
        case_id: caseRow.id,
        challenge_reference: challengeReference,
        challenge_nonce: createChallengeNonce(),
        chain_id: chainId,
        wallet_address: requestedWalletAddress,
        breadcrumb_address: config.walletBreadcrumbAddress,
        exact_amount_wei: exactAmountWei,
        expires_at: expiresAt,
      })
      .select('*')
      .single();
    if (challengeError) throw challengeError;

    const { data: updatedCase, error: caseError } = await intakeSchema(client)
      .from('intake_cases')
      .update({
        wallet_claimed_chain_id: chainId,
        wallet_claimed_address: requestedWalletAddress,
        wallet_proof_status: 'challenge_issued',
        last_client_seen_at: new Date().toISOString(),
      })
      .eq('id', caseRow.id)
      .select('*')
      .single();
    if (caseError) throw caseError;

    await recordEvent(client, updatedCase.id, 'wallet_challenge_created', 'public_applicant', {
      challengeReference,
      chainId,
      walletAddress: requestedWalletAddress,
      exactAmountWei,
      expiresAt,
    });

    return jsonResponse({
      ok: true,
      caseReference: updatedCase.case_reference,
      wallet: {
        claimedAddress: requestedWalletAddress,
        chainId,
        chainLabel: config.walletChainLabel,
        challengeReference,
        breadcrumbAddress: config.walletBreadcrumbAddress,
        exactAmountWei,
        expiresAt,
        proofStatus: 'challenge_issued',
        disclaimer:
          'This breadcrumb transaction only supports the claim that the applicant controls the submitted wallet. It does not establish legal authority, beneficial ownership, or publication rights.',
      },
    });
  } catch (error) {
    return errorResponse(500, 'wallet_challenge_failed', error instanceof Error ? error.message : 'Wallet challenge creation failed.');
  }
});
