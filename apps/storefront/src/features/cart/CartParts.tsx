import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Gift, Sparkles, Tag, Trash2, X } from 'lucide-react';
import { type Quote, type QuoteLine } from '@elare/types';
import { money, imageUrl, cn } from '@elare/utils';
import { useCart, type CartLine } from '@/features/cart/store';
import { useAuth, QuantityStepper, Swatch, Skeleton } from '@elare/ui';
import { useStoreConfig } from '@/lib/hooks';

/** Merges the server quote (truth) with the local snapshot (instant render). */
export function useDisplayLines(quote: Quote | undefined, items: CartLine[]): QuoteLine[] {
  if (quote) return quote.lines;
  return items.map((i) => ({
    variant_id: i.variant_id,
    product_id: i.snapshot?.product_id,
    slug: i.snapshot?.slug,
    product_name: i.snapshot?.name ?? 'Item',
    variant_name: i.snapshot?.variant_name ?? null,
    shade_name: i.snapshot?.shade_name ?? null,
    shade_hex: i.snapshot?.shade_hex ?? null,
    image_url: i.snapshot?.image_url ?? null,
    unit_price: i.snapshot?.price ?? 0,
    quantity: i.quantity,
    line_total: (i.snapshot?.price ?? 0) * i.quantity,
    is_gift: false,
    available: 99,
    issue: null,
  }));
}

export function CartLines({ lines, compact, onNavigate }: { lines: QuoteLine[]; compact?: boolean; onNavigate?: () => void }) {
  const setQuantity = useCart((s) => s.setQuantity);
  const remove = useCart((s) => s.remove);
  const { config } = useStoreConfig();
  return (
    <ul className="divide-y divide-line">
      <AnimatePresence initial={false}>
        {lines.map((l) => (
          <motion.li
            key={l.variant_id + (l.is_gift ? '-gift' : '')}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
            className={cn('flex gap-4 py-4', l.issue && 'opacity-90')}
          >
            <Link to={l.slug ? `/product/${l.slug}` : '#'} onClick={onNavigate} className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-nude">
              {l.image_url ? <img src={imageUrl(l.image_url, 200)} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full" style={{ background: l.shade_hex ?? '#F8DDE5' }} />}
              {l.is_gift && <span className="absolute left-1 top-1 rounded-full bg-champagne px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-ink">Gift</span>}
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={l.slug ? `/product/${l.slug}` : '#'} onClick={onNavigate} className="block truncate text-[14.5px] font-semibold leading-snug hover:text-rose">{l.product_name}</Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
                    {l.shade_hex && <Swatch hex={l.shade_hex} name={l.shade_name ?? ''} size={11} />}
                    {l.shade_name ?? l.variant_name}
                    {l.shade_name && l.variant_name && !l.variant_name.startsWith(l.shade_name) ? ` · ${l.variant_name.replace(`${l.shade_name} · `, '')}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[14.5px] font-semibold">{l.is_gift ? <span className="text-success">Free</span> : money(l.line_total)}</p>
                  {l.is_gift && l.compare_at_price ? <s className="text-[11px] text-mist">{money(l.compare_at_price)}</s> : null}
                </div>
              </div>
              {l.issue && (
                <p className="mt-1 text-[12px] font-medium text-danger">
                  {l.issue === 'out_of_stock' ? 'Sold out — remove to continue' : l.issue === 'insufficient_stock' ? `Only ${l.available} available` : 'No longer available'}
                </p>
              )}
              {!l.is_gift && (
                <div className="mt-2 flex items-center justify-between">
                  <QuantityStepper value={l.quantity} onChange={(v) => setQuantity(l.variant_id, v, config.max_qty_per_line)} size="sm" max={Math.min(config.max_qty_per_line, l.available || config.max_qty_per_line)} />
                  <button type="button" onClick={() => remove(l.variant_id)} aria-label={`Remove ${l.product_name}`} className="grid h-8 w-8 place-items-center rounded-full text-mist hover:bg-blush/60 hover:text-danger">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
              {l.is_gift && !compact && <p className="mt-2 text-[12px] text-ink-soft">Added automatically with your order.</p>}
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}

export function GiftProgress({ quote, className }: { quote: Quote | undefined; className?: string }) {
  const { config } = useStoreConfig();
  const rule = config.gift_rule;
  if (!rule) return null;
  const count = quote?.item_count ?? 0;
  const unlocked = quote?.gift.unlocked ?? false;
  const remaining = quote?.gift.next?.remaining ?? Math.max(0, rule.min_quantity - count);
  const pct = Math.min(100, (count / rule.min_quantity) * 100);
  return (
    <div className={cn('rounded-2xl border border-champagne bg-[linear-gradient(135deg,#fff,#faf3e6)] p-4', className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-champagne text-ink"><Gift size={16} /></span>
        <p className="text-[13.5px] leading-snug">
          {unlocked ? (
            <><span className="font-semibold">🎁 You unlocked a free gift!</span> {rule.gift_name} is in your bag.</>
          ) : (
            <>Add <span className="font-semibold">{remaining} more {remaining === 1 ? 'product' : 'products'}</span> to receive a complimentary {rule.gift_name}.</>
          )}
        </p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <motion.div className="h-full rounded-full bg-[linear-gradient(90deg,#e8a7b8,#c9ad7a)]" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      </div>
    </div>
  );
}

export function CouponBox({ quote, className }: { quote: Quote | undefined; className?: string }) {
  const coupon = useCart((s) => s.coupon);
  const setCoupon = useCart((s) => s.setCoupon);
  const [code, setCode] = useState(coupon ?? '');
  useEffect(() => setCode(coupon ?? ''), [coupon]);
  const applied = quote?.coupon;
  return (
    <div className={className}>
      {applied?.valid ? (
        <div className="flex items-center justify-between rounded-xl border border-success/30 bg-success/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <Tag size={15} className="text-success" />
            <span className="font-semibold">{applied.code}</span>
            <span className="text-ink-soft">− {money(applied.discount)}</span>
          </div>
          <button type="button" onClick={() => setCoupon(null)} aria-label="Remove coupon" className="grid h-7 w-7 place-items-center rounded-full text-mist hover:text-danger"><X size={14} /></button>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); setCoupon(code); }} className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Coupon code" aria-label="Coupon code" className="h-11 flex-1 rounded-xl border border-line bg-white px-4 text-sm uppercase tracking-[0.08em] outline-none focus:border-rose" />
          <button type="submit" disabled={!code.trim()} className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white disabled:opacity-40">Apply</button>
        </form>
      )}
      {coupon && applied && !applied.valid && applied.message && <p className="mt-2 text-[12.5px] text-danger" role="alert">{applied.message}</p>}
    </div>
  );
}

export function PointsBox({ quote, className }: { quote: Quote | undefined; className?: string }) {
  const { user } = useAuth();
  const redeem = useCart((s) => s.redeemPoints);
  const setRedeem = useCart((s) => s.setRedeemPoints);
  const [value, setValue] = useState(redeem);
  useEffect(() => setValue(redeem), [redeem]);
  const pts = quote?.points;
  if (!user || !pts || !pts.enabled || pts.balance < 1) return null;
  const max = pts.redeemable_max;
  return (
    <div className={cn('rounded-2xl border border-line bg-white p-4', className)}>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-rose" /> Élaré points</p>
        <p className="text-[12.5px] text-ink-soft">Balance <span className="font-semibold text-ink">{pts.balance.toLocaleString('en-IN')}</span></p>
      </div>
      {max < pts.min_redeem ? (
        <p className="mt-2 text-[12.5px] text-mist">Redeem from {pts.min_redeem} points (up to {quote?.points ? Math.round((max / Math.max(1, pts.balance)) * 100) : 0}% of this order). Keep collecting!</p>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); setRedeem(value); }} className="mt-3 flex gap-2">
            <input type="number" min={0} max={max} step={50} value={value || ''} onChange={(e) => setValue(Number(e.target.value))} placeholder={`Up to ${max}`} aria-label="Points to redeem" className="h-10 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-rose" />
            <button type="button" onClick={() => { setValue(max); setRedeem(max); }} className="h-10 rounded-xl border border-line px-3 text-[12px] font-semibold">Max</button>
            <button type="submit" className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white">Apply</button>
          </form>
          <p className="mt-2 text-[12px] text-mist">{max.toLocaleString('en-IN')} points = {money(max * pts.point_value)} off. {pts.applied > 0 && <span className="text-success">Applying {pts.applied} points (− {money(pts.discount)}).</span>}</p>
          {pts.message && <p className="mt-1 text-[12px] text-rose">{pts.message}</p>}
        </>
      )}
    </div>
  );
}

export function Totals({ quote, loading, className }: { quote: Quote | undefined; loading?: boolean; className?: string }) {
  if (!quote) return <div className={cn('space-y-2', className)}><Skeleton className="h-4" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-6 w-1/2" /></div>;
  const rows: [string, string, boolean?][] = [
    ['Subtotal', money(quote.subtotal)],
    ...(quote.coupon.valid ? [[`Coupon ${quote.coupon.code}`, `− ${money(quote.coupon.discount)}`, true] as [string, string, boolean]] : []),
    ...(quote.points.applied > 0 ? [[`${quote.points.applied} points`, `− ${money(quote.points.discount)}`, true] as [string, string, boolean]] : []),
    ['Shipping', quote.shipping === 0 ? 'Free' : money(quote.shipping)],
    ...(!quote.tax_inclusive && quote.tax > 0 ? [['Tax', money(quote.tax)] as [string, string]] : []),
  ];
  return (
    <div className={cn('space-y-2 text-sm transition-opacity', loading && 'opacity-60', className)}>
      {rows.map(([k, v, hi]) => (
        <div key={k} className="flex justify-between"><span className="text-ink-soft">{k}</span><span className={cn('font-medium', hi && 'text-success')}>{v}</span></div>
      ))}
      {quote.shipping > 0 && quote.free_shipping_threshold > 0 && (
        <p className="text-[12px] text-rose">Add {money(quote.free_shipping_threshold - (quote.subtotal - quote.discount_total))} more for free shipping.</p>
      )}
      <div className="flex items-baseline justify-between border-t border-line pt-3">
        <span className="text-base font-semibold">Total</span>
        <span className="text-xl font-semibold">{money(quote.total)}</span>
      </div>
      {quote.tax_inclusive && <p className="text-[11.5px] text-mist">Inclusive of all taxes.</p>}
      {quote.points_to_earn > 0 && <p className="text-[12px] text-ink-soft">You’ll earn <span className="font-semibold text-rose">{quote.points_to_earn} points</span> when this order is delivered.</p>}
    </div>
  );
}
