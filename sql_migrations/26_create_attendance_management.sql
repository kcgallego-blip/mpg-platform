-- Attendance management, effective-dated schedules, and audited paste imports.
-- Preflight: this intentionally fails if attendance contains duplicate normalized
-- (agent, shift_date) rows. Back up and reconcile those rows before applying.

do $$
begin
  if exists (
    select 1 from public.attendance
    group by lower(btrim(agent)), shift_date
    having count(*) > 1
  ) then
    raise exception 'Duplicate normalized attendance agent/shift_date rows must be reconciled before migration 26';
  end if;
end $$;

update public.attendance set agent = lower(btrim(agent));

-- Attendance belongs to the operational roster, not to application-login rows.
-- Managers must be able to record agents who do not have an app account, and
-- historical attendance must survive account removal.
alter table public.attendance drop constraint if exists attendance_agent_fkey;

alter table public.attendance
  add column if not exists source text not null default 'legacy',
  add column if not exists updated_by text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists import_id uuid,
  add column if not exists pre_shift_ot_approved boolean not null default false,
  add column if not exists post_shift_ot_approved boolean not null default false;

alter table public.attendance drop constraint if exists attendance_source_check;
alter table public.attendance add constraint attendance_source_check
  check (source in ('google_form_paste', 'manual', 'legacy'));

create unique index if not exists attendance_agent_shift_date_normalized_uidx
  on public.attendance (lower(btrim(agent)), shift_date);

create table if not exists public.attendance_imports (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  source text not null check (source in ('google_form_paste', 'manual')),
  accepted_agents integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_tracker_order (
  agent_email text primary key check (agent_email = lower(btrim(agent_email))),
  position integer not null unique check (position >= 1),
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  note text,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists attendance_schedule_versions_effective_idx
  on public.attendance_schedule_versions (effective_from desc, created_at desc);

create table if not exists public.attendance_schedule_entries (
  version_id uuid not null references public.attendance_schedule_versions(id) on delete restrict,
  agent_email text not null check (agent_email = lower(btrim(agent_email))),
  agent_name text not null,
  team_leader text,
  start_shift text not null default '',
  end_shift text not null default '',
  off_1 text not null default '',
  off_2 text not null default '',
  shift_group text not null default 'normal_graveyard'
    check (shift_group in ('normal_graveyard', 'overnight')),
  primary key (version_id, agent_email)
);

create table if not exists public.attendance_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  agent_email text not null check (agent_email = lower(btrim(agent_email))),
  shift_date date not null,
  kind text not null check (kind in ('holiday_off', 'vacation_leave', 'sick_leave', 'transition_off', 'day_off', 'absent', 'scheduled')),
  start_shift text,
  end_shift text,
  note text,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique (agent_email, shift_date),
  check (kind <> 'scheduled' or (nullif(btrim(start_shift), '') is not null and nullif(btrim(end_shift), '') is not null))
);

create table if not exists public.attendance_schedule_exception_audit (
  id bigint generated always as identity primary key,
  exception_id uuid,
  agent_email text not null,
  shift_date date not null,
  prior_value jsonb,
  new_value jsonb not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);

create or replace function public.replace_attendance_tracker_order(p_entries jsonb, p_actor text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  inserted_count integer := 0;
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'Actor is required'; end if;
  -- The position constraint guarantees every stored row is >= 1. The explicit
  -- predicate also satisfies Supabase's safe-update protection.
  delete from public.attendance_tracker_order where position >= 1;
  for item in select value from jsonb_array_elements(p_entries)
  loop
    insert into public.attendance_tracker_order(agent_email, position, updated_by)
    values (lower(btrim(item->>'agent_email')), (item->>'position')::integer, p_actor);
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.commit_attendance_rows_by_date(
  p_shift_date date,
  p_source text,
  p_actor text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  current_row public.attendance%rowtype;
  row_found boolean;
  expected_update timestamptz;
  row_shift_date date;
  new_import_id uuid;
  saved_count integer := 0;
begin
  if p_source not in ('google_form_paste', 'manual') then raise exception 'Invalid attendance source'; end if;
  if nullif(btrim(p_actor), '') is null then raise exception 'Actor is required'; end if;

  insert into public.attendance_imports(shift_date, source, created_by)
  values (p_shift_date, p_source, p_actor) returning id into new_import_id;

  for item in select value from jsonb_array_elements(p_rows)
  loop
    row_shift_date := coalesce(nullif(item->>'shift_date', '')::date, p_shift_date);
    select * into current_row from public.attendance
      where lower(btrim(agent)) = lower(btrim(item->>'agent_email')) and shift_date = row_shift_date
      for update;
    row_found := found;
    expected_update := nullif(item->>'expected_updated_at', '')::timestamptz;

    if row_found and (expected_update is null or current_row.updated_at is distinct from expected_update) then
      raise exception using errcode = '40001', message = 'Attendance changed after preview for ' || (item->>'agent_email');
    elsif not row_found and expected_update is not null then
      raise exception using errcode = '40001', message = 'Attendance was removed after preview for ' || (item->>'agent_email');
    end if;

    if row_found then
      update public.attendance set
        agent = lower(btrim(item->>'agent_email')),
        time_in = nullif(item->>'time_in', '')::timestamp,
        time_out = nullif(item->>'time_out', '')::timestamp,
        source = p_source,
        updated_by = p_actor,
        updated_at = now(),
        import_id = new_import_id
      where lower(btrim(agent)) = lower(btrim(item->>'agent_email')) and shift_date = row_shift_date;
    else
      insert into public.attendance(agent, shift_date, time_in, time_out, source, updated_by, import_id)
      values (
        lower(btrim(item->>'agent_email')),
        row_shift_date,
        nullif(item->>'time_in', '')::timestamp,
        nullif(item->>'time_out', '')::timestamp,
        p_source,
        p_actor,
        new_import_id
      );
    end if;
    saved_count := saved_count + 1;
  end loop;

  update public.attendance_imports set accepted_agents = saved_count where id = new_import_id;
  return jsonb_build_object('import_id', new_import_id, 'saved', saved_count);
end;
$$;

create or replace function public.create_attendance_schedule_version(
  p_effective_from date,
  p_note text,
  p_entries jsonb,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  version_uuid uuid;
  item jsonb;
begin
  if jsonb_array_length(p_entries) = 0 then raise exception 'A complete schedule is required'; end if;
  insert into public.attendance_schedule_versions(effective_from, note, created_by)
  values (p_effective_from, nullif(btrim(p_note), ''), p_actor) returning id into version_uuid;
  for item in select value from jsonb_array_elements(p_entries)
  loop
    insert into public.attendance_schedule_entries(
      version_id, agent_email, agent_name, team_leader, start_shift, end_shift, off_1, off_2, shift_group
    ) values (
      version_uuid, lower(btrim(item->>'agent_email')), item->>'agent_name', item->>'team_leader',
      coalesce(item->>'start_shift', ''), coalesce(item->>'end_shift', ''),
      coalesce(item->>'off_1', ''), coalesce(item->>'off_2', ''),
      coalesce(item->>'shift_group', 'normal_graveyard')
    );
  end loop;
  return version_uuid;
end;
$$;

create or replace function public.upsert_attendance_schedule_exceptions(p_entries jsonb, p_actor text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  prior public.attendance_schedule_exceptions%rowtype;
  saved public.attendance_schedule_exceptions%rowtype;
  saved_count integer := 0;
begin
  for item in select value from jsonb_array_elements(p_entries)
  loop
    select * into prior from public.attendance_schedule_exceptions
      where agent_email = lower(btrim(item->>'agent_email')) and shift_date = (item->>'shift_date')::date
      for update;
    insert into public.attendance_schedule_exceptions(
      agent_email, shift_date, kind, start_shift, end_shift, note, updated_by, updated_at
    ) values (
      lower(btrim(item->>'agent_email')), (item->>'shift_date')::date, item->>'kind',
      nullif(item->>'start_shift', ''), nullif(item->>'end_shift', ''), nullif(item->>'note', ''), p_actor, now()
    )
    on conflict (agent_email, shift_date) do update set
      kind = excluded.kind, start_shift = excluded.start_shift, end_shift = excluded.end_shift,
      note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at
    returning * into saved;
    insert into public.attendance_schedule_exception_audit(
      exception_id, agent_email, shift_date, prior_value, new_value, changed_by
    ) values (saved.id, saved.agent_email, saved.shift_date, case when prior.id is null then null else to_jsonb(prior) end, to_jsonb(saved), p_actor);
    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;

alter table public.attendance enable row level security;
alter table public.attendance_imports enable row level security;
alter table public.attendance_tracker_order enable row level security;
alter table public.attendance_schedule_versions enable row level security;
alter table public.attendance_schedule_entries enable row level security;
alter table public.attendance_schedule_exceptions enable row level security;
alter table public.attendance_schedule_exception_audit enable row level security;

revoke all on public.attendance_imports, public.attendance_tracker_order,
  public.attendance_schedule_versions, public.attendance_schedule_entries,
  public.attendance_schedule_exceptions, public.attendance_schedule_exception_audit
  from anon, authenticated;
revoke execute on function public.replace_attendance_tracker_order(jsonb, text) from public, anon, authenticated;
revoke execute on function public.commit_attendance_rows_by_date(date, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.create_attendance_schedule_version(date, text, jsonb, text) from public, anon, authenticated;
revoke execute on function public.upsert_attendance_schedule_exceptions(jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_attendance_tracker_order(jsonb, text) to service_role;
grant execute on function public.commit_attendance_rows_by_date(date, text, text, jsonb) to service_role;
grant execute on function public.create_attendance_schedule_version(date, text, jsonb, text) to service_role;
grant execute on function public.upsert_attendance_schedule_exceptions(jsonb, text) to service_role;
