import { useParams } from 'react-router-dom';
import { Seo } from '@/lib/seo';
import { money } from '@/lib/format';
import { useStoreConfig } from '@/hooks/useStore';
import NotFound from './NotFound';

export default function StaticPage() {
  const { slug } = useParams();
  const { config } = useStoreConfig();
  const pages: Record<string, { title: string; body: React.ReactNode }> = {
    shipping: {
      title: 'Shipping & delivery',
      body: (
        <>
          <p>We ship across India with full tracking. Orders placed before 2pm are dispatched within 1–2 business days and typically arrive within 3–7 days.</p>
          <p>Shipping is complimentary on orders above {money(config.shipping.free_above)}. Below that, a flat {money(config.shipping.flat_rate)} applies. Orders redeemed with Élaré points ship free.</p>
          <p>You’ll receive tracking details by email the moment your parcel leaves us, and every status change appears in your account in real time.</p>
        </>
      ),
    },
    returns: {
      title: 'Returns & refunds',
      body: (
        <>
          <p>Unopened, unused products can be returned within 30 days of delivery for a full refund to the original payment method. For hygiene reasons, opened makeup cannot be returned unless it arrived damaged or faulty — in which case we’ll replace or refund it, no questions asked.</p>
          <p>To start a return, open the order in your account and choose “Request a refund”. Points earned on a refunded order are reversed; points you redeemed are returned to your balance.</p>
        </>
      ),
    },
    privacy: {
      title: 'Privacy',
      body: (
        <>
          <p>We collect only what we need to fulfil your order and run your account: your name, contact details, delivery addresses, order history and — if you opt in — your email for the Élaré Circle. Payment details are handled entirely by our payment provider and never touch our servers.</p>
          <p>We never sell your data. You can update or delete your information from your account at any time.</p>
        </>
      ),
    },
    terms: {
      title: 'Terms of service',
      body: (
        <>
          <p>All prices are in Indian Rupees and inclusive of applicable taxes. Product availability, prices and promotions are confirmed at the moment an order is placed and are recalculated by our systems — the amount shown at checkout is the amount charged.</p>
          <p>Coupons and Élaré points are subject to the limits shown at the time of use and cannot be exchanged for cash. Complimentary gifts are issued once per qualifying order.</p>
        </>
      ),
    },
  };
  const page = slug ? pages[slug] : undefined;
  if (!page) return <NotFound />;
  return (
    <div className="container-x py-14">
      <Seo title={page.title} path={`/pages/${slug}`} />
      <article className="mx-auto max-w-2xl">
        <h1 className="text-[2.6rem] sm:text-[3.2rem]">{page.title}</h1>
        <div className="mt-6 space-y-4 text-[15.5px] leading-relaxed text-ink-soft">{page.body}</div>
      </article>
    </div>
  );
}
