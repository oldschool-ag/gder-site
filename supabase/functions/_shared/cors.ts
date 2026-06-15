export const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
};

export function handleOptions(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: corsHeaders });
}

export function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return jsonResponse(
    {
      error: {
        code,
        message,
        details: details ?? null,
      },
    },
    status,
  );
}
