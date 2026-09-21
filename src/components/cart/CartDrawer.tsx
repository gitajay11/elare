import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { useUi, toast } from '@/store/ui';
import { useCart, selectCount } from '@/store/cart';
import { useQuote } from '@/hooks/useStore';
import { Drawer } from '@/components/ui/Overlay';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Primitives';
import { CartLines, CouponBox, GiftProgress, Totals, useDisplayLines } from './CartParts';

export function CartDrawer() {
  const open = useUi((s) => s.cartOpen);
  const close = useUi((s) => s.closeCart);
  const items = useCart((s) => s.items);
  const count = useCart(selectCount);
  const { quote, loading } = useQuote();
  const lines = useDisplayLines(quote, items);
  const navigate = useNavigate();

  // Celebrate the gift the moment it unlocks (once per unlock).
  const wasUnlocked = useRef(false);
  useEffect(() => {
    const unlocked = !!quote?.gift.unlocked;
    if (unlocked && !wasUnlocked.current) toast({ title: '🎁 You unlocked a free gift!', description: `${quote?.gift.rule?.product_name} has been added to your bag.`, variant: 'gift' });
    wasUnlocked.current = unlocked;
  }, [quote?.gift.unlocked, quote?.gift.rule?.product_name]);

  return (
    <Drawer
      open={open}
      onClose={close}
      title={<span>Your bag <span className="ml-1 font-sans text-sm text-mist">({count})</span></span>}
      footer={
        items.length ? (
          <div className="space-y-4">
            <Totals quote={quote} loading={loading} />
            <Button variant="glow" size="lg" full disabled={quote ? !quote.ok : false} onClick={() => { close(); navigate('/checkout'); }}>
              Checkout
            </Button>
            <button type="button" onClick={() => { close(); navigate('/cart'); }} className="block w-full text-center text-[12.5px] font-semibold uppercase tracking-[0.16em] text-ink-soft hover:text-rose">View full bag</button>
          </div>
        ) : undefined
      }
    >
      {items.length ? (
        <div className="space-y-5">
          <GiftProgress quote={quote} />
          <CartLines lines={lines} compact onNavigate={close} />
          <CouponBox quote={quote} />
        </div>
      ) : (
        <EmptyState icon={<ShoppingBag size={22} />} title="Your bag is empty" description="Discover the Signature Lip Edit or explore what’s new." action={<Button variant="primary" onClick={() => { close(); navigate('/shop'); }}>Start shopping</Button>} className="border-0 bg-transparent" />
      )}
    </Drawer>
  );
}
