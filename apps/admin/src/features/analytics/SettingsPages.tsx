import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { money, formatDate, ORDER_STATUS_LABEL } from '@elare/utils';
import { toast, Button, Input, Toggle, Skeleton } from '@elare/ui';
import { BarChart, ChartCard, LineChart, StatCard } from '@/components/Chart';
import { AdminHeader, Table } from '@/components/AdminLayout';

/* Analytics --------------------------------------------------------------- */
export function AdminAnalytics() {
  const { data, isLoading } = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard });
  if (isLoading || !data) return <Skeleton className="h-96" />;
  const t = data.totals;
  const days = data.revenue_series;
  const rev = days.map((d) => ({ label: new Date(d.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: Number(d.revenue), sub: `${d.orders} orders` }));
  const orders30 = days.reduce((n, d) => n + Number(d.orders), 0);
  const aov = orders30 ? Number(t.revenue_30d) / orders30 : 0;
  const statuses = Object.entries(data.status_breakdown).map(([k, v]) => ({ label: ORDER_STATUS_LABEL[k] ?? k, value: Number(v) })).sort((a, b) => b.value - a.value);
  return (
    <div>
      <AdminHeader title="Analytics" description="Computed from orders, customers and reviews in the database." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard tone="rose" label="Revenue (30d)" value={money(t.revenue_30d)} hint={`${money(t.revenue)} all time`} />
        <StatCard label="Orders (30d)" value={String(orders30)} hint={`${t.orders} all time`} />
        <StatCard label="Average order value (30d)" value={money(aov)} />
        <StatCard label="Coupon discount given" value={money(t.coupon_discount)} hint={`${t.coupon_uses} uses`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Revenue" subtitle="Daily, last 30 days" data={rev} kind="money"><LineChart data={rev} kind="money" height={220} /></ChartCard>
        <ChartCard title="Orders by status" data={statuses}><BarChart horizontal data={statuses} /></ChartCard>
        <ChartCard title="Top products" subtitle="Units sold, all time" data={data.top_products.map((p) => ({ label: p.name, value: p.units }))}><BarChart horizontal data={data.top_products.map((p) => ({ label: p.name, value: p.units }))} /></ChartCard>
        <ChartCard title="Top products by revenue" data={data.top_products.map((p) => ({ label: p.name, value: Number(p.revenue) }))} kind="money"><BarChart horizontal kind="money" data={data.top_products.map((p) => ({ label: p.name, value: Number(p.revenue) }))} /></ChartCard>
        <ChartCard title="Category performance" subtitle="Units" data={data.category_performance.map((c) => ({ label: c.name, value: c.units }))}><BarChart data={data.category_performance.map((c) => ({ label: c.name, value: c.units }))} height={180} /></ChartCard>
        <ChartCard title="Customer growth" subtitle="New accounts per month" data={data.customer_series.map((d) => ({ label: d.month, value: d.customers }))}><LineChart data={data.customer_series.map((d) => ({ label: d.month, value: d.customers }))} kind="count" height={180} /></ChartCard>
      </div>
    </div>
  );
}

/* Settings ---------------------------------------------------------------- */
export function AdminSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: adminApi.settings });
  const { data: subscribers } = useQuery({ queryKey: ['admin-newsletter'], queryFn: adminApi.newsletter });
  const [shipping, setShipping] = useState({ flat_rate: 0, free_above: 0 });
  const [tax, setTax] = useState({ rate_percent: 0, inclusive: true });
  const [proof, setProof] = useState({ enabled: true, window_days: 30, min_count: 5 });
  const [store, setStore] = useState({ currency: 'INR', low_stock_threshold: 5, max_qty_per_line: 10 });
  useEffect(() => {
    if (!data) return;
    if (data.shipping) setShipping(data.shipping as typeof shipping);
    if (data.tax) setTax(data.tax as typeof tax);
    if (data.social_proof) setProof(data.social_proof as typeof proof);
    if (data.store) setStore(data.store as typeof store);
  }, [data]);
  const save = useMutation({
    mutationFn: async () => { await adminApi.updateSetting('shipping', shipping); await adminApi.updateSetting('tax', tax); await adminApi.updateSetting('social_proof', proof); await adminApi.updateSetting('store', store); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-settings'] }); qc.invalidateQueries({ queryKey: ['store-config'] }); toast({ title: 'Settings saved', variant: 'success' }); },
    onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' }),
  });
  if (isLoading || !data) return <Skeleton className="h-64" />;
  return (
    <div>
      <AdminHeader title="Settings" description="Store-wide rules. Changes apply to the next cart quote immediately." action={<Button loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="text-xl">Shipping</h3>
          <Input label="Flat rate (₹)" type="number" min={0} value={shipping.flat_rate} onChange={(e) => setShipping({ ...shipping, flat_rate: Number(e.target.value) })} />
          <Input label="Free shipping above (₹)" type="number" min={0} value={shipping.free_above} onChange={(e) => setShipping({ ...shipping, free_above: Number(e.target.value) })} />
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="text-xl">Tax</h3>
          <Toggle label="Prices include tax (GST inclusive)" checked={tax.inclusive} onChange={(v) => setTax({ ...tax, inclusive: v })} />
          <Input label="Tax rate (%) when prices are exclusive" type="number" min={0} max={100} step="0.01" value={tax.rate_percent} onChange={(e) => setTax({ ...tax, rate_percent: Number(e.target.value) })} disabled={tax.inclusive} />
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="text-xl">Social proof</h3>
          <p className="text-[12.5px] text-mist">Purchase counts always come from real orders. These rules only control when they are shown.</p>
          <Toggle label="Show purchase counts on products" checked={proof.enabled} onChange={(v) => setProof({ ...proof, enabled: v })} />
          <Input label="Recent-buyers window (days)" type="number" min={1} value={proof.window_days} onChange={(e) => setProof({ ...proof, window_days: Number(e.target.value) })} />
          <Input label="Minimum count before showing" type="number" min={1} value={proof.min_count} onChange={(e) => setProof({ ...proof, min_count: Number(e.target.value) })} />
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="text-xl">Store</h3>
          <Input label="Maximum quantity per line" type="number" min={1} max={20} value={store.max_qty_per_line} onChange={(e) => setStore({ ...store, max_qty_per_line: Number(e.target.value) })} />
          <Input label="Default low-stock threshold" type="number" min={0} value={store.low_stock_threshold} onChange={(e) => setStore({ ...store, low_stock_threshold: Number(e.target.value) })} />
          <Input label="Currency" value={store.currency} disabled hint="INR is the only currency supported by the pricing engine today." />
        </section>
      </div>
      <section className="mt-6">
        <h3 className="mb-3 text-xl">Élaré Circle subscribers</h3>
        <Table head={['Email', 'Source', 'Joined']}>
          {(subscribers ?? []).map((s) => <tr key={s.id}><td className="px-4 py-2.5">{s.email}</td><td className="px-4 py-2.5 text-ink-soft">{s.source}</td><td className="px-4 py-2.5 text-mist">{formatDate(s.created_at)}</td></tr>)}
          {!subscribers?.length && <tr><td colSpan={3} className="px-4 py-6 text-center text-mist">No subscribers yet.</td></tr>}
        </Table>
      </section>
    </div>
  );
}
