import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { adminApi, type AdminCategory, type AdminSubcategory } from '@/lib/api';
import { slugify } from '@/lib/utils';
import { toast } from '@/store/ui';
import { Button } from '@/components/ui/Button';
import { Input, Textarea, Toggle } from '@/components/ui/Field';
import { Badge, Skeleton } from '@/components/ui/Primitives';
import { Modal, Confirm } from '@/components/ui/Overlay';
import { AdminHeader } from './AdminLayout';

type Editing = { kind: 'category'; row: Partial<AdminCategory> } | { kind: 'subcategory'; row: Partial<AdminSubcategory> };

export default function AdminCategories() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin-categories'], queryFn: adminApi.categories });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<{ kind: 'category' | 'subcategory'; id: string; name: string } | null>(null);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); qc.invalidateQueries({ queryKey: ['store-config'] }); };
  const save = useMutation({
    mutationFn: (e: Editing) => (e.kind === 'category' ? adminApi.saveCategory(e.row) : adminApi.saveSubcategory(e.row)),
    onSuccess: () => { refresh(); setEditing(null); toast({ title: 'Saved', variant: 'success' }); },
    onError: (err) => toast({ title: 'Could not save', description: (err as Error).message, variant: 'error' }),
  });
  const del = useMutation({
    mutationFn: (r: { kind: 'category' | 'subcategory'; id: string }) => (r.kind === 'category' ? adminApi.deleteCategory(r.id) : adminApi.deleteSubcategory(r.id)),
    onSuccess: () => { refresh(); setRemoving(null); toast({ title: 'Deleted' }); },
    onError: (err) => { setRemoving(null); toast({ title: 'Could not delete', description: (err as Error).message, variant: 'error' }); },
  });
  const reorder = useMutation({
    mutationFn: async (rows: (AdminCategory | AdminSubcategory)[]) => {
      for (const [i, r] of rows.entries()) {
        if ('category_id' in r) await adminApi.saveSubcategory({ ...r, sort_order: i + 1 });
        else await adminApi.saveCategory({ ...r, sort_order: i + 1 });
      }
    },
    onSuccess: refresh,
  });
  const move = <T extends AdminCategory | AdminSubcategory>(rows: T[], i: number, dir: -1 | 1) => {
    const next = [...rows];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    reorder.mutate(next);
  };

  if (isLoading || !data) return <Skeleton className="h-64" />;
  const cats = [...data.categories].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div>
      <AdminHeader title="Categories" description="Categories drive navigation, filters and SEO. A category with products cannot be deleted." action={<Button icon={<Plus size={16} />} onClick={() => setEditing({ kind: 'category', row: { name: '', slug: '', description: '', image_url: '', sort_order: cats.length + 1, is_active: true } })}>New category</Button>} />
      <div className="space-y-4">
        {cats.map((c, ci) => {
          const subs = data.subcategories.filter((s) => s.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <section key={c.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col"><button type="button" aria-label="Move up" disabled={ci === 0} onClick={() => move(cats, ci, -1)} className="text-mist disabled:opacity-30"><ArrowUp size={14} /></button><button type="button" aria-label="Move down" disabled={ci === cats.length - 1} onClick={() => move(cats, ci, 1)} className="text-mist disabled:opacity-30"><ArrowDown size={14} /></button></div>
                  {c.image_url && <img src={c.image_url} alt="" className="h-12 w-12 rounded-xl object-cover" />}
                  <div><button type="button" onClick={() => setEditing({ kind: 'category', row: c })} className="text-xl font-display hover:text-rose">{c.name}</button><p className="text-[12px] text-mist">/category/{c.slug}{!c.is_active && <Badge className="ml-2">Disabled</Badge>}</p></div>
                </div>
                <div className="flex gap-2"><Button size="sm" variant="soft" icon={<Plus size={14} />} onClick={() => setEditing({ kind: 'subcategory', row: { category_id: c.id, name: '', slug: '', description: '', sort_order: subs.length + 1, is_active: true } })}>Subcategory</Button><button type="button" onClick={() => setRemoving({ kind: 'category', id: c.id, name: c.name })} className="grid h-9 w-9 place-items-center rounded-full text-mist hover:bg-danger/10 hover:text-danger" aria-label="Delete category"><Trash2 size={15} /></button></div>
              </div>
              {subs.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {subs.map((s, si) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1"><button type="button" aria-label="Move up" disabled={si === 0} onClick={() => move(subs, si, -1)} className="text-mist disabled:opacity-30"><ArrowUp size={13} /></button><button type="button" aria-label="Move down" disabled={si === subs.length - 1} onClick={() => move(subs, si, 1)} className="text-mist disabled:opacity-30"><ArrowDown size={13} /></button></div>
                        <button type="button" onClick={() => setEditing({ kind: 'subcategory', row: s })} className="font-medium hover:text-rose">{s.name}</button>
                        <span className="text-[12px] text-mist">/{s.slug}</span>
                        {!s.is_active && <Badge>Disabled</Badge>}
                      </div>
                      <button type="button" onClick={() => setRemoving({ kind: 'subcategory', id: s.id, name: s.name })} className="text-mist hover:text-danger" aria-label="Delete subcategory"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.row.id ? `Edit ${editing.row.name}` : editing?.kind === 'category' ? 'New category' : 'New subcategory'}>
        {editing && (
          <form onSubmit={(e) => { e.preventDefault(); save.mutate({ ...editing, row: { ...editing.row, slug: editing.row.slug || slugify(editing.row.name ?? '') } } as Editing); }} className="space-y-4">
            <Input label="Name" required value={editing.row.name ?? ''} onChange={(e) => setEditing({ ...editing, row: { ...editing.row, name: e.target.value, slug: editing.row.id ? editing.row.slug : slugify(e.target.value) } } as Editing)} />
            <Input label="Slug" required value={editing.row.slug ?? ''} onChange={(e) => setEditing({ ...editing, row: { ...editing.row, slug: slugify(e.target.value) } } as Editing)} />
            <Textarea label="Description" value={editing.row.description ?? ''} onChange={(e) => setEditing({ ...editing, row: { ...editing.row, description: e.target.value } } as Editing)} />
            {editing.kind === 'category' && <Input label="Image URL" value={(editing.row as AdminCategory).image_url ?? ''} onChange={(e) => setEditing({ kind: 'category', row: { ...(editing.row as AdminCategory), image_url: e.target.value } })} />}
            <Toggle label="Enabled" checked={editing.row.is_active ?? true} onChange={(v) => setEditing({ ...editing, row: { ...editing.row, is_active: v } } as Editing)} />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" loading={save.isPending}>Save</Button></div>
          </form>
        )}
      </Modal>
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={() => removing && del.mutate(removing)} title={`Delete “${removing?.name}”?`} description={removing?.kind === 'category' ? 'Only empty categories can be deleted — move or delete its products first.' : 'Products in this subcategory will keep their category but lose the subcategory.'} confirmLabel="Delete" danger loading={del.isPending} />
    </div>
  );
}
