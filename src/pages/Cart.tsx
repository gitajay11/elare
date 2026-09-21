import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { Seo } from '@/lib/seo';
import { useCart, selectCount } from '@/store/cart';
import { useQuote } from '@/hooks/useStore';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Primitives';
import { CartLines, CouponBox, GiftProgress, PointsBox, Totals, useDisplayLines } from '@/components/cart/CartParts';

export default function Cart() {
  const items = useCart((s) => s.items);
  const count = useCart(selectCount);
  const { quote, loading, error } = useQuote();
  const lines = useDisplayLines(quote, items);

  return (
    <div className="container-x py-10 lg:py-14">
      <Seo title="Your bag" noindex />
      <h1 className="text-[2.4rem] sm:text-[3rem]">Your bag <span className="font-sans text-base text-mist">({count})</span></h1>
      {items.length === 0 ? (
        <EmptyState className="mt-8" icon={<ShoppingBag size={22} />} title="Your bag is empty" description="Discover the Signature Lip Edit or explore what’s new." action={<Button to="/shop">Start shopping</Button>} />
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
          <div>
            <GiftProgress quote={quote} />
            {error && <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">{error.message}</p>}
            <div className="mt-4 rounded-3xl border border-line bg-white px-5">
              <CartLines lines={lines} />
            </div>
            <Link to="/shop" className="mt-6 inline-block text-[12.5px] font-semibold uppercase tracking-[0.16em] text-ink-soft hover:text-rose">← Continue shopping</Link>
          </div>
          <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-3xl border border-line bg-white p-5">
              <p className="mb-4 font-display text-2xl">Summary</p>
              <CouponBox quote={quote} />
              <Totals quote={quote} loading={loading} className="mt-5" />
              <Button variant="glow" size="lg" full className="mt-5" to="/checkout" disabled={quote ? !quote.ok : true}>Proceed to checkout</Button>
              {quote && !quote.ok && <p className="mt-3 text-center text-[12.5px] text-danger">Please resolve the highlighted items to continue.</p>}
            </div>
            <PointsBox quote={quote} />
          </aside>
        </div>
      )}
    </div>
  );
}
