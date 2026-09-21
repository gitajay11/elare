import { useEffect, useMemo, useState } from 'react';
import { type ProductDetail, type Shade, type Variant } from '@elare/types';
import { cn } from '@elare/utils';
import { Swatch } from '@elare/ui';

const OPTION_LABELS: Record<string, string> = { finish: 'Finish', coverage: 'Coverage', waterproof: 'Formula', pack: 'Pack', size: 'Size' };
const optionLabel = (key: string, value: unknown) => (key === 'waterproof' ? (value === true || value === 'true' ? 'Waterproof' : 'Non-waterproof') : String(value));

/** Shared selection logic for the product page and the quick-view modal. */
export function useVariantSelection(detail: ProductDetail | null | undefined, initialShadeId?: string | null) {
  const variants = detail?.variants ?? [];
  const shades = detail?.shades ?? [];
  const optionKeys = useMemo(() => Array.from(new Set(variants.flatMap((v) => Object.keys(v.options ?? {})))), [variants]);

  const [shadeId, setShadeId] = useState<string | null>(null);
  const [options, setOptions] = useState<Record<string, string>>({});

  // Initialise once the detail arrives: first in-stock shade + first in-stock option combo.
  useEffect(() => {
    if (!detail) return;
    const firstAvailable = variants.find((v) => v.in_stock) ?? variants[0];
    const preferred = initialShadeId && variants.some((v) => v.shade_id === initialShadeId && v.in_stock) ? initialShadeId : firstAvailable?.shade_id ?? null;
    setShadeId(shades.length ? preferred : null);
    const base = variants.find((v) => (shades.length ? v.shade_id === preferred : true) && v.in_stock) ?? firstAvailable;
    setOptions(Object.fromEntries(optionKeys.map((k) => [k, String(base?.options?.[k] ?? '')])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.product.id]);

  const matches = (v: Variant, opts: Record<string, string>, sid: string | null) =>
    (shades.length ? v.shade_id === sid : true) && optionKeys.every((k) => !opts[k] || String(v.options?.[k] ?? '') === opts[k]);

  const variant = useMemo(() => variants.find((v) => matches(v, options, shadeId)) ?? null, [variants, options, shadeId, optionKeys.join(), shades.length]);
  const shade = useMemo(() => shades.find((s) => s.id === shadeId) ?? null, [shades, shadeId]);

  const optionValues = (key: string) =>
    Array.from(new Set(variants.filter((v) => (shades.length ? v.shade_id === shadeId : true)).map((v) => String(v.options?.[key] ?? '')))).filter(Boolean).map((value) => ({
      value,
      label: optionLabel(key, value),
      inStock: variants.some((v) => matches(v, { ...options, [key]: value }, shadeId) && v.in_stock),
    }));

  const shadeInStock = (s: Shade) => variants.some((v) => v.shade_id === s.id && v.in_stock);

  return { shadeId, setShadeId, shade, options, setOption: (k: string, v: string) => setOptions((o) => ({ ...o, [k]: v })), optionKeys, optionValues, variant, shadeInStock, hasShades: shades.length > 0 };
}

export function ShadeSelector({ shades, value, onChange, inStock, size = 34, className }: { shades: Shade[]; value: string | null; onChange: (id: string) => void; inStock: (s: Shade) => boolean; size?: number; className?: string }) {
  const current = shades.find((s) => s.id === value);
  if (!shades.length) return null;
  return (
    <div className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Shade</span>
        {current && (
          <span className="text-sm text-ink">
            {current.name}
            {current.undertone && <span className="text-mist"> · {current.undertone} undertone</span>}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Shade">
        {shades.map((s) => (
          <Swatch key={s.id} hex={s.hex} name={s.name} size={size} selected={s.id === value} disabled={!inStock(s)} onClick={() => onChange(s.id)} />
        ))}
      </div>
      {current?.description && <p className="mt-2 text-[13px] text-ink-soft">{current.description}</p>}
    </div>
  );
}

export function OptionSelector({ label, values, value, onChange, className }: { label: string; values: { value: string; label: string; inStock: boolean }[]; value: string; onChange: (v: string) => void; className?: string }) {
  if (values.length < 2) return null;
  return (
    <div className={className}>
      <span className="mb-3 block text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{OPTION_LABELS[label] ?? label}</span>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={OPTION_LABELS[label] ?? label}>
        {values.map((v) => (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={value === v.value}
            onClick={() => onChange(v.value)}
            className={cn('h-10 rounded-full border px-4 text-sm transition-colors', value === v.value ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink hover:border-ink', !v.inStock && 'text-mist line-through')}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}
