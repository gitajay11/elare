import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['customer', 'admin']);
export const accountStatus = pgEnum('account_status', ['active', 'suspended']);
export const orderStatus = pgEnum('order_status', [
  'pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery',
  'delivered', 'cancelled', 'refund_requested', 'refund_initiated', 'refund_processing', 'refunded',
]);
export const paymentStatus = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded', 'cod']);
export const paymentMethod = pgEnum('payment_method', ['razorpay', 'cod', 'points']);
export const couponType = pgEnum('coupon_type', ['percentage', 'fixed', 'free_shipping', 'set_total']);
export const couponScope = pgEnum('coupon_scope', ['all', 'products', 'categories']);
export const reviewStatus = pgEnum('review_status', ['pending', 'approved', 'hidden']);
export const loyaltyTxType = pgEnum('loyalty_tx_type', ['earn', 'redeem', 'adjust', 'reversal', 'expire']);
export const recommendationKind = pgEnum('recommendation_kind', ['also_like', 'complete_look', 'bundle']);
export const inventoryReason = pgEnum('inventory_reason', ['initial', 'restock', 'sale', 'cancel', 'adjustment', 'gift', 'return']);
