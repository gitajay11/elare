/**
 * Order confirmation email. Pure functions of an `OrderEmail` payload so the
 * template can be previewed (`pnpm --filter @elare/api email:preview`) and
 * tested without a database.
 *
 * Email clients are a hostile runtime: table layout, inline styles, no JS.
 * "Interactive" here means what mail clients honour — hover states in Apple
 * Mail / iOS, tappable product rows, bulletproof buttons and deep links back
 * into the account area.
 */
export interface OrderEmailItem {
  name: string;
  variant: string | null;
  shade: string | null;
  shadeHex: string | null;
  imageUrl: string | null;
  productUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  isGift: boolean;
}

export interface OrderEmail {
  orderNumber: string;
  orderUrl: string;
  storeUrl: string;
  supportEmail: string;
  placedAt: Date;
  customerName: string;
  status: string;
  paymentMethod: 'razorpay' | 'cod' | 'points';
  paymentStatus: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  items: OrderEmailItem[];
  subtotal: number;
  couponCode: string | null;
  couponDiscount: number;
  pointsRedeemed: number;
  pointsDiscount: number;
  shipping: number;
  tax: number;
  total: number;
  pointsEarned: number;
  address: { full_name?: string; phone?: string; line1?: string; line2?: string; city?: string; state?: string; postal_code?: string };
  note: string | null;
}

// Brand tokens (packages/ui/src/styles.css) — hard-coded because emails can't load CSS.
const C = {
  ivory: '#fff9fa', white: '#ffffff', blush: '#f8dde5', blushDeep: '#f1c8d5', rose: '#b85c78', roseDeep: '#8f3f5a',
  champagne: '#ecdcc0', nude: '#f2e8e2', ink: '#241d20', inkSoft: '#5c5257', mist: '#8a7f84', line: '#efdde3', success: '#3d7a5a',
};
const SANS = "'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

export const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
export const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }).format(n);
export const when = (d: Date) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(d) + ' IST';
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

export const PAYMENT_LABEL: Record<OrderEmail['paymentMethod'], string> = { razorpay: 'Paid online via Razorpay', cod: 'Cash on delivery', points: 'Paid with Élaré points' };
export const STEPS = ['Confirmed', 'Packed', 'Shipped', 'Delivered'];
export { C, SANS, SERIF };

export function subjectFor(o: OrderEmail): string {
  return `Your Élaré order ${o.orderNumber} is confirmed ✨`;
}

/** Shows up as the inbox preview line. */
function preheader(o: OrderEmail): string {
  const n = o.items.reduce((s, i) => s + i.quantity, 0);
  return `Thank you, ${firstName(o.customerName)}. ${n} item${n === 1 ? '' : 's'} · ${inr(o.total)} · ${o.paymentMethod === 'cod' ? 'pay on delivery' : 'payment received'}.`;
}

/** Emblem + wordmark, linking home. The PNG is served by the storefront (pnpm icons). */
export function wordmark(storeUrl: string): string {
  return `<a href="${esc(storeUrl)}" style="text-decoration:none;display:inline-block;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="middle" style="padding-right:12px;"><img src="${esc(storeUrl)}/logo-email.png" width="56" height="56" alt="Élaré" style="display:block;width:56px;height:56px;border:0;" /></td>
        <td valign="middle" style="text-align:left;">
          <span style="font-family:${SERIF};font-size:28px;font-weight:600;letter-spacing:0.2em;color:${C.ink};line-height:1;display:block;">ÉLARÉ</span>
          <span style="font-family:${SANS};font-size:9.5px;letter-spacing:0.36em;color:${C.rose};text-transform:uppercase;display:block;margin-top:4px;">Beauty</span>
        </td>
      </tr></table>
    </a>`;
}

export function button(href: string, label: string, primary = true): string {
  const bg = primary ? C.ink : C.white;
  const fg = primary ? C.white : C.ink;
  const border = primary ? C.ink : C.line;
  return `<a href="${esc(href)}" class="btn ${primary ? 'btn-primary' : 'btn-ghost'}" style="display:inline-block;background:${bg};color:${fg};border:1px solid ${border};border-radius:999px;padding:14px 26px;font-family:${SANS};font-size:12.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;text-decoration:none;mso-padding-alt:0;"><!--[if mso]><i style="letter-spacing:26px;mso-font-width:-100%;mso-text-raise:20pt">&nbsp;</i><![endif]--><span style="mso-text-raise:10pt;">${esc(label)}</span><!--[if mso]><i style="letter-spacing:26px;mso-font-width:-100%">&nbsp;</i><![endif]--></a>`;
}

export function timeline(activeStep = 0): string {
  // Each step is [left connector | dot | right connector] so the line runs
  // through the centre of every dot regardless of the client's line-height.
  // Steps before `activeStep` render as done (filled), the active one glows.
  const cells = STEPS.map((label, i) => {
    const active = i === activeStep;
    const done = i < activeStep;
    const first = i === 0;
    const last = i === STEPS.length - 1;
    const dot = active
      ? `<span style="display:block;margin:0 auto;width:16px;height:16px;border-radius:50%;background:${C.rose};box-shadow:0 0 0 4px ${C.blush};"></span>`
      : done
        ? `<span style="display:block;margin:0 auto;width:12px;height:12px;border-radius:50%;background:${C.rose};"></span>`
        : `<span style="display:block;margin:0 auto;width:12px;height:12px;border-radius:50%;background:${C.white};border:2px solid ${C.blushDeep};"></span>`;
    const seg = (visible: boolean, state: 'done' | 'fade' | 'todo') =>
      `<td valign="middle" style="padding:0;"><div style="height:2px;line-height:2px;font-size:2px;background:${!visible ? 'transparent' : state === 'done' ? C.rose : state === 'fade' ? `linear-gradient(90deg,${C.rose},${C.blushDeep})` : C.blushDeep};">&nbsp;</div></td>`;
    return `<td valign="top" style="width:25%;padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${seg(!first, done || active ? 'done' : 'todo')}
        <td width="${active ? 24 : 16}" height="24" valign="middle" style="padding:0 4px;height:24px;">${dot}</td>
        ${seg(!last, done ? 'done' : active ? 'fade' : 'todo')}
      </tr></table>
      <div style="font-family:${SANS};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${active ? C.ink : done ? C.rose : C.mist};font-weight:${active ? 700 : 600};margin-top:12px;text-align:center;">${label}</div>
    </td>`;
  }).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
}

export function itemRow(i: OrderEmailItem): string {
  const img = i.imageUrl
    ? `<img src="${esc(i.imageUrl)}" width="64" height="80" alt="" style="display:block;width:64px;height:80px;object-fit:cover;border-radius:12px;background:${C.nude};border:0;" />`
    : `<div style="width:64px;height:80px;border-radius:12px;background:${C.nude};"></div>`;
  const shade = i.shade
    ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(i.shadeHex ?? C.blushDeep)};border:1px solid rgba(0,0,0,.08);vertical-align:-1px;margin-right:6px;"></span>${esc(i.shade)}`
    : i.variant ? esc(i.variant) : '';
  const name = i.productUrl ? `<a href="${esc(i.productUrl)}" style="color:${C.ink};text-decoration:none;">${esc(i.name)}</a>` : esc(i.name);
  const price = i.isGift
    ? `<span style="display:inline-block;background:${C.champagne};color:${C.ink};font-size:10.5px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;border-radius:999px;padding:4px 10px;">Gift</span>`
    : `<span style="font-weight:700;color:${C.ink};">${inr(i.lineTotal)}</span>`;
  return `<tr class="item">
    <td style="padding:14px 0;border-bottom:1px solid ${C.line};" valign="top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="64" valign="top" style="padding-right:16px;">${i.productUrl ? `<a href="${esc(i.productUrl)}">${img}</a>` : img}</td>
        <td valign="top" style="font-family:${SANS};font-size:14px;line-height:1.45;color:${C.ink};">
          <div style="font-weight:700;">${name}</div>
          ${shade ? `<div style="color:${C.inkSoft};font-size:13px;margin-top:2px;">${shade}</div>` : ''}
          <div style="color:${C.mist};font-size:12.5px;margin-top:6px;">Qty ${i.quantity}${i.isGift ? '' : ` · ${inr(i.unitPrice)} each`}</div>
        </td>
        <td width="90" align="right" valign="top" style="font-family:${SANS};font-size:14px;white-space:nowrap;">${price}</td>
      </tr></table>
    </td>
  </tr>`;
}

export function totals(o: OrderEmail): string {
  const row = (label: string, value: string, opts: { muted?: boolean; accent?: boolean; strong?: boolean } = {}) =>
    `<tr><td style="padding:6px 0;font-family:${SANS};font-size:${opts.strong ? 16 : 13.5}px;color:${opts.accent ? C.success : opts.muted ? C.mist : C.inkSoft};font-weight:${opts.strong ? 700 : 500};">${label}</td>
     <td align="right" style="padding:6px 0;font-family:${SANS};font-size:${opts.strong ? 20 : 13.5}px;color:${opts.accent ? C.success : C.ink};font-weight:${opts.strong ? 700 : 600};white-space:nowrap;">${value}</td></tr>`;
  const rows = [
    row('Subtotal', inr(o.subtotal)),
    o.couponCode && o.couponDiscount > 0 ? row(`Coupon ${esc(o.couponCode)}`, `− ${inr(o.couponDiscount)}`, { accent: true }) : '',
    o.couponCode && o.couponDiscount === 0 && o.shipping === 0 ? row(`Coupon ${esc(o.couponCode)}`, 'Free delivery', { accent: true }) : '',
    o.pointsRedeemed > 0 ? row(`${o.pointsRedeemed} Élaré points`, `− ${inr(o.pointsDiscount)}`, { accent: true }) : '',
    row('Delivery', o.shipping === 0 ? 'Complimentary' : inr(o.shipping)),
    o.tax > 0 ? row('Tax', inr(o.tax)) : '',
    `<tr><td colspan="2" style="padding:6px 0 0;"><div style="height:1px;background:${C.line};"></div></td></tr>`,
    row(o.paymentMethod === 'cod' ? 'To pay on delivery' : 'Total paid', inr(o.total), { strong: true }),
  ].join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`;
}

export interface ShellProps { title: string; preheader: string; storeUrl: string; orderUrl: string; supportEmail: string; orderNumber: string; helpLine?: string }

/** Document chrome shared by every order email: head, wordmark, footer. `content` is the card rows. */
export function shell(p: ShellProps, content: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(p.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Manrope:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${C.ivory}; -webkit-font-smoothing:antialiased; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; }
  a { color:${C.rose}; }
  .btn { transition: transform .15s ease, box-shadow .15s ease, background-color .15s ease; }
  .btn-primary:hover { background:${C.roseDeep} !important; border-color:${C.roseDeep} !important; box-shadow:0 12px 28px -14px rgba(143,63,90,.6); transform:translateY(-1px); }
  .btn-ghost:hover { border-color:${C.rose} !important; color:${C.rose} !important; }
  .item:hover td { background:${C.ivory}; }
  .item a:hover { color:${C.rose} !important; }
  .link:hover { color:${C.roseDeep} !important; }
  @media (max-width: 620px) {
    .wrap { width:100% !important; }
    .pad { padding-left:20px !important; padding-right:20px !important; }
    .h1 { font-size:32px !important; }
    .stack { display:block !important; width:100% !important; padding-right:0 !important; padding-bottom:18px !important; }
    .btn { display:block !important; text-align:center !important; }
    .btn-gap { display:block !important; height:10px !important; width:auto !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.ivory};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.ivory};">${esc(p.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.ivory};">
<tr><td align="center" style="padding:32px 16px 48px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

  <!-- Wordmark -->
  <tr><td align="center" style="padding:8px 0 28px;">
    ${wordmark(p.storeUrl)}
  </td></tr>

${content}

  <!-- Help -->
  <tr><td align="center" style="padding:34px 24px 0;font-family:${SANS};font-size:13px;line-height:1.7;color:${C.inkSoft};">
    ${p.helpLine ?? ''}
    Questions — reply to this email or write to <a class="link" href="mailto:${esc(p.supportEmail)}" style="color:${C.rose};font-weight:600;text-decoration:none;">${esc(p.supportEmail)}</a>.
  </td></tr>
  <tr><td align="center" style="padding:28px 24px 0;">
    <img src="${esc(p.storeUrl)}/logo-email.png" width="40" height="40" alt="Élaré" style="display:inline-block;width:40px;height:40px;border:0;" />
    <div style="font-family:${SERIF};font-size:18px;letter-spacing:0.22em;color:${C.ink};margin-top:6px;">ÉLARÉ</div>
    <div style="font-family:${SANS};font-size:11px;line-height:1.8;color:${C.mist};margin-top:4px;">Beauty, defined by you.<br><a class="link" href="${esc(p.storeUrl)}" style="color:${C.mist};text-decoration:none;">${esc(p.storeUrl.replace(/^https?:\/\//, ''))}</a> · <a class="link" href="${esc(p.storeUrl)}/pages/returns" style="color:${C.mist};text-decoration:none;">Returns</a> · <a class="link" href="${esc(p.storeUrl)}/pages/terms" style="color:${C.mist};text-decoration:none;">Terms</a></div>
    <div style="font-family:${SANS};font-size:10.5px;color:${C.mist};margin-top:10px;">You're receiving this because you placed order ${esc(p.orderNumber)} at Élaré Beauty.</div>
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export function renderHtml(o: OrderEmail): string {
  const a = o.address;
  const addressLines = [a.full_name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.postal_code ? ` ${a.postal_code}` : ''), a.phone]
    .filter((s) => s && s.trim()).map((s) => esc(s!)).join('<br>');
  const heading = o.paymentMethod === 'cod' ? 'Your order is confirmed.' : 'Payment received — your order is confirmed.';
  return shell(
    { title: subjectFor(o), preheader: preheader(o), storeUrl: o.storeUrl, orderUrl: o.orderUrl, supportEmail: o.supportEmail, orderNumber: o.orderNumber,
      helpLine: `Changed your mind? You can cancel from <a class="link" href="${esc(o.orderUrl)}" style="color:${C.rose};font-weight:600;text-decoration:none;">your order page</a> until it's packed.<br>` },
    `  <!-- Hero card -->
  <tr><td style="padding:0;">
    <div style="background:${C.white};border:1px solid ${C.line};border-radius:28px;overflow:hidden;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:6px;background:linear-gradient(90deg,${C.blush},${C.rose},${C.champagne});font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td class="pad" align="center" style="padding:40px 44px 8px;">
        <div style="display:inline-block;width:64px;height:64px;border-radius:50%;background:${C.blush};line-height:64px;text-align:center;">
          <span style="display:inline-block;width:20px;height:11px;border-left:3px solid ${C.rose};border-bottom:3px solid ${C.rose};transform:rotate(-45deg) translate(2px,-3px);"></span>
        </div>
        <div style="font-family:${SANS};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${C.rose};font-weight:700;margin-top:22px;">Order ${esc(o.orderNumber)}</div>
        <h1 class="h1" style="font-family:${SERIF};font-size:40px;line-height:1.08;font-weight:500;color:${C.ink};margin:12px 0 0;letter-spacing:-0.01em;">Thank you, ${esc(firstName(o.customerName))}.</h1>
        <p style="font-family:${SANS};font-size:15px;line-height:1.6;color:${C.inkSoft};margin:14px 0 0;max-width:420px;">${heading} We're preparing it with care and will email you at every step — packed, shipped, delivered.</p>
        <p style="font-family:${SANS};font-size:12.5px;color:${C.mist};margin:12px 0 0;">Placed ${when(o.placedAt)}</p>
      </td></tr>
      <tr><td class="pad" style="padding:30px 44px 8px;">${timeline()}</td></tr>
      <tr><td class="pad" align="center" style="padding:30px 44px 40px;">
        ${button(o.orderUrl, 'Track your order')}<span class="btn-gap" style="display:inline-block;width:10px;">&nbsp;</span>${button(o.storeUrl + '/shop', 'Continue shopping', false)}
      </td></tr>
    </table>
    </div>
  </td></tr>

  <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Items -->
  <tr><td class="pad" style="background:${C.white};border:1px solid ${C.line};border-radius:28px;padding:30px 44px;">
    <div style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${C.mist};font-weight:700;">Your edit</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">${o.items.map(itemRow).join('')}</table>
    <div style="margin-top:18px;">${totals(o)}</div>
    ${o.pointsEarned > 0 ? `<div style="margin-top:22px;background:${C.ivory};border:1px dashed ${C.blushDeep};border-radius:16px;padding:14px 18px;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.inkSoft};"><span style="color:${C.rose};font-weight:700;">✦ ${o.pointsEarned} Élaré points</span> will land in your account once this order is delivered.</div>` : ''}
  </td></tr>

  <tr><td style="height:16px;font-size:0;line-height:0;">&nbsp;</td></tr>

  <!-- Delivery + payment -->
  <tr><td class="pad" style="background:${C.white};border:1px solid ${C.line};border-radius:28px;padding:30px 44px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td class="stack" width="50%" valign="top" style="padding-right:20px;">
        <div style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${C.mist};font-weight:700;">Delivering to</div>
        <div style="font-family:${SANS};font-size:14px;line-height:1.6;color:${C.ink};margin-top:10px;">${addressLines}</div>
      </td>
      <td class="stack" width="50%" valign="top">
        <div style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${C.mist};font-weight:700;">Payment</div>
        <div style="font-family:${SANS};font-size:14px;line-height:1.6;color:${C.ink};margin-top:10px;">${PAYMENT_LABEL[o.paymentMethod]}<br><span style="color:${C.inkSoft};">${o.paymentMethod === 'cod' ? `Keep ${inr(o.total)} ready — our partner accepts cash and UPI at the door.` : `${inr(o.total)} received. Your receipt is in your account.`}</span></div>
        ${o.note ? `<div style="font-family:${SANS};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${C.mist};font-weight:700;margin-top:20px;">Your note</div><div style="font-family:${SANS};font-size:13.5px;line-height:1.6;color:${C.inkSoft};margin-top:8px;font-style:italic;">“${esc(o.note)}”</div>` : ''}
      </td>
    </tr></table>
  </td></tr>
`,
  );
}


export function renderText(o: OrderEmail): string {
  const a = o.address;
  const lines = [
    `ÉLARÉ BEAUTY`,
    ``,
    `Thank you, ${firstName(o.customerName)}. Order ${o.orderNumber} is confirmed.`,
    `Placed ${when(o.placedAt)}`,
    ``,
    `YOUR EDIT`,
    ...o.items.map((i) => `- ${i.name}${i.shade ? ` — ${i.shade}` : i.variant ? ` — ${i.variant}` : ''} × ${i.quantity}  ${i.isGift ? 'Gift' : inr(i.lineTotal)}`),
    ``,
    `Subtotal        ${inr(o.subtotal)}`,
    ...(o.couponCode ? [`Coupon ${o.couponCode}  ${o.couponDiscount > 0 ? `− ${inr(o.couponDiscount)}` : 'Free delivery'}`] : []),
    ...(o.pointsRedeemed > 0 ? [`Points          − ${inr(o.pointsDiscount)}`] : []),
    `Delivery        ${o.shipping === 0 ? 'Complimentary' : inr(o.shipping)}`,
    ...(o.tax > 0 ? [`Tax             ${inr(o.tax)}`] : []),
    `${o.paymentMethod === 'cod' ? 'To pay on delivery' : 'Total paid'}  ${inr(o.total)}`,
    ``,
    `DELIVERING TO`,
    [a.full_name, a.line1, a.line2, [a.city, a.state].filter(Boolean).join(', ') + (a.postal_code ? ` ${a.postal_code}` : ''), a.phone].filter(Boolean).join('\n'),
    ``,
    `PAYMENT: ${PAYMENT_LABEL[o.paymentMethod]}`,
    ...(o.pointsEarned > 0 ? [``, `${o.pointsEarned} Élaré points will be added once this order is delivered.`] : []),
    ``,
    `Track your order: ${o.orderUrl}`,
    `Questions? Reply to this email or write to ${o.supportEmail}.`,
  ];
  return lines.join('\n');
}
