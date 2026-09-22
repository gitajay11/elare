// Deploys the API Function through the Neon REST API — no CLI login needed,
// only an API key. Bundles src/server.ts, uploads the zip together with the
// function's whole environment (taken from an env file) and waits for the
// deployment to complete.
//
//   pnpm --filter @elare/api deploy -- --env ../../.env.live.local
//
// The env file must contain NEON_API_KEY and every variable the function
// needs (unset keys are dropped, and the environment is replaced as a whole).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFunctionBundle } from '@neon/config-runtime';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const argEnv = process.argv[process.argv.indexOf('--env') + 1];
const envFile = resolve(process.cwd(), process.argv.includes('--env') && argEnv ? argEnv : join(root, '..', '..', '.env.local'));
if (!existsSync(envFile)) throw new Error(`env file not found: ${envFile}`);
const env = Object.fromEntries(
  readFileSync(envFile, 'utf8').split(/\r?\n/)
    .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]),
);

const PROJECT = 'old-glitter-35912907';
const BRANCH = 'br-silent-truth-b37e34sx';
const SLUG = 'api';
const KEYS = ['ALLOWED_ORIGINS', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'SUPPORT_EMAIL', 'STORE_URL'];

const apiKey = env.NEON_API_KEY || process.env.NEON_API_KEY;
if (!apiKey) throw new Error('NEON_API_KEY is not set');
const environment = { MEDIA_BUCKET: 'media' };
for (const k of KEYS) if (env[k] && !/REPLACE_ME/.test(env[k])) environment[k] = env[k];
if (!environment.ALLOWED_ORIGINS) throw new Error('ALLOWED_ORIGINS is required');
console.log('environment keys:', Object.keys(environment).join(', '));

console.log('bundling…');
const zip = await buildFunctionBundle(
  { slug: SLUG, name: 'Élaré API', source: join(root, 'src/server.ts'), env: {}, runtime: 'nodejs24', bundler: 'esbuild' },
  { onWarning: (m) => console.warn('[bundle]', m) },
);
console.log(`bundle ${(zip.byteLength / 1024).toFixed(0)} KB`);

const base = `https://console.neon.tech/api/v2/projects/${PROJECT}/branches/${BRANCH}/functions/${SLUG}`;
const form = new FormData();
form.append('zip', new Blob([zip], { type: 'application/zip' }), 'function.zip');
form.append('runtime', 'nodejs24');
form.append('environment', JSON.stringify(environment));
const res = await fetch(`${base}/deployments`, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form });
const created = await res.json();
if (!res.ok) throw new Error(`deploy request failed (${res.status}): ${JSON.stringify(created)}`);
console.log(`deployment #${created.id ?? created.deployment?.id ?? '?'} ${created.status ?? created.deployment?.status ?? ''}`);

for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const fn = await (await fetch(base, { headers: { Authorization: `Bearer ${apiKey}` } })).json();
  const d = fn.current_deployment ?? fn.function?.current_deployment ?? fn;
  process.stdout.write(`  ${d.status}\n`);
  if (d.status === 'completed') { console.log(`live: deployment #${d.id}, env: ${(d.environment ?? []).join(', ')}`); process.exit(0); }
  if (d.status === 'failed') { console.error('deployment failed', JSON.stringify(d)); process.exit(1); }
}
console.error('timed out waiting for the deployment');
process.exit(1);
