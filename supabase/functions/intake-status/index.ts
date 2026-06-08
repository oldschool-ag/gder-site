import { errorResponse, handleOptions, jsonResponse } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/db.ts';
import {
  buildApplicantCaseResponse,
  fetchCaseByStatusLookup,
  fetchLatestWalletState,
  parseJson,
} from '../_shared/intake.ts';

Deno.serve(async (request) => {
  const optionsResponse = handleOptions(request);
  if (optionsResponse) return optionsResponse;

  try {
    const client = createAdminClient();
    let caseReference = '';
    let statusToken = '';

    if (request.method === 'GET') {
      const url = new URL(request.url);
      caseReference = url.searchParams.get('case_reference')?.trim() ?? '';
      statusToken = url.searchParams.get('status_token')?.trim() ?? '';
    } else if (request.method === 'POST') {
      const body = await parseJson(request);
      caseReference = typeof body.caseReference === 'string' ? body.caseReference.trim() : '';
      statusToken = typeof body.statusToken === 'string' ? body.statusToken.trim() : '';
    } else {
      return errorResponse(405, 'method_not_allowed', 'Use GET or POST for applicant-safe status checks.');
    }

    if (!caseReference || !statusToken) {
      return errorResponse(400, 'status_lookup_required', 'caseReference and statusToken are required.');
    }

    const caseRow = await fetchCaseByStatusLookup(client, caseReference, statusToken);
    if (!caseRow) {
      return errorResponse(404, 'case_not_found', 'No case matched the supplied status credentials.');
    }

    const walletState = await fetchLatestWalletState(client, caseRow.id);
    return jsonResponse({ ok: true, ...buildApplicantCaseResponse(caseRow, walletState) });
  } catch (error) {
    return errorResponse(500, 'status_lookup_failed', error instanceof Error ? error.message : 'Status lookup failed.');
  }
});
