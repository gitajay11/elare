// Élaré API — a Neon Function (Node 24, Hono) running next to the database.
//
// Both sites (storefront on the main domain, admin on its subdomain) talk only
// to this API with `Authorization: Bearer <Neon Auth JWT>`. Every request runs
// in a Postgres transaction that impersonates the caller (role + JWT claims),
// so the SQL business functions and RLS policies apply exactly as they would
// for a direct Data API call — the API cannot accidentally bypass them.
//
//   Public       GET  /health, /store/*, /products/*, POST /cart/quote
//   Customer     /auth/*, /cart, /wishlist/*, /checkout/*, /orders/*, /reviews/*, /loyalty, /coupons/mine, /payments/*, /media/uploads
//   Admin        /admin/{dashboard,products,categories,inventory,orders,customers,coupons,gift-rules,reviews,settings}
import { Hono } from 'hono';
import { attachDatabasePool } from '@neon/functions';
import { getPool } from '@elare/db';
import { env } from './lib/env';
import { HttpError } from './lib/http';
import { corsMiddleware, optionalAuth, type Env } from './middleware';
import * as m from './modules';

attachDatabasePool(getPool());

const app = new Hono<Env>();

app.use('*', corsMiddleware());
app.get('/health', (c) => c.json({ ok: true, branch: env('NEON_BRANCH') ?? null }));
app.use('*', optionalAuth);

// Public + customer
app.route('/store', m.storeRouter);
app.route('/products', m.productsRouter);
app.route('/auth', m.authRouter);
app.route('/cart', m.cartRouter);
app.route('/wishlist', m.wishlistRouter);
app.route('/checkout', m.checkoutRouter);
app.route('/orders', m.ordersRouter);
app.route('/payments', m.paymentsRouter);
app.route('/coupons', m.couponsRouter);
app.route('/loyalty', m.loyaltyRouter);
app.route('/reviews', m.reviewsRouter);
app.route('/media', m.mediaRouter);

// Admin back-office
app.route('/admin', m.adminAnalyticsRouter);
app.route('/admin/products', m.adminProductsRouter);
app.route('/admin/categories', m.adminCategoriesRouter);
app.route('/admin/inventory', m.adminInventoryRouter);
app.route('/admin/orders', m.adminOrdersRouter);
app.route('/admin/customers', m.adminCustomersRouter);
app.route('/admin/coupons', m.adminCouponsRouter);
app.route('/admin/gift-rules', m.adminGiftRulesRouter);
app.route('/admin/reviews', m.adminReviewsRouter);
app.route('/admin/settings', m.adminSettingsRouter);

app.notFound((c) => c.json({ error: 'Not found', code: 'not_found' }, 404));
app.onError((err, c) => {
  if (err instanceof HttpError) {
    if (err.status >= 500) console.error(`[api] ${c.req.method} ${c.req.path} → ${err.status} ${err.code ?? ''}: ${err.message}`);
    return c.json({ error: err.message, code: err.code }, err.status as 400);
  }
  console.error(err);
  return c.json({ error: 'Something went wrong on our side. Please try again.', code: 'internal' }, 500);
});

export default app;
