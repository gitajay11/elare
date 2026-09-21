import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { inventoryReason, recommendationKind } from './enums';
import { profiles } from './identity';

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const subcategories = pgTable('subcategories', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('subcategories_category_idx').on(t.categoryId)]);

export const products = pgTable('products', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  shortDescription: text('short_description'),
  description: text('description'),
  benefits: text('benefits').array(),
  howToUse: text('how_to_use'),
  ingredients: text('ingredients'),
  sizeLabel: text('size_label'),
  finish: text('finish'),
  coverage: text('coverage'),
  suitability: text('suitability'),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  subcategoryId: uuid('subcategory_id').references(() => subcategories.id, { onDelete: 'set null' }),
  price: numeric('price', { precision: 12, scale: 2 }).notNull(),
  compareAtPrice: numeric('compare_at_price', { precision: 12, scale: 2 }),
  loyaltyPoints: integer('loyalty_points'),
  attributes: jsonb('attributes').notNull().default({}),
  videoUrl: text('video_url'),
  isPublished: boolean('is_published').notNull().default(false),
  isBestSeller: boolean('is_best_seller').notNull().default(false),
  isNew: boolean('is_new').notNull().default(false),
  isGiftOnly: boolean('is_gift_only').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('products_category_idx').on(t.categoryId, t.subcategoryId), index('products_created_idx').on(t.createdAt)]);

export const productShades = pgTable('product_shades', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hex: text('hex').notNull(),
  undertone: text('undertone'),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
}, (t) => [index('product_shades_product_idx').on(t.productId)]);

export const productVariants = pgTable('product_variants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  shadeId: uuid('shade_id').references(() => productShades.id, { onDelete: 'set null' }),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  options: jsonb('options').notNull().default({}),
  priceOverride: numeric('price_override', { precision: 12, scale: 2 }),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('product_variants_product_idx').on(t.productId), index('product_variants_shade_idx').on(t.shadeId)]);

export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  shadeId: uuid('shade_id').references(() => productShades.id, { onDelete: 'set null' }),
  url: text('url').notNull(),
  alt: text('alt').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isPrimary: boolean('is_primary').notNull().default(false),
}, (t) => [index('product_images_product_idx').on(t.productId, t.sortOrder)]);

export const inventory = pgTable('inventory', {
  variantId: uuid('variant_id').primaryKey().references(() => productVariants.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(0),
  lowStockThreshold: integer('low_stock_threshold').notNull().default(5),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(),
  reason: inventoryReason('reason').notNull(),
  reference: text('reference'),
  createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('inventory_movements_variant_idx').on(t.variantId, t.createdAt)]);

export const productBundleItems = pgTable('product_bundle_items', {
  bundleProductId: uuid('bundle_product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  variantId: uuid('variant_id').notNull().references(() => productVariants.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull().default(1),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.bundleProductId, t.variantId] })]);

export const productRecommendations = pgTable('product_recommendations', {
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  recommendedProductId: uuid('recommended_product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  kind: recommendationKind('kind').notNull().default('also_like'),
  sortOrder: integer('sort_order').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.productId, t.recommendedProductId, t.kind] })]);
