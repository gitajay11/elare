import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';

/**
 * Transactional email over SMTP. Configured with SMTP_HOST / SMTP_PORT /
 * SMTP_USER / SMTP_PASS / SMTP_FROM; when SMTP_HOST is unset, sending is a
 * logged no-op so checkout never depends on the mail server.
 */
let transporter: Transporter | null | undefined;

function transport(): Transporter | null {
  if (transporter !== undefined) return transporter;
  const host = env('SMTP_HOST');
  if (!host) {
    transporter = null;
    return null;
  }
  const port = Number(env('SMTP_PORT') || 587);
  transporter = nodemailer.createTransport({
    host,
    port,
    secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : port === 465,
    auth: env('SMTP_USER') ? { user: env('SMTP_USER')!, pass: env('SMTP_PASS') ?? '' } : undefined,
    connectionTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export const mailEnabled = () => Boolean(env('SMTP_HOST'));

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

/** Sends one message; returns false (and logs) instead of throwing. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = transport();
  if (!t) {
    console.warn(`[mail] SMTP not configured — skipped "${mail.subject}" to ${mail.to}`);
    return false;
  }
  try {
    const info = await t.sendMail({
      from: env('SMTP_FROM') || `Élaré Beauty <${env('SMTP_USER')}>`,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      replyTo: mail.replyTo ?? env('SUPPORT_EMAIL') ?? undefined,
    });
    console.log(`[mail] sent "${mail.subject}" to ${mail.to} (${info.messageId})`);
    return true;
  } catch (e) {
    console.error(`[mail] failed "${mail.subject}" to ${mail.to}:`, (e as Error).message);
    return false;
  }
}
