const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n: number | string | null | undefined, exact = false) => {
  const v = Number(n ?? 0);
  return (exact || Math.round(v) !== v ? inrExact : inr).format(v);
};

export const formatDate = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', opts) : '';

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

export const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/**
 * Social-proof copy is derived only from real order/review data and only shown
 * once the count clears the admin-configured minimum.
 */
export function socialProof(p: { recent_buyers: number; units_sold: number; review_count: number; rating: number }, minCount: number, windowDays: number): string | null {
  if (p.recent_buyers >= minCount) return `${p.recent_buyers} people bought this in the last ${windowDays} days`;
  if (p.units_sold >= minCount) return `Loved by ${p.units_sold}+ customers`;
  if (p.review_count >= Math.max(3, Math.floor(minCount / 2)) && p.rating >= 4.5) return `Rated ${p.rating}★ by ${p.review_count} customers`;
  return null;
}

/** Rewrites CDN URLs to request an appropriate width; leaves unknown hosts untouched. */
export function imageUrl(url: string | null | undefined, width: number): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    if (u.hostname === 'images.unsplash.com') { u.searchParams.set('w', String(width)); u.searchParams.set('q', '80'); u.searchParams.set('auto', 'format'); u.searchParams.set('fit', 'crop'); return u.toString(); }
    if (u.hostname === 'images.pexels.com') { u.searchParams.set('w', String(width)); u.searchParams.set('auto', 'compress'); u.searchParams.set('cs', 'tinysrgb'); return u.toString(); }
    if (u.pathname.includes('/storage/v1/object/public/')) { return u.toString().replace('/object/public/', '/render/image/public/') + (u.search ? '&' : '?') + `width=${width}&quality=80`; }
    return url;
  } catch {
    return url;
  }
}

export function srcSet(url: string | null | undefined, widths = [400, 600, 800, 1200]): string | undefined {
  if (!url) return undefined;
  const first = imageUrl(url, widths[0]);
  if (first === url) return undefined; // unknown host: no resizing available
  return widths.map((w) => `${imageUrl(url, w)} ${w}w`).join(', ');
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Awaiting payment',
  confirmed: 'Confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refund_requested: 'Refund requested',
  refund_initiated: 'Refund initiated',
  refund_processing: 'Refund processing',
  refunded: 'Refunded',
};

export const ORDER_FLOW = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'] as const;

export const PAYMENT_LABEL: Record<string, string> = { pending: 'Unpaid', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', cod: 'Pay on delivery' };
export const METHOD_LABEL: Record<string, string> = { razorpay: 'Online (Razorpay)', cod: 'Cash on delivery', points: 'Élaré points' };

export function shadeContrast(hex: string): 'light' | 'dark' {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? 'light' : 'dark';
}
