import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, Tag, Star, MapPin } from 'lucide-react';
import { api } from '@/lib/api';
import { type Address } from '@elare/types';
import { Seo, useAuth, Button, Input, Checkbox, Modal, Confirm, Badge, EmptyState, Skeleton, Stars } from '@elare/ui';
import { money, formatDate, formatDateTime, imageUrl, cn, couponValueLabel } from '@elare/utils';
import { toast } from '@/lib/ui-store';
import { ProductGrid } from '@/features/products/ProductGrid';

/* Loyalty ----------------------------------------------------------------- */
export function Loyalty() {
  const { data, isLoading } = useQuery({ queryKey: ['loyalty'], queryFn: api.loyalty });
  if (isLoading || !data) return <Skeleton className="h-48" />;
  const a = data.account ?? { available: 0, lifetime: 0, redeemed: 0 };
  const s = data.settings;
  const typeLabel: Record<string, string> = { earn: 'Earned', redeem: 'Redeemed', adjust: 'Adjustment', reversal: 'Reversal', expire: 'Expired' };
  return (
    <div className="space-y-6">
      <Seo title="Élaré points" noindex />
      <div className="grid gap-4 sm:grid-cols-3">
        {[['Available', a.available], ['Lifetime earned', a.lifetime], ['Redeemed', a.redeemed]].map(([k, v]) => (
          <div key={k} className={cn('rounded-2xl border p-5', k === 'Available' ? 'border-ink bg-ink text-white' : 'border-line bg-white')}>
            <p className={cn('text-[11px] font-semibold uppercase tracking-[0.16em]', k === 'Available' ? 'text-pink' : 'text-mist')}>{k}</p>
            <p className="mt-2 font-display text-4xl">{Number(v).toLocaleString('en-IN')}</p>
            {k === 'Available' && <p className="mt-1 text-[12.5px] text-white/70">≈ {money(Number(v) * s.point_value_rupees)} in value</p>}
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-line bg-white p-5 text-sm">
        <h3 className="mb-3 flex items-center gap-2 text-xl"><Sparkles size={16} className="text-rose" /> How points work</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          <li>• Earn <b>{Math.round(100 * s.points_per_rupee)} points per ₹100</b>, credited when your order is delivered.</li>
          <li>• Each point is worth <b>{money(s.point_value_rupees, true)}</b> at checkout.</li>
          <li>• Redeem from <b>{s.min_redeem_points} points</b>, up to <b>{s.max_redeem_percent}%</b> of an order.</li>
          <li>• {s.wishlist_redemption_enabled ? <>Claim eligible <Link to="/account/wishlist" className="text-rose underline">wishlist products</Link> entirely with points.</> : 'Wishlist redemption is currently paused.'}</li>
        </ul>
      </div>
      <div className="rounded-2xl border border-line bg-white p-5">
        <h3 className="mb-3 text-xl">Points history</h3>
        {data.transactions.length ? (
          <ul className="divide-y divide-line text-sm">
            {data.transactions.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div><p className="font-medium">{t.description ?? typeLabel[t.type]}</p><p className="text-[12px] text-mist">{formatDateTime(t.created_at)}{t.order_number ? ` · ${t.order_number}` : ''}</p></div>
                <div className="text-right"><p className={cn('font-semibold', t.points > 0 ? 'text-success' : 'text-danger')}>{t.points > 0 ? '+' : ''}{t.points}</p><p className="text-[11px] text-mist">bal. {t.balance_after}</p></div>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-mist">No activity yet. Points appear here once an order is delivered.</p>}
      </div>
    </div>
  );
}

/* Coupons ----------------------------------------------------------------- */
export function Coupons() {
  const { data, isLoading } = useQuery({ queryKey: ['my-coupons'], queryFn: api.myCoupons });
  if (isLoading || !data) return <Skeleton className="h-40" />;
  if (!data.length) return <EmptyState icon={<Tag size={18} />} title="No coupons right now" description="Join the Élaré Circle to hear about the next one first." />;
  return (
    <div>
      <Seo title="Coupons" noindex />
      <ul className="grid gap-3 sm:grid-cols-2">
        {data.map((c) => (
          <li key={c.id} className={cn('relative overflow-hidden rounded-2xl border border-dashed p-5', c.used ? 'border-line opacity-60' : 'border-rose bg-blush/20')}>
            <p className="font-display text-3xl">{couponValueLabel(c)}{c.type !== 'free_shipping' && ' off'}</p>
            <p className="mt-1 text-sm text-ink-soft">{c.description}</p>
            <p className="mt-2 text-[12px] text-mist">{c.min_order_value > 0 && `Min. order ${money(c.min_order_value)}. `}{c.max_discount && `Up to ${money(c.max_discount)}. `}{c.first_order_only && 'First order only. '}{c.expires_at ? `Expires ${formatDate(c.expires_at)}.` : ''}</p>
            <div className="mt-4 flex items-center justify-between">
              <code className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold tracking-[0.12em]">{c.code}</code>
              {c.used ? <Badge tone="neutral">Used</Badge> : <button type="button" onClick={() => { navigator.clipboard?.writeText(c.code); toast({ title: `Copied ${c.code}` }); }} className="text-[12px] font-semibold uppercase tracking-[0.14em] text-rose">Copy code</button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Reviews ----------------------------------------------------------------- */
export function MyReviews() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['my-reviews'], queryFn: api.myReviews });
  const { data: reviewable } = useQuery({ queryKey: ['reviewable'], queryFn: api.reviewable });
  const del = useMutation({ mutationFn: api.deleteReview, onSuccess: () => { qc.invalidateQueries({ queryKey: ['my-reviews'] }); qc.invalidateQueries({ queryKey: ['reviewable'] }); toast({ title: 'Review deleted' }); } });
  if (isLoading || !data) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-8">
      <Seo title="My reviews" noindex />
      {reviewable && reviewable.length > 0 && (
        <section>
          <h3 className="mb-4 text-xl">Waiting for your review</h3>
          <ProductGrid products={reviewable} columns={4} />
        </section>
      )}
      <section>
        <h3 className="mb-4 text-xl">Your reviews</h3>
        {data.length ? (
          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id} className="flex gap-4 rounded-2xl border border-line bg-white p-4">
                <Link to={`/product/${r.product.slug}`} className="h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-nude">{r.product.image && <img src={imageUrl(r.product.image, 120)} alt="" className="h-full w-full object-cover" />}</Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link to={`/product/${r.product.slug}`} className="font-semibold hover:text-rose">{r.product.name}</Link><Stars value={r.rating} size={12} />{r.status !== 'approved' && <Badge tone="neutral">{r.status}</Badge>}</div>
                  {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                  <p className="text-[13.5px] text-ink-soft">{r.body}</p>
                  <div className="mt-2 flex gap-4 text-[12px]"><span className="text-mist">{formatDate(r.created_at)}</span><Link to={`/product/${r.product.slug}#reviews`} className="font-semibold text-rose">Edit</Link><button type="button" onClick={() => del.mutate(r.id)} className="font-semibold text-mist hover:text-danger">Delete</button></div>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState icon={<Star size={18} />} title="No reviews yet" description="Once an order is delivered, you can review each product you received." />}
      </section>
    </div>
  );
}

/* Addresses --------------------------------------------------------------- */
const INDIAN_STATES = ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu & Kashmir', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Chandigarh', 'Puducherry', 'Ladakh'];
const blank = (): Partial<Address> => ({ label: '', full_name: '', phone: '', line1: '', line2: '', city: '', state: '', postal_code: '', country: 'IN', is_default: false });

export function Addresses() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['addresses'], queryFn: api.addresses });
  const [editing, setEditing] = useState<Partial<Address> | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const save = useMutation({ mutationFn: (a: Partial<Address>) => api.saveAddress(a), onSuccess: () => { qc.invalidateQueries({ queryKey: ['addresses'] }); setEditing(null); toast({ title: 'Address saved' }); }, onError: (e) => toast({ title: 'Could not save', description: (e as Error).message, variant: 'error' }) });
  const remove = useMutation({ mutationFn: api.deleteAddress, onSuccess: () => { qc.invalidateQueries({ queryKey: ['addresses'] }); setRemoving(null); } });
  if (isLoading || !data) return <Skeleton className="h-40" />;
  return (
    <div>
      <Seo title="Addresses" noindex />
      <div className="mb-4 flex justify-end"><Button size="sm" onClick={() => setEditing(blank())}>Add address</Button></div>
      {data.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((a) => (
            <li key={a.id} className="rounded-2xl border border-line bg-white p-4 text-sm">
              <div className="flex items-center justify-between"><p className="font-semibold">{a.label || a.full_name}</p>{a.is_default && <Badge tone="blush">Default</Badge>}</div>
              <p className="mt-1">{a.full_name} · {a.phone}</p>
              <p className="text-ink-soft">{a.line1}{a.line2 ? `, ${a.line2}` : ''}</p>
              <p className="text-ink-soft">{a.city}, {a.state} {a.postal_code}</p>
              <div className="mt-3 flex gap-4 text-[12px] font-semibold"><button type="button" onClick={() => setEditing(a)} className="text-rose">Edit</button><button type="button" onClick={() => setRemoving(a.id)} className="text-mist hover:text-danger">Delete</button></div>
            </li>
          ))}
        </ul>
      ) : <EmptyState icon={<MapPin size={18} />} title="No saved addresses" description="Add one to speed through checkout." />}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit address' : 'New address'}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate(editing); }} className="grid gap-4 sm:grid-cols-2">
            <Input label="Label (e.g. Home)" value={editing.label ?? ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} />
            <Input label="Full name" required value={editing.full_name ?? ''} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} />
            <Input label="Mobile" required inputMode="numeric" pattern="[6-9][0-9]{9}" value={editing.phone ?? ''} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
            <Input label="PIN code" required inputMode="numeric" pattern="[0-9]{6}" value={editing.postal_code ?? ''} onChange={(e) => setEditing({ ...editing, postal_code: e.target.value })} />
            <Input label="Address" required value={editing.line1 ?? ''} onChange={(e) => setEditing({ ...editing, line1: e.target.value })} wrapClassName="sm:col-span-2" />
            <Input label="Landmark / area" value={editing.line2 ?? ''} onChange={(e) => setEditing({ ...editing, line2: e.target.value })} wrapClassName="sm:col-span-2" />
            <Input label="City" required value={editing.city ?? ''} onChange={(e) => setEditing({ ...editing, city: e.target.value })} />
            <div className="space-y-1.5"><label className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-ink-soft">State</label><select required value={editing.state ?? ''} onChange={(e) => setEditing({ ...editing, state: e.target.value })} className="h-12 w-full rounded-xl border border-line bg-white px-4 outline-none focus:border-rose"><option value="">Select</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <Checkbox label="Set as default" checked={!!editing.is_default} onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })} className="sm:col-span-2" />
            <div className="flex justify-end gap-2 sm:col-span-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={save.isPending}>Save address</Button></div>
          </form>
        )}
      </Modal>
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && remove.mutate(removing)} title="Delete this address?" confirmLabel="Delete" danger loading={remove.isPending} />
    </div>
  );
}

/* Profile ----------------------------------------------------------------- */
export function Profile() {
  const { user, profile, refreshProfile, changePassword } = useAuth();
  const [sp] = useSearchParams();
  const [form, setForm] = useState({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' });
  const [pwd, setPwd] = useState('');
  const [currentPwd, setCurrentPwd] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm({ full_name: profile?.full_name ?? '', phone: profile?.phone ?? '' }), [profile]);
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await api.updateProfile(form); await refreshProfile(); toast({ title: 'Profile updated' }); }
    catch (err) { toast({ title: 'Could not update', description: (err as Error).message, variant: 'error' }); }
    finally { setBusy(false); }
  };
  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try { await changePassword(currentPwd, pwd); setPwd(''); setCurrentPwd(''); toast({ title: 'Password updated' }); }
    catch (err) { toast({ title: 'Could not update password', description: (err as Error).message, variant: 'error' }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Seo title="Profile" noindex />
      <form onSubmit={saveProfile} className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <h3 className="text-xl">Your details</h3>
        <Input label="Email" value={user?.email ?? ''} disabled hint="Contact support to change your email." />
        <Input label="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
        <Input label="Mobile" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="numeric" />
        <Button type="submit" loading={busy}>Save changes</Button>
      </form>
      <form onSubmit={savePassword} className={cn('space-y-4 rounded-2xl border bg-white p-5', sp.get('reset') ? 'border-rose' : 'border-line')}>
        <h3 className="text-xl">{sp.get('reset') ? 'Set a new password' : 'Password'}</h3>
        <Input label="Current password" type="password" autoComplete="current-password" required value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
        <Input label="New password" type="password" autoComplete="new-password" minLength={8} required value={pwd} onChange={(e) => setPwd(e.target.value)} hint="At least 8 characters." />
        <Button type="submit" variant="outline" loading={busy}>Update password</Button>
      </form>
    </div>
  );
}
