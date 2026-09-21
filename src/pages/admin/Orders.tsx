import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api';
import type { OrderStatus } from '@/lib/types';
import { money, formatDate, formatDateTime, ORDER_STATUS_LABEL, PAYMENT_LABEL, METHOD_LABEL, imageUrl } from '@/lib/format';
import { toast } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { Skeleton, StatusPill, Swatch } from '@/components/ui/Primitives';
import { Timeline } from '@/pages/account/Orders';
import { AdminHeader, Pager, Table } from './AdminLayout';
import NotFound from '../NotFound';

const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'refund_requested', 'refund_initiated', 'refund_processing', 'refunded'];
const NEXT: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['packed', 'cancelled'], packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'], delivered: ['refund_requested'], refund_requested: ['refund_initiated', 'delivered'],
  refund_initiated: ['refund_processing', 'refunded'], refund_processing: ['refunded'], cancelled: [], refunded: [],
};

export function AdminOrders() {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['admin-orders', status, query, page], queryFn: () => adminApi.orders({ status, query, page }), placeholderData: (p) => p, refetchInterval: 30_000 });
  return (
    <div>
      <AdminHeader title="Orders" description="Every status change is journaled; customers see the same status you set here." />
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Order number, name or email" className="h-10 w-72 rounded-full border border-line bg-white px-4 text-sm outline-none focus:border-rose" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-full border border-line bg-white px-4 text-sm"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>)}</select>
      </div>
      {isLoading || !data ? <Skeleton className="h-64" /> : (
        <>
          <Table head={['Order', 'Customer', 'Items', 'Status', 'Payment', 'Total', 'Placed']}>
            {data.items.map((o) => (
              <tr key={o.id} className="hover:bg-ivory">
                <td className="px-4 py-3"><Link to={`/admin/orders/${o.id}`} className="font-semibold hover:text-rose">{o.order_number}</Link></td>
                <td className="px-4 py-3">{o.customer}<span className="block text-[11px] text-mist">{o.email}</span></td>
                <td className="px-4 py-3">{o.item_count}</td>
                <td className="px-4 py-3"><StatusPill status={o.status} label={ORDER_STATUS_LABEL[o.status]} /></td>
                <td className="px-4 py-3">{PAYMENT_LABEL[o.payment_status]}<span className="block text-[11px] text-mist">{METHOD_LABEL[o.payment_method ?? '']}</span></td>
                <td className="px-4 py-3 font-medium">{money(o.grand_total)}</td>
                <td className="px-4 py-3 text-mist">{formatDate(o.placed_at)}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-mist">No orders match.</td></tr>}
          </Table>
          <Pager page={page} total={data.total} pageSize={20} onChange={setPage} />
        </>
      )}
    </div>
  );
}

export function AdminOrderDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({ queryKey: ['order', id], queryFn: () => import('@/lib/api').then((m) => m.api.order(id)) });
  const [note, setNote] = useState('');
  const [tracking, setTracking] = useState({ carrier: '', trackingNumber: '', trackingUrl: '' });
  const update = useMutation({
    mutationFn: (p: { status?: string }) => adminApi.updateOrder({ orderId: id, note: note || undefined, ...p }),
    onSuccess: (o) => { qc.setQueryData(['order', id], o); qc.invalidateQueries({ queryKey: ['admin-orders'] }); qc.invalidateQueries({ queryKey: ['admin-dashboard'] }); setNote(''); toast({ title: 'Order updated', variant: 'success' }); },
    onError: (e) => toast({ title: 'Update failed', description: (e as Error).message, variant: 'error' }),
  });
  const saveTracking = useMutation({
    mutationFn: () => adminApi.updateOrder({ orderId: id, ...tracking }),
    onSuccess: (o) => { qc.setQueryData(['order', id], o); toast({ title: 'Tracking saved' }); },
    onError: (e) => toast({ title: 'Could not save tracking', description: (e as Error).message, variant: 'error' }),
  });
  if (isLoading) return <Skeleton className="h-96" />;
  if (!order) return <NotFound />;
  const next = NEXT[order.status];
  return (
    <div>
      <AdminHeader title={order.order_number} description={`${formatDateTime(order.placed_at)} · ${METHOD_LABEL[order.payment_method]} · ${PAYMENT_LABEL[order.payment_status]}`} action={<Button variant="ghost" to="/admin/orders">Back to orders</Button>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Timeline order={order} />
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Items</h3>
            <ul className="divide-y divide-line">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-4 py-3 text-sm">
                  <span className="h-14 w-12 overflow-hidden rounded-lg bg-nude">{i.image_url && <img src={imageUrl(i.image_url, 100)} alt="" className="h-full w-full object-cover" />}</span>
                  <span className="flex-1"><b>{i.product_name}</b>{i.is_gift && <span className="ml-2 rounded-full bg-champagne px-1.5 text-[10px] font-bold uppercase">Gift</span>}<span className="flex items-center gap-1.5 text-ink-soft">{i.shade_hex && <Swatch hex={i.shade_hex} name="" size={10} />}{i.shade_name ?? i.variant_name} × {i.quantity} @ {money(i.unit_price)}</span></span>
                  <span className="font-medium">{money(i.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 grid grid-cols-2 gap-y-1 border-t border-line pt-3 text-sm sm:w-72 sm:ml-auto">
              <dt className="text-ink-soft">Subtotal</dt><dd className="text-right">{money(order.subtotal)}</dd>
              {order.coupon_discount > 0 && <><dt className="text-ink-soft">Coupon {order.coupon_code}</dt><dd className="text-right text-success">− {money(order.coupon_discount)}</dd></>}
              {order.points_discount > 0 && <><dt className="text-ink-soft">{order.points_redeemed} points</dt><dd className="text-right text-success">− {money(order.points_discount)}</dd></>}
              <dt className="text-ink-soft">Shipping</dt><dd className="text-right">{money(order.shipping_total)}</dd>
              <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{money(order.grand_total)}</dd>
            </dl>
          </section>
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Update status</h3>
            {next.length ? (
              <>
                <Input label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to the customer" />
                <div className="mt-3 flex flex-wrap gap-2">
                  {next.map((s) => <Button key={s} size="sm" variant={s === 'cancelled' || s === 'refunded' ? 'danger' : 'primary'} loading={update.isPending} onClick={() => update.mutate({ status: s })}>{s === 'delivered' && order.status === 'refund_requested' ? 'Reject refund' : ORDER_STATUS_LABEL[s]}</Button>)}
                </div>
                {order.status === 'refund_requested' && <p className="mt-3 text-[12.5px] text-mist">Refunding restocks the items and reverses any points earned.</p>}
              </>
            ) : <p className="text-sm text-mist">This order is closed.</p>}
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h3 className="mb-3 text-xl">Tracking</h3>
            <div className="space-y-3">
              <Input label="Carrier" value={tracking.carrier || order.carrier || ''} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} />
              <Input label="Tracking number" value={tracking.trackingNumber || order.tracking_number || ''} onChange={(e) => setTracking({ ...tracking, trackingNumber: e.target.value })} />
              <Input label="Tracking URL" value={tracking.trackingUrl || order.tracking_url || ''} onChange={(e) => setTracking({ ...tracking, trackingUrl: e.target.value })} />
              <Button size="sm" variant="outline" loading={saveTracking.isPending} onClick={() => saveTracking.mutate()}>Save tracking</Button>
            </div>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h3 className="mb-2 text-xl">Customer</h3>
            <Link to={`/admin/customers/${order.customer.id}`} className="font-semibold hover:text-rose">{order.customer.name || order.customer.email}</Link>
            <p className="text-ink-soft">{order.customer.email}{order.customer.phone ? ` · ${order.customer.phone}` : ''}</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-mist">Ship to</p>
            <p>{order.shipping_address.full_name} · {order.shipping_address.phone}</p>
            <p className="text-ink-soft">{order.shipping_address.line1}{order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}, {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
            {order.customer_note && <p className="mt-2 rounded-lg bg-ivory p-2 italic text-ink-soft">“{order.customer_note}”</p>}
            {order.payment && <p className="mt-3 text-[12px] text-mist">Payment ref: {order.payment.provider_payment_id ?? order.payment.provider_order_id ?? '—'}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
