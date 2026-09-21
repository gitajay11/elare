// Local full-stack dev harness.
//
// Boots Postgres-in-WASM (PGlite), applies the REAL migrations from
// supabase/migrations, and exposes the subset of the Supabase HTTP API the
// app uses (PostgREST tables + RPC, GoTrue email/password auth, Storage
// uploads) on http://localhost:54321. Then starts Vite pointed at it.
//
// Nothing is mocked: every price, coupon, stock check and order runs through
// the same SQL functions that run in production. Data lives in memory and
// resets on restart. The first account you create becomes the admin.
//
//   npm run dev:local

import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.LOCAL_API_PORT || 54321);
const ANON_KEY = 'local-anon-key';
const JWT_SECRET = 'local-dev-secret-not-for-production';
const ADMIN_EMAIL = process.env.LOCAL_ADMIN_EMAIL?.toLowerCase();

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });
await db.exec(`
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb,
    password_hash text, password_salt text, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit int, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
`);
const migrations = join(root, 'supabase', 'migrations');
for (const f of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migrations, f), 'utf8'));
  console.log(`[db] applied ${f}`);
}
// Table primary keys, for PostgREST-style upserts.
const pkCache = new Map();
async function primaryKey(table) {
  if (!pkCache.has(table)) {
    const { rows } = await db.query(
      `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = ('public.' || quote_ident($1))::regclass and i.indisprimary`, [table]);
    pkCache.set(table, rows.map((r) => r.attname));
  }
  return pkCache.get(table);
}

// Every request runs in its own transaction with the caller's identity applied,
// exactly as PostgREST does (role + JWT claims), so RLS is exercised locally too.
let chain = Promise.resolve();
function withIdentity(uid, fn) {
  const run = async () => db.transaction(async (tx) => {
    await tx.query(`select set_config('app.uid', $1, true)`, [uid ?? '']);
    await tx.exec(`set local role ${uid ? 'authenticated' : 'anon'}`);
    return fn(tx);
  });
  const p = chain.then(run, run);
  chain = p.catch(() => undefined);
  return p;
}

// ---------------------------------------------------------------------------
// Auth (email + password, HS256 JWTs)
// ---------------------------------------------------------------------------
const b64 = (s) => Buffer.from(s).toString('base64url');
function signJwt(payload) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify(payload));
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [head, body, sig] = token.split('.');
  if (!head || !body || !sig) return null;
  const expected = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}
const refreshTokens = new Map(); // refresh_token -> user id
async function userRow(id) {
  const { rows } = await db.query(`select id, email, raw_user_meta_data, created_at from auth.users where id = $1`, [id]);
  return rows[0] ?? null;
}
function userJson(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at, phone: '',
    confirmed_at: u.created_at, last_sign_in_at: new Date().toISOString(), app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: u.raw_user_meta_data ?? {}, identities: [], created_at: u.created_at, updated_at: u.created_at,
  };
}
async function session(u) {
  const expires_in = 3600;
  const access_token = signJwt({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + expires_in });
  const refresh_token = randomBytes(24).toString('base64url');
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: 'bearer', expires_in, expires_at: Math.floor(Date.now() / 1000) + expires_in, refresh_token, user: userJson(u) };
}
function hash(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 32).toString('hex') };
}
async function auth(req, path, query, body) {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const claims = bearer && bearer !== ANON_KEY ? verifyJwt(bearer) : null;

  if (req.method === 'POST' && path === '/auth/v1/signup') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!email || !body.password || String(body.password).length < 6) return [400, { error_code: 'validation_failed', msg: 'Email and a password of at least 6 characters are required.' }];
    const exists = await db.query(`select 1 from auth.users where email = $1`, [email]);
    if (exists.rows.length) return [422, { error_code: 'user_already_exists', msg: 'User already registered' }];
    const { salt, hash: h } = hash(String(body.password));
    const { rows } = await db.query(`insert into auth.users (email, raw_user_meta_data, password_hash, password_salt) values ($1, $2, $3, $4) returning id`, [email, body.data ?? {}, h, salt]);
    const count = await db.query(`select count(*)::int as c from auth.users`);
    if ((ADMIN_EMAIL && email === ADMIN_EMAIL) || (!ADMIN_EMAIL && count.rows[0].c === 1)) {
      await db.query(`update profiles set role = 'admin' where id = $1`, [rows[0].id]);
      console.log(`[auth] ${email} promoted to admin`);
    }
    return [200, await session(await userRow(rows[0].id))];
  }
  if (req.method === 'POST' && path === '/auth/v1/token') {
    if (query.get('grant_type') === 'password') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const { rows } = await db.query(`select * from auth.users where email = $1`, [email]);
      const u = rows[0];
      if (!u || hash(String(body.password ?? ''), u.password_salt).hash !== u.password_hash) return [400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }];
      return [200, await session(u)];
    }
    if (query.get('grant_type') === 'refresh_token') {
      const uid = refreshTokens.get(body.refresh_token);
      if (!uid) return [400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' }];
      refreshTokens.delete(body.refresh_token);
      return [200, await session(await userRow(uid))];
    }
  }
  if (path === '/auth/v1/user') {
    if (!claims) return [401, { error_code: 'no_authorization', msg: 'Invalid JWT' }];
    const u = await userRow(claims.sub);
    if (!u) return [401, { msg: 'User not found' }];
    if (req.method === 'PUT') {
      if (body.password) {
        const { salt, hash: h } = hash(String(body.password));
        await db.query(`update auth.users set password_hash = $1, password_salt = $2 where id = $3`, [h, salt, u.id]);
      }
      if (body.data) await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $1 where id = $2`, [body.data, u.id]);
    }
    return [200, userJson(await userRow(u.id))];
  }
  if (req.method === 'POST' && path === '/auth/v1/logout') return [204, null];
  if (req.method === 'POST' && path === '/auth/v1/recover') { console.log(`[auth] password recovery requested for ${body.email} (no email in local mode)`); return [200, {}]; }
  return [404, { msg: `Unsupported auth endpoint ${req.method} ${path}` }];
}

// ---------------------------------------------------------------------------
// PostgREST subset: /rest/v1/rpc/:fn and /rest/v1/:table
// ---------------------------------------------------------------------------
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`bad identifier ${s}`); return `"${s}"`; };
function pgError(e) {
  return { code: e.code ?? 'P0001', message: e.message, details: e.detail ?? null, hint: e.hint ?? null };
}
function filters(query) {
  const where = [];
  const params = [];
  for (const [k, v] of query.entries()) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    const m = /^(\w+)\.(.*)$/.exec(v);
    if (!m) continue;
    const [, op, raw] = m;
    const col = ident(k);
    if (op === 'eq') { params.push(raw); where.push(`${col} = $${params.length}`); }
    else if (op === 'neq') { params.push(raw); where.push(`${col} <> $${params.length}`); }
    else if (op === 'gt') { params.push(raw); where.push(`${col} > $${params.length}`); }
    else if (op === 'gte') { params.push(raw); where.push(`${col} >= $${params.length}`); }
    else if (op === 'lt') { params.push(raw); where.push(`${col} < $${params.length}`); }
    else if (op === 'lte') { params.push(raw); where.push(`${col} <= $${params.length}`); }
    else if (op === 'is') { where.push(`${col} is ${raw === 'null' ? 'null' : raw === 'true' ? 'true' : 'false'}`); }
    else if (op === 'in') { const vals = raw.replace(/^\(|\)$/g, '').split(','); params.push(vals); where.push(`${col} = any($${params.length})`); }
    else if (op === 'ilike') { params.push(raw.replace(/\*/g, '%')); where.push(`${col} ilike $${params.length}`); }
  }
  return { where: where.length ? ' where ' + where.join(' and ') : '', params };
}
function orderBy(query) {
  const o = query.get('order');
  if (!o) return '';
  return ' order by ' + o.split(',').map((part) => {
    const [col, ...mods] = part.split('.');
    return `${ident(col)} ${mods.includes('desc') ? 'desc' : 'asc'}${mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : ''}`;
  }).join(', ');
}
function columns(query) {
  const s = (query.get('select') ?? '*').replace(/\s/g, '');
  return s === '*' ? '*' : s.split(',').map(ident).join(', ');
}
async function rest(req, path, query, body, uid) {
  const prefer = req.headers.prefer ?? '';
  const wantObject = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  const representation = prefer.includes('return=representation') || req.method === 'GET';
  const shape = (rows) => {
    if (!wantObject) return [200, rows];
    if (rows.length === 1) return [200, rows[0]];
    return [406, { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned`, details: `Results contain ${rows.length} rows`, hint: null }];
  };

  const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(path);
  if (rpc) {
    const args = body && typeof body === 'object' ? body : {};
    const keys = Object.keys(args);
    const sql = `select ${ident(rpc[1])}(${keys.map((k, i) => `${ident(k)} := $${i + 1}`).join(', ')}) as r`;
    const { rows } = await withIdentity(uid, (tx) => tx.query(sql, keys.map((k) => args[k])));
    return [200, rows[0]?.r ?? null];
  }

  const t = /^\/rest\/v1\/(\w+)$/.exec(path);
  if (!t) return [404, { message: `No route for ${path}` }];
  const table = t[1];
  const { where, params } = filters(query);

  if (req.method === 'GET' || req.method === 'HEAD') {
    const limit = query.get('limit') ? ` limit ${Number(query.get('limit'))}` : '';
    const offset = query.get('offset') ? ` offset ${Number(query.get('offset'))}` : '';
    const { rows } = await withIdentity(uid, (tx) => tx.query(`select ${columns(query)} from ${ident(table)}${where}${orderBy(query)}${limit}${offset}`, params));
    return shape(rows);
  }
  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const cols = Array.from(new Set(list.flatMap((r) => Object.keys(r))));
    const pk = await primaryKey(table);
    const values = list.map((r, ri) => `(${cols.map((c, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`).join(', ');
    const flat = list.flatMap((r) => cols.map((c) => (r[c] === undefined ? null : r[c])));
    let sql = `insert into ${ident(table)} (${cols.map(ident).join(', ')}) values ${values}`;
    if (prefer.includes('resolution=merge-duplicates') && pk.length && pk.every((k) => cols.includes(k))) {
      const updates = cols.filter((c) => !pk.includes(c)).map((c) => `${ident(c)} = excluded.${ident(c)}`);
      sql += ` on conflict (${pk.map(ident).join(', ')}) do ${updates.length ? 'update set ' + updates.join(', ') : 'nothing'}`;
    }
    if (representation) sql += ' returning *';
    const { rows } = await withIdentity(uid, (tx) => tx.query(sql, flat));
    return representation ? shape(rows) : [201, null];
  }
  if (req.method === 'PATCH') {
    const cols = Object.keys(body);
    const sets = cols.map((c, i) => `${ident(c)} = $${params.length + i + 1}`).join(', ');
    const { rows } = await withIdentity(uid, (tx) => tx.query(`update ${ident(table)} set ${sets}${where}${representation ? ' returning *' : ''}`, [...params, ...cols.map((c) => body[c])]));
    return representation ? shape(rows) : [204, null];
  }
  if (req.method === 'DELETE') {
    const { rows } = await withIdentity(uid, (tx) => tx.query(`delete from ${ident(table)}${where}${representation ? ' returning *' : ''}`, params));
    return representation ? shape(rows) : [204, null];
  }
  return [405, { message: 'method not allowed' }];
}

// ---------------------------------------------------------------------------
// Storage subset (in-memory objects)
// ---------------------------------------------------------------------------
const objects = new Map(); // "bucket/path" -> { type, data }
function parseMultipart(buf, contentType) {
  const boundary = /boundary=([^;]+)/.exec(contentType)?.[1];
  if (!boundary) return null;
  const parts = buf.toString('binary').split(`--${boundary}`);
  for (const part of parts) {
    if (!part.includes('filename=')) continue;
    const idx = part.indexOf('\r\n\r\n');
    const headers = part.slice(0, idx);
    const type = /Content-Type:\s*([^\r\n]+)/i.exec(headers)?.[1] ?? 'application/octet-stream';
    const data = Buffer.from(part.slice(idx + 4, part.lastIndexOf('\r\n')), 'binary');
    return { type, data };
  }
  return null;
}
function storage(req, path, raw, res) {
  const pub = /^\/storage\/v1\/object\/public\/(.+)$/.exec(path);
  if (pub && req.method === 'GET') {
    const obj = objects.get(decodeURIComponent(pub[1]));
    if (!obj) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': obj.type, 'Cache-Control': 'public, max-age=3600' });
    res.end(obj.data);
    return;
  }
  const up = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(path);
  if (up && (req.method === 'POST' || req.method === 'PUT')) {
    const key = `${up[1]}/${decodeURIComponent(up[2])}`;
    const ct = req.headers['content-type'] ?? '';
    const file = ct.startsWith('multipart/') ? parseMultipart(raw, ct) : { type: ct, data: raw };
    if (!file) { json(res, 400, { error: 'bad upload' }); return; }
    objects.set(key, file);
    json(res, 200, { Key: key, Id: randomUUID() });
    return;
  }
  json(res, 404, { error: 'unsupported storage route' });
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': '*',
  });
  res.end(body === null ? '' : JSON.stringify(body));
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'OPTIONS') return json(res, 204, null);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  try {
    if (url.pathname.startsWith('/storage/')) return storage(req, url.pathname, raw, res);
    const body = raw.length && (req.headers['content-type'] ?? '').includes('json') ? JSON.parse(raw.toString()) : {};
    if (url.pathname.startsWith('/auth/')) {
      const [status, out] = await auth(req, url.pathname, url.searchParams, body);
      return json(res, status, out);
    }
    if (url.pathname.startsWith('/rest/')) {
      const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
      const claims = bearer && bearer !== ANON_KEY ? verifyJwt(bearer) : null;
      if (bearer && bearer !== ANON_KEY && !claims) return json(res, 401, { message: 'JWT expired', code: 'PGRST301' });
      const [status, out] = await rest(req, url.pathname, url.searchParams, body, claims?.sub ?? null);
      return json(res, status, out);
    }
    if (url.pathname.startsWith('/functions/')) return json(res, 503, { error: 'Edge Functions (online payments) are not available in local mode — use Cash on delivery.' });
    json(res, 404, { message: 'not found' });
  } catch (e) {
    const status = e.code === '42501' ? 403 : e.code === '28000' ? 401 : 400;
    console.error(`[api] ${req.method} ${url.pathname} → ${e.message}`);
    json(res, status, pgError(e));
  }
});

server.listen(PORT, () => {
  console.log(`\n[api] Supabase-compatible local API on http://localhost:${PORT}`);
  console.log(`[api] anon key: ${ANON_KEY}  ·  first sign-up becomes admin${ADMIN_EMAIL ? ` (or ${ADMIN_EMAIL})` : ''}\n`);
  if (process.argv.includes('--api-only')) return;
  const webPort = Number(process.env.PORT || 5173);
  const vite = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '--port', String(webPort)], {
    stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, VITE_SUPABASE_URL: `http://localhost:${PORT}`, VITE_SUPABASE_ANON_KEY: ANON_KEY, VITE_SITE_URL: `http://localhost:${webPort}` },
  });
  vite.on('exit', (code) => process.exit(code ?? 0));
});
