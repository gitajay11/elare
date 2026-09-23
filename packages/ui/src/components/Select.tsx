import {
  Children, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@elare/utils';
import { FieldWrap } from './Field';
import { useLockScroll } from './Overlay';

/**
 * Themed dropdown that replaces the native <select> everywhere.
 *
 * Drop-in: it accepts <option> children and calls `onChange` with a
 * select-like event (`e.target.value`, `e.target.selectedOptions`), so
 * existing call sites keep working. Or pass `options` directly.
 *
 * - Popover on desktop (flips upward near the bottom of the screen),
 *   bottom sheet on phones (big tap targets, page frozen behind it).
 * - Search box when the list is long; type-ahead otherwise.
 * - Full keyboard support and listbox ARIA.
 * - `<option data-swatch="#hex">` shows a colour dot (shades).
 * - `multiple` for multi-select (checkbox rows, Done/Clear).
 * - Uses the design tokens, so the admin's dark mode applies automatically.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** Hex colour shown as a dot before the label. */
  swatch?: string;
}

export interface SelectChangeEvent {
  target: { value: string; name?: string; selectedOptions: { value: string }[] };
}

export interface SelectProps {
  value?: string | number | readonly string[] | null;
  onChange?: (e: SelectChangeEvent) => void;
  options?: SelectOption[];
  /** <option> elements (value, children, disabled, data-swatch). */
  children?: ReactNode;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  placeholder?: string;
  id?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  multiple?: boolean;
  /** 'field' for forms, 'pill' for toolbar filters. */
  variant?: 'field' | 'pill';
  size?: 'sm' | 'md';
  /** Force the search box on or off (default: on for lists longer than 8). */
  searchable?: boolean;
  /** Applied to the outermost element (use for grid placement / width). */
  className?: string;
  'aria-label'?: string;
}

const textOf = (node: ReactNode): string =>
  Children.toArray(node).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : '')).join('');

function optionsFrom(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  const walk = (nodes: ReactNode) => Children.forEach(nodes, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<Record<string, unknown> & { children?: ReactNode }>;
    if (el.type === 'option') {
      const label = textOf(el.props.children);
      out.push({ value: el.props.value !== undefined ? String(el.props.value) : label, label, disabled: Boolean(el.props.disabled), swatch: el.props['data-swatch'] as string | undefined });
    } else if (el.props.children) {
      walk(el.props.children); // fragments / optgroups
    }
  });
  walk(children);
  return out;
}

const PHONE = '(max-width: 639px)';
const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches;

function Swatch({ hex }: { hex: string }) {
  return <span className="h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10 ring-inset" style={{ background: hex }} aria-hidden="true" />;
}

export function Select({
  value, onChange, options: optionsProp, children, label, hint, error, placeholder, id: idProp, name, required, disabled,
  multiple, variant = 'field', size = 'md', searchable, className, 'aria-label': ariaLabel,
}: SelectProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const listId = `${id}-list`;
  const options = useMemo(() => optionsProp ?? optionsFrom(children), [optionsProp, children]);
  const selected = useMemo(() => new Set(Array.isArray(value) ? value.map(String) : value === undefined || value === null ? [] : [String(value)]), [value]);
  const single = multiple ? '' : [...selected][0] ?? '';
  const current = options.find((o) => o.value === single);

  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef({ buf: '', at: 0 });
  const reduce = useReducedMotion();
  useLockScroll(open && sheet);

  const showSearch = searchable ?? options.length > 8;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const emit = useCallback((values: string[]) => {
    onChange?.({ target: { value: values[0] ?? '', name, selectedOptions: values.map((v) => ({ value: v })) } });
  }, [onChange, name]);

  const place = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const gap = 8;
    const below = window.innerHeight - r.bottom - gap - 12;
    const above = r.top - gap - 12;
    const up = below < 240 && above > below;
    const maxHeight = Math.max(160, Math.min(360, up ? above : below));
    const width = Math.max(r.width, variant === 'pill' ? 220 : 200);
    const left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12);
    setPos({ top: up ? r.top - gap : r.bottom + gap, left, width, maxHeight, up });
  }, [variant]);

  const openList = useCallback(() => {
    if (disabled) return;
    const phone = isPhone();
    setSheet(phone);
    setQuery('');
    const idx = options.findIndex((o) => selected.has(o.value));
    setActive(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
    if (!phone) place();
    setOpen(true);
  }, [disabled, options, selected, place]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => triggerRef.current?.focus({ preventScroll: true }));
  }, []);

  const choose = useCallback((o: SelectOption) => {
    if (o.disabled) return;
    if (multiple) {
      const next = new Set(selected);
      if (next.has(o.value)) next.delete(o.value); else next.add(o.value);
      emit(options.filter((x) => next.has(x.value)).map((x) => x.value));
      return;
    }
    if (o.value !== single) emit([o.value]);
    close();
  }, [multiple, selected, options, single, emit, close]);

  // Keep the popover glued to the trigger while the page or a container scrolls.
  useLayoutEffect(() => {
    if (!open || sheet) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => { window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open, sheet, place]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, close]);

  // Focus the search box (or the list) when opening.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => (showSearch && !sheet ? searchRef.current : listRef.current)?.focus({ preventScroll: true }), 30);
    return () => clearTimeout(t);
  }, [open, showSearch, sheet]);

  // Keep the active row in view.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const move = (dir: 1 | -1, from = active) => {
    if (!visible.length) return;
    let i = from;
    for (let n = 0; n < visible.length; n++) {
      i = (i + dir + visible.length) % visible.length;
      if (!visible[i].disabled) return setActive(i);
    }
  };

  const onListKey = (e: ReactKeyboardEvent) => {
    if (!open) return;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': e.preventDefault(); move(1, -1); break;
      case 'End': e.preventDefault(); move(-1, visible.length); break;
      case 'Enter': e.preventDefault(); if (visible[active]) choose(visible[active]); break;
      case ' ':
        if (e.target === searchRef.current) break;
        e.preventDefault(); if (visible[active]) choose(visible[active]); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(false); break;
      default:
        if (e.target !== searchRef.current && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          const now = Date.now();
          const t = typeahead.current;
          t.buf = now - t.at > 600 ? e.key.toLowerCase() : t.buf + e.key.toLowerCase();
          t.at = now;
          const i = visible.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(t.buf));
          if (i >= 0) setActive(i);
        }
    }
  };

  const onTriggerKey = (e: ReactKeyboardEvent) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
  };

  // What the closed control shows.
  const chosen = options.filter((o) => selected.has(o.value));
  let display: ReactNode;
  let muted = false;
  if (multiple) {
    if (!chosen.length) { display = placeholder ?? 'Select…'; muted = true; }
    else display = (
      <span className="flex min-w-0 items-center gap-1.5">
        {chosen.slice(0, 2).map((o) => <span key={o.value} className="truncate rounded-full bg-blush px-2 py-0.5 text-[12px] font-semibold text-rose-deep">{o.label}</span>)}
        {chosen.length > 2 && <span className="shrink-0 text-[12px] font-semibold text-mist">+{chosen.length - 2}</span>}
      </span>
    );
  } else if (current) {
    display = <span className="flex min-w-0 items-center gap-2">{current.swatch && <Swatch hex={current.swatch} />}<span className="truncate">{current.label}</span></span>;
    muted = current.value === '';
  } else {
    display = placeholder ?? 'Select…';
    muted = true;
  }

  const pill = variant === 'pill';
  const trigger = (
    <button
      ref={triggerRef}
      id={id}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-invalid={error ? true : undefined}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => (open ? close() : openList())}
      onKeyDown={onTriggerKey}
      className={cn(
        'group flex w-full items-center gap-2 border bg-white text-left text-ink transition-[border-color,box-shadow,background-color] duration-200',
        'hover:border-rose/60 focus-visible:border-rose focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pink/25',
        pill ? 'rounded-full font-medium' : 'rounded-xl',
        pill ? (size === 'sm' ? 'h-9 px-4 text-[13px]' : 'h-10 px-4 text-sm') : size === 'sm' ? 'h-10 px-3 text-sm' : 'h-12 px-4 text-[15px]',
        open ? 'border-rose ring-4 ring-pink/25' : error ? 'border-danger' : 'border-line',
        disabled && 'cursor-not-allowed bg-nude/40 opacity-60 hover:border-line',
      )}
    >
      <span className={cn('min-w-0 flex-1 truncate', muted && 'text-mist')}>{display}</span>
      <ChevronDown size={size === 'sm' || pill ? 15 : 17} className={cn('shrink-0 transition-transform duration-300', open ? 'rotate-180 text-rose' : 'text-mist group-hover:text-ink-soft')} aria-hidden="true" />
    </button>
  );

  const rows = (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      tabIndex={-1}
      aria-multiselectable={multiple || undefined}
      aria-labelledby={id}
      aria-activedescendant={active >= 0 && visible[active] ? `${id}-opt-${active}` : undefined}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain outline-none [scrollbar-color:var(--color-blush-deep)_transparent] [scrollbar-width:thin]"
    >
      {visible.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-mist">No matches for “{query}”</p>}
      {visible.map((o, i) => {
        const isSel = selected.has(o.value);
        const isActive = i === active;
        return (
          <div
            key={o.value + i}
            id={`${id}-opt-${i}`}
            data-index={i}
            role="option"
            aria-selected={isSel}
            aria-disabled={o.disabled || undefined}
            onPointerMove={() => !o.disabled && active !== i && setActive(i)}
            onClick={() => choose(o)}
            className={cn(
              'relative flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 transition-colors duration-150',
              sheet ? 'min-h-12 py-3 text-[15px]' : 'min-h-10 py-2 text-[14px]',
              isActive && !o.disabled && 'bg-blush/60',
              isSel ? 'font-semibold text-rose-deep' : 'text-ink',
              o.disabled && 'cursor-not-allowed opacity-40',
            )}
          >
            {multiple && (
              <span className={cn('grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md border transition-colors', isSel ? 'border-rose bg-rose text-white' : 'border-line bg-white')}>
                {isSel && <Check size={12} strokeWidth={3} />}
              </span>
            )}
            {o.swatch && <Swatch hex={o.swatch} />}
            <span className={cn('min-w-0 flex-1', sheet ? 'break-words' : 'truncate', o.value === '' && !isSel && 'text-mist')}>{o.label}</span>
            {!multiple && (
              <AnimatePresence initial={false}>
                {isSel && (
                  <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className="text-rose">
                    <Check size={16} strokeWidth={2.5} />
                  </motion.span>
                )}
              </AnimatePresence>
            )}
          </div>
        );
      })}
    </div>
  );

  const search = showSearch && (
    <div className="relative mb-1.5 shrink-0">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist" aria-hidden="true" />
      <input
        ref={searchRef}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
        placeholder="Search…"
        aria-label="Search options"
        aria-controls={listId}
        className="h-10 w-full rounded-xl border border-line bg-ivory pl-9 pr-3 text-[14px] text-ink placeholder:text-mist focus:border-rose focus:outline-none"
      />
    </div>
  );

  const footer = multiple && (
    <div className="mt-1.5 flex shrink-0 items-center justify-between gap-2 border-t border-line px-1 pt-2">
      <span className="text-[12px] text-mist">{chosen.length ? `${chosen.length} selected` : 'None selected'}</span>
      <span className="flex gap-1.5">
        {chosen.length > 0 && <button type="button" onClick={() => emit([])} className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-ink-soft hover:bg-blush/60">Clear</button>}
        <button type="button" onClick={() => close()} className="rounded-full bg-ink px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-rose-deep">Done</button>
      </span>
    </div>
  );

  const heading = typeof label === 'string' ? label : ariaLabel ?? placeholder ?? 'Choose an option';

  const overlay = createPortal(
    <AnimatePresence>
      {open && sheet && (
        <div key="sheet" className="fixed inset-0 z-[120]" onKeyDown={onListKey}>
          <motion.div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => close()} />
          <motion.div
            ref={popRef}
            role="dialog"
            aria-modal="true"
            aria-label={heading}
            initial={reduce ? { opacity: 0 } : { y: '100%' }}
            animate={reduce ? { opacity: 1 } : { y: 0, transition: { type: 'spring', stiffness: 420, damping: 40 } }}
            exit={reduce ? { opacity: 0 } : { y: '100%', transition: { duration: 0.22 } }}
            drag={reduce ? false : 'y'}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) close(); }}
            className="absolute inset-x-0 bottom-0 flex max-h-[80dvh] flex-col rounded-t-[28px] border-t border-line bg-white px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-float"
          >
            <span className="mx-auto mb-2 h-1.5 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
            <p className="mb-2 shrink-0 px-2 font-display text-xl text-ink">{heading}</p>
            {search}
            {rows}
            {footer}
          </motion.div>
        </div>
      )}
      {open && !sheet && pos && (
        <motion.div
          key="pop"
          ref={popRef}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: pos.up ? 6 : -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
          style={{ position: 'fixed', left: pos.left, width: pos.width, maxHeight: pos.maxHeight, top: pos.up ? undefined : pos.top, bottom: pos.up ? window.innerHeight - pos.top : undefined, transformOrigin: pos.up ? 'bottom center' : 'top center' }}
          className="z-[120] flex flex-col rounded-2xl border border-line bg-white p-1.5 shadow-float"
          onKeyDown={onListKey}
        >
          {search}
          {rows}
          {footer}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );

  const control = (
    <div className={cn('relative', pill ? 'inline-block min-w-[9rem]' : 'w-full', !(label || hint || error) && className)}>
      {trigger}
      {/* Lets `required` / `name` take part in native form validation and submission. */}
      {(required || name) && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          value={multiple ? [...selected].join(',') : single}
          onChange={() => undefined}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px w-full opacity-0"
        />
      )}
      {overlay}
    </div>
  );

  if (!(label || hint || error)) return control;
  return <FieldWrap label={label} hint={hint} error={error} id={id} className={className}>{control}</FieldWrap>;
}
