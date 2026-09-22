// Renders every icon both sites need from the brand emblem in logo/elare logo.png.
//
//   pnpm icons
//
// Writes into apps/<site>/public:
//   logo.png            transparent emblem for the site header (256)
//   logo-email.png      small transparent emblem for email headers (160)
//   favicon.png         64 — tab icon (PNG works everywhere SVG does, and Safari too)
//   apple-touch-icon.png 180 on the site's background
//   pwa-192.png / pwa-512.png / pwa-maskable-512.png (maskable keeps the emblem in the safe zone)
import sharp from 'sharp';
import { mkdirSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(root, 'logo', 'elare logo.png');

// Backgrounds match each site's theme-color.
const SITES = { storefront: '#FFF9FA', admin: '#241D20' };

// Trim the transparent margin once so every size is framed identically.
const emblem = await sharp(SOURCE).trim().png().toBuffer();

/** Emblem scaled to `scale` of a `size` square, optionally on a solid background. */
async function icon(size, scale, bg) {
  const inner = Math.round(size * scale);
  const mark = await sharp(emblem).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const base = sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite([{ input: mark, left: Math.round((size - inner) / 2), top: Math.round((size - inner) / 2) }]).png().toBuffer();
}

for (const [site, bg] of Object.entries(SITES)) {
  const out = join(root, 'apps', site, 'public');
  mkdirSync(out, { recursive: true });
  const jobs = [
    ['logo.png', await icon(256, 1)],
    ['logo-email.png', await icon(160, 1)],
    ['favicon.png', await icon(64, 1)],
    ['apple-touch-icon.png', await icon(180, 0.82, bg)],
    ['pwa-192.png', await icon(192, 0.82, bg)],
    ['pwa-512.png', await icon(512, 0.82, bg)],
    ['pwa-maskable-512.png', await icon(512, 0.62, bg)],
  ];
  for (const [name, png] of jobs) {
    writeFileSync(join(out, name), png);
    console.log(`${site}/${name} (${(png.length / 1024).toFixed(0)} KB)`);
  }
  // The old vector placeholder.
  const legacy = join(out, 'favicon.svg');
  if (existsSync(legacy)) unlinkSync(legacy);
}
