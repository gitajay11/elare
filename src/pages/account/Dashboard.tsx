import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Heart, Package, Sparkles, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { Seo } from '@/lib/seo';
import { money, formatDate, ORDER_STATUS_LABEL } from '@/lib/format';
import { ProductGrid } from '@/components/product/ProductGrid';
import { Skeleton, StatusPill } from '@/components/ui/Primitives';

export default function AccountDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard });
  if (isLoading || !data) return <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  const tiles = [
    { to: '/account/loyalty', icon: Sparkles, label: 'Available points', value: (data.loyalty?.available ?? 0).toLocaleString('en-IN'), hint: `${(data.loyalty?.lifetime ?? 0).toLocaleString('en-IN')} earned lifetime` },
    { to: '/account/wishlist', icon: Heart, label: 'Wishlist', value: String(data.wishlist_count), hint: 'saved products' },
    { to: '/account/coupons', icon: Tag, label: 'Active coupons', value: String(data.active_coupons), hint: 'ready to use' },
  ];
  return (
    <div className="space-y-8">
      <Seo title="My account" noindex />
      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="group rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-soft">
            <div className="flex items-center justify-between"><span className="grid h-9 w-9 place-items-center rounded-full bg-blush text-rose"><t.icon size={16} /></span><ArrowRight size={16} className="text-mist transition-transform group-hover:translate-x-1" /></div>
            <p className="mt-4 font-display text-4xl leading-none">{t.value}</p>
            <p className="mt-1 text-[12.5px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{t.label}</p>
            <p className="text-[12.5px] text-mist">{t.hint}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex items-center justify-between"><h2 className="text-2xl">Recent order</h2><Link to="/account/orders" className="text-[12.5px] font-semibold uppercase tracking-[0.14em] text-rose">All orders ({data.order_count})</Link></div>
        {data.recent_order ? (
          <Link to={`/account/orders/${data.recent_order.id}`} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-ivory p-4 hover:bg-blush/40">
            <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-white text-rose"><Package size={16} /></span><div><p className="font-semibold">{data.recent_order.order_number}</p><p className="text-[12.5px] text-mist">{formatDate(data.recent_order.placed_at)} · {data.recent_order.item_count} items</p></div></div>
            <div className="flex items-center gap-3"><StatusPill status={data.recent_order.status} label={ORDER_STATUS_LABEL[data.recent_order.status]} /><span className="font-semibold">{money(data.recent_order.grand_total)}</span></div>
          </Link>
        ) : (
          <p className="mt-3 text-sm text-mist">No orders yet — your first one earns points from the very first rupee.</p>
        )}
      </section>

      {data.recommended.length > 0 && (
        <section>
          <h2 className="mb-5 text-2xl">Recommended for you</h2>
          <ProductGrid products={data.recommended} columns={4} />
        </section>
      )}
    </div>
  );
}
