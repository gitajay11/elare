-- ============================================================================
-- ÉLARÉ BEAUTY — catalogue seed
-- Categories, subcategories, products, shades, variants, opening stock,
-- imagery, bundles, recommendations, coupons and the free-gift rule.
-- No orders, reviews or customers are seeded: those only ever come from
-- real activity.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------------
insert into categories (slug, name, description, image_url, sort_order) values
  ('lips', 'Lips', 'Liners, lipsticks and glosses composed to be worn alone or layered as one seamless look.',
   'https://images.unsplash.com/photo-1583209814683-c023dd293cc6?auto=format&fit=crop&w=1200&q=80', 1),
  ('eyes', 'Eyes', 'Precision liners, lengthening mascaras and palettes for every hour of the day.',
   'https://images.unsplash.com/photo-1526947425960-945c6e72858f?auto=format&fit=crop&w=1200&q=80', 2),
  ('face', 'Face', 'Skin-first complexion essentials in an inclusive range of shades and undertones.',
   'https://images.unsplash.com/photo-1457972729786-0411a3b2b626?auto=format&fit=crop&w=1200&q=80', 3),
  ('brushes-tools', 'Brushes & Tools', 'Hand-finished brushes and tools designed to make application effortless.',
   'https://images.unsplash.com/photo-1610348725531-843dff563e2c?auto=format&fit=crop&w=1200&q=80', 4);

insert into subcategories (category_id, slug, name, sort_order)
select c.id, s.slug, s.name, s.ord
from categories c
join (values
  ('lips', 'lip-liners', 'Lip Liners', 1), ('lips', 'lipsticks', 'Lipsticks', 2), ('lips', 'lip-gloss', 'Lip Gloss', 3),
  ('lips', 'lip-combos', 'Lip Combos', 4), ('lips', 'signature-lip-collection', 'Signature Lip Collection', 5),
  ('eyes', 'eyeliner', 'Eyeliner', 1), ('eyes', 'mascara', 'Mascara', 2), ('eyes', 'eyeshadow-palettes', 'Eyeshadow Palettes', 3),
  ('eyes', 'eyebrow-palettes', 'Eyebrow Palettes', 4), ('eyes', 'eyebrow-pencils', 'Eyebrow Pencils', 5), ('eyes', 'eyebrow-pens', 'Eyebrow Pens', 6),
  ('face', 'foundation', 'Foundation', 1), ('face', 'concealer', 'Concealer', 2), ('face', 'color-corrector', 'Color Corrector', 3),
  ('face', 'setting-powder', 'Setting Powder', 4), ('face', 'blush', 'Blush', 5), ('face', 'contour', 'Contour', 6),
  ('face', 'highlighter', 'Highlighter', 7), ('face', 'setting-spray', 'Setting Spray', 8),
  ('brushes-tools', 'makeup-brushes', 'Makeup Brushes', 1), ('brushes-tools', 'makeup-sponges', 'Makeup Sponges', 2),
  ('brushes-tools', 'powder-sponges', 'Powder Sponges', 3), ('brushes-tools', 'brush-sets', 'Brush Sets', 4), ('brushes-tools', 'beauty-tools', 'Beauty Tools', 5)
) as s(cat, slug, name, ord) on s.cat = c.slug;

-- ---------------------------------------------------------------------------
-- Seed helper (dropped at the end of this file)
-- ---------------------------------------------------------------------------
create or replace function seed_product(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id     uuid;
  v_cat    uuid;
  v_sub    uuid;
  v_s      jsonb;
  v_v      jsonb;
  v_img    jsonb;
  v_sid    uuid;
  v_vid    uuid;
  v_n      int := 0;
  v_m      int := 0;
  v_qty    int := coalesce((p ->> 'qty')::int, 40);
  v_sku    text := upper(regexp_replace(p ->> 'slug', '[^a-z0-9]+', '-', 'g'));
begin
  select id into v_cat from categories where slug = p ->> 'category';
  select id into v_sub from subcategories where category_id = v_cat and slug = p ->> 'subcategory';

  insert into products (slug, name, short_description, description, benefits, how_to_use, ingredients, size_label, finish, coverage, suitability,
                        category_id, subcategory_id, price, compare_at_price, loyalty_points, attributes, is_published, is_best_seller, is_new, is_gift_only)
  values (p ->> 'slug', p ->> 'name', p ->> 'short', p ->> 'description',
          array(select jsonb_array_elements_text(coalesce(p -> 'benefits', '[]'::jsonb))),
          p ->> 'how_to_use', p ->> 'ingredients', p ->> 'size', p ->> 'finish', p ->> 'coverage', p ->> 'suitability',
          v_cat, v_sub, (p ->> 'price')::numeric, (p ->> 'compare_at')::numeric, (p ->> 'points')::int,
          coalesce(p -> 'attributes', '{}'::jsonb), true, coalesce((p ->> 'best_seller')::boolean, false),
          coalesce((p ->> 'new')::boolean, false), coalesce((p ->> 'gift_only')::boolean, false))
  returning id into v_id;

  -- shades
  for v_s in select * from jsonb_array_elements(coalesce(p -> 'shades', '[]'::jsonb)) loop
    v_n := v_n + 1;
    insert into product_shades (product_id, name, hex, undertone, description, sort_order)
    values (v_id, v_s ->> 'name', v_s ->> 'hex', v_s ->> 'undertone', v_s ->> 'description', v_n)
    returning id into v_sid;

    if jsonb_array_length(coalesce(p -> 'variants', '[]'::jsonb)) > 0 then
      v_m := 0;
      for v_v in select * from jsonb_array_elements(p -> 'variants') loop
        v_m := v_m + 1;
        insert into product_variants (product_id, shade_id, sku, name, options, price_override, sort_order)
        values (v_id, v_sid, v_sku || '-' || lpad(v_n::text, 2, '0') || '-' || v_m, (v_s ->> 'name') || ' · ' || (v_v ->> 'name'),
                coalesce(v_v -> 'options', '{}'::jsonb), (v_v ->> 'price')::numeric, v_n * 10 + v_m)
        returning id into v_vid;
        insert into inventory (variant_id, quantity) values (v_vid, coalesce((v_v ->> 'qty')::int, v_qty));
        insert into inventory_movements (variant_id, delta, reason, reference) values (v_vid, coalesce((v_v ->> 'qty')::int, v_qty), 'initial', 'Opening stock');
      end loop;
    else
      insert into product_variants (product_id, shade_id, sku, name, sort_order)
      values (v_id, v_sid, v_sku || '-' || lpad(v_n::text, 2, '0'), v_s ->> 'name', v_n)
      returning id into v_vid;
      insert into inventory (variant_id, quantity) values (v_vid, coalesce((v_s ->> 'qty')::int, v_qty));
      insert into inventory_movements (variant_id, delta, reason, reference) values (v_vid, coalesce((v_s ->> 'qty')::int, v_qty), 'initial', 'Opening stock');
    end if;
  end loop;

  -- shade-less variants
  if v_n = 0 then
    if jsonb_array_length(coalesce(p -> 'variants', '[]'::jsonb)) > 0 then
      for v_v in select * from jsonb_array_elements(p -> 'variants') loop
        v_m := v_m + 1;
        insert into product_variants (product_id, sku, name, options, price_override, sort_order)
        values (v_id, v_sku || '-' || v_m, v_v ->> 'name', coalesce(v_v -> 'options', '{}'::jsonb), (v_v ->> 'price')::numeric, v_m)
        returning id into v_vid;
        insert into inventory (variant_id, quantity) values (v_vid, coalesce((v_v ->> 'qty')::int, v_qty));
        insert into inventory_movements (variant_id, delta, reason, reference) values (v_vid, coalesce((v_v ->> 'qty')::int, v_qty), 'initial', 'Opening stock');
      end loop;
    else
      insert into product_variants (product_id, sku, name, sort_order) values (v_id, v_sku, 'Default', 1) returning id into v_vid;
      insert into inventory (variant_id, quantity) values (v_vid, v_qty);
      insert into inventory_movements (variant_id, delta, reason, reference) values (v_vid, v_qty, 'initial', 'Opening stock');
    end if;
  end if;

  -- images
  v_n := 0;
  for v_img in select * from jsonb_array_elements(coalesce(p -> 'images', '[]'::jsonb)) loop
    v_n := v_n + 1;
    insert into product_images (product_id, url, alt, sort_order, is_primary)
    values (v_id, v_img ->> 'url', coalesce(v_img ->> 'alt', p ->> 'name'), v_n, v_n = 1);
  end loop;

  return v_id;
end $$;

-- Verified, brand-free stock photography (Unsplash / Pexels licences permit commercial use).
create or replace function seed_u(p_id text, p_alt text) returns jsonb language sql as $$
  select jsonb_build_object('url', 'https://images.unsplash.com/photo-' || p_id || '?auto=format&fit=crop&w=1200&q=80', 'alt', p_alt);
$$;
create or replace function seed_px(p_id text, p_alt text) returns jsonb language sql as $$
  select jsonb_build_object('url', 'https://images.pexels.com/photos/' || p_id || '/pexels-photo-' || p_id || '.jpeg?auto=compress&cs=tinysrgb&w=1200', 'alt', p_alt);
$$;

-- ---------------------------------------------------------------------------
-- LIPS — the Signature components
-- ---------------------------------------------------------------------------
select seed_product(jsonb_build_object(
  'slug', 'signature-lip-liner', 'name', 'Signature Lip Liner', 'category', 'lips', 'subcategory', 'lip-liners',
  'short', 'Creamy, long-wear definition in the five Signature shades.',
  'description', 'A soft, waxy liner that glides on without dragging and sets to a smudge-resistant finish. Shade-matched to the Signature Lipstick and Gloss so the three layer as one.',
  'benefits', jsonb_build_array('Up to 8 hours of wear', 'Blurs and defines without feathering', 'Built-in sharpener in the cap'),
  'how_to_use', 'Trace the natural lip line, then softly fill the lips for a longer-lasting base before lipstick.',
  'ingredients', 'Synthetic Wax, Caprylic/Capric Triglyceride, Hydrogenated Polyisobutene, Candelilla Wax, Vitamin E, Jojoba Seed Oil. May contain: CI 77891, CI 15850, CI 45410, CI 77491.',
  'size', '1.2 g', 'finish', 'Matte', 'suitability', 'Curated to complement a wide range of complexions and undertones.',
  'price', 549, 'best_seller', true, 'attributes', jsonb_build_object('collection', 'signature-component'),
  'shades', jsonb_build_array(
    jsonb_build_object('name', '01 Rose Nude', 'hex', '#B9776B', 'undertone', 'neutral'),
    jsonb_build_object('name', '02 Soft Mauve', 'hex', '#9E6B7A', 'undertone', 'cool'),
    jsonb_build_object('name', '03 Velvet Berry', 'hex', '#7A2E4A', 'undertone', 'cool'),
    jsonb_build_object('name', '04 Warm Terracotta', 'hex', '#B25A3C', 'undertone', 'warm'),
    jsonb_build_object('name', '05 Classic Ruby', 'hex', '#9C1B2E', 'undertone', 'neutral')),
  'images', jsonb_build_array(seed_px('457701', 'Lip liner being applied along the lip line'), seed_px('1625037', 'Five Signature lip shades from rose nude to ruby'))
));

select seed_product(jsonb_build_object(
  'slug', 'signature-lipstick', 'name', 'Signature Lipstick', 'category', 'lips', 'subcategory', 'lipsticks',
  'short', 'A weightless satin lipstick with one-swipe colour.',
  'description', 'Our most-loved formula: full-pigment colour suspended in a cushion of skin-loving oils. Comfortable enough for all day, saturated enough for evening.',
  'benefits', jsonb_build_array('Satin finish that never looks dry', 'Hyaluronic acid keeps lips soft', 'Refillable bullet'),
  'how_to_use', 'Apply from the centre of the lips outward. Blot and reapply for extra depth. Layer over the Signature Liner and finish with Gloss.',
  'ingredients', 'Ricinus Communis Seed Oil, Octyldodecanol, Caprylic/Capric Triglyceride, Candelilla Wax, Sodium Hyaluronate, Tocopherol, Parfum. May contain: CI 77891, CI 15850, CI 45410, CI 77491, CI 77492.',
  'size', '3.5 g', 'finish', 'Satin', 'suitability', 'Curated to complement a wide range of complexions and undertones.',
  'price', 899, 'best_seller', true, 'attributes', jsonb_build_object('collection', 'signature-component'),
  'shades', jsonb_build_array(
    jsonb_build_object('name', '01 Rose Nude', 'hex', '#C98A7D', 'undertone', 'neutral'),
    jsonb_build_object('name', '02 Soft Mauve', 'hex', '#B07A8C', 'undertone', 'cool'),
    jsonb_build_object('name', '03 Velvet Berry', 'hex', '#8E3A5B', 'undertone', 'cool'),
    jsonb_build_object('name', '04 Warm Terracotta', 'hex', '#C4674A', 'undertone', 'warm'),
    jsonb_build_object('name', '05 Classic Ruby', 'hex', '#B71E36', 'undertone', 'neutral')),
  'images', jsonb_build_array(seed_u('1625093742435-6fa192b6fb10', 'Rose lipstick bullet on a white surface'), seed_px('1625037', 'Five Signature lip shades from rose nude to ruby'))
));

select seed_product(jsonb_build_object(
  'slug', 'signature-lip-gloss', 'name', 'Signature Lip Gloss', 'category', 'lips', 'subcategory', 'lip-gloss',
  'short', 'Glass-like shine with a cushioned, non-sticky feel.',
  'description', 'A high-shine gloss that reads sheer on its own and lifts the Signature Lipstick to a luminous finish. Cooling peppermint gives a subtle plumped look.',
  'benefits', jsonb_build_array('Non-sticky, mirror shine', 'Peppermint oil for a fuller look', 'Doe-foot applicator for precision'),
  'how_to_use', 'Sweep over bare lips or on top of lipstick, concentrating on the centre for dimension.',
  'ingredients', 'Polybutene, Hydrogenated Polyisobutene, Octyldodecanol, Mentha Piperita Oil, Tocopherol, Parfum. May contain: CI 15850, CI 45410, CI 77891.',
  'size', '4 ml', 'finish', 'Glossy', 'suitability', 'Curated to complement a wide range of complexions and undertones.',
  'price', 649, 'attributes', jsonb_build_object('collection', 'signature-component'),
  'shades', jsonb_build_array(
    jsonb_build_object('name', '01 Rose Nude', 'hex', '#D9A090', 'undertone', 'neutral'),
    jsonb_build_object('name', '02 Soft Mauve', 'hex', '#C48FA0', 'undertone', 'cool'),
    jsonb_build_object('name', '03 Velvet Berry', 'hex', '#A64B72', 'undertone', 'cool'),
    jsonb_build_object('name', '04 Warm Terracotta', 'hex', '#D47C5F', 'undertone', 'warm'),
    jsonb_build_object('name', '05 Classic Ruby', 'hex', '#C93A4E', 'undertone', 'neutral')),
  'images', jsonb_build_array(seed_px('3373746', 'Pink lip gloss tubes'), seed_u('1583209814683-c023dd293cc6', 'Blush-toned cosmetics arranged on pink'))
));

-- The five Signature combos (Lip Liner + Lipstick + Lip Gloss)
do $$
declare
  r record;
  v_id uuid;
begin
  for r in select * from (values
    ('01', 'Rose Nude',       '#C98A7D', 'neutral', 'A your-lips-but-better rose with a soft nude cast.'),
    ('02', 'Soft Mauve',      '#B07A8C', 'cool',    'A muted, dusty mauve that reads effortlessly polished.'),
    ('03', 'Velvet Berry',    '#8E3A5B', 'cool',    'A deep, wine-tinged berry with velvet depth.'),
    ('04', 'Warm Terracotta', '#C4674A', 'warm',    'A sun-warmed terracotta with a golden undertone.'),
    ('05', 'Classic Ruby',    '#B71E36', 'neutral', 'The definitive true red — balanced between blue and orange.')
  ) as t(num, nm, hex, ut, blurb) loop
    v_id := seed_product(jsonb_build_object(
      'slug', 'lip-edit-' || r.num || '-' || lower(replace(r.nm, ' ', '-')),
      'name', 'The Lip Edit — ' || r.num || ' ' || r.nm,
      'category', 'lips', 'subcategory', 'signature-lip-collection',
      'short', 'Lip Liner + Lipstick + Lip Gloss in ' || r.nm || '.',
      'description', r.blurb || ' The complete Signature trio — liner, lipstick and gloss — colour-matched to layer as one seamless finish. Wear each alone or together.',
      'benefits', jsonb_build_array('Three colour-matched steps in one edit', 'Save ₹298 versus buying separately', 'Refillable lipstick bullet'),
      'how_to_use', 'Line and softly fill with the liner. Press the lipstick from the centre outward. Finish with a touch of gloss in the centre of the lips.',
      'ingredients', 'See individual products: Signature Lip Liner, Signature Lipstick, Signature Lip Gloss.',
      'size', '1.2 g + 3.5 g + 4 ml', 'finish', 'Satin', 'suitability', 'Curated to complement a wide range of complexions and undertones.',
      'price', 1799, 'compare_at', 2097, 'points', 250, 'best_seller', r.num in ('01', '03', '05'), 'new', r.num = '04',
      'attributes', jsonb_build_object('collection', 'signature', 'product_type', 'combo', 'shade_number', r.num, 'savings', 298),
      'shades', jsonb_build_array(jsonb_build_object('name', r.num || ' ' || r.nm, 'hex', r.hex, 'undertone', r.ut, 'qty', 30)),
      'images', jsonb_build_array(seed_px('1625037', 'The Signature lip shades lined up from rose nude to ruby'),
                                  seed_u('1625093742435-6fa192b6fb10', 'Rose lipstick bullet on white'),
                                  seed_px('457701', 'Lip liner being applied'))
    ));
    -- Bundle composition: the matching shade of each component.
    insert into product_bundle_items (bundle_product_id, variant_id, quantity, sort_order)
    select v_id, v.id, 1, row_number() over (order by p.slug)
    from product_variants v join products p on p.id = v.product_id join product_shades s on s.id = v.shade_id
    where p.slug in ('signature-lip-liner', 'signature-lipstick', 'signature-lip-gloss') and s.name like r.num || ' %';
  end loop;
end $$;

select seed_product(jsonb_build_object(
  'slug', 'velvet-matte-lipstick', 'name', 'Velvet Matte Lipstick', 'category', 'lips', 'subcategory', 'lipsticks',
  'short', 'A blurred, powder-soft matte that stays comfortable.',
  'description', 'Modern matte without the tightness. A whipped, air-light texture that sets to a soft-focus finish and moves with you.',
  'benefits', jsonb_build_array('Transfer-resistant once set', 'Squalane keeps lips supple', 'Buildable from a stain to full colour'),
  'how_to_use', 'Apply directly from the bullet. For a diffused look, tap in with a fingertip.',
  'ingredients', 'Isododecane, Dimethicone, Squalane, Silica, Disteardimonium Hectorite, Tocopherol. May contain: CI 77891, CI 15850, CI 45410, CI 77491.',
  'size', '3.2 g', 'finish', 'Matte', 'suitability', 'All lip tones; ideal for those who prefer a longer-wear finish.',
  'price', 799, 'new', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Blush Petal', 'hex', '#D48A9A', 'undertone', 'cool'),
    jsonb_build_object('name', 'Dusty Rose', 'hex', '#B6707C', 'undertone', 'neutral'),
    jsonb_build_object('name', 'Brick Rose', 'hex', '#A54A3E', 'undertone', 'warm'),
    jsonb_build_object('name', 'Cherry Noir', 'hex', '#6E1E2B', 'undertone', 'cool')),
  'images', jsonb_build_array(seed_px('2533266', 'Pink lipstick beside a blush compact'), seed_u('1583209814683-c023dd293cc6', 'Blush-toned cosmetics on pink'))
));

select seed_product(jsonb_build_object(
  'slug', 'everyday-lip-duo', 'name', 'Everyday Lip Duo', 'category', 'lips', 'subcategory', 'lip-combos',
  'short', 'Velvet Matte Lipstick + Signature Lip Liner, paired for daily wear.',
  'description', 'The two-step lip for busy mornings: a matching liner to keep edges crisp and a Velvet Matte bullet for colour that lasts through lunch.',
  'benefits', jsonb_build_array('Two shade-matched steps', 'Save ₹149 versus buying separately'),
  'how_to_use', 'Line, fill, then apply the lipstick from the centre outward.',
  'ingredients', 'See individual products: Velvet Matte Lipstick, Signature Lip Liner.',
  'size', '3.2 g + 1.2 g', 'finish', 'Matte', 'suitability', 'All lip tones.',
  'price', 1199, 'compare_at', 1348, 'attributes', jsonb_build_object('product_type', 'combo', 'savings', 149),
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Dusty Rose', 'hex', '#B6707C', 'undertone', 'neutral'),
    jsonb_build_object('name', 'Brick Rose', 'hex', '#A54A3E', 'undertone', 'warm')),
  'images', jsonb_build_array(seed_u('1583209814683-c023dd293cc6', 'Blush-toned cosmetics on pink'), seed_px('2533266', 'Pink lipstick beside a blush compact'))
));

-- Gift-only product used by the free-gift rule (never listed, never purchasable).
select seed_product(jsonb_build_object(
  'slug', 'mini-lip-balm-gift', 'name', 'Élaré Mini Lip Balm', 'category', 'lips', 'subcategory', 'lip-gloss',
  'short', 'A complimentary travel-size nourishing balm.',
  'description', 'Our shea and rosehip balm in a travel size — included with qualifying orders.',
  'size', '2 g', 'finish', 'Sheer', 'price', 199, 'gift_only', true, 'qty', 500,
  'images', jsonb_build_array(seed_px('4938451', 'Pale pink tube on soft linen'))
));

-- ---------------------------------------------------------------------------
-- EYES
-- ---------------------------------------------------------------------------
select seed_product(jsonb_build_object(
  'slug', 'precision-liquid-eyeliner', 'name', 'Precision Liquid Eyeliner', 'category', 'eyes', 'subcategory', 'eyeliner',
  'short', 'A flexible felt tip for hairline-thin to bold wings.',
  'description', 'An intensely pigmented liquid liner with a firm-but-flexible tip that lets you draw a whisper-thin line or a dramatic wing in one stroke.',
  'benefits', jsonb_build_array('Dries in seconds without transfer', 'Waterproof edition resists sweat and humidity', 'No skipping or fading'),
  'how_to_use', 'Rest the tip at the lash line and draw outward in short strokes. Extend to a wing following the lower lash line.',
  'ingredients', 'Aqua, Styrene/Acrylates Copolymer, Butylene Glycol, Phenoxyethanol, CI 77499. Waterproof: Isododecane, Trimethylsiloxysilicate.',
  'size', '1 ml', 'finish', 'Matte', 'suitability', 'All eye shapes; safe for sensitive eyes.',
  'price', 699, 'best_seller', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Onyx', 'hex', '#111111'),
    jsonb_build_object('name', 'Espresso', 'hex', '#4A2E1F'),
    jsonb_build_object('name', 'Midnight Navy', 'hex', '#1B2A4A')),
  'variants', jsonb_build_array(
    jsonb_build_object('name', 'Waterproof', 'options', jsonb_build_object('waterproof', true)),
    jsonb_build_object('name', 'Non-Waterproof', 'options', jsonb_build_object('waterproof', false))),
  'images', jsonb_build_array(seed_u('1631214524020-7e18db9a8f92', 'Liquid eyeliner pen on a pink surface'), seed_px('2693644', 'Eye pencils fanned on a dark surface'))
));

select seed_product(jsonb_build_object(
  'slug', 'kohl-pencil-eyeliner', 'name', 'Kohl Pencil Eyeliner', 'category', 'eyes', 'subcategory', 'eyeliner',
  'short', 'A creamy kohl that smudges soft or sets sharp.',
  'description', 'A gel-kohl hybrid for tightlining and smoky definition. Give it thirty seconds to set, or blend immediately for a diffused edge.',
  'benefits', jsonb_build_array('Glides without tugging', 'Smudge-proof once set', 'Ophthalmologist tested'),
  'how_to_use', 'Apply along the upper and lower lash lines. Blend with a smudger brush within 30 seconds for a softer look.',
  'ingredients', 'Cyclopentasiloxane, Synthetic Wax, Hydrogenated Polyisobutene, Tocopherol, CI 77499. Waterproof: Trimethylsiloxysilicate.',
  'size', '1.1 g', 'finish', 'Satin', 'suitability', 'Sensitive eyes and contact lens wearers.',
  'price', 449,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Onyx', 'hex', '#111111'),
    jsonb_build_object('name', 'Espresso', 'hex', '#4A2E1F')),
  'variants', jsonb_build_array(
    jsonb_build_object('name', 'Waterproof', 'options', jsonb_build_object('waterproof', true)),
    jsonb_build_object('name', 'Non-Waterproof', 'options', jsonb_build_object('waterproof', false))),
  'images', jsonb_build_array(seed_px('2693644', 'Eye pencils fanned on a dark surface'), seed_u('1567721913486-6585f069b332', 'Black cosmetics on grey stone'))
));

select seed_product(jsonb_build_object(
  'slug', 'elare-waterproof-mascara', 'name', 'Élaré Waterproof Mascara', 'category', 'eyes', 'subcategory', 'mascara',
  'short', 'Lift, length and hold that survives rain, gym and tears.',
  'description', 'A tubing-style waterproof mascara that wraps each lash in flexible black film. It will not flake or smudge, yet removes with warm water and gentle pressure.',
  'benefits', jsonb_build_array('Water- and sweat-resistant for 24 hours', 'Curved wand lifts from the root', 'No panda eyes; removes with warm water'),
  'how_to_use', 'Wiggle the wand at the base of the lashes and pull through to the tips. Layer while wet for volume.',
  'ingredients', 'Aqua, Acrylates Copolymer, Glycerin, Cera Alba, Copernicia Cerifera Wax, Phenoxyethanol, CI 77499.',
  'size', '9 ml', 'finish', 'Volumising', 'suitability', 'All lash types; contact-lens safe.',
  'price', 849, 'best_seller', true, 'attributes', jsonb_build_object('waterproof', true),
  'images', jsonb_build_array(seed_px('2688992', 'Black mascara tube and wand'), seed_px('3762663', 'Mascara being applied to lashes'))
));

select seed_product(jsonb_build_object(
  'slug', 'elare-non-waterproof-mascara', 'name', 'Élaré Non-Waterproof Mascara', 'category', 'eyes', 'subcategory', 'mascara',
  'short', 'Conditioning, buildable volume for everyday wear.',
  'description', 'A creamy, conditioning formula for soft, separated volume that washes away with your regular cleanser.',
  'benefits', jsonb_build_array('Argan oil conditions lashes', 'Washes off with cleanser', 'Clump-free, buildable coats'),
  'how_to_use', 'Sweep from root to tip. Add a second coat for extra volume.',
  'ingredients', 'Aqua, Glyceryl Stearate, Cera Alba, Argania Spinosa Kernel Oil, Panthenol, Phenoxyethanol, CI 77499.',
  'size', '9 ml', 'finish', 'Volumising', 'suitability', 'Sensitive eyes.',
  'price', 799, 'attributes', jsonb_build_object('waterproof', false),
  'images', jsonb_build_array(seed_px('3762663', 'Mascara being applied to lashes'), seed_px('2688992', 'Black mascara tube and wand'))
));

select seed_product(jsonb_build_object(
  'slug', 'eyeshadow-palette-01-soft-everyday', 'name', 'Eyeshadow Palette 01 — Soft / Everyday', 'category', 'eyes', 'subcategory', 'eyeshadow-palettes',
  'short', 'Twelve wearable neutrals in matte, satin and shimmer.',
  'description', 'Built for the everyday eye: warm and cool neutrals that blend without effort, from a barely-there wash to a soft smoky lid.',
  'benefits', jsonb_build_array('12 shades, three textures', 'Talc-free, blendable formula', 'Full-size mirror'),
  'how_to_use', 'Sweep a mid-tone through the crease, press a shimmer on the lid and deepen the outer corner with a matte.',
  'ingredients', 'Mica, Synthetic Fluorphlogopite, Boron Nitride, Dimethicone, Zinc Stearate, Tocopherol. May contain: CI 77891, CI 77491, CI 77492, CI 77499.',
  'size', '12 × 1.1 g', 'finish', 'Matte · Satin · Shimmer', 'suitability', 'All complexions; designed for day-to-night versatility.',
  'price', 1899, 'best_seller', true,
  'images', jsonb_build_array(seed_px('2253834', 'Neutral eyeshadow palette with brushes'), seed_px('2113855', 'Pastel makeup flat lay with palettes'))
));

select seed_product(jsonb_build_object(
  'slug', 'eyeshadow-palette-02-bold-evening', 'name', 'Eyeshadow Palette 02 — Bold / Evening', 'category', 'eyes', 'subcategory', 'eyeshadow-palettes',
  'short', 'Deep plums, bronzes and foiled metallics for after dark.',
  'description', 'A dramatic evening edit: saturated mattes and high-impact foils that build to full intensity in a single pass.',
  'benefits', jsonb_build_array('12 shades, foil-level metallics', 'Blends over a base without patching', 'Long-wear, crease-resistant'),
  'how_to_use', 'Apply foils with a damp brush for full metallic effect. Blend mattes with a fluffy brush.',
  'ingredients', 'Mica, Synthetic Fluorphlogopite, Isononyl Isononanoate, Boron Nitride, Zinc Stearate, Tocopherol. May contain: CI 77891, CI 77491, CI 77499, CI 75470.',
  'size', '12 × 1.1 g', 'finish', 'Matte · Foil', 'suitability', 'All complexions; ideal for evening and occasion looks.',
  'price', 2199, 'new', true,
  'images', jsonb_build_array(seed_u('1526947425960-945c6e72858f', 'Large eyeshadow palette held in hand'), seed_px('7290688', 'Eyeshadow palette on a desk'))
));

do $$
declare v_brow jsonb := jsonb_build_array(
  jsonb_build_object('name', 'Soft Blonde', 'hex', '#B8977A', 'undertone', 'warm'),
  jsonb_build_object('name', 'Warm Brunette', 'hex', '#7A5240', 'undertone', 'warm'),
  jsonb_build_object('name', 'Deep Brown', 'hex', '#4E3325', 'undertone', 'neutral'),
  jsonb_build_object('name', 'Ebony', 'hex', '#2A1E1A', 'undertone', 'cool'));
begin
  perform seed_product(jsonb_build_object(
    'slug', 'brow-sculpt-palette', 'name', 'Brow Sculpt Palette', 'category', 'eyes', 'subcategory', 'eyebrow-palettes',
    'short', 'A wax and two powders to shape, fill and set.',
    'description', 'Everything a brow needs in one compact: a tinted wax to groom, a soft powder to fill and a deeper powder to define the tail.',
    'benefits', jsonb_build_array('Three-step shape, fill, set', 'Includes angled brush and spoolie', 'Smudge-resistant wax'),
    'how_to_use', 'Brush brows up with the spoolie. Fill sparse areas with the lighter powder, define the tail with the deeper powder, set with wax.',
    'ingredients', 'Talc, Mica, Synthetic Wax, Zinc Stearate, Caprylic/Capric Triglyceride, Tocopherol. May contain: CI 77491, CI 77492, CI 77499.',
    'size', '2 × 1.5 g + 1 g', 'finish', 'Matte', 'suitability', 'All brow densities.',
    'price', 899, 'shades', v_brow,
    'images', jsonb_build_array(seed_px('7290688', 'Palette held in hand'), seed_px('2253834', 'Neutral palette with brushes'))
  ));
  perform seed_product(jsonb_build_object(
    'slug', 'brow-define-pencil', 'name', 'Brow Define Pencil', 'category', 'eyes', 'subcategory', 'eyebrow-pencils',
    'short', 'An ultra-fine retractable pencil for hair-like strokes.',
    'description', 'A 1.5 mm micro tip that mimics individual hairs, with a spoolie on the opposite end to blend and soften.',
    'benefits', jsonb_build_array('Hair-like precision', 'Waterproof, 12-hour wear', 'Built-in spoolie'),
    'how_to_use', 'Draw short, upward strokes in the direction of hair growth. Blend with the spoolie.',
    'ingredients', 'Synthetic Wax, Hydrogenated Vegetable Oil, Kaolin, Tocopherol. May contain: CI 77491, CI 77492, CI 77499.',
    'size', '0.08 g', 'finish', 'Matte', 'suitability', 'Sparse or over-plucked brows.',
    'price', 549, 'best_seller', true, 'shades', v_brow, 'attributes', jsonb_build_object('waterproof', true),
    'images', jsonb_build_array(seed_px('2693644', 'Pencils fanned on a dark surface'), seed_u('1567721913486-6585f069b332', 'Black cosmetics on grey stone'))
  ));
  perform seed_product(jsonb_build_object(
    'slug', 'brow-ink-pen', 'name', 'Brow Ink Pen', 'category', 'eyes', 'subcategory', 'eyebrow-pens',
    'short', 'A four-prong micro-tip pen for a natural microbladed effect.',
    'description', 'Four fine prongs lay down feathered strokes that look like real hairs and last up to 24 hours.',
    'benefits', jsonb_build_array('Microbladed look without commitment', 'Up to 24-hour wear', 'Transfer- and smudge-proof'),
    'how_to_use', 'Hold the pen at an angle and flick lightly to create hair strokes. Allow to dry before touching.',
    'ingredients', 'Aqua, Butylene Glycol, Acrylates Copolymer, Glycerin, Phenoxyethanol. May contain: CI 77491, CI 77492, CI 77499.',
    'size', '0.5 ml', 'finish', 'Natural', 'suitability', 'All brow types; ideal for gaps and thin tails.',
    'price', 649, 'new', true, 'shades', v_brow,
    'images', jsonb_build_array(seed_u('1631214524020-7e18db9a8f92', 'Fine-tip pen on pink'), seed_px('2693644', 'Pencils fanned on a dark surface'))
  ));
end $$;

-- ---------------------------------------------------------------------------
-- FACE
-- ---------------------------------------------------------------------------
select seed_product(jsonb_build_object(
  'slug', 'skin-veil-serum-foundation', 'name', 'Skin Veil Serum Foundation', 'category', 'face', 'subcategory', 'foundation',
  'short', 'A breathable, skin-like serum foundation with a natural radiance.',
  'description', 'Half skincare, half foundation. Niacinamide and hyaluronic acid sit beneath a veil of medium, buildable coverage that looks like skin — not makeup.',
  'benefits', jsonb_build_array('Medium, buildable coverage', 'Niacinamide + hyaluronic acid', 'Transfer-resistant, 12-hour wear'),
  'how_to_use', 'Shake well. Apply one pump with fingertips or a damp sponge, building where needed.',
  'ingredients', 'Aqua, Dimethicone, Isododecane, Glycerin, Niacinamide, Sodium Hyaluronate, Trimethylsiloxysilicate, Phenoxyethanol. May contain: CI 77891, CI 77491, CI 77492, CI 77499.',
  'size', '30 ml', 'finish', 'Natural Radiant', 'coverage', 'Medium', 'suitability', 'Normal, dry and combination skin.',
  'price', 1499, 'best_seller', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', '100 Porcelain', 'hex', '#F1D9C8', 'undertone', 'cool'),
    jsonb_build_object('name', '120 Ivory', 'hex', '#EFD3B9', 'undertone', 'neutral'),
    jsonb_build_object('name', '150 Sand', 'hex', '#E6C19F', 'undertone', 'warm'),
    jsonb_build_object('name', '200 Beige', 'hex', '#D9AE8B', 'undertone', 'neutral'),
    jsonb_build_object('name', '250 Honey', 'hex', '#CE9A6E', 'undertone', 'warm'),
    jsonb_build_object('name', '300 Caramel', 'hex', '#B98358', 'undertone', 'neutral'),
    jsonb_build_object('name', '350 Amber', 'hex', '#A86F47', 'undertone', 'warm'),
    jsonb_build_object('name', '400 Chestnut', 'hex', '#8B5A3C', 'undertone', 'cool'),
    jsonb_build_object('name', '450 Espresso', 'hex', '#6B4330', 'undertone', 'neutral'),
    jsonb_build_object('name', '500 Ebony', 'hex', '#4A2C21', 'undertone', 'warm')),
  'images', jsonb_build_array(seed_u('1457972729786-0411a3b2b626', 'Foundation shades swatched on the back of a hand'), seed_px('3785147', 'Beige complexion bottles on a soft surface'))
));

select seed_product(jsonb_build_object(
  'slug', 'velvet-matte-foundation', 'name', 'Velvet Matte Foundation', 'category', 'face', 'subcategory', 'foundation',
  'short', 'Full, weightless coverage with a soft-matte finish.',
  'description', 'Oil-controlling, full-coverage foundation that blurs pores and stays put for 24 hours, without looking flat.',
  'benefits', jsonb_build_array('Full coverage, one layer', 'Controls oil for 24 hours', 'Non-comedogenic'),
  'how_to_use', 'Apply with a dense brush in thin layers. Set the T-zone with Silk Setting Powder.',
  'ingredients', 'Aqua, Cyclopentasiloxane, Isododecane, Silica, Trimethylsiloxysilicate, Kaolin, Phenoxyethanol. May contain: CI 77891, CI 77491, CI 77492, CI 77499.',
  'size', '30 ml', 'finish', 'Matte', 'coverage', 'Full', 'suitability', 'Oily and combination skin.',
  'price', 1599,
  'shades', jsonb_build_array(
    jsonb_build_object('name', '110 Fair', 'hex', '#F0D6C2', 'undertone', 'neutral'),
    jsonb_build_object('name', '160 Light', 'hex', '#E4BFA0', 'undertone', 'warm'),
    jsonb_build_object('name', '210 Medium', 'hex', '#D6A886', 'undertone', 'neutral'),
    jsonb_build_object('name', '260 Golden', 'hex', '#C7936A', 'undertone', 'warm'),
    jsonb_build_object('name', '320 Tan', 'hex', '#B07C52', 'undertone', 'neutral'),
    jsonb_build_object('name', '380 Deep', 'hex', '#96633F', 'undertone', 'warm'),
    jsonb_build_object('name', '430 Rich', 'hex', '#74482F', 'undertone', 'cool'),
    jsonb_build_object('name', '480 Onyx', 'hex', '#4F2F22', 'undertone', 'neutral')),
  'images', jsonb_build_array(seed_px('3785147', 'Beige complexion bottles on a soft surface'), seed_u('1457972729786-0411a3b2b626', 'Foundation shades swatched on the back of a hand'))
));

select seed_product(jsonb_build_object(
  'slug', 'soft-focus-concealer', 'name', 'Soft Focus Concealer', 'category', 'face', 'subcategory', 'concealer',
  'short', 'Brightening, crease-proof coverage for under-eyes and blemishes.',
  'description', 'A creamy, full-coverage concealer with caffeine and light-diffusing pigments that lifts shadows without settling into fine lines.',
  'benefits', jsonb_build_array('Full coverage, crease-resistant', 'Caffeine de-puffs', 'Hydrating, never cakey'),
  'how_to_use', 'Dot beneath the eyes in an inverted triangle and tap to blend. Use sparingly on blemishes.',
  'ingredients', 'Aqua, Dimethicone, Glycerin, Caffeine, Silica, Sodium Hyaluronate, Phenoxyethanol. May contain: CI 77891, CI 77491, CI 77492, CI 77499.',
  'size', '7 ml', 'finish', 'Natural', 'coverage', 'Full', 'suitability', 'All skin types.',
  'price', 899, 'best_seller', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'C1 Fair', 'hex', '#F2DAC6', 'undertone', 'neutral'),
    jsonb_build_object('name', 'C2 Light', 'hex', '#EAC6A6', 'undertone', 'warm'),
    jsonb_build_object('name', 'C3 Light-Medium', 'hex', '#DEB48F', 'undertone', 'neutral'),
    jsonb_build_object('name', 'C4 Medium', 'hex', '#CFA07A', 'undertone', 'warm'),
    jsonb_build_object('name', 'C5 Tan', 'hex', '#B9855C', 'undertone', 'neutral'),
    jsonb_build_object('name', 'C6 Deep', 'hex', '#9C6A45', 'undertone', 'warm'),
    jsonb_build_object('name', 'C7 Rich', 'hex', '#7B4F33', 'undertone', 'cool'),
    jsonb_build_object('name', 'C8 Ebony', 'hex', '#563526', 'undertone', 'neutral')),
  'images', jsonb_build_array(seed_u('1599305090598-fe179d501227', 'Beige cream compacts in soft light'), seed_px('4938451', 'Pale pink tube on soft linen'))
));

select seed_product(jsonb_build_object(
  'slug', 'colour-correcting-cream', 'name', 'Colour Correcting Cream', 'category', 'face', 'subcategory', 'color-corrector',
  'short', 'Targeted correctors that neutralise before you conceal.',
  'description', 'Sheer, blendable creams that cancel discolouration using colour theory, so you need less concealer on top.',
  'benefits', jsonb_build_array('Neutralises dark circles, redness and sallowness', 'Sheer, skin-fused finish', 'Layers under any foundation'),
  'how_to_use', 'Tap a small amount over the area of concern, then apply foundation or concealer on top.',
  'ingredients', 'Aqua, Dimethicone, Glycerin, Squalane, Silica, Phenoxyethanol. May contain: CI 77891, CI 77491, CI 77492, CI 77288, CI 77007.',
  'size', '5 ml', 'finish', 'Natural', 'coverage', 'Light', 'suitability', 'All skin types.',
  'price', 749,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Peach', 'hex', '#F2B08E', 'description', 'Neutralises blue-toned dark circles on light to medium skin.'),
    jsonb_build_object('name', 'Apricot', 'hex', '#E08A5E', 'description', 'Neutralises dark circles on tan to deep skin.'),
    jsonb_build_object('name', 'Green', 'hex', '#A9C8A0', 'description', 'Cancels redness and blemishes.'),
    jsonb_build_object('name', 'Lavender', 'hex', '#C9B7E2', 'description', 'Brightens sallow or yellow-toned areas.')),
  'images', jsonb_build_array(seed_u('1503236823255-94609f598e71', 'Peach cream in a jar with a brush'), seed_px('4938451', 'Pale pink tube on soft linen'))
));

select seed_product(jsonb_build_object(
  'slug', 'silk-setting-powder', 'name', 'Silk Setting Powder', 'category', 'face', 'subcategory', 'setting-powder',
  'short', 'A finely milled loose powder that blurs without flashback.',
  'description', 'Micro-milled silk powder that sets makeup, softens texture and photographs flawlessly — no white cast, no dryness.',
  'benefits', jsonb_build_array('Blurs pores and fine lines', 'No flashback in photos', 'Talc-free'),
  'how_to_use', 'Press into skin with a puff to set, or dust lightly with a large brush for a soft-focus finish.',
  'ingredients', 'Mica, Silica, Sericite, Zinc Stearate, Hydrolysed Silk, Tocopherol. May contain: CI 77891, CI 77491, CI 77492, CI 77499.',
  'size', '10 g', 'finish', 'Soft Matte', 'suitability', 'All skin types.',
  'price', 999, 'best_seller', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Translucent', 'hex', '#F3E9E1'),
    jsonb_build_object('name', 'Light Beige', 'hex', '#E8CDB5'),
    jsonb_build_object('name', 'Medium', 'hex', '#D4AE8E'),
    jsonb_build_object('name', 'Deep', 'hex', '#A8785A')),
  'images', jsonb_build_array(seed_u('1515688594390-b649af70d282', 'Loose powders with brushes'), seed_px('1377034', 'Crushed powders and lip colours'))
));

select seed_product(jsonb_build_object(
  'slug', 'cheek-bloom-blush', 'name', 'Cheek Bloom Blush', 'category', 'face', 'subcategory', 'blush',
  'short', 'A silky powder blush with a lit-from-within flush.',
  'description', 'Buttery-soft pigment that melts into the cheek for a natural, diffused flush. Buildable from a whisper to a statement.',
  'benefits', jsonb_build_array('Blends seamlessly, never patchy', 'Long-wear, 10 hours', 'Compact with mirror'),
  'how_to_use', 'Smile and sweep onto the apples of the cheeks, blending up toward the temples.',
  'ingredients', 'Talc, Mica, Zinc Stearate, Dimethicone, Caprylic/Capric Triglyceride, Tocopherol. May contain: CI 77891, CI 15850, CI 45410, CI 77491.',
  'size', '5 g', 'finish', 'Satin', 'suitability', 'All complexions.',
  'price', 749, 'best_seller', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Soft Peach', 'hex', '#F2A98F', 'undertone', 'warm'),
    jsonb_build_object('name', 'Rose Bloom', 'hex', '#E08A9C', 'undertone', 'cool'),
    jsonb_build_object('name', 'Warm Coral', 'hex', '#EE8C74', 'undertone', 'warm'),
    jsonb_build_object('name', 'Berry Flush', 'hex', '#C65C7C', 'undertone', 'cool')),
  'images', jsonb_build_array(seed_px('2533266', 'Blush compact beside a lipstick'), seed_px('1377034', 'Crushed powders and lip colours'))
));

select seed_product(jsonb_build_object(
  'slug', 'sculpt-contour-stick', 'name', 'Sculpt Contour Stick', 'category', 'face', 'subcategory', 'contour',
  'short', 'A cool-toned cream stick for natural shadow and structure.',
  'description', 'A creamy stick in shadow-true tones that blend into a soft, believable contour with fingertips or a brush.',
  'benefits', jsonb_build_array('Cool-toned for realistic shadow', 'Creamy, blendable, non-greasy', 'Sets to a natural finish'),
  'how_to_use', 'Draw beneath the cheekbones, along the jaw and at the temples. Blend upward with a dense brush.',
  'ingredients', 'Caprylic/Capric Triglyceride, Synthetic Wax, Dimethicone, Silica, Tocopherol. May contain: CI 77891, CI 77491, CI 77492, CI 77499.',
  'size', '6 g', 'finish', 'Matte', 'suitability', 'All skin types.',
  'price', 899,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Fair', 'hex', '#C9A088'),
    jsonb_build_object('name', 'Medium', 'hex', '#A97B5E'),
    jsonb_build_object('name', 'Tan', 'hex', '#8C6047'),
    jsonb_build_object('name', 'Deep', 'hex', '#5E3E2E')),
  'images', jsonb_build_array(seed_u('1599305090598-fe179d501227', 'Beige cream compacts in soft light'), seed_u('1596462502278-27bfdc403348', 'Makeup flat lay on beige'))
));

select seed_product(jsonb_build_object(
  'slug', 'lumiere-highlighter', 'name', 'Lumière Highlighter', 'category', 'face', 'subcategory', 'highlighter',
  'short', 'A glassy, high-shine powder that melts into skin.',
  'description', 'Pearl-rich pigments in a cream-to-powder base for a wet-look glow with no visible glitter.',
  'benefits', jsonb_build_array('Glass-skin shine, zero glitter', 'Cream-to-powder texture', 'Layers over any finish'),
  'how_to_use', 'Tap onto the high points of the face — cheekbones, brow bone, bridge of the nose and cupid’s bow.',
  'ingredients', 'Synthetic Fluorphlogopite, Mica, Dimethicone, Isononyl Isononanoate, Tocopherol. May contain: CI 77891, CI 77491, CI 77492.',
  'size', '6 g', 'finish', 'Luminous', 'suitability', 'All complexions.',
  'price', 949, 'new', true,
  'shades', jsonb_build_array(
    jsonb_build_object('name', 'Champagne', 'hex', '#F1DDBE'),
    jsonb_build_object('name', 'Rose Gold', 'hex', '#E7B8A6'),
    jsonb_build_object('name', 'Bronze Glow', 'hex', '#C98D64')),
  'images', jsonb_build_array(seed_px('1377034', 'Crushed powders and lip colours'), seed_u('1585652757141-8837d676fac8', 'Close-up of luminous skin'))
));

select seed_product(jsonb_build_object(
  'slug', 'dew-set-setting-spray', 'name', 'Dew Set Setting Spray', 'category', 'face', 'subcategory', 'setting-spray',
  'short', 'A fine mist that locks makeup for 16 hours.',
  'description', 'An ultra-fine, alcohol-free mist that melts powders into skin and holds everything in place. Choose Dewy for glow or Matte for shine control.',
  'benefits', jsonb_build_array('16-hour hold', 'Alcohol-free, non-drying', 'Ultra-fine, even mist'),
  'how_to_use', 'Hold 20 cm from the face and mist in an X and T motion. Let dry naturally.',
  'ingredients', 'Aqua, Glycerin, PVP, Propanediol, Aloe Barbadensis Leaf Juice, Phenoxyethanol.',
  'size', '100 ml', 'suitability', 'All skin types.',
  'price', 699,
  'variants', jsonb_build_array(
    jsonb_build_object('name', 'Dewy Finish', 'options', jsonb_build_object('finish', 'Dewy')),
    jsonb_build_object('name', 'Matte Finish', 'options', jsonb_build_object('finish', 'Matte'))),
  'images', jsonb_build_array(seed_px('3762879', 'Hand holding a skincare dropper on peach'), seed_px('3785147', 'Beige bottles on a soft surface'))
));

-- ---------------------------------------------------------------------------
-- BRUSHES & TOOLS
-- ---------------------------------------------------------------------------
select seed_product(jsonb_build_object(
  'slug', 'foundation-buffing-brush', 'name', 'Foundation Buffing Brush', 'category', 'brushes-tools', 'subcategory', 'makeup-brushes',
  'short', 'A dense, dome-shaped brush for an airbrushed base.', 'description', 'Densely packed synthetic fibres buff liquid and cream foundation to a streak-free, skin-like finish.',
  'benefits', jsonb_build_array('Streak-free finish', 'Cruelty-free synthetic fibres', 'Hand-finished wooden handle'),
  'how_to_use', 'Buff foundation in small circular motions, starting at the centre of the face.', 'ingredients', 'Synthetic fibre, aluminium ferrule, FSC-certified wooden handle.',
  'size', '1 brush', 'price', 599, 'best_seller', true,
  'images', jsonb_build_array(seed_u('1516975080664-ed2fc6a32937', 'Makeup brushes in a cup'), seed_u('1610348725531-843dff563e2c', 'Pink-handled makeup brushes'))
));
select seed_product(jsonb_build_object(
  'slug', 'blush-contour-brush', 'name', 'Blush & Contour Brush', 'category', 'brushes-tools', 'subcategory', 'makeup-brushes',
  'short', 'An angled brush that sculpts and flushes in one.', 'description', 'A tapered, angled head that hugs the cheekbone for precise contour and diffused blush.',
  'benefits', jsonb_build_array('Angled for the cheekbone', 'Soft, dense synthetic fibres'), 'how_to_use', 'Sweep contour beneath the cheekbone; flip to the fluffier edge for blush.',
  'ingredients', 'Synthetic fibre, aluminium ferrule, wooden handle.', 'size', '1 brush', 'price', 549,
  'images', jsonb_build_array(seed_u('1610348725531-843dff563e2c', 'Pink-handled makeup brushes'), seed_u('1516975080664-ed2fc6a32937', 'Makeup brushes in a cup'))
));
select seed_product(jsonb_build_object(
  'slug', 'eyeshadow-blending-brush', 'name', 'Eyeshadow Blending Brush', 'category', 'brushes-tools', 'subcategory', 'makeup-brushes',
  'short', 'A fluffy crease brush for seamless transitions.', 'description', 'Loosely packed fibres diffuse shadow through the crease with zero harsh lines.',
  'benefits', jsonb_build_array('Fluffy, tapered head', 'Ideal for crease and transition shades'), 'how_to_use', 'Use windshield-wiper motions through the crease.',
  'ingredients', 'Synthetic fibre, aluminium ferrule, wooden handle.', 'size', '1 brush', 'price', 399,
  'images', jsonb_build_array(seed_u('1516975080664-ed2fc6a32937', 'Makeup brushes in a cup'), seed_px('2253834', 'Palette with brushes'))
));
select seed_product(jsonb_build_object(
  'slug', 'precision-lip-brush', 'name', 'Precision Lip Brush', 'category', 'brushes-tools', 'subcategory', 'makeup-brushes',
  'short', 'A fine, firm tip for a perfectly crisp lip.', 'description', 'A flat, firm brush with a retractable cover for precise lipstick application on the go.',
  'benefits', jsonb_build_array('Retractable, travel-ready', 'Crisp, controlled edges'), 'how_to_use', 'Load with lipstick and trace the lip line before filling in.',
  'ingredients', 'Synthetic fibre, aluminium ferrule.', 'size', '1 brush', 'price', 349,
  'images', jsonb_build_array(seed_u('1610348725531-843dff563e2c', 'Pink-handled makeup brushes'), seed_px('457701', 'Lip colour being applied'))
));
select seed_product(jsonb_build_object(
  'slug', 'velvet-blending-sponge', 'name', 'Velvet Blending Sponge', 'category', 'brushes-tools', 'subcategory', 'makeup-sponges',
  'short', 'A latex-free sponge that doubles in size when damp.', 'description', 'A super-soft, latex-free sponge with a rounded base for blending and a pointed tip for precision.',
  'benefits', jsonb_build_array('Latex-free, hypoallergenic', 'Absorbs less product than traditional sponges'), 'how_to_use', 'Wet, squeeze out excess water and bounce foundation into the skin.',
  'ingredients', 'Non-latex polyurethane foam.', 'size', '1 sponge', 'price', 299,
  'variants', jsonb_build_array(
    jsonb_build_object('name', 'Single', 'options', jsonb_build_object('pack', '1'), 'qty', 80),
    jsonb_build_object('name', 'Pack of 3', 'options', jsonb_build_object('pack', '3'), 'price', 749, 'qty', 40)),
  'images', jsonb_build_array(seed_px('3018845', 'Makeup pouch with sponges and brushes'), seed_px('3373739', 'Makeup bag with tools'))
));
select seed_product(jsonb_build_object(
  'slug', 'powder-puff-duo', 'name', 'Powder Puff Duo', 'category', 'brushes-tools', 'subcategory', 'powder-sponges',
  'short', 'Two velour puffs for pressing and setting powder.', 'description', 'Plush velour puffs with a ribbon strap for baking, pressing and touching up.',
  'benefits', jsonb_build_array('Pack of two', 'Machine washable'), 'how_to_use', 'Load with powder, press into skin and let sit for 2 minutes before dusting off.',
  'ingredients', 'Velour, satin ribbon.', 'size', '2 puffs', 'price', 349,
  'images', jsonb_build_array(seed_u('1515688594390-b649af70d282', 'Loose powders with brushes'), seed_px('3018845', 'Makeup pouch with sponges and brushes'))
));
select seed_product(jsonb_build_object(
  'slug', 'essential-brush-set', 'name', 'Essential Brush Set — 8 Piece', 'category', 'brushes-tools', 'subcategory', 'brush-sets',
  'short', 'Eight face and eye brushes in a vegan leather roll.', 'description', 'The edit you actually use: foundation, powder, blush, contour, two shadow brushes, a smudger and a brow spoolie.',
  'benefits', jsonb_build_array('8 hand-finished brushes', 'Vegan leather travel roll', 'Save ₹500 versus buying separately'),
  'how_to_use', 'Wash weekly with a gentle cleanser and dry flat.', 'ingredients', 'Synthetic fibre, aluminium ferrules, wooden handles, vegan leather roll.',
  'size', '8 brushes', 'price', 2499, 'compare_at', 2999, 'best_seller', true, 'qty', 25,
  'images', jsonb_build_array(seed_u('1610348725531-843dff563e2c', 'Pink-handled brush collection'), seed_u('1516975080664-ed2fc6a32937', 'Makeup brushes in a cup'))
));
select seed_product(jsonb_build_object(
  'slug', 'pro-brush-set', 'name', 'Pro Brush Set — 12 Piece', 'category', 'brushes-tools', 'subcategory', 'brush-sets',
  'short', 'The complete artist collection in a structured case.', 'description', 'Twelve professional brushes covering every step of the face and eye, in a rigid champagne case.',
  'benefits', jsonb_build_array('12 professional brushes', 'Structured champagne case', 'Save ₹900 versus buying separately'),
  'how_to_use', 'Wash weekly with a gentle cleanser and dry flat.', 'ingredients', 'Synthetic fibre, aluminium ferrules, wooden handles.',
  'size', '12 brushes', 'price', 3499, 'compare_at', 4399, 'new', true, 'qty', 15,
  'images', jsonb_build_array(seed_u('1516975080664-ed2fc6a32937', 'Makeup brushes in a cup'), seed_u('1610348725531-843dff563e2c', 'Pink-handled brush collection'))
));
select seed_product(jsonb_build_object(
  'slug', 'lash-curler', 'name', 'Precision Lash Curler', 'category', 'brushes-tools', 'subcategory', 'beauty-tools',
  'short', 'A wide, curved curler that fits every eye shape.', 'description', 'Silicone pads and a wide arc lift lashes from root to tip without pinching.',
  'benefits', jsonb_build_array('Fits all eye shapes', 'Two replacement pads included'), 'how_to_use', 'Squeeze gently at the root for 5 seconds, then again at the mid-length.',
  'ingredients', 'Stainless steel, silicone.', 'size', '1 curler + 2 pads', 'price', 599,
  'images', jsonb_build_array(seed_px('3762663', 'Mascara being applied to lashes'), seed_px('3373739', 'Makeup bag with tools'))
));
select seed_product(jsonb_build_object(
  'slug', 'brush-cleansing-mat', 'name', 'Brush Cleansing Mat', 'category', 'brushes-tools', 'subcategory', 'beauty-tools',
  'short', 'A textured silicone mat that deep-cleans brushes in seconds.', 'description', 'Seven textures to loosen product from every brush shape. Suctions to any sink.',
  'benefits', jsonb_build_array('Suction base', 'Dishwasher safe'), 'how_to_use', 'Wet the brush, add cleanser and swirl over the textures. Rinse and dry flat.',
  'ingredients', 'Food-grade silicone.', 'size', '1 mat', 'price', 449,
  'images', jsonb_build_array(seed_px('3373739', 'Makeup bag with tools'), seed_px('3018845', 'Makeup pouch with sponges and brushes'))
));
select seed_product(jsonb_build_object(
  'slug', 'sharpener-duo', 'name', 'Dual Pencil Sharpener', 'category', 'brushes-tools', 'subcategory', 'beauty-tools',
  'short', 'Two blade sizes for lip, eye and brow pencils.', 'description', 'A compact dual sharpener with a catch-cap and cleaning pick.',
  'benefits', jsonb_build_array('Fits standard and jumbo pencils', 'Catch-cap keeps bags clean'), 'how_to_use', 'Twist the pencil gently; clean the blade with the pick.',
  'ingredients', 'ABS plastic, stainless steel blades.', 'size', '1 sharpener', 'price', 249, 'qty', 120,
  'images', jsonb_build_array(seed_px('2693644', 'Pencils fanned on a dark surface'), seed_px('3373739', 'Makeup bag with tools'))
));

-- ---------------------------------------------------------------------------
-- Recommendations (complete_look / also_like / bundle)
-- ---------------------------------------------------------------------------
insert into product_recommendations (product_id, recommended_product_id, kind, sort_order)
select a.id, b.id, r.kind::recommendation_kind, r.ord
from (values
  ('signature-lip-liner', 'signature-lipstick', 'complete_look', 1), ('signature-lip-liner', 'signature-lip-gloss', 'complete_look', 2),
  ('signature-lipstick', 'signature-lip-liner', 'complete_look', 1), ('signature-lipstick', 'signature-lip-gloss', 'complete_look', 2),
  ('signature-lip-gloss', 'signature-lipstick', 'complete_look', 1), ('signature-lip-gloss', 'signature-lip-liner', 'complete_look', 2),
  ('velvet-matte-lipstick', 'signature-lip-liner', 'complete_look', 1), ('velvet-matte-lipstick', 'precision-lip-brush', 'complete_look', 2),
  ('skin-veil-serum-foundation', 'soft-focus-concealer', 'complete_look', 1), ('skin-veil-serum-foundation', 'silk-setting-powder', 'complete_look', 2),
  ('skin-veil-serum-foundation', 'foundation-buffing-brush', 'complete_look', 3), ('skin-veil-serum-foundation', 'dew-set-setting-spray', 'complete_look', 4),
  ('velvet-matte-foundation', 'silk-setting-powder', 'complete_look', 1), ('velvet-matte-foundation', 'foundation-buffing-brush', 'complete_look', 2),
  ('soft-focus-concealer', 'colour-correcting-cream', 'complete_look', 1), ('soft-focus-concealer', 'velvet-blending-sponge', 'complete_look', 2),
  ('cheek-bloom-blush', 'lumiere-highlighter', 'complete_look', 1), ('cheek-bloom-blush', 'blush-contour-brush', 'complete_look', 2),
  ('sculpt-contour-stick', 'blush-contour-brush', 'complete_look', 1), ('sculpt-contour-stick', 'lumiere-highlighter', 'complete_look', 2),
  ('precision-liquid-eyeliner', 'elare-waterproof-mascara', 'complete_look', 1), ('precision-liquid-eyeliner', 'eyeshadow-palette-01-soft-everyday', 'complete_look', 2),
  ('elare-waterproof-mascara', 'lash-curler', 'complete_look', 1), ('elare-waterproof-mascara', 'precision-liquid-eyeliner', 'complete_look', 2),
  ('elare-non-waterproof-mascara', 'lash-curler', 'complete_look', 1), ('elare-non-waterproof-mascara', 'kohl-pencil-eyeliner', 'complete_look', 2),
  ('eyeshadow-palette-01-soft-everyday', 'eyeshadow-blending-brush', 'complete_look', 1), ('eyeshadow-palette-02-bold-evening', 'eyeshadow-blending-brush', 'complete_look', 1),
  ('brow-define-pencil', 'brow-sculpt-palette', 'also_like', 1), ('brow-define-pencil', 'brow-ink-pen', 'also_like', 2),
  ('essential-brush-set', 'brush-cleansing-mat', 'complete_look', 1), ('pro-brush-set', 'brush-cleansing-mat', 'complete_look', 1),
  -- natural bundles surfaced on the home page until real co-purchase data accrues
  ('signature-lip-liner', 'signature-lipstick', 'bundle', 1), ('signature-lipstick', 'signature-lip-gloss', 'bundle', 2),
  ('skin-veil-serum-foundation', 'silk-setting-powder', 'bundle', 3)
) as r(a_slug, b_slug, kind, ord)
join products a on a.slug = r.a_slug join products b on b.slug = r.b_slug;

-- ---------------------------------------------------------------------------
-- Coupons
-- ---------------------------------------------------------------------------
insert into coupons (code, description, type, value, min_order_value, max_discount, scope, category_ids, first_order_only, expires_at, usage_limit, per_user_limit, is_active, is_public)
values
  ('WELCOME10', '10% off your first order', 'percentage', 10, 799, 400, 'all', '{}', true, null, null, 1, true, true),
  ('ELARE200', '₹200 off orders above ₹1,999', 'fixed', 200, 1999, null, 'all', '{}', false, now() + interval '90 days', 500, 2, true, true),
  ('LIPLOVE15', '15% off everything in Lips', 'percentage', 15, 999, 600, 'categories', array[(select id from categories where slug = 'lips')], false, now() + interval '60 days', null, 3, true, true);

-- ---------------------------------------------------------------------------
-- Free-gift rule: 6+ qualifying products unlock the Mini Lip Balm
-- ---------------------------------------------------------------------------
insert into gift_rules (name, min_quantity, gift_variant_id, gift_quantity, is_active)
select 'Complimentary Mini Lip Balm', 6, v.id, 1, true
from product_variants v join products p on p.id = v.product_id where p.slug = 'mini-lip-balm-gift';

drop function seed_product(jsonb);
drop function seed_u(text, text);
drop function seed_px(text, text);
