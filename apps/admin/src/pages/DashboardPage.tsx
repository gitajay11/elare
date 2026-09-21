import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { money, formatDate, ORDER_STATUS_LABEL } from '@elare/utils';
import { Skeleton, StatusPill } from '@elare/ui';
import { BarChart, ChartCard, LineChart, StatCard } from '@/components/Chart';
import { AdminHeader, Table } from '@/components/AdminLayout';

export default function AdminDashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard, refetchInterval: 60_000 });
  if (isLoading || !data) return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  const t = data.totals;
  const rev = data.revenue_series.map((d) => ({ label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: Number(d.revenue), sub: `${d.orders} orders` }));
  const ord = data.revenue_series.map((d) => ({ label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: Number(d.orders) }));
  return (
    <div>
      <AdminHeader title="Overview" description="Live figures from the database — nothing here is estimated." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="rose" label="Total revenue" value={money(t.revenue)} hint={`${money(t.revenue_30d)} in the last 30 days`} />
        <StatCard label="Orders" value={String(t.orders)} hint={`${t.pending_orders} awaiting fulfilment`} />
        <StatCard label="Customers" value={String(t.customers)} />
        <StatCard label="Products" value={String(t.products)} hint={`${t.published_products} published`} />
        <StatCard tone={t.low_stock > 0 ? 'warn' : 'plain'} label="Low stock" value={String(t.low_stock)} hint={`${t.out_of_stock} sold out`} />
        <StatCard tone={t.refund_requests > 0 ? 'warn' : 'plain'} label="Refund requests" value={String(t.refund_requests)} />
        <StatCard label="Coupon usage" value={String(t.coupon_uses)} hint={`${money(t.coupon_discount)} discounted`} />
        <StatCard label="Points issued" value={Number(t.points_issued).toLocaleString('en-IN')} hint={`${Number(t.points_redeemed).toLocaleString('en-IN')} redeemed`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue" subtitle="Last 30 days" data={rev} kind="money"><LineChart data={rev} kind="money" /></ChartCard>
        <ChartCard title="Orders" subtitle="Last 30 days" data={ord}><BarChart data={ord} /></ChartCard>
        <ChartCard title="Customer growth" subtitle="New accounts per month" data={data.customer_series.map((d) => ({ label: d.month, value: d.customers }))}><BarChart data={data.customer_series.map((d) => ({ label: d.month, value: d.customers }))} height={180} /></ChartCard>
        <ChartCard title="Top products" subtitle="Units sold" data={data.top_products.map((p) => ({ label: p.name, value: p.units }))}><BarChart horizontal data={data.top_products.map((p) => ({ label: p.name, value: p.units }))} /></ChartCard>
        <ChartCard title="Category performance" subtitle="Revenue by category" data={data.category_performance.map((c) => ({ label: c.name, value: Number(c.revenue) }))} kind="money"><BarChart horizontal kind="money" data={data.category_performance.map((c) => ({ label: c.name, value: Number(c.revenue) }))} /></ChartCard>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 font-sans text-[15px] font-semibold tracking-normal">Low stock</h3>
          {data.low_stock_items.length ? (
            <ul className="divide-y divide-line text-[13px]">{data.low_stock_items.map((i) => <li key={i.variant_id} className="flex justify-between py-2"><span>{i.product} <span className="text-mist">· {i.variant}</span></span><span className={i.quantity === 0 ? 'font-semibold text-danger' : 'font-semibold text-rose'}>{i.quantity} left</span></li>)}</ul>
          ) : <p className="text-sm text-mist">All variants are above their thresholds.</p>}
          <Link to="/inventory" className="mt-3 inline-block text-[12px] font-semibold uppercase tracking-[0.12em] text-rose">Manage inventory</Link>
        </section>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between"><h3 className="text-xl">Recent orders</h3><Link to="/orders" className="text-[12px] font-semibold uppercase tracking-[0.12em] text-rose">All orders</Link></div>
        <Table head={['Order', 'Customer', 'Status', 'Payment', 'Total', 'Placed']}>
          {data.recent_orders.map((o) => (
            <tr key={o.id} className="hover:bg-ivory">
              <td className="px-4 py-3"><Link to={`/orders/${o.id}`} className="font-semibold hover:text-rose">{o.order_number}</Link></td>
              <td className="px-4 py-3">{o.customer || o.email}</td>
              <td className="px-4 py-3"><StatusPill status={o.status} label={ORDER_STATUS_LABEL[o.status]} /></td>
              <td className="px-4 py-3 capitalize">{o.payment_status}</td>
              <td className="px-4 py-3 font-medium">{money(o.grand_total)}</td>
              <td className="px-4 py-3 text-mist">{formatDate(o.placed_at)}</td>
            </tr>
          ))}
          {!data.recent_orders.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-mist">No orders yet.</td></tr>}
        </Table>
      </section>
    </div>
  );
}
