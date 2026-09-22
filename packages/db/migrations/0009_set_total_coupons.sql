-- set_total coupons: the eligible items are discounted down to `value` and
-- shipping is waived. `value` is the amount payable, so 0 is not allowed.
alter table coupons drop constraint if exists coupons_value_check;
alter table coupons add constraint coupons_value_check check (value > 0 or type = 'free_shipping');

create or replace function _validate_coupon(p_code text, p_user_id uuid, p_lines jsonb, p_subtotal numeric) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c        coupons;
  v_eligible numeric := 0;
  v_discount numeric := 0;
  v_used     int;
begin
  if p_code is null or trim(p_code) = '' then
    return jsonb_build_object('valid', false, 'code', null, 'discount', 0, 'message', null);
  end if;

  select * into v_c from coupons where upper(code) = upper(trim(p_code));
  if not found then
    return jsonb_build_object('valid', false, 'code', upper(trim(p_code)), 'discount', 0, 'message', 'That code is not valid.');
  end if;
  if not v_c.is_active then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon is no longer active.');
  end if;
  if v_c.starts_at > now() then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon is not active yet.');
  end if;
  if v_c.expires_at is not null and v_c.expires_at <= now() then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon has expired.');
  end if;
  if v_c.usage_limit is not null then
    select count(*) into v_used from coupon_usage where coupon_id = v_c.id;
    if v_used >= v_c.usage_limit then
      return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon has been fully redeemed.');
    end if;
  end if;
  if p_user_id is not null then
    select count(*) into v_used from coupon_usage where coupon_id = v_c.id and user_id = p_user_id;
    if v_used >= v_c.per_user_limit then
      return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'You have already used this coupon.');
    end if;
    if v_c.first_order_only and exists (select 1 from orders o where o.user_id = p_user_id and o.status not in ('cancelled')) then
      return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon is valid on your first order only.');
    end if;
  end if;

  -- Eligible subtotal depends on scope.
  select coalesce(sum((l ->> 'line_total')::numeric), 0) into v_eligible
  from jsonb_array_elements(p_lines) l
  where (l ->> 'is_gift')::boolean = false
    and (v_c.scope = 'all'
      or (v_c.scope = 'products'   and (l ->> 'product_id')::uuid = any(v_c.product_ids))
      or (v_c.scope = 'categories' and (l ->> 'category_id')::uuid = any(v_c.category_ids)));

  if v_eligible <= 0 then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0, 'message', 'This coupon does not apply to the items in your bag.');
  end if;
  if p_subtotal < v_c.min_order_value then
    return jsonb_build_object('valid', false, 'code', v_c.code, 'discount', 0,
      'message', 'Add ₹' || to_char(v_c.min_order_value - p_subtotal, 'FM999999990.00') || ' more to use this coupon.');
  end if;

  -- set_total: whatever is in the bag, the customer pays `value` and delivery is free (testing the gateway).
  if v_c.type = 'set_total' then
    v_discount := greatest(v_eligible - v_c.value, 0);
    return jsonb_build_object('valid', true, 'coupon_id', v_c.id, 'code', v_c.code, 'discount', v_discount, 'free_shipping', true,
      'message', 'Coupon applied — you pay ₹' || to_char(v_c.value, 'FM999999990.00') || '.', 'description', v_c.description);
  end if;

  if v_c.type = 'free_shipping' then
    return jsonb_build_object('valid', true, 'coupon_id', v_c.id, 'code', v_c.code, 'discount', 0, 'free_shipping', true,
      'message', 'Coupon applied — delivery is on us.', 'description', v_c.description);
  end if;

  v_discount := case v_c.type
    when 'percentage' then round(v_eligible * v_c.value / 100, 2)
    else least(v_c.value, v_eligible) end;
  if v_c.max_discount is not null then
    v_discount := least(v_discount, v_c.max_discount);
  end if;

  return jsonb_build_object('valid', true, 'coupon_id', v_c.id, 'code', v_c.code, 'discount', v_discount, 'free_shipping', false,
    'message', 'Coupon applied — you save ₹' || to_char(v_discount, 'FM999999990.00') || '.', 'description', v_c.description);
end $$;
