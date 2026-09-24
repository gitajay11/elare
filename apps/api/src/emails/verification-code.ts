/**
 * Sign-up verification code email. The code is shown in four soft tiles that
 * mirror the verification screen; it never appears in the subject line (so it
 * can't end up in logs or lock-screen previews).
 */
import { C, SANS, SERIF, esc, shell } from './order-confirmation';

export interface VerificationEmail {
  code: string;
  storeUrl: string;
  supportEmail: string;
  minutes: number;
}

export const verificationSubject = 'Your Élaré verification code';

export function renderVerificationHtml(v: VerificationEmail): string {
  const tiles = v.code.split('').map((d) =>
    `<td style="padding:0 5px;"><div style="width:52px;height:60px;line-height:60px;text-align:center;border-radius:14px;background:${C.ivory};border:1px solid ${C.blushDeep};font-family:${SERIF};font-size:32px;font-weight:600;color:${C.ink};">${esc(d)}</div></td>`,
  ).join('');
  const content = `  <tr><td style="padding:0;">
    <div style="background:${C.white};border:1px solid ${C.line};border-radius:28px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:6px;background:linear-gradient(90deg,${C.blush},${C.rose},${C.champagne});font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pad" align="center" style="padding:40px 44px 10px;">
        <div style="font-family:${SANS};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${C.rose};font-weight:700;">Verify your email</div>
        <h1 class="h1" style="font-family:${SERIF};font-size:36px;line-height:1.1;font-weight:500;color:${C.ink};margin:12px 0 0;">Your verification code</h1>
        <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.inkSoft};margin:14px auto 0;max-width:400px;">Enter this code on the Élaré sign-up screen to finish creating your account.</p>
      </td></tr>
      <tr><td align="center" style="padding:26px 24px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${tiles}</tr></table>
      </td></tr>
      <tr><td class="pad" align="center" style="padding:18px 44px 40px;">
        <p style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.mist};margin:0;">This code expires in ${v.minutes} minutes and can be used once.<br>If you didn't try to create an Élaré account, you can safely ignore this email.</p>
      </td></tr>
    </table>
    </div>
  </td></tr>`;
  return shell({
    title: verificationSubject,
    preheader: `Your Élaré verification code — it expires in ${v.minutes} minutes.`,
    storeUrl: v.storeUrl,
    orderUrl: v.storeUrl,
    supportEmail: v.supportEmail,
    orderNumber: '',
    reason: "You're receiving this because this address was used to create an Élaré Beauty account.",
  }, content);
}

export function renderVerificationText(v: VerificationEmail): string {
  return [
    'ÉLARÉ BEAUTY',
    '',
    'Your verification code',
    '',
    `  ${v.code.split('').join(' ')}`,
    '',
    `Enter it on the Élaré sign-up screen. It expires in ${v.minutes} minutes and can be used once.`,
    "If you didn't try to create an Élaré account, you can ignore this email.",
    '',
    `Questions? Write to ${v.supportEmail}.`,
  ].join('\n');
}
