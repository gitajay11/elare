import { AnimatePresence, motion } from 'framer-motion';
import { Check, Gift, AlertCircle, X } from 'lucide-react';
import { useToasts } from '../toast-store';
import { cn } from '@elare/utils';
import { imageUrl } from '@elare/utils';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.2 } }}
            className={cn('pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-white/95 p-3 pr-2 shadow-float backdrop-blur', t.variant === 'error' ? 'border-danger/30' : 'border-line')}
            role="status"
          >
            {t.image ? (
              <img src={imageUrl(t.image, 120)} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : (
              <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-full', t.variant === 'error' ? 'bg-danger/10 text-danger' : t.variant === 'gift' ? 'bg-champagne text-ink' : 'bg-blush text-rose')}>
                {t.variant === 'error' ? <AlertCircle size={18} /> : t.variant === 'gift' ? <Gift size={18} /> : <Check size={18} />}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">{t.title}</p>
              {t.description && <p className="mt-0.5 truncate text-[13px] text-ink-soft">{t.description}</p>}
              {t.action && (
                <button type="button" onClick={() => { t.action?.onClick(); dismiss(t.id); }} className="mt-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-rose">
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="grid h-8 w-8 place-items-center rounded-full text-mist hover:bg-blush/60">
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
