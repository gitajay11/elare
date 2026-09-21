import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type CartItemInput } from '@elare/types';

/** Display snapshot kept locally so the drawer renders instantly; the server quote overrides every number. */
export interface CartSnapshot {
  product_id: string;
  slug: string;
  name: string;
  variant_name: string | null;
  shade_name: string | null;
  shade_hex: string | null;
  image_url: string | null;
  price: number;
}

export interface CartLine extends CartItemInput {
  snapshot?: CartSnapshot;
}

interface CartState {
  items: CartLine[];
  coupon: string | null;
  redeemPoints: number;
  lastAddedAt: number;
  /** Account this cart was last synced with; null for a guest cart. */
  ownerId: string | null;
  add: (variantId: string, quantity: number, snapshot?: CartSnapshot, maxQty?: number) => void;
  setQuantity: (variantId: string, quantity: number, maxQty?: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setCoupon: (code: string | null) => void;
  setRedeemPoints: (points: number) => void;
  replace: (items: CartLine[]) => void;
  setOwner: (ownerId: string | null) => void;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      coupon: null,
      redeemPoints: 0,
      lastAddedAt: 0,
      ownerId: null,
      add: (variantId, quantity, snapshot, maxQty = 10) =>
        set((s) => {
          const existing = s.items.find((i) => i.variant_id === variantId);
          const items = existing
            ? s.items.map((i) => (i.variant_id === variantId ? { ...i, quantity: Math.min(maxQty, i.quantity + quantity), snapshot: snapshot ?? i.snapshot } : i))
            : [...s.items, { variant_id: variantId, quantity: Math.min(maxQty, quantity), snapshot }];
          return { items, lastAddedAt: Date.now() };
        }),
      setQuantity: (variantId, quantity, maxQty = 10) =>
        set((s) => ({
          items: quantity <= 0 ? s.items.filter((i) => i.variant_id !== variantId) : s.items.map((i) => (i.variant_id === variantId ? { ...i, quantity: Math.min(maxQty, quantity) } : i)),
        })),
      remove: (variantId) => set((s) => ({ items: s.items.filter((i) => i.variant_id !== variantId) })),
      clear: () => set({ items: [], coupon: null, redeemPoints: 0, ownerId: null }),
      setCoupon: (coupon) => set({ coupon: coupon ? coupon.trim().toUpperCase() : null }),
      setRedeemPoints: (redeemPoints) => set({ redeemPoints: Math.max(0, Math.floor(redeemPoints)) }),
      replace: (items) => set({ items }),
      setOwner: (ownerId) => set({ ownerId }),
    }),
    { name: 'elare-cart', partialize: (s) => ({ items: s.items, coupon: s.coupon, redeemPoints: s.redeemPoints, ownerId: s.ownerId }) },
  ),
);

export const selectCount = (s: CartState) => s.items.reduce((n, i) => n + i.quantity, 0);
export const toInputs = (items: CartLine[]): CartItemInput[] => items.map(({ variant_id, quantity }) => ({ variant_id, quantity }));
