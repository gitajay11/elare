import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Accordion({ items, defaultOpen = 0, className }: { items: { title: string; content: ReactNode }[]; defaultOpen?: number | null; className?: string }) {
  const [open, setOpen] = useState<number | null>(defaultOpen);
  return (
    <div className={cn('divide-y divide-line border-y border-line', className)}>
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.title}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 py-4 text-left text-[15px] font-semibold text-ink"
            >
              {it.title}
              <Plus size={16} className={cn('shrink-0 text-rose transition-transform duration-300', isOpen && 'rotate-45')} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }} className="overflow-hidden">
                  <div className="pb-5 text-[14.5px] leading-relaxed text-ink-soft">{it.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn('scrollbar-none flex gap-1 overflow-x-auto border-b border-line', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn('relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors', value === t.value ? 'text-ink' : 'text-mist hover:text-ink-soft')}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="ml-1.5 text-[11px] text-mist">{t.count}</span>}
          {value === t.value && <motion.span layoutId="tab-underline" className="absolute inset-x-3 -bottom-px h-0.5 bg-rose" />}
        </button>
      ))}
    </div>
  );
}
