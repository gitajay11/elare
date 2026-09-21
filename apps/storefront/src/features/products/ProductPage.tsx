import { useEffect, useMemo, useRef, useState } from 'react';
import { SIGN_IN } from '@/lib/routes';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight, Play, ShoppingBag, Tag, Truck, RotateCcw, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { type ProductDetail, type Review } from '@elare/types';
import { Seo, breadcrumbSchema, fadeUp, stagger, viewportOnce, useAuth, Button, Badge, Breadcrumb, Price, QuantityStepper, Rating, SectionHeading, Stars, Swatch, Accordion, Input, Textarea, PageLoader } from '@elare/ui';
import { SITE_URL } from '@/lib/neon';
import { imageUrl, money, socialProof, formatDate, cn } from '@elare/utils';
import { useAddToCart, useStoreConfig } from '@/lib/hooks';
import { useRecent } from '@/features/products/recent-store';
import { toast } from '@/lib/ui-store';
import { ProductImage } from '@/features/products/ProductImage';
import { WishlistButton } from '@/features/products/WishlistButton';
import { OptionSelector, ShadeSelector, useVariantSelection } from '@/features/products/VariantPicker';
import { ProductRail } from '@/features/products/ProductGrid';
import { RecentlyViewed } from '@/components/home/Sections';
import NotFound from '@/app/NotFoundPage';

export default function Product() {
  const { slug = '' } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['product', slug], queryFn: () => api.product(slug) });
  useEffect(() => { window.scrollTo({ top: 0 }); }, [slug]);
  if (isLoading) return <PageLoader />;
  if (!data) return <NotFound />;
  return <ProductView key={data.product.id} detail={data} />;
}

function ProductView({ detail }: { detail: ProductDetail }) {
  const p = detail.product;
  const { config } = useStoreConfig();
  const addToCart = useAddToCart();
  const navigate = useNavigate();
  const sel = useVariantSelection(detail);
  const [qty, setQty] = useState(1);
  const push = useRecent((s) => s.push);
  const allRecent = useRecent((s) => s.ids);
  const recentIds = useMemo(() => allRecent.filter((id) => id !== p.id), [allRecent, p.id]);
  const { data: recent } = useQuery({ queryKey: ['cards', recentIds], queryFn: () => api.productCards(recentIds), enabled: recentIds.length > 1 });
  useEffect(() => { push(p.id); }, [p.id, push]);

  const proof = config.social_proof.enabled ? socialProof(p, config.social_proof.min_count, config.social_proof.window_days) : null;
  const price = sel.variant?.price ?? p.price;
  const inStock = sel.variant?.in_stock ?? p.in_stock;
  const points = p.loyalty_points ?? Math.floor(price * config.loyalty.points_per_rupee);
  const isCombo = p.attributes?.product_type === 'combo';

  const add = () => { if (sel.variant) addToCart(p, sel.variant, qty, sel.shade); };
  const buyNow = () => { if (sel.variant) { addToCart(p, sel.variant, qty, sel.shade, { silent: true }); navigate('/checkout'); } };

  const crumbs = [
    ...(detail.breadcrumb[0] ? [{ name: detail.breadcrumb[0].name, to: `/category/${detail.breadcrumb[0].slug}` }] : []),
    ...(detail.breadcrumb[1] ? [{ name: detail.breadcrumb[1].name, to: `/category/${detail.breadcrumb[0]?.slug}/${detail.breadcrumb[1].slug}` }] : []),
    { name: p.name },
  ];

  const productSchema = {
    '@type': 'Product',
    name: p.name,
    description: p.short_description ?? p.description ?? undefined,
    image: detail.images.map((i) => i.url),
    sku: sel.variant?.sku,
    brand: { '@type': 'Brand', name: 'Élaré Beauty' },
    url: `${SITE_URL}/product/${p.slug}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: price,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: `${SITE_URL}/product/${p.slug}`,
    },
    ...(p.review_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.review_count } } : {}),
  };

  const accordion = [
    { title: 'Description', content: <div className="space-y-3"><p>{p.description}</p>{p.benefits.length > 0 && <ul className="list-disc space-y-1 pl-5">{p.benefits.map((b) => <li key={b}>{b}</li>)}</ul>}</div> },
    ...(p.how_to_use ? [{ title: 'How to use', content: <p>{p.how_to_use}</p> }] : []),
    ...(p.ingredients ? [{ title: 'Ingredients', content: <p className="text-[13.5px]">{p.ingredients}</p> }] : []),
    { title: 'Details', content: (
      <dl className="grid grid-cols-[120px_1fr] gap-y-2">
        {p.size_label && <><dt className="text-mist">Size</dt><dd>{p.size_label}</dd></>}
        {p.finish && <><dt className="text-mist">Finish</dt><dd>{p.finish}</dd></>}
        {p.coverage && <><dt className="text-mist">Coverage</dt><dd>{p.coverage}</dd></>}
        {p.suitability && <><dt className="text-mist">Suitability</dt><dd>{p.suitability}</dd></>}
        {sel.variant && <><dt className="text-mist">SKU</dt><dd>{sel.variant.sku}</dd></>}
      </dl>
    ) },
    { title: 'Shipping', content: <p>Complimentary shipping on orders above {money(config.shipping.free_above)}; {money(config.shipping.flat_rate)} otherwise. Orders ship within 1–2 business days and arrive in 3–7 days across India, with tracking.</p> },
    { title: 'Returns', content: <p>Unopened products can be returned within 30 days of delivery for a full refund. For hygiene reasons, opened makeup cannot be returned unless faulty — in which case we will replace or refund it.</p> },
  ];

  return (
    <>
      <Seo title={p.name} description={p.short_description ?? undefined} image={detail.images[0]?.url} type="product" path={`/product/${p.slug}`} jsonLd={[productSchema, breadcrumbSchema([{ name: 'Home', path: '/' }, ...crumbs.slice(0, -1).map((c) => ({ name: c.name, path: c.to! })), { name: p.name, path: `/product/${p.slug}` }])]} />
      <div className="container-x pt-6">
        <Breadcrumb items={crumbs} />
      </div>

      <div className="container-x mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <Gallery detail={detail} shadeId={sel.shadeId} shadeHex={sel.shade?.hex} />

        <div className="lg:sticky lg:top-28 lg:self-start">
          <motion.div variants={stagger(0.07)} initial="hidden" animate="show">
            <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-2">
              <Link to={`/category/${p.category.slug}`} className="eyebrow hover:underline">{p.category.name}</Link>
              {p.subcategory && <><span className="text-mist">·</span><Link to={`/category/${p.category.slug}/${p.subcategory.slug}`} className="eyebrow hover:underline">{p.subcategory.name}</Link></>}
              {p.is_best_seller && <Badge tone="ink">Best seller</Badge>}
              {p.is_new && <Badge tone="champagne">New</Badge>}
            </motion.div>
            <motion.h1 variants={fadeUp} custom={1} className="mt-3 text-[2.4rem] leading-[1.05] sm:text-[3rem]">{p.name}</motion.h1>
            <motion.div variants={fadeUp} custom={2} className="mt-3 flex flex-wrap items-center gap-4">
              <a href="#reviews" className="inline-flex"><Rating value={Number(p.rating)} count={p.review_count} /></a>
              {proof && <span className="text-[12.5px] text-rose">{p.recent_buyers >= config.social_proof.min_count ? '🔥 ' : '♡ '}{proof}</span>}
            </motion.div>
            <motion.div variants={fadeUp} custom={3} className="mt-5 flex flex-wrap items-center gap-3">
              <Price price={price} compareAt={p.compare_at_price} size="lg" />
              {p.discount_percent ? <Badge tone="rose">Save {p.discount_percent}%</Badge> : null}
              {isCombo && p.attributes?.savings ? <span className="text-[13px] text-success">You save {money(Number(p.attributes.savings))} versus buying separately</span> : null}
            </motion.div>
            {p.short_description && <motion.p variants={fadeUp} custom={4} className="mt-4 text-[15.5px] leading-relaxed text-ink-soft">{p.short_description}</motion.p>}

            {isCombo && detail.bundle_items.length > 0 && (
              <motion.div variants={fadeUp} custom={5} className="mt-6 rounded-2xl border border-line bg-white p-4">
                <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">What’s inside</p>
                <ul className="divide-y divide-line">
                  {detail.bundle_items.map((b) => (
                    <li key={b.variant_id} className="flex items-center gap-3 py-2.5">
                      <div className="h-12 w-12 overflow-hidden rounded-lg bg-nude">{b.image ? <img src={imageUrl(b.image, 120)} alt="" className="h-full w-full object-cover" /> : null}</div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/product/${b.product_slug}`} className="block truncate text-[14px] font-semibold hover:text-rose">{b.product_name}</Link>
                        <p className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">{b.shade_hex && <Swatch hex={b.shade_hex} name={b.variant_name} size={11} />}{b.variant_name}</p>
                      </div>
                      <span className="text-[13px] text-mist">{money(b.price)}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            )}

            <motion.div variants={fadeUp} custom={6} className="mt-7 space-y-6">
              <ShadeSelector shades={detail.shades} value={sel.shadeId} onChange={(id) => { sel.setShadeId(id); setQty(1); }} inStock={sel.shadeInStock} />
              {sel.optionKeys.map((k) => <OptionSelector key={k} label={k} values={sel.optionValues(k)} value={sel.options[k] ?? ''} onChange={(v) => sel.setOption(k, v)} />)}
            </motion.div>

            <motion.div variants={fadeUp} custom={7} className="mt-7">
              <p className={cn('mb-3 text-[13px] font-medium', inStock ? (sel.variant?.low_stock ? 'text-rose' : 'text-success') : 'text-danger')}>
                {inStock ? (sel.variant?.low_stock ? `Only ${sel.variant.stock_hint ?? 'a few'} left — order soon` : 'In stock, ships in 1–2 days') : 'Sold out in this shade'}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <QuantityStepper value={qty} onChange={setQty} max={config.max_qty_per_line} />
                <Button variant="glow" size="lg" className="min-w-[180px] flex-1" icon={<ShoppingBag size={16} />} disabled={!inStock || !sel.variant} onClick={add}>
                  {inStock ? 'Add to bag' : 'Sold out'}
                </Button>
                <WishlistButton productId={p.id} productName={p.name} variantId={sel.variant?.id} className="h-[52px] w-[52px] border border-line shadow-none" />
              </div>
              <Button variant="outline" size="lg" full className="mt-3" disabled={!inStock || !sel.variant} onClick={buyNow}>Buy now</Button>
            </motion.div>

            <motion.ul variants={fadeUp} custom={8} className="mt-6 space-y-2 text-[13px] text-ink-soft">
              <li className="flex items-center gap-2"><Sparkles size={14} className="text-rose" /> Earn <b className="text-ink">{points} Élaré points</b> with this purchase</li>
              <li className="flex items-center gap-2"><Truck size={14} className="text-rose" /> Free shipping above {money(config.shipping.free_above)}</li>
              <li className="flex items-center gap-2"><RotateCcw size={14} className="text-rose" /> 30-day returns on unopened products</li>
              {config.gift_rule && <li className="flex items-center gap-2">🎁 Free {config.gift_rule.gift_name} with {config.gift_rule.min_quantity}+ products</li>}
            </motion.ul>

            {detail.coupons.length > 0 && (
              <motion.div variants={fadeUp} custom={9} className="mt-6 space-y-2">
                {detail.coupons.map((c) => (
                  <div key={c.code} className="flex items-center gap-3 rounded-xl border border-dashed border-rose/40 bg-blush/30 px-4 py-2.5 text-[13px]">
                    <Tag size={14} className="text-rose" />
                    <span className="flex-1">{c.description ?? (c.type === 'percentage' ? `${c.value}% off` : `${money(c.value)} off`)}{c.min_order_value > 0 && <span className="text-mist"> · min. {money(c.min_order_value)}</span>}</span>
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(c.code); toast({ title: `Code ${c.code} copied` }); }} className="rounded-full bg-white px-3 py-1 font-semibold tracking-[0.08em] text-rose">{c.code}</button>
                  </div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>
      </div>

      <div className="container-x mt-16 grid gap-16 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <Accordion items={accordion} />
        <div />
      </div>

      <Reviews detail={detail} />

      {detail.recommendations.complete_look.length > 0 && (
        <section className="container-x py-16"><SectionHeading align="left" eyebrow="Complete your look" title="Worn together, beautifully." /><ProductRail products={detail.recommendations.complete_look} /></section>
      )}
      {detail.recommendations.bought_together.length > 0 && (
        <section className="container-x py-16"><SectionHeading align="left" eyebrow="Frequently bought together" title="Customers also added." description="Based on real orders." /><ProductRail products={detail.recommendations.bought_together} /></section>
      )}
      {detail.recommendations.also_like.length > 0 && (
        <section className="container-x py-16"><SectionHeading align="left" eyebrow="You may also like" title="More from this edit." /><ProductRail products={detail.recommendations.also_like.slice(0, 8)} /></section>
      )}
      {recent && <RecentlyViewed products={recent} />}
    </>
  );
}

/* Gallery ----------------------------------------------------------------- */
function Gallery({ detail, shadeId, shadeHex }: { detail: ProductDetail; shadeId: string | null; shadeHex?: string | null }) {
  const media = useMemo(() => {
    const imgs = [...detail.images].sort((a, b) => (a.shade_id === shadeId ? -1 : b.shade_id === shadeId ? 1 : 0)).map((i) => ({ type: 'image' as const, url: i.url, alt: i.alt, id: i.id }));
    return detail.product.video_url ? [...imgs, { type: 'video' as const, url: detail.product.video_url, alt: `${detail.product.name} video`, id: 'video' }] : imgs;
  }, [detail, shadeId]);
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touch = useRef<number | null>(null);
  useEffect(() => setIdx(0), [shadeId]);
  const cur = media[idx] ?? media[0];

  return (
    <div className="lg:sticky lg:top-28 lg:self-start">
      <div className="flex flex-col gap-3 lg:flex-row-reverse">
        <div
          className="relative aspect-[4/5] flex-1 overflow-hidden rounded-[24px] bg-nude"
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 }); }}
          onMouseLeave={() => setZoom(null)}
          onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => { if (touch.current === null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 40) setIdx((i) => (dx < 0 ? (i + 1) % media.length : (i - 1 + media.length) % media.length)); touch.current = null; }}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={cur?.id ?? 'none'} initial={{ opacity: 0, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }} className="absolute inset-0">
              {cur?.type === 'video' ? (
                <video src={cur.url} controls playsInline className="h-full w-full object-cover" aria-label={cur.alt} />
              ) : (
                <div className="absolute inset-0 transition-transform duration-300 ease-out" style={zoom ? { transform: 'scale(1.8)', transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}>
                  <ProductImage src={cur?.url} alt={cur?.alt || detail.product.name} shadeHex={shadeHex} width={1200} sizes="(min-width: 1024px) 50vw, 100vw" priority className="h-full w-full" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          {media.length > 1 && (
            <>
              <button type="button" aria-label="Previous image" onClick={() => setIdx((i) => (i - 1 + media.length) % media.length)} className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-soft backdrop-blur hover:bg-white"><ChevronLeft size={18} /></button>
              <button type="button" aria-label="Next image" onClick={() => setIdx((i) => (i + 1) % media.length)} className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white/85 shadow-soft backdrop-blur hover:bg-white"><ChevronRight size={18} /></button>
            </>
          )}
          {shadeHex && (
            <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-white/85 py-1.5 pl-1.5 pr-3 text-[12px] font-medium shadow-soft backdrop-blur">
              <Swatch hex={shadeHex} name="Selected shade" size={22} /> Selected shade
            </div>
          )}
        </div>
        {media.length > 1 && (
          <div className="scrollbar-none flex gap-2 overflow-x-auto lg:w-20 lg:flex-col lg:overflow-y-auto" role="tablist" aria-label="Product media">
            {media.map((m, i) => (
              <button key={m.id} type="button" role="tab" aria-selected={i === idx} aria-label={`Show ${m.type} ${i + 1}`} onClick={() => setIdx(i)} className={cn('relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border-2 bg-nude transition-colors lg:h-24 lg:w-full', i === idx ? 'border-rose' : 'border-transparent hover:border-line')}>
                {m.type === 'video' ? <span className="grid h-full w-full place-items-center bg-ink text-white"><Play size={16} /></span> : <img src={imageUrl(m.url, 160)} alt="" className="h-full w-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* Reviews ----------------------------------------------------------------- */
function Reviews({ detail }: { detail: ProductDetail }) {
  const p = detail.product;
  const { user } = useAuth();
  const qc = useQueryClient();
  const [writing, setWriting] = useState(false);
  const [rating, setRating] = useState(detail.my_review?.rating ?? 5);
  const [title, setTitle] = useState(detail.my_review?.title ?? '');
  const [body, setBody] = useState(detail.my_review?.body ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const dist = detail.rating_distribution ?? {};
  const total = Object.values(dist).reduce((a, b) => a + Number(b), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const urls = await Promise.all(files.slice(0, 3).map((f) => api.uploadReviewImage(f)));
      await api.submitReview(p.id, rating, title, body, urls);
      toast({ title: 'Thank you for your review', description: 'It is live on the product page.', variant: 'success' });
      setWriting(false);
      qc.invalidateQueries({ queryKey: ['product', p.slug] });
    } catch (err) {
      toast({ title: 'Could not submit review', description: (err as Error).message, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="reviews" className="container-x scroll-mt-28 py-16" aria-labelledby="reviews-title">
      <div className="grid gap-10 lg:grid-cols-[320px_1fr]">
        <div>
          <p className="eyebrow">Reviews</p>
          <h2 id="reviews-title" className="mt-2 text-[2.2rem]">What customers say</h2>
          {total > 0 ? (
            <div className="mt-5 rounded-3xl border border-line bg-white p-5">
              <div className="flex items-end gap-3"><span className="font-display text-5xl leading-none">{Number(p.rating).toFixed(1)}</span><div><Stars value={Number(p.rating)} size={16} /><p className="mt-1 text-[12.5px] text-mist">{p.review_count} verified {p.review_count === 1 ? 'review' : 'reviews'}</p></div></div>
              <ul className="mt-5 space-y-1.5">
                {[5, 4, 3, 2, 1].map((r) => {
                  const n = Number(dist[String(r)] ?? 0);
                  return (
                    <li key={r} className="flex items-center gap-3 text-[12.5px]">
                      <span className="w-6 text-mist">{r}★</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-nude"><span className="block h-full rounded-full bg-champagne-deep" style={{ width: `${total ? (n / total) * 100 : 0}%` }} /></span>
                      <span className="w-6 text-right text-mist">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">No reviews yet. Reviews can only be written by customers whose order has been delivered — so every one is real.</p>
          )}
          <div className="mt-5">
            {detail.can_review ? (
              <Button variant="outline" onClick={() => setWriting((w) => !w)}>{detail.my_review ? 'Edit your review' : 'Write a review'}</Button>
            ) : user ? (
              <p className="text-[13px] text-mist">You can review this product once an order containing it has been delivered.</p>
            ) : (
              <p className="text-[13px] text-mist"><Link to={SIGN_IN} className="text-rose underline-offset-4 hover:underline">Sign in</Link> to review a product you have purchased.</p>
            )}
          </div>
        </div>

        <div>
          <AnimatePresence>
            {writing && (
              <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} onSubmit={submit} className="mb-8 overflow-hidden rounded-3xl border border-line bg-white p-6">
                <p className="mb-4 font-display text-2xl">Your review</p>
                <div className="mb-4 flex items-center gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button key={r} type="button" role="radio" aria-checked={rating === r} aria-label={`${r} stars`} onClick={() => setRating(r)} className="p-0.5"><Stars value={r <= rating ? 1 : 0} size={22} /></button>
                  ))}
                  <span className="ml-2 text-sm text-ink-soft">{['', 'Poor', 'Fair', 'Good', 'Great', 'Love it'][rating]}</span>
                </div>
                <div className="space-y-4">
                  <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sum it up in a few words" maxLength={80} />
                  <Textarea label="Review" value={body} onChange={(e) => setBody(e.target.value)} placeholder="How did it wear? How was the shade on you?" required minLength={10} maxLength={1200} />
                  <div>
                    <label className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">Photos (optional, up to 3)</label>
                    <input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} className="mt-2 block text-sm text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-blush file:px-4 file:py-2 file:text-sm file:font-semibold file:text-rose-deep" />
                  </div>
                </div>
                <div className="mt-5 flex gap-3"><Button type="submit" loading={busy}>Submit review</Button><Button variant="ghost" onClick={() => setWriting(false)}>Cancel</Button></div>
              </motion.form>
            )}
          </AnimatePresence>

          {detail.reviews.length ? (
            <motion.ul variants={stagger(0.06)} initial="hidden" whileInView="show" viewport={viewportOnce} className="divide-y divide-line">
              {detail.reviews.map((r, i) => <ReviewItem key={r.id} review={r} index={i} />)}
            </motion.ul>
          ) : (
            <div className="rounded-3xl border border-dashed border-line p-10 text-center text-sm text-mist">Be the first to share how {p.name} wears on you.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReviewItem({ review: r, index }: { review: Review; index: number }) {
  return (
    <motion.li variants={fadeUp} custom={index} className="py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3"><Stars value={r.rating} size={14} />{r.is_verified && <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold uppercase tracking-[0.12em] text-success"><Check size={12} /> Verified purchase</span>}</div>
        <span className="text-[12px] text-mist">{formatDate(r.created_at)}</span>
      </div>
      {r.title && <p className="mt-2 font-display text-xl">{r.title}</p>}
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">{r.body}</p>
      {r.images?.length > 0 && <div className="mt-3 flex gap-2">{r.images.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="Customer photo" className="h-20 w-20 rounded-xl object-cover" loading="lazy" /></a>)}</div>}
      <p className="mt-2 text-[12.5px] font-semibold">{r.author}</p>
    </motion.li>
  );
}
