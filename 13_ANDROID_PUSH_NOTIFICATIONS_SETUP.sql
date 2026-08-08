-- Aroma Ceylon V2 - Android push notification device registry
-- Safe to run after the stable complete upgrade / messaging setup.

create table if not exists public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  app_version text,
  device_label text,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_devices_platform_check check (platform in ('android')),
  constraint push_devices_token_length_check check (char_length(token) between 20 and 4096)
);

create index if not exists push_devices_user_enabled_idx
  on public.push_devices(user_id, enabled);

alter table public.push_devices enable row level security;

drop policy if exists "push_devices_select_own_or_admin" on public.push_devices;
create policy "push_devices_select_own_or_admin"
  on public.push_devices
  for select
  to authenticated
  using (user_id = auth.uid() or (select public.is_admin()));

-- Device writes go through security-definer RPCs so a client cannot register a
-- token for another account.
revoke insert, update, delete on public.push_devices from authenticated;
grant select on public.push_devices to authenticated;

create or replace function public.register_push_device(
  p_token text,
  p_platform text default 'android',
  p_app_version text default null,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token text := btrim(coalesce(p_token, ''));
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if char_length(v_token) < 20 then
    raise exception 'Invalid push token.';
  end if;

  if coalesce(p_platform, 'android') <> 'android' then
    raise exception 'Unsupported push platform.';
  end if;

  insert into public.push_devices(
    user_id,
    token,
    platform,
    app_version,
    device_label,
    enabled,
    last_seen_at,
    updated_at
  ) values (
    auth.uid(),
    v_token,
    'android',
    nullif(btrim(coalesce(p_app_version, '')), ''),
    left(nullif(btrim(coalesce(p_device_label, '')), ''), 250),
    true,
    now(),
    now()
  )
  on conflict (token) do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    app_version = excluded.app_version,
    device_label = excluded.device_label,
    enabled = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.disable_push_device(p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  update public.push_devices
  set enabled = false, updated_at = now()
  where user_id = auth.uid()
    and token = btrim(coalesce(p_token, ''));

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

grant execute on function public.register_push_device(text, text, text, text) to authenticated;
grant execute on function public.disable_push_device(text) to authenticated;

comment on table public.push_devices is
  'FCM device tokens for Aroma Ceylon Android push notifications. Tokens are bound to authenticated profiles.';
