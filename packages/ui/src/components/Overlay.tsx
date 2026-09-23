import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@elare/utils';
import { drawer, overlay } from '../motion';
import { IconButton } from './Button';

let locks = 0;
let savedY = 0;

/**
 * Freezes the page behind an overlay. iOS ignores `overflow: hidden` on the
 * body, so the body is pinned with position: fixed at the current offset and
 * the scroll position restored on release. Counted, so stacked overlays
 * (drawer + modal) release only when the last one closes.
 */
export function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks++ === 0) {
      savedY = window.scrollY;
      const b = document.body.style;
      b.position = 'fixed';
      b.top = `-${savedY}px`;
      b.left = '0';
      b.right = '0';
      b.width = '100%';
      b.overflow = 'hidden';
    }
    return () => {
      if (--locks > 0) return;
      const b = document.body.style;
      b.position = b.top = b.left = b.right = b.width = b.overflow = '';
      window.scrollTo({ top: savedY, behavior: 'instant' as ScrollBehavior });
    };
  }, [active]);
}

function useEscape(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return;
    // A dropdown inside the overlay handles its own Escape first.
    const h = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [active, onClose]);
}

function useFocusTrap(active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(el?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []);
    const first = focusables()[0];
    first?.focus({ preventScroll: true });
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const idx = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && (idx <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && idx === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    el?.addEventListener('keydown', h);
    return () => {
      el?.removeEventListener('keydown', h);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [active]);
  return ref;
}

/* Drawer ------------------------------------------------------------------ */
export function Drawer({ open, onClose, title, children, footer, side = 'right', width = 'max-w-md' }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; side?: 'right' | 'left'; width?: string }) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  const reduce = useReducedMotion();
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] overflow-hidden overscroll-none" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
          <motion.div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px]" onClick={onClose} {...overlay} />
          <motion.div
            ref={ref}
            className={cn('absolute top-0 flex h-full w-full flex-col bg-ivory shadow-float', width, side === 'right' ? 'right-0' : 'left-0')}
            {...(reduce ? overlay : { ...drawer, initial: { x: side === 'right' ? '100%' : '-100%' }, exit: { x: side === 'right' ? '100%' : '-100%', transition: drawer.exit.transition } })}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="text-lg font-display">{title}</div>
              <IconButton label="Close" onClick={onClose}><X size={20} /></IconButton>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5">{children}</div>
            {footer && <div className="border-t border-line bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* Modal ------------------------------------------------------------------- */
export function Modal({ open, onClose, title, children, size = 'md', className }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  useLockScroll(open);
  useEscape(open, onClose);
  const ref = useFocusTrap(open);
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[95] grid place-items-center overflow-hidden overscroll-none p-4" role="dialog" aria-modal="true">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-[3px]" onClick={onClose} {...overlay} />
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, y: 10, scale: 0.98, transition: { duration: 0.2 } }}
            className={cn('relative max-h-[92dvh] w-full overflow-y-auto overflow-x-hidden overscroll-contain rounded-3xl bg-ivory p-6 shadow-float sm:p-8', sizes[size], className)}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              {title ? <h3 className="text-2xl">{title}</h3> : <span />}
              <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-2"><X size={20} /></IconButton>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* Confirm ----------------------------------------------------------------- */
export function Confirm({ open, onClose, onConfirm, title, description, confirmLabel = 'Confirm', danger, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      {description && <p className="text-sm text-ink-soft">{description}</p>}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="h-11 rounded-full px-5 text-sm font-semibold text-ink-soft hover:bg-blush/60">Cancel</button>
        <button type="button" onClick={onConfirm} disabled={loading} className={cn('h-11 rounded-full px-6 text-sm font-semibold text-white', danger ? 'bg-danger' : 'bg-ink', loading && 'opacity-60')}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
