import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { WishlistItem } from '@/lib/types';
import { Seo } from '@/lib/seo';
import { money } from '@/lib/format';
import { toast } from '@/store/ui';
import { useWishlist } from '@/store/wishlist';
import { useAddToCart } from '@/hooks/useStore';
import { Button } from '@/components/ui/Button';
import { EmptyState, Price, Rating, Skeleton } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Overlay';
import { ProductImage } from '@/components/product/ProductImage';

export default function Wishlist() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['wishlist'], queryFn: api.wishlist });
  const toggle = useWishlist((s) => s.toggle);
  const addToCart = useAddToCart();
  const [redeeming, setRedeeming] = useState<WishlistItem | null>(null);

  if (isLoading || !data) return <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-40" />)}</div>;
  if (!data.items.length) return <><Seo title="Wishlist" noindex /><EmptyState icon={<Heart size={20} />} title="Your wishlist is empty" description="Tap the heart on any product to save it here — and redeem eligible favourites with your Élaré points." action={<Button to="/shop">Discover products</Button>} /></>;

  return (
    <div>
      <Seo title="Wishlist" noindex />
      {data.redemption_enabled && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-5 py-4 text-white">
          <p className="flex items-center gap-2 text-sm"><Sparkles size={16} className="text-pink" /> You have <b>{data.balance.toLocaleString('en-IN')} points</b> — redeem them for eligible wishlist products.</p>
          <Link to="/account/loyalty" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-pink">How it works</Link>
        </div>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.items.map((w) => {
          const shade = w.shades[0];
          const canAfford = data.balance >= w.points_required;
          return (
            <li key={w.wishlist_item_id} className="flex gap-4 rounded-2xl border border-line bg-white p-4">
              <Link to={`/product/${w.slug}`} className="w-28 shrink-0"><ProductImage src={w.image?.url} alt={w.name} shadeHex={shade?.hex} width={300} className="aspect-[4/5] rounded-xl" /></Link>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link to={`/product/${w.slug}`} className="font-semibold leading-snug hover:text-rose">{w.name}</Link>
                <Rating value={Number(w.rating)} count={w.review_count} size={11} className="mt-1" />
                <Price price={w.price} compareAt={w.compare_at_price} className="mt-1" size="sm" />
                {w.redeemable ? (
                  <p className="mt-1 text-[12px] text-rose">{w.points_required.toLocaleString('en-IN')} points to redeem{!canAfford && ` · ${(w.points_required - data.balance).toLocaleString('en-IN')} more needed`}</p>
                ) : data.redemption_enabled ? (
                  <p className="mt-1 text-[12px] text-mist">Not eligible for point redemption</p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <Button size="sm" disabled={!w.in_stock || !w.default_variant_id} onClick={() => addToCart(w, { id: w.variant_id ?? w.default_variant_id!, name: shade?.name ?? 'Default' }, 1, shade ?? null)}>{w.in_stock ? 'Add to bag' : 'Sold out'}</Button>
                  {w.redeemable && canAfford && w.in_stock && <Button size="sm" variant="soft" onClick={() => setRedeeming(w)}>Redeem with points</Button>}
                  <button type="button" onClick={async () => { await toggle(w.id, null, w.name); qc.invalidateQueries({ queryKey: ['wishlist'] }); }} className="text-[12px] font-semibold text-mist hover:text-danger">Remove</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <RedeemModal item={redeeming} onClose={() => setRedeeming(null)} />
    </div>
  );
}

function RedeemModal({ item, onClose }: { item: WishlistItem | null; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: api.addresses, enabled: !!item });
  const [addressId, setAddressId] = useState<string>('');
  const chosen = addressId || addresses?.find((a) => a.is_default)?.id || addresses?.[0]?.id || '';
  const redeem = useMutation({
    mutationFn: () => api.redeemWishlist(item!.id, item!.variant_id ?? item!.default_variant_id!, chosen),
    onSuccess: (r) => {
      toast({ title: 'Redeemed with points 🎉', description: `${r.points_used} points used. Order ${r.order_number} is confirmed.`, variant: 'success' });
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      qc.invalidateQueries({ queryKey: ['loyalty'] });
      useWishlist.getState().load();
      onClose();
      navigate(`/order/${r.order_id}/confirmation`);
    },
    onError: (e) => toast({ title: 'Could not redeem', description: (e as Error).message, variant: 'error' }),
  });
  return (
    <Modal open={!!item} onClose={onClose} title="Redeem with points" size="sm">
      {item && (
        <div className="space-y-4 text-sm">
          <p>Use <b>{item.points_required.toLocaleString('en-IN')} points</b> to receive <b>{item.name}</b> ({money(item.price)}) with free delivery. Points are validated and deducted securely when you confirm.</p>
          {addresses?.length ? (
            <div>
              <label htmlFor="redeem-address" className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Deliver to</label>
              <select id="redeem-address" value={chosen} onChange={(e) => setAddressId(e.target.value)} className="mt-2 h-11 w-full rounded-xl border border-line bg-white px-3 outline-none focus:border-rose">
                {addresses.map((a) => <option key={a.id} value={a.id}>{a.full_name} — {a.line1}, {a.city} {a.postal_code}</option>)}
              </select>
            </div>
          ) : (
            <p className="rounded-xl bg-blush/40 p-3 text-rose-deep">Add a delivery address first. <Link to="/account/addresses" className="underline">Manage addresses</Link></p>
          )}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={redeem.isPending} disabled={!chosen} onClick={() => redeem.mutate()}>Confirm redemption</Button></div>
        </div>
      )}
    </Modal>
  );
}
