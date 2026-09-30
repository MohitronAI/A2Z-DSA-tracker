create table if not exists public.progress_sync (
  sync_id_hash text primary key check (sync_id_hash ~ '^[a-f0-9]{64}$'),
  schema_version smallint not null default 2,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress_sync enable row level security;
revoke all on table public.progress_sync from anon, authenticated;
grant all on table public.progress_sync to service_role;

create or replace function public.merge_a2z_progress(p_sync_id_hash text, p_progress jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  merged_progress jsonb;
begin
  insert into public.progress_sync as stored (sync_id_hash, schema_version, progress, updated_at)
  values (p_sync_id_hash, 2, p_progress, now())
  on conflict (sync_id_hash) do update
  set progress = (
    select coalesce(jsonb_object_agg(entry_key, chosen_value), '{}'::jsonb)
    from (
      select coalesce(old_entry.key, new_entry.key) as entry_key,
        case
          when old_entry.value is null then new_entry.value
          when new_entry.value is null then old_entry.value
          when (new_entry.value->>'lastActivityAt')::timestamptz > (old_entry.value->>'lastActivityAt')::timestamptz then new_entry.value
          when (new_entry.value->>'lastActivityAt')::timestamptz = (old_entry.value->>'lastActivityAt')::timestamptz
            and coalesce(new_entry.value->>'revisionId', '') > coalesce(old_entry.value->>'revisionId', '') then new_entry.value
          else old_entry.value
        end as chosen_value
      from jsonb_each(coalesce(stored.progress, '{}'::jsonb)) as old_entry(key, value)
      full outer join jsonb_each(excluded.progress) as new_entry(key, value) using (key)
    ) as all_entries
  ), schema_version = 2, updated_at = now()
  returning progress into merged_progress;

  return merged_progress;
end;
$$;

revoke all on function public.merge_a2z_progress(text, jsonb) from public, anon, authenticated;
grant execute on function public.merge_a2z_progress(text, jsonb) to service_role;
