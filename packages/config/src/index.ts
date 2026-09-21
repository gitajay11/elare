// Shared, environment-independent configuration for every app and package.

export const BRAND = {
  name: 'Élaré Beauty',
  shortName: 'Élaré',
  tagline: 'Beauty, defined by you.',
  description: 'Discover Élaré Beauty — refined makeup designed to complement every complexion, mood, and moment.',
  currency: 'INR',
  locale: 'en-IN',
} as const;

/** Order lifecycle — the same list the database enforces in `_can_transition`. */
export const ORDER_STATUSES = [
  'pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery',
  'delivered', 'cancelled', 'refund_requested', 'refund_initiated', 'refund_processing', 'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Happy-path fulfilment flow shown on the tracking timeline. */
export const ORDER_FLOW = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered'] as const;

/** Admin-selectable transitions; mirrors `_can_transition` in the database. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'],
  out_for_delivery: ['delivered'],
  delivered: ['refund_requested'],
  refund_requested: ['refund_initiated', 'delivered'],
  refund_initiated: ['refund_processing', 'refunded'],
  refund_processing: ['refunded'],
  cancelled: [],
  refunded: [],
};

// Indexed by strings coming from the API, so keyed loosely; the literal below is checked against OrderStatus.
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
} satisfies Record<OrderStatus, string>;
export const PAYMENT_LABEL: Record<string, string> = { pending: 'Unpaid', paid: 'Paid', failed: 'Failed', refunded: 'Refunded', cod: 'Pay on delivery' };
export const METHOD_LABEL: Record<string, string> = { razorpay: 'Online (Razorpay)', cod: 'Cash on delivery', points: 'Élaré points' };

/** Defaults used while the store configuration is loading. Real values come from the database. */
export const DEFAULT_STORE_CONFIG = {
  currency: 'INR',
  max_qty_per_line: 10,
  shipping: { flat_rate: 79, free_above: 999 },
  tax: { rate_percent: 0, inclusive: true },
  loyalty: { points_per_rupee: 0.1, point_value_rupees: 0.25, min_redeem_points: 200, max_redeem_percent: 30, redemption_enabled: true, wishlist_redemption_enabled: true },
  social_proof: { enabled: true, window_days: 30, min_count: 5 },
  gift_rule: null as null | { min_quantity: number; gift_name: string; gift_quantity: number },
  categories: [] as { id: string; slug: string; name: string; description: string | null; image_url: string | null; subcategories: { id: string; slug: string; name: string }[] }[],
};

export const INDIAN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Chandigarh', 'Puducherry', 'Ladakh'] as const;

/** Upload limits enforced by the API; the admin/storefront use them for early feedback. */
export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm'],
} as const;
