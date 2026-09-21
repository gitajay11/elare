/** Reads an optional environment variable. */
export const env = (k: string): string | undefined => process.env[k];

/** Reads a required environment variable, failing loudly at first use. */
export const need = (k: string): string => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not configured`);
  return v;
};
