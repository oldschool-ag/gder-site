import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient, intakeSchema } from '../_shared/db.ts';
import { verifyEvmBreadcrumbProof } from '../_shared/evm.ts';
import { getAppConfig } from '../_shared/env.ts';
import {
  fetchCaseByDraftToken,
  normalizeTxHash,
  parseJson,
  recordEvent,
} from '../_shared/intake.ts';

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Use POST to verify a wallet breadcrumb transaction.');
  }

  try {
    const client = createAdminClient();
    const config = getAppConfig();
    const body = await parseJson(request);
    const draftToken = typeof body.draftToken === 'string' ? body.draftToken.trim() : '';
    const challengeReference = typeof body.challengeReference === 'string' ? body.challengeReference.trim() : '';
    const transactionHash = normalizeTxHash(body.transactionHash);

    if (!draftToken || !challengeReference || !transactionHash) {
      return errorResponse(
        400,
        'verification_fields_required',
        'draftToken, challengeReference, and transactionHash are required.',
      );
    }

    if (!/^0x[a-f0-9]{64}$/.test(transactionHash)) {
      return errorResponse(422, 'transaction_hash_invalid', 'Transaction hash must be a valid 0x-prefixed EVM transaction hash.');
    }

    const caseRow = await fetchCaseByDraftToken(client, draftToken);
    if (!caseRow) {
      return errorResponse(404, 'draft_not_found', 'No case draft exists for that token.');
    }

    const { data: challenge, error: challengeError } = await intakeSchema(client)
      .from('wallet_challenges')
      .select('*')
      .eq('case_id', caseRow.id)
      .eq('challenge_reference', challengeReference)
      .maybeSingle();
    if (challengeError) throw challengeError;
    if (!challenge) {
      return errorResponse(404, 'wallet_challenge_not_found', 'No wallet challenge matched that reference.');
    }

    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      const { error } = await intakeSchema(client)
        .from('wallet_challenges')
        .update({ status: 'expired' })
        .eq('id', challenge.id);
      if (error) throw error;
      return errorResponse(410, 'wallet_challenge_expired', 'This wallet challenge has expired. Create a new one and submit a fresh transaction.');
    }

    const verification = await verifyEvmBreadcrumbProof({
      rpcUrl: config.walletRpcUrl,
      transactionHash,
      expectedFrom: challenge.wallet_address,
      expectedTo: challenge.breadcrumb_address,
      expectedValueWei: String(challenge.exact_amount_wei),
    });

    let verificationState: 'pending_lookup' | 'verified' | 'manual_review_pending' | 'rejected' = 'pending_lookup';
    let challengeStatus: 'pending' | 'verified' | 'manual_review' = 'pending';

    if (!verification.ok && verification.reason === 'rpc_unavailable') {
      verificationState = 'manual_review_pending';
      challengeStatus = 'manual_review';
    } else if (!verification.ok && verification.reason === 'not_found') {
      verificationState = 'pending_lookup';
      challengeStatus = 'pending';
    } else if (verification.ok) {
      verificationState = 'verified';
      challengeStatus = 'verified';
    } else {
      verificationState = 'rejected';
      challengeStatus = 'pending';
    }

    const proofPayload = verification.ok
      ? {
          case_id: caseRow.id,
          wallet_challenge_id: challenge.id,
          transaction_hash: transactionHash,
          chain_id: challenge.chain_id,
          claimed_wallet_address: challenge.wallet_address,
          from_address: verification.fromAddress,
          to_address: verification.toAddress,
          value_wei: verification.valueWei,
          verification_state: verificationState,
          verification_detail: {
            blockNumber: verification.blockNumber,
          },
          verified_at: verificationState === 'verified' ? new Date().toISOString() : null,
        }
      : {
          case_id: caseRow.id,
          wallet_challenge_id: challenge.id,
          transaction_hash: transactionHash,
          chain_id: challenge.chain_id,
          claimed_wallet_address: challenge.wallet_address,
          verification_state: verificationState,
          verification_detail: {
            reason: verification.reason,
            detail: verification.detail,
            observed: verification.observed ?? null,
          },
          verified_at: null,
        };

    const { error: proofError } = await intakeSchema(client)
      .from('wallet_proofs')
      .upsert(proofPayload, { onConflict: 'transaction_hash' });
    if (proofError) throw proofError;

    const { error: challengeUpdateError } = await intakeSchema(client)
      .from('wallet_challenges')
      .update({
        status: challengeStatus,
        verified_at: verificationState === 'verified' ? new Date().toISOString() : null,
      })
      .eq('id', challenge.id);
    if (challengeUpdateError) throw challengeUpdateError;

    const nextWalletStatus =
      verificationState === 'verified'
        ? 'verified'
        : verificationState === 'manual_review_pending'
          ? 'manual_review_pending'
          : verificationState === 'pending_lookup'
            ? 'proof_submitted'
            : 'rejected';

    const { data: updatedCase, error: caseUpdateError } = await intakeSchema(client)
      .from('intake_cases')
      .update({
        wallet_proof_status: nextWalletStatus,
        last_client_seen_at: new Date().toISOString(),
      })
      .eq('id', caseRow.id)
      .select('*')
      .single();
    if (caseUpdateError) throw caseUpdateError;

    await recordEvent(client, updatedCase.id, 'wallet_proof_submitted', 'public_applicant', {
      challengeReference,
      transactionHash,
      verificationState,
    });

    return jsonResponse({
      ok: true,
      caseReference: updatedCase.case_reference,
      wallet: {
        proofStatus: nextWalletStatus,
        challengeReference,
        transactionHash,
        verificationState,
        disclaimer:
          'Wallet breadcrumb proof only addresses claimed wallet control. It does not prove legal authority or create a public record automatically.',
        detail: verification.ok
          ? {
              fromAddress: verification.fromAddress,
              toAddress: verification.toAddress,
              valueWei: verification.valueWei,
              blockNumber: verification.blockNumber,
            }
          : {
              reason: verification.reason,
              detail: verification.detail,
              observed: verification.observed ?? null,
            },
      },
    });
  } catch (error) {
    return errorResponse(500, 'wallet_verification_failed', error instanceof Error ? error.message : 'Wallet verification failed.');
  }
});
