import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import type { ProductCard } from '@/lib/types';
import { imageUrl } from '@/lib/format';

/**
 * A true 3D perspective ring. 37 cards sit tangent to a cylinder of radius
 * R = 891px whose camera is AT the ring centre (perspective = R), so every
 * card faces the camera exactly and the slanted top edges are perspective,
 * not rotation. The back half is culled beyond ±42°. Rotates at 1.9°/s.
 *
 * The composition is authored at a fixed 1172 × 420 canvas and scaled by ONE
 * transform to the container width, so proportions never drift.
 */
const W = 1172;
const H = 420;
const R = 891;
const N = 37;
const STEP = 360 / N; // 9.7297°
const CULL = 42;
const SPEED = 1.9; // deg / s
const CARD_W = 130;
const CARD_H = 300;
const CARD_Y = 200; // card plane centre
const HORIZON = CARD_Y + 302; // perspective origin sits below the card plane, as in the reference

export function HeroRing({ products }: { products: ProductCard[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const [k, setK] = useState(1);
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const items = products.length ? products : [];

  // Scale law: fill the container width.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let phase = -2;
    let last = performance.now();
    let raf = 0;

    const place = () => {
      for (let i = 0; i < N; i++) {
        const el = cards.current[i];
        if (!el) continue;
        // signed angle in -180..180
        const a = ((((i * STEP + phase) % 360) + 540) % 360) - 180;
        if (Math.abs(a) > CULL) {
          el.style.visibility = 'hidden';
          continue;
        }
        el.style.visibility = 'visible';
        const r = (a * Math.PI) / 180;
        const c = Math.cos(r);
        el.style.transform = `translate3d(${R * Math.sin(r)}px, 0, ${R * (1 - c)}px) rotateY(${-a}deg)`;
        // edges dim, front bright
        el.style.filter = `brightness(${0.84 + 0.5 * (1 / c - 1)})`;
      }
    };

    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.1);
      last = t;
      if (!reduce) phase -= SPEED * dt; // continuous, never resets
      place();
      raf = requestAnimationFrame(tick);
    };
    // A backgrounded tab must not jump when it returns.
    const onVis = () => { last = performance.now(); };
    document.addEventListener('visibilitychange', onVis);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reduce, items.length]);

  if (!items.length) return null;

  return (
    <div ref={wrap} className="relative w-full overflow-hidden" style={{ height: H * k }} aria-hidden="true">
      <div
        className="absolute left-1/2 top-0"
        style={{ width: W, height: H, transform: `translateX(-50%) scale(${k})`, transformOrigin: '50% 0' }}
      >
        <div className="absolute inset-0" style={{ perspective: `${R}px`, perspectiveOrigin: `${W / 2}px ${HORIZON}px`, transformStyle: 'preserve-3d' }}>
          {Array.from({ length: N }).map((_, i) => {
            const p = items[i % items.length];
            const shade = p.shades[0];
            return (
              <div
                key={i}
                ref={(el) => { cards.current[i] = el; }}
                className="ring-card absolute cursor-pointer overflow-hidden rounded-[14px] bg-nude shadow-[0_24px_46px_rgba(36,29,32,.18),0_3px_8px_rgba(36,29,32,.10)] will-change-transform"
                style={{ left: W / 2, top: CARD_Y, width: CARD_W, height: CARD_H, margin: `${-CARD_H / 2}px 0 0 ${-CARD_W / 2}px`, backfaceVisibility: 'hidden', visibility: 'hidden' }}
                onClick={() => navigate(`/product/${p.slug}`)}
              >
                {p.image ? (
                  <img src={imageUrl(p.image.url, 300)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="absolute inset-0" style={{ background: `linear-gradient(160deg,#fff9fa,${shade?.hex ?? '#f8dde5'})` }} />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,rgba(36,29,32,0),rgba(36,29,32,.72))] px-2.5 pb-2.5 pt-8 text-white">
                  <p className="truncate font-display text-[13px] leading-tight">{p.name}</p>
                  <div className="mt-1 flex items-center gap-1">
                    {p.shades.slice(0, 4).map((s) => <span key={s.id} className="h-2 w-2 rounded-full border border-white/40" style={{ background: s.hex }} />)}
                  </div>
                </div>
                <div className="absolute inset-0 rounded-[14px] shadow-[inset_0_0_0_1px_rgba(255,255,255,.35),inset_0_16px_30px_rgba(255,255,255,.08)]" />
              </div>
            );
          })}
        </div>
      </div>
      {/* Soft edge fades keep the ring feeling like it continues off-stage */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-[linear-gradient(90deg,#fff9fa,rgba(255,249,250,0))] sm:w-40" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-[linear-gradient(270deg,#fff9fa,rgba(255,249,250,0))] sm:w-40" />
    </div>
  );
}
