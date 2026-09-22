import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { Seo, Button, EmptyState, Skeleton, StatusPill, Swatch, Modal, Textarea, OrderTimeline } from '@elare/ui';
import { money, formatDate, formatDateTime, ORDER_STATUS_LABEL, PAYMENT_LABEL, METHOD_LABEL, imageUrl, cn } from '@elare/utils';
import { toast } from '@/lib/ui-store';
import NotFound from '@/app/NotFoundPage';
import { payWithRazorpay } from '@/features/checkout/razorpay';

export function OrdersList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ['my-orders', page], queryFn: () => api.myOrders(page, 10), placeholderData: (p) => p });
  if (isLoading || !data) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>;
  if (!data.items.length) return <EmptyState icon={<Package size={20} />} title="No orders yet" description="Your orders and their live status will appear here." action={<Button to="/shop">Start shopping</Button>} />;
  const pages = Math.ceil(data.total / 10);
  return (
    <div>
      <Seo title="Orders" noindex />
      <ul className="space-y-3">
        {data.items.map((o) => (
          <li key={o.id}>
            <Link to={`/account/orders/${o.id}`} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-white p-4 transition-shadow hover:shadow-soft">
              <div className="flex -space-x-3">{o.preview.map((p, i) => <span key={i} className="h-14 w-12 overflow-hidden rounded-lg border-2 border-white bg-nude">{p.image_url && <img src={imageUrl(p.image_url, 100)} alt="" className="h-full w-full object-cover" />}</span>)}</div>
              <div className="min-w-0 flex-1"><p className="font-semibold">{o.order_number}</p><p className="text-[12.5px] text-mist">{formatDate(o.placed_at)} · {o.item_count} {o.item_count === 1 ? 'item' : 'items'}</p></div>
              <StatusPill status={o.status} label={ORDER_STATUS_LABEL[o.status]} />
              <span className="font-semibold">{money(o.grand_total)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 && <div className="mt-6 flex justify-center gap-2">{Array.from({ length: pages }).map((_, i) => <button key={i} type="button" onClick={() => setPage(i + 1)} className={cn('h-9 w-9 rounded-full text-sm', page === i + 1 ? 'bg-ink text-white' : 'hover:bg-blush/60')}>{i + 1}</button>)}</div>}
    </div>
  );
}

export function OrderDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({ queryKey: ['order', id], queryFn: () => api.order(id), refetchInterval: (q) => (q.state.data && !['delivered', 'cancelled', 'refunded'].includes(q.state.data.status) ? 30_000 : false) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useMutation({ mutationFn: () => api.cancelOrder(id, reason), onSuccess: (o) => { qc.setQueryData(['order', id], o); qc.invalidateQueries({ queryKey: ['my-orders'] }); setCancelOpen(false); toast({ title: 'Order cancelled', description: 'Any points you used have been returned.' }); }, onError: (e) => toast({ title: 'Could not cancel', description: (e as Error).message, variant: 'error' }) });
  // Online orders stay reserved until paid; the customer can finish paying from here.
  const pay = useMutation({ mutationFn: () => payWithRazorpay(id, order?.order_number ?? ''), onSuccess: () => { qc.invalidateQueries({ queryKey: ['order', id] }); qc.invalidateQueries({ queryKey: ['my-orders'] }); toast({ title: 'Payment received', description: 'Your order is confirmed.' }); }, onError: (e) => toast({ title: 'Payment not completed', description: (e as Error).message, variant: 'error' }) });
  const refund = useMutation({ mutationFn: () => api.requestRefund(id, reason), onSuccess: (o) => { qc.setQueryData(['order', id], o); setRefundOpen(false); toast({ title: 'Refund requested', description: 'We’ll review it within 2 business days.' }); }, onError: (e) => toast({ title: 'Could not request refund', description: (e as Error).message, variant: 'error' }) });

  if (isLoading) return <Skeleton className="h-64" />;
  if (!order) return <NotFound />;
  const canCancel = ['pending', 'confirmed', 'processing'].includes(order.status);
  const canRefund = order.status === 'delivered';
  return (
    <div className="space-y-6">
      <Seo title={`Order ${order.order_number}`} noindex />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/account/orders" className="text-[12px] font-semibold uppercase tracking-[0.14em] text-mist hover:text-rose">← Orders</Link>
          <h2 className="mt-1 text-3xl">{order.order_number}</h2>
          <p className="text-[13px] text-mist">Placed {formatDateTime(order.placed_at)} · {METHOD_LABEL[order.payment_method]} · {PAYMENT_LABEL[order.payment_status]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {order.status === 'pending' && order.payment_method === 'razorpay' && order.payment_status !== 'paid' && <Button size="sm" loading={pay.isPending} onClick={() => pay.mutate()}>Complete payment</Button>}
          {canCancel && <Button size="sm" variant="outline" onClick={() => setCancelOpen(true)}>Cancel order</Button>}
          {canRefund && <Button size="sm" variant="outline" onClick={() => setRefundOpen(true)}>Request a refund</Button>}
        </div>
      </div>

      <OrderTimeline order={order} />

      {(order.tracking_number || order.tracking_url) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4 text-sm">
          <p><span className="text-mist">Tracking</span> <b>{order.carrier ? `${order.carrier} · ` : ''}{order.tracking_number}</b></p>
          {order.tracking_url && <a href={order.tracking_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-rose">Track parcel <ExternalLink size={14} /></a>}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-2xl border border-line bg-white p-5">
          <h3 className="mb-3 text-xl">Items</h3>
          <ul className="divide-y divide-line">
            {order.items.map((i) => (
              <li key={i.id} className="flex items-center gap-4 py-3">
                <div className="h-16 w-14 overflow-hidden rounded-lg bg-nude">{i.image_url && <img src={imageUrl(i.image_url, 120)} alt="" className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  {i.slug ? <Link to={`/product/${i.slug}`} className="font-semibold hover:text-rose">{i.product_name}</Link> : <p className="font-semibold">{i.product_name}</p>}
                  <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">{i.shade_hex && <Swatch hex={i.shade_hex} name={i.shade_name ?? ''} size={11} />}{i.shade_name ?? i.variant_name} × {i.quantity}{i.is_gift && <span className="ml-1 rounded-full bg-champagne px-1.5 text-[10px] font-bold uppercase text-ink">Gift</span>}</p>
                </div>
                <span className="font-semibold">{i.is_gift ? 'Free' : money(i.line_total)}</span>
                {order.status === 'delivered' && i.slug && !i.is_gift && <Link to={`/product/${i.slug}#reviews`} className="text-[12px] font-semibold text-rose">Review</Link>}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-4">
          <div className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h3 className="mb-3 text-xl">Summary</h3>
            <Row k="Subtotal" v={money(order.subtotal)} />
            {order.coupon_discount > 0 && <Row k={`Coupon ${order.coupon_code}`} v={`− ${money(order.coupon_discount)}`} hi />}
            {order.points_discount > 0 && <Row k={`${order.points_redeemed} points`} v={`− ${money(order.points_discount)}`} hi />}
            <Row k="Shipping" v={order.shipping_total === 0 ? 'Free' : money(order.shipping_total)} />
            {order.tax_total > 0 && <Row k="Tax" v={money(order.tax_total)} />}
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-base font-semibold"><span>Total</span><span>{money(order.grand_total)}</span></div>
            {order.points_earned > 0 && <p className="mt-2 text-[12.5px] text-ink-soft">{order.points_awarded ? `${order.points_earned} points credited.` : `${order.points_earned} points on delivery.`}</p>}
          </div>
          <div className="rounded-2xl border border-line bg-white p-5 text-sm">
            <h3 className="mb-2 text-xl">Delivery address</h3>
            <p className="font-semibold">{order.shipping_address.full_name}</p>
            <p className="text-ink-soft">{order.shipping_address.line1}{order.shipping_address.line2 ? `, ${order.shipping_address.line2}` : ''}</p>
            <p className="text-ink-soft">{order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.postal_code}</p>
            <p className="mt-1 text-mist">{order.shipping_address.phone}</p>
            {order.customer_note && <p className="mt-3 rounded-lg bg-ivory p-3 text-[13px] italic text-ink-soft">“{order.customer_note}”</p>}
          </div>
        </div>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this order?" size="sm">
        <p className="text-sm text-ink-soft">Stock will be released and any points or coupon you used will be returned to you.</p>
        <Textarea label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-4" />
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep order</Button><Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button></div>
      </Modal>
      <Modal open={refundOpen} onClose={() => setRefundOpen(false)} title="Request a refund" size="sm">
        <p className="text-sm text-ink-soft">Tell us what went wrong. Unopened products are eligible within 30 days of delivery.</p>
        <Textarea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} required className="mt-4" />
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setRefundOpen(false)}>Back</Button><Button loading={refund.isPending} disabled={reason.trim().length < 5} onClick={() => refund.mutate()}>Submit request</Button></div>
      </Modal>
    </div>
  );
}

function Row({ k, v, hi }: { k: string; v: string; hi?: boolean }) {
  return <div className="flex justify-between py-1"><span className="text-ink-soft">{k}</span><span className={cn('font-medium', hi && 'text-success')}>{v}</span></div>;
}

