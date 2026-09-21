import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema/index';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Identity of the caller a request runs as. `null` = anonymous visitor. */
export interface Caller {
  id: string;
  email?: string | null;
}

let pool: pg.Pool | undefined;
let db: Db | undefined;

/** Lazily-created pooled connection to the Neon branch in DATABASE_URL. */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({ connectionString, ssl: { rejectUnauthorized: true }, max: 4 });
  }
  return pool;
}

export function getDb(): Db {
  if (!db) db = drizzle(getPool(), { schema });
  return db;
}

/**
 * Runs `fn` inside a transaction that impersonates the caller the same way the
 * Neon Data API does: the connection switches to the `authenticated` /
 * `anonymous` role and `request.jwt.claims` carries the subject, so
 * `auth.uid()`, the SQL business functions and every RLS policy behave exactly
 * as they do for direct Data API calls. The owner role is restored when the
 * transaction ends.
 */
export async function withCaller<T>(caller: Caller | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    const role = caller ? 'authenticated' : 'anonymous';
    const claims = JSON.stringify(caller ? { sub: caller.id, email: caller.email ?? undefined, role } : { role });
    await tx.execute(sql`select set_config('request.jwt.claims', ${claims}, true)`);
    await tx.execute(sql.raw(`set local role ${role}`));
    return fn(tx);
  });
}

/** Runs `fn` as the database owner (no RLS) — for webhooks and system jobs only. */
export async function asSystem<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}

/** Marks an argument that must be sent as JSON text (for jsonb parameters that are arrays). */
export class JsonArg {
  constructor(public value: unknown) {}
}
export const jsonArg = (value: unknown) => new JsonArg(value);

/**
 * Calls a SQL function with named arguments and returns its (scalar or json)
 * result. Plain objects are sent as JSON (node-postgres does that itself);
 * arrays are sent as Postgres arrays unless wrapped in `jsonArg`, and
 * Postgres infers each parameter's type from the function signature.
 */
export async function rpc<T = unknown>(tx: Tx, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const parts = Object.entries(args).map(([k, v]) => {
    const value = v instanceof JsonArg ? JSON.stringify(v.value) : v === undefined ? null : v;
    return sql`${sql.raw(k)} := ${sql.param(value)}`;
  });
  const query = sql`select ${sql.raw(name)}(${sql.join(parts, sql`, `)}) as r`;
  const res = await tx.execute(query);
  return (res.rows[0] as { r: T }).r;
}
