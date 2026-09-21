import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import { money, formatDate, formatDateTime, ORDER_STATUS_LABEL, cn } from '@elare/utils';
import { toast, Button, Input, Badge, Skeleton, StatusPill, Stars, Confirm } from '@elare/ui';
import { StatCard } from '@/components/Chart';
import { AdminHeader, Pager, Table } from '@/components/AdminLayout';
import NotFound from '@/pages/NotFoundPage';

export function AdminCustomers() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-customers', query, page], queryFn: () => adminApi.customers({ query, page }), placeholderData: (p) => p });
  return (
    <div>
      <AdminHeader title="Customers" description="Accounts, spend and loyalty. Authentication details are never exposed here." />
      <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search by name, email or phone" className="mb-4 h-10 w-80 rounded-full border border-line bg-white px-4 text-sm outline-none focus:border-rose" />
      {isLoading || !data ? <Skeleton className="h-64" /> : (
        <>
          <Table head={['Customer', 'Contact', 'Orders', 'Lifetime spend', 'Points', 'Status', 'Joined']}>
            {data.items.map((c) => (
              <tr key={c.id} className="hover:bg-ivory">
                <td className="px-4 py-3"><Link to={`/customers/${c.id}`} className="font-semibold hover:text-rose">{c.full_name || '—'}</Link>{c.role === 'admin' && <Badge tone="ink" className="ml-2">Admin</Badge>}</td>
                <td className="px-4 py-3 text-ink-soft">{c.email}<span className="block text-[11px] text-mist">{c.phone}</span></td>
                <td className="px-4 py-3">{c.order_count}</td>
                <td className="px-4 py-3 font-medium">{money(c.lifetime_spend)}</td>
                <td className="px-4 py-3">{c.points.toLocaleString('en-IN')}</td>
                <td className="px-4 py-3">{c.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</td>
                <td className="px-4 py-3 text-mist">{formatDate(c.created_at)}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-mist">No customers match.</td></tr>}
          </Table>
          <Pager page={page} total={data.total} pageSize={20} onChange={setPage} />
        </>
      )}
    </div>
  );
}

export function AdminCustomerDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-customer', id], queryFn: () => adminApi.customer(id) });
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [confirmStatus, setConfirmStatus] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-customer', id] }); qc.invalidateQueries({ queryKey: ['admin-customers'] }); };
  const adjust = useMutation({ mutationFn: () => adminApi.adjustPoints(id, Number(points), reason), onSuccess: (r) => { refresh(); setPoints(''); setReason(''); toast({ title: `Balance is now ${r.balance} points`, variant: 'success' }); }, onError: (e) => toast({ title: 'Could not adjust points', description: (e as Error).message, variant: 'error' }) });
  const setStatus = useMutation({ mutationFn: (s: 'active' | 'suspended') => adminApi.setCustomerStatus(id, s), onSuccess: () => { refresh(); setConfirmStatus(false); toast({ title: 'Account status updated' }); }, onError: (e) => toast({ title: 'Could not update', description: (e as Error).message, variant: 'error' }) });
  if (isLoading) return <Skeleton className="h-96" />;
  if (!data?.profile) return <NotFound />;
  const p = data.profile;
  const suspended = p.status === 'suspended';
  return (
    <div>
      <AdminHeader title={p.full_name || p.email} description={`${p.email}${p.phone ? ` · ${p.phone}` : ''} · joined ${formatDate(p.created_at)}`} action={<div className="flex gap-2"><Button variant="ghost" to="/customers">Back</Button><Button variant={suspended ? 'primary' : 'danger'} size="sm" onClick={() => setConfirmStatus(true)}>{suspended ? 'Reactivate account' : 'Suspend account'}</Button></div>} />
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Lifetime spend" value={money(data.lifetime_spend)} tone="rose" />
        <StatCard label="Orders" value={String(data.orders.length)} />
        <StatCard label="Available points" value={(data.loyalty?.available ?? 0).toLocaleString('en-IN')} hint={`${data.loyalty?.lifetime ?? 0} lifetime · ${data.loyalty?.redeemed ?? 0} redeemed`} />
        <StatCard label="Status" value={suspended ? 'Suspended' : 'Active'} tone={suspended ? 'warn' : 'plain'} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section>
            <h3 className="mb-3 text-xl">Orders</h3>
            <Table head={['Order', 'Status', 'Payment', 'Total', 'Placed']}>
              {data.orders.map((o) => (
                <tr key={o.id} className="hover:bg-ivory"><td className="px-4 py-2.5"><Link to={`/orders/${o.id}`} className="font-semibold hover:text-rose">{o.order_number}</Link></td><td className="px-4 py-2.5"><StatusPill status={o.status} label={ORDER_STATUS_LABEL[o.status]} /></td><td className="px-4 py-2.5 capitalize">{o.payment_status}</td><td className="px-4 py-2.5">{money(o.grand_total)}</td><td className="px-4 py-2.5 text-mist">{formatDate(o.placed_at)}</td></tr>
              ))}
              {!data.orders.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-mist">No orders yet.</td></tr>}
            </Table>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Reviews</h3>
            {data.reviews.length ? <ul className="divide-y divide-line text-sm">{data.reviews.map((r) => <li key={r.id} className="py-2.5"><div className="flex items-center gap-2"><Stars value={r.rating} size={12} /><span className="font-semibold">{r.product}</span><Badge tone={r.status === 'approved' ? 'success' : 'neutral'}>{r.status}</Badge></div><p className="text-ink-soft">{r.body}</p></li>)}</ul> : <p className="text-sm text-mist">No reviews.</p>}
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Wishlist</h3>
            {data.wishlist.length ? <div className="flex flex-wrap gap-2">{data.wishlist.map((w) => <Link key={w.id} to={`/products/${w.id}`} className="rounded-full bg-blush px-3 py-1 text-[13px] font-medium text-rose-deep">{w.name}</Link>)}</div> : <p className="text-sm text-mist">Empty.</p>}
          </section>
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Adjust points</h3>
            <p className="mb-3 text-[12.5px] text-mist">Use a negative number to deduct. Every adjustment is written to the customer’s points history.</p>
            <div className="space-y-3">
              <Input label="Points" type="number" value={points} onChange={(e) => setPoints(e.target.value)} placeholder="e.g. 500 or -200" />
              <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Goodwill credit" />
              <Button size="sm" disabled={!points || Number(points) === 0} loading={adjust.isPending} onClick={() => adjust.mutate()}>Apply</Button>
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Points history</h3>
            {data.points_history.length ? <ul className="divide-y divide-line text-[13px]">{data.points_history.map((t, i) => <li key={i} className="flex justify-between py-2"><span><span className={cn('font-semibold', t.points > 0 ? 'text-success' : 'text-danger')}>{t.points > 0 ? '+' : ''}{t.points}</span> <span className="text-ink-soft">{t.description}</span></span><span className="shrink-0 text-mist">{formatDateTime(t.created_at)}</span></li>)}</ul> : <p className="text-sm text-mist">No activity.</p>}
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h3 className="mb-2 text-xl">Addresses</h3>
            {data.addresses.length ? data.addresses.map((a, i) => <p key={i} className="text-ink-soft">{a.city}, {a.state} {a.postal_code}</p>) : <p className="text-mist">None saved.</p>}
          </section>
        </div>
      </div>
      <Confirm open={confirmStatus} onClose={() => setConfirmStatus(false)} onConfirm={() => setStatus.mutate(suspended ? 'active' : 'suspended')} title={suspended ? 'Reactivate this account?' : 'Suspend this account?'} description={suspended ? 'The customer will be able to order again.' : 'A suspended customer cannot place orders or redeem points until reactivated.'} confirmLabel={suspended ? 'Reactivate' : 'Suspend'} danger={!suspended} loading={setStatus.isPending} />
    </div>
  );
}
