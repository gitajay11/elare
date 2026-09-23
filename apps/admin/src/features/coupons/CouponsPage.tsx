import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { type Coupon } from '@elare/types';
import { money, formatDate, couponValueLabel } from '@elare/utils';
import { toast, Button, Input, Select, Toggle, Checkbox, Badge, Skeleton, Modal, Confirm } from '@elare/ui';
import { AdminHeader, Table } from '@/components/AdminLayout';

const blank = (): Partial<Coupon> => ({ code: '', description: '', type: 'percentage', value: 10, min_order_value: 0, max_discount: null, scope: 'all', product_ids: [], category_ids: [], first_order_only: false, starts_at: new Date().toISOString(), expires_at: null, usage_limit: null, per_user_limit: 1, is_active: true, is_public: true });
const toLocal = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

export default function AdminCoupons() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-coupons'], queryFn: adminApi.coupons });
  const { data: cats } = useQuery({ queryKey: ['admin-categories'], queryFn: adminApi.categories });
  const { data: variantOptions } = useQuery({ queryKey: ['admin-variant-options'], queryFn: adminApi.variantOptions });
  const products = Array.from(new Map(variantOptions?.map((o) => [o.product_id, o.label.split(' · ')[0]])).entries());
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-coupons'] });
  const save = useMutation({ mutationFn: (c: Partial<Coupon>) => adminApi.saveCoupon(c), onSuccess: () => { refresh(); setEditing(null); toast({ title: 'Coupon saved', variant: 'success' }); }, onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' }) });
  const del = useMutation({ mutationFn: adminApi.deleteCoupon, onSuccess: () => { refresh(); setRemoving(null); toast({ title: 'Coupon deleted' }); } });
  const toggle = useMutation({ mutationFn: (c: Coupon) => adminApi.saveCoupon({ id: c.id, code: c.code, is_active: !c.is_active }), onSuccess: refresh });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { times_used, discount_given, revenue, used, ...c } = editing as Coupon;
    void times_used; void discount_given; void revenue; void used;
    save.mutate({ ...c, code: c.code?.trim().toUpperCase(), max_discount: c.max_discount || null, usage_limit: c.usage_limit || null, expires_at: c.expires_at || null, product_ids: c.scope === 'products' ? c.product_ids : [], category_ids: c.scope === 'categories' ? c.category_ids : [] });
  };

  return (
    <div>
      <AdminHeader title="Coupons" description="Codes are validated server-side at quote and again at order placement." action={<Button icon={<Plus size={16} />} onClick={() => setEditing(blank())}>New coupon</Button>} />
      {isLoading || !data ? <Skeleton className="h-64" /> : (
        <Table head={['Code', 'Discount', 'Rules', 'Usage', 'Revenue', 'Discount given', 'Status', '']}>
          {data.map((c) => (
            <tr key={c.id} className="hover:bg-ivory">
              <td className="px-4 py-3"><button type="button" onClick={() => setEditing(c)} className="font-semibold tracking-[0.06em] hover:text-rose">{c.code}</button><span className="block text-[11px] text-mist">{c.description}</span></td>
              <td className="px-4 py-3">{couponValueLabel(c)}{c.max_discount ? <span className="block text-[11px] text-mist">max {money(c.max_discount)}</span> : null}</td>
              <td className="px-4 py-3 text-[12px] text-ink-soft">{c.min_order_value > 0 && <span className="block">Min {money(c.min_order_value)}</span>}{c.scope !== 'all' && <span className="block capitalize">{c.scope} only</span>}{c.first_order_only && <span className="block">First order</span>}{c.expires_at && <span className="block">Until {formatDate(c.expires_at)}</span>}</td>
              <td className="px-4 py-3">{c.times_used ?? 0}{c.usage_limit ? ` / ${c.usage_limit}` : ''}<span className="block text-[11px] text-mist">{c.per_user_limit}× per customer</span></td>
              <td className="px-4 py-3">{money(c.revenue ?? 0)}</td>
              <td className="px-4 py-3">{money(c.discount_given ?? 0)}</td>
              <td className="px-4 py-3"><button type="button" onClick={() => toggle.mutate(c)}>{c.is_active ? <Badge tone="success">Active</Badge> : <Badge>Disabled</Badge>}</button>{c.is_public && <Badge tone="blush" className="ml-1">Public</Badge>}</td>
              <td className="px-4 py-3 text-right"><button type="button" onClick={() => setRemoving(c.id)} className="text-mist hover:text-danger" aria-label="Delete"><Trash2 size={15} /></button></td>
            </tr>
          ))}
          {!data.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-mist">No coupons yet.</td></tr>}
        </Table>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.code}` : 'New coupon'} size="lg">
        {editing && (
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Input label="Code" required value={editing.code ?? ''} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} className="uppercase tracking-[0.08em]" />
            <Input label="Description" value={editing.description ?? ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            <Select label="Type" value={editing.type} onChange={(e) => { const type = e.target.value as Coupon['type']; setEditing({ ...editing, type, value: type === 'free_shipping' ? 0 : type === 'set_total' ? 1 : editing.value || 10, max_discount: type === 'free_shipping' ? null : editing.max_discount }); }}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option><option value="free_shipping">Free delivery</option><option value="set_total">Fixed total (testing)</option></Select>
            {editing.type === 'free_shipping'
              ? <p className="self-end pb-2 text-[12.5px] text-mist">Waives the delivery fee; nothing off the items.</p>
              : <Input label={editing.type === 'percentage' ? 'Percent off' : editing.type === 'set_total' ? 'Customer pays (₹)' : 'Amount off (₹)'} type="number" min={0.01} step="0.01" required value={editing.value ?? ''} onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })} />}
            <Input label="Minimum order (₹)" type="number" min={0} value={editing.min_order_value ?? 0} onChange={(e) => setEditing({ ...editing, min_order_value: Number(e.target.value) })} />
            <Input label="Maximum discount (₹)" type="number" min={0} value={editing.max_discount ?? ''} onChange={(e) => setEditing({ ...editing, max_discount: e.target.value ? Number(e.target.value) : null })} hint="Leave blank for no cap." />
            <Select label="Applies to" value={editing.scope} onChange={(e) => setEditing({ ...editing, scope: e.target.value as Coupon['scope'] })}><option value="all">Whole order</option><option value="categories">Specific categories</option><option value="products">Specific products</option></Select>
            <div className="space-y-1.5">
              <span className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">{editing.scope === 'categories' ? 'Categories' : editing.scope === 'products' ? 'Products' : ' '}</span>
              {editing.scope === 'categories' && <div className="grid grid-cols-2 gap-1">{cats?.categories.map((c) => <Checkbox key={c.id} label={c.name} checked={editing.category_ids?.includes(c.id)} onChange={(e) => setEditing({ ...editing, category_ids: e.target.checked ? [...(editing.category_ids ?? []), c.id] : (editing.category_ids ?? []).filter((x) => x !== c.id) })} />)}</div>}
              {editing.scope === 'products' && <Select multiple searchable aria-label="Products" placeholder="Choose products" value={editing.product_ids ?? []} onChange={(e) => setEditing({ ...editing, product_ids: Array.from(e.target.selectedOptions).map((o) => o.value) })}>{products.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</Select>}
            </div>
            <Input label="Starts" type="datetime-local" value={toLocal(editing.starts_at)} onChange={(e) => setEditing({ ...editing, starts_at: new Date(e.target.value).toISOString() })} />
            <Input label="Expires" type="datetime-local" value={toLocal(editing.expires_at)} onChange={(e) => setEditing({ ...editing, expires_at: e.target.value ? new Date(e.target.value).toISOString() : null })} hint="Blank = never." />
            <Input label="Total usage limit" type="number" min={1} value={editing.usage_limit ?? ''} onChange={(e) => setEditing({ ...editing, usage_limit: e.target.value ? Number(e.target.value) : null })} hint="Blank = unlimited." />
            <Input label="Per-customer limit" type="number" min={1} required value={editing.per_user_limit ?? 1} onChange={(e) => setEditing({ ...editing, per_user_limit: Number(e.target.value) })} />
            <div className="flex flex-wrap gap-6 sm:col-span-2">
              <Toggle label="Active" checked={!!editing.is_active} onChange={(v) => setEditing({ ...editing, is_active: v })} />
              <Toggle label="Show in customer coupon list" checked={!!editing.is_public} onChange={(v) => setEditing({ ...editing, is_public: v })} />
              <Toggle label="First order only" checked={!!editing.first_order_only} onChange={(v) => setEditing({ ...editing, first_order_only: v })} />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={save.isPending}>Save coupon</Button></div>
          </form>
        )}
      </Modal>
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing)} title="Delete this coupon?" description="Usage history for past orders is kept; the code simply stops working. Prefer disabling if you may bring it back." confirmLabel="Delete" danger loading={del.isPending} />
    </div>
  );
}
