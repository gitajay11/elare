// Runs the Neon migrations inside PGlite (Postgres compiled to WASM) and
// exercises the business-logic functions end to end: catalogue, pricing,
// coupons, free gift, ordering, inventory, loyalty, reviews, wishlist
// redemption, admin operations and RLS. No network, no Neon project needed.
//
//   pnpm db:test

import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const db = new PGlite({ extensions: { pg_trgm, pgcrypto } });

let passed = 0;
let failed = 0;
function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}${extra !== undefined ? ' → ' + JSON.stringify(extra) : ''}`); }
}
async function expectError(fn, needle, label) {
  try { await fn(); ok(false, label, 'no error thrown'); }
  catch (e) { ok(String(e.message).includes(needle), label, e.message); }
}
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
const rpc = async (fn, args = {}) => {
  const keys = Object.keys(args);
  const sql = `select ${fn}(${keys.map((k, i) => `${k} := $${i + 1}`).join(', ')}) as r`;
  return (await one(sql, keys.map((k) => args[k]))).r;
};
const as = (uid) => db.query(`select set_config('app.uid', $1, false)`, [uid ?? '']);

// ---------------------------------------------------------------------------
// Neon platform stubs: the neon_auth schema (Managed Better Auth), the auth.*
// helpers the Data API provides (uid/jwt from the request JWT) and its roles.
// ---------------------------------------------------------------------------
await db.exec(`
  create schema neon_auth;
  create table neon_auth."user" (id uuid primary key default gen_random_uuid(), name text, email text unique, "emailVerified" boolean default false, "createdAt" timestamptz default now());
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create function auth.user_id() returns text language sql stable as $$ select nullif(current_setting('app.uid', true), '') $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub', nullif(current_setting('app.uid', true), '')) $$;
  create role anonymous nologin; create role authenticated nologin;
`);

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
for (const d of ['migrations', 'seed']) for (const f of readdirSync(join(root, d)).filter((f) => f.endsWith('.sql')).sort()) {
  const t = Date.now();
  try {
    await db.exec(readFileSync(join(root, d, f), 'utf8'));
    console.log(`migration ${f} ok (${Date.now() - t} ms)`);
  } catch (e) {
    console.error(`migration ${f} FAILED: ${e.message}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
console.log('\n# users & profiles');
const admin = await one(`insert into neon_auth."user" (email, name) values ('admin@elare.test', 'Élaré Admin') returning id`);
const cust = await one(`insert into neon_auth."user" (email, name) values ('priya@example.com', 'Priya Sharma') returning id`);
const cust2 = await one(`insert into neon_auth."user" (email, name) values ('ananya@example.com', 'Ananya Rao') returning id`);
// Profiles are created lazily on first authenticated call (ensure_profile / require_user).
await as(admin.id); await rpc('ensure_profile');
await as(cust.id); const priya = await rpc('ensure_profile', { p_phone: '9876543210' });
await as(cust2.id); await rpc('ensure_profile');
await as(null);
ok(priya.full_name === 'Priya Sharma' && priya.phone === '9876543210', 'ensure_profile copies name from neon_auth and stores phone', priya);
await db.query(`update profiles set role = 'admin' where id = $1`, [admin.id]);
ok((await one(`select count(*)::int as c from profiles`)).c === 3, 'profiles created for every auth user');
ok((await one(`select count(*)::int as c from loyalty_accounts`)).c === 3, 'loyalty accounts created with profiles');
ok((await one(`select count(*)::int as c from wishlists`)).c === 3, 'wishlists created with profiles');

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
console.log('\n# catalogue');
await as(null);
const cfg = await rpc('get_store_config');
ok(cfg.categories.length === 4, 'store config lists 4 categories');
ok(cfg.gift_rule && cfg.gift_rule.min_quantity === 6, 'gift rule exposed in config', cfg.gift_rule);
ok(!('wishlist_redeem_max_price' in cfg.loyalty), 'internal loyalty settings not exposed');

const home = await rpc('get_home');
ok(home.signature.length === 5, 'home: 5 signature combos', home.signature.length);
ok(home.best_sellers.length > 0 && home.best_sellers.every((p) => p.units_sold === 0), 'home: best sellers have honest zero sales before orders');
ok(home.bought_together.length === 3 && home.bought_together[0].count === 0, 'home: FBT falls back to bundle relationships without order data');
ok(home.review_summary.count === 0, 'home: no fabricated reviews');

const lips = await rpc('list_products', { p_category: 'lips' });
ok(lips.total === 10 && lips.items.every((p) => !p.is_gift_only), 'lips category lists 10 purchasable products (gift-only hidden)', lips.total);
ok(lips.facets.shade.length > 0 && lips.facets.finish.includes('Satin'), 'facets computed', lips.facets.finish);
const eyesWp = await rpc('list_products', { p_category: 'eyes', p_filters: { waterproof: 'true' } });
ok(eyesWp.items.every((p) => ['precision-liquid-eyeliner', 'kohl-pencil-eyeliner', 'elare-waterproof-mascara', 'brow-define-pencil'].includes(p.slug)), 'waterproof filter works', eyesWp.items.map((p) => p.slug));
const eyesNwp = await rpc('list_products', { p_category: 'eyes', p_filters: { waterproof: 'false' } });
ok(eyesNwp.items.some((p) => p.slug === 'elare-non-waterproof-mascara') && !eyesNwp.items.some((p) => p.slug === 'elare-waterproof-mascara'), 'non-waterproof filter works');
const cheap = await rpc('list_products', { p_filters: { price_max: 500 }, p_sort: 'price_asc' });
ok(cheap.items.every((p) => Number(p.price) <= 500) && Number(cheap.items[0].price) <= Number(cheap.items[1].price), 'price filter + sort');
const paged = await rpc('list_products', { p_page: 2, p_page_size: 5 });
ok(paged.items.length === 5 && paged.page === 2, 'pagination');
const search = await rpc('list_products', { p_query: 'ruby' });
ok(search.items.some((p) => p.slug === 'signature-lipstick'), 'search by shade name finds the lipstick', search.items.map((p) => p.slug));
const sug = await rpc('search_suggest', { p_query: 'masc' });
ok(sug.products.length >= 2 && sug.categories.some((c) => c.subcategory === 'mascara'), 'instant suggestions (products + category)', sug);

const pdp = await rpc('get_product', { p_slug: 'lip-edit-01-rose-nude' });
ok(pdp.bundle_items.length === 3, 'combo exposes its 3 bundle components', pdp.bundle_items.map((b) => b.product_name));
ok(pdp.variants.length === 1 && pdp.variants[0].in_stock === true, 'combo variant in stock');
ok(pdp.coupons.some((c) => c.code === 'LIPLOVE15'), 'category-scoped public coupon shown on lip product');
ok(pdp.can_review === false, 'anonymous cannot review');
const liner = await rpc('get_product', { p_slug: 'precision-liquid-eyeliner' });
ok(liner.variants.length === 6 && liner.shades.length === 3, 'eyeliner has 3 shades × 2 (waterproof) = 6 variants');
ok((await rpc('get_product', { p_slug: 'mini-lip-balm-gift' })) !== null, 'gift product exists');
ok((await rpc('get_product', { p_slug: 'nope' })) === null, 'unknown slug returns null');

// ---------------------------------------------------------------------------
// Pricing engine
// ---------------------------------------------------------------------------
console.log('\n# quote_cart');
const v = async (slug, i = 0) => (await q(`select v.id, coalesce(v.price_override, p.price)::float as price from product_variants v join products p on p.id = v.product_id where p.slug = $1 order by v.sort_order`, [slug]))[i];
const lipstick = await v('signature-lipstick');
const liner1 = await v('signature-lip-liner');
const gloss = await v('signature-lip-gloss');
const blush = await v('cheek-bloom-blush');
const sponge3 = await v('velvet-blending-sponge', 1);
const gift = await v('mini-lip-balm-gift');

let quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 2 }] });
ok(quote.ok && quote.subtotal === 1798 && quote.shipping === 0, 'quote: 2 lipsticks, free shipping above ₹999', quote);
quote = await rpc('quote_cart', { p_items: [{ variant_id: liner1.id, quantity: 1 }] });
ok(quote.subtotal === 549 && quote.shipping === 79 && quote.total === 628, 'quote: flat shipping under threshold', quote);
ok(quote.points_to_earn === 54, 'quote: points preview at 0.1/₹', quote.points_to_earn);

quote = await rpc('quote_cart', { p_items: [{ variant_id: sponge3.id, quantity: 1 }] });
ok(quote.subtotal === 749, 'quote: variant price override honoured', quote.subtotal);

quote = await rpc('quote_cart', { p_items: [{ variant_id: gift.id, quantity: 1 }] });
ok(!quote.ok && quote.issues[0].code === 'unavailable', 'quote: gift-only product cannot be bought');

quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 500 }] });
ok(quote.lines[0].quantity === 10 && quote.ok, 'quote: quantity capped at max per line');

quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 1 }, { variant_id: liner1.id, quantity: 1 }], p_coupon_code: 'welcome10' });
ok(quote.coupon.valid && quote.coupon.discount === 144.8, 'coupon: WELCOME10 10% (case-insensitive)', quote.coupon);
quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_coupon_code: 'ELARE200' });
ok(!quote.coupon.valid && quote.coupon.message.includes('Add ₹1100.00 more'), 'coupon: minimum order message', quote.coupon);
quote = await rpc('quote_cart', { p_items: [{ variant_id: blush.id, quantity: 2 }], p_coupon_code: 'LIPLOVE15' });
ok(!quote.coupon.valid && quote.coupon.message.includes('does not apply'), 'coupon: category scope rejects non-lip cart', quote.coupon);
quote = await rpc('quote_cart', { p_items: [{ variant_id: blush.id, quantity: 1 }, { variant_id: lipstick.id, quantity: 1 }], p_coupon_code: 'LIPLOVE15' });
ok(quote.coupon.valid && quote.coupon.discount === 134.85, 'coupon: category scope discounts only lip lines', quote.coupon);
quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_coupon_code: 'BOGUS' });
ok(!quote.coupon.valid && quote.coupon.message.includes('not valid'), 'coupon: unknown code');

// free-shipping coupon: nothing off the items, shipping line becomes 0
await db.query(`insert into coupons (code, description, type, value, per_user_limit, is_active) values ('FREESHIP', 'Free delivery', 'free_shipping', 0, 5, true)`);
quote = await rpc('quote_cart', { p_items: [{ variant_id: liner1.id, quantity: 1 }] });
const shipBefore = quote.shipping;
ok(shipBefore > 0, 'shipping: charged below the free-delivery threshold', quote.shipping);
quote = await rpc('quote_cart', { p_items: [{ variant_id: liner1.id, quantity: 1 }], p_coupon_code: 'freeship' });
ok(quote.coupon.valid && quote.coupon.free_shipping === true && quote.coupon.discount === 0, 'coupon: free_shipping is valid with no discount', quote.coupon);
ok(quote.shipping === 0 && quote.total === quote.subtotal, 'coupon: free_shipping zeroes the shipping line', { shipping: quote.shipping, total: quote.total, subtotal: quote.subtotal });

// set_total coupon: bag becomes ₹1 all-in
await db.query(`insert into coupons (code, description, type, value, per_user_limit, is_active) values ('TESTPAY', 'Pay ₹1', 'set_total', 1, 5, true)`);
quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 2 }, { variant_id: liner1.id, quantity: 1 }], p_coupon_code: 'testpay' });
ok(quote.coupon.valid && quote.coupon.free_shipping === true && quote.coupon.discount === quote.subtotal - 1, 'coupon: set_total discounts down to ₹1', quote.coupon);
ok(quote.shipping === 0 && quote.total === 1, 'coupon: set_total total is exactly ₹1', { shipping: quote.shipping, total: quote.total });

// free gift
quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 3 }, { variant_id: liner1.id, quantity: 2 }] });
ok(!quote.gift.unlocked && quote.gift.next.remaining === 1, 'gift: 5 items → 1 more to unlock', quote.gift);
quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 3 }, { variant_id: liner1.id, quantity: 3 }] });
ok(quote.gift.unlocked && quote.lines.some((l) => l.is_gift && l.unit_price === 0), 'gift: 6 items unlock a ₹0 gift line', quote.gift);
ok(quote.item_count === 6 && quote.subtotal === 4344, 'gift: does not count toward totals');

// points without balance
await as(cust.id);
quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_redeem_points: 500 });
ok(quote.points.applied === 0 && quote.points.message.includes('only have 0'), 'points: cannot redeem more than balance', quote.points);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
console.log('\n# place_order');
const address = { full_name: 'Priya Sharma', phone: '9876543210', email: 'priya@example.com', line1: '12 Rose Lane', city: 'Bengaluru', state: 'Karnataka', postal_code: '560001' };
await as(null);
await expectError(() => rpc('place_order', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_address: address, p_payment_method: 'cod' }), 'authentication required', 'guest cannot place order');
await as(cust.id);
await expectError(() => rpc('place_order', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_address: { full_name: 'x' }, p_payment_method: 'cod' }), 'delivery address', 'incomplete address rejected');
await expectError(() => rpc('place_order', { p_items: [], p_address: address, p_payment_method: 'cod' }), 'empty', 'empty bag rejected');
await expectError(() => rpc('place_order', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_address: address, p_payment_method: 'cod', p_coupon_code: 'BOGUS' }), 'not valid', 'invalid coupon blocks order');

const stockBefore = (await one(`select quantity from inventory where variant_id = $1`, [lipstick.id])).quantity;
const order1 = await rpc('place_order', {
  p_items: [{ variant_id: lipstick.id, quantity: 3 }, { variant_id: liner1.id, quantity: 3 }],
  p_address: address, p_payment_method: 'cod', p_coupon_code: 'WELCOME10',
});
ok(order1.order_number.startsWith('EB-') && order1.status === 'confirmed', 'COD order placed & confirmed', order1);
ok(order1.grand_total === 3944, 'total = 4344 − 400 (capped 10%) + free shipping', order1.grand_total);
const stockAfter = (await one(`select quantity from inventory where variant_id = $1`, [lipstick.id])).quantity;
ok(stockBefore - stockAfter === 3, 'inventory decremented by 3');
ok((await one(`select quantity from inventory where variant_id = $1`, [gift.id])).quantity === 499, 'gift stock decremented');
ok((await one(`select count(*)::int as c from free_gifts where order_id = $1`, [order1.order_id])).c === 1, 'free gift recorded');
ok((await one(`select count(*)::int as c from coupon_usage where order_id = $1`, [order1.order_id])).c === 1, 'coupon usage recorded');
ok((await one(`select count(*)::int as c from order_status_history where order_id = $1`, [order1.order_id])).c === 1, 'status history journaled on insert');
ok((await one(`select count(*)::int as c from inventory_movements where reference = $1`, [order1.order_number])).c === 3, 'movement log written per line');

let o = await rpc('get_order', { p_order_id: order1.order_id });
ok(o.items.length === 3 && o.items.filter((i) => i.is_gift).length === 1, 'get_order includes gift line');
ok(o.points_earned === 433 && o.points_awarded === false, 'points earned computed, not yet awarded', o.points_earned);

quote = await rpc('quote_cart', { p_items: [{ variant_id: lipstick.id, quantity: 1 }], p_coupon_code: 'WELCOME10' });
ok(!quote.coupon.valid && quote.coupon.message.includes('already used'), 'per-user coupon limit enforced', quote.coupon);

// customer cannot see others' orders
await as(cust2.id);
ok((await rpc('get_order', { p_order_id: order1.order_id })) === null, 'other customer cannot read the order');
await as(cust.id);

// razorpay path stays pending until the edge function settles it
const order2 = await rpc('place_order', { p_items: [{ variant_id: blush.id, quantity: 1 }], p_address: address, p_payment_method: 'razorpay' });
ok(order2.status === 'pending', 'online order starts pending');
ok((await one(`select status from payments where order_id = $1`, [order2.order_id])).status === 'pending', 'payment row pending');
const paid = await rpc('mark_order_paid', { p_order_id: order2.order_id, p_provider_order_id: 'order_test', p_provider_payment_id: 'pay_test' });
ok(paid.already === false && (await one(`select status, payment_status from orders where id = $1`, [order2.order_id])).status === 'confirmed', 'mark_order_paid confirms order');
ok((await rpc('mark_order_paid', { p_order_id: order2.order_id, p_provider_order_id: 'order_test', p_provider_payment_id: 'pay_test' })).already === true, 'mark_order_paid is idempotent');

const myOrders = await rpc('list_my_orders');
ok(myOrders.total === 2 && myOrders.items[0].order_number === order2.order_number, 'list_my_orders newest first');

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
console.log('\n# order lifecycle');
await expectError(() => rpc('admin_update_order', { p_order_id: order1.order_id, p_status: 'shipped' }), 'forbidden', 'customer cannot run admin transitions');
await as(admin.id);
await expectError(() => rpc('admin_update_order', { p_order_id: order1.order_id, p_status: 'delivered' }), 'Cannot move', 'invalid transition rejected');
for (const s of ['processing', 'packed', 'shipped', 'out_for_delivery']) {
  o = await rpc('admin_update_order', { p_order_id: order1.order_id, p_status: s, p_note: `→ ${s}` });
}
o = await rpc('admin_update_order', { p_order_id: order1.order_id, p_tracking_number: 'BLR123', p_carrier: 'BlueDart' });
ok(o.status === 'out_for_delivery' && o.tracking_number === 'BLR123', 'tracking saved', o.tracking_number);
o = await rpc('admin_update_order', { p_order_id: order1.order_id, p_status: 'delivered' });
ok(o.status === 'delivered' && o.payment_status === 'paid' && o.points_awarded === true, 'delivered: COD marked paid, points awarded');
ok(o.history.length === 6 && o.history[1].note === '→ processing', 'history has 6 entries with notes', o.history.length);
let acct = await one(`select * from loyalty_accounts where user_id = $1`, [cust.id]);
ok(acct.available_points === 433 && acct.lifetime_points === 433, 'loyalty balance credited', acct);

await as(cust.id);
await expectError(() => rpc('cancel_my_order', { p_order_id: order1.order_id }), 'no longer be cancelled', 'delivered order cannot be cancelled');
const stockBeforeCancel = (await one(`select quantity from inventory where variant_id = $1`, [blush.id])).quantity;
o = await rpc('cancel_my_order', { p_order_id: order2.order_id, p_reason: 'Changed my mind' });
ok(o.status === 'cancelled' && o.payment_status === 'refunded' && o.cancel_reason === 'Changed my mind', 'customer cancellation');
ok((await one(`select quantity from inventory where variant_id = $1`, [blush.id])).quantity === stockBeforeCancel + 1, 'cancellation restocks');

// ---------------------------------------------------------------------------
// Reviews (only after delivery)
// ---------------------------------------------------------------------------
console.log('\n# reviews');
await as(cust2.id);
const lipstickProduct = await one(`select id from products where slug = 'signature-lipstick'`);
await expectError(() => rpc('submit_review', { p_product_id: lipstickProduct.id, p_rating: 5, p_title: 'Love', p_body: 'Beautiful colour and finish.' }), 'delivered', 'non-purchaser cannot review');
await as(cust.id);
const rev = await rpc('submit_review', { p_product_id: lipstickProduct.id, p_rating: 5, p_title: 'Love it', p_body: 'Beautiful colour and a comfortable satin finish.' });
ok(rev.is_verified === true && rev.status === 'approved', 'verified purchaser review approved');
const pdp2 = await rpc('get_product', { p_slug: 'signature-lipstick' });
ok(pdp2.product.rating === 5 && pdp2.product.review_count === 1 && pdp2.reviews[0].author === 'Priya S.', 'rating aggregated from real review; author anonymised', pdp2.reviews[0]);
ok(pdp2.my_review && pdp2.my_review.rating === 5, 'my_review returned');
ok(pdp2.product.units_sold === 3 && pdp2.product.recent_buyers === 1, 'delivered order counts as a real sale', [pdp2.product.units_sold, pdp2.product.recent_buyers]);
ok((await rpc('reviewable_products')).length === 1, 'liner still reviewable, lipstick already reviewed');
await as(admin.id);
await db.query(`update reviews set status = 'hidden' where id = $1`, [rev.id]);
ok((await rpc('get_product', { p_slug: 'signature-lipstick' })).product.review_count === 0, 'hidden review excluded from aggregates');
await db.query(`update reviews set status = 'approved' where id = $1`, [rev.id]);

// refund flow
await as(cust.id);
o = await rpc('request_refund', { p_order_id: order1.order_id, p_reason: 'Shade did not suit me' });
ok(o.status === 'refund_requested', 'refund requested');
await as(admin.id);
o = await rpc('admin_update_order', { p_order_id: order1.order_id, p_status: 'refund_initiated' });
o = await rpc('admin_update_order', { p_order_id: order1.order_id, p_status: 'refunded' });
ok(o.status === 'refunded' && o.payment_status === 'refunded', 'refund completed');
acct = await one(`select * from loyalty_accounts where user_id = $1`, [cust.id]);
ok(acct.available_points === 0, 'refund reverses earned points', acct);
await as(null);
ok((await rpc('get_product', { p_slug: 'signature-lipstick' })).product.units_sold === 0, 'refunded order no longer counts as a sale');


// ---------------------------------------------------------------------------
// Wishlist + points redemption
// ---------------------------------------------------------------------------
console.log('\n# wishlist & redemption');
await as(cust.id);
const blushProduct = await one(`select id from products where slug = 'cheek-bloom-blush'`);
let w = await rpc('toggle_wishlist', { p_product_id: blushProduct.id });
ok(w.added === true && w.count === 1, 'wishlist add');
let wl = await rpc('get_wishlist');
ok(wl.items.length === 1 && wl.items[0].points_required === 2996 && wl.items[0].redeemable === true, 'wishlist item shows points required', wl.items[0]);
const addr = await one(`insert into addresses (user_id, full_name, phone, line1, city, state, postal_code, is_default) values ($1, 'Priya Sharma', '9876543210', '12 Rose Lane', 'Bengaluru', 'Karnataka', '560001', true) returning id`, [cust.id]);
await expectError(() => rpc('redeem_wishlist_item', { p_product_id: blushProduct.id, p_variant_id: blush.id, p_address_id: addr.id }), 'need 2996 points', 'insufficient points rejected');
await as(admin.id);
await rpc('admin_adjust_points', { p_user_id: cust.id, p_points: 3000, p_description: 'Goodwill credit' });
await as(cust.id);
const red = await rpc('redeem_wishlist_item', { p_product_id: blushProduct.id, p_variant_id: blush.id, p_address_id: addr.id });
ok(red.points_used === 2996, 'wishlist product redeemed for points', red);
acct = await one(`select * from loyalty_accounts where user_id = $1`, [cust.id]);
ok(acct.available_points === 4 && acct.redeemed_points === 2996, 'points deducted', acct);
o = await rpc('get_order', { p_order_id: red.order_id });
ok(o.payment_method === 'points' && o.grand_total === 0 && o.status === 'confirmed', 'points order is ₹0 and confirmed');
ok((await rpc('get_wishlist')).items.length === 0, 'redeemed item removed from wishlist');
const loy = await rpc('get_my_loyalty');
ok(loy.transactions.length === 4 && loy.account.available === 4, 'loyalty history complete', loy.transactions.map((t) => t.type));
w = await rpc('toggle_wishlist', { p_product_id: blushProduct.id });
w = await rpc('toggle_wishlist', { p_product_id: blushProduct.id });
ok(w.added === false && w.count === 0, 'wishlist toggle removes');

// dashboard & coupons
const dash = await rpc('get_my_dashboard');
ok(dash.order_count === 3 && dash.recommended.length === 4 && dash.loyalty.available === 4, 'customer dashboard', { c: dash.order_count, r: dash.recommended.length });
const myCoupons = await rpc('list_my_coupons');
ok(myCoupons.find((c) => c.code === 'WELCOME10').used === true, 'used coupon flagged');

// cart sync
let cartRows = await rpc('sync_cart', { p_items: [{ variant_id: lipstick.id, quantity: 2 }] });
cartRows = await rpc('sync_cart', { p_items: [{ variant_id: lipstick.id, quantity: 1 }, { variant_id: gloss.id, quantity: 1 }] });
ok(cartRows.length === 2 && cartRows.find((r) => r.variant_id === lipstick.id).quantity === 3, 'cart merge adds quantities');
cartRows = await rpc('sync_cart', { p_items: [{ variant_id: gloss.id, quantity: 1 }], p_replace: true });
ok(cartRows.length === 1, 'cart replace');

// newsletter
ok((await rpc('subscribe_newsletter', { p_email: 'Hello@Example.com' })).status === 'subscribed', 'newsletter subscribe');
ok((await rpc('subscribe_newsletter', { p_email: 'hello@example.com' })).status === 'already_subscribed', 'newsletter duplicate handled');
await expectError(() => rpc('subscribe_newsletter', { p_email: 'nope' }), 'valid email', 'newsletter validation');

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
console.log('\n# admin');
await as(cust.id);
await expectError(() => rpc('admin_dashboard'), 'forbidden', 'customer blocked from admin dashboard');
await as(admin.id);
const ad = await rpc('admin_dashboard');
ok(ad.totals.orders === 3 && ad.totals.customers === 2 && ad.revenue_series.length === 30, 'admin dashboard totals', ad.totals);
ok(ad.top_products.length >= 1 && ad.category_performance.length === 4, 'admin charts data');
const al = await rpc('admin_list_orders', { p_status: 'refunded' });
ok(al.total === 1 && al.items[0].order_number === order1.order_number, 'admin order filter');
const ac = await rpc('admin_list_customers', { p_query: 'priya' });
ok(ac.total === 1 && ac.items[0].order_count === 3, 'admin customer search', ac.items[0]);
const cd = await rpc('admin_customer_detail', { p_user_id: cust.id });
ok(cd.orders.length === 3 && cd.reviews.length === 1, 'admin customer detail');

const inv = await rpc('admin_adjust_inventory', { p_variant_id: gloss.id, p_delta: -35, p_reason: 'adjustment', p_note: 'Damaged batch' });
ok(inv.quantity === 5, 'inventory adjustment', inv);
const low = await rpc('admin_inventory', { p_low_only: true });
ok(low.some((r) => r.variant_id === gloss.id), 'low-stock report');
ok((await rpc('admin_inventory_history', { p_variant_id: gloss.id })).length === 2, 'inventory history entries (opening stock + adjustment)');
await expectError(() => rpc('admin_adjust_inventory', { p_variant_id: gloss.id, p_delta: -50, p_reason: 'adjustment' }), 'negative', 'stock cannot go negative');

// oversell protection
await as(cust2.id);
await expectError(() => rpc('place_order', { p_items: [{ variant_id: gloss.id, quantity: 6 }], p_address: address, p_payment_method: 'cod' }), 'Only 5', 'oversell blocked');
await as(admin.id);

const cats = await q(`select id from categories where slug = 'face'`);
const created = await rpc('admin_save_product', {
  p: {
    product: { slug: 'test-primer', name: 'Test Primer', price: 999, category_id: cats[0].id, is_published: true, attributes: {} },
    shades: [{ id: 'tmp1', name: 'Clear', hex: '#FFFFFF' }, { id: 'tmp2', name: 'Rose', hex: '#E8A7B8' }],
    variants: [{ id: 'new1', shade_id: 'tmp1', sku: 'TP-1', name: 'Clear', quantity: 10 }, { id: 'new2', shade_id: 'tmp2', sku: 'TP-2', name: 'Rose', quantity: 0 }],
    images: [{ url: 'https://example.com/a.jpg', alt: 'a' }],
  },
});
ok(created.product.slug === 'test-primer' && created.variants.length === 2 && created.variants[0].quantity === 10, 'admin_save_product creates product tree', created.variants);
ok(created.variants[0].shade_id === created.shades[0].id, 'temp shade ids remapped to real ids');
const updated = await rpc('admin_save_product', {
  p: {
    id: created.product.id,
    product: { ...created.product, price: 1099, is_best_seller: true },
    shades: [created.shades[0]],
    variants: [{ ...created.variants[0], quantity: 25 }],
    images: [],
  },
});
ok(updated.shades.length === 1 && updated.variants.length === 1 && updated.variants[0].quantity === 25 && Number(updated.product.price) === 1099, 'admin_save_product updates & prunes');
ok((await one(`select count(*)::int as c from inventory_movements where variant_id = $1`, [updated.variants[0].id])).c === 2, 'editor stock change logged as movement');
const alp = await rpc('admin_list_products', { p_query: 'primer' });
ok(alp.total === 1 && alp.items[0].stock === 25, 'admin product list');
await rpc('admin_delete_product', { p_id: created.product.id });
ok((await one(`select count(*)::int as c from products where id = $1`, [created.product.id])).c === 0, 'unsold product hard-deleted');
await rpc('admin_delete_product', { p_id: lipstickProduct.id });
ok((await one(`select is_published from products where id = $1`, [lipstickProduct.id])).is_published === false, 'sold product is unpublished instead of deleted');
await db.query(`update products set is_published = true where id = $1`, [lipstickProduct.id]);
await expectError(() => rpc('admin_delete_category', { p_id: cats[0].id }), 'still has products', 'category with products protected');

const cs = await rpc('admin_coupon_stats');
ok(cs.find((c) => c.code === 'WELCOME10').times_used === 0, 'coupon stats exclude refunded orders', cs.find((c) => c.code === 'WELCOME10'));
const gr = await rpc('admin_gift_rules');
ok(gr.length === 1 && gr[0].issued === 1, 'gift rule stats');
const rv = await rpc('admin_reviews', { p_verified_only: true });
ok(rv.length === 1, 'admin reviews list');
await rpc('admin_update_setting', { p_key: 'shipping', p_value: { flat_rate: 99, free_above: 1499 } });
await as(null);
quote = await rpc('quote_cart', { p_items: [{ variant_id: liner1.id, quantity: 1 }] });
ok(quote.shipping === 99, 'settings change flows into pricing immediately');
await as(admin.id);
await rpc('admin_update_setting', { p_key: 'shipping', p_value: { flat_rate: 79, free_above: 999 } });
ok(Object.keys(await rpc('admin_settings')).length === 5, 'admin settings');
await rpc('admin_set_customer_status', { p_user_id: cust2.id, p_status: 'suspended' });
await as(cust2.id);
await expectError(() => rpc('place_order', { p_items: [{ variant_id: liner1.id, quantity: 1 }], p_address: address, p_payment_method: 'cod' }), 'suspended', 'suspended account blocked');
await as(admin.id);
await rpc('admin_set_customer_status', { p_user_id: cust2.id, p_status: 'active' });

// ---------------------------------------------------------------------------
// RLS as the `authenticated` role
// ---------------------------------------------------------------------------
console.log('\n# row level security');
await as(cust.id);
await db.exec(`set role authenticated`);
ok((await one(`select count(*)::int as c from orders`)).c === 3, 'customer sees only own orders');
ok((await one(`select count(*)::int as c from profiles`)).c === 1, 'customer sees only own profile');
ok((await one(`select count(*)::int as c from products`)).c === (await one(`select count(*)::int as c from products where is_published`)).c, 'unpublished products hidden');
ok((await one(`select count(*)::int as c from coupons`)).c === 3, 'public coupons visible');
ok((await one(`select count(*)::int as c from settings`)).c === 0, 'settings hidden from customers');
ok((await one(`select count(*)::int as c from inventory`)).c === 0, 'raw inventory hidden from customers');
await expectError(() => db.query(`update loyalty_accounts set available_points = 999999 where user_id = $1`, [cust.id]), 'denied', 'customer cannot write loyalty balance');
await db.query(`update products set price = 1 where id = $1`, [lipstickProduct.id]);
ok(Number((await one(`select price from products where id = $1`, [lipstickProduct.id])).price) === 899, 'customer cannot change prices (RLS makes the update a no-op)');
await expectError(() => db.query(`update profiles set role = 'admin' where id = $1`, [cust.id]), 'not allowed', 'customer cannot self-promote');
await expectError(() => db.query(`insert into orders (user_id, payment_method, subtotal, grand_total, shipping_address) values ($1, 'cod', 1, 1, '{}')`, [cust.id]), 'denied', 'customer cannot insert orders directly');
await db.query(`update profiles set full_name = 'Priya S' where id = $1`, [cust.id]);
ok((await one(`select full_name from profiles where id = $1`, [cust.id])).full_name === 'Priya S', 'customer can edit own name');
await expectError(() => db.query(`select mark_order_paid($1, 'x', 'y')`, [order2.order_id]), 'denied', 'client cannot call mark_order_paid');
await db.exec(`reset role`);
await as(admin.id);
await db.exec(`set role authenticated`);
ok((await one(`select count(*)::int as c from orders`)).c === 3, 'admin sees all orders');
ok((await one(`select count(*)::int as c from settings`)).c === 5, 'admin sees settings');
await db.query(`update products set is_new = true where id = $1`, [lipstickProduct.id]);
ok((await one(`select is_new from products where id = $1`, [lipstickProduct.id])).is_new === true, 'admin can edit products directly');
await db.exec(`reset role`);
await as(null);
await db.exec(`set role anonymous`);
await expectError(() => one(`select count(*)::int as c from orders`), 'denied', 'anonymous role has no access to orders');
ok((await rpc('get_home')).signature.length === 5, 'anonymous role can load the home payload');
await db.exec(`reset role`);

console.log(`\n${passed} passed, ${failed} failed`);
await db.close();
process.exit(failed ? 1 : 0);
