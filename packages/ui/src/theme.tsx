import { useCallback, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@elare/utils';

export type ThemePreference = 'light' | 'dark' | 'system';
const KEY = 'elare-theme';
const EVENT = 'elare-theme-change';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

/** Resolves the preference and writes data-theme + the PWA theme-color meta. */
export function applyTheme(pref: ThemePreference): 'light' | 'dark' {
  const resolved: 'light' | 'dark' = pref === 'system' ? (media().matches ? 'dark' : 'light') : pref;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--color-ivory').trim() || meta.content;
  return resolved;
}

/**
 * Light / dark / follow-system, remembered per browser. The matching inline
 * script in index.html applies the saved value before React loads so there is
 * no flash of the wrong theme.
 */
export function useTheme() {
  const [preference, setPref] = useState<ThemePreference>(readThemePreference);
  const [resolved, setResolved] = useState<'light' | 'dark'>(() => (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'));

  useEffect(() => {
    setResolved(applyTheme(preference));
    if (preference !== 'system') return;
    const mq = media();
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  // Keep every mounted toggle in step (sidebar + header render their own).
  useEffect(() => {
    const onSync = (e: Event) => setPref((e as CustomEvent<ThemePreference>).detail);
    window.addEventListener(EVENT, onSync);
    return () => window.removeEventListener(EVENT, onSync);
  }, []);

  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    try { localStorage.setItem(KEY, p); } catch { /* private mode */ }
    window.dispatchEvent(new CustomEvent<ThemePreference>(EVENT, { detail: p }));
  }, []);

  return { preference, resolved, setPreference };
}

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Auto', icon: Monitor },
];

/** Segmented Light / Dark / Auto control. */
export function ThemeToggle({ className }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className={cn('inline-grid grid-cols-3 rounded-full border border-line bg-nude/60 p-0.5', className)}>
      {OPTIONS.map((o) => {
        const active = preference === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.label}
            onClick={() => setPreference(o.value)}
            className={cn('inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition-colors', active ? 'bg-white text-ink shadow-card' : 'text-mist hover:text-ink')}
          >
            <o.icon size={13} /> <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Single icon button that cycles light → dark → auto (for compact headers). */
export function ThemeCycleButton({ className }: { className?: string }) {
  const { preference, resolved, setPreference } = useTheme();
  const next: ThemePreference = preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light';
  const Icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <button type="button" aria-label={`Appearance: ${preference}. Switch to ${next}`} title={`Theme: ${preference}`} onClick={() => setPreference(next)} className={cn('grid h-10 w-10 place-items-center rounded-full text-ink transition-colors hover:bg-blush/70', className)}>
      <Icon size={19} />
    </button>
  );
}
