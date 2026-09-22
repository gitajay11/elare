import { eq } from 'drizzle-orm';
import { orders, orderItems, products, profiles } from '@elare/db';
import { asOwner } from '../lib/db';
import { env } from '../lib/env';
import { mailEnabled, sendMail } from '../lib/mail';
import { renderHtml, renderText, subjectFor, type OrderEmail } from './order-confirmation';
import { hasStatusEmail, renderStatusHtml, renderStatusText, statusSubject } from './order-status';

const storeUrl = () => (env('STORE_URL') || 'https://www.elarebeauty.store').replace(/\/$/, '');
const supportEmail = () => env('SUPPORT_EMAIL') || env('SMTP_USER') || 'hello@elarebeauty.store';

/** Loads everything the confirmation template needs, reading as the owner (the caller's transaction is already committed). */
async function loadOrderEmail(orderId: string): Promise<{ to: string; data: OrderEmail } | null> {
  return asOwner(async (tx) => {
    const [row] = await tx.select({ o: orders, email: profiles.email, name: profiles.fullName })
      .from(orders).innerJoin(profiles, eq(profiles.id, orders.userId)).where(eq(orders.id, orderId));
    if (!row) return null;
    const items = await tx.select({ i: orderItems, slug: products.slug })
      .from(orderItems).leftJoin(products, eq(products.id, orderItems.productId)).where(eq(orderItems.orderId, orderId));
    const addr = (row.o.shippingAddress ?? {}) as OrderEmail['address'] & { email?: string };
    const base = storeUrl();
    const data: OrderEmail = {
      orderNumber: row.o.orderNumber,
      orderUrl: `${base}/account/orders/${row.o.id}`,
      storeUrl: base,
      supportEmail: supportEmail(),
      placedAt: row.o.placedAt,
      customerName: addr.full_name || row.name || '',
      status: row.o.status,
      paymentMethod: row.o.paymentMethod as OrderEmail['paymentMethod'],
      paymentStatus: row.o.paymentStatus,
      carrier: row.o.carrier,
      trackingNumber: row.o.trackingNumber,
      trackingUrl: row.o.trackingUrl,
      items: items
        .sort((a, b) => Number(a.i.isGift) - Number(b.i.isGift))
        .map(({ i, slug }) => ({
          name: i.productName, variant: i.variantName, shade: i.shadeName, shadeHex: i.shadeHex, imageUrl: i.imageUrl,
          productUrl: slug ? `${base}/product/${slug}` : null,
          quantity: i.quantity, unitPrice: Number(i.unitPrice), lineTotal: Number(i.lineTotal), isGift: i.isGift,
        })),
      subtotal: Number(row.o.subtotal),
      couponCode: row.o.couponCode,
      couponDiscount: Number(row.o.couponDiscount),
      pointsRedeemed: row.o.pointsRedeemed,
      pointsDiscount: Number(row.o.pointsDiscount),
      shipping: Number(row.o.shippingTotal),
      tax: Number(row.o.taxTotal),
      total: Number(row.o.grandTotal),
      pointsEarned: row.o.pointsEarned,
      address: addr,
      note: row.o.customerNote,
    };
    return { to: addr.email || row.email, data };
  });
}

/**
 * Emails the customer that their order is confirmed. Called once an order is
 * actually confirmed: immediately for COD, after settlement for online
 * payments. Never throws — a mail failure must not fail the checkout.
 */
/**
 * Emails the customer about a status change (packed, shipped, delivered,
 * cancelled, refunds…). `confirmed` sends the confirmation email instead;
 * statuses without copy (pending) send nothing. Never throws.
 */
export async function sendOrderStatusUpdate(orderId: string, status: string, note?: string | null): Promise<void> {
  if (status === 'confirmed') return sendOrderConfirmation(orderId);
  if (!hasStatusEmail(status)) return;
  if (!mailEnabled()) {
    console.warn(`[mail] SMTP not configured — no ${status} email for order ${orderId}`);
    return;
  }
  try {
    const loaded = await loadOrderEmail(orderId);
    if (!loaded) return;
    await sendMail({ to: loaded.to, subject: statusSubject(loaded.data, status), html: renderStatusHtml(loaded.data, status, note), text: renderStatusText(loaded.data, status, note) });
  } catch (e) {
    console.error(`[mail] ${status} email for ${orderId} failed:`, (e as Error).message);
  }
}

export async function sendOrderConfirmation(orderId: string): Promise<void> {
  if (!mailEnabled()) {
    console.warn(`[mail] SMTP not configured — no confirmation for order ${orderId}`);
    return;
  }
  try {
    const loaded = await loadOrderEmail(orderId);
    if (!loaded) return;
    await sendMail({ to: loaded.to, subject: subjectFor(loaded.data), html: renderHtml(loaded.data), text: renderText(loaded.data) });
  } catch (e) {
    console.error(`[mail] confirmation for ${orderId} failed:`, (e as Error).message);
  }
}
