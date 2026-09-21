import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { type ProductCard } from '@elare/types';
import { fadeBlur, imageReveal, stagger, wipeUp, Button } from '@elare/ui';
import { HeroRing } from './HeroRing';

const HERO_IMAGE = 'https://images.pexels.com/photos/2661255/pexels-photo-2661255.jpeg?auto=compress&cs=tinysrgb&w=1200';
const HERO_ALT = 'Portrait with luminous, softly sculpted makeup against a warm neutral backdrop';

/** Floating cosmetic elements: shade drops and a highlighter glint, parallaxed by the cursor. */
const FLOATERS = [
  { hex: '#C98A7D', size: 54, x: '4%', y: '10%', depth: 0.6, delay: 0 },
  { hex: '#8E3A5B', size: 34, x: '86%', y: '18%', depth: 1.1, delay: 0.8 },
  { hex: '#E8A7B8', size: 22, x: '78%', y: '82%', depth: 0.9, delay: 1.4 },
  { hex: '#ECDCC0', size: 44, x: '-2%', y: '70%', depth: 1.3, delay: 0.4 },
];

export function Hero({ ringProducts }: { ringProducts: ProductCard[] }) {
  const reduce = useReducedMotion();
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ['start start', 'end start'] });
  const imageY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 70]);
  const textY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -30]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 40, damping: 18 });
  const sy = useSpring(my, { stiffness: 40, damping: 18 });

  const onMove = (e: React.MouseEvent) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
    my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
  };

  return (
    <section ref={section} className="relative overflow-hidden" onMouseMove={onMove} aria-labelledby="hero-heading">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-blush/60 blur-3xl" aria-hidden="true" />
      <div className="container-x relative grid items-center gap-10 pb-10 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-6 lg:pt-16">
        <motion.div style={{ y: textY }} variants={stagger(0.12, 0.15)} initial="hidden" animate="show" className="relative z-10 max-w-xl">
          <motion.p variants={fadeBlur} className="eyebrow">Élaré Beauty · The new edit</motion.p>
          <h1 id="hero-heading" className="mt-5 text-[3.2rem] leading-[0.98] sm:text-[4.4rem] lg:text-[5.4rem]">
            <motion.span variants={wipeUp} custom={0} className="block">Beauty,</motion.span>
            <motion.span variants={wipeUp} custom={1} className="block italic text-rose">defined by you.</motion.span>
          </h1>
          <motion.p variants={fadeBlur} custom={3} className="mt-6 max-w-md text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
            Discover Élaré Beauty — refined makeup designed to complement every complexion, mood, and moment.
          </motion.p>
          <motion.div variants={fadeBlur} custom={4} className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button variant="glow" size="lg" to="/category/lips/signature-lip-collection" className="px-8">
              Shop Signature Collection
            </Button>
            <Button variant="outline" size="lg" to="/best-sellers" icon={<ArrowRight size={16} />}>
              Explore Best Sellers
            </Button>
          </motion.div>
          <motion.ul variants={fadeBlur} custom={5} className="mt-10 flex flex-wrap gap-x-8 gap-y-2 text-[12px] uppercase tracking-[0.2em] text-mist">
            <li>Cruelty-free</li>
            <li>Dermatologist tested</li>
            <li>Refillable edits</li>
          </motion.ul>
        </motion.div>

        <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
          <motion.div style={{ y: imageY }} variants={imageReveal} initial="hidden" animate="show" className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-nude shadow-float">
            <img src={HERO_IMAGE} alt={HERO_ALT} className="h-full w-full object-cover object-[50%_20%]" fetchPriority="high" decoding="async" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,249,250,0)_60%,rgba(255,249,250,.35))]" />
            <div className="absolute bottom-5 left-5 rounded-2xl bg-white/85 px-4 py-3 shadow-soft backdrop-blur">
              <p className="text-[10.5px] uppercase tracking-[0.22em] text-rose">Signature</p>
              <p className="font-display text-xl leading-tight">The Lip Edit</p>
              <p className="text-[12px] text-ink-soft">Liner + Lipstick + Gloss</p>
            </div>
          </motion.div>
          {FLOATERS.map((f, i) => <Floater key={i} f={f} i={i} sx={sx} sy={sy} reduce={!!reduce} />)}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 24, scale: 0.99 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: 0.7, duration: 1, ease: [0.16, 1, 0.3, 1] } }} className="relative -mt-4 lg:-mt-10">
        <HeroRing products={ringProducts} />
      </motion.div>
    </section>
  );
}

function Floater({ f, i, sx, sy, reduce }: { f: (typeof FLOATERS)[number]; i: number; sx: MotionValue<number>; sy: MotionValue<number>; reduce: boolean }) {
  const x = useTransform(sx, (v) => v * 18 * f.depth);
  const y = useTransform(sy, (v) => v * 14 * f.depth);
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute hidden rounded-full lg:block"
      style={{
        left: f.x, top: f.y, width: f.size, height: f.size,
        background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.7), rgba(255,255,255,0) 45%), ${f.hex}`,
        boxShadow: '0 14px 30px -12px rgba(36,29,32,.35)',
        x, y,
      }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1, transition: { delay: 0.9 + f.delay * 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] } }}
    >
      <motion.span className="block h-full w-full rounded-full" animate={reduce ? undefined : { y: [0, -8, 0] }} transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: f.delay }} />
    </motion.span>
  );
}
