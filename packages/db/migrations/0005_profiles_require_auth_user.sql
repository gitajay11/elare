-- A profile may only exist for a live Neon Auth user. Previously a valid JWT
-- for a deleted account could recreate its profile from the token's claims;
-- now such callers are treated as unauthenticated until the token expires.
create or replace function _ensure_profile(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text;
begin
  if p_uid is null then return; end if;
  if exists (select 1 from profiles where id = p_uid) then return; end if;
  select u.email, u.name into v_email, v_name from neon_auth."user" u where u.id = p_uid;
  if v_email is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  insert into profiles (id, email, full_name) values (p_uid, v_email, nullif(v_name, ''))
  on conflict (id) do nothing;
  insert into loyalty_accounts (user_id) values (p_uid) on conflict do nothing;
  insert into wishlists (user_id) values (p_uid) on conflict do nothing;
  insert into carts (user_id) values (p_uid) on conflict do nothing;
end $$;
