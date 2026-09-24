-- Deleting a customer's profile deletes their sign-in too.
--
-- The store's data (profiles, carts, orders, …) and the sign-in accounts
-- (neon_auth.user, managed by Neon Auth) live in different tables. Deleting
-- profiles alone — e.g. clearing customers in the Neon console — used to leave
-- the Neon Auth account behind, so the email stayed "taken" at sign-up and the
-- old password still worked. Now removing a profile removes the Neon Auth user
-- as well (its sessions and credentials go with it, by Neon Auth's own
-- cascades) and any pending email codes for it.

create or replace function _drop_auth_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from email_otps where user_id = old.id;
  delete from neon_auth."user" where id = old.id;
  return old;
end $$;

drop trigger if exists profiles_drop_auth_user on profiles;
create trigger profiles_drop_auth_user after delete on profiles
  for each row execute function _drop_auth_user();

revoke execute on function _drop_auth_user() from public, authenticated, anonymous;
