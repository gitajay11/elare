// The single gateway between the UI and the backend. Every call here maps to
// a Postgres function (see db/migrations/0002_functions.sql) or an RLS-protected
// table via the Neon Data API, or to the Élaré API Function (payments, uploads).
// The UI never computes prices, discounts, stock or points.
import { client, apiFetch } from './neon';
import type {
  Address, CartItemInput, Coupon, HomePayload, Listing, ListingFilters, Order, OrderSummary, ProductCard,
  ProductDetail, Profile, Quote, Review, StoreConfig, WishlistItem, LoyaltyTx,
} from './types';

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args ?? {});
  if (error) throw new Error(friendly(error.message));
  return data as T;
}

/** Strips Postgres noise from error messages so they can be shown to customers. */
export function friendly(message: string): string {
  return message
    .replace(/^.*?error:\s*/i, '')
    .replace(/\s*\(SQLSTATE.*\)$/, '')
    .replace(/^authentication required$/i, 'Please sign in to continue.')
    .replace(/^forbidden$/i, 'You do not have permission to do that.')
    .replace(/^JWT expired$/i, 'Your session expired — please sign in again.')
    .replace(/^JWT token has expired$/i, 'Your session expired — please sign in again.');
}

// ---------------------------------------------------------------------------
// Storefront (public)
// ---------------------------------------------------------------------------
export const api = {
  storeConfig: () => rpc<StoreConfig>('get_store_config'),
  home: () => rpc<HomePayload>('get_home'),
  listProducts: (p: { category?: string; subcategory?: string; query?: string; filters?: ListingFilters; sort?: string; page?: number; pageSize?: number }) =>
    rpc<Listing>('list_products', {
      p_category: p.category ?? null,
      p_subcategory: p.subcategory ?? null,
      p_query: p.query ?? null,
      p_filters: p.filters ?? {},
      p_sort: p.sort ?? 'featured',
      p_page: p.page ?? 1,
      p_page_size: p.pageSize ?? 24,
    }),
  suggest: (query: string) => rpc<{ products: { id: string; slug: string; name: string; price: number; category: string; image: string | null }[]; categories: { slug: string; name: string; subcategory: string | null; label: string }[] }>('search_suggest', { p_query: query, p_limit: 6 }),
  product: (slug: string) => rpc<ProductDetail | null>('get_product', { p_slug: slug }),
  productCards: (ids: string[]) => (ids.length ? rpc<ProductCard[]>('get_product_cards', { p_ids: ids }) : Promise.resolve([])),
  quote: (items: CartItemInput[], coupon?: string | null, redeemPoints?: number) =>
    rpc<Quote>('quote_cart', { p_items: items, p_coupon_code: coupon ?? null, p_redeem_points: redeemPoints ?? 0 }),
  subscribe: (email: string, source = 'footer') => rpc<{ status: 'subscribed' | 'already_subscribed' }>('subscribe_newsletter', { p_email: email, p_source: source }),

  // -------------------------------------------------------------------------
  // Customer
  // -------------------------------------------------------------------------
  ensureProfile: (fullName?: string, phone?: string) => rpc<Profile>('ensure_profile', { p_full_name: fullName ?? null, p_phone: phone ?? null }),
  placeOrder: (p: { items: CartItemInput[]; address: Record<string, string>; paymentMethod: 'razorpay' | 'cod'; coupon?: string | null; redeemPoints?: number; note?: string }) =>
    rpc<{ order_id: string; order_number: string; grand_total: number; payment_method: string; status: string }>('place_order', {
      p_items: p.items, p_address: p.address, p_payment_method: p.paymentMethod, p_coupon_code: p.coupon ?? null, p_redeem_points: p.redeemPoints ?? 0, p_note: p.note ?? null,
    }),
  order: (id: string) => rpc<Order | null>('get_order', { p_order_id: id }),
  myOrders: (page = 1, pageSize = 10) => rpc<{ items: OrderSummary[]; total: number }>('list_my_orders', { p_page: page, p_page_size: pageSize }),
  cancelOrder: (id: string, reason?: string) => rpc<Order>('cancel_my_order', { p_order_id: id, p_reason: reason ?? null }),
  requestRefund: (id: string, reason: string) => rpc<Order>('request_refund', { p_order_id: id, p_reason: reason }),
  submitReview: (productId: string, rating: number, title: string, body: string, images: string[] = []) =>
    rpc<{ id: string; status: string; is_verified: boolean }>('submit_review', { p_product_id: productId, p_rating: rating, p_title: title, p_body: body, p_images: images }),
  myReviews: () => rpc<(Review & { status: string; product: { name: string; slug: string; image: string | null } })[]>('list_my_reviews'),
  reviewable: () => rpc<ProductCard[]>('reviewable_products'),
  toggleWishlist: (productId: string, variantId?: string | null) => rpc<{ added: boolean; count: number }>('toggle_wishlist', { p_product_id: productId, p_variant_id: variantId ?? null }),
  wishlist: () => rpc<{ items: WishlistItem[]; product_ids: string[]; balance: number; redemption_enabled: boolean }>('get_wishlist'),
  redeemWishlist: (productId: string, variantId: string, addressId: string) =>
    rpc<{ order_id: string; order_number: string; points_used: number }>('redeem_wishlist_item', { p_product_id: productId, p_variant_id: variantId, p_address_id: addressId }),
  syncCart: (items: CartItemInput[], replace = false) => rpc<CartItemInput[]>('sync_cart', { p_items: items, p_replace: replace }),
  dashboard: () => rpc<{ profile: Profile; recent_order: OrderSummary | null; order_count: number; loyalty: { available: number; lifetime: number; redeemed: number } | null; wishlist_count: number; active_coupons: number; recommended: ProductCard[] }>('get_my_dashboard'),
  loyalty: () => rpc<{ account: { available: number; lifetime: number; redeemed: number } | null; settings: StoreConfig['loyalty']; transactions: LoyaltyTx[] }>('get_my_loyalty'),
  myCoupons: () => rpc<Coupon[]>('list_my_coupons'),

  addresses: async () => {
    const { data, error } = await client.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at');
    if (error) throw new Error(friendly(error.message));
    return data as Address[];
  },
  saveAddress: async (a: Partial<Address> & { user_id?: string }) => {
    if (a.is_default) await client.from('addresses').update({ is_default: false }).neq('id', a.id ?? '00000000-0000-0000-0000-000000000000');
    const { data, error } = await client.from('addresses').upsert(a).select().single();
    if (error) throw new Error(friendly(error.message));
    return data as Address;
  },
  deleteAddress: async (id: string) => {
    const { error } = await client.from('addresses').delete().eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  profile: async (id: string) => {
    const { data, error } = await client.from('profiles').select('id, email, full_name, phone, avatar_url, role, status').eq('id', id).maybeSingle();
    if (error) throw new Error(friendly(error.message));
    return data as Profile | null;
  },
  updateProfile: async (id: string, patch: { full_name?: string; phone?: string }) => {
    const { error } = await client.from('profiles').update(patch).eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  deleteReview: async (id: string) => {
    const { error } = await client.from('reviews').delete().eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  uploadReviewImage: (_userId: string, file: File) => upload(file, 'review'),

  // -------------------------------------------------------------------------
  // Payments (Élaré API Function)
  // -------------------------------------------------------------------------
  razorpayOrder: (orderId: string) =>
    apiFetch<{ key_id: string; razorpay_order_id: string; amount: number; currency: string; order_number: string; prefill: { name?: string; email?: string; contact?: string } }>(
      '/payments/razorpay/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order_id: orderId }) }),
  razorpayVerify: (body: { order_id: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    apiFetch<{ ok: boolean }>('/payments/razorpay/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
};

/** Uploads a file through the API Function into the public media bucket and returns its URL. */
async function upload(file: File, scope: 'product' | 'review'): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('scope', scope);
  const r = await apiFetch<{ url: string }>('/uploads', { method: 'POST', body: form });
  return r.url;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminApi = {
  dashboard: () => rpc<AdminDashboard>('admin_dashboard'),
  orders: (p: { status?: string; query?: string; page?: number; pageSize?: number }) =>
    rpc<{ items: AdminOrderRow[]; total: number }>('admin_list_orders', { p_status: p.status ?? null, p_query: p.query ?? null, p_page: p.page ?? 1, p_page_size: p.pageSize ?? 20 }),
  updateOrder: (p: { orderId: string; status?: string; note?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string }) =>
    rpc<Order>('admin_update_order', { p_order_id: p.orderId, p_status: p.status ?? null, p_note: p.note ?? null, p_carrier: p.carrier ?? null, p_tracking_number: p.trackingNumber ?? null, p_tracking_url: p.trackingUrl ?? null }),
  customers: (p: { query?: string; page?: number; pageSize?: number }) =>
    rpc<{ items: AdminCustomerRow[]; total: number }>('admin_list_customers', { p_query: p.query ?? null, p_page: p.page ?? 1, p_page_size: p.pageSize ?? 20 }),
  customer: (id: string) => rpc<AdminCustomerDetail>('admin_customer_detail', { p_user_id: id }),
  setCustomerStatus: (id: string, status: 'active' | 'suspended') => rpc<void>('admin_set_customer_status', { p_user_id: id, p_status: status }),
  adjustPoints: (id: string, points: number, description: string) => rpc<{ balance: number }>('admin_adjust_points', { p_user_id: id, p_points: points, p_description: description }),
  adjustInventory: (variantId: string, delta: number, reason: string, note?: string) => rpc<{ quantity: number }>('admin_adjust_inventory', { p_variant_id: variantId, p_delta: delta, p_reason: reason, p_note: note ?? null }),
  inventory: (query?: string, lowOnly = false) => rpc<InventoryRow[]>('admin_inventory', { p_query: query ?? null, p_low_only: lowOnly }),
  inventoryHistory: (variantId: string) => rpc<{ id: string; delta: number; reason: string; reference: string | null; created_at: string; by: string | null }[]>('admin_inventory_history', { p_variant_id: variantId }),
  products: (p: { query?: string; category?: string; status?: string; page?: number; pageSize?: number }) =>
    rpc<{ items: AdminProductRow[]; total: number }>('admin_list_products', { p_query: p.query ?? null, p_category: p.category ?? null, p_status: p.status ?? null, p_page: p.page ?? 1, p_page_size: p.pageSize ?? 30 }),
  product: (id: string) => rpc<AdminProductPayload>('admin_get_product', { p_id: id }),
  saveProduct: (payload: AdminProductSave) => rpc<AdminProductPayload>('admin_save_product', { p: payload }),
  deleteProduct: (id: string) => rpc<void>('admin_delete_product', { p_id: id }),
  deleteCategory: (id: string) => rpc<void>('admin_delete_category', { p_id: id }),
  deleteSubcategory: (id: string) => rpc<void>('admin_delete_subcategory', { p_id: id }),
  reviews: (status?: string, verifiedOnly = false) => rpc<AdminReview[]>('admin_reviews', { p_status: status ?? null, p_verified_only: verifiedOnly }),
  setReviewStatus: async (id: string, status: 'approved' | 'hidden' | 'pending') => {
    const { error } = await client.from('reviews').update({ status }).eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  deleteReview: async (id: string) => {
    const { error } = await client.from('reviews').delete().eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  coupons: () => rpc<Coupon[]>('admin_coupon_stats'),
  saveCoupon: async (c: Partial<Coupon>) => {
    const { error } = await client.from('coupons').upsert({ ...c, code: c.code?.toUpperCase().trim() });
    if (error) throw new Error(friendly(error.message));
  },
  deleteCoupon: async (id: string) => {
    const { error } = await client.from('coupons').delete().eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  giftRules: () => rpc<GiftRule[]>('admin_gift_rules'),
  saveGiftRule: async (g: Partial<GiftRule>) => {
    const { id, name, min_quantity, gift_variant_id, gift_quantity, starts_at, ends_at, is_active } = g;
    const { error } = await client.from('gift_rules').upsert({ id, name, min_quantity, gift_variant_id, gift_quantity, starts_at, ends_at, is_active });
    if (error) throw new Error(friendly(error.message));
  },
  deleteGiftRule: async (id: string) => {
    const { error } = await client.from('gift_rules').delete().eq('id', id);
    if (error) throw new Error(friendly(error.message));
  },
  variantOptions: () => rpc<{ variant_id: string; product_id: string; label: string; price: number }[]>('admin_variant_options'),
  settings: () => rpc<Record<string, Record<string, unknown>>>('admin_settings'),
  updateSetting: (key: string, value: Record<string, unknown>) => rpc<Record<string, unknown>>('admin_update_setting', { p_key: key, p_value: value }),
  categories: async () => {
    const [{ data: cats, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
      client.from('categories').select('*').order('sort_order'),
      client.from('subcategories').select('*').order('sort_order'),
    ]);
    if (e1 || e2) throw new Error(friendly((e1 ?? e2)!.message));
    return { categories: cats as AdminCategory[], subcategories: subs as AdminSubcategory[] };
  },
  saveCategory: async (c: Partial<AdminCategory>) => {
    const { error } = await client.from('categories').upsert(c);
    if (error) throw new Error(friendly(error.message));
  },
  saveSubcategory: async (s: Partial<AdminSubcategory>) => {
    const { error } = await client.from('subcategories').upsert(s);
    if (error) throw new Error(friendly(error.message));
  },
  uploadProductMedia: (file: File) => upload(file, 'product'),
  newsletter: async () => {
    const { data, error } = await client.from('newsletter_subscribers').select('*').order('created_at', { ascending: false }).limit(200);
    if (error) throw new Error(friendly(error.message));
    return data as { id: string; email: string; source: string | null; created_at: string }[];
  },
};

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
