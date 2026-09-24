-- Email verification with a 4-digit code at sign-up.
--
-- Neon Auth creates the account from the browser before we can verify the
-- address, so the account exists but profiles.email_verified stays false until
-- the customer confirms the code the API emailed them. require_user() refuses
-- unverified accounts, so every customer action (cart, checkout, orders,
-- wishlist, reviews, points) is closed to them until then.
--
-- Codes are generated and hashed in the API (HMAC with a server secret); this
-- table only ever sees the hash. It is reachable only by the database owner:
-- RLS is on with no policies and nothing is granted to authenticated/anonymous.

alter table profiles add column if not exists email_verified boolean not null default false;

-- Everyone who signed up before verification existed keeps full access.
update profiles set email_verified = true where not email_verified;

create table if not exists email_otps (
  email           text primary key,                 -- lower-cased
  user_id         uuid not null,
  code_hash       text not null,                    -- HMAC-SHA256, never the code
  expires_at      timestamptz not null,
  attempts        int not null default 0,
  last_sent_at    timestamptz not null default now(),
  window_start    timestamptz not null default now(),
  sends_in_window int not null default 1,
  consumed_at     timestamptz
);
alter table email_otps enable row level security;
revoke all on email_otps from public, authenticated, anonymous;

-- A new profile inherits Neon Auth's own flag (true for OAuth sign-ins, say).
create or replace function _ensure_profile(p_uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text; v_name text; v_verified boolean;
begin
  if p_uid is null then return; end if;
  if exists (select 1 from profiles where id = p_uid) then return; end if;
  select u.email, u.name, u."emailVerified" into v_email, v_name, v_verified from neon_auth."user" u where u.id = p_uid;
  if v_email is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  insert into profiles (id, email, full_name, email_verified) values (p_uid, v_email, nullif(v_name, ''), coalesce(v_verified, false))
  on conflict (id) do nothing;
  insert into loyalty_accounts (user_id) values (p_uid) on conflict do nothing;
  insert into wishlists (user_id) values (p_uid) on conflict do nothing;
  insert into carts (user_id) values (p_uid) on conflict do nothing;
end $$;

-- The profile the client sees now says whether the email is verified.
create or replace function ensure_profile(p_full_name text default null, p_phone text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  perform _ensure_profile(v_uid);
  update profiles set full_name = coalesce(nullif(trim(p_full_name), ''), full_name), phone = coalesce(nullif(trim(p_phone), ''), phone)
   where id = v_uid and (p_full_name is not null or p_phone is not null);
  return (select jsonb_build_object('id', id, 'email', email, 'full_name', full_name, 'phone', phone, 'avatar_url', avatar_url,
                                    'role', role, 'status', status, 'email_verified', email_verified) from profiles where id = v_uid);
end $$;

-- Every customer-facing function goes through here: unverified accounts stop.
create or replace function require_user() returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform _ensure_profile(v_uid);
  if exists (select 1 from profiles where id = v_uid and status = 'suspended') then
    raise exception 'account suspended' using errcode = '42501';
  end if;
  if exists (select 1 from profiles where id = v_uid and not email_verified) then
    raise exception 'email not verified' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- Customers can't mark themselves verified through the Data API either.
create or replace function protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin() then
    if new.role is distinct from old.role or new.status is distinct from old.status or new.email is distinct from old.email
       or new.email_verified is distinct from old.email_verified then
      raise exception 'not allowed' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Issues (or re-issues) the code for an unverified account. The previous code
-- stops working immediately. Returns {status: sent | cooldown | rate_limited |
-- not_applicable, retry_after?}; not_applicable (no such account, or already
-- verified) is answered like `sent` by the API so emails can't be enumerated.
create or replace function email_otp_issue(p_email text, p_code_hash text, p_ttl_seconds int, p_cooldown_seconds int, p_max_per_hour int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
  v_row email_otps;
begin
  select u.id into v_uid from neon_auth."user" u where lower(u.email) = v_email;
  if v_uid is null then return jsonb_build_object('status', 'not_applicable'); end if;
  if exists (select 1 from profiles where id = v_uid and email_verified) then
    return jsonb_build_object('status', 'not_applicable');
  end if;

  select * into v_row from email_otps where email = v_email for update;
  if not found then
    insert into email_otps (email, user_id, code_hash, expires_at)
    values (v_email, v_uid, p_code_hash, now() + make_interval(secs => p_ttl_seconds))
    on conflict (email) do nothing;
    if not found then  -- a concurrent request just issued one
      return jsonb_build_object('status', 'cooldown', 'retry_after', p_cooldown_seconds);
    end if;
    return jsonb_build_object('status', 'sent');
  end if;

  if v_row.last_sent_at > now() - make_interval(secs => p_cooldown_seconds) then
    return jsonb_build_object('status', 'cooldown',
      'retry_after', greatest(1, ceil(extract(epoch from (v_row.last_sent_at + make_interval(secs => p_cooldown_seconds) - now()))))::int);
  end if;
  if v_row.window_start > now() - interval '1 hour' and v_row.sends_in_window >= p_max_per_hour then
    return jsonb_build_object('status', 'rate_limited',
      'retry_after', greatest(1, ceil(extract(epoch from (v_row.window_start + interval '1 hour' - now()))))::int);
  end if;

  update email_otps set
    user_id = v_uid,
    code_hash = p_code_hash,
    expires_at = now() + make_interval(secs => p_ttl_seconds),
    attempts = 0,
    consumed_at = null,
    last_sent_at = now(),
    sends_in_window = case when window_start > now() - interval '1 hour' then sends_in_window + 1 else 1 end,
    window_start    = case when window_start > now() - interval '1 hour' then window_start else now() end
  where email = v_email;
  return jsonb_build_object('status', 'sent');
end $$;

-- Checks a code. The row is locked, so parallel guesses can't exceed the
-- attempt limit. On success the code is spent and the account verified.
-- Returns {status: verified | invalid | expired | locked, attempts_left?}.
create or replace function email_otp_verify(p_email text, p_code_hash text, p_max_attempts int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_row email_otps;
begin
  select * into v_row from email_otps where email = v_email for update;
  if not found or v_row.consumed_at is not null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_row.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if v_row.attempts >= p_max_attempts then
    return jsonb_build_object('status', 'locked');
  end if;
  if v_row.code_hash is distinct from p_code_hash then
    update email_otps set attempts = attempts + 1 where email = v_email;
    if v_row.attempts + 1 >= p_max_attempts then
      return jsonb_build_object('status', 'locked');
    end if;
    return jsonb_build_object('status', 'invalid', 'attempts_left', p_max_attempts - v_row.attempts - 1);
  end if;

  update email_otps set consumed_at = now() where email = v_email;
  perform _ensure_profile(v_row.user_id);
  update profiles set email_verified = true, updated_at = now() where id = v_row.user_id;
  -- Keep Neon Auth's own flag in step; never let that fail the verification.
  begin
    update neon_auth."user" set "emailVerified" = true where id = v_row.user_id;
  exception when others then null;
  end;
  return jsonb_build_object('status', 'verified');
end $$;

-- Owner-only: the API calls these after its own rate limiting.
revoke execute on function email_otp_issue(text, text, int, int, int), email_otp_verify(text, text, int) from public, authenticated, anonymous;
