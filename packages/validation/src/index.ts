// Zod schemas shared by the API (request validation) and the apps (forms).
import { z } from 'zod';
import { INDIAN_STATES, ORDER_STATUSES } from '@elare/config';

const uuid = z.string().uuid();
const phone = z.string().transform((s) => s.replace(/\D/g, '')).pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'));
const email = z.string().trim().toLowerCase().email('Enter a valid email');

// ---------------------------------------------------------------------------
// Auth / profile
// ---------------------------------------------------------------------------
export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(2).max(80).optional(),
  phone: phone.optional(),
});
export const newsletterSchema = z.object({ email, source: z.string().max(40).optional() });

// ---------------------------------------------------------------------------
// Catalogue queries
// ---------------------------------------------------------------------------
export const listingFiltersSchema = z.object({
  price_min: z.coerce.number().nonnegative().optional(),
  price_max: z.coerce.number().nonnegative().optional(),
  rating_min: z.coerce.number().min(0).max(5).optional(),
  in_stock: z.boolean().optional(),
  best_seller: z.boolean().optional(),
  is_new: z.boolean().optional(),
  waterproof: z.enum(['true', 'false']).optional(),
  finish: z.array(z.string()).optional(),
  coverage: z.array(z.string()).optional(),
  shade: z.array(z.string()).optional(),
  subcategory: z.array(z.string()).optional(),
});
export const listingQuerySchema = z.object({
  category: z.string().optional(),
  subcategory: z.string().optional(),
  q: z.string().max(80).optional(),
  filters: listingFiltersSchema.optional(),
  sort: z.enum(['featured', 'best_selling', 'newest', 'rating', 'price_asc', 'price_desc', 'relevance']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  page_size: z.coerce.number().int().min(1).max(60).optional(),
});

// ---------------------------------------------------------------------------
// Cart / checkout
// ---------------------------------------------------------------------------
export const cartItemSchema = z.object({ variant_id: uuid, quantity: z.number().int().min(1).max(20) });
export const cartItemsSchema = z.array(cartItemSchema).max(50);
export const quoteSchema = z.object({
  items: cartItemsSchema,
  coupon: z.string().trim().max(32).nullable().optional(),
  redeem_points: z.number().int().min(0).optional(),
});
export const addressSchema = z.object({
  id: uuid.optional(),
  label: z.string().trim().max(40).nullable().optional(),
  full_name: z.string().trim().min(2, 'Enter your full name').max(80),
  phone,
  line1: z.string().trim().min(5, 'Enter your street address').max(160),
  line2: z.string().trim().max(160).nullable().optional(),
  city: z.string().trim().min(2, 'Enter your city').max(80),
  state: z.enum(INDIAN_STATES, { message: 'Select your state' }),
  postal_code: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
  country: z.string().length(2).default('IN'),
  is_default: z.boolean().optional(),
});
export const checkoutAddressSchema = addressSchema.omit({ id: true, label: true, is_default: true }).extend({ email });
export const placeOrderSchema = z.object({
  items: cartItemsSchema.min(1),
  address: checkoutAddressSchema,
  payment_method: z.enum(['razorpay', 'cod']),
  coupon: z.string().trim().max(32).nullable().optional(),
  redeem_points: z.number().int().min(0).optional(),
  note: z.string().trim().max(300).optional(),
});
export const razorpayVerifySchema = z.object({
  order_id: uuid,
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
export const reasonSchema = z.object({ reason: z.string().trim().max(300).optional() });

// ---------------------------------------------------------------------------
// Reviews / wishlist
// ---------------------------------------------------------------------------
export const reviewSchema = z.object({
  product_id: uuid,
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(80).optional(),
  body: z.string().trim().min(10, 'Please write at least a few words').max(1200),
  images: z.array(z.string().url()).max(3).optional(),
});
export const wishlistToggleSchema = z.object({ product_id: uuid, variant_id: uuid.nullable().optional() });
export const wishlistRedeemSchema = z.object({ product_id: uuid, variant_id: uuid, address_id: uuid });

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const orderUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  note: z.string().trim().max(300).optional(),
  carrier: z.string().trim().max(60).optional(),
  tracking_number: z.string().trim().max(80).optional(),
  tracking_url: z.string().url().optional(),
});
export const couponSchema = z.object({
  id: uuid.optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, 'Codes are 3–32 letters, digits, - or _'),
  description: z.string().trim().max(160).nullable().optional(),
  type: z.enum(['percentage', 'fixed', 'free_shipping', 'set_total']),
  value: z.number().nonnegative(),
  min_order_value: z.number().nonnegative().default(0),
  max_discount: z.number().positive().nullable().optional(),
  scope: z.enum(['all', 'products', 'categories']).default('all'),
  product_ids: z.array(uuid).default([]),
  category_ids: z.array(uuid).default([]),
  first_order_only: z.boolean().default(false),
  starts_at: z.string().datetime({ offset: true }).optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  per_user_limit: z.number().int().positive().default(1),
  is_active: z.boolean().default(true),
  is_public: z.boolean().default(false),
});
export const giftRuleSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(80),
  min_quantity: z.number().int().positive(),
  gift_variant_id: uuid,
  gift_quantity: z.number().int().positive().default(1),
  starts_at: z.string().datetime({ offset: true }).optional(),
  ends_at: z.string().datetime({ offset: true }).nullable().optional(),
  is_active: z.boolean().default(true),
});
export const categorySchema = z.object({
  id: uuid.optional(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(300).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
export const subcategorySchema = categorySchema.omit({ image_url: true }).extend({ category_id: uuid });
export const productSaveSchema = z.object({
  id: uuid.optional(),
  product: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(2).max(120),
    price: z.number().nonnegative(),
    category_id: uuid,
    subcategory_id: uuid.nullable().optional(),
    compare_at_price: z.number().nonnegative().nullable().optional(),
    loyalty_points: z.number().int().nonnegative().nullable().optional(),
    is_published: z.boolean().optional(),
    is_best_seller: z.boolean().optional(),
    is_new: z.boolean().optional(),
    is_gift_only: z.boolean().optional(),
    attributes: z.record(z.string(), z.unknown()).optional(),
  }).passthrough(),
  shades: z.array(z.object({ id: z.string().optional(), name: z.string().trim().min(1), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).passthrough()),
  variants: z.array(z.object({ id: z.string().optional(), sku: z.string().trim().min(1), name: z.string().trim().min(1), quantity: z.number().int().nonnegative().optional() }).passthrough()),
  images: z.array(z.object({ url: z.string().url(), alt: z.string().optional(), shade_id: z.string().nullable().optional() })),
  bundle_items: z.array(z.object({ variant_id: uuid, quantity: z.number().int().positive() })).optional(),
  recommendations: z.array(z.object({ product_id: uuid, kind: z.enum(['also_like', 'complete_look', 'bundle']) })).optional(),
});
export const inventoryAdjustSchema = z.object({ delta: z.number().int().refine((n) => n !== 0, 'Enter a non-zero amount'), reason: z.enum(['restock', 'adjustment', 'return']), note: z.string().trim().max(200).optional() });
export const pointsAdjustSchema = z.object({ points: z.number().int().refine((n) => n !== 0, 'Enter a non-zero amount'), description: z.string().trim().max(160).optional() });
export const reviewStatusSchema = z.object({ status: z.enum(['approved', 'hidden', 'pending']) });
export const customerStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });
export const settingSchema = z.object({ key: z.enum(['loyalty', 'shipping', 'tax', 'social_proof', 'store']), value: z.record(z.string(), z.unknown()) });

/** Turns a ZodError into a single human sentence for toasts / API responses. */
export function zodMessage(err: z.ZodError): string {
  const first = err.issues[0];
  return first ? `${first.path.length ? first.path.join('.') + ': ' : ''}${first.message}` : 'Invalid input';
}
export { z };
