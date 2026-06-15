import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireEnv } from './env.ts';

export function createAdminClient() {
  return createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function intakeSchema(client: ReturnType<typeof createAdminClient>) {
  return client.schema('gder_intake');
}
