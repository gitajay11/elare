import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Trash2, History, Check } from 'lucide-react';
import { adminApi, type InventoryRow } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { toast } from '@/store/ui';
import { STORE_URL } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Input, Select, Checkbox } from '@/components/ui/Field';
import { Badge, Skeleton, Stars, Swatch } from '@/components/ui/Primitives';
import { Modal, Confirm } from '@/components/ui/Overlay';
import { AdminHeader, Table } from './AdminLayout';

/* Reviews ----------------------------------------------------------------- */
export function AdminReviews() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['admin-reviews', status, verifiedOnly], queryFn: () => adminApi.reviews(status, verifiedOnly) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-reviews'] }); qc.invalidateQueries({ queryKey: ['home'] }); };
  const setState = useMutation({ mutationFn: ({ id, s }: { id: string; s: 'approved' | 'hidden' | 'pending' }) => adminApi.setReviewStatus(id, s), onSuccess: refresh, onError: (e) => toast({ title: 'Could not update', description: (e as Error).message, variant: 'error' }) });
  const del = useMutation({ mutationFn: adminApi.deleteReview, onSuccess: () => { refresh(); setRemoving(null); toast({ title: 'Review deleted' }); } });
  return (
    <div>
      <AdminHeader title="Reviews" description="Every review is tied to a real customer account. Hidden reviews are excluded from ratings immediately." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 rounded-full border border-line bg-white px-4 text-sm"><option value="">All</option><option value="approved">Approved</option><option value="hidden">Hidden</option><option value="pending">Pending</option></select>
        <Checkbox label="Verified purchases only" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
      </div>
      {isLoading || !data ? <Skeleton className="h-64" /> : data.length ? (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Stars value={r.rating} size={13} /><a href={`${STORE_URL}/product/${r.product.slug}`} target="_blank" rel="noreferrer" className="font-semibold hover:text-rose">{r.product.name}</a>{r.is_verified && <Badge tone="success">Verified</Badge>}<Badge tone={r.status === 'approved' ? 'blush' : r.status === 'hidden' ? 'danger' : 'neutral'}>{r.status}</Badge></div>
                  {r.title && <p className="mt-1.5 font-medium">{r.title}</p>}
                  <p className="text-sm text-ink-soft">{r.body}</p>
                  {r.images.length > 0 && <div className="mt-2 flex gap-2">{r.images.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-14 w-14 rounded-lg object-cover" /></a>)}</div>}
                  <p className="mt-2 text-[12px] text-mist"><Link to={`/customers/${r.customer.id}`} className="font-semibold text-ink-soft hover:text-rose">{r.customer.name || r.customer.email}</Link> · {formatDateTime(r.created_at)}</p>
                </div>
                <div className="flex gap-1">
                  {r.status !== 'approved' && <Button size="sm" variant="soft" icon={<Check size={14} />} onClick={() => setState.mutate({ id: r.id, s: 'approved' })}>Approve</Button>}
                  {r.status !== 'hidden' ? <Button size="sm" variant="ghost" icon={<EyeOff size={14} />} onClick={() => setState.mutate({ id: r.id, s: 'hidden' })}>Hide</Button> : <Button size="sm" variant="ghost" icon={<Eye size={14} />} onClick={() => setState.mutate({ id: r.id, s: 'approved' })}>Show</Button>}
                  <button type="button" onClick={() => setRemoving(r.id)} className="grid h-9 w-9 place-items-center rounded-full text-mist hover:bg-danger/10 hover:text-danger" aria-label="Delete"><Trash2 size={15} /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-mist">No reviews match.</p>}
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing)} title="Delete this review?" confirmLabel="Delete" danger loading={del.isPending} />
    </div>
  );
}

/* Inventory --------------------------------------------------------------- */
export function AdminInventory() {
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['admin-inventory', query, lowOnly], queryFn: () => adminApi.inventory(query, lowOnly), placeholderData: (p) => p });
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [history, setHistory] = useState<InventoryRow | null>(null);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('restock');
  const [note, setNote] = useState('');
  const adjust = useMutation({
    mutationFn: () => adminApi.adjustInventory(adjusting!.variant_id, Number(delta), reason, note),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['admin-inventory'] }); qc.invalidateQueries({ queryKey: ['admin-dashboard'] }); toast({ title: `Stock is now ${r.quantity}`, variant: 'success' }); setAdjusting(null); setDelta(''); setNote(''); },
    onError: (e) => toast({ title: 'Could not adjust stock', description: (e as Error).message, variant: 'error' }),
  });
  const { data: movements } = useQuery({ queryKey: ['inventory-history', history?.variant_id], queryFn: () => adminApi.inventoryHistory(history!.variant_id), enabled: !!history });
  const low = data?.filter((r) => r.is_active && r.quantity <= r.threshold).length ?? 0;
  return (
    <div>
      <AdminHeader title="Inventory" description={`Variant-level stock with a full movement history. ${low} variant${low === 1 ? '' : 's'} at or below threshold.`} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, variant or SKU" className="h-10 w-80 rounded-full border border-line bg-white px-4 text-sm outline-none focus:border-rose" />
        <Checkbox label="Low stock only" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
      </div>
      {isLoading || !data ? <Skeleton className="h-64" /> : (
        <Table head={['Product', 'Variant', 'SKU', 'In stock', 'Threshold', 'Updated', '']}>
          {data.map((r) => {
            const state = r.quantity === 0 ? 'out' : r.quantity <= r.threshold ? 'low' : 'ok';
            return (
              <tr key={r.variant_id} className={cn('hover:bg-ivory', !r.is_active && 'opacity-50')}>
                <td className="px-4 py-2.5"><Link to={`/products/${r.product_id}`} className="flex items-center gap-3 font-semibold hover:text-rose"><span className="h-10 w-8 overflow-hidden rounded-md bg-nude">{r.image && <img src={r.image} alt="" className="h-full w-full object-cover" />}</span>{r.product}</Link></td>
                <td className="px-4 py-2.5"><span className="flex items-center gap-2">{r.shade_hex && <Swatch hex={r.shade_hex} name="" size={12} />}{r.variant}</span></td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-mist">{r.sku}</td>
                <td className="px-4 py-2.5"><span className={cn('font-semibold', state === 'out' ? 'text-danger' : state === 'low' ? 'text-rose' : '')}>{r.quantity}</span>{state !== 'ok' && <Badge tone={state === 'out' ? 'danger' : 'blush'} className="ml-2">{state === 'out' ? 'Out' : 'Low'}</Badge>}</td>
                <td className="px-4 py-2.5 text-ink-soft">{r.threshold}</td>
                <td className="px-4 py-2.5 text-mist">{r.updated_at ? formatDate(r.updated_at) : '—'}</td>
                <td className="px-4 py-2.5 text-right"><div className="flex justify-end gap-1"><Button size="sm" variant="soft" onClick={() => setAdjusting(r)}>Adjust</Button><button type="button" onClick={() => setHistory(r)} className="grid h-9 w-9 place-items-center rounded-full text-mist hover:bg-blush/60" aria-label="History"><History size={15} /></button></div></td>
              </tr>
            );
          })}
        </Table>
      )}
      <Modal open={!!adjusting} onClose={() => setAdjusting(null)} title="Adjust stock" size="sm">
        {adjusting && (
          <form onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }} className="space-y-4">
            <p className="text-sm"><b>{adjusting.product}</b> · {adjusting.variant} — currently <b>{adjusting.quantity}</b></p>
            <Input label="Change (+ / −)" type="number" required value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="e.g. 50 or -3" />
            <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="restock">Restock</option><option value="adjustment">Adjustment / correction</option><option value="return">Customer return</option></Select>
            <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="PO number, damaged batch…" />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setAdjusting(null)}>Cancel</Button><Button type="submit" disabled={!delta || Number(delta) === 0} loading={adjust.isPending}>Apply</Button></div>
          </form>
        )}
      </Modal>
      <Modal open={!!history} onClose={() => setHistory(null)} title={history ? `${history.product} · ${history.variant}` : 'History'} size="md">
        {movements ? (
          <ul className="divide-y divide-line text-sm">
            {movements.map((m) => <li key={m.id} className="flex items-center justify-between py-2"><span><span className={cn('font-semibold', m.delta > 0 ? 'text-success' : 'text-danger')}>{m.delta > 0 ? '+' : ''}{m.delta}</span> <span className="capitalize text-ink-soft">{m.reason}</span>{m.reference && <span className="text-mist"> · {m.reference}</span>}</span><span className="text-[12px] text-mist">{formatDateTime(m.created_at)}{m.by ? ` · ${m.by}` : ''}</span></li>)}
            {!movements.length && <li className="py-4 text-mist">No movements recorded.</li>}
          </ul>
        ) : <Skeleton className="h-32" />}
      </Modal>
    </div>
  );
}
