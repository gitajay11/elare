// Bundles functions/api/index.ts into the ZIP the Neon Functions deploy
// endpoint expects (single index.mjs, ESM, node24) and writes it to
// dist-functions/api.zip. `neon deploy` does this itself; this script exists
// for deploys through the API / MCP or CI.
//
//   node scripts/build-function.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFunctionBundle } from '@neon/config-runtime';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zip = await buildFunctionBundle(
  { slug: 'api', name: 'Élaré API', source: join(root, 'functions/api/index.ts'), env: {}, runtime: 'nodejs24', bundler: 'esbuild' },
  { onWarning: (m) => console.warn('[bundle]', m) },
);
mkdirSync(join(root, 'dist-functions'), { recursive: true });
const out = join(root, 'dist-functions', 'api.zip');
writeFileSync(out, zip);
console.log(`wrote ${out} (${(zip.byteLength / 1024).toFixed(0)} KB)`);
