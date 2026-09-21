// Applies db/migrations/*.sql to the Neon branch in DATABASE_URL, in order,
// each file in its own transaction, recording what ran in schema_migrations.
//
//   npm run db:migrate            # uses DATABASE_URL from the environment or .env.local / .env
//   npm run db:migrate -- --dry   # list pending migrations only
//
// Use DATABASE_URL_UNPOOLED when available (migrations are multi-statement).

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
loadEnvFile(join(root, '.env.local'));
loadEnvFile(join(root, '.env'));

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Run `neon env pull` or add it to .env.local.');
  process.exit(1);
}
const dry = process.argv.includes('--dry');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: true } });
await client.connect();
await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
const applied = new Set((await client.query(`select name from schema_migrations`)).rows.map((r) => r.name));
const dir = join(root, 'db', 'migrations');
const pending = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().filter((f) => !applied.has(f));
if (!pending.length) console.log('Database is up to date.');
for (const f of pending) {
  if (dry) { console.log(`pending: ${f}`); continue; }
  const t = Date.now();
  try {
    await client.query('begin');
    await client.query(readFileSync(join(dir, f), 'utf8'));
    await client.query(`insert into schema_migrations (name) values ($1)`, [f]);
    await client.query('commit');
    console.log(`applied ${f} (${Date.now() - t} ms)`);
  } catch (e) {
    await client.query('rollback');
    console.error(`FAILED ${f}: ${e.message}`);
    await client.end();
    process.exit(1);
  }
}
await client.end();
