import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { type ProductCard, type Quote, type StoreConfig, type Variant } from '@elare/types';
import { useAuth } from '@elare/ui';
import { toInputs, useCart, type CartSnapshot } from '@/features/cart/store';
import { useUi, toast } from '@/lib/ui-store';
import { useWishlist } from '@/features/wishlist/store';

const FALLBACK_CONFIG: StoreConfig = {
  currency: 'INR',
  max_qty_per_line: 10,
  shipping: { flat_rate: 79, free_above: 999 },
  tax: { rate_percent: 0, inclusive: true },
  loyalty: { points_per_rupee: 0.1, point_value_rupees: 0.25, min_redeem_points: 200, max_redeem_percent: 30, redemption_enabled: true, wishlist_redemption_enabled: true },
  social_proof: { enabled: true, window_days: 30, min_count: 5 },
  gift_rule: null,
  categories: [],
};

/** Public store settings + category tree. Cached for the session. */
export function useStoreConfig() {
  const q = useQuery({ queryKey: ['store-config'], queryFn: api.storeConfig, staleTime: 5 * 60_000 });
  return { config: q.data ?? FALLBACK_CONFIG, loading: q.isLoading, error: q.error };
}

/** Server-priced cart. Re-quotes whenever items, coupon, points or the signed-in user change. */
export function useQuote() {
  const { user } = useAuth();
  const items = useCart((s) => s.items);
  const coupon = useCart((s) => s.coupon);
  const redeemPoints = useCart((s) => s.redeemPoints);
  const inputs = useMemo(() => toInputs(items), [items]);
  const q = useQuery<Quote>({
    queryKey: ['quote', inputs, coupon, redeemPoints, user?.id ?? 'guest'],
    queryFn: () => api.quote(inputs, coupon, redeemPoints),
    enabled: inputs.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
  return { quote: inputs.length ? q.data : undefined, loading: q.isFetching, error: q.error as Error | null, refetch: q.refetch };
}

// Module-level so that mounting a second layout (e.g. checkout) never re-runs the merge.
let mergedForUser: string | null = null;
let mergeDone = false;

/** Keeps the local cart and the signed-in customer's server cart in step. */
export function useCartSync() {
  const { user } = useAuth();
  const items = useCart((s) => s.items);
  const replace = useCart((s) => s.replace);
  const clear = useCart((s) => s.clear);
  const load = useWishlist((s) => s.load);
  const resetWishlist = useWishlist((s) => s.reset);
  const qc = useQueryClient();

  useEffect(() => {
    if (user && mergedForUser !== user.id) {
      mergedForUser = user.id;
      mergeDone = false;
      // A guest cart is MERGED into the account cart; a cart that already belongs to
      // this account (page reload, second tab) is simply pushed as the latest truth.
      const local = useCart.getState();
      const alreadyOwned = local.ownerId === user.id;
      api.syncCart(toInputs(local.items), alreadyOwned)
        .then((server) => {
          const snapshots = useCart.getState().items;
          replace(server.map((s) => ({ ...s, snapshot: snapshots.find((l) => l.variant_id === s.variant_id)?.snapshot })));
          useCart.getState().setOwner(user.id);
          mergeDone = true;
        })
        .catch(() => {
          mergeDone = true;
        });
      load();
      qc.invalidateQueries({ queryKey: ['quote'] });
    }
    if (!user && mergedForUser) {
      mergedForUser = null;
      mergeDone = false;
      clear();
      resetWishlist();
      qc.clear();
    }
  }, [user, replace, clear, load, resetWishlist, qc]);

  // Push local changes up (debounced) once the initial merge has happened.
  useEffect(() => {
    if (!user || !mergeDone) return;
    const t = setTimeout(() => {
      api.syncCart(toInputs(items), true).catch(() => undefined);
    }, 600);
    return () => clearTimeout(t);
  }, [items, user]);
}

/** The one place "add to bag" happens: updates the cart, opens the drawer, celebrates gifts. */
export function useAddToCart() {
  const add = useCart((s) => s.add);
  const openCart = useUi((s) => s.openCart);
  const { config } = useStoreConfig();
  return (product: ProductCard | { id: string; slug: string; name: string; price: number; image?: { url: string } | null }, variant: Variant | { id: string; name: string; price?: number; shade_id?: string | null }, quantity = 1, shade?: { name: string; hex: string } | null, opts?: { silent?: boolean }) => {
    const snapshot: CartSnapshot = {
      product_id: product.id,
      slug: product.slug,
      name: product.name,
      variant_name: variant.name,
      shade_name: shade?.name ?? null,
      shade_hex: shade?.hex ?? null,
      image_url: 'image' in product && product.image ? product.image.url : null,
      price: ('price' in variant && typeof variant.price === 'number' ? variant.price : product.price) ?? product.price,
    };
    add(variant.id, quantity, snapshot, config.max_qty_per_line);
    if (!opts?.silent) {
      toast({ title: 'Added to your bag', description: shade ? `${product.name} · ${shade.name}` : product.name, image: snapshot.image_url, variant: 'success' });
      openCart();
    }
  };
}
