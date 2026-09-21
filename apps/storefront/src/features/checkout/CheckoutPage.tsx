import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Check, ChevronLeft, CreditCard, Lock, MapPin, Truck, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { type Address } from '@elare/types';
import { Seo, useAuth, Button, Input, Checkbox, PageLoader } from '@elare/ui';
import { money, cn, loadScript } from '@elare/utils';
import { useCart, toInputs } from '@/features/cart/store';
import { toast } from '@/lib/ui-store';
import { useQuote } from '@/lib/hooks';
import { Logo } from '@/components/layout/Navbar';
import { CartLines, CouponBox, GiftProgress, PointsBox, Totals, useDisplayLines } from '@/features/cart/CartParts';

type Step = 'address' | 'delivery' | 'payment';
const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: 'address', label: 'Address', icon: <MapPin size={14} /> },
  { key: 'delivery', label: 'Delivery', icon: <Truck size={14} /> },
  { key: 'payment', label: 'Payment', icon: <CreditCard size={14} /> },
];
const RAZORPAY_KEY = import.meta.env.VITE_RAZORPAY_KEY_ID;
/** sessionStorage key: order id whose confirmation page should empty the bag. */
export const CLEAR_CART_FLAG = 'elare:clear-cart-for';
const INDIAN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Chandigarh', 'Puducherry', 'Ladakh'];

const emptyAddress = { full_name: '', phone: '', email: '', line1: '', line2: '', city: '', state: '', postal_code: '' };

export default function Checkout() {
  const { user, profile, loading } = useAuth();
  const items = useCart((s) => s.items);
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/auth?next=/checkout" replace />;
  if (!items.length) return <Navigate to="/cart" replace />;
  return <CheckoutFlow userEmail={user.email ?? ''} userName={profile?.full_name ?? ''} userPhone={profile?.phone ?? ''} />;
}

function CheckoutFlow({ userEmail, userName, userPhone }: { userEmail: string; userName: string; userPhone: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const items = useCart((s) => s.items);
  const coupon = useCart((s) => s.coupon);
  const redeemPoints = useCart((s) => s.redeemPoints);
  const { quote, loading: quoting } = useQuote();
  const lines = useDisplayLines(quote, items);
  const [step, setStep] = useState<Step>('address');
  const [form, setForm] = useState({ ...emptyAddress, full_name: userName, email: userEmail, phone: userPhone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveAddress, setSaveAddress] = useState(true);
  const [selectedAddress, setSelectedAddress] = useState<string | 'new'>('new');
  const [method, setMethod] = useState<'razorpay' | 'cod'>(RAZORPAY_KEY ? 'razorpay' : 'cod');
  const [note, setNote] = useState('');
  const [placing, setPlacing] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<{ order_id: string; order_number: string } | null>(null);

  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: api.addresses });
  useEffect(() => {
    if (addresses?.length && selectedAddress === 'new' && !form.line1) {
      const d = addresses.find((a) => a.is_default) ?? addresses[0];
      setSelectedAddress(d.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses]);

  const address = useMemo<Record<string, string>>(() => {
    if (selectedAddress !== 'new' && addresses) {
      const a = addresses.find((x) => x.id === selectedAddress);
      if (a) return { full_name: a.full_name, phone: a.phone, email: userEmail, line1: a.line1, line2: a.line2 ?? '', city: a.city, state: a.state, postal_code: a.postal_code, country: a.country };
    }
    return { ...form, country: 'IN' };
  }, [selectedAddress, addresses, form, userEmail]);

  const validate = () => {
    if (selectedAddress !== 'new') return true;
    const e: Record<string, string> = {};
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your full name';
    if (!/^[6-9]\d{9}$/.test(form.phone.replace(/\D/g, ''))) e.phone = 'Enter a valid 10-digit mobile number';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = 'Enter a valid email';
    if (form.line1.trim().length < 5) e.line1 = 'Enter your street address';
    if (form.city.trim().length < 2) e.city = 'Enter your city';
    if (!form.state) e.state = 'Select your state';
    if (!/^\d{6}$/.test(form.postal_code)) e.postal_code = 'Enter a 6-digit PIN code';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const continueFromAddress = async () => {
    if (!validate()) return;
    if (selectedAddress === 'new' && saveAddress) {
      try {
        const saved = await api.saveAddress({ full_name: form.full_name, phone: form.phone, line1: form.line1, line2: form.line2 || null, city: form.city, state: form.state, postal_code: form.postal_code, country: 'IN', is_default: !(addresses?.length) });
        qc.invalidateQueries({ queryKey: ['addresses'] });
        setSelectedAddress(saved.id);
      } catch { /* saving is a convenience; the order still carries the address snapshot */ }
    }
    setStep('delivery');
  };

  const finish = (orderId: string) => {
    // The confirmation page empties the bag (one-shot flag): clearing it here would
    // re-render this route with no items and bounce to /cart before the navigation
    // transition commits.
    sessionStorage.setItem(CLEAR_CART_FLAG, orderId);
    navigate(`/order/${orderId}/confirmation`, { replace: true });
  };

  const payWithRazorpay = async (orderId: string, orderNumber: string) => {
    await loadScript('https://checkout.razorpay.com/v1/checkout.js');
    const rz = await api.razorpayOrder(orderId);
    if (!window.Razorpay) throw new Error('Payment gateway failed to load.');
    await new Promise<void>((resolve, reject) => {
      const instance = new window.Razorpay!({
        key: rz.key_id,
        amount: rz.amount,
        currency: rz.currency,
        name: 'Élaré Beauty',
        description: `Order ${orderNumber}`,
        order_id: rz.razorpay_order_id,
        prefill: rz.prefill,
        theme: { color: '#B85C78' },
        modal: { ondismiss: () => reject(new Error('Payment was not completed. You can retry below — your order is saved.')) },
        handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await api.razorpayVerify({ order_id: orderId, ...r });
            resolve();
          } catch (e) {
            reject(e);
          }
        },
      });
      instance.on('payment.failed', () => reject(new Error('Payment failed. Please try again or choose another method.')));
      instance.open();
    });
  };

  const placeOrder = async () => {
    if (!quote?.ok) return;
    setPlacing(true);
    try {
      let order = pendingOrder;
      if (!order) {
        order = await api.placeOrder({ items: toInputs(items), address, paymentMethod: method, coupon, redeemPoints, note });
        if (method === 'razorpay') setPendingOrder(order);
      }
      if (method === 'cod') {
        finish(order.order_id);
        return;
      }
      await payWithRazorpay(order.order_id, order.order_number);
      finish(order.order_id);
    } catch (e) {
      toast({ title: 'Checkout could not be completed', description: (e as Error).message, variant: 'error' });
      qc.invalidateQueries({ queryKey: ['quote'] });
    } finally {
      setPlacing(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="min-h-screen bg-ivory">
      <Seo title="Checkout" noindex />
      <header className="border-b border-line bg-white">
        <div className="container-x flex h-16 items-center justify-between">
          <Logo />
          <Link to="/cart" className="inline-flex items-center gap-1 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-ink-soft hover:text-rose"><ChevronLeft size={14} /> Back to bag</Link>
          <span className="hidden items-center gap-1.5 text-[12px] text-mist sm:inline-flex"><Lock size={12} /> Secure checkout</span>
        </div>
      </header>

      <div className="container-x grid gap-10 py-8 lg:grid-cols-[1fr_400px] lg:gap-16 lg:py-12">
        <div>
          <ol className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em]" aria-label="Checkout steps">
            {STEPS.map((s, i) => (
              <li key={s.key} className="flex items-center gap-2">
                <button type="button" disabled={i > stepIndex} onClick={() => setStep(s.key)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors', i === stepIndex ? 'bg-ink text-white' : i < stepIndex ? 'bg-blush text-rose-deep' : 'text-mist')}>
                  {i < stepIndex ? <Check size={12} /> : s.icon} {s.label}
                </button>
                {i < STEPS.length - 1 && <span className="h-px w-6 bg-line" />}
              </li>
            ))}
          </ol>

          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }} className="mt-8">
              {step === 'address' && (
                <section aria-labelledby="address-heading">
                  <h1 id="address-heading" className="text-[2rem] sm:text-[2.4rem]">Where should we send it?</h1>
                  {addresses && addresses.length > 0 && (
                    <div className="mt-6 grid gap-3 sm:grid-cols-2">
                      {addresses.map((a) => <AddressOption key={a.id} a={a} selected={selectedAddress === a.id} onSelect={() => setSelectedAddress(a.id)} />)}
                      <button type="button" onClick={() => setSelectedAddress('new')} className={cn('rounded-2xl border border-dashed p-4 text-left text-sm font-semibold transition-colors', selectedAddress === 'new' ? 'border-rose bg-blush/30 text-rose' : 'border-line hover:border-rose')}>+ Use a new address</button>
                    </div>
                  )}
                  {selectedAddress === 'new' && (
                    <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); continueFromAddress(); }} noValidate>
                      <Input label="Full name" autoComplete="name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} error={errors.full_name} />
                      <Input label="Mobile number" autoComplete="tel" inputMode="numeric" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
                      <Input label="Email" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} wrapClassName="sm:col-span-2" />
                      <Input label="Address" autoComplete="address-line1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} error={errors.line1} wrapClassName="sm:col-span-2" placeholder="Flat, building, street" />
                      <Input label="Landmark / area (optional)" autoComplete="address-line2" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} wrapClassName="sm:col-span-2" />
                      <Input label="City" autoComplete="address-level2" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} error={errors.city} />
                      <div className="space-y-1.5">
                        <label htmlFor="state" className="block text-[12px] font-semibold tracking-[0.12em] uppercase text-ink-soft">State</label>
                        <select id="state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={cn('h-12 w-full rounded-xl border border-line bg-white px-4 text-[15px] outline-none focus:border-rose', errors.state && 'border-danger')}>
                          <option value="">Select state</option>
                          {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        {errors.state && <p className="text-[13px] text-danger">{errors.state}</p>}
                      </div>
                      <Input label="PIN code" autoComplete="postal-code" inputMode="numeric" maxLength={6} value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value.replace(/\D/g, '') })} error={errors.postal_code} />
                      <div className="flex items-end pb-3"><Checkbox label="Save this address for next time" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} /></div>
                      <div className="sm:col-span-2"><Button type="submit" size="lg">Continue to delivery</Button></div>
                    </form>
                  )}
                  {selectedAddress !== 'new' && <div className="mt-6"><Button size="lg" onClick={continueFromAddress}>Continue to delivery</Button></div>}
                </section>
              )}

              {step === 'delivery' && (
                <section aria-labelledby="delivery-heading">
                  <h1 id="delivery-heading" className="text-[2rem] sm:text-[2.4rem]">Delivery</h1>
                  <div className="mt-6 rounded-2xl border border-rose bg-blush/20 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">Standard delivery</p>
                        <p className="mt-1 text-sm text-ink-soft">Ships in 1–2 business days · arrives in 3–7 days · fully tracked</p>
                      </div>
                      <p className="font-semibold">{quote ? (quote.shipping === 0 ? 'Free' : money(quote.shipping)) : '—'}</p>
                    </div>
                  </div>
                  <div className="mt-6 rounded-2xl border border-line bg-white p-5 text-sm">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-mist">Delivering to</p>
                    <p className="mt-2 font-semibold">{address.full_name} · {address.phone}</p>
                    <p className="text-ink-soft">{address.line1}{address.line2 ? `, ${address.line2}` : ''}, {address.city}, {address.state} {address.postal_code}</p>
                    <button type="button" onClick={() => setStep('address')} className="mt-2 text-[12.5px] font-semibold text-rose">Change</button>
                  </div>
                  <div className="mt-6"><Button size="lg" onClick={() => setStep('payment')}>Continue to payment</Button></div>
                </section>
              )}

              {step === 'payment' && (
                <section aria-labelledby="payment-heading">
                  <h1 id="payment-heading" className="text-[2rem] sm:text-[2.4rem]">Payment</h1>
                  <div className="mt-6 space-y-3" role="radiogroup" aria-label="Payment method">
                    {RAZORPAY_KEY && (
                      <PaymentOption selected={method === 'razorpay'} onSelect={() => setMethod('razorpay')} icon={<CreditCard size={18} />} title="Pay online" description="UPI, cards, net banking and wallets via Razorpay. Secured by 256-bit encryption." />
                    )}
                    <PaymentOption selected={method === 'cod'} onSelect={() => setMethod('cod')} icon={<Wallet size={18} />} title="Cash on delivery" description="Pay when your order arrives." />
                    {!RAZORPAY_KEY && <p className="text-[12.5px] text-mist">Online payments will appear here once the payment gateway is configured.</p>}
                  </div>
                  <div className="mt-6">
                    <label htmlFor="note" className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Order note (optional)</label>
                    <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="A gift message or delivery instruction" className="mt-2 min-h-[80px] w-full rounded-xl border border-line bg-white px-4 py-3 text-sm outline-none focus:border-rose" />
                  </div>
                  {pendingOrder && <p className="mt-4 rounded-xl bg-blush/40 px-4 py-3 text-sm text-rose-deep">Order {pendingOrder.order_number} is reserved. Complete the payment to confirm it.</p>}
                  <div className="mt-6">
                    <Button variant="glow" size="lg" className="w-full sm:w-auto sm:min-w-[260px]" loading={placing} disabled={!quote?.ok || quoting} onClick={placeOrder}>
                      {pendingOrder ? 'Retry payment' : method === 'cod' ? `Place order · ${quote ? money(quote.total) : ''}` : `Pay ${quote ? money(quote.total) : ''}`}
                    </Button>
                    <p className="mt-3 text-[12px] text-mist">By placing this order you agree to our <Link to="/pages/terms" className="underline">terms</Link> and <Link to="/pages/returns" className="underline">returns policy</Link>.</p>
                  </div>
                </section>
              )}
            </motion.div>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-3xl border border-line bg-white p-5">
            <p className="mb-2 font-display text-2xl">Order summary</p>
            <GiftProgress quote={quote} className="mb-2" />
            <CartLines lines={lines} compact />
            <CouponBox quote={quote} className="mt-4" />
            <Totals quote={quote} loading={quoting} className="mt-5" />
          </div>
          <PointsBox quote={quote} className="mt-4" />
        </aside>
      </div>
    </div>
  );
}

function AddressOption({ a, selected, onSelect }: { a: Address; selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className={cn('rounded-2xl border p-4 text-left text-sm transition-colors', selected ? 'border-rose bg-blush/30' : 'border-line bg-white hover:border-rose')}>
      <p className="font-semibold">{a.full_name} {a.is_default && <span className="ml-1 rounded-full bg-nude px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink-soft">Default</span>}</p>
      <p className="mt-1 text-ink-soft">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
      <p className="text-ink-soft">{a.city}, {a.state} {a.postal_code}</p>
      <p className="mt-1 text-mist">{a.phone}</p>
    </button>
  );
}

function PaymentOption({ selected, onSelect, icon, title, description }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; description: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className={cn('flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition-colors', selected ? 'border-rose bg-blush/30' : 'border-line bg-white hover:border-rose')}>
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', selected ? 'bg-rose text-white' : 'bg-nude text-ink')}>{icon}</span>
      <span><span className="block font-semibold">{title}</span><span className="block text-[13px] text-ink-soft">{description}</span></span>
    </button>
  );
}
