import type { HTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Star, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money, shadeContrast } from '@/lib/format';

/* Badge ------------------------------------------------------------------- */
export function Badge({ tone = 'neutral', className, children }: { tone?: 'neutral' | 'rose' | 'ink' | 'champagne' | 'success' | 'danger' | 'blush'; className?: string; children: ReactNode }) {
  const tones = {
    neutral: 'bg-nude text-ink-soft',
    rose: 'bg-rose text-white',
    ink: 'bg-ink text-white',
    champagne: 'bg-champagne text-ink',
    success: 'bg-success/10 text-success',
    danger: 'bg-danger/10 text-danger',
    blush: 'bg-blush text-rose-deep',
  };
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]', tones[tone], className)}>{children}</span>;
}

/* Price ------------------------------------------------------------------- */
export function Price({ price, compareAt, className, size = 'md' }: { price: number; compareAt?: number | null; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-2xl' };
  return (
    <span className={cn('inline-flex items-baseline gap-2', sizes[size], className)}>
      <span className="font-semibold text-ink">{money(price)}</span>
      {compareAt && compareAt > price ? <s className="text-mist text-[0.85em] font-normal">{money(compareAt)}</s> : null}
    </span>
  );
}

/* Rating ------------------------------------------------------------------ */
export function Stars({ value, size = 14, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-line" fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="text-champagne-deep" fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function Rating({ value, count, size = 14, className, showCount = true }: { value: number; count: number; size?: number; className?: string; showCount?: boolean }) {
  if (!count) return <span className={cn('text-[12px] text-mist', className)}>No reviews yet</span>;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[12.5px] text-ink-soft', className)}>
      <Stars value={value} size={size} />
      <span className="font-medium text-ink">{Number(value).toFixed(1)}</span>
      {showCount && <span className="text-mist">({count})</span>}
    </span>
  );
}

/* Swatch ------------------------------------------------------------------ */
export function Swatch({ hex, name, selected, size = 26, onClick, disabled, className }: { hex: string; name: string; selected?: boolean; size?: number; onClick?: () => void; disabled?: boolean; className?: string }) {
  const Comp = onClick ? 'button' : 'span';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      disabled={disabled}
      title={name}
      aria-label={name}
      aria-pressed={onClick ? selected : undefined}
      className={cn(
        'relative inline-block shrink-0 rounded-full border border-black/10 transition-transform duration-300',
        onClick && 'hover:scale-110',
        selected && 'shade-ring',
        disabled && 'opacity-40',
        className,
      )}
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.55), rgba(255,255,255,0) 45%), ${hex}` }}
    >
      {disabled && <span className={cn('absolute inset-0 rounded-full', shadeContrast(hex) === 'light' ? 'bg-[linear-gradient(135deg,transparent_46%,#241D20_46%,#241D20_54%,transparent_54%)]' : 'bg-[linear-gradient(135deg,transparent_46%,#fff_46%,#fff_54%,transparent_54%)]')} />}
    </Comp>
  );
}

/* Quantity stepper -------------------------------------------------------- */
export function QuantityStepper({ value, onChange, min = 1, max = 10, size = 'md', className }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md'; className?: string }) {
  const h = size === 'sm' ? 'h-9' : 'h-12';
  return (
    <div className={cn('inline-flex items-center rounded-full border border-line bg-white', h, className)} role="group" aria-label="Quantity">
      <button type="button" aria-label="Decrease quantity" disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-full w-10 place-items-center text-ink-soft transition-colors hover:text-rose disabled:opacity-30">
        <Minus size={14} />
      </button>
      <span className="w-8 text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase quantity" disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-full w-10 place-items-center text-ink-soft transition-colors hover:text-rose disabled:opacity-30">
        <Plus size={14} />
      </button>
    </div>
  );
}

/* Skeleton ---------------------------------------------------------------- */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('skeleton', className)} aria-hidden="true" {...rest} />;
}

/* Section heading --------------------------------------------------------- */
export function SectionHeading({ eyebrow, title, description, align = 'center', action, className }: { eyebrow?: string; title: ReactNode; description?: ReactNode; align?: 'left' | 'center'; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-10 flex flex-col gap-3', align === 'center' ? 'items-center text-center' : 'items-start', action && 'md:flex-row md:items-end md:justify-between', className)}>
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="text-balance text-[2rem] leading-[1.05] sm:text-[2.6rem] lg:text-[3rem]">{title}</h2>
        {description && <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* Breadcrumb -------------------------------------------------------------- */
export function Breadcrumb({ items, className }: { items: { name: string; to?: string }[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-[12px] tracking-[0.08em] text-mist', className)}>
      <ol className="flex flex-wrap items-center gap-2">
        <li><Link to="/" className="transition-colors hover:text-rose">Home</Link></li>
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2">
            <span aria-hidden="true">/</span>
            {it.to && i < items.length - 1 ? <Link to={it.to} className="transition-colors hover:text-rose">{it.name}</Link> : <span className="text-ink-soft" aria-current={i === items.length - 1 ? 'page' : undefined}>{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/* Empty state ------------------------------------------------------------- */
export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-white/60 px-6 py-16 text-center', className)}>
      {icon && <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-blush text-rose">{icon}</div>}
      <h3 className="text-2xl">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* Status pill for orders -------------------------------------------------- */
export function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === 'delivered' ? 'success'
    : status === 'cancelled' || status.startsWith('refund') ? 'danger'
    : status === 'pending' ? 'neutral'
    : 'blush';
  return <Badge tone={tone}>{label}</Badge>;
}
