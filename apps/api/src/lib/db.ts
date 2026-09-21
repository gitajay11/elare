import { withCaller, asSystem, rpc as dbRpc, jsonArg, type Caller, type Tx } from '@elare/db';
import { sql } from 'drizzle-orm';
import { fromDbError, HttpError } from './http';

export type { Caller, Tx };

/**
 * Runs `fn` as the request's caller (RLS + auth.uid() apply) and converts any
 * Postgres error into an HttpError.
 */
export async function asCaller<T>(caller: Caller | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await withCaller(caller, fn);
  } catch (e) {
    throw e instanceof HttpError ? e : fromDbError(e);
  }
}

/** Runs `fn` as the database owner. Only for payment settlement and webhooks. */
export async function asOwner<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await asSystem(fn);
  } catch (e) {
    throw e instanceof HttpError ? e : fromDbError(e);
  }
}

/** Calls one SQL business function as the caller and returns its JSON result. */
export function call<T>(caller: Caller | null, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  return asCaller(caller, (tx) => dbRpc<T>(tx, fn, args));
}

export const rpc = dbRpc;
export { jsonArg };
export { sql };
