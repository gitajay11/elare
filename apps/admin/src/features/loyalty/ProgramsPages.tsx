import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { adminApi, type GiftRule } from '@/lib/api';
import { formatDate, money } from '@elare/utils';
import { toast, Button, Input, Select, Toggle, Badge, Skeleton, Modal, Confirm } from '@elare/ui';
import { StatCard } from '@/components/Chart';
import { AdminHeader, Table } from '@/components/AdminLayout';

/* Loyalty programme settings ------------------------------------------------- */
export function AdminLoyalty() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: adminApi.settings });
  const { data: dash } = useQuery({ queryKey: ['admin-dashboard'], queryFn: adminApi.dashboard });
  const [form, setForm] = useState<Record<string, number | boolean>>({});
  useEffect(() => { if (settings?.loyalty) setForm(settings.loyalty as Record<string, number | boolean>); }, [settings]);
  const save = useMutation({ mutationFn: () => adminApi.updateSetting('loyalty', form), onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-settings'] }); qc.invalidateQueries({ queryKey: ['store-config'] }); toast({ title: 'Loyalty rules saved', variant: 'success' }); }, onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' }) });
  if (isLoading || !settings) return <Skeleton className="h-64" />;
  const num = (k: string) => Number(form[k] ?? 0);
  const setNum = (k: string, v: string) => setForm({ ...form, [k]: Number(v) });
  return (
    <div>
      <AdminHeader title="Loyalty programme" description="Points are computed and validated in the database using these rules. Per-product point overrides live in the product editor." action={<Button loading={save.isPending} onClick={() => save.mutate()}>Save rules</Button>} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="rose" label="Points issued" value={Number(dash?.totals.points_issued ?? 0).toLocaleString('en-IN')} />
        <StatCard label="Points redeemed" value={Number(dash?.totals.points_redeemed ?? 0).toLocaleString('en-IN')} />
        <StatCard label="Liability" value={money(Number(dash?.totals.points_issued ?? 0) - Number(dash?.totals.points_redeemed ?? 0) > 0 ? (Number(dash?.totals.points_issued ?? 0) - Number(dash?.totals.points_redeemed ?? 0)) * num('point_value_rupees') : 0)} hint="Outstanding points × point value (approx.)" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="text-xl">Earning</h3>
          <Input label="Points per ₹1 spent" type="number" step="0.01" min={0} value={num('points_per_rupee')} onChange={(e) => setNum('points_per_rupee', e.target.value)} hint={`${Math.round(num('points_per_rupee') * 100)} points per ₹100. Products can override this with a fixed value.`} />
          <p className="text-[12.5px] text-mist">Points are credited when an order is marked delivered, and reversed if it is refunded.</p>
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
          <h3 className="text-xl">Redemption at checkout</h3>
          <Toggle label="Allow points at checkout" checked={!!form.redemption_enabled} onChange={(v) => setForm({ ...form, redemption_enabled: v })} />
          <Input label="Value of one point (₹)" type="number" step="0.01" min={0} value={num('point_value_rupees')} onChange={(e) => setNum('point_value_rupees', e.target.value)} />
          <Input label="Minimum points to redeem" type="number" min={0} value={num('min_redeem_points')} onChange={(e) => setNum('min_redeem_points', e.target.value)} />
          <Input label="Maximum share of an order (%)" type="number" min={0} max={100} value={num('max_redeem_percent')} onChange={(e) => setNum('max_redeem_percent', e.target.value)} />
        </section>
        <section className="space-y-4 rounded-2xl border border-line bg-white p-5 lg:col-span-2">
          <h3 className="text-xl">Wishlist redemption</h3>
          <Toggle label="Allow customers to claim wishlist products with points" checked={!!form.wishlist_redemption_enabled} onChange={(v) => setForm({ ...form, wishlist_redemption_enabled: v })} />
          <Input label="Maximum product price eligible (₹)" type="number" min={0} value={num('wishlist_redeem_max_price')} onChange={(e) => setNum('wishlist_redeem_max_price', e.target.value)} hint="Products above this price cannot be redeemed. Individual products can be excluded with the attribute points_redeemable: false." />
        </section>
      </div>
    </div>
  );
}

/* Free-gift rules ---------------------------------------------------------- */
const blankRule = (): Partial<GiftRule> => ({ name: '', min_quantity: 6, gift_variant_id: '', gift_quantity: 1, starts_at: new Date().toISOString(), ends_at: null, is_active: true });

export function AdminGifts() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-gifts'], queryFn: adminApi.giftRules });
  const { data: variants } = useQuery({ queryKey: ['admin-variant-options'], queryFn: adminApi.variantOptions });
  const [editing, setEditing] = useState<Partial<GiftRule> | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-gifts'] }); qc.invalidateQueries({ queryKey: ['store-config'] }); };
  const save = useMutation({ mutationFn: (g: Partial<GiftRule>) => adminApi.saveGiftRule(g), onSuccess: () => { refresh(); setEditing(null); toast({ title: 'Gift rule saved', variant: 'success' }); }, onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' }) });
  const del = useMutation({ mutationFn: adminApi.deleteGiftRule, onSuccess: () => { refresh(); setRemoving(null); }, onError: (e) => toast({ title: 'Could not delete', description: (e as Error).message, variant: 'error' }) });
  return (
    <div>
      <AdminHeader title="Free gifts" description="When a bag holds at least the qualifying quantity of paid products, the gift is added automatically — once per order, and only while the gift is in stock." action={<Button icon={<Plus size={16} />} onClick={() => setEditing(blankRule())}>New rule</Button>} />
      {isLoading || !data ? <Skeleton className="h-48" /> : (
        <Table head={['Rule', 'Threshold', 'Gift', 'Gift stock', 'Issued', 'Window', 'Status', '']}>
          {data.map((g) => (
            <tr key={g.id} className="hover:bg-ivory">
              <td className="px-4 py-3"><button type="button" onClick={() => setEditing(g)} className="font-semibold hover:text-rose">{g.name}</button></td>
              <td className="px-4 py-3">{g.min_quantity}+ products</td>
              <td className="px-4 py-3">{g.gift_quantity} × {g.product_name}<span className="block text-[11px] text-mist">{g.variant_name}</span></td>
              <td className={`px-4 py-3 font-medium ${Number(g.stock) < 10 ? 'text-rose' : ''}`}>{g.stock}</td>
              <td className="px-4 py-3">{g.issued}</td>
              <td className="px-4 py-3 text-[12px] text-ink-soft">{formatDate(g.starts_at)} → {g.ends_at ? formatDate(g.ends_at) : 'open'}</td>
              <td className="px-4 py-3">{g.is_active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
              <td className="px-4 py-3 text-right"><button type="button" onClick={() => setRemoving(g.id)} className="text-mist hover:text-danger" aria-label="Delete"><Trash2 size={15} /></button></td>
            </tr>
          ))}
          {!data.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-mist">No gift rules configured.</td></tr>}
        </Table>
      )}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit gift rule' : 'New gift rule'}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate({ ...editing, ends_at: editing.ends_at || null }); }} className="grid gap-4 sm:grid-cols-2">
            <Input label="Rule name" required value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} wrapClassName="sm:col-span-2" />
            <Input label="Minimum qualifying products" type="number" min={1} required value={editing.min_quantity ?? 6} onChange={(e) => setEditing({ ...editing, min_quantity: Number(e.target.value) })} />
            <Input label="Gift quantity" type="number" min={1} required value={editing.gift_quantity ?? 1} onChange={(e) => setEditing({ ...editing, gift_quantity: Number(e.target.value) })} />
            <Select label="Gift product / variant" required value={editing.gift_variant_id ?? ''} onChange={(e) => setEditing({ ...editing, gift_variant_id: e.target.value })} className="sm:col-span-2"><option value="">Choose</option>{variants?.map((v) => <option key={v.variant_id} value={v.variant_id}>{v.label}</option>)}</Select>
            <Input label="Starts" type="datetime-local" value={editing.starts_at ? new Date(editing.starts_at).toISOString().slice(0, 16) : ''} onChange={(e) => setEditing({ ...editing, starts_at: new Date(e.target.value).toISOString() })} />
            <Input label="Ends" type="datetime-local" value={editing.ends_at ? new Date(editing.ends_at).toISOString().slice(0, 16) : ''} onChange={(e) => setEditing({ ...editing, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} hint="Blank = no end date." />
            <Toggle label="Active" checked={!!editing.is_active} onChange={(v) => setEditing({ ...editing, is_active: v })} />
            <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={save.isPending}>Save rule</Button></div>
          </form>
        )}
      </Modal>
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing)} title="Delete this gift rule?" confirmLabel="Delete" danger loading={del.isPending} />
    </div>
  );
}
