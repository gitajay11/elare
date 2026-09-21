// Vercel build entry for a project rooted at the repository root.
//
// Two Vercel projects point at this repo: the storefront (main domain) and the
// admin (subdomain). Each sets ELARE_APP=storefront|admin; this builds only
// that site and copies its bundle to ./dist, the output directory in the root
// vercel.json. (Projects whose Root Directory is apps/<site> use the
// vercel.json inside that folder instead and never run this script.)
import { execSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.env.ELARE_APP || 'storefront';
if (!['storefront', 'admin'].includes(app)) throw new Error(`ELARE_APP must be "storefront" or "admin", got "${app}"`);

execSync(`pnpm turbo run build --filter=@elare/${app}`, { cwd: root, stdio: 'inherit' });

const from = join(root, 'apps', app, 'dist');
const to = join(root, 'dist');
if (!existsSync(from)) throw new Error(`${from} was not produced`);
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
console.log(`[vercel-build] ${app} → ${to}`);
