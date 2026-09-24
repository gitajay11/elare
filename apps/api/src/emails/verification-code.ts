/**
 * Verification code email, for sign-up and for forgot password. The code is
 * shown in four soft tiles that mirror the verification screen; it never
 * appears in the subject line (so it can't end up in logs or lock-screen
 * previews).
 */
import { C, SANS, SERIF, esc, shell } from './order-confirmation';

export type CodePurpose = 'signup' | 'reset';

export interface VerificationEmail {
  code: string;
  storeUrl: string;
  supportEmail: string;
  minutes: number;
  purpose?: CodePurpose;
}

const COPY = {
  signup: {
    subject: 'Your Élaré verification code',
    eyebrow: 'Verify your email',
    heading: 'Your verification code',
    lead: 'Enter this code on the Élaré sign-up screen to finish creating your account.',
    ignore: "If you didn't try to create an Élaré account, you can safely ignore this email.",
    reason: "You're receiving this because this address was used to create an Élaré Beauty account.",
  },
  reset: {
    subject: 'Your Élaré password reset code',
    eyebrow: 'Reset your password',
    heading: 'Your password reset code',
    lead: 'Enter this code on the Élaré forgot-password screen to choose a new password.',
    ignore: "If you didn't ask to reset your password, you can safely ignore this email — your password won't change.",
    reason: "You're receiving this because a password reset was requested for the Élaré Beauty account at this address.",
  },
} as const;

export const verificationSubject = (purpose: CodePurpose = 'signup') => COPY[purpose].subject;

export function renderVerificationHtml(v: VerificationEmail): string {
  const t = COPY[v.purpose ?? 'signup'];
  const tiles = v.code.split('').map((d) =>
    `<td style="padding:0 5px;"><div style="width:52px;height:60px;line-height:60px;text-align:center;border-radius:14px;background:${C.ivory};border:1px solid ${C.blushDeep};font-family:${SERIF};font-size:32px;font-weight:600;color:${C.ink};">${esc(d)}</div></td>`,
  ).join('');
  const content = `  <tr><td style="padding:0;">
    <div style="background:${C.white};border:1px solid ${C.line};border-radius:28px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:6px;background:linear-gradient(90deg,${C.blush},${C.rose},${C.champagne});font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pad" align="center" style="padding:40px 44px 10px;">
        <div style="font-family:${SANS};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${C.rose};font-weight:700;">${t.eyebrow}</div>
        <h1 class="h1" style="font-family:${SERIF};font-size:36px;line-height:1.1;font-weight:500;color:${C.ink};margin:12px 0 0;">${t.heading}</h1>
        <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.inkSoft};margin:14px auto 0;max-width:400px;">${t.lead}</p>
      </td></tr>
      <tr><td align="center" style="padding:26px 24px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${tiles}</tr></table>
      </td></tr>
      <tr><td class="pad" align="center" style="padding:18px 44px 40px;">
        <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.mist};margin:0;">This code expires in ${v.minutes} minutes and can be used once.<br>${t.ignore}</p>
      </td></tr>
    </table>
    </div>
  </td></tr>`;
  return shell({
    title: t.subject,
    preheader: `${t.subject} — it expires in ${v.minutes} minutes.`,
    storeUrl: v.storeUrl,
    orderUrl: v.storeUrl,
    supportEmail: v.supportEmail,
    orderNumber: '',
    reason: t.reason,
  }, content);
}

export function renderVerificationText(v: VerificationEmail): string {
  const t = COPY[v.purpose ?? 'signup'];
  return [
    'ÉLARÉ BEAUTY',
    '',
    t.heading,
    '',
    `  ${v.code.split('').join(' ')}`,
    '',
    `${t.lead} It expires in ${v.minutes} minutes and can be used once.`,
    t.ignore,
    '',
    `Questions? Write to ${v.supportEmail}.`,
  ].join('\n');
}
