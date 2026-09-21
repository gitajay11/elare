import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { money, imageUrl } from '@elare/utils';
import { useUi } from '@/lib/ui-store';
import { useStoreConfig } from '@/lib/hooks';
import { overlay } from '@elare/ui';

const POPULAR = ['Lipstick', 'Foundation', 'Mascara', 'Blush', 'Brush set', 'Rose Nude'];

export function SearchOverlay() {
  const open = useUi((s) => s.searchOpen);
  const setSearch = useUi((s) => s.setSearch);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { config } = useStoreConfig();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
    else setQ('');
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSearch(false);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setSearch]);

  const { data, isFetching } = useQuery({ queryKey: ['suggest', debounced], queryFn: () => api.suggest(debounced), enabled: open && debounced.length >= 2, staleTime: 60_000 });

  const go = (term: string) => {
    if (!term.trim()) return;
    setSearch(false);
    navigate(`/search?q=${encodeURIComponent(term.trim())}`);
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[92]" role="dialog" aria-modal="true" aria-label="Search">
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setSearch(false)} {...overlay} />
          <motion.div initial={{ y: -24, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } }} exit={{ y: -16, opacity: 0, transition: { duration: 0.2 } }} className="relative mx-auto mt-4 w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-3xl bg-ivory shadow-float sm:mt-12">
            <form onSubmit={(e) => { e.preventDefault(); go(q); }} className="flex items-center gap-3 border-b border-line px-5">
              <Search size={20} className="text-rose" />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search shades, products, categories…" className="h-16 flex-1 bg-transparent text-lg outline-none placeholder:text-mist" aria-label="Search products" />
              <button type="button" aria-label="Close search" onClick={() => setSearch(false)} className="grid h-9 w-9 place-items-center rounded-full text-mist hover:bg-blush/60"><X size={18} /></button>
            </form>

            <div className="max-h-[60vh] overflow-y-auto p-3">
              {debounced.length < 2 ? (
                <div className="p-3">
                  <p className="eyebrow mb-3">Popular searches</p>
                  <div className="flex flex-wrap gap-2">
                    {POPULAR.map((t) => <button key={t} type="button" onClick={() => go(t)} className="rounded-full border border-line bg-white px-4 py-2 text-sm hover:border-rose hover:text-rose">{t}</button>)}
                  </div>
                  <p className="eyebrow mb-3 mt-6">Browse</p>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
                    {config.categories.map((c) => <button key={c.id} type="button" onClick={() => { setSearch(false); navigate(`/category/${c.slug}`); }} className="rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-blush/50">{c.name}</button>)}
                  </div>
                </div>
              ) : (
                <div className="space-y-4 p-2">
                  {data?.categories?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {data.categories.map((c) => (
                        <button key={c.label} type="button" onClick={() => { setSearch(false); navigate(c.subcategory ? `/category/${c.slug}/${c.subcategory}` : `/category/${c.slug}`); }} className="rounded-full bg-blush px-3.5 py-1.5 text-[13px] font-semibold text-rose-deep">{c.label}</button>
                      ))}
                    </div>
                  ) : null}
                  {data?.products?.length ? (
                    <ul className="divide-y divide-line">
                      {data.products.map((p) => (
                        <li key={p.id}>
                          <button type="button" onClick={() => { setSearch(false); navigate(`/product/${p.slug}`); }} className="flex w-full items-center gap-4 rounded-xl px-2 py-2.5 text-left hover:bg-white">
                            <img src={imageUrl(p.image, 120)} alt="" className="h-14 w-14 rounded-lg bg-nude object-cover" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-semibold">{p.name}</span>
                              <span className="block text-[12px] text-mist">{p.category}</span>
                            </span>
                            <span className="text-sm font-semibold">{money(p.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : !isFetching ? (
                    <p className="p-3 text-sm text-ink-soft">No matches for “{debounced}” yet — try a shade, product or category name.</p>
                  ) : null}
                  <button type="button" onClick={() => go(q)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-ink py-3 text-sm font-semibold text-white">
                    See all results for “{debounced}” <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
