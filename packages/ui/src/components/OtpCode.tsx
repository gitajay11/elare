import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion, type TargetAndTransition } from 'framer-motion';
import { cn } from '@elare/utils';

/**
 * Four boxes. One ring. One verified result.
 *
 * A one-time-code input drawn as separate tiles over a single controlled
 * value. `visual` drives the choreography — it never decides the outcome:
 *
 *   entry      the tiles, typing and focus states
 *   verifying  the tiles draw together, orbit a soft ring and settle into one
 *              tile that waits for the server
 *   success    that tile turns green and draws a check (set only after the
 *              server has confirmed the code)
 *
 * Bump `errorKey` to play the gentle "doesn't match" shake.
 * Reduced motion swaps the orbit for a plain fade.
 */
export type OtpVisual = 'entry' | 'verifying' | 'success';

export interface OtpCodeProps {
  /** The whole code as one string; a space marks an empty box. */
  value: string;
  onChange: (value: string) => void;
  /** Called when every box holds a digit. */
  onComplete?: (code: string) => void;
  length?: number;
  visual?: OtpVisual;
  errorKey?: number;
  disabled?: boolean;
  autoFocus?: boolean;
  /** id of the element that announces the current status/error. */
  describedBy?: string;
  label?: string;
  className?: string;
}

const INK = '#2B2225';
const ROSE = '#E8A7B8';
const DEEP_ROSE = '#B85C78';
const CHAMPAGNE = '#E8D3B0';
const SUCCESS = '#5F9F72';
const ERROR = '#C85C6B';
const EASE = [0.22, 1, 0.36, 1] as const;

export function OtpCode({
  value, onChange, onComplete, length = 4, visual = 'entry', errorKey = 0, disabled, autoFocus, describedBy, label = 'Verification code', className,
}: OtpCodeProps) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const shake = useAnimationControls();
  const [focused, setFocused] = useState(-1);
  const [erroring, setErroring] = useState(false);
  const [geo, setGeo] = useState<{ offsets: number[]; radius: number; box: number }>({ offsets: [], radius: 30, box: 56 });

  const toSlots = (v: string) => Array.from({ length }, (_, i) => (/\d/.test(v[i] ?? '') ? v[i]! : ''));
  const slots = toSlots(value);
  // Keystrokes can arrive faster than a re-render (fast typing, macros,
  // password managers): handlers build on the latest value, not the rendered one.
  const latest = useRef(value);
  latest.current = value;
  const current = () => toSlots(latest.current);
  const collapsed = visual !== 'entry';
  const locked = disabled || collapsed;

  const focusAt = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const commit = (next: string[], focusIndex?: number) => {
    latest.current = next.map((c) => c || ' ').join('').replace(/\s+$/, '');
    onChange(latest.current);
    if (focusIndex !== undefined) focusAt(focusIndex);
    if (next.every(Boolean)) onComplete?.(next.join(''));
  };

  const fill = (start: number, digits: string) => {
    const next = current();
    let j = start;
    for (const d of digits) { if (j >= length) break; next[j++] = d; }
    commit(next, Math.min(j, length - 1));
  };

  // Focus the first empty box on mount and whenever the code is cleared.
  useEffect(() => {
    if (!autoFocus || locked) return;
    const first = slots.findIndex((s) => !s);
    if (first === 0 || (first > 0 && document.activeElement === document.body)) {
      const t = setTimeout(() => focusAt(first), 60);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, locked, value === '']);

  // Where each box has to travel to reach the centre of the row.
  useLayoutEffect(() => {
    if (!collapsed || !rowRef.current) return;
    const row = rowRef.current.getBoundingClientRect();
    const cx = row.left + row.width / 2;
    const boxes = refs.current.map((el) => el?.parentElement?.getBoundingClientRect());
    const box = boxes[0]?.width ?? 56;
    setGeo({ offsets: boxes.map((b) => (b ? cx - (b.left + b.width / 2) : 0)), radius: Math.min(34, box * 0.6), box });
  }, [collapsed]);

  // "Doesn't match": a small shake and a soft error border that fades back.
  useEffect(() => {
    if (!errorKey) return;
    setErroring(true);
    if (!reduce) shake.start({ x: [0, -7, 7, -5, 5, -2, 0], transition: { duration: 0.42, ease: 'easeInOut' } });
    const t = setTimeout(() => setErroring(false), 1400);
    return () => clearTimeout(t);
  }, [errorKey, reduce, shake]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>, i: number) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const next = current();
      next[i] = e.key;
      commit(next, i + 1 < length ? i + 1 : i);
      return;
    }
    switch (e.key) {
      case 'Backspace': {
        e.preventDefault();
        const next = current();
        if (next[i]) { next[i] = ''; commit(next, i); }
        else if (i > 0) { next[i - 1] = ''; commit(next, i - 1); }
        return;
      }
      case 'Delete': { e.preventDefault(); const next = current(); next[i] = ''; commit(next, i); return; }
      case 'ArrowLeft': e.preventDefault(); focusAt(i - 1); return;
      case 'ArrowRight': e.preventDefault(); focusAt(i + 1); return;
      case 'Home': e.preventDefault(); focusAt(0); return;
      case 'End': e.preventDefault(); focusAt(length - 1); return;
      default:
        // Letters and symbols never get in.
        if (e.key.length === 1) e.preventDefault();
    }
  };

  // Soft keyboards (keydown reports "Unidentified") and one-time-code autofill land here.
  const onInput = (raw: string, i: number) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) { const next = current(); next[i] = ''; commit(next); return; }
    if (digits.length >= 3) { fill(digits.length >= length ? 0 : i, digits); return; }
    const was = current()[i];
    const typed = digits.length === 2 && was ? (digits[0] === was ? digits[1]! : digits[0]!) : digits[digits.length - 1]!;
    const next = current();
    next[i] = typed;
    commit(next, i + 1 < length ? i + 1 : i);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>, i: number) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (digits) fill(digits.length === length ? 0 : i, digits);
  };

  // Orbit keyframes for box i: draw inward, circle the ring, settle into the centre.
  const orbit = (i: number): TargetAndTransition => {
    const dx = geo.offsets[i] ?? 0;
    const r = geo.radius;
    const base = 180 + i * (360 / length);
    const at = (deg: number) => (deg * Math.PI) / 180;
    const pts = [0, 50, 100].map((d) => ({ x: dx + r * Math.cos(at(base + d)), y: r * Math.sin(at(base + d)) }));
    return {
      x: [0, dx * 0.3, pts[0]!.x, pts[1]!.x, pts[2]!.x, dx],
      y: [0, 0, pts[0]!.y, pts[1]!.y, pts[2]!.y, 0],
      rotate: [0, 0, 14, 38, 62, 90],
      scale: [1, 0.96, 0.8, 0.74, 0.68, 0.5],
      opacity: [1, 1, 1, 1, 0.85, 0],
      transition: { duration: 1, times: [0, 0.16, 0.4, 0.6, 0.8, 1], ease: 'easeInOut' },
    };
  };

  const tileSize = Math.round(geo.box * 1.18);

  return (
    <div className={cn('relative mx-auto flex h-36 w-full max-w-[20rem] items-center justify-center', className)}>
      <motion.div
        ref={rowRef}
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        aria-busy={visual === 'verifying' || undefined}
        animate={shake}
        className="relative flex justify-center gap-[clamp(0.5rem,2.6vw,0.875rem)]"
      >
        {slots.map((digit, i) => {
          const isFocused = focused === i && !locked;
          const border = erroring ? ERROR : isFocused ? ROSE : digit ? '#E6C3CF' : '#EEDDE3';
          return (
            <motion.div
              key={i}
              className="relative h-[clamp(3.4rem,15vw,4.25rem)] w-[clamp(2.9rem,13vw,3.75rem)]"
              initial={false}
              animate={collapsed
                ? reduce ? { opacity: 0, scale: 0.96, transition: { duration: 0.2 } } : orbit(i)
                : { x: 0, y: 0, rotate: 0, opacity: 1, scale: isFocused ? 1.04 : 1, transition: { type: 'spring', stiffness: 420, damping: 30 } }}
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 grid place-items-center rounded-2xl border transition-[border-color,box-shadow,background] duration-200"
                style={{
                  borderColor: border,
                  background: erroring ? '#FFF6F7' : 'linear-gradient(180deg, #FFFFFF 0%, #FFF7F9 100%)',
                  boxShadow: isFocused ? '0 0 0 4px rgba(248,221,229,0.75), 0 8px 18px -12px rgba(184,92,120,0.45)' : '0 1px 2px rgba(43,34,37,0.04)',
                }}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {digit && (
                    <motion.span
                      key={`${i}-${digit}`}
                      className="font-display text-[clamp(1.55rem,7vw,2.05rem)] font-medium leading-none"
                      style={{ color: INK }}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.92 }}
                      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: [0.92, 1.04, 1] }}
                      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
                      transition={{ duration: 0.22, ease: EASE }}
                    >
                      {digit}
                    </motion.span>
                  )}
                </AnimatePresence>
                {isFocused && !digit && (
                  <motion.span aria-hidden="true" className="absolute bottom-[26%] h-[2px] w-4 rounded-full" style={{ background: ROSE }} animate={{ opacity: [0.25, 1, 0.25] }} transition={{ duration: 1.1, repeat: Infinity }} />
                )}
              </div>
              <input
                ref={(el) => { refs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                aria-label={`Digit ${i + 1} of ${length}`}
                aria-invalid={erroring || undefined}
                disabled={locked}
                value={digit}
                onChange={(e) => onInput(e.target.value, i)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onPaste={(e) => onPaste(e, i)}
                onFocus={(e) => { setFocused(i); e.target.select(); }}
                onBlur={() => setFocused((f) => (f === i ? -1 : f))}
                className="absolute inset-0 h-full w-full cursor-text rounded-2xl bg-transparent text-center text-transparent caret-transparent outline-none selection:bg-transparent disabled:cursor-default"
              />
            </motion.div>
          );
        })}
      </motion.div>

      {/* The ring the tiles orbit, then the single tile they become. */}
      <AnimatePresence>
        {collapsed && (
          <motion.div key="stage" className="pointer-events-none absolute inset-0 grid place-items-center" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.2 } }}>
            {!reduce && (
              <motion.span
                aria-hidden="true"
                className="absolute rounded-full border"
                style={{ width: geo.radius * 2 + geo.box * 0.9, height: geo.radius * 2 + geo.box * 0.9, borderColor: CHAMPAGNE }}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: [0, 0.9, 0.9, 0], scale: [0.85, 1, 1, 0.7] }}
                transition={{ duration: 1, times: [0, 0.25, 0.7, 1], ease: 'easeInOut' }}
              />
            )}
            <motion.div
              className="relative grid place-items-center rounded-[22px] border"
              style={{ width: tileSize, height: tileSize }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{
                opacity: 1,
                scale: visual === 'success' && !reduce ? [1, 1.06, 1] : 1,
                backgroundColor: visual === 'success' ? SUCCESS : '#FFF7F9',
                borderColor: visual === 'success' ? SUCCESS : ROSE,
                boxShadow: visual === 'success' ? '0 14px 30px -16px rgba(95,159,114,0.7)' : '0 12px 28px -18px rgba(184,92,120,0.55)',
              }}
              transition={{ opacity: { delay: reduce ? 0.05 : 0.82, duration: 0.25 }, scale: { delay: reduce ? 0 : visual === 'success' ? 0 : 0.82, duration: 0.45, ease: EASE }, default: { duration: 0.45, ease: EASE } }}
            >
              {visual === 'verifying' && (
                <svg width={tileSize * 0.5} height={tileSize * 0.5} viewBox="0 0 40 40" aria-hidden="true">
                  <circle cx="20" cy="20" r="15" fill="none" stroke="#F3DCE3" strokeWidth="2" />
                  <motion.circle
                    cx="20" cy="20" r="15" fill="none" stroke={DEEP_ROSE} strokeWidth="2" strokeLinecap="round" strokeDasharray="24 70"
                    style={{ originX: '50%', originY: '50%' }}
                    animate={reduce ? { opacity: [0.4, 1, 0.4] } : { rotate: 360 }}
                    transition={reduce ? { duration: 1.4, repeat: Infinity } : { duration: 1.1, repeat: Infinity, ease: 'linear' }}
                  />
                </svg>
              )}
              {visual === 'success' && (
                <svg width={tileSize * 0.52} height={tileSize * 0.52} viewBox="0 0 40 40" aria-hidden="true">
                  <motion.path
                    d="M11 20.5 L17.5 27 L29.5 14"
                    fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ delay: 0.15, duration: reduce ? 0.01 : 0.45, ease: EASE }}
                  />
                </svg>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
