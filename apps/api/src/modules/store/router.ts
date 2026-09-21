import { Hono } from 'hono';
import { newsletterSchema } from '@elare/validation';
import { body } from '../../lib/http';
import { call } from '../../lib/db';
import type { Env } from '../../middleware';

/** Public storefront configuration and the home page payload. */
export const storeRouter = new Hono<Env>()
  .get('/config', async (c) => c.json(await call(c.get('caller'), 'get_store_config')))
  .get('/home', async (c) => c.json(await call(c.get('caller'), 'get_home')))
  .post('/newsletter', async (c) => {
    const { email, source } = await body(c, newsletterSchema);
    return c.json(await call(c.get('caller'), 'subscribe_newsletter', { p_email: email, p_source: source ?? 'footer' }));
  });
