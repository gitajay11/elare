/**
 * Order status emails — one template, per-status copy. Sent whenever an
 * order moves to a new status after confirmation (packed, shipped, delivered,
 * cancelled, refunds…). Shares the shell, timeline and item rows with the
 * confirmation email.
 */
import { C, SANS, SERIF, STEPS, button, esc, firstName, inr, itemRow, shell, timeline, when, type OrderEmail } from './order-confirmation';

export interface StatusCopy {
  subject: (o: OrderEmail) => string;
  eyebrow: string;
  title: (o: OrderEmail) => string;
  message: (o: OrderEmail) => string;
  /** Index into STEPS, or null to show a status pill instead of the timeline. */
  step: number | null;
  /** Primary button label; links to the tracking URL when one exists for shipping states, else the order page. */
  cta: string;
  tone: 'progress' | 'success' | 'neutral' | 'refund';
}

const refundNote = (o: OrderEmail) =>
  o.paymentMethod === 'cod'
    ? 'Nothing was charged for this order.'
    : `Your payment of ${inr(o.total)} will be returned to the original payment method; banks usually take 5–7 business days to show it.`;

export const STATUS_COPY: Record<string, StatusCopy> = {
  processing: {
    subject: (o) => `We're preparing your Élaré order ${o.orderNumber}`,
    eyebrow: 'In preparation',
    title: () => 'Your edit is being prepared.',
    message: (o) => `Our team has started putting order ${o.orderNumber} together. We'll let you know the moment it's packed and on its way.`,
    step: 0, cta: 'View your order', tone: 'progress',
  },
  packed: {
    subject: (o) => `Packed with care — order ${o.orderNumber}`,
    eyebrow: 'Packed',
    title: () => 'Packed with care.',
    message: (o) => `Order ${o.orderNumber} is boxed, wrapped and waiting for the courier. Your next email will have the tracking details.`,
    step: 1, cta: 'View your order', tone: 'progress',
  },
  shipped: {
    subject: (o) => `On its way: your Élaré order ${o.orderNumber} has shipped`,
    eyebrow: 'Shipped',
    title: () => 'It’s on its way.',
    message: (o) => `Order ${o.orderNumber} has left us${o.carrier ? ` with ${o.carrier}` : ''}. Track the parcel below — we'll email again when it's out for delivery.`,
    step: 2, cta: 'Track your parcel', tone: 'progress',
  },
  out_for_delivery: {
    subject: (o) => `Arriving today — order ${o.orderNumber} is out for delivery`,
    eyebrow: 'Out for delivery',
    title: () => 'Arriving today.',
    message: (o) => `The courier has order ${o.orderNumber} on board for delivery today. ${o.paymentMethod === 'cod' ? `Please keep ${inr(o.total)} ready — cash or UPI at the door.` : 'Keep your phone handy in case the courier calls.'}`,
    step: 2, cta: 'Track your parcel', tone: 'progress',
  },
  delivered: {
    subject: (o) => `Delivered — enjoy your Élaré order ${o.orderNumber}`,
    eyebrow: 'Delivered',
    title: (o) => `Delivered. Enjoy, ${firstName(o.customerName)}.`,
    message: (o) => `Order ${o.orderNumber} has been delivered. ${o.pointsEarned > 0 ? `${o.pointsEarned} Élaré points have been added to your account. ` : ''}We'd love to hear how the products work for you — reviews take a minute and help other customers choose.`,
    step: 3, cta: 'Write a review', tone: 'success',
  },
  cancelled: {
    subject: (o) => `Order ${o.orderNumber} has been cancelled`,
    eyebrow: 'Cancelled',
    title: () => 'Your order has been cancelled.',
    message: (o) => `Order ${o.orderNumber} is cancelled and any points you used are back in your account. ${refundNote(o)} If this wasn't you, reply to this email and we'll look into it right away.`,
    step: null, cta: 'View your order', tone: 'neutral',
  },
  refund_requested: {
    subject: (o) => `Refund request received — order ${o.orderNumber}`,
    eyebrow: 'Refund requested',
    title: () => 'We’ve received your refund request.',
    message: (o) => `Thanks for letting us know about order ${o.orderNumber}. We review every request within 2 business days and will email you as soon as it's approved.`,
    step: null, cta: 'View your order', tone: 'refund',
  },
  refund_initiated: {
    subject: (o) => `Refund initiated — order ${o.orderNumber}`,
    eyebrow: 'Refund initiated',
    title: () => 'Your refund is on its way.',
    message: (o) => `We've approved and initiated the refund for order ${o.orderNumber}. ${refundNote(o)}`,
    step: null, cta: 'View your order', tone: 'refund',
  },
  refund_processing: {
    subject: (o) => `Refund in progress — order ${o.orderNumber}`,
    eyebrow: 'Refund processing',
    title: () => 'Your refund is being processed.',
    message: (o) => `The refund for order ${o.orderNumber} is with the payment provider now. ${refundNote(o)}`,
    step: null, cta: 'View your order', tone: 'refund',
  },
  refunded: {
    subject: (o) => `Refund complete — order ${o.orderNumber}`,
    eyebrow: 'Refunded',
    title: () => 'Refund complete.',
    message: (o) => `${o.paymentMethod === 'cod' ? `The refund for order ${o.orderNumber} is complete.` : `${inr(o.total)} for order ${o.orderNumber} has been refunded to your original payment method.`} Thank you for your patience — we hope to see you again.`,
    step: null, cta: 'Continue shopping', tone: 'refund',
  },
};

const TONE = {
  progress: { bg: C.blush, fg: C.roseDeep },
  success: { bg: '#dff1e7', fg: C.success },
  neutral: { bg: C.nude, fg: C.inkSoft },
  refund: { bg: C.champagne, fg: '#6d5a2c' },
};

export const hasStatusEmail = (status: string) => status in STATUS_COPY;

export function statusSubject(o: OrderEmail, status: string): string {
  return STATUS_COPY[status]!.subject(o);
}

function trackingCard(o: OrderEmail): string {
  if (!o.trackingNumber && !o.trackingUrl) return '';
  return `<div style="margin-top:26px;background:${C.ivory};border:1px solid ${C.line};border-radius:18px;padding:16px 20px;text-align:left;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="middle" style="font-family:${SANS};font-size:13px;line-height:1.6;color:${C.inkSoft};">
        <span style="font-size:10.5px;letter-spacing:0.22em;text-transform:uppercase;color:${C.mist};font-weight:700;display:block;">Tracking</span>
        ${o.carrier ? `<span style="color:${C.ink};font-weight:700;">${esc(o.carrier)}</span>` : ''}${o.carrier && o.trackingNumber ? ' · ' : ''}${o.trackingNumber ? `<span style="font-family:Menlo,Consolas,monospace;color:${C.ink};">${esc(o.trackingNumber)}</span>` : ''}
      </td>
      ${o.trackingUrl ? `<td align="right" valign="middle" style="padding-left:12px;white-space:nowrap;"><a class="link" href="${esc(o.trackingUrl)}" style="font-family:${SANS};font-size:12.5px;font-weight:700;color:${C.rose};text-decoration:none;">Track parcel →</a></td>` : ''}
    </tr></table>
  </div>`;
}

export function renderStatusHtml(o: OrderEmail, status: string, note?: string | null): string {
  const copy = STATUS_COPY[status]!;
  const tone = TONE[copy.tone];
  const primaryHref = copy.cta === 'Continue shopping' ? `${o.storeUrl}/shop` : (copy.cta === 'Track your parcel' && o.trackingUrl) ? o.trackingUrl : o.orderUrl;
  const secondary = copy.cta === 'Continue shopping' ? button(o.orderUrl, 'View your order', false) : button(`${o.storeUrl}/shop`, 'Continue shopping', false);
  const statusBlock = copy.step === null
    ? `<div style="text-align:center;"><span style="display:inline-block;background:${tone.bg};color:${tone.fg};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.2em;text-transform:uppercase;border-radius:999px;padding:8px 16px;">${esc(copy.eyebrow)}</span></div>`
    : timeline(copy.step);
  const total = o.items.reduce((s, i) => s + i.quantity, 0);
  const content = `  <!-- Hero card -->
  <tr><td style="padding:0;">
    <div style="background:${C.white};border:1px solid ${C.line};border-radius:28px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:6px;background:linear-gradient(90deg,${C.blush},${C.rose},${C.champagne});font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pad" align="center" style="padding:40px 44px 8px;">
        <div style="font-family:${SANS};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${C.rose};font-weight:700;">Order ${esc(o.orderNumber)} · ${esc(copy.eyebrow)}</div>
        <h1 class="h1" style="font-family:${SERIF};font-size:40px;line-height:1.08;font-weight:500;color:${C.ink};margin:12px 0 0;letter-spacing:-0.01em;">${esc(copy.title(o))}</h1>
        <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.inkSoft};margin:14px 0 0;max-width:440px;">${esc(copy.message(o))}</p>
        ${note ? `<p style="font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.inkSoft};margin:14px auto 0;max-width:440px;font-style:italic;">“${esc(note)}”</p>` : ''}
        <p style="font-family:${SANS};font-size:12.5px;color:${C.mist};margin:12px 0 0;">Updated ${when(new Date())}</p>
      </td></tr>
      <tr><td class="pad" style="padding:30px 44px 8px;">${statusBlock}${['shipped', 'out_for_delivery'].includes(status) ? trackingCard(o) : ''}</td></tr>
      <tr><td class="pad" align="center" style="padding:30px 44px 40px;">
        ${button(primaryHref, copy.cta)}<span class="btn-gap" style="display:inline-block;width:10px;">&nbsp;</span>${secondary}
      </td></tr>
    </table>
    </div>
  </td></tr>

  <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Items -->
  <tr><td class="pad" style="background:${C.white};border:1px solid ${C.line};border-radius:28px;padding:30px 44px;">
    <div style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${C.mist};font-weight:700;">In this order · ${total} item${total === 1 ? '' : 's'}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${o.items.map(itemRow).join('')}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr>
      <td style="font-family:${SANS};font-size:14px;color:${C.inkSoft};font-weight:600;">${o.paymentMethod === 'cod' && !['delivered', 'cancelled', 'refunded'].includes(status) ? 'To pay on delivery' : 'Order total'}</td>
      <td align="right" style="font-family:${SANS};font-size:18px;color:${C.ink};font-weight:700;">${inr(o.total)}</td>
    </tr></table>
  </td></tr>`;
  return shell({ title: copy.subject(o), preheader: copy.message(o), storeUrl: o.storeUrl, orderUrl: o.orderUrl, supportEmail: o.supportEmail, orderNumber: o.orderNumber }, content);
}

export function renderStatusText(o: OrderEmail, status: string, note?: string | null): string {
  const copy = STATUS_COPY[status]!;
  return [
    'ÉLARÉ BEAUTY',
    '',
    `Order ${o.orderNumber} · ${copy.eyebrow}`,
    copy.title(o),
    '',
    copy.message(o),
    ...(note ? ['', `Note: ${note}`] : []),
    ...(copy.step !== null ? ['', `Progress: ${STEPS.map((s, i) => (i === copy.step ? `[${s}]` : i < copy.step! ? `${s} ✓` : s)).join(' → ')}`] : []),
    ...(o.trackingNumber || o.trackingUrl ? ['', `Tracking: ${[o.carrier, o.trackingNumber].filter(Boolean).join(' · ')}${o.trackingUrl ? `\n${o.trackingUrl}` : ''}`] : []),
    '',
    ...o.items.map((i) => `- ${i.name}${i.shade ? ` — ${i.shade}` : i.variant ? ` — ${i.variant}` : ''} × ${i.quantity}`),
    `Order total: ${inr(o.total)}`,
    '',
    `Your order: ${o.orderUrl}`,
    `Questions? Reply to this email or write to ${o.supportEmail}.`,
  ].join('\n');
}
