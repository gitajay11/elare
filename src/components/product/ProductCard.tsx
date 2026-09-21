import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Eye, ShoppingBag } from 'lucide-react';
import type { ProductCard as ProductCardType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { socialProof } from '@/lib/format';
import { fadeUp } from '@/lib/motion';
import { useStoreConfig, useAddToCart } from '@/hooks/useStore';
import { useUi } from '@/store/ui';
import { Badge, Price, Rating, Swatch } from '@/components/ui/Primitives';
import { ProductImage } from './ProductImage';
import { WishlistButton } from './WishlistButton';

interface Props {
  product: ProductCardType;
  index?: number;
  className?: string;
  compact?: boolean;
}

export const ProductCard = memo(function ProductCard({ product: p, index = 0, className, compact }: Props) {
  const { config } = useStoreConfig();
  const addToCart = useAddToCart();
  const setQuickView = useUi((s) => s.setQuickView);
  const reduce = useReducedMotion();
  const [hover, setHover] = useState(false);
  const proof = config.social_proof.enabled ? socialProof(p, config.social_proof.min_count, config.social_proof.window_days) : null;
  const primaryShade = p.shades[0];
  const canQuickAdd = p.in_stock && p.variant_count === 1 && p.default_variant_id;

  const quickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    if (canQuickAdd) addToCart(p, { id: p.default_variant_id!, name: primaryShade?.name ?? 'Default' }, 1, primaryShade ?? null);
    else setQuickView(p);
  };

  return (
    <motion.article
      variants={fadeUp}
      custom={index % 8}
      className={cn('group relative flex flex-col', className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link to={`/product/${p.slug}`} className="relative block overflow-hidden rounded-2xl bg-nude" aria-label={p.name}>
        <div className="relative aspect-[4/5]">
          <ProductImage src={p.image?.url} alt={p.image?.alt || p.name} shadeHex={primaryShade?.hex} width={700} className="absolute inset-0 h-full w-full" imgClassName={cn('transition-transform duration-[1200ms] ease-[var(--ease-expo)]', !reduce && 'group-hover:scale-[1.06]')} />
          {p.hover_image && (
            <div className={cn('absolute inset-0 transition-opacity duration-700 ease-[var(--ease-luxe)]', hover && !reduce ? 'opacity-100' : 'opacity-0')} aria-hidden="true">
              <ProductImage src={p.hover_image.url} alt="" shadeHex={primaryShade?.hex} width={700} className="h-full w-full" />
            </div>
          )}
          {!p.in_stock && (
            <div className="absolute inset-0 grid place-items-center bg-white/55 backdrop-blur-[1px]">
              <span className="rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white">Sold out</span>
            </div>
          )}
        </div>

        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {p.is_best_seller && <Badge tone="ink">Best seller</Badge>}
          {p.is_new && <Badge tone="champagne">New</Badge>}
          {p.discount_percent ? <Badge tone="rose">−{p.discount_percent}%</Badge> : null}
          {p.in_stock && p.low_stock && <Badge tone="blush">Low stock</Badge>}
        </div>

        <div className="absolute right-3 top-3">
          <WishlistButton productId={p.id} productName={p.name} variantId={p.default_variant_id} />
        </div>

        {/* Quick actions slide up on hover / always visible on touch */}
        <div className={cn('absolute inset-x-3 bottom-3 flex gap-2 transition-all duration-500 ease-[var(--ease-expo)] md:translate-y-3 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100', !p.in_stock && 'hidden')}>
          <button type="button" onClick={quickAdd} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-ink/90 text-[13px] font-semibold text-white backdrop-blur transition-colors hover:bg-rose-deep">
            <ShoppingBag size={15} /> {canQuickAdd ? 'Quick add' : 'Choose shade'}
          </button>
          {!compact && (
            <button type="button" aria-label={`Quick view ${p.name}`} onClick={(e) => { e.preventDefault(); setQuickView(p); }} className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-ink shadow-soft backdrop-blur transition-colors hover:bg-white">
              <Eye size={16} />
            </button>
          )}
        </div>
      </Link>

      <div className="mt-4 flex flex-1 flex-col gap-1.5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-sans text-[15px] font-semibold leading-snug tracking-normal">
            <Link to={`/product/${p.slug}`} className="transition-colors hover:text-rose">{p.name}</Link>
          </h3>
          <Price price={p.price} compareAt={p.compare_at_price} className="shrink-0" size="sm" />
        </div>
        {p.short_description && !compact && <p className="line-clamp-1 text-[13px] text-ink-soft">{p.short_description}</p>}
        <Rating value={Number(p.rating)} count={p.review_count} size={12} />
        {p.shades.length > 0 && (
          <div className="mt-1 flex items-center gap-1.5">
            {p.shades.slice(0, 6).map((s) => <Swatch key={s.id} hex={s.hex} name={s.name} size={14} />)}
            {p.shade_count > 6 && <span className="text-[11px] text-mist">+{p.shade_count - 6}</span>}
          </div>
        )}
        {proof && <p className="mt-1 text-[12px] text-rose">{p.recent_buyers >= config.social_proof.min_count ? '🔥 ' : '♡ '}{proof}</p>}
      </div>
    </motion.article>
  );
});

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="skeleton aspect-[4/5] rounded-2xl" />
      <div className="skeleton h-4 w-3/4" />
      <div className="skeleton h-3 w-1/2" />
    </div>
  );
}
