// Builds either app. Pass "admin"/"store" as an argument or set VITE_APP,
// so both Vercel projects can share the same build command and differ only
// by an environment variable.
import { spawnSync } from 'node:child_process';

const app = (process.argv[2] || process.env.VITE_APP || 'store').toLowerCase();
if (!['store', 'admin'].includes(app)) {
  console.error(`Unknown app "${app}" — use "store" or "admin".`);
  process.exit(1);
}
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const run = (args) => {
  const r = spawnSync(npx, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
console.log(`\n[build] ${app === 'admin' ? 'Élaré Admin (back-office)' : 'Élaré Beauty (storefront)'}\n`);
run(['tsc', '-b']);
run(['vite', 'build', ...(app === 'admin' ? ['--mode', 'admin'] : [])]);
