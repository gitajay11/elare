import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@elare/utils';
import { Spinner } from './Spinner';

type Variant = 'glow' | 'primary' | 'outline' | 'ghost' | 'soft' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  to?: string;
  href?: string;
  icon?: ReactNode;
  full?: boolean;
}

const base = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-wide transition-all duration-300 ease-[var(--ease-luxe)] disabled:opacity-50 disabled:cursor-not-allowed select-none';
const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-6 text-sm',
  lg: 'h-[52px] px-8 text-[15px]',
};
const variants: Record<Variant, string> = {
  glow: 'btn-glow rounded-[14px]',
  primary: 'bg-ink text-white hover:bg-rose-deep hover:-translate-y-px shadow-[0_10px_24px_-14px_rgba(36,29,32,.5)]',
  outline: 'border border-ink/80 text-ink hover:bg-ink hover:text-white',
  ghost: 'text-ink hover:bg-blush/60',
  soft: 'bg-blush text-rose-deep hover:bg-blush-deep',
  danger: 'bg-danger/10 text-danger hover:bg-danger hover:text-white',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, to, href, icon, full, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  const cls = cn(base, sizes[size], variants[variant], full && 'w-full', className);
  const content = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {variant === 'glow' ? <span>{children}</span> : children}
    </>
  );
  if (to) return <Link to={to} className={cls} aria-disabled={disabled}>{content}</Link>;
  if (href) return <a href={href} className={cls} target="_blank" rel="noreferrer">{content}</a>;
  return (
    <button ref={ref} type={type} className={cls} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn('relative inline-grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:bg-blush/70 focus-visible:outline-rose', className)}
      {...rest}
    >
      {children}
    </button>
  );
}
