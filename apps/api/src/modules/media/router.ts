import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { UPLOAD_LIMITS } from '@elare/config';
import { HttpError } from '../../lib/http';
import { asCaller } from '../../lib/db';
import { objectKey, putObject, storageConfigured } from '../../lib/storage';
import { requireAuth, userOf, type Env } from '../../middleware';

const ALLOWED = new Set<string>(UPLOAD_LIMITS.mimeTypes);

/**
 * Uploads to the public_read media bucket. Customers may attach review photos
 * under their own prefix; product media requires an admin.
 */
export const mediaRouter = new Hono<Env>()
  .use('*', requireAuth)
  .post('/uploads', async (c) => {
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    const scope = String(form?.get('scope') ?? 'review');
    if (!(file instanceof File)) throw new HttpError(400, 'file required');
    if (file.size > UPLOAD_LIMITS.maxBytes) throw new HttpError(413, 'File is larger than 10 MB');
    if (!ALLOWED.has(file.type)) throw new HttpError(415, `Unsupported type ${file.type}`);
    if (scope !== 'product' && scope !== 'review') throw new HttpError(400, 'invalid scope');
    const user = userOf(c);
    if (scope === 'product') {
      const ok = await asCaller(user, async (tx) => (await tx.execute(sql`select is_admin() as ok`)).rows[0]?.ok === true);
      if (!ok) throw new HttpError(403, 'You do not have permission to do that.', 'forbidden');
    }
    if (!storageConfigured()) throw new HttpError(503, 'Object storage is not configured', 'not_configured');
    const key = objectKey(scope, user.id, file.name, file.type);
    return c.json(await putObject(key, Buffer.from(await file.arrayBuffer()), file.type), 201);
  });
