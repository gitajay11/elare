/** Auth routes and helpers for linking to them. */
export const SIGN_IN = '/signin';
export const CREATE_ACCOUNT = '/signup';

const isAuthPath = (p: string) => /^\/(signin|signup|createaccount|auth)(\/|\?|$)/.test(p);

/** Where to send a signed-out visitor; `next` is dropped when it would be pointless. */
export function signInPath(next?: string | null): string {
  return next && next !== '/' && !isAuthPath(next) ? `${SIGN_IN}?next=${encodeURIComponent(next)}` : SIGN_IN;
}
export function createAccountPath(next?: string | null): string {
  return next && next !== '/' && !isAuthPath(next) ? `${CREATE_ACCOUNT}?next=${encodeURIComponent(next)}` : CREATE_ACCOUNT;
}
