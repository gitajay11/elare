import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-store';
import { useAddToCart } from '@/lib/hooks';
import { Modal, Button, Price, QuantityStepper, Rating, Skeleton } from '@elare/ui';
import { ProductImage } from './ProductImage';
import { WishlistButton } from './WishlistButton';
import { OptionSelector, ShadeSelector, useVariantSelection } from './VariantPicker';

/** Compact purchase modal opened from product cards. Shares its selection logic with the product page. */
export function QuickView() {
  const product = useUi((s) => s.quickView);
  const close = () => useUi.getState().setQuickView(null);
  return (
    <Modal open={!!product} onClose={close} size="lg">
      {product && <QuickViewBody slug={product.slug} onDone={close} />}
    </Modal>
  );
}

function QuickViewBody({ slug, onDone }: { slug: string; onDone: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['product', slug], queryFn: () => api.product(slug) });
  const sel = useVariantSelection(data);
  const addToCart = useAddToCart();
  const [qty, setQty] = useState(1);

  if (isLoading || !data) {
    return (
      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="aspect-[4/5]" />
        <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-20" /></div>
      </div>
    );
  }
  const p = data.product;
  const image = data.images.find((i) => i.shade_id && i.shade_id === sel.shadeId) ?? data.images[0];
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <ProductImage src={image?.url} alt={image?.alt || p.name} shadeHex={sel.shade?.hex} width={700} className="aspect-[4/5] rounded-2xl" />
      <div className="flex flex-col">
        <p className="eyebrow">{p.category.name}{p.subcategory ? ` · ${p.subcategory.name}` : ''}</p>
        <h3 className="mt-2 text-3xl">{p.name}</h3>
        <div className="mt-2 flex items-center gap-4">
          <Price price={sel.variant?.price ?? p.price} compareAt={p.compare_at_price} size="lg" />
          <Rating value={Number(p.rating)} count={p.review_count} />
        </div>
        {p.short_description && <p className="mt-3 text-sm text-ink-soft">{p.short_description}</p>}
        <div className="mt-5 space-y-5">
          <ShadeSelector shades={data.shades} value={sel.shadeId} onChange={sel.setShadeId} inStock={sel.shadeInStock} size={30} />
          {sel.optionKeys.map((k) => <OptionSelector key={k} label={k} values={sel.optionValues(k)} value={sel.options[k] ?? ''} onChange={(v) => sel.setOption(k, v)} />)}
        </div>
        <div className="mt-6 flex items-center gap-3">
          <QuantityStepper value={qty} onChange={setQty} />
          <Button
            variant="glow"
            size="lg"
            className="flex-1"
            icon={<ShoppingBag size={16} />}
            disabled={!sel.variant?.in_stock}
            onClick={() => { if (sel.variant) { addToCart(p, sel.variant, qty, sel.shade); onDone(); } }}
          >
            {sel.variant?.in_stock ? 'Add to bag' : 'Sold out'}
          </Button>
          <WishlistButton productId={p.id} productName={p.name} variantId={sel.variant?.id} className="h-12 w-12 border border-line shadow-none" />
        </div>
        <Link to={`/product/${p.slug}`} onClick={onDone} className="mt-5 text-[12.5px] font-semibold uppercase tracking-[0.16em] text-rose underline-offset-4 hover:underline">
          View full details
        </Link>
      </div>
    </div>
  );
}
