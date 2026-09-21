import { create } from 'zustand';
import { api } from '@/lib/api';
import { toast } from '@elare/ui';

interface WishlistState {
  ids: string[];
  loaded: boolean;
  load: () => Promise<void>;
  reset: () => void;
  has: (productId: string) => boolean;
  toggle: (productId: string, variantId?: string | null, productName?: string) => Promise<boolean>;
}

export const useWishlist = create<WishlistState>((set, get) => ({
  ids: [],
  loaded: false,
  async load() {
    try {
      const w = await api.wishlist();
      set({ ids: w.product_ids ?? [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  reset: () => set({ ids: [], loaded: false }),
  has: (id) => get().ids.includes(id),
  async toggle(productId, variantId, productName) {
    const had = get().has(productId);
    // optimistic
    set((s) => ({ ids: had ? s.ids.filter((x) => x !== productId) : [...s.ids, productId] }));
    try {
      const r = await api.toggleWishlist(productId, variantId);
      set((s) => ({ ids: r.added ? Array.from(new Set([...s.ids, productId])) : s.ids.filter((x) => x !== productId) }));
      toast({ title: r.added ? 'Saved to your wishlist' : 'Removed from wishlist', description: productName, variant: 'default' });
      return r.added;
    } catch (e) {
      set((s) => ({ ids: had ? [...s.ids, productId] : s.ids.filter((x) => x !== productId) }));
      toast({ title: 'Could not update wishlist', description: (e as Error).message, variant: 'error' });
      return had;
    }
  },
}));
