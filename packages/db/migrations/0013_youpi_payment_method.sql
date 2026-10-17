-- YouPI: a second online payment option (UPI QR, settled into the merchant's
-- own bank account), alongside Razorpay.
--
-- An order paid via YouPI behaves exactly like a Razorpay order: it is placed
-- 'pending', a payments row (provider 'youpi') waits for settlement, and the
-- API settles it with mark_order_paid once the YouPI gateway confirms — by a
-- signed webhook or by the API asking the gateway directly. Settlement now
-- follows the order's own payment method instead of assuming Razorpay.

alter type payment_method add value if not exists 'youpi' before 'cod';

-- place_order: unchanged except that 'youpi' is an accepted method.
create or replace function place_order(
  p_items          jsonb,
  p_address        jsonb,
  p_payment_method text,
  p_coupon_code    text default null,
  p_redeem_points  int default 0,
  p_note           text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := require_user();
  v_method  payment_method;
  v_q       jsonb;
  v_line    jsonb;
  v_order   orders;
  v_stock   int;
  v_addr    jsonb;
begin
  v_method := p_payment_method::payment_method;
  if v_method not in ('razorpay', 'youpi', 'cod') then
    raise exception 'unsupported payment method';
  end if;

  -- Validate the address shape (values are stored as a snapshot on the order).
  v_addr := jsonb_build_object(
    'full_name',   trim(coalesce(p_address ->> 'full_name', '')),
    'phone',       trim(coalesce(p_address ->> 'phone', '')),
    'email',       trim(coalesce(p_address ->> 'email', '')),
    'line1',       trim(coalesce(p_address ->> 'line1', '')),
    'line2',       trim(coalesce(p_address ->> 'line2', '')),
    'city',        trim(coalesce(p_address ->> 'city', '')),
    'state',       trim(coalesce(p_address ->> 'state', '')),
    'postal_code', trim(coalesce(p_address ->> 'postal_code', '')),
    'country',     coalesce(nullif(trim(p_address ->> 'country'), ''), 'IN'));
  if (v_addr ->> 'full_name') = '' or (v_addr ->> 'phone') = '' or (v_addr ->> 'line1') = ''
     or (v_addr ->> 'city') = '' or (v_addr ->> 'state') = '' or (v_addr ->> 'postal_code') = '' then
    raise exception 'Please complete your delivery address.';
  end if;

  -- Lock the inventory rows we are about to touch, in a stable order, then price under the lock.
  perform 1 from inventory i
   where i.variant_id in (select (e ->> 'variant_id')::uuid from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e)
   order by i.variant_id for update;
  perform 1 from inventory i where i.variant_id in (select gift_variant_id from gift_rules where is_active) order by i.variant_id for update;

  v_q := _quote(v_uid, p_items, p_coupon_code, p_redeem_points);
  if not (v_q ->> 'ok')::boolean then
    raise exception '%', coalesce(v_q -> 'issues' -> 0 ->> 'message', 'Your bag is empty.');
  end if;
  if p_coupon_code is not null and trim(p_coupon_code) <> '' and not (v_q -> 'coupon' ->> 'valid')::boolean then
    raise exception '%', v_q -> 'coupon' ->> 'message';
  end if;
  if coalesce(p_redeem_points, 0) > 0 and (v_q -> 'points' ->> 'applied')::int = 0 then
    raise exception '%', coalesce(v_q -> 'points' ->> 'message', 'Points could not be applied.');
  end if;

  insert into orders (user_id, status, payment_status, payment_method, subtotal, coupon_id, coupon_code, coupon_discount,
                      points_redeemed, points_discount, shipping_total, tax_total, grand_total, points_earned, shipping_address, customer_note)
  values (v_uid,
          (case when v_method = 'cod' then 'confirmed' else 'pending' end)::order_status,
          (case when v_method = 'cod' then 'cod' else 'pending' end)::payment_status,
          v_method,
          (v_q ->> 'subtotal')::numeric,
          (v_q -> 'coupon' ->> 'coupon_id')::uuid, v_q -> 'coupon' ->> 'code', coalesce((v_q -> 'coupon' ->> 'discount')::numeric, 0),
          (v_q -> 'points' ->> 'applied')::int, (v_q -> 'points' ->> 'discount')::numeric,
          (v_q ->> 'shipping')::numeric, (v_q ->> 'tax')::numeric, (v_q ->> 'total')::numeric,
          (v_q ->> 'points_to_earn')::int, v_addr, nullif(trim(coalesce(p_note, '')), ''))
  returning * into v_order;

  for v_line in select * from jsonb_array_elements(v_q -> 'lines') loop
    insert into order_items (order_id, product_id, variant_id, product_name, variant_name, shade_name, shade_hex, image_url,
                             unit_price, quantity, line_total, is_gift, points_earned)
    values (v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, v_line ->> 'product_name', v_line ->> 'variant_name',
            v_line ->> 'shade_name', v_line ->> 'shade_hex', v_line ->> 'image_url',
            (v_line ->> 'unit_price')::numeric, (v_line ->> 'quantity')::int, (v_line ->> 'line_total')::numeric,
            (v_line ->> 'is_gift')::boolean, coalesce((v_line ->> 'points')::int, 0));

    update inventory set quantity = quantity - (v_line ->> 'quantity')::int
     where variant_id = (v_line ->> 'variant_id')::uuid
     returning quantity into v_stock;
    if v_stock is null or v_stock < 0 then
      raise exception 'Not enough stock for %', v_line ->> 'product_name';
    end if;
    insert into inventory_movements (variant_id, delta, reason, reference, created_by)
    values ((v_line ->> 'variant_id')::uuid, -((v_line ->> 'quantity')::int),
            (case when (v_line ->> 'is_gift')::boolean then 'gift' else 'sale' end)::inventory_reason, v_order.order_number, v_uid);

    if (v_line ->> 'is_gift')::boolean then
      insert into free_gifts (order_id, gift_rule_id, variant_id, quantity)
      values (v_order.id, (v_line ->> 'gift_rule_id')::uuid, (v_line ->> 'variant_id')::uuid, (v_line ->> 'quantity')::int);
    end if;
  end loop;

  if v_order.coupon_id is not null then
    insert into coupon_usage (coupon_id, user_id, order_id, discount_amount)
    values (v_order.coupon_id, v_uid, v_order.id, v_order.coupon_discount);
  end if;

  if v_order.points_redeemed > 0 then
    perform _loyalty_apply(v_uid, 'redeem', -v_order.points_redeemed, v_order.id, 'Redeemed on order ' || v_order.order_number, v_uid);
  end if;

  insert into payments (order_id, provider, amount, status)
  values (v_order.id, v_method, v_order.grand_total, (case when v_method = 'cod' then 'cod' else 'pending' end)::payment_status);

  -- The server-side cart is spent.
  delete from cart_items where cart_id = (select id from carts where user_id = v_uid);

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'grand_total', v_order.grand_total,
                            'payment_method', v_method, 'status', v_order.status);
end $$;

-- Settles whichever gateway the order was placed with.
create or replace function mark_order_paid(p_order_id uuid, p_provider_order_id text, p_provider_payment_id text, p_raw jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_o orders;
begin
  select * into v_o from orders where id = p_order_id for update;
  if not found then raise exception 'order not found'; end if;
  if v_o.payment_status = 'paid' then
    return jsonb_build_object('order_id', v_o.id, 'already', true);
  end if;
  update payments set status = 'paid', provider_order_id = coalesce(p_provider_order_id, provider_order_id),
         provider_payment_id = p_provider_payment_id, raw = coalesce(p_raw, raw)
   where order_id = v_o.id and provider = v_o.payment_method;
  update orders set payment_status = 'paid', status = case when status = 'pending' then 'confirmed' else status end
   where id = v_o.id;
  return jsonb_build_object('order_id', v_o.id, 'already', false);
end $$;

create or replace function mark_payment_failed(p_order_id uuid, p_raw jsonb default null) returns void
language sql security definer set search_path = public as $$
  update payments p set status = 'failed', raw = coalesce(p_raw, p.raw)
    from orders o
   where o.id = p_order_id and p.order_id = o.id and p.provider = o.payment_method and p.status = 'pending';
$$;
