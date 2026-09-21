// Renders the PWA icon set for both sites from an inline SVG of the wordmark.
//
//   pnpm icons
//
// Writes into apps/<site>/public: pwa-192.png, pwa-512.png, pwa-maskable-512.png,
// apple-touch-icon.png (180). Maskable icons keep the mark inside the safe zone.
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const SITES = {
  storefront: { bg: '#FFF9FA', disc: '#F8DDE5', mark: '#B85C78', label: null },
  admin: { bg: '#241D20', disc: '#5C5257', mark: '#F8DDE5', label: 'ADMIN' },
};

/** The mark as SVG; `pad` shrinks it towards the centre for maskable icons. */
function svg({ bg, disc, mark, label }, size, pad = 0, rounded = true) {
  const inner = size - pad * 2;
  const r = inner * 0.36;
  const cx = size / 2;
  const cy = size / 2;
  const fontSize = inner * 0.56;
  const labelSvg = label
    ? `<text x="${cx}" y="${cy + inner * 0.42}" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-size="${inner * 0.11}" font-weight="700" letter-spacing="${inner * 0.02}" fill="${mark}">${label}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rounded ? size * 0.22 : 0}" fill="${bg}"/>
  <circle cx="${cx}" cy="${cy - (label ? inner * 0.04 : 0)}" r="${r}" fill="${disc}"/>
  <text x="${cx}" y="${cy + fontSize * 0.34 - (label ? inner * 0.04 : 0)}" text-anchor="middle" font-family="Cormorant Garamond, Georgia, 'Times New Roman', serif" font-size="${fontSize}" font-weight="600" fill="${mark}">É</text>
  ${labelSvg}
</svg>`;
}

for (const [site, theme] of Object.entries(SITES)) {
  const out = join(root, 'apps', site, 'public');
  mkdirSync(out, { recursive: true });
  const jobs = [
    ['pwa-192.png', svg(theme, 192)],
    ['pwa-512.png', svg(theme, 512)],
    ['pwa-maskable-512.png', svg(theme, 512, 64, false)],
    ['apple-touch-icon.png', svg(theme, 180, 0, false)],
  ];
  for (const [name, source] of jobs) {
    const png = await sharp(Buffer.from(source)).png().toBuffer();
    writeFileSync(join(out, name), png);
    console.log(`${site}/${name} (${(png.length / 1024).toFixed(0)} KB)`);
  }
}
