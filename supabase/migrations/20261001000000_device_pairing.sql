create table if not exists public.a2z_sync_devices (
  tracker_hash text not null check (tracker_hash ~ '^[a-f0-9]{64}$'),
  device_id text not null check (device_id ~ '^[a-f0-9]{32}$'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  device_name text not null default 'Device',
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (tracker_hash, device_id)
);

create table if not exists public.a2z_pairing_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  pairing_code_hash text not null unique check (pairing_code_hash ~ '^[a-f0-9]{64}$'),
  tracker_hash text not null check (tracker_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.a2z_sync_devices enable row level security;
alter table public.a2z_pairing_sessions enable row level security;
revoke all on table public.a2z_sync_devices, public.a2z_pairing_sessions from anon, authenticated;
grant all on table public.a2z_sync_devices, public.a2z_pairing_sessions to service_role;

create or replace function public.create_a2z_pairing_session(p_tracker_hash text, p_token_hash text, p_pairing_code_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare expiry timestamptz := now() + interval '5 minutes';
begin
  if p_tracker_hash !~ '^[a-f0-9]{64}$' or p_token_hash !~ '^[a-f0-9]{64}$' or p_pairing_code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid pairing request';
  end if;
  delete from public.a2z_pairing_sessions where expires_at < now() or consumed_at is not null;
  insert into public.a2z_pairing_sessions(token_hash, pairing_code_hash, tracker_hash, expires_at)
    values (p_token_hash, p_pairing_code_hash, p_tracker_hash, expiry);
  return expiry;
end;
$$;

create or replace function public.consume_a2z_pairing(p_token_hash text, p_pairing_code_hash text, p_device_hash text, p_device_id text, p_device_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare session_row public.a2z_pairing_sessions%rowtype;
begin
  select * into session_row from public.a2z_pairing_sessions
    where token_hash = p_token_hash or (p_pairing_code_hash is not null and pairing_code_hash = p_pairing_code_hash) for update;
  if not found or session_row.consumed_at is not null or session_row.expires_at <= now() then
    raise exception 'Pairing code expired or already used';
  end if;
  if p_device_hash !~ '^[a-f0-9]{64}$' or p_device_id !~ '^[a-f0-9]{32}$' then
    raise exception 'Invalid device';
  end if;
  update public.a2z_pairing_sessions set consumed_at = now() where token_hash = session_row.token_hash;
  insert into public.a2z_sync_devices(tracker_hash, device_id, token_hash, device_name, is_owner, created_at, last_seen_at, revoked_at)
    values (session_row.tracker_hash, p_device_id, p_device_hash, left(coalesce(nullif(p_device_name, ''), 'Device'), 40), false, now(), now(), null)
    on conflict (tracker_hash, device_id) do update set token_hash = excluded.token_hash, device_name = excluded.device_name, last_seen_at = now(), revoked_at = null, is_owner = false;
  return jsonb_build_object('trackerHash', session_row.tracker_hash, 'pairedAt', now());
end;
$$;

revoke all on function public.create_a2z_pairing_session(text, text, text) from public, anon, authenticated;
revoke all on function public.consume_a2z_pairing(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_a2z_pairing_session(text, text, text) to service_role;
grant execute on function public.consume_a2z_pairing(text, text, text, text, text) to service_role;
