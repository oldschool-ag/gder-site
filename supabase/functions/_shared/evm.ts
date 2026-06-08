export type EvmVerificationResult =
  | {
      ok: true;
      transactionHash: string;
      fromAddress: string;
      toAddress: string;
      valueWei: string;
      blockNumber: string | null;
    }
  | {
      ok: false;
      reason: 'rpc_unavailable' | 'not_found' | 'failed' | 'mismatch';
      detail: string;
      observed?: Record<string, unknown> | null;
    };

export async function verifyEvmBreadcrumbProof(args: {
  rpcUrl: string | null;
  transactionHash: string;
  expectedFrom: string;
  expectedTo: string;
  expectedValueWei: string;
}): Promise<EvmVerificationResult> {
  if (!args.rpcUrl) {
    return {
      ok: false,
      reason: 'rpc_unavailable',
      detail: 'No GDER_INTAKE_EVM_RPC_URL configured.',
    };
  }

  const tx = await rpcCall(args.rpcUrl, 'eth_getTransactionByHash', [args.transactionHash]);
  if (!tx) {
    return {
      ok: false,
      reason: 'not_found',
      detail: 'Transaction hash was not found on the configured RPC endpoint.',
    };
  }

  const receipt = await rpcCall(args.rpcUrl, 'eth_getTransactionReceipt', [args.transactionHash]);
  if (!receipt || receipt.status !== '0x1') {
    return {
      ok: false,
      reason: 'failed',
      detail: 'Transaction receipt missing or unsuccessful.',
      observed: { receipt },
    };
  }

  const fromAddress = String(tx.from || '').toLowerCase();
  const toAddress = String(tx.to || '').toLowerCase();
  const expectedFrom = args.expectedFrom.toLowerCase();
  const expectedTo = args.expectedTo.toLowerCase();
  const observedValueWei = normalizeHexInteger(tx.value);
  const expectedValueWei = BigInt(args.expectedValueWei).toString();

  if (fromAddress !== expectedFrom || toAddress !== expectedTo || observedValueWei !== expectedValueWei) {
    return {
      ok: false,
      reason: 'mismatch',
      detail: 'Transaction did not match the expected wallet, breadcrumb address, and exact amount.',
      observed: {
        fromAddress,
        toAddress,
        observedValueWei,
        expectedFrom,
        expectedTo,
        expectedValueWei,
      },
    };
  }

  return {
    ok: true,
    transactionHash: args.transactionHash,
    fromAddress,
    toAddress,
    valueWei: observedValueWei,
    blockNumber: tx.blockNumber ?? null,
  };
}

async function rpcCall(rpcUrl: string, method: string, params: unknown[]): Promise<any> {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `${method}-${Date.now()}`,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed with ${response.status}`);
  }

  const payload = await response.json();
  return payload?.result ?? null;
}

function normalizeHexInteger(value: string | null | undefined): string {
  if (!value) return '0';
  return BigInt(value).toString();
}
