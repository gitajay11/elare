/**
 * Account password rules, shared by sign-up, the reset form (live checklist)
 * and the API (the final say, via @elare/validation). Neon Auth itself accepts
 * 8–128 characters.
 */
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'letter', label: 'A letter', test: (p: string) => /\p{L}/u.test(p) },
  { id: 'number', label: 'A number', test: (p: string) => /\d/.test(p) },
] as const;

export const PASSWORD_MAX = 128;
export const PASSWORD_HINT = 'Use at least 8 characters, including a letter and a number.';

/** The first unmet rule as a sentence, or null when the password is acceptable. */
export function passwordProblem(p: string): string | null {
  if (!p) return 'Enter a password.';
  if (p.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (!PASSWORD_RULES.every((r) => r.test(p))) return PASSWORD_HINT;
  return null;
}

/** A light shape check for forms (the server validates properly). */
export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
