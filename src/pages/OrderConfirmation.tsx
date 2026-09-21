import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, Package, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Seo } from '@/lib/seo';
import { money, METHOD_LABEL } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Spinner';
import { useCart } from '@/store/cart';
import { CLEAR_CART_FLAG } from './Checkout';
import NotFound from './NotFound';

export default function OrderConfirmation() {
  const { id = '' } = useParams();
  const { data: order, isLoading } = useQuery({ queryKey: ['order', id], queryFn: () => api.order(id) });
  const clearCart = useCart((s) => s.clear);
  const qc = useQueryClient();
  // Empty the bag exactly once, for the order that was just placed from checkout.
  useEffect(() => {
    if (sessionStorage.getItem(CLEAR_CART_FLAG) === id) {
      sessionStorage.removeItem(CLEAR_CART_FLAG);
      clearCart();
      qc.invalidateQueries({ queryKey: ['quote'] });
    }
  }, [id, clearCart, qc]);
  if (isLoading) return <PageLoader />;
  if (!order) return <NotFound />;
  const gift = order.items.find((i) => i.is_gift);
  return (
    <div className="container-x py-14 lg:py-20">
      <Seo title={`Order ${order.order_number}`} noindex />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }} className="mx-auto max-w-2xl text-center">
        <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-blush text-rose"><Check size={28} /></motion.span>
        <p className="eyebrow mt-6">Order {order.order_number}</p>
        <h1 className="mt-3 text-[2.6rem] leading-[1.05] sm:text-[3.4rem]">{order.status === 'pending' ? 'Almost there.' : 'Thank you, ' + (order.shipping_address.full_name?.split(' ')[0] ?? 'you') + '.'}</h1>
        <p className="mt-4 text-[15.5px] text-ink-soft">
          {order.status === 'pending'
            ? 'Your order is reserved and waiting for payment. Open the order to retry.'
            : 'We’ve received your order. Every status change — packed, shipped, delivered — appears in your account the moment it happens.'}
        </p>

        <div className="mt-10 grid gap-3 text-left sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist">Delivering to</p>
            <p className="mt-2 font-semibold">{order.shipping_address.full_name}</p>
            <p className="text-sm text-ink-soft">{order.shipping_address.line1}, {order.shipping_address.city} {order.shipping_address.postal_code}</p>
          </div>
          <div className="rounded-2xl border border-line bg-white p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mist">Payment</p>
            <p className="mt-2 font-semibold">{money(order.grand_total)}</p>
            <p className="text-sm text-ink-soft">{METHOD_LABEL[order.payment_method]}</p>
          </div>
        </div>

        <ul className="mt-6 space-y-2 text-left">
          {order.items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 rounded-2xl border border-line bg-white p-3 text-sm">
              <div className="h-14 w-12 overflow-hidden rounded-lg bg-nude">{i.image_url && <img src={i.image_url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="flex-1"><p className="font-semibold">{i.product_name}</p><p className="text-ink-soft">{i.shade_name ?? i.variant_name} × {i.quantity}</p></div>
              <span className="font-semibold">{i.is_gift ? 'Free' : money(i.line_total)}</span>
            </li>
          ))}
        </ul>

        {gift && <p className="mt-4 rounded-2xl bg-champagne/50 px-4 py-3 text-sm">🎁 Your complimentary {gift.product_name} is on its way with this order.</p>}
        {order.points_earned > 0 && <p className="mt-3 inline-flex items-center gap-2 text-sm text-ink-soft"><Sparkles size={14} className="text-rose" /> You’ll receive <b className="text-ink">{order.points_earned} Élaré points</b> once it’s delivered.</p>}

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Button variant="glow" size="lg" to={`/account/orders/${order.id}`} icon={<Package size={16} />}>Track this order</Button>
          <Button variant="outline" size="lg" to="/shop">Continue shopping</Button>
        </div>
        <p className="mt-6 text-[12.5px] text-mist">Need help? <Link to="/account/orders" className="underline">View your orders</Link>.</p>
      </motion.div>
    </div>
  );
}
