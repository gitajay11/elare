import { Link } from 'react-router-dom';
import { cn } from '@elare/utils';

/** The Élaré wordmark. Links to the app root unless `href` is given (e.g. a cross-site link). */
export function Logo({ className, light, href }: { className?: string; light?: boolean; href?: string }) {
  const inner = (
    <>
      <span className={cn('text-[1.55rem] font-semibold leading-none tracking-[0.08em]', light ? 'text-white' : 'text-ink')}>ÉLARÉ</span>
      <span className={cn('text-[0.62rem] font-sans font-semibold uppercase tracking-[0.34em]', light ? 'text-white/80' : 'text-rose')}>Beauty</span>
    </>
  );
  const cls = cn('inline-flex items-baseline gap-1 font-display', className);
  return href ? <a href={href} className={cls} aria-label="Élaré Beauty — home">{inner}</a> : <Link to="/" className={cls} aria-label="Élaré Beauty — home">{inner}</Link>;
}
