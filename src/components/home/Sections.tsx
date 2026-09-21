import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Gift, Plus, Sparkles, Star, Truck } from 'lucide-react';
import type { HomePayload, ProductCard as ProductCardType, Review } from '@/lib/types';
import { fadeUp, imageReveal, stagger, viewportOnce } from '@/lib/motion';
import { imageUrl, money } from '@/lib/format';
import { useAddToCart, useStoreConfig } from '@/hooks/useStore';
import { useAuth } from '@/store/auth';
import { Button } from '@/components/ui/Button';
import { Price, Rating, SectionHeading, Stars, Swatch } from '@/components/ui/Primitives';
import { ProductRail } from '@/components/product/ProductGrid';
import { ProductImage } from '@/components/product/ProductImage';
import { WishlistButton } from '@/components/product/WishlistButton';
import { ProductCard } from '@/components/product/ProductCard';

/* Signature Lip Collection ------------------------------------------------ */
export function SignatureCollection({ products }: { products: ProductCardType[] }) {
  const addToCart = useAddToCart();
  if (!products.length) return null;
  return (
    <section className="container-x py-20 lg:py-28" aria-labelledby="signature-heading">
      <SectionHeading eyebrow="Élaré Signature" title={<span id="signature-heading">The Lip Edit</span>} description="Lip Liner + Lipstick + Lip Gloss, colour-matched in five shade families. Curated to complement a wide range of complexions and undertones." />
      <motion.div variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={viewportOnce} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
        {products.map((p, i) => {
          const shade = p.shades[0];
          const num = String(p.attributes?.shade_number ?? String(i + 1).padStart(2, '0'));
          const savings = Number(p.attributes?.savings ?? (p.compare_at_price ? p.compare_at_price - p.price : 0));
          return (
            <motion.article key={p.id} variants={fadeUp} custom={i} className="group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-white transition-shadow duration-500 hover:shadow-float">
              <Link to={`/product/${p.slug}`} className="relative block aspect-[4/5] overflow-hidden" aria-label={p.name}>
                <ProductImage src={p.image?.url} alt={p.image?.alt || p.name} shadeHex={shade?.hex} width={600} className="h-full w-full" imgClassName="transition-transform duration-[1200ms] ease-[var(--ease-expo)] group-hover:scale-105" />
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,rgba(255,255,255,0),rgba(255,255,255,.92))]" />
                <div className="absolute left-4 top-4 font-display text-4xl text-white drop-shadow">{num}</div>
                <div className="absolute right-3 top-3"><WishlistButton productId={p.id} productName={p.name} variantId={p.default_variant_id} /></div>
                {shade && (
                  <div className="absolute bottom-4 left-4 flex items-center gap-2">
                    <Swatch hex={shade.hex} name={shade.name} size={26} />
                    <span className="text-[13px] font-semibold text-ink">{shade.name.replace(/^\d+\s/, '')}</span>
                  </div>
                )}
              </Link>
              <div className="flex flex-1 flex-col p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-mist">Liner + Lipstick + Gloss</p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <Price price={p.price} compareAt={p.compare_at_price} />
                  {savings > 0 && <span className="rounded-full bg-blush px-2 py-0.5 text-[11px] font-semibold text-rose-deep">Save {money(savings)}</span>}
                </div>
                <Rating value={Number(p.rating)} count={p.review_count} size={12} className="mt-1.5" />
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    disabled={!p.in_stock || !p.default_variant_id}
                    onClick={() => addToCart(p, { id: p.default_variant_id!, name: shade?.name ?? 'Default' }, 1, shade ?? null)}
                    className="btn-glow h-11 flex-1 rounded-[12px] text-[13px]"
                  >
                    <span>{p.in_stock ? 'Add to bag' : 'Sold out'}</span>
                  </button>
                </div>
              </div>
            </motion.article>
          );
        })}
      </motion.div>
      <div className="mt-8 flex justify-center">
        <Button variant="ghost" to="/category/lips/signature-lip-collection" icon={<ArrowRight size={16} />}>View the full collection</Button>
      </div>
    </section>
  );
}

/* Generic product rail section -------------------------------------------- */
export function RailSection({ id, eyebrow, title, description, products, to, toLabel = 'View all', tone = 'plain' }: { id: string; eyebrow: string; title: string; description?: string; products: ProductCardType[]; to: string; toLabel?: string; tone?: 'plain' | 'blush' }) {
  if (!products.length) return null;
  return (
    <section className={tone === 'blush' ? 'bg-white py-20 lg:py-28' : 'py-20 lg:py-28'} aria-labelledby={id}>
      <div className="container-x">
        <SectionHeading align="left" eyebrow={eyebrow} title={<span id={id}>{title}</span>} description={description} action={<Button variant="ghost" to={to} icon={<ArrowRight size={16} />}>{toLabel}</Button>} />
        <ProductRail products={products} />
      </div>
    </section>
  );
}

/* Shop by category -------------------------------------------------------- */
export function ShopByCategory({ categories }: { categories: HomePayload['categories'] }) {
  return (
    <section className="container-x py-20 lg:py-28" aria-labelledby="categories-heading">
      <SectionHeading eyebrow="Shop by category" title={<span id="categories-heading">Everything for the face you love.</span>} />
      <motion.div variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewportOnce} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.map((c, i) => (
          <motion.div key={c.id} variants={fadeUp} custom={i}>
            <Link to={`/category/${c.slug}`} className="group relative block aspect-[3/4] overflow-hidden rounded-3xl bg-nude">
              {c.image_url && <img src={imageUrl(c.image_url, 700)} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-[1400ms] ease-[var(--ease-expo)] group-hover:scale-105" />}
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(36,29,32,0)_45%,rgba(36,29,32,.62))]" />
              <div className="absolute inset-x-5 bottom-5 text-white">
                <p className="font-display text-3xl">{c.name}</p>
                <p className="mt-1 text-[12px] uppercase tracking-[0.18em] text-white/75">{c.product_count} products</p>
              </div>
              <span className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-ink opacity-0 transition-opacity duration-500 group-hover:opacity-100"><ArrowRight size={16} /></span>
            </Link>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}

/* Editorial / brand story ------------------------------------------------- */
export function Editorial() {
  return (
    <section className="bg-white py-20 lg:py-28" aria-labelledby="editorial-heading">
      <div className="container-x grid items-center gap-10 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <motion.div variants={imageReveal} initial="hidden" whileInView="show" viewport={viewportOnce} className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-nude">
          <img src={imageUrl('https://images.unsplash.com/photo-1596462502278-27bfdc403348', 1000)} alt="Brushes, blush and lipstick arranged on a warm beige surface" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        </motion.div>
        <motion.div variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewportOnce} className="max-w-lg">
          <motion.p variants={fadeUp} className="eyebrow">Our philosophy</motion.p>
          <motion.h2 id="editorial-heading" variants={fadeUp} custom={1} className="mt-4 text-[2.4rem] leading-[1.05] sm:text-[3.2rem]">Less, but better. <span className="italic text-rose">Yours, entirely.</span></motion.h2>
          <motion.p variants={fadeUp} custom={2} className="mt-6 text-[16px] leading-relaxed text-ink-soft">Élaré began with a single idea: makeup should feel like an extension of your skin, not a mask over it. Every shade is developed across a wide spectrum of complexions and undertones, every texture is weightless by design, and every formula is dermatologist-tested and cruelty-free.</motion.p>
          <motion.p variants={fadeUp} custom={3} className="mt-4 text-[16px] leading-relaxed text-ink-soft">The Signature Lip Edit is where we started — three products, one seamless finish — and it remains the heart of everything we make.</motion.p>
          <motion.div variants={fadeUp} custom={4} className="mt-8 flex flex-wrap gap-8">
            {[['Cruelty-free', 'Never tested on animals'], ['Dermatologist tested', 'Safe for sensitive skin'], ['Refillable', 'Signature bullets refill']].map(([t, d]) => (
              <div key={t}><p className="text-sm font-semibold">{t}</p><p className="text-[13px] text-mist">{d}</p></div>
            ))}
          </motion.div>
          <motion.div variants={fadeUp} custom={5} className="mt-8"><Button variant="outline" to="/shop" icon={<ArrowRight size={16} />}>Explore the collection</Button></motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* Frequently bought together -------------------------------------------- */
export function BoughtTogether({ pairs }: { pairs: HomePayload['bought_together'] }) {
  const addToCart = useAddToCart();
  if (!pairs.length) return null;
  const hasRealData = pairs.some((p) => p.count > 0);
  return (
    <section className="container-x py-20 lg:py-28" aria-labelledby="fbt-heading">
      <SectionHeading eyebrow={hasRealData ? 'Frequently bought together' : 'Complete your look'} title={<span id="fbt-heading">{hasRealData ? 'Pairs our customers keep choosing.' : 'Made to be worn together.'}</span>} description={hasRealData ? 'Based on real orders.' : 'Natural pairings from the Élaré edit.'} />
      <motion.div variants={stagger(0.1)} initial="hidden" whileInView="show" viewport={viewportOnce} className="grid gap-5 lg:grid-cols-3">
        {pairs.map(({ a, b, count }, i) => {
          const total = Number(a.price) + Number(b.price);
          const canAdd = a.in_stock && b.in_stock && a.default_variant_id && b.default_variant_id;
          return (
            <motion.div key={a.id + b.id} variants={fadeUp} custom={i} className="rounded-3xl border border-line bg-white p-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                {[a, b].map((p) => (
                  <Link key={p.id} to={`/product/${p.slug}`} className="min-w-0">
                    <ProductImage src={p.image?.url} alt={p.name} shadeHex={p.shades[0]?.hex} width={400} className="aspect-square rounded-2xl" />
                    <p className="mt-2 truncate text-[13px] font-semibold">{p.name}</p>
                    <p className="text-[12.5px] text-ink-soft">{money(p.price)}</p>
                  </Link>
                ))}
                <span className="col-start-2 row-start-1 grid h-8 w-8 place-items-center rounded-full bg-blush text-rose"><Plus size={14} /></span>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-mist">{count > 0 ? `Bought together ${count}×` : 'Pair price'}</p>
                  <p className="text-lg font-semibold">{money(total)}</p>
                </div>
                <Button
                  size="sm"
                  disabled={!canAdd}
                  onClick={() => {
                    addToCart(a, { id: a.default_variant_id!, name: a.shades[0]?.name ?? 'Default' }, 1, a.shades[0] ?? null, { silent: true });
                    addToCart(b, { id: b.default_variant_id!, name: b.shades[0]?.name ?? 'Default' }, 1, b.shades[0] ?? null);
                  }}
                >
                  Add both
                </Button>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}

/* Customer reviews -------------------------------------------------------- */
export function ReviewsSection({ reviews, summary }: { reviews: Review[]; summary: HomePayload['review_summary'] }) {
  return (
    <section className="bg-white py-20 lg:py-28" aria-labelledby="reviews-heading">
      <div className="container-x">
        <SectionHeading
          eyebrow="Customer reviews"
          title={<span id="reviews-heading">Loved by the Élaré community.</span>}
          description={summary.count > 0 ? `${summary.average} average from ${summary.count} verified ${summary.count === 1 ? 'review' : 'reviews'}.` : 'Reviews come only from customers who have received their order. Be the first to share yours.'}
        />
        {reviews.length ? (
          <motion.div variants={stagger(0.08)} initial="hidden" whileInView="show" viewport={viewportOnce} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, i) => (
              <motion.blockquote key={r.id} variants={fadeUp} custom={i} className="flex flex-col rounded-3xl border border-line bg-ivory p-6">
                <Stars value={r.rating} size={14} />
                {r.title && <p className="mt-3 font-display text-xl">{r.title}</p>}
                <p className="mt-2 flex-1 text-[14.5px] leading-relaxed text-ink-soft">“{r.body}”</p>
                <footer className="mt-4 flex items-center justify-between text-[12px] text-mist">
                  <span><span className="font-semibold text-ink">{r.author}</span>{r.is_verified && ' · Verified purchase'}</span>
                  {r.product && <Link to={`/product/${r.product.slug}`} className="truncate text-rose hover:underline">{r.product.name}</Link>}
                </footer>
              </motion.blockquote>
            ))}
          </motion.div>
        ) : (
          <div className="mx-auto max-w-md rounded-3xl border border-dashed border-line p-8 text-center text-sm text-mist">
            <Star className="mx-auto mb-3 text-champagne-deep" />
            No reviews yet — every review on Élaré is written by a verified customer after delivery.
          </div>
        )}
      </div>
    </section>
  );
}

/* Loyalty programme ------------------------------------------------------- */
export function LoyaltySection() {
  const { config } = useStoreConfig();
  const { user } = useAuth();
  const l = config.loyalty;
  const per100 = Math.round(100 * l.points_per_rupee);
  return (
    <section className="container-x py-20 lg:py-28" aria-labelledby="loyalty-heading">
      <div className="grid gap-8 overflow-hidden rounded-[32px] bg-ink px-6 py-12 text-white sm:px-12 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-16">
        <div>
          <p className="eyebrow text-pink">Élaré points</p>
          <h2 id="loyalty-heading" className="mt-3 text-[2.4rem] leading-[1.05] sm:text-[3rem]">Every purchase earns you something beautiful.</h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/75">Earn {per100} points for every ₹100 you spend. Redeem points at checkout, or use them to claim a product straight from your wishlist.</p>
          <div className="mt-8">
            <Button variant="glow" size="lg" to={user ? '/account/loyalty' : '/auth?mode=signup&next=/account/loyalty'}>{user ? 'View my points' : 'Join and start earning'}</Button>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {[
            { icon: <Sparkles size={18} />, t: `${per100} pts per ₹100`, d: 'Credited when your order is delivered.' },
            { icon: <Gift size={18} />, t: 'Redeem from your wishlist', d: `Claim eligible products with points — from ${l.min_redeem_points} points.` },
            { icon: <Truck size={18} />, t: 'A free gift at 6 products', d: 'Qualifying orders receive a complimentary treat.' },
          ].map((it) => (
            <li key={it.t} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-pink/20 text-pink">{it.icon}</span>
              <div><p className="font-semibold">{it.t}</p><p className="text-[13px] text-white/65">{it.d}</p></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Recently viewed --------------------------------------------------------- */
export function RecentlyViewed({ products }: { products: ProductCardType[] }) {
  if (products.length < 2) return null;
  return (
    <section className="container-x py-16" aria-labelledby="recent-heading">
      <SectionHeading align="left" eyebrow="Recently viewed" title={<span id="recent-heading">Pick up where you left off.</span>} />
      <div className="scrollbar-none -mx-5 flex gap-4 overflow-x-auto px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
        {products.slice(0, 6).map((p, i) => <div key={p.id} className="w-[46vw] shrink-0 sm:w-[30vw] lg:w-auto"><ProductCard product={p} index={i} compact /></div>)}
      </div>
    </section>
  );
}
