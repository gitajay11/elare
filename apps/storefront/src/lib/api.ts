// The single gateway between the storefront and the backend: every call is an
// HTTP request to the Élaré API (apps/api) carrying the Neon Auth JWT. The UI
// never computes prices, discounts, stock or points — the API/database does.
import { createApiClient, qs, ApiError } from '@elare/utils';
import type {
  Address, CartItemInput, Coupon, HomePayload, Listing, ListingFilters, LoyaltyTx, Order, OrderSummary, ProductCard,
  ProductDetail, Profile, Quote, Review, StoreConfig, WishlistItem,
} from '@elare/types';
import { API_URL, accessToken } from './neon';

const http = createApiClient({ baseUrl: API_URL, getToken: accessToken });

/** Message safe to show to customers. */
export function friendly(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message.replace(/^.*?error:\s*/i, '') : 'Something went wrong';
}

export interface Suggestions {
  products: { id: string; slug: string; name: string; price: number; category: string; image: string | null }[];
  categories: { slug: string; name: string; subcategory: string | null; label: string }[];
}
export interface Dashboard {
  profile: Profile;
  recent_order: OrderSummary | null;
  order_count: number;
  loyalty: { available: number; lifetime: number; redeemed: number } | null;
  wishlist_count: number;
  active_coupons: number;
  recommended: ProductCard[];
}
export interface Loyalty {
  account: { available: number; lifetime: number; redeemed: number } | null;
  settings: StoreConfig['loyalty'];
  transactions: LoyaltyTx[];
}
export type MyReview = Review & { status: string; product: { name: string; slug: string; image: string | null } };

export const api = {
  // Public ------------------------------------------------------------------
  storeConfig: () => http.get<StoreConfig>('/store/config'),
  home: () => http.get<HomePayload>('/store/home'),
  listProducts: (p: { category?: string; subcategory?: string; query?: string; filters?: ListingFilters; sort?: string; page?: number; pageSize?: number }) =>
    http.get<Listing>(`/products${qs({ category: p.category, subcategory: p.subcategory, q: p.query, filters: p.filters, sort: p.sort, page: p.page, page_size: p.pageSize })}`),
  suggest: (query: string) => http.get<Suggestions>(`/products/suggest${qs({ q: query, limit: 6 })}`),
  product: async (slug: string) => {
    try {
      return await http.get<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  productCards: (ids: string[]) => (ids.length ? http.post<ProductCard[]>('/products/cards', { ids }) : Promise.resolve([])),
  quote: (items: CartItemInput[], coupon?: string | null, redeemPoints?: number) =>
    http.post<Quote>('/cart/quote', { items, coupon: coupon ?? null, redeem_points: redeemPoints ?? 0 }),
  subscribe: (email: string, source = 'footer') => http.post<{ status: 'subscribed' | 'already_subscribed' }>('/store/newsletter', { email, source }),

  // Account -----------------------------------------------------------------
  ensureProfile: (fullName?: string, phone?: string) => http.post<Profile>('/auth/profile', { full_name: fullName, phone }),
  updateProfile: (patch: { full_name?: string; phone?: string }) => http.patch<Profile>('/auth/profile', patch),
  dashboard: () => http.get<Dashboard>('/auth/dashboard'),
  addresses: () => http.get<Address[]>('/auth/addresses'),
  saveAddress: (a: Partial<Address>) => http.put<Address>('/auth/addresses', a),
  deleteAddress: (id: string) => http.delete<{ ok: true }>(`/auth/addresses/${id}`),

  // Cart / checkout / orders -----------------------------------------------
  syncCart: (items: CartItemInput[], replace = false) => http.put<CartItemInput[]>('/cart', { items, replace }),
  placeOrder: (p: { items: CartItemInput[]; address: Record<string, string>; paymentMethod: 'razorpay' | 'cod'; coupon?: string | null; redeemPoints?: number; note?: string }) =>
    http.post<{ order_id: string; order_number: string; grand_total: number; payment_method: string; status: string }>('/checkout/orders', {
      items: p.items, address: p.address, payment_method: p.paymentMethod, coupon: p.coupon ?? null, redeem_points: p.redeemPoints ?? 0, note: p.note,
    }),
  order: async (id: string) => {
    try {
      return await http.get<Order>(`/orders/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  myOrders: (page = 1, pageSize = 10) => http.get<{ items: OrderSummary[]; total: number }>(`/orders${qs({ page, page_size: pageSize })}`),
  cancelOrder: (id: string, reason?: string) => http.post<Order>(`/orders/${id}/cancel`, { reason }),
  requestRefund: (id: string, reason: string) => http.post<Order>(`/orders/${id}/refund-request`, { reason }),

  // Payments ----------------------------------------------------------------
  razorpayOrder: (orderId: string) =>
    http.post<{ key_id: string; razorpay_order_id: string; amount: number; currency: string; order_number: string; prefill: { name?: string; email?: string; contact?: string }; callback_url: string }>(
      '/payments/razorpay/order', { order_id: orderId }),
  razorpayReconcile: (orderId: string) => http.post<{ paid: boolean; already?: boolean }>('/payments/razorpay/reconcile', { order_id: orderId }),
  razorpayVerify: (body: { order_id: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
    http.post<{ ok: boolean }>('/payments/razorpay/verify', body),

  // Reviews / wishlist / loyalty / coupons ----------------------------------
  submitReview: (productId: string, rating: number, title: string, body: string, images: string[] = []) =>
    http.post<{ id: string; status: string; is_verified: boolean }>('/reviews', { product_id: productId, rating, title, body, images }),
  myReviews: () => http.get<MyReview[]>('/reviews/mine'),
  reviewable: () => http.get<ProductCard[]>('/reviews/reviewable'),
  deleteReview: (id: string) => http.delete<{ ok: true }>(`/reviews/${id}`),
  uploadReviewImage: (file: File) => upload(file, 'review'),
  toggleWishlist: (productId: string, variantId?: string | null) => http.post<{ added: boolean; count: number }>('/wishlist/toggle', { product_id: productId, variant_id: variantId ?? null }),
  wishlist: () => http.get<{ items: WishlistItem[]; product_ids: string[]; balance: number; redemption_enabled: boolean }>('/wishlist'),
  redeemWishlist: (productId: string, variantId: string, addressId: string) =>
    http.post<{ order_id: string; order_number: string; points_used: number }>('/wishlist/redeem', { product_id: productId, variant_id: variantId, address_id: addressId }),
  loyalty: () => http.get<Loyalty>('/loyalty'),
  myCoupons: () => http.get<Coupon[]>('/coupons/mine'),
};

/** Uploads a file through the API into the public media bucket and returns its URL. */
async function upload(file: File, scope: 'product' | 'review'): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('scope', scope);
  const r = await http.post<{ url: string }>('/media/uploads', form);
  return r.url;
}
