-- Repairs the atomic Tracker Order RPC and refreshes the Supabase PostgREST schema.
-- Migration 26 must be applied before this migration.

do $$
begin
  if to_regclass('public.attendance_tracker_order') is null then
    raise exception 'Apply 26_create_attendance_management.sql before migration 27';
  end if;
end $$;

create or replace function public.replace_attendance_tracker_order(
  p_entries jsonb,
  p_actor text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  inserted_count integer := 0;
begin
  if nullif(btrim(p_actor), '') is null then
    raise exception 'Actor is required';
  end if;
  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Tracker order cannot be empty';
  end if;

  -- The position constraint guarantees every stored row is >= 1. The explicit
  -- predicate also satisfies Supabase's safe-update protection.
  delete from public.attendance_tracker_order where position >= 1;

  for item in select value from jsonb_array_elements(p_entries)
  loop
    if nullif(btrim(item->>'agent_email'), '') is null then
      raise exception 'Every tracker row requires an agent email';
    end if;
    insert into public.attendance_tracker_order(agent_email, position, updated_by, updated_at)
    values (
      lower(btrim(item->>'agent_email')),
      (item->>'position')::integer,
      p_actor,
      now()
    );
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

revoke execute on function public.replace_attendance_tracker_order(jsonb, text)
  from public, anon, authenticated;
grant execute on function public.replace_attendance_tracker_order(jsonb, text)
  to service_role;

notify pgrst, 'reload schema';
