// Élaré API — a Neon Function (Node 24, Hono) that runs next to the database.
//
//   POST /payments/razorpay/order    create a Razorpay order for an unpaid Élaré order (JWT)
//   POST /payments/razorpay/verify   verify the checkout signature and settle the order (JWT)
//   POST /payments/razorpay/webhook  Razorpay webhook backstop (HMAC)
//   POST /uploads                    multipart upload to Object Storage (JWT; admin for product media)
//   GET  /health
//
// The browser calls this directly with `Authorization: Bearer <Neon Auth JWT>`.
// The function connects to Postgres as the database owner, which is the only
// principal allowed to execute mark_order_paid / mark_payment_failed.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Pool } from 'pg';
import { attachDatabasePool } from '@neon/functions';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const env = (k: string) => process.env[k];
const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} is not configured`);
  return v;
};

const pool = new Pool({ connectionString: need('DATABASE_URL'), max: 5 });
attachDatabasePool(pool);

const jwks = createRemoteJWKSet(new URL(need('NEON_AUTH_JWKS_URL')));
const issuer = new URL(need('NEON_AUTH_BASE_URL')).origin;

const BUCKET = env('MEDIA_BUCKET') || 'media';
const s3 = new S3Client({ forcePathStyle: true });

type Vars = { userId: string };
const app = new Hono<{ Variables: Vars }>();

const allowedOrigins = (env('ALLOWED_ORIGINS') || '*').split(',').map((s) => s.trim()).filter(Boolean);
app.use('*', cors({
  origin: (origin) => (allowedOrigins.includes('*') ? origin || '*' : allowedOrigins.includes(origin) ? origin : ''),
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Authorization', 'Content-Type'],
  maxAge: 86400,
}));

app.get('/health', (c) => c.json({ ok: true, branch: env('NEON_BRANCH') ?? null }));

/** Verifies the Neon Auth JWT and stores the user id on the context. */
const requireUser = createMiddleware<{ Variables: Vars }>(async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (!/^bearer /i.test(auth)) return c.json({ error: 'unauthorized' }, 401);
  try {
    const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer });
    if (!payload.sub) return c.json({ error: 'unauthorized' }, 401);
    c.set('userId', payload.sub);
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
const razorpayAuth = () => 'Basic ' + Buffer.from(`${need('RAZORPAY_KEY_ID')}:${need('RAZORPAY_KEY_SECRET')}`).toString('base64');
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex');
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

app.post('/payments/razorpay/order', requireUser, async (c) => {
  const { order_id } = await c.req.json<{ order_id?: string }>().catch(() => ({} as { order_id?: string }));
  if (!order_id) return c.json({ error: 'order_id required' }, 400);
  const { rows } = await pool.query(
    `select o.id, o.order_number, o.user_id, o.grand_total, o.currency, o.payment_method, o.payment_status, o.shipping_address, p.provider_order_id
     from orders o left join payments p on p.order_id = o.id and p.provider = 'razorpay' where o.id = $1`, [order_id]);
  const order = rows[0];
  if (!order) return c.json({ error: 'order not found' }, 404);
  if (order.user_id !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);
  if (order.payment_method !== 'razorpay') return c.json({ error: 'order is not an online payment' }, 400);
  if (order.payment_status === 'paid') return c.json({ error: 'order already paid' }, 409);

  let providerOrderId: string | null = order.provider_order_id;
  if (!providerOrderId) {
    if (!env('RAZORPAY_KEY_ID') || !env('RAZORPAY_KEY_SECRET')) return c.json({ error: 'Online payments are not configured yet — please choose Cash on delivery.' }, 503);
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: razorpayAuth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Math.round(Number(order.grand_total) * 100), currency: order.currency || 'INR', receipt: order.order_number, notes: { elare_order_id: order.id, order_number: order.order_number } }),
    });
    const body = (await res.json()) as { id?: string; error?: { description?: string } };
    if (!res.ok || !body.id) return c.json({ error: body?.error?.description ?? 'Razorpay order creation failed' }, 502);
    providerOrderId = body.id;
    await pool.query(`update payments set provider_order_id = $1, raw = $2 where order_id = $3 and provider = 'razorpay'`, [providerOrderId, body, order.id]);
  }
  const addr = (order.shipping_address ?? {}) as Record<string, string>;
  return c.json({
    key_id: env('RAZORPAY_KEY_ID'),
    razorpay_order_id: providerOrderId,
    amount: Math.round(Number(order.grand_total) * 100),
    currency: order.currency || 'INR',
    order_number: order.order_number,
    prefill: { name: addr.full_name, email: addr.email, contact: addr.phone },
  });
});

app.post('/payments/razorpay/verify', requireUser, async (c) => {
  const b = await c.req.json<Record<string, string>>().catch(() => ({} as Record<string, string>));
  const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
  if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return c.json({ error: 'missing fields' }, 400);
  const expected = hmac(need('RAZORPAY_KEY_SECRET'), `${razorpay_order_id}|${razorpay_payment_id}`);
  if (!safeEqual(expected, String(razorpay_signature))) return c.json({ error: 'invalid signature' }, 400);
  const { rows } = await pool.query(`select p.provider_order_id, o.user_id from payments p join orders o on o.id = p.order_id where p.order_id = $1 and p.provider = 'razorpay'`, [order_id]);
  if (!rows[0] || rows[0].provider_order_id !== razorpay_order_id) return c.json({ error: 'payment mismatch' }, 400);
  if (rows[0].user_id !== c.get('userId')) return c.json({ error: 'forbidden' }, 403);
  const r = await pool.query(`select mark_order_paid($1, $2, $3, $4) as r`, [order_id, razorpay_order_id, razorpay_payment_id, { source: 'checkout-verify', razorpay_payment_id }]);
  return c.json({ ok: true, ...r.rows[0].r });
});

app.post('/payments/razorpay/webhook', async (c) => {
  const secret = env('RAZORPAY_WEBHOOK_SECRET');
  if (!secret) return c.json({ error: 'webhook secret not configured' }, 503);
  const raw = await c.req.text();
  const signature = c.req.header('x-razorpay-signature') ?? '';
  if (!safeEqual(hmac(secret, raw), signature)) return c.json({ error: 'invalid signature' }, 400);
  const event = JSON.parse(raw) as { event: string; payload?: { payment?: { entity?: { id: string; order_id?: string } } } };
  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id) return c.json({ ok: true, ignored: true });
  const { rows } = await pool.query(`select order_id from payments where provider_order_id = $1 and provider = 'razorpay'`, [payment.order_id]);
  if (!rows[0]) return c.json({ ok: true, ignored: 'unknown order' });
  if (event.event === 'payment.captured') {
    await pool.query(`select mark_order_paid($1, $2, $3, $4)`, [rows[0].order_id, payment.order_id, payment.id, event]);
  } else if (event.event === 'payment.failed') {
    await pool.query(`select mark_payment_failed($1, $2)`, [rows[0].order_id, event]);
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Uploads → Neon Object Storage (public_read bucket)
// ---------------------------------------------------------------------------
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']);

app.post('/uploads', requireUser, async (c) => {
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('file');
  const scope = String(form?.get('scope') ?? 'review');
  if (!(file instanceof File)) return c.json({ error: 'file required' }, 400);
  if (file.size > MAX_BYTES) return c.json({ error: 'File is larger than 10 MB' }, 413);
  if (!ALLOWED.has(file.type)) return c.json({ error: `Unsupported type ${file.type}` }, 415);
  if (scope !== 'product' && scope !== 'review') return c.json({ error: 'invalid scope' }, 400);

  const userId = c.get('userId');
  if (scope === 'product') {
    const { rows } = await pool.query(`select role, status from profiles where id = $1`, [userId]);
    if (rows[0]?.role !== 'admin' || rows[0]?.status !== 'active') return c.json({ error: 'forbidden' }, 403);
  }
  if (!env('AWS_ENDPOINT_URL_S3')) return c.json({ error: 'Object storage is not configured' }, 503);

  const ext = (file.name.split('.').pop() || file.type.split('/')[1] || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = scope === 'product' ? `products/${randomUUID()}.${ext}` : `reviews/${userId}/${randomUUID()}.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: Buffer.from(await file.arrayBuffer()),
    ContentType: file.type,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return c.json({ key, url: `${need('AWS_ENDPOINT_URL_S3').replace(/\/$/, '')}/${BUCKET}/${key}` });
});

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'internal error' }, 500);
});

export default app;
