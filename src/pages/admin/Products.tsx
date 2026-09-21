import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Upload, GripVertical } from 'lucide-react';
import { adminApi, type AdminProductPayload, type AdminProductSave } from '@/lib/api';
import { money, formatDate } from '@/lib/format';
import { cn, slugify } from '@/lib/utils';
import { toast } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Select, Toggle } from '@/components/ui/Field';
import { Badge, Skeleton, Swatch } from '@/components/ui/Primitives';
import { Confirm } from '@/components/ui/Overlay';
import { AdminHeader, Pager, Table } from './AdminLayout';

/* List -------------------------------------------------------------------- */
export function AdminProducts() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-products', query, status, page], queryFn: () => adminApi.products({ query, status, page }), placeholderData: (p) => p });
  const [removing, setRemoving] = useState<string | null>(null);
  const del = useMutation({ mutationFn: adminApi.deleteProduct, onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-products'] }); setRemoving(null); toast({ title: 'Product removed' }); }, onError: (e) => toast({ title: 'Could not delete', description: (e as Error).message, variant: 'error' }) });
  return (
    <div>
      <AdminHeader title="Products" description="Publish, price and stock every product and its shades." action={<Button to="/admin/products/new" icon={<Plus size={16} />}>New product</Button>} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search products…" className="h-10 w-64 rounded-full border border-line bg-white px-4 text-sm outline-none focus:border-rose" />
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-10 rounded-full border border-line bg-white px-4 text-sm outline-none"><option value="">All</option><option value="published">Published</option><option value="draft">Draft</option><option value="low_stock">Low stock</option></select>
      </div>
      {isLoading || !data ? <Skeleton className="h-64" /> : (
        <>
          <Table head={['Product', 'Category', 'Price', 'Stock', 'Sold', 'Rating', 'Status', '']}>
            {data.items.map((p) => (
              <tr key={p.id} className="hover:bg-ivory">
                <td className="px-4 py-2.5"><Link to={`/admin/products/${p.id}`} className="flex items-center gap-3 font-semibold hover:text-rose"><span className="h-11 w-9 overflow-hidden rounded-md bg-nude">{p.image && <img src={p.image} alt="" className="h-full w-full object-cover" />}</span><span>{p.name}<span className="block text-[11px] font-normal text-mist">{p.variant_count} variants · {formatDate(p.updated_at)}</span></span></Link></td>
                <td className="px-4 py-2.5 text-ink-soft">{p.category}{p.subcategory ? ` / ${p.subcategory}` : ''}</td>
                <td className="px-4 py-2.5">{money(p.price)}{p.compare_at_price && <s className="ml-1 text-mist">{money(p.compare_at_price)}</s>}</td>
                <td className={cn('px-4 py-2.5 font-medium', p.stock === 0 ? 'text-danger' : p.stock <= 5 ? 'text-rose' : '')}>{p.stock}</td>
                <td className="px-4 py-2.5">{p.units_sold}</td>
                <td className="px-4 py-2.5">{p.review_count ? `${Number(p.rating).toFixed(1)} (${p.review_count})` : '—'}</td>
                <td className="px-4 py-2.5"><div className="flex flex-wrap gap-1">{p.is_published ? <Badge tone="success">Live</Badge> : <Badge>Draft</Badge>}{p.is_best_seller && <Badge tone="ink">Best</Badge>}{p.is_new && <Badge tone="champagne">New</Badge>}</div></td>
                <td className="px-4 py-2.5 text-right"><button type="button" onClick={() => setRemoving(p.id)} aria-label="Delete" className="text-mist hover:text-danger"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </Table>
          <Pager page={page} total={data.total} pageSize={30} onChange={setPage} />
        </>
      )}
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing)} title="Delete this product?" description="Products with order history are unpublished instead of deleted, so past orders stay intact." confirmLabel="Delete" danger loading={del.isPending} />
    </div>
  );
}

/* Editor ------------------------------------------------------------------ */
type Shade = { id: string; name: string; hex: string; undertone: string | null; description: string | null; is_active: boolean };
type Variant = { id: string; shade_id: string | null; sku: string; name: string; options: Record<string, unknown>; price_override: number | null; is_active: boolean; quantity: number; low_stock_threshold: number };
type Img = { url: string; alt: string; shade_id: string | null };

const emptyProduct = { slug: '', name: '', short_description: '', description: '', benefits: [] as string[], how_to_use: '', ingredients: '', size_label: '', finish: '', coverage: '', suitability: '', category_id: '', subcategory_id: '', price: 0, compare_at_price: null as number | null, loyalty_points: null as number | null, attributes: {} as Record<string, unknown>, video_url: '', is_published: false, is_best_seller: false, is_new: false, is_gift_only: false };
const tmp = () => 'tmp-' + Math.random().toString(36).slice(2, 9);

export function AdminProductEditor() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: cats } = useQuery({ queryKey: ['admin-categories'], queryFn: adminApi.categories });
  const { data: variantOptions } = useQuery({ queryKey: ['admin-variant-options'], queryFn: adminApi.variantOptions });
  const { data: existing, isLoading } = useQuery({ queryKey: ['admin-product', id], queryFn: () => adminApi.product(id!), enabled: !isNew });

  const [product, setProduct] = useState<typeof emptyProduct>(emptyProduct);
  const [shades, setShades] = useState<Shade[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [bundle, setBundle] = useState<{ variant_id: string; quantity: number }[]>([]);
  const [recs, setRecs] = useState<{ product_id: string; kind: string; name?: string }[]>([]);
  const [benefitsText, setBenefitsText] = useState('');
  const [attrsText, setAttrsText] = useState('{}');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!existing) return;
    const p = existing.product as unknown as typeof emptyProduct;
    setProduct({ ...emptyProduct, ...p, compare_at_price: p.compare_at_price ?? null, loyalty_points: p.loyalty_points ?? null, subcategory_id: (p.subcategory_id as string | null) ?? '' });
    setBenefitsText((p.benefits ?? []).join('\n'));
    setAttrsText(JSON.stringify(p.attributes ?? {}, null, 2));
    setShades(existing.shades);
    setVariants(existing.variants);
    setImages(existing.images.map((i) => ({ url: i.url, alt: i.alt, shade_id: i.shade_id })));
    setBundle(existing.bundle_items.map((b) => ({ variant_id: b.variant_id, quantity: b.quantity })));
    setRecs(existing.recommendations);
  }, [existing]);

  const subcats = useMemo(() => cats?.subcategories.filter((s) => s.category_id === product.category_id) ?? [], [cats, product.category_id]);

  const save = useMutation({
    mutationFn: (payload: AdminProductSave) => adminApi.saveProduct(payload),
    onSuccess: (r: AdminProductPayload) => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['admin-product', r.product.id] });
      qc.invalidateQueries({ queryKey: ['home'] });
      toast({ title: 'Product saved', variant: 'success' });
      if (isNew) navigate(`/admin/products/${r.product.id}`, { replace: true });
    },
    onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' }),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    let attributes: Record<string, unknown> = {};
    try { attributes = JSON.parse(attrsText || '{}'); } catch { toast({ title: 'Attributes must be valid JSON', variant: 'error' }); return; }
    if (!product.category_id) { toast({ title: 'Choose a category', variant: 'error' }); return; }
    if (!variants.length) { toast({ title: 'Add at least one variant', description: 'Every product needs a sellable variant with stock.', variant: 'error' }); return; }
    save.mutate({
      id: isNew ? undefined : id,
      product: { ...product, slug: product.slug || slugify(product.name), benefits: benefitsText.split('\n').map((b) => b.trim()).filter(Boolean), attributes, subcategory_id: product.subcategory_id || null, compare_at_price: product.compare_at_price || null, loyalty_points: product.loyalty_points ?? null },
      shades,
      variants,
      images,
      bundle_items: bundle,
      recommendations: recs,
    });
  };

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const url = await adminApi.uploadProductMedia(f);
        setImages((imgs) => [...imgs, { url, alt: product.name, shade_id: null }]);
      }
    } catch (err) { toast({ title: 'Upload failed', description: (err as Error).message, variant: 'error' }); }
    finally { setUploading(false); }
  };

  if (!isNew && (isLoading || !existing)) return <Skeleton className="h-96" />;
  const setP = <K extends keyof typeof emptyProduct>(k: K, v: (typeof emptyProduct)[K]) => setProduct((p) => ({ ...p, [k]: v }));

  return (
    <form onSubmit={submit}>
      <AdminHeader title={isNew ? 'New product' : product.name || 'Edit product'} description={isNew ? 'Create the product, its shades, variants and stock in one go.' : `/product/${product.slug}`} action={<div className="flex gap-2"><Button variant="ghost" to="/admin/products">Back</Button>{!isNew && <Button variant="outline" href={`/product/${product.slug}`}>View</Button>}<Button type="submit" loading={save.isPending}>Save</Button></div>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Name" required value={product.name} onChange={(e) => { setP('name', e.target.value); if (isNew) setP('slug', slugify(e.target.value)); }} />
              <Input label="Slug" required value={product.slug} onChange={(e) => setP('slug', slugify(e.target.value))} />
              <Input label="Short description" value={product.short_description ?? ''} onChange={(e) => setP('short_description', e.target.value)} wrapClassName="sm:col-span-2" />
              <Textarea label="Description" value={product.description ?? ''} onChange={(e) => setP('description', e.target.value)} />
              <Textarea label="Benefits (one per line)" value={benefitsText} onChange={(e) => setBenefitsText(e.target.value)} />
              <Textarea label="How to use" value={product.how_to_use ?? ''} onChange={(e) => setP('how_to_use', e.target.value)} />
              <Textarea label="Ingredients" value={product.ingredients ?? ''} onChange={(e) => setP('ingredients', e.target.value)} />
              <Input label="Size / quantity" value={product.size_label ?? ''} onChange={(e) => setP('size_label', e.target.value)} placeholder="3.5 g" />
              <Input label="Suitability" value={product.suitability ?? ''} onChange={(e) => setP('suitability', e.target.value)} />
              <Input label="Finish" value={product.finish ?? ''} onChange={(e) => setP('finish', e.target.value)} placeholder="Satin, Matte…" />
              <Input label="Coverage" value={product.coverage ?? ''} onChange={(e) => setP('coverage', e.target.value)} placeholder="Light, Medium, Full" />
              <Input label="Video URL" value={product.video_url ?? ''} onChange={(e) => setP('video_url', e.target.value)} wrapClassName="sm:col-span-2" placeholder="https://…/video.mp4" />
            </div>
          </Card>

          <Card title="Shades" action={<Button size="sm" variant="soft" onClick={() => setShades((s) => [...s, { id: tmp(), name: '', hex: '#E8A7B8', undertone: null, description: null, is_active: true }])} icon={<Plus size={14} />}>Add shade</Button>}>
            {shades.length === 0 && <p className="text-sm text-mist">No shades — the product will be sold as a single item (or by option variants below).</p>}
            <div className="space-y-2">
              {shades.map((s, i) => (
                <div key={s.id} className="grid grid-cols-[auto_1fr_100px_120px_auto] items-center gap-2">
                  <input type="color" value={s.hex} onChange={(e) => setShades((arr) => arr.map((x, j) => (j === i ? { ...x, hex: e.target.value.toUpperCase() } : x)))} className="h-10 w-10 cursor-pointer rounded-full border-0 bg-transparent" aria-label="Shade colour" />
                  <input value={s.name} onChange={(e) => setShades((arr) => arr.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Shade name" className="h-10 rounded-xl border border-line px-3 text-sm" required />
                  <input value={s.hex} onChange={(e) => setShades((arr) => arr.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))} className="h-10 rounded-xl border border-line px-3 text-sm uppercase" pattern="#[0-9a-fA-F]{6}" />
                  <select value={s.undertone ?? ''} onChange={(e) => setShades((arr) => arr.map((x, j) => (j === i ? { ...x, undertone: e.target.value || null } : x)))} className="h-10 rounded-xl border border-line bg-white px-2 text-sm"><option value="">Undertone</option><option>warm</option><option>cool</option><option>neutral</option></select>
                  <button type="button" onClick={() => { setShades((arr) => arr.filter((_, j) => j !== i)); setVariants((v) => v.map((x) => (x.shade_id === s.id ? { ...x, shade_id: null } : x))); }} className="text-mist hover:text-danger" aria-label="Remove shade"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            {shades.length > 0 && variants.length === 0 && (
              <Button size="sm" variant="outline" className="mt-3" onClick={() => setVariants(shades.map((s, i) => ({ id: tmp(), shade_id: s.id, sku: `${slugify(product.name || 'sku').toUpperCase()}-${String(i + 1).padStart(2, '0')}`, name: s.name, options: {}, price_override: null, is_active: true, quantity: 0, low_stock_threshold: 5 })))}>Generate one variant per shade</Button>
            )}
          </Card>

          <Card title="Variants & stock" action={<Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setVariants((v) => [...v, { id: tmp(), shade_id: null, sku: '', name: '', options: {}, price_override: null, is_active: true, quantity: 0, low_stock_threshold: 5 }])}>Add variant</Button>}>
            <p className="mb-3 text-[12.5px] text-mist">Inventory is tracked per variant. Stock changes made here are written to the inventory history.</p>
            <div className="space-y-3">
              {variants.map((v, i) => {
                const set = (patch: Partial<Variant>) => setVariants((arr) => arr.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                const opt = (k: string, val: string) => set({ options: Object.fromEntries(Object.entries({ ...v.options, [k]: k === 'waterproof' ? (val === '' ? undefined : val === 'true') : val || undefined }).filter(([, x]) => x !== undefined)) });
                return (
                  <div key={v.id} className="rounded-xl border border-line p-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_140px_100px]">
                      <input value={v.name} onChange={(e) => set({ name: e.target.value })} placeholder="Variant name" required className="h-10 rounded-xl border border-line px-3 text-sm" />
                      <input value={v.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} placeholder="SKU" required className="h-10 rounded-xl border border-line px-3 text-sm" />
                      <select value={v.shade_id ?? ''} onChange={(e) => set({ shade_id: e.target.value || null })} className="h-10 rounded-xl border border-line bg-white px-2 text-sm"><option value="">No shade</option>{shades.map((s) => <option key={s.id} value={s.id}>{s.name || '(unnamed)'}</option>)}</select>
                      <input type="number" step="0.01" value={v.price_override ?? ''} onChange={(e) => set({ price_override: e.target.value ? Number(e.target.value) : null })} placeholder="Price ovr." className="h-10 rounded-xl border border-line px-3 text-sm" />
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_120px_1fr_90px_90px_auto]">
                      <input value={String(v.options.finish ?? '')} onChange={(e) => opt('finish', e.target.value)} placeholder="Finish" className="h-9 rounded-lg border border-line px-2 text-[13px]" />
                      <input value={String(v.options.coverage ?? '')} onChange={(e) => opt('coverage', e.target.value)} placeholder="Coverage" className="h-9 rounded-lg border border-line px-2 text-[13px]" />
                      <select value={v.options.waterproof === undefined ? '' : String(v.options.waterproof)} onChange={(e) => opt('waterproof', e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2 text-[13px]"><option value="">Waterproof?</option><option value="true">Waterproof</option><option value="false">Non-waterproof</option></select>
                      <input value={String(v.options.pack ?? v.options.size ?? '')} onChange={(e) => opt('pack', e.target.value)} placeholder="Pack / size" className="h-9 rounded-lg border border-line px-2 text-[13px]" />
                      <input type="number" min={0} value={v.quantity} onChange={(e) => set({ quantity: Number(e.target.value) })} title="Stock" className="h-9 rounded-lg border border-line px-2 text-[13px]" />
                      <input type="number" min={0} value={v.low_stock_threshold} onChange={(e) => set({ low_stock_threshold: Number(e.target.value) })} title="Low-stock threshold" className="h-9 rounded-lg border border-line px-2 text-[13px]" />
                      <div className="flex items-center gap-2"><Toggle checked={v.is_active} onChange={(x) => set({ is_active: x })} /><button type="button" onClick={() => setVariants((arr) => arr.filter((_, j) => j !== i))} className="text-mist hover:text-danger" aria-label="Remove variant"><Trash2 size={15} /></button></div>
                    </div>
                    <p className="mt-1 text-[11px] text-mist">Stock · low-stock threshold · active</p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Images" action={<label className={cn('inline-flex h-9 cursor-pointer items-center gap-2 rounded-full bg-blush px-4 text-[13px] font-semibold text-rose-deep', uploading && 'opacity-50')}><Upload size={14} /> {uploading ? 'Uploading…' : 'Upload'}<input type="file" accept="image/*,video/mp4" multiple className="hidden" onChange={(e) => upload(e.target.files)} /></label>}>
            <div className="space-y-2">
              {images.map((img, i) => (
                <div key={i} className="grid grid-cols-[auto_auto_1fr_1fr_140px_auto] items-center gap-2">
                  <GripVertical size={14} className="text-mist" />
                  <span className="h-12 w-10 overflow-hidden rounded-md bg-nude"><img src={img.url} alt="" className="h-full w-full object-cover" /></span>
                  <input value={img.url} onChange={(e) => setImages((arr) => arr.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://…" className="h-10 rounded-xl border border-line px-3 text-sm" />
                  <input value={img.alt} onChange={(e) => setImages((arr) => arr.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} placeholder="Alt text" className="h-10 rounded-xl border border-line px-3 text-sm" />
                  <select value={img.shade_id ?? ''} onChange={(e) => setImages((arr) => arr.map((x, j) => (j === i ? { ...x, shade_id: e.target.value || null } : x)))} className="h-10 rounded-xl border border-line bg-white px-2 text-sm"><option value="">All shades</option>{shades.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                  <div className="flex gap-1"><button type="button" disabled={i === 0} onClick={() => setImages((arr) => { const c = [...arr]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })} className="text-mist disabled:opacity-30">↑</button><button type="button" onClick={() => setImages((arr) => arr.filter((_, j) => j !== i))} className="text-mist hover:text-danger"><Trash2 size={15} /></button></div>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setImages((arr) => [...arr, { url: '', alt: product.name, shade_id: null }])}>Add image URL</Button>
            </div>
          </Card>

          <Card title="Bundle contents" action={<Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setBundle((b) => [...b, { variant_id: '', quantity: 1 }])}>Add component</Button>}>
            <p className="mb-3 text-[12.5px] text-mist">For combos such as the Lip Edit: the variants included in this product.</p>
            {bundle.map((b, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_80px_auto] gap-2">
                <select value={b.variant_id} onChange={(e) => setBundle((arr) => arr.map((x, j) => (j === i ? { ...x, variant_id: e.target.value } : x)))} className="h-10 rounded-xl border border-line bg-white px-2 text-sm"><option value="">Choose a variant</option>{variantOptions?.filter((o) => o.product_id !== id).map((o) => <option key={o.variant_id} value={o.variant_id}>{o.label} — {money(o.price)}</option>)}</select>
                <input type="number" min={1} value={b.quantity} onChange={(e) => setBundle((arr) => arr.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} className="h-10 rounded-xl border border-line px-3 text-sm" />
                <button type="button" onClick={() => setBundle((arr) => arr.filter((_, j) => j !== i))} className="text-mist hover:text-danger"><Trash2 size={15} /></button>
              </div>
            ))}
          </Card>

          <Card title="Recommendations" action={<Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setRecs((r) => [...r, { product_id: '', kind: 'complete_look' }])}>Add</Button>}>
            {recs.map((r, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_160px_auto] gap-2">
                <select value={r.product_id} onChange={(e) => setRecs((arr) => arr.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))} className="h-10 rounded-xl border border-line bg-white px-2 text-sm"><option value="">Choose a product</option>{Array.from(new Map(variantOptions?.map((o) => [o.product_id, o.label.split(' · ')[0]])).entries()).filter(([pid]) => pid !== id).map(([pid, name]) => <option key={pid} value={pid}>{name}</option>)}</select>
                <select value={r.kind} onChange={(e) => setRecs((arr) => arr.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))} className="h-10 rounded-xl border border-line bg-white px-2 text-sm"><option value="complete_look">Complete your look</option><option value="also_like">You may also like</option><option value="bundle">Natural bundle (home)</option></select>
                <button type="button" onClick={() => setRecs((arr) => arr.filter((_, j) => j !== i))} className="text-mist hover:text-danger"><Trash2 size={15} /></button>
              </div>
            ))}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Status">
            <div className="space-y-3">
              <Toggle label="Published" checked={product.is_published} onChange={(v) => setP('is_published', v)} />
              <Toggle label="Best seller badge" checked={product.is_best_seller} onChange={(v) => setP('is_best_seller', v)} />
              <Toggle label="New badge" checked={product.is_new} onChange={(v) => setP('is_new', v)} />
              <Toggle label="Gift-only (not purchasable)" checked={product.is_gift_only} onChange={(v) => setP('is_gift_only', v)} />
            </div>
          </Card>
          <Card title="Pricing & points">
            <div className="space-y-4">
              <Input label="Price (₹)" type="number" step="0.01" min={0} required value={product.price} onChange={(e) => setP('price', Number(e.target.value))} />
              <Input label="Compare-at price (₹)" type="number" step="0.01" min={0} value={product.compare_at_price ?? ''} onChange={(e) => setP('compare_at_price', e.target.value ? Number(e.target.value) : null)} hint="Shown struck through when higher than the price." />
              <Input label="Loyalty points" type="number" min={0} value={product.loyalty_points ?? ''} onChange={(e) => setP('loyalty_points', e.target.value ? Number(e.target.value) : null)} hint="Leave blank to use the global points-per-rupee rate." />
            </div>
          </Card>
          <Card title="Category">
            <div className="space-y-4">
              <Select label="Category" required value={product.category_id} onChange={(e) => { setP('category_id', e.target.value); setP('subcategory_id', ''); }}><option value="">Select</option>{cats?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
              <Select label="Subcategory" value={product.subcategory_id ?? ''} onChange={(e) => setP('subcategory_id', e.target.value)}><option value="">None</option>{subcats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            </div>
          </Card>
          <Card title="Attributes (JSON)">
            <textarea value={attrsText} onChange={(e) => setAttrsText(e.target.value)} rows={6} className="w-full rounded-xl border border-line px-3 py-2 font-mono text-[12px]" />
            <p className="mt-1 text-[11.5px] text-mist">e.g. {'{"collection":"signature","product_type":"combo","waterproof":true,"points_redeemable":false}'}</p>
          </Card>
          {shades.length > 0 && <Card title="Preview"><div className="flex flex-wrap gap-2">{shades.map((s) => <Swatch key={s.id} hex={/^#[0-9a-fA-F]{6}$/.test(s.hex) ? s.hex : '#ccc'} name={s.name} size={28} />)}</div></Card>}
        </div>
      </div>
    </form>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-4 flex items-center justify-between"><h3 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h3>{action}</div>
      {children}
    </section>
  );
}
