import { boolean, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, uuid, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { couponScope, couponType, loyaltyTxType, orderStatus, paymentMethod, paymentStatus, reviewStatus } from './enums';
import { profiles } from './identity';
import { products, productVariants } from './catalog';

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------
export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  code: text('code').notNull().unique(),
  description: text('description'),
  type: couponType('type').notNull(),
  value: numeric('value', { precision: 12, scale: 2 }).notNull(),
  minOrderValue: numeric('min_order_value', { precision: 12, scale: 2 }).notNull().default('0'),
  maxDiscount: numeric('max_discount', { precision: 12, scale: 2 }),
  scope: couponScope('scope').notNull().default('all'),
  productIds: uuid('product_ids').array().notNull().default(sql`'{}'`),
  categoryIds: uuid('category_ids').array().notNull().default(sql`'{}'`),
  firstOrderOnly: boolean('first_order_only').notNull().default(false),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  usageLimit: integer('usage_limit'),
  perUserLimit: integer('per_user_limit').notNull().default(1),
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const couponUsage = pgTable('coupon_usage', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  couponId: uuid('coupon_id').notNull().references(() => coupons.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').notNull(),
  discountAmount: numeric('discount_amount', { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('coupon_usage_coupon_idx').on(t.couponId), index('coupon_usage_user_idx').on(t.userId, t.couponId)]);

export const giftRules = pgTable('gift_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  minQuantity: integer('min_quantity').notNull(),
  giftVariantId: uuid('gift_variant_id').notNull().references(() => productVariants.id),
  giftQuantity: integer('gift_quantity').notNull().default(1),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Orders — orders.status is the single source of truth
// ---------------------------------------------------------------------------
export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text('order_number').notNull().unique(),
  userId: uuid('user_id').notNull().references(() => profiles.id),
  status: orderStatus('status').notNull().default('pending'),
  paymentStatus: paymentStatus('payment_status').notNull().default('pending'),
  paymentMethod: paymentMethod('payment_method').notNull(),
  currency: text('currency').notNull().default('INR'),
  subtotal: numeric('subtotal', { precision: 12, scale: 2 }).notNull(),
  couponId: uuid('coupon_id').references(() => coupons.id, { onDelete: 'set null' }),
  couponCode: text('coupon_code'),
  couponDiscount: numeric('coupon_discount', { precision: 12, scale: 2 }).notNull().default('0'),
  pointsRedeemed: integer('points_redeemed').notNull().default(0),
  pointsDiscount: numeric('points_discount', { precision: 12, scale: 2 }).notNull().default('0'),
  shippingTotal: numeric('shipping_total', { precision: 12, scale: 2 }).notNull().default('0'),
  taxTotal: numeric('tax_total', { precision: 12, scale: 2 }).notNull().default('0'),
  grandTotal: numeric('grand_total', { precision: 12, scale: 2 }).notNull(),
  pointsEarned: integer('points_earned').notNull().default(0),
  pointsAwarded: boolean('points_awarded').notNull().default(false),
  shippingAddress: jsonb('shipping_address').notNull(),
  carrier: text('carrier'),
  trackingNumber: text('tracking_number'),
  trackingUrl: text('tracking_url'),
  customerNote: text('customer_note'),
  cancelReason: text('cancel_reason'),
  placedAt: timestamp('placed_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('orders_user_idx').on(t.userId, t.placedAt), index('orders_status_idx').on(t.status), index('orders_placed_idx').on(t.placedAt)]);

export const orderItems = pgTable('order_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  productName: text('product_name').notNull(),
  variantName: text('variant_name'),
  shadeName: text('shade_name'),
  shadeHex: text('shade_hex'),
  imageUrl: text('image_url'),
  unitPrice: numeric('unit_price', { precision: 12, scale: 2 }).notNull(),
  quantity: integer('quantity').notNull(),
  lineTotal: numeric('line_total', { precision: 12, scale: 2 }).notNull(),
  isGift: boolean('is_gift').notNull().default(false),
  pointsEarned: integer('points_earned').notNull().default(0),
}, (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_product_idx').on(t.productId)]);

export const orderStatusHistory = pgTable('order_status_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  status: orderStatus('status').notNull(),
  note: text('note'),
  changedBy: uuid('changed_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('order_status_history_order_idx').on(t.orderId, t.createdAt)]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  provider: paymentMethod('provider').notNull(),
  providerOrderId: text('provider_order_id'),
  providerPaymentId: text('provider_payment_id'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('INR'),
  status: paymentStatus('status').notNull().default('pending'),
  raw: jsonb('raw'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('payments_order_idx').on(t.orderId), index('payments_provider_order_idx').on(t.providerOrderId)]);

export const freeGifts = pgTable('free_gifts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  orderId: uuid('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  giftRuleId: uuid('gift_rule_id').references(() => giftRules.id, { onDelete: 'set null' }),
  variantId: uuid('variant_id').references(() => productVariants.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.orderId, t.giftRuleId)]);

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------
export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  rating: smallint('rating').notNull(),
  title: text('title'),
  body: text('body').notNull(),
  images: text('images').array().notNull().default(sql`'{}'`),
  isVerified: boolean('is_verified').notNull().default(false),
  status: reviewStatus('status').notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.productId, t.userId), index('reviews_product_idx').on(t.productId, t.status)]);

// ---------------------------------------------------------------------------
// Loyalty
// ---------------------------------------------------------------------------
export const loyaltyAccounts = pgTable('loyalty_accounts', {
  userId: uuid('user_id').primaryKey().references(() => profiles.id, { onDelete: 'cascade' }),
  availablePoints: integer('available_points').notNull().default(0),
  lifetimePoints: integer('lifetime_points').notNull().default(0),
  redeemedPoints: integer('redeemed_points').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTransactions = pgTable('loyalty_transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  type: loyaltyTxType('type').notNull(),
  points: integer('points').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'set null' }),
  description: text('description'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('loyalty_tx_user_idx').on(t.userId, t.createdAt)]);

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
