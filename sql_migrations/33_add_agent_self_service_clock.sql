-- Pilot Agent self-service clocking, WFH policy, network audit, and OT review.
-- Requires attendance migrations 26-32.

alter table public.attendance drop constraint if exists attendance_source_check;
alter table public.attendance add constraint attendance_source_check
  check (source in ('google_form_paste', 'manual', 'legacy', 'self_service'));

alter table public.attendance
  add column if not exists pre_shift_ot_review text not null default 'not_required',
  add column if not exists post_shift_ot_review text not null default 'not_required';

alter table public.attendance drop constraint if exists attendance_pre_shift_ot_review_check;
alter table public.attendance add constraint attendance_pre_shift_ot_review_check
  check (pre_shift_ot_review in ('not_required', 'pending', 'approved', 'rejected'));
alter table public.attendance drop constraint if exists attendance_post_shift_ot_review_check;
alter table public.attendance add constraint attendance_post_shift_ot_review_check
  check (post_shift_ot_review in ('not_required', 'pending', 'approved', 'rejected'));

update public.attendance set
  pre_shift_ot_review = case when pre_shift_ot_approved and pre_shift_ot_review = 'not_required' then 'approved' else pre_shift_ot_review end,
  post_shift_ot_review = case when post_shift_ot_approved and post_shift_ot_review = 'not_required' then 'approved' else post_shift_ot_review end;

create table if not exists public.attendance_clock_agent_policy (
  agent_email text primary key check (agent_email = lower(btrim(agent_email))),
  self_service_enabled boolean not null default false,
  is_wfh boolean not null default false,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_clock_policy_audit (
  id bigint generated always as identity primary key,
  agent_email text not null,
  changed_field text not null check (changed_field in ('self_service_enabled', 'is_wfh')),
  prior_value boolean not null,
  new_value boolean not null,
  changed_by text not null,
  changed_at timestamptz not null default now()
);

create table if not exists public.attendance_office_networks (
  id uuid primary key default gen_random_uuid(),
  label text not null check (nullif(btrim(label), '') is not null),
  network cidr not null unique,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance_clock_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  agent_email text not null,
  shift_date date not null,
  action text not null check (action in ('time_in', 'time_out')),
  source_surface text not null check (source_surface in ('attendance', 'home')),
  clock_value timestamp without time zone not null,
  recorded_at timestamptz not null,
  ip_address inet,
  user_agent text,
  network_status text not null check (network_status in ('office', 'offsite_flagged', 'wfh_exempt', 'unknown_ip_flagged', 'unconfigured')),
  prior_value jsonb,
  new_value jsonb not null
);

create index if not exists attendance_clock_events_agent_date_idx
  on public.attendance_clock_events(agent_email, shift_date, recorded_at desc);

create table if not exists public.attendance_overtime_review_audit (
  id bigint generated always as identity primary key,
  agent_email text not null,
  shift_date date not null,
  review_field text not null check (review_field in ('pre_shift', 'post_shift')),
  prior_status text not null,
  new_status text not null check (new_status in ('approved', 'rejected')),
  reviewed_by text not null,
  reviewed_at timestamptz not null default now()
);

create or replace function public.reject_attendance_immutable_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Attendance audit records are immutable';
end;
$$;

drop trigger if exists attendance_clock_policy_audit_immutable on public.attendance_clock_policy_audit;
create trigger attendance_clock_policy_audit_immutable before update or delete on public.attendance_clock_policy_audit
  for each row execute function public.reject_attendance_immutable_mutation();
drop trigger if exists attendance_clock_events_immutable on public.attendance_clock_events;
create trigger attendance_clock_events_immutable before update or delete on public.attendance_clock_events
  for each row execute function public.reject_attendance_immutable_mutation();
drop trigger if exists attendance_overtime_review_audit_immutable on public.attendance_overtime_review_audit;
create trigger attendance_overtime_review_audit_immutable before update or delete on public.attendance_overtime_review_audit
  for each row execute function public.reject_attendance_immutable_mutation();

-- Keep Form-import and Manual Entry clock corrections atomic with their refreshed OT review state.
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
  requested_pre_review text;
  requested_post_review text;
  current_attendance public.attendance%rowtype;
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

  for item in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    row_email := lower(btrim(item->>'agent_email'));
    row_shift_date := coalesce(nullif(item->>'shift_date', '')::date, p_shift_date);
    requested_pre_review := case when item ? 'pre_shift_ot_review' then item->>'pre_shift_ot_review' else null end;
    requested_post_review := case when item ? 'post_shift_ot_review' then item->>'post_shift_ot_review' else null end;
    if requested_pre_review is not null and requested_pre_review not in ('not_required', 'pending', 'approved', 'rejected') then
      raise exception 'Invalid pre-shift OT review state';
    end if;
    if requested_post_review is not null and requested_post_review not in ('not_required', 'pending', 'approved', 'rejected') then
      raise exception 'Invalid post-shift OT review state';
    end if;
    if requested_pre_review is not null or requested_post_review is not null then
      select * into current_attendance from public.attendance
        where lower(btrim(agent)) = row_email and shift_date = row_shift_date
        for update;
      if requested_pre_review in ('approved', 'rejected') and current_attendance.pre_shift_ot_review is distinct from requested_pre_review then
        insert into public.attendance_overtime_review_audit(agent_email, shift_date, review_field, prior_status, new_status, reviewed_by)
        values (row_email, row_shift_date, 'pre_shift', current_attendance.pre_shift_ot_review, requested_pre_review, p_actor);
      end if;
      if requested_post_review in ('approved', 'rejected') and current_attendance.post_shift_ot_review is distinct from requested_post_review then
        insert into public.attendance_overtime_review_audit(agent_email, shift_date, review_field, prior_status, new_status, reviewed_by)
        values (row_email, row_shift_date, 'post_shift', current_attendance.post_shift_ot_review, requested_post_review, p_actor);
      end if;
      update public.attendance set
        pre_shift_ot_review = coalesce(requested_pre_review, pre_shift_ot_review),
        post_shift_ot_review = coalesce(requested_post_review, post_shift_ot_review),
        pre_shift_ot_approved = case when requested_pre_review is not null then requested_pre_review = 'approved' else pre_shift_ot_approved end,
        post_shift_ot_approved = case when requested_post_review is not null then requested_post_review = 'approved' else post_shift_ot_approved end
      where lower(btrim(agent)) = row_email and shift_date = row_shift_date;
    end if;
  end loop;

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
      delete from public.attendance_day_outcomes where agent_email = row_email and shift_date = row_shift_date;
    else
      insert into public.attendance_day_outcomes(agent_email, shift_date, outcome, note, updated_by)
      values (row_email, row_shift_date, requested_outcome, nullif(item->>'note', ''), p_actor)
      on conflict (agent_email, shift_date) do update set
        outcome = excluded.outcome,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = now();
    end if;

    insert into public.attendance_day_outcome_audit(agent_email, shift_date, prior_value, new_value, changed_by)
    values (
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

create or replace function public.replace_attendance_clock_pilot(p_agent_emails text[], p_actor text)
returns integer language plpgsql security definer set search_path = public as $$
declare row_item record; row_email text; current_value boolean; normalized text[]; enabled_count integer;
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'Actor is required'; end if;
  select coalesce(array_agg(distinct lower(btrim(value))), array[]::text[]) into normalized
  from unnest(coalesce(p_agent_emails, array[]::text[])) value where nullif(btrim(value), '') is not null;

  for row_item in select agent_email, self_service_enabled from public.attendance_clock_agent_policy
  loop
    if row_item.self_service_enabled is distinct from (row_item.agent_email = any(normalized)) then
      insert into public.attendance_clock_policy_audit(agent_email, changed_field, prior_value, new_value, changed_by)
      values (row_item.agent_email, 'self_service_enabled', row_item.self_service_enabled, row_item.agent_email = any(normalized), p_actor);
    end if;
  end loop;

  update public.attendance_clock_agent_policy set self_service_enabled = false, updated_by = p_actor, updated_at = now()
    where self_service_enabled = true and not (agent_email = any(normalized));
  foreach row_email in array normalized loop
    select self_service_enabled into current_value from public.attendance_clock_agent_policy where agent_email = row_email;
    insert into public.attendance_clock_agent_policy(agent_email, self_service_enabled, updated_by)
    values (row_email, true, p_actor)
    on conflict (agent_email) do update set self_service_enabled = true, updated_by = excluded.updated_by, updated_at = now();
    if current_value is null then
      insert into public.attendance_clock_policy_audit(agent_email, changed_field, prior_value, new_value, changed_by)
      values (row_email, 'self_service_enabled', false, true, p_actor);
    end if;
  end loop;
  select count(*) into enabled_count from public.attendance_clock_agent_policy where self_service_enabled;
  return enabled_count;
end; $$;

create or replace function public.replace_attendance_clock_wfh(p_agent_emails text[], p_actor text)
returns integer language plpgsql security definer set search_path = public as $$
declare row_email text; current_value boolean; normalized text[]; wfh_count integer;
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'Actor is required'; end if;
  select coalesce(array_agg(distinct lower(btrim(value))), array[]::text[]) into normalized
  from unnest(coalesce(p_agent_emails, array[]::text[])) value where nullif(btrim(value), '') is not null;

  for row_email, current_value in select agent_email, is_wfh from public.attendance_clock_agent_policy
  loop
    if current_value is distinct from (row_email = any(normalized)) then
      insert into public.attendance_clock_policy_audit(agent_email, changed_field, prior_value, new_value, changed_by)
      values (row_email, 'is_wfh', current_value, row_email = any(normalized), p_actor);
    end if;
  end loop;
  update public.attendance_clock_agent_policy set is_wfh = false, updated_by = p_actor, updated_at = now()
    where is_wfh = true and not (agent_email = any(normalized));
  foreach row_email in array normalized loop
    select is_wfh into current_value from public.attendance_clock_agent_policy where agent_email = row_email;
    insert into public.attendance_clock_agent_policy(agent_email, is_wfh, updated_by)
    values (row_email, true, p_actor)
    on conflict (agent_email) do update set is_wfh = true, updated_by = excluded.updated_by, updated_at = now();
    if current_value is null then
      insert into public.attendance_clock_policy_audit(agent_email, changed_field, prior_value, new_value, changed_by)
      values (row_email, 'is_wfh', false, true, p_actor);
    end if;
  end loop;
  select count(*) into wfh_count from public.attendance_clock_agent_policy where is_wfh;
  return wfh_count;
end; $$;

create or replace function public.replace_attendance_office_networks(p_entries jsonb, p_actor text)
returns integer language plpgsql security definer set search_path = public as $$
declare item jsonb; saved integer := 0;
begin
  if nullif(btrim(p_actor), '') is null then raise exception 'Actor is required'; end if;
  delete from public.attendance_office_networks where id is not null;
  for item in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.attendance_office_networks(label, network, updated_by)
    values (btrim(item->>'label'), (item->>'network')::cidr, p_actor);
    saved := saved + 1;
  end loop;
  return saved;
end; $$;

create or replace function public.classify_attendance_network(p_ip inet, p_is_wfh boolean)
returns text language plpgsql security definer set search_path = public stable as $$
begin
  if p_is_wfh then return 'wfh_exempt'; end if;
  if not exists (select 1 from public.attendance_office_networks) then return 'unconfigured'; end if;
  if p_ip is null then return 'unknown_ip_flagged'; end if;
  if exists (select 1 from public.attendance_office_networks where p_ip <<= network) then return 'office'; end if;
  return 'offsite_flagged';
end; $$;

create or replace function public.clock_attendance_self_service(
  p_agent_email text, p_shift_date date, p_action text, p_surface text, p_request_id uuid,
  p_recorded_at timestamptz, p_ip inet, p_user_agent text, p_network_status text, p_ot_review text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare current_row public.attendance%rowtype; prior_row jsonb; eastern_clock timestamp; existing_event public.attendance_clock_events%rowtype; prior_outcome public.attendance_day_outcomes%rowtype;
begin
  if p_action not in ('time_in', 'time_out') then raise exception 'Invalid clock action'; end if;
  if p_surface not in ('attendance', 'home') then raise exception 'Invalid clock surface'; end if;
  if p_network_status not in ('office', 'offsite_flagged', 'wfh_exempt', 'unknown_ip_flagged', 'unconfigured') then raise exception 'Invalid network status'; end if;
  if p_ot_review not in ('not_required', 'pending') then raise exception 'Invalid overtime review state'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  perform pg_advisory_xact_lock(hashtext(lower(btrim(p_agent_email)) || '|' || p_shift_date::text));
  select * into existing_event from public.attendance_clock_events where request_id = p_request_id;
  if found then return existing_event.new_value || jsonb_build_object('idempotent', true); end if;
  eastern_clock := timezone('America/New_York', p_recorded_at);
  select * into current_row from public.attendance where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date for update;
  prior_row := case when found then to_jsonb(current_row) else null end;

  if p_action = 'time_in' then
    if current_row.time_in is not null then raise exception using errcode = '40001', message = 'Time In already exists'; end if;
    if current_row.time_out is not null then raise exception using errcode = '40001', message = 'Time Out exists without Time In'; end if;
    insert into public.attendance(agent, shift_date, time_in, source, updated_by, updated_at, pre_shift_ot_approved, pre_shift_ot_review)
    values (lower(btrim(p_agent_email)), p_shift_date, eastern_clock, 'self_service', lower(btrim(p_agent_email)), p_recorded_at, false, p_ot_review)
    on conflict (lower(btrim(agent)), shift_date) do update set time_in = excluded.time_in, source = excluded.source,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at, import_id = null,
      pre_shift_ot_approved = false, pre_shift_ot_review = excluded.pre_shift_ot_review;

    select * into prior_outcome from public.attendance_day_outcomes where agent_email = lower(btrim(p_agent_email)) and shift_date = p_shift_date for update;
    if found and prior_outcome.outcome = 'confirmed_absent' then
      delete from public.attendance_day_outcomes where agent_email = lower(btrim(p_agent_email)) and shift_date = p_shift_date;
      insert into public.attendance_day_outcome_audit(agent_email, shift_date, prior_value, new_value, changed_by)
      values (lower(btrim(p_agent_email)), p_shift_date, to_jsonb(prior_outcome), jsonb_build_object('outcome', null, 'reason', 'self_service_time_in'), lower(btrim(p_agent_email)));
    end if;
  else
    if current_row.time_in is null then raise exception using errcode = '40001', message = 'Time In is required before Time Out'; end if;
    if current_row.time_out is not null then raise exception using errcode = '40001', message = 'Time Out already exists'; end if;
    update public.attendance set time_out = eastern_clock, source = 'self_service', updated_by = lower(btrim(p_agent_email)),
      updated_at = p_recorded_at, import_id = null, post_shift_ot_approved = false, post_shift_ot_review = p_ot_review
    where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date;
  end if;

  select * into current_row from public.attendance where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date;
  insert into public.attendance_clock_events(request_id, agent_email, shift_date, action, source_surface, clock_value, recorded_at, ip_address, user_agent, network_status, prior_value, new_value)
  values (p_request_id, lower(btrim(p_agent_email)), p_shift_date, p_action, p_surface, eastern_clock, p_recorded_at, p_ip, left(p_user_agent, 512), p_network_status, prior_row, to_jsonb(current_row));
  return to_jsonb(current_row) || jsonb_build_object('idempotent', false);
end; $$;

create or replace function public.review_attendance_overtime(
  p_agent_email text, p_shift_date date, p_review_field text, p_decision text, p_actor text, p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare current_row public.attendance%rowtype; prior_status text; next_status text;
begin
  if p_review_field not in ('pre_shift', 'post_shift') then raise exception 'Invalid overtime field'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Invalid overtime decision'; end if;
  select * into current_row from public.attendance where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date for update;
  if not found then raise exception 'Attendance record not found'; end if;
  if p_expected_updated_at is not null and current_row.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Attendance changed before overtime review';
  end if;
  prior_status := case when p_review_field = 'pre_shift' then current_row.pre_shift_ot_review else current_row.post_shift_ot_review end;
  if prior_status <> 'pending' then raise exception 'Overtime is no longer pending review'; end if;
  next_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  update public.attendance set
    pre_shift_ot_review = case when p_review_field = 'pre_shift' then next_status else pre_shift_ot_review end,
    post_shift_ot_review = case when p_review_field = 'post_shift' then next_status else post_shift_ot_review end,
    pre_shift_ot_approved = case when p_review_field = 'pre_shift' then p_decision = 'approve' else pre_shift_ot_approved end,
    post_shift_ot_approved = case when p_review_field = 'post_shift' then p_decision = 'approve' else post_shift_ot_approved end,
    updated_by = p_actor, updated_at = now()
  where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date returning * into current_row;
  insert into public.attendance_overtime_review_audit(agent_email, shift_date, review_field, prior_status, new_status, reviewed_by)
  values (lower(btrim(p_agent_email)), p_shift_date, p_review_field, prior_status, next_status, p_actor);
  return to_jsonb(current_row);
end; $$;

alter table public.attendance_clock_agent_policy enable row level security;
alter table public.attendance_clock_policy_audit enable row level security;
alter table public.attendance_office_networks enable row level security;
alter table public.attendance_clock_events enable row level security;
alter table public.attendance_overtime_review_audit enable row level security;

revoke execute on function public.replace_attendance_clock_pilot(text[], text) from public, anon, authenticated;
revoke execute on function public.replace_attendance_clock_wfh(text[], text) from public, anon, authenticated;
revoke execute on function public.replace_attendance_office_networks(jsonb, text) from public, anon, authenticated;
revoke execute on function public.classify_attendance_network(inet, boolean) from public, anon, authenticated;
revoke execute on function public.clock_attendance_self_service(text, date, text, text, uuid, timestamptz, inet, text, text, text) from public, anon, authenticated;
revoke execute on function public.review_attendance_overtime(text, date, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_attendance_clock_pilot(text[], text) to service_role;
grant execute on function public.replace_attendance_clock_wfh(text[], text) to service_role;
grant execute on function public.replace_attendance_office_networks(jsonb, text) to service_role;
grant execute on function public.classify_attendance_network(inet, boolean) to service_role;
grant execute on function public.clock_attendance_self_service(text, date, text, text, uuid, timestamptz, inet, text, text, text) to service_role;
grant execute on function public.review_attendance_overtime(text, date, text, text, text, timestamptz) to service_role;

notify pgrst, 'reload schema';
