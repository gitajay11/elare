// Shapes exchanged between the API and the apps. Numbers, stock, points and
// permissions are computed in the database (packages/db/migrations/0002_functions.sql).

export type OrderStatus =
  | 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'out_for_delivery'
  | 'delivered' | 'cancelled' | 'refund_requested' | 'refund_initiated' | 'refund_processing' | 'refunded';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cod';
export type PaymentMethod = 'razorpay' | 'cod' | 'points';
/**
 * percentage / fixed take an amount off the items; free_shipping waives the
 * delivery fee; set_total discounts the bag down to `value` with free delivery
 * (for testing payments).
 */
export type CouponType = 'percentage' | 'fixed' | 'free_shipping' | 'set_total';

export interface Shade { id: string; name: string; hex: string; undertone?: string | null; description?: string | null }
export interface ImageRef { url: string; alt: string }

export interface ProductCard {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  price: number;
  compare_at_price: number | null;
  discount_percent: number | null;
  is_best_seller: boolean;
  is_new: boolean;
  is_gift_only: boolean;
  finish: string | null;
  coverage: string | null;
  attributes: Record<string, unknown>;
  image: ImageRef | null;
  hover_image: ImageRef | null;
  shades: Shade[];
  shade_count: number;
  default_variant_id: string | null;
  variant_count: number;
  rating: number;
  review_count: number;
  units_sold: number;
  recent_buyers: number;
  in_stock: boolean;
  low_stock: boolean;
  category: { id: string; slug: string; name: string };
  subcategory: { id: string; slug: string; name: string } | null;
  created_at: string;
}

export interface Variant {
  id: string;
  sku: string;
  name: string;
  shade_id: string | null;
  options: Record<string, string | boolean | number>;
  price: number;
  in_stock: boolean;
  low_stock: boolean;
  stock_hint: number | null;
}

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  images: string[];
  is_verified: boolean;
  created_at: string;
  author: string;
  product?: { name: string; slug: string };
}

export interface ProductDetail {
  product: ProductCard & {
    description: string | null;
    benefits: string[];
    how_to_use: string | null;
    ingredients: string | null;
    size_label: string | null;
    suitability: string | null;
    video_url: string | null;
    loyalty_points: number | null;
    is_published: boolean;
  };
  shades: Shade[];
  variants: Variant[];
  images: { id: string; url: string; alt: string; shade_id: string | null }[];
  bundle_items: { variant_id: string; quantity: number; product_name: string; product_slug: string; variant_name: string; shade_hex: string | null; price: number; image: string | null }[];
  rating_distribution: Record<string, number>;
  reviews: Review[];
  recommendations: { also_like: ProductCard[]; complete_look: ProductCard[]; bought_together: ProductCard[] };
  coupons: { code: string; description: string | null; type: CouponType; value: number; min_order_value: number }[];
  can_review: boolean;
  my_review: { id: string; rating: number; title: string | null; body: string; status: string } | null;
  breadcrumb: ({ name: string; slug: string } | null)[];
}

export interface Facets {
  price: { min: number; max: number };
  finish: string[];
  coverage: string[];
  shade: { name: string; hex: string }[];
  has_waterproof: boolean;
  subcategories: { slug: string; name: string; count: number }[];
  has_best_sellers: boolean;
  has_new: boolean;
}

export interface Listing {
  items: ProductCard[];
  total: number;
  page: number;
  page_size: number;
  facets: Facets;
  category: { id: string; slug: string; name: string; description: string | null; image_url: string | null; subcategory: { slug: string; name: string; description: string | null } | null } | null;
}

export interface ListingFilters {
  price_min?: number;
  price_max?: number;
  rating_min?: number;
  in_stock?: boolean;
  best_seller?: boolean;
  is_new?: boolean;
  waterproof?: 'true' | 'false';
  finish?: string[];
  coverage?: string[];
  shade?: string[];
  subcategory?: string[];
}

export interface StoreConfig {
  currency: string;
  max_qty_per_line: number;
  shipping: { flat_rate: number; free_above: number };
  tax: { rate_percent: number; inclusive: boolean };
  loyalty: { points_per_rupee: number; point_value_rupees: number; min_redeem_points: number; max_redeem_percent: number; redemption_enabled: boolean; wishlist_redemption_enabled: boolean };
  social_proof: { enabled: boolean; window_days: number; min_count: number };
  gift_rule: { min_quantity: number; gift_name: string; gift_quantity: number } | null;
  categories: { id: string; slug: string; name: string; description: string | null; image_url: string | null; subcategories: { id: string; slug: string; name: string }[] }[];
}

export interface HomePayload {
  signature: ProductCard[];
  best_sellers: ProductCard[];
  new_arrivals: ProductCard[];
  categories: { id: string; slug: string; name: string; description: string | null; image_url: string | null; product_count: number }[];
  bought_together: { a: ProductCard; b: ProductCard; count: number }[];
  reviews: Review[];
  review_summary: { count: number; average: number };
}

export interface CartItemInput { variant_id: string; quantity: number }

export interface QuoteLine {
  variant_id: string;
  product_id?: string;
  slug?: string;
  product_name: string;
  variant_name?: string | null;
  shade_name?: string | null;
  shade_hex?: string | null;
  image_url?: string | null;
  unit_price: number;
  compare_at_price?: number | null;
  quantity: number;
  line_total: number;
  is_gift: boolean;
  available: number;
  issue: 'out_of_stock' | 'insufficient_stock' | 'unavailable' | null;
  points?: number;
}

export interface Quote {
  ok: boolean;
  lines: QuoteLine[];
  issues: { variant_id: string; code: string; message: string; available?: number }[];
  item_count: number;
  subtotal: number;
  coupon: { valid: boolean; code: string | null; discount: number; free_shipping?: boolean; message: string | null; description?: string | null; coupon_id?: string };
  gift: { unlocked: boolean; rule: { id: string; name: string; product_name: string; quantity: number; min_quantity: number; image: string | null } | null; next: { name: string; product_name: string; min_quantity: number; remaining: number; image: string | null } | null; line: QuoteLine | null };
  points: { balance: number; redeemable_max: number; requested: number; applied: number; discount: number; point_value: number; min_redeem: number; message: string | null; enabled: boolean };
  discount_total: number;
  shipping: number;
  free_shipping_threshold: number;
  tax: number;
  tax_inclusive: boolean;
  total: number;
  points_to_earn: number;
}

export interface Address {
  id: string;
  label: string | null;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

export interface OrderItem {
  id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  shade_name: string | null;
  shade_hex: string | null;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
  is_gift: boolean;
  points_earned: number;
  slug: string | null;
}

export interface Order {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  currency: string;
  subtotal: number;
  coupon_code: string | null;
  coupon_discount: number;
  points_redeemed: number;
  points_discount: number;
  shipping_total: number;
  tax_total: number;
  grand_total: number;
  points_earned: number;
  points_awarded: boolean;
  shipping_address: Record<string, string>;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  customer_note: string | null;
  cancel_reason: string | null;
  placed_at: string;
  updated_at: string;
  customer: { id: string; name: string | null; email: string; phone: string | null };
  items: OrderItem[];
  history: { status: OrderStatus; note: string | null; at: string }[];
  payment: { provider: PaymentMethod; status: PaymentStatus; provider_order_id: string | null; provider_payment_id: string | null; amount: number } | null;
}

export interface OrderSummary {
  id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  grand_total: number;
  placed_at: string;
  item_count: number;
  preview: { image_url: string | null; product_name: string }[];
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: 'customer' | 'admin';
  status: 'active' | 'suspended';
  email_verified: boolean;
}

export interface WishlistItem extends ProductCard {
  wishlist_item_id: string;
  variant_id: string | null;
  added_at: string;
  points_required: number;
  redeemable: boolean;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  type: CouponType;
  value: number;
  min_order_value: number;
  max_discount: number | null;
  scope: 'all' | 'products' | 'categories';
  product_ids: string[];
  category_ids: string[];
  first_order_only: boolean;
  starts_at: string;
  expires_at: string | null;
  usage_limit: number | null;
  per_user_limit: number;
  is_active: boolean;
  is_public: boolean;
  times_used?: number;
  discount_given?: number;
  revenue?: number;
  used?: boolean;
}

export interface LoyaltyTx { id: string; type: string; points: number; balance_after: number; description: string | null; created_at: string; order_number: string | null }

// ---------------------------------------------------------------------------
// Admin payloads
// ---------------------------------------------------------------------------
export interface AdminDashboard {
  totals: Record<string, number>;
  revenue_series: { date: string; revenue: number; orders: number }[];
  customer_series: { month: string; customers: number }[];
  top_products: { id: string; name: string; slug: string; units: number; revenue: number; image: string | null }[];
  category_performance: { name: string; slug: string; units: number; revenue: number }[];
  status_breakdown: Record<string, number>;
  recent_orders: AdminOrderRow[];
  low_stock_items: { variant_id: string; product: string; variant: string; quantity: number; threshold: number }[];
}
export interface AdminOrderRow { id: string; order_number: string; status: string; payment_status: string; payment_method?: string; grand_total: number; placed_at: string; customer: string | null; email: string; item_count?: number }
export interface AdminCustomerRow { id: string; full_name: string | null; email: string; phone: string | null; role: string; status: string; created_at: string; order_count: number; lifetime_spend: number; points: number }
export interface AdminCustomerDetail {
  profile: Profile & { created_at: string };
  lifetime_spend: number;
  loyalty: { available: number; lifetime: number; redeemed: number } | null;
  orders: { id: string; order_number: string; status: string; payment_status: string; grand_total: number; placed_at: string }[];
  wishlist: { id: string; name: string; slug: string }[];
  reviews: { id: string; rating: number; title: string | null; body: string; status: string; product: string; created_at: string }[];
  addresses: { city: string; state: string; postal_code: string }[];
  points_history: { type: string; points: number; description: string | null; created_at: string }[];
}
export interface InventoryRow { variant_id: string; sku: string; product_id: string; product: string; variant: string; shade_hex: string | null; quantity: number; threshold: number; is_active: boolean; updated_at: string | null; image: string | null }
export interface AdminProductRow { id: string; name: string; slug: string; price: number; compare_at_price: number | null; is_published: boolean; is_best_seller: boolean; is_new: boolean; category: string; subcategory: string | null; stock: number; units_sold: number; rating: number; review_count: number; variant_count: number; image: string | null; updated_at: string }
export interface AdminProductPayload {
  product: Record<string, unknown> & { id: string; slug: string; name: string; price: number; category_id: string };
  shades: { id: string; name: string; hex: string; undertone: string | null; description: string | null; sort_order: number; is_active: boolean }[];
  variants: { id: string; shade_id: string | null; sku: string; name: string; options: Record<string, unknown>; price_override: number | null; is_active: boolean; quantity: number; low_stock_threshold: number }[];
  images: { id: string; url: string; alt: string; shade_id: string | null; sort_order: number }[];
  bundle_items: { variant_id: string; quantity: number; label: string }[];
  recommendations: { product_id: string; kind: string; name: string }[];
}
export interface AdminProductSave {
  id?: string;
  product: Record<string, unknown>;
  shades: Partial<AdminProductPayload['shades'][number]>[];
  variants: Partial<AdminProductPayload['variants'][number]>[];
  images: { url: string; alt?: string; shade_id?: string | null }[];
  bundle_items?: { variant_id: string; quantity: number }[];
  recommendations?: { product_id: string; kind: string }[];
}
export interface AdminReview { id: string; rating: number; title: string | null; body: string; images: string[]; is_verified: boolean; status: string; created_at: string; product: { id: string; name: string; slug: string }; customer: { id: string; name: string | null; email: string } }
export interface GiftRule { id: string; name: string; min_quantity: number; gift_variant_id: string; gift_quantity: number; starts_at: string; ends_at: string | null; is_active: boolean; product_name?: string; variant_name?: string; stock?: number; issued?: number }
export interface AdminCategory { id: string; slug: string; name: string; description: string | null; image_url: string | null; sort_order: number; is_active: boolean }
export interface AdminSubcategory { id: string; category_id: string; slug: string; name: string; description: string | null; sort_order: number; is_active: boolean }
