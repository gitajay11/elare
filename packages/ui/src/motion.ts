import type { Transition, Variants } from 'framer-motion';

// One vocabulary of motion for the whole site: slow, soft, editorial.
export const EASE = [0.22, 0.61, 0.36, 1] as const;
export const EXPO = [0.16, 1, 0.3, 1] as const;

export const luxe = (duration = 0.7, delay = 0): Transition => ({ duration, delay, ease: EASE });

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.75, delay: 0.06 * i, ease: EASE } }),
};

export const fadeBlur: Variants = {
  hidden: { opacity: 0, filter: 'blur(8px)', y: 10 },
  show: (i = 0) => ({ opacity: 1, filter: 'blur(0px)', y: 0, transition: { duration: 0.9, delay: 0.08 * i, ease: EASE } }),
};

export const wipeUp: Variants = {
  hidden: { opacity: 0, y: 24, clipPath: 'inset(100% 0 -30% 0)' },
  show: (i = 0) => ({ opacity: 1, y: 0, clipPath: 'inset(-30% 0 -30% 0)', transition: { duration: 1, delay: 0.1 * i, ease: EXPO } }),
};

export const imageReveal: Variants = {
  hidden: { opacity: 0, scale: 1.06, clipPath: 'inset(8% 6% 8% 6% round 28px)' },
  show: { opacity: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 28px)', transition: { duration: 1.3, ease: EXPO } },
};

export const stagger = (staggerChildren = 0.08, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren, delayChildren } },
});

export const viewportOnce = { once: true, margin: '-10% 0px -10% 0px' } as const;


export const drawer = {
  initial: { x: '100%' },
  animate: { x: 0, transition: { duration: 0.5, ease: EXPO } },
  exit: { x: '100%', transition: { duration: 0.35, ease: EASE } },
};

export const overlay = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.25 } },
};
