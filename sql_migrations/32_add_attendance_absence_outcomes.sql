-- Confirmed absence is an audited attendance outcome, not a schedule exception.
-- Requires migrations 26-31.

create table if not exists public.attendance_day_outcomes (
  agent_email text not null check (agent_email = lower(btrim(agent_email))),
  shift_date date not null,
  outcome text not null check (outcome in ('confirmed_absent', 'not_absent')),
  note text,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (agent_email, shift_date)
);

create table if not exists public.attendance_day_outcome_audit (
  id bigint generated always as identity primary key,
  agent_email text not null,
  shift_date date not null,
  prior_value jsonb,
  new_value jsonb not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);

-- Move legacy Absent exceptions into the new outcome model. The exception
-- audit history remains intact, while current resolution uses this table.
insert into public.attendance_day_outcomes(agent_email, shift_date, outcome, note, updated_by, updated_at)
select agent_email, shift_date, 'confirmed_absent', note, updated_by, updated_at
from public.attendance_schedule_exceptions
where kind = 'absent'
on conflict (agent_email, shift_date) do nothing;

insert into public.attendance_day_outcome_audit(agent_email, shift_date, prior_value, new_value, changed_by)
select e.agent_email, e.shift_date, to_jsonb(e),
  jsonb_build_object('outcome', 'confirmed_absent', 'note', e.note), e.updated_by
from public.attendance_schedule_exceptions e
where e.kind = 'absent';

delete from public.attendance_schedule_exceptions where kind = 'absent';

alter table public.attendance_day_outcomes enable row level security;
alter table public.attendance_day_outcome_audit enable row level security;

create or replace function public.commit_attendance_with_outcomes(
  p_shift_date date,
  p_source text,
  p_actor text,
  p_rows jsonb,
  p_outcomes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  row_email text;
  row_shift_date date;
  requested_outcome text;
  current_outcome public.attendance_day_outcomes%rowtype;
  row_found boolean;
  attendance_result jsonb;
  outcome_count integer := 0;
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'Actor is required'; end if;

  attendance_result := public.commit_attendance_rows_with_overtime(
    p_shift_date,
    p_source,
    p_actor,
    coalesce(p_rows, '[]'::jsonb)
  );

  for item in select value from jsonb_array_elements(coalesce(p_outcomes, '[]'::jsonb))
  loop
    row_email := lower(btrim(item->>'agent_email'));
    row_shift_date := coalesce(nullif(item->>'shift_date', '')::date, p_shift_date);
    requested_outcome := nullif(item->>'outcome', '');
    if nullif(row_email, '') is null then raise exception 'Outcome agent email is required'; end if;
    if requested_outcome is not null and requested_outcome not in ('confirmed_absent', 'not_absent') then
      raise exception 'Invalid attendance outcome';
    end if;

    select * into current_outcome from public.attendance_day_outcomes
      where agent_email = row_email and shift_date = row_shift_date
      for update;
    row_found := found;

    if requested_outcome is null then
      delete from public.attendance_day_outcomes
        where agent_email = row_email and shift_date = row_shift_date;
    else
      insert into public.attendance_day_outcomes(agent_email, shift_date, outcome, note, updated_by)
      values (row_email, row_shift_date, requested_outcome, nullif(item->>'note', ''), p_actor)
      on conflict (agent_email, shift_date) do update set
        outcome = excluded.outcome,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = now();
    end if;

    insert into public.attendance_day_outcome_audit(
      agent_email, shift_date, prior_value, new_value, changed_by
    ) values (
      row_email,
      row_shift_date,
      case when row_found then to_jsonb(current_outcome) else null end,
      jsonb_build_object('outcome', requested_outcome, 'note', nullif(item->>'note', '')),
      p_actor
    );
    outcome_count := outcome_count + 1;
  end loop;

  return attendance_result || jsonb_build_object('outcomes_saved', outcome_count);
end;
$$;

revoke execute on function public.commit_attendance_with_outcomes(date, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.commit_attendance_with_outcomes(date, text, text, jsonb, jsonb) to service_role;

notify pgrst, 'reload schema';
