-- Forgot password with the same 4-digit email code as sign-up.
--
-- The code machinery from 0010 is reused, not copied: email_otps gains a
-- `purpose` ('signup' | 'reset'), so a sign-up code can never reset a password
-- and the other way round, and email_otp_issue / email_otp_verify take the
-- purpose as a last, defaulted argument (existing sign-up calls are unchanged).
--
-- A verified reset code does not change anything by itself. It leaves a
-- short-lived reset grant on the row (only its SHA-256 is stored); the API's
-- reset-password endpoint must present that grant to change the password. The
-- password itself is set by Neon Auth: password_reset_claim hands it a one-time
-- reset token, exactly like the ones in its own reset emails.

alter table email_otps add column if not exists purpose text not null default 'signup';
alter table email_otps drop constraint if exists email_otps_purpose_check;
alter table email_otps add constraint email_otps_purpose_check check (purpose in ('signup', 'reset'));
alter table email_otps drop constraint if exists email_otps_pkey;
alter table email_otps add primary key (email, purpose);
alter table email_otps add column if not exists grant_hash text;              -- SHA-256 of the reset grant
alter table email_otps add column if not exists grant_expires_at timestamptz;
alter table email_otps add column if not exists grant_claimed_at timestamptz; -- a reset in flight

drop function if exists email_otp_issue(text, text, int, int, int);
drop function if exists email_otp_verify(text, text, int);

-- Issues (or re-issues) a code; the previous code for the same purpose stops
-- working immediately. Returns {status, retry_after?}:
--   sent | cooldown | rate_limited
--   not_applicable  sign-up: no such account, or already verified (the API
--                   answers it like `sent`, so emails can't be enumerated)
--   not_found       reset: no account with this email
create or replace function email_otp_issue(p_email text, p_code_hash text, p_ttl_seconds int, p_cooldown_seconds int, p_max_per_hour int, p_purpose text default 'signup') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
  v_row email_otps;
begin
  if p_purpose not in ('signup', 'reset') then raise exception 'unknown code purpose' using errcode = '22023'; end if;
  select u.id into v_uid from neon_auth."user" u where lower(u.email) = v_email;
  if p_purpose = 'reset' then
    if v_uid is null then return jsonb_build_object('status', 'not_found'); end if;
  else
    if v_uid is null then return jsonb_build_object('status', 'not_applicable'); end if;
    if exists (select 1 from profiles where id = v_uid and email_verified) then
      return jsonb_build_object('status', 'not_applicable');
    end if;
  end if;

  select * into v_row from email_otps where email = v_email and purpose = p_purpose for update;
  if not found then
    insert into email_otps (email, purpose, user_id, code_hash, expires_at)
    values (v_email, p_purpose, v_uid, p_code_hash, now() + make_interval(secs => p_ttl_seconds))
    on conflict (email, purpose) do nothing;
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

  -- A new code also withdraws any reset grant the old one earned.
  update email_otps set
    user_id = v_uid,
    code_hash = p_code_hash,
    expires_at = now() + make_interval(secs => p_ttl_seconds),
    attempts = 0,
    consumed_at = null,
    grant_hash = null, grant_expires_at = null, grant_claimed_at = null,
    last_sent_at = now(),
    sends_in_window = case when window_start > now() - interval '1 hour' then sends_in_window + 1 else 1 end,
    window_start    = case when window_start > now() - interval '1 hour' then window_start else now() end
  where email = v_email and purpose = p_purpose;
  return jsonb_build_object('status', 'sent');
end $$;

-- Checks a code. The row is locked, so parallel guesses can't exceed the
-- attempt limit. On success the code is spent and the address counts as
-- verified (either purpose proves the customer reads this inbox); a reset code
-- also stores the grant the password change will need.
-- Returns {status: verified | invalid | expired | locked, attempts_left?}.
create or replace function email_otp_verify(p_email text, p_code_hash text, p_max_attempts int, p_purpose text default 'signup',
                                            p_grant_hash text default null, p_grant_ttl_seconds int default 600) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_row email_otps;
begin
  if p_purpose = 'reset' and coalesce(p_grant_hash, '') = '' then
    raise exception 'reset grant required' using errcode = '22023';
  end if;
  select * into v_row from email_otps where email = v_email and purpose = p_purpose for update;
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
    update email_otps set attempts = attempts + 1 where email = v_email and purpose = p_purpose;
    if v_row.attempts + 1 >= p_max_attempts then
      return jsonb_build_object('status', 'locked');
    end if;
    return jsonb_build_object('status', 'invalid', 'attempts_left', p_max_attempts - v_row.attempts - 1);
  end if;

  update email_otps set consumed_at = now(),
    grant_hash       = case when p_purpose = 'reset' then p_grant_hash end,
    grant_expires_at = case when p_purpose = 'reset' then now() + make_interval(secs => p_grant_ttl_seconds) end,
    grant_claimed_at = null
  where email = v_email and purpose = p_purpose;
  perform _ensure_profile(v_row.user_id);
  update profiles set email_verified = true, updated_at = now() where id = v_row.user_id and not email_verified;
  -- Keep Neon Auth's own flag in step; never let that fail the verification.
  begin
    update neon_auth."user" set "emailVerified" = true where id = v_row.user_id;
  exception when others then null;
  end;
  return jsonb_build_object('status', 'verified');
end $$;

-- Step 1 of a password change: checks the grant and, if it holds, gives Neon
-- Auth a one-time reset token (valid 2 minutes) for the API to redeem.
-- The grant is marked in flight so a double submit can't run twice.
-- Returns {status: ok | invalid | expired | busy}.
create or replace function password_reset_claim(p_email text, p_grant_hash text, p_auth_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_row email_otps;
begin
  select * into v_row from email_otps where email = v_email and purpose = 'reset' for update;
  if not found or v_row.grant_hash is null or v_row.grant_hash is distinct from p_grant_hash then
    return jsonb_build_object('status', 'invalid');
  end if;
  if v_row.grant_expires_at <= now() then
    update email_otps set grant_hash = null, grant_expires_at = null, grant_claimed_at = null where email = v_email and purpose = 'reset';
    return jsonb_build_object('status', 'expired');
  end if;
  if v_row.grant_claimed_at > now() - interval '30 seconds' then
    return jsonb_build_object('status', 'busy');
  end if;
  update email_otps set grant_claimed_at = now() where email = v_email and purpose = 'reset';
  delete from neon_auth.verification where identifier like 'reset-password:%' and value = v_row.user_id::text;
  insert into neon_auth.verification (identifier, value, "expiresAt")
  values ('reset-password:' || p_auth_token, v_row.user_id::text, now() + interval '2 minutes');
  return jsonb_build_object('status', 'ok');
end $$;

-- Step 2, after Neon Auth accepted the new password: the grant is spent and
-- every existing session is signed out.
create or replace function password_reset_finish(p_email text, p_grant_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
begin
  update email_otps set grant_hash = null, grant_expires_at = null, grant_claimed_at = null
   where email = v_email and purpose = 'reset' and grant_hash = p_grant_hash
  returning user_id into v_uid;
  if v_uid is null then return jsonb_build_object('status', 'invalid'); end if;
  delete from neon_auth.session where "userId" = v_uid;
  delete from neon_auth.verification where identifier like 'reset-password:%' and value = v_uid::text;
  return jsonb_build_object('status', 'ok');
end $$;

-- Or, if Neon Auth refused: the grant can be tried again, the token is withdrawn.
create or replace function password_reset_release(p_email text, p_grant_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_uid uuid;
begin
  update email_otps set grant_claimed_at = null
   where email = v_email and purpose = 'reset' and grant_hash = p_grant_hash
  returning user_id into v_uid;
  if v_uid is not null then
    delete from neon_auth.verification where identifier like 'reset-password:%' and value = v_uid::text;
  end if;
end $$;

-- Owner-only: the API calls these after its own validation and rate limiting.
revoke execute on function
  email_otp_issue(text, text, int, int, int, text),
  email_otp_verify(text, text, int, text, text, int),
  password_reset_claim(text, text, text),
  password_reset_finish(text, text),
  password_reset_release(text, text)
from public, authenticated, anonymous;
