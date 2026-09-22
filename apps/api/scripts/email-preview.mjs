// Renders the order emails with sample data into dist-functions/ so the
// design can be checked in a browser: email-preview.html (confirmation) and
// email-status-<status>.html for every status update.
//
//   pnpm --filter @elare/api email:preview            # online payment
//   pnpm --filter @elare/api email:preview -- --cod   # cash on delivery
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-functions', 'email-template.mjs');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(join(root, 'dist-functions', 'email-entry.mjs'), `export * from '../src/emails/order-confirmation'; export * as status from '../src/emails/order-status';`);
await build({ entryPoints: [join(root, 'dist-functions', 'email-entry.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error' });
const { renderHtml, renderText, subjectFor, status } = await import(pathToFileURL(out).href);

const sample = {
  orderNumber: 'EB-10042',
  orderUrl: 'https://www.elarebeauty.store/account/orders/00000000-0000-0000-0000-000000000000',
  storeUrl: 'https://www.elarebeauty.store',
  supportEmail: 'hello@elarebeauty.store',
  placedAt: new Date(),
  customerName: 'Loga Sri',
  status: 'confirmed',
  paymentMethod: process.argv.includes('--cod') ? 'cod' : 'razorpay',
  paymentStatus: 'paid',
  carrier: 'Delhivery', trackingNumber: 'DL4823910021IN', trackingUrl: 'https://www.delhivery.com/track/package/DL4823910021IN',
  items: [
    { name: 'The Lip Edit — Velvet Matte', variant: '01 Rose Nude', shade: '01 Rose Nude', shadeHex: '#C98A8E', imageUrl: 'https://images.pexels.com/photos/2533266/pexels-photo-2533266.jpeg?auto=compress&cs=tinysrgb&w=300', productUrl: 'https://www.elarebeauty.store/product/lip-edit-01-rose-nude', quantity: 2, unitPrice: 1799, lineTotal: 3598, isGift: false },
    { name: 'Precision Kohl — Waterproof', variant: 'Onyx', shade: 'Onyx', shadeHex: '#1B1B1F', imageUrl: 'https://images.pexels.com/photos/2536965/pexels-photo-2536965.jpeg?auto=compress&cs=tinysrgb&w=300', productUrl: 'https://www.elarebeauty.store/product/precision-kohl-onyx', quantity: 1, unitPrice: 649, lineTotal: 649, isGift: false },
    { name: 'Élaré Mini Lip Balm', variant: null, shade: null, shadeHex: null, imageUrl: 'https://images.pexels.com/photos/457701/pexels-photo-457701.jpeg?auto=compress&cs=tinysrgb&w=300', productUrl: null, quantity: 1, unitPrice: 0, lineTotal: 0, isGift: true },
  ],
  subtotal: 4247, couponCode: 'WELCOME10', couponDiscount: 424.7, pointsRedeemed: 200, pointsDiscount: 50, shipping: 0, tax: 0, total: 3772.3, pointsEarned: 377,
  address: { full_name: 'Loga Sri', phone: '98765 43210', line1: '14, Lakshmi Nagar, 2nd Cross Street', line2: 'Near Ganesh Temple', city: 'Chennai', state: 'Tamil Nadu', postal_code: '600041' },
  note: 'Please gift-wrap the lipsticks.',
};

const html = renderHtml(sample);
writeFileSync(join(root, 'dist-functions', 'email-preview.html'), html);
writeFileSync(join(root, 'dist-functions', 'email-preview.txt'), renderText(sample));
console.log(`Subject: ${subjectFor(sample)}`);
for (const st of Object.keys(status.STATUS_COPY)) {
  writeFileSync(join(root, 'dist-functions', `email-status-${st}.html`), status.renderStatusHtml({ ...sample, status: st }, st, st === 'packed' ? 'We added a sample of the new Velvet Balm — enjoy!' : null));
}
console.log(`status previews: ${Object.keys(status.STATUS_COPY).join(', ')}`);
console.log(`wrote ${join(root, 'dist-functions', 'email-preview.html')} (${(html.length / 1024).toFixed(0)} KB)`);
