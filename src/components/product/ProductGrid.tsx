import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { ProductCard as ProductCardType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { stagger, viewportOnce } from '@/lib/motion';
import { ProductCard, ProductCardSkeleton } from './ProductCard';

export function ProductGrid({ products, loading, columns = 4, className, empty }: { products: ProductCardType[]; loading?: boolean; columns?: 3 | 4; className?: string; empty?: ReactNode }) {
  const cols = columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
  if (loading) {
    return (
      <div className={cn('grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6', cols, className)}>
        {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
      </div>
    );
  }
  if (!products.length) return <>{empty}</>;
  return (
    <motion.div variants={stagger(0.05)} initial="hidden" whileInView="show" viewport={viewportOnce} className={cn('grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10', cols, className)}>
      {products.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
    </motion.div>
  );
}

/** Horizontal, snap-scrolling rail for home-page sections. */
export function ProductRail({ products, className }: { products: ProductCardType[]; className?: string }) {
  return (
    <motion.div variants={stagger(0.06)} initial="hidden" whileInView="show" viewport={viewportOnce} className={cn('scrollbar-none -mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8 lg:mx-0 lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible lg:px-0', className)}>
      {products.map((p, i) => (
        <div key={p.id} className="w-[72vw] shrink-0 snap-start sm:w-[44vw] lg:w-auto">
          <ProductCard product={p} index={i} />
        </div>
      ))}
    </motion.div>
  );
}
