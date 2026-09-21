import { useId, useMemo, useState } from 'react';
import { cn } from '@elare/utils';

/**
 * Minimal, dependency-free charts for the admin dashboard. Single series only:
 * one hue (rose), thin marks, recessive grid, hover tooltip and a table view.
 */

interface Point { label: string; value: number; sub?: string }

const fmt = (n: number, kind: 'money' | 'count') => (kind === 'money' ? '₹' + Math.round(n).toLocaleString('en-IN') : n.toLocaleString('en-IN'));

function niceMax(max: number) {
  if (max <= 0) return 10; // empty series still get a readable 0 / 5 / 10 axis
  const p = Math.pow(10, Math.floor(Math.log10(max)));
  const m = max / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export function ChartCard({ title, subtitle, children, data, kind = 'count' }: { title: string; subtitle?: string; children: React.ReactNode; data: Point[]; kind?: 'money' | 'count' }) {
  const [table, setTable] = useState(false);
  return (
    <section className="rounded-2xl border border-line bg-white p-5" aria-label={title}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h3 className="font-sans text-[15px] font-semibold tracking-normal">{title}</h3>{subtitle && <p className="text-[12.5px] text-mist">{subtitle}</p>}</div>
        <button type="button" onClick={() => setTable((t) => !t)} className="rounded-full border border-line px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-soft hover:border-rose hover:text-rose">{table ? 'Chart' : 'Table'}</button>
      </div>
      {table ? (
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-[13px]"><thead><tr className="text-left text-mist"><th className="py-1 font-medium">Label</th><th className="py-1 text-right font-medium">Value</th></tr></thead>
            <tbody>{data.map((d) => <tr key={d.label} className="border-t border-line"><td className="py-1">{d.label}</td><td className="py-1 text-right tabular-nums">{fmt(d.value, kind)}</td></tr>)}</tbody></table>
        </div>
      ) : children}
    </section>
  );
}

export function LineChart({ data, kind = 'money', height = 200 }: { data: Point[]; kind?: 'money' | 'count'; height?: number }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, padL = 44, padR = 12, padT = 12, padB = 26;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const x = (i: number) => padL + (i / Math.max(1, data.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const path = useMemo(() => data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' '), [data, max]);
  const area = `${path} L${x(data.length - 1).toFixed(1)},${(H - padB).toFixed(1)} L${padL},${(H - padB).toFixed(1)} Z`;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  if (!data.length) return <p className="text-sm text-mist">No data yet.</p>;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Line chart" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; setHover(Math.max(0, Math.min(data.length - 1, Math.round(((px - padL) / (W - padL - padR)) * (data.length - 1))))); }}>
        <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#b85c78" stopOpacity="0.18" /><stop offset="1" stopColor="#b85c78" stopOpacity="0" /></linearGradient></defs>
        {ticks.map((t) => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#efdde3" strokeWidth="1" /><text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" fill="#8a7f84">{fmt(t, kind)}</text></g>)}
        <path d={area} fill={`url(#${id})`} />
        <path d={path} fill="none" stroke="#b85c78" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => (i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="#8a7f84">{d.label}</text>)}
        {hover !== null && (
          <g><line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#8a7f84" strokeWidth="1" strokeDasharray="3 3" /><circle cx={x(hover)} cy={y(data[hover].value)} r="5" fill="#b85c78" stroke="#fff" strokeWidth="2" /></g>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-soft" style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? '-110%' : '10%'})` }}>
          <p className="text-mist">{data[hover].label}</p><p className="font-semibold">{fmt(data[hover].value, kind)}</p>{data[hover].sub && <p className="text-mist">{data[hover].sub}</p>}
        </div>
      )}
    </div>
  );
}

export function BarChart({ data, kind = 'count', horizontal, height = 200 }: { data: Point[]; kind?: 'money' | 'count'; horizontal?: boolean; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  if (!data.length) return <p className="text-sm text-mist">No data yet.</p>;
  if (horizontal) {
    return (
      <ul className="space-y-2.5">
        {data.map((d, i) => (
          <li key={d.label} className="grid grid-cols-[120px_1fr_70px] items-center gap-3 text-[12.5px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="truncate text-ink-soft" title={d.label}>{d.label}</span>
            <span className="h-3 overflow-hidden rounded-r-[4px] bg-nude/60"><span className={cn('block h-full rounded-r-[4px] bg-rose transition-[width] duration-700 ease-[var(--ease-expo)]', hover === i && 'bg-rose-deep')} style={{ width: `${(d.value / max) * 100}%` }} /></span>
            <span className="text-right font-medium tabular-nums">{fmt(d.value, kind)}</span>
          </li>
        ))}
      </ul>
    );
  }
  const W = 600, H = height, padL = 40, padB = 24, padT = 10;
  const slot = (W - padL) / data.length;
  const bw = Math.max(4, Math.min(28, slot * 0.6));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Bar chart" onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={padL} x2={W} y1={padT + (1 - t) * (H - padT - padB)} y2={padT + (1 - t) * (H - padT - padB)} stroke="#efdde3" /><text x={padL - 6} y={padT + (1 - t) * (H - padT - padB) + 4} textAnchor="end" fontSize="10" fill="#8a7f84">{fmt(t * max, kind)}</text></g>)}
        {data.map((d, i) => {
          const h = (d.value / max) * (H - padT - padB);
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={padL + slot * i} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              <rect x={cx - bw / 2} y={H - padB - h} width={bw} height={h} rx="4" fill={hover === i ? '#8f3f5a' : '#b85c78'} />
              {(data.length <= 12 || i % Math.ceil(data.length / 8) === 0) && <text x={cx} y={H - 7} textAnchor="middle" fontSize="10" fill="#8a7f84">{d.label}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-white px-3 py-2 text-[12px] shadow-soft" style={{ left: `${((padL + slot * hover + slot / 2) / W) * 100}%`, transform: `translateX(${hover > data.length / 2 ? '-110%' : '10%'})` }}>
          <p className="text-mist">{data[hover].label}</p><p className="font-semibold">{fmt(data[hover].value, kind)}</p>
        </div>
      )}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'plain' }: { label: string; value: string; hint?: string; tone?: 'plain' | 'rose' | 'warn' }) {
  return (
    <div className={cn('rounded-2xl border p-4', tone === 'rose' ? 'border-ink bg-ink text-white' : tone === 'warn' ? 'border-champagne-deep/50 bg-champagne/30' : 'border-line bg-white')}>
      <p className={cn('text-[11px] font-semibold uppercase tracking-[0.14em]', tone === 'rose' ? 'text-pink' : 'text-mist')}>{label}</p>
      <p className="mt-1.5 font-display text-3xl leading-none">{value}</p>
      {hint && <p className={cn('mt-1 text-[12px]', tone === 'rose' ? 'text-white/70' : 'text-mist')}>{hint}</p>}
    </div>
  );
}
