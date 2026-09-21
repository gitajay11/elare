import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SlidersHorizontal, X, Search as SearchIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { type Facets, type ListingFilters } from '@elare/types';
import { Seo, breadcrumbSchema, Breadcrumb, EmptyState, Swatch, Button, Drawer, Checkbox } from '@elare/ui';
import { cn, money } from '@elare/utils';
import { useStoreConfig } from '@/lib/hooks';
import { ProductGrid } from '@/features/products/ProductGrid';
import { Newsletter } from '@/components/layout/Footer';

const SORTS = [
  { value: 'featured', label: 'Featured' },
  { value: 'best_selling', label: 'Best selling' },
  { value: 'newest', label: 'Newest' },
  { value: 'rating', label: 'Top rated' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

type Mode = 'shop' | 'category' | 'search' | 'best-sellers';

function parseFilters(sp: URLSearchParams): ListingFilters {
  const list = (k: string) => sp.getAll(k).filter(Boolean);
  const f: ListingFilters = {};
  if (sp.get('price_min')) f.price_min = Number(sp.get('price_min'));
  if (sp.get('price_max')) f.price_max = Number(sp.get('price_max'));
  if (sp.get('rating_min')) f.rating_min = Number(sp.get('rating_min'));
  if (sp.get('in_stock') === '1') f.in_stock = true;
  if (sp.get('best_seller') === '1') f.best_seller = true;
  if (sp.get('is_new') === '1') f.is_new = true;
  if (sp.get('waterproof')) f.waterproof = sp.get('waterproof') as 'true' | 'false';
  if (list('finish').length) f.finish = list('finish');
  if (list('coverage').length) f.coverage = list('coverage');
  if (list('shade').length) f.shade = list('shade');
  if (list('sub').length) f.subcategory = list('sub');
  return f;
}

export default function Catalog({ mode }: { mode: Mode }) {
  const { category, subcategory } = useParams();
  const [sp, setSp] = useSearchParams();
  const { config } = useStoreConfig();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = mode === 'search' ? sp.get('q') ?? '' : undefined;
  const sort = sp.get('sort') ?? (mode === 'best-sellers' ? 'best_selling' : mode === 'search' ? 'relevance' : 'featured');
  const filters = useMemo(() => {
    const f = parseFilters(sp);
    if (mode === 'best-sellers') f.best_seller = true;
    return f;
  }, [sp, mode]);

  const q = useInfiniteQuery({
    queryKey: ['listing', mode, category, subcategory, query, filters, sort],
    queryFn: ({ pageParam }) => api.listProducts({ category: mode === 'category' ? category : undefined, subcategory: mode === 'category' ? subcategory : undefined, query, filters, sort, page: pageParam, pageSize: 24 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.page_size < last.total ? last.page + 1 : undefined),
    placeholderData: (prev) => prev,
  });

  const first = q.data?.pages[0];
  const products = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = first?.total ?? 0;
  const facets = first?.facets;

  useEffect(() => { window.scrollTo({ top: 0 }); }, [category, subcategory, query]);

  const setParam = (key: string, value: string | string[] | null) => {
    const next = new URLSearchParams(sp);
    next.delete(key);
    if (Array.isArray(value)) value.forEach((v) => next.append(key, v));
    else if (value) next.set(key, value);
    next.delete('page');
    setSp(next, { replace: true });
  };
  const toggleList = (key: string, value: string) => {
    const cur = sp.getAll(key);
    setParam(key, cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]);
  };
  const clearAll = () => setSp(sp.get('q') ? new URLSearchParams({ q: sp.get('q')! }) : new URLSearchParams(), { replace: true });
  const activeCount = ['price_min', 'price_max', 'rating_min', 'in_stock', 'best_seller', 'is_new', 'waterproof', 'finish', 'coverage', 'shade', 'sub'].reduce((n, k) => n + sp.getAll(k).length, 0);

  const catInfo = first?.category;
  const cat = config.categories.find((c) => c.slug === category);
  const sub = cat?.subcategories.find((s) => s.slug === subcategory);
  const title =
    mode === 'search' ? (query ? `Results for “${query}”` : 'Search')
    : mode === 'best-sellers' ? 'Best sellers'
    : mode === 'category' ? (sub?.name ?? catInfo?.subcategory?.name ?? cat?.name ?? catInfo?.name ?? 'Collection')
    : 'All products';
  const description =
    mode === 'search' ? undefined
    : mode === 'best-sellers' ? 'Ranked by real purchases across the Élaré community.'
    : mode === 'category' ? (catInfo?.subcategory?.description ?? catInfo?.description ?? cat?.description ?? undefined)
    : 'The complete Élaré edit — lips, eyes, face and the tools to apply them.';
  const crumbs = [
    ...(mode === 'category' && cat ? [{ name: cat.name, to: `/category/${cat.slug}` }] : []),
    ...(mode === 'category' && sub ? [{ name: sub.name, to: `/category/${cat!.slug}/${sub.slug}` }] : []),
    ...(mode === 'shop' ? [{ name: 'Shop', to: '/shop' }] : []),
    ...(mode === 'best-sellers' ? [{ name: 'Best sellers', to: '/best-sellers' }] : []),
    ...(mode === 'search' ? [{ name: 'Search', to: '/search' }] : []),
  ];

  const filterPanel = facets && (
    <FilterPanel facets={facets} sp={sp} setParam={setParam} toggleList={toggleList} mode={mode} categorySlug={category} clearAll={clearAll} activeCount={activeCount} />
  );

  return (
    <>
      <Seo
        title={title}
        description={description}
        image={cat?.image_url ?? undefined}
        noindex={mode === 'search'}
        jsonLd={[breadcrumbSchema([{ name: 'Home', path: '/' }, ...crumbs.map((c) => ({ name: c.name, path: c.to }))]), { '@type': 'CollectionPage', name: title, description }]}
      />
      <div className="container-x pb-20 pt-6">
        <Breadcrumb items={crumbs} />
        <header className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            {mode === 'category' && sub && <p className="eyebrow">{cat?.name}</p>}
            <h1 className="mt-1 text-[2.4rem] leading-[1.05] sm:text-[3.2rem]">{title}</h1>
            {description && <p className="mt-3 text-[15px] text-ink-soft">{description}</p>}
          </div>
          <p className="text-[12.5px] uppercase tracking-[0.16em] text-mist">{total} {total === 1 ? 'product' : 'products'}</p>
        </header>

        {mode === 'category' && cat && !sub && cat.subcategories.length > 0 && (
          <div className="scrollbar-none mt-6 flex gap-2 overflow-x-auto pb-1">
            {cat.subcategories.map((s) => (
              <Link key={s.id} to={`/category/${cat.slug}/${s.slug}`} className="whitespace-nowrap rounded-full border border-line bg-white px-4 py-2 text-[13px] font-medium transition-colors hover:border-rose hover:text-rose">{s.name}</Link>
            ))}
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3 border-y border-line py-3">
          <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex items-center gap-2 text-sm font-semibold lg:hidden">
            <SlidersHorizontal size={16} /> Filters {activeCount > 0 && <span className="rounded-full bg-rose px-1.5 text-[10px] text-white">{activeCount}</span>}
          </button>
          <p className="hidden text-sm text-ink-soft lg:block">{activeCount > 0 ? <button type="button" onClick={clearAll} className="font-semibold text-rose underline-offset-4 hover:underline">Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}</button> : 'Refine your edit'}</p>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-mist">Sort</span>
            <select value={sort} onChange={(e) => setParam('sort', e.target.value)} className="h-9 rounded-full border border-line bg-white px-3 text-sm font-medium outline-none focus:border-rose" aria-label="Sort products">
              {mode === 'search' && <option value="relevance">Relevance</option>}
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[250px_1fr]">
          <aside className="hidden lg:block" aria-label="Filters">{filterPanel}</aside>
          <div>
            <ProductGrid
              products={products}
              loading={q.isLoading}
              empty={
                <EmptyState
                  icon={<SearchIcon size={20} />}
                  title={mode === 'search' ? 'No results found' : 'Nothing here yet'}
                  description={mode === 'search' ? 'Try a shade name like “Rose Nude”, a product like “mascara”, or browse a category below.' : 'Try clearing a filter or explore another category.'}
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      {activeCount > 0 && <Button variant="outline" size="sm" onClick={clearAll}>Clear filters</Button>}
                      {config.categories.map((c) => <Button key={c.id} variant="soft" size="sm" to={`/category/${c.slug}`}>{c.name}</Button>)}
                    </div>
                  }
                />
              }
            />
            {q.hasNextPage && (
              <div className="mt-12 flex flex-col items-center gap-3">
                <p className="text-[12px] uppercase tracking-[0.16em] text-mist">Showing {products.length} of {total}</p>
                <Button variant="outline" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Load more</Button>
              </div>
            )}
          </div>
        </div>
      </div>
      <Drawer open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters" side="left" footer={<Button full onClick={() => setFiltersOpen(false)}>Show {total} {total === 1 ? 'product' : 'products'}</Button>}>
        {filterPanel}
      </Drawer>
      {mode !== 'search' && <Newsletter />}
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-5 first:pt-0">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function FilterPanel({ facets, sp, setParam, toggleList, mode, categorySlug, clearAll, activeCount }: { facets: Facets; sp: URLSearchParams; setParam: (k: string, v: string | string[] | null) => void; toggleList: (k: string, v: string) => void; mode: Mode; categorySlug?: string; clearAll: () => void; activeCount: number }) {
  const { config } = useStoreConfig();
  const min = Math.floor(Number(facets.price.min));
  const max = Math.ceil(Number(facets.price.max));
  const curMax = Number(sp.get('price_max') ?? max);
  const [priceMax, setPriceMax] = useState(curMax);
  useEffect(() => setPriceMax(curMax), [curMax, max]);
  const cats = config.categories;

  return (
    <div className="text-sm">
      {activeCount > 0 && <button type="button" onClick={clearAll} className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-semibold text-rose lg:hidden"><X size={14} /> Clear all</button>}

      {mode !== 'category' && cats.length > 0 && (
        <FilterGroup title="Category">
          {cats.map((c) => <Link key={c.id} to={`/category/${c.slug}`} className="block text-ink-soft hover:text-rose">{c.name}</Link>)}
        </FilterGroup>
      )}

      {mode === 'category' && categorySlug && facets.subcategories.length > 1 && (
        <FilterGroup title="Type">
          {facets.subcategories.map((s) => (
            <Checkbox key={s.slug} label={<span>{s.name} <span className="text-mist">({s.count})</span></span>} checked={sp.getAll('sub').includes(s.slug)} onChange={() => toggleList('sub', s.slug)} />
          ))}
        </FilterGroup>
      )}

      {max > min && (
        <FilterGroup title="Price">
          <input type="range" className="range" min={min} max={max} step={50} value={priceMax} onChange={(e) => setPriceMax(Number(e.target.value))} onMouseUp={() => setParam('price_max', priceMax >= max ? null : String(priceMax))} onTouchEnd={() => setParam('price_max', priceMax >= max ? null : String(priceMax))} onKeyUp={() => setParam('price_max', priceMax >= max ? null : String(priceMax))} aria-label="Maximum price" />
          <div className="flex justify-between text-[12.5px] text-ink-soft"><span>{money(min)}</span><span>Up to <b className="text-ink">{money(priceMax)}</b></span></div>
        </FilterGroup>
      )}

      {facets.shade.length > 0 && (
        <FilterGroup title="Shade">
          <div className="flex flex-wrap gap-2">
            {facets.shade.slice(0, 24).map((s) => (
              <Swatch key={s.name} hex={s.hex} name={s.name} size={24} selected={sp.getAll('shade').includes(s.name)} onClick={() => toggleList('shade', s.name)} />
            ))}
          </div>
        </FilterGroup>
      )}

      {facets.finish.length > 1 && (
        <FilterGroup title="Finish">
          {facets.finish.map((f) => <Checkbox key={f} label={f} checked={sp.getAll('finish').includes(f)} onChange={() => toggleList('finish', f)} />)}
        </FilterGroup>
      )}

      {facets.coverage.length > 1 && (
        <FilterGroup title="Coverage">
          {facets.coverage.map((f) => <Checkbox key={f} label={f} checked={sp.getAll('coverage').includes(f)} onChange={() => toggleList('coverage', f)} />)}
        </FilterGroup>
      )}

      {facets.has_waterproof && (
        <FilterGroup title="Formula">
          {[['', 'All'], ['true', 'Waterproof'], ['false', 'Non-waterproof']].map(([v, l]) => (
            <label key={v} className="flex cursor-pointer items-center gap-3">
              <input type="radio" name="waterproof" className="accent-rose" checked={(sp.get('waterproof') ?? '') === v} onChange={() => setParam('waterproof', v || null)} />
              {l}
            </label>
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Rating">
        {[4, 3].map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3">
            <input type="radio" name="rating" className="accent-rose" checked={sp.get('rating_min') === String(r)} onChange={() => setParam('rating_min', String(r))} />
            {r}★ & up
          </label>
        ))}
        {sp.get('rating_min') && <button type="button" onClick={() => setParam('rating_min', null)} className="text-[12px] text-rose">Any rating</button>}
      </FilterGroup>

      <FilterGroup title="Availability">
        <Checkbox label="In stock only" checked={sp.get('in_stock') === '1'} onChange={(e) => setParam('in_stock', e.target.checked ? '1' : null)} />
        {facets.has_best_sellers && mode !== 'best-sellers' && <Checkbox label="Best sellers" checked={sp.get('best_seller') === '1'} onChange={(e) => setParam('best_seller', e.target.checked ? '1' : null)} />}
        {facets.has_new && <Checkbox label="New arrivals" checked={sp.get('is_new') === '1'} onChange={(e) => setParam('is_new', e.target.checked ? '1' : null)} />}
      </FilterGroup>
      <p className={cn('mt-4 text-[12px] text-mist', activeCount === 0 && 'hidden')}>{activeCount} active</p>
    </div>
  );
}
