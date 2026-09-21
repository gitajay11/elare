import { motion, useReducedMotion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/store/auth';
import { useWishlist } from '@/store/wishlist';
import { toast } from '@/store/ui';
import { cn } from '@/lib/utils';

export function WishlistButton({ productId, productName, variantId, className, size = 18, variant = 'icon', label }: { productId: string; productName: string; variantId?: string | null; className?: string; size?: number; variant?: 'icon' | 'pill'; label?: string }) {
  const { user } = useAuth();
  const has = useWishlist((s) => s.ids.includes(productId));
  const toggle = useWishlist((s) => s.toggle);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast({ title: 'Sign in to save favourites', description: 'Your wishlist follows you across devices.', action: { label: 'Sign in', onClick: () => navigate(`/auth?next=${encodeURIComponent(location.pathname)}`) } });
      return;
    }
    toggle(productId, variantId, productName);
  };

  const icon = (
    <motion.span
      key={String(has)}
      initial={reduce ? false : { scale: 0.6 }}
      animate={{ scale: [0.6, 1.25, 1] }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="grid place-items-center"
    >
      <Heart size={size} className={cn('transition-colors', has ? 'fill-rose text-rose' : 'text-ink')} />
    </motion.span>
  );

  if (variant === 'pill') {
    return (
      <button type="button" onClick={onClick} aria-pressed={has} className={cn('inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line bg-white px-5 text-sm font-semibold text-ink transition-colors hover:border-rose hover:text-rose', className)}>
        {icon}
        {label ?? (has ? 'Saved' : 'Wishlist')}
      </button>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={has ? `Remove ${productName} from wishlist` : `Add ${productName} to wishlist`} aria-pressed={has} className={cn('grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-soft backdrop-blur transition-transform hover:scale-105', className)}>
      {icon}
    </button>
  );
}
