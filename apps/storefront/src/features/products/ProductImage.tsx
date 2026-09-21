import { useState } from 'react';
import { cn, imageUrl, srcSet } from '@elare/utils';

interface Props {
  src: string | null | undefined;
  alt: string;
  /** Rendered when the image is missing or fails: a shade-tinted visual so makeup never shows a broken icon. */
  shadeHex?: string | null;
  width?: number;
  sizes?: string;
  className?: string;
  imgClassName?: string;
  priority?: boolean;
}

export function ProductImage({ src, alt, shadeHex, width = 800, sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw', className, imgClassName, priority }: Props) {
  const [failed, setFailed] = useState(false);
  const showFallback = !src || failed;
  return (
    <div className={cn('relative overflow-hidden bg-nude', className)}>
      {showFallback ? (
        <ShadeVisual hex={shadeHex ?? '#E8A7B8'} label={alt} />
      ) : (
        <img
          src={imageUrl(src, width)}
          srcSet={srcSet(src)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)}
          className={cn('h-full w-full object-cover', imgClassName)}
        />
      )}
    </div>
  );
}

/** A painterly swatch smear on a soft base — a credible, on-brand stand-in for a photograph. */
export function ShadeVisual({ hex, label, className }: { hex: string; label?: string; className?: string }) {
  return (
    <div className={cn('relative h-full w-full bg-[linear-gradient(160deg,#fff9fa,#f8dde5)]', className)} role="img" aria-label={label}>
      <svg viewBox="0 0 400 400" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
          <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <path d="M118 262c-30-58 8-128 68-140 44-9 80 18 112 46 34 30 44 82 14 118-30 36-96 34-134 14-24-12-48-18-60-38z" fill={hex} filter="url(#soft)" />
        <path d="M118 262c-30-58 8-128 68-140 44-9 80 18 112 46 34 30 44 82 14 118-30 36-96 34-134 14-24-12-48-18-60-38z" fill="url(#sheen)" />
        <path d="M150 210c30-40 90-48 128-18" stroke="#fff" strokeOpacity="0.35" strokeWidth="6" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}
