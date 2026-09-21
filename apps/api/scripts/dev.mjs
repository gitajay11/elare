// Runs the API locally (http://localhost:8790) against the Neon branch in the
// repo-root .env.local — the same bundle `neon deploy` ships. Point the apps at
// it with VITE_API_URL=http://localhost:8790.
//
//   pnpm api:dev
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { serve } from '@hono/node-server';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(root, '..', '..');
for (const file of ['.env.local', '.env']) {
  const p = join(repoRoot, file);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const out = join(root, 'dist-functions', 'local.mjs');
await build({
  entryPoints: [join(root, 'src/server.ts')], bundle: true, platform: 'node', target: 'node24', format: 'esm', outfile: out, logLevel: 'error',
  banner: { js: "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);" },
});
const { default: app } = await import(`${pathToFileURL(out).href}?t=${Date.now()}`);
const port = Number(process.env.API_PORT || process.env.PORT || 8790);
serve({ fetch: app.fetch, port }, () => console.log(`[api] listening on http://localhost:${port}`));
