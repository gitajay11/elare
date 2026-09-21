// Admin gateway to the Élaré API (apps/api, /admin/* routes). Every request
// carries the Neon Auth JWT; the API checks the caller is an active admin and
// the database enforces the same through RLS and `require_admin()`.
import { createApiClient, qs, ApiError } from '@elare/utils';
import type {
  AdminCategory, AdminCustomerDetail, AdminCustomerRow, AdminDashboard, AdminOrderRow, AdminProductPayload, AdminProductRow,
  AdminProductSave, AdminReview, AdminSubcategory, Coupon, GiftRule, InventoryRow, Order, Profile,
} from '@elare/types';
import { API_URL, accessToken } from './neon';

const http = createApiClient({ baseUrl: API_URL, getToken: accessToken });

export function friendly(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return err instanceof Error ? err.message : 'Something went wrong';
}

export interface NewsletterRow { id: string; email: string; source: string | null; created_at: string }
export interface InventoryMovement { id: string; delta: number; reason: string; reference: string | null; created_at: string; by: string | null }
export interface VariantOption { variant_id: string; product_id: string; label: string; price: number }

export const adminApi = {
  me: () => http.post<Profile>('/auth/profile', {}),
  dashboard: () => http.get<AdminDashboard>('/admin/dashboard'),

  // Orders --------------------------------------------------------------------
  orders: (p: { status?: string; query?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminOrderRow[]; total: number }>(`/admin/orders${qs({ status: p.status, q: p.query, page: p.page, page_size: p.pageSize })}`),
  order: async (id: string) => {
    try {
      return await http.get<Order>(`/admin/orders/${id}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  },
  updateOrder: (p: { orderId: string; status?: string; note?: string; carrier?: string; trackingNumber?: string; trackingUrl?: string }) =>
    http.patch<Order>(`/admin/orders/${p.orderId}`, { status: p.status, note: p.note, carrier: p.carrier, tracking_number: p.trackingNumber, tracking_url: p.trackingUrl }),

  // Customers -------------------------------------------------------------------
  customers: (p: { query?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminCustomerRow[]; total: number }>(`/admin/customers${qs({ q: p.query, page: p.page, page_size: p.pageSize })}`),
  customer: (id: string) => http.get<AdminCustomerDetail>(`/admin/customers/${id}`),
  setCustomerStatus: (id: string, status: 'active' | 'suspended') => http.patch<{ ok: true }>(`/admin/customers/${id}/status`, { status }),
  adjustPoints: (id: string, points: number, description: string) => http.post<{ balance: number }>(`/admin/customers/${id}/points`, { points, description }),
  newsletter: () => http.get<NewsletterRow[]>('/admin/customers/newsletter'),

  // Inventory -------------------------------------------------------------------
  inventory: (query?: string, lowOnly = false) => http.get<InventoryRow[]>(`/admin/inventory${qs({ q: query, low_only: lowOnly || undefined })}`),
  inventoryHistory: (variantId: string) => http.get<InventoryMovement[]>(`/admin/inventory/${variantId}/history`),
  adjustInventory: (variantId: string, delta: number, reason: string, note?: string) =>
    http.post<{ quantity: number }>(`/admin/inventory/${variantId}/adjust`, { delta, reason, note }),

  // Products & categories ---------------------------------------------------------
  products: (p: { query?: string; category?: string; status?: string; page?: number; pageSize?: number }) =>
    http.get<{ items: AdminProductRow[]; total: number }>(`/admin/products${qs({ q: p.query, category: p.category, status: p.status, page: p.page, page_size: p.pageSize })}`),
  product: (id: string) => http.get<AdminProductPayload>(`/admin/products/${id}`),
  saveProduct: (payload: AdminProductSave) => http.put<AdminProductPayload>('/admin/products', payload),
  deleteProduct: (id: string) => http.delete<{ ok: true }>(`/admin/products/${id}`),
  variantOptions: () => http.get<VariantOption[]>('/admin/products/variant-options'),
  uploadProductMedia: (file: File) => upload(file, 'product'),
  categories: () => http.get<{ categories: AdminCategory[]; subcategories: AdminSubcategory[] }>('/admin/categories'),
  saveCategory: (c: Partial<AdminCategory>) => http.put<AdminCategory>('/admin/categories', c),
  deleteCategory: (id: string) => http.delete<{ ok: true }>(`/admin/categories/${id}`),
  saveSubcategory: (s: Partial<AdminSubcategory>) => http.put<AdminSubcategory>('/admin/categories/subcategories', s),
  deleteSubcategory: (id: string) => http.delete<{ ok: true }>(`/admin/categories/subcategories/${id}`),

  // Reviews ---------------------------------------------------------------------
  reviews: (status?: string, verifiedOnly = false) => http.get<AdminReview[]>(`/admin/reviews${qs({ status, verified_only: verifiedOnly || undefined })}`),
  setReviewStatus: (id: string, status: 'approved' | 'hidden' | 'pending') => http.patch<{ ok: true }>(`/admin/reviews/${id}`, { status }),
  deleteReview: (id: string) => http.delete<{ ok: true }>(`/admin/reviews/${id}`),

  // Promotions ------------------------------------------------------------------
  coupons: () => http.get<Coupon[]>('/admin/coupons'),
  saveCoupon: (c: Partial<Coupon>) => http.put<Coupon>('/admin/coupons', c),
  deleteCoupon: (id: string) => http.delete<{ ok: true }>(`/admin/coupons/${id}`),
  giftRules: () => http.get<GiftRule[]>('/admin/gift-rules'),
  saveGiftRule: (g: Partial<GiftRule>) => {
    const { id, name, min_quantity, gift_variant_id, gift_quantity, starts_at, ends_at, is_active } = g;
    return http.put<GiftRule>('/admin/gift-rules', { id, name, min_quantity, gift_variant_id, gift_quantity, starts_at, ends_at, is_active });
  },
  deleteGiftRule: (id: string) => http.delete<{ ok: true }>(`/admin/gift-rules/${id}`),

  // Settings --------------------------------------------------------------------
  settings: () => http.get<Record<string, Record<string, unknown>>>('/admin/settings'),
  updateSetting: (key: string, value: Record<string, unknown>) => http.put<Record<string, unknown>>('/admin/settings', { key, value }),
};

async function upload(file: File, scope: 'product' | 'review'): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  form.append('scope', scope);
  const r = await http.post<{ url: string }>('/media/uploads', form);
  return r.url;
}

export type {
  AdminCategory, AdminCustomerDetail, AdminCustomerRow, AdminDashboard, AdminOrderRow, AdminProductPayload, AdminProductRow,
  AdminProductSave, AdminReview, AdminSubcategory, GiftRule, InventoryRow,
} from '@elare/types';
