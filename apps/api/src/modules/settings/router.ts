import { Hono } from 'hono';
import { settingSchema } from '@elare/validation';
import { body } from '../../lib/http';
import { call } from '../../lib/db';
import { requireAdmin, type Env } from '../../middleware';

/** Admin store settings (loyalty, shipping, tax, social proof, store details). */
export const adminSettingsRouter = new Hono<Env>()
  .use('*', requireAdmin)
  .get('/', async (c) => c.json(await call(c.get('caller'), 'admin_settings')))
  .put('/', async (c) => {
    const { key, value } = await body(c, settingSchema);
    return c.json(await call(c.get('caller'), 'admin_update_setting', { p_key: key, p_value: value }));
  });
