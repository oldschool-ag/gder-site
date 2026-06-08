export function getOptionalEnv(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value ? value : null;
}

export function requireEnv(name: string): string {
  const value = getOptionalEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getBooleanEnv(name: string, defaultValue = false): boolean {
  const value = getOptionalEnv(name);
  if (!value) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function getAppConfig() {
  return {
    publicSiteUrl: getOptionalEnv('GDER_PUBLIC_SITE_URL') ?? 'https://gder.net',
    walletBreadcrumbAddress: getOptionalEnv('GDER_INTAKE_BREADCRUMB_ADDRESS'),
    walletChainId: getOptionalEnv('GDER_INTAKE_WALLET_CHAIN_ID') ?? 'eip155:1',
    walletChainLabel: getOptionalEnv('GDER_INTAKE_WALLET_CHAIN_LABEL') ?? 'Ethereum mainnet',
    walletRpcUrl: getOptionalEnv('GDER_INTAKE_EVM_RPC_URL'),
    emailFrom: getOptionalEnv('GDER_INTAKE_EMAIL_FROM'),
    resendApiKey: getOptionalEnv('RESEND_API_KEY'),
    allowDevEmailConfirmToken: getBooleanEnv('GDER_INTAKE_ALLOW_DEV_EMAIL_CONFIRM_TOKEN', false),
  };
}
