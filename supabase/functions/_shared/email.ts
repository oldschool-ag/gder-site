import { getAppConfig } from './env.ts';

export type EmailSendResult = {
  sent: boolean;
  provider: 'resend' | 'not_configured' | 'error';
  providerMessageId?: string | null;
  error?: string | null;
};

export async function sendVerificationEmail(args: {
  to: string;
  caseReference: string;
  confirmUrl: string;
  expiresAt: string;
}): Promise<EmailSendResult> {
  const config = getAppConfig();
  if (!config.resendApiKey || !config.emailFrom) {
    return { sent: false, provider: 'not_configured' };
  }

  const subject = `Confirm your GDER intake email for ${args.caseReference}`;
  const text = [
    'GDER representative intake',
    '',
    `Case reference: ${args.caseReference}`,
    'Please confirm that you control the official representative email used for this intake.',
    `Confirm link: ${args.confirmUrl}`,
    `This link expires at: ${args.expiresAt}`,
    '',
    'This confirmation proves control of the email address only. It does not publish anything automatically.',
  ].join('\n');

  const html = `
    <div style="font-family: Inter, Arial, sans-serif; line-height: 1.6; color: #12151d;">
      <p style="letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; color: #46614f;">GDER representative intake</p>
      <h1 style="font-size: 22px; margin: 0 0 12px;">Confirm your representative email</h1>
      <p>Case reference: <strong>${escapeHtml(args.caseReference)}</strong></p>
      <p>Please confirm that you control the official representative email used for this intake.</p>
      <p><a href="${escapeHtml(args.confirmUrl)}" style="display: inline-block; padding: 12px 18px; border-radius: 999px; background: #2f4d95; color: #ffffff; text-decoration: none;">Confirm email</a></p>
      <p>This link expires at <strong>${escapeHtml(args.expiresAt)}</strong>.</p>
      <p style="color: #55606f;">This confirms control of the email address only. It does not publish a public record automatically.</p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [args.to],
      subject,
      text,
      html,
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      provider: 'error',
      error: await response.text(),
    };
  }

  const payload = await response.json();
  return {
    sent: true,
    provider: 'resend',
    providerMessageId: payload?.id ?? null,
  };
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
