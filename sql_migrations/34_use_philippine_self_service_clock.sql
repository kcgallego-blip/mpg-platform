-- Store Agent self-service Time In/Time Out values in Philippine local time.
-- The operational attendance date is still resolved by the application using
-- America/New_York; only the clock value saved in attendance changes here.

create or replace function public.clock_attendance_self_service(
  p_agent_email text, p_shift_date date, p_action text, p_surface text, p_request_id uuid,
  p_recorded_at timestamptz, p_ip inet, p_user_agent text, p_network_status text, p_ot_review text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare current_row public.attendance%rowtype; prior_row jsonb; philippine_clock timestamp; existing_event public.attendance_clock_events%rowtype; prior_outcome public.attendance_day_outcomes%rowtype;
begin
  if p_action not in ('time_in', 'time_out') then raise exception 'Invalid clock action'; end if;
  if p_surface not in ('attendance', 'home') then raise exception 'Invalid clock surface'; end if;
  if p_network_status not in ('office', 'offsite_flagged', 'wfh_exempt', 'unknown_ip_flagged', 'unconfigured') then raise exception 'Invalid network status'; end if;
  if p_ot_review not in ('not_required', 'pending') then raise exception 'Invalid overtime review state'; end if;
  perform pg_advisory_xact_lock(hashtext(p_request_id::text));
  perform pg_advisory_xact_lock(hashtext(lower(btrim(p_agent_email)) || '|' || p_shift_date::text));
  select * into existing_event from public.attendance_clock_events where request_id = p_request_id;
  if found then return existing_event.new_value || jsonb_build_object('idempotent', true); end if;
  philippine_clock := timezone('Asia/Manila', p_recorded_at);
  select * into current_row from public.attendance where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date for update;
  prior_row := case when found then to_jsonb(current_row) else null end;

  if p_action = 'time_in' then
    if current_row.time_in is not null then raise exception using errcode = '40001', message = 'Time In already exists'; end if;
    if current_row.time_out is not null then raise exception using errcode = '40001', message = 'Time Out exists without Time In'; end if;
    insert into public.attendance(agent, shift_date, time_in, source, updated_by, updated_at, pre_shift_ot_approved, pre_shift_ot_review)
    values (lower(btrim(p_agent_email)), p_shift_date, philippine_clock, 'self_service', lower(btrim(p_agent_email)), p_recorded_at, false, p_ot_review)
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
    update public.attendance set time_out = philippine_clock, source = 'self_service', updated_by = lower(btrim(p_agent_email)),
      updated_at = p_recorded_at, import_id = null, post_shift_ot_approved = false, post_shift_ot_review = p_ot_review
    where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date;
  end if;

  select * into current_row from public.attendance where lower(btrim(agent)) = lower(btrim(p_agent_email)) and shift_date = p_shift_date;
  insert into public.attendance_clock_events(request_id, agent_email, shift_date, action, source_surface, clock_value, recorded_at, ip_address, user_agent, network_status, prior_value, new_value)
  values (p_request_id, lower(btrim(p_agent_email)), p_shift_date, p_action, p_surface, philippine_clock, p_recorded_at, p_ip, left(p_user_agent, 512), p_network_status, prior_row, to_jsonb(current_row));
  return to_jsonb(current_row) || jsonb_build_object('idempotent', false);
end; $$;

-- The versioned name makes a missing migration visible to the application.
create or replace function public.clock_attendance_self_service_manila(
  p_agent_email text, p_shift_date date, p_action text, p_surface text, p_request_id uuid,
  p_recorded_at timestamptz, p_ip inet, p_user_agent text, p_network_status text, p_ot_review text
) returns jsonb language sql security definer set search_path = public as $$
  select public.clock_attendance_self_service(
    p_agent_email, p_shift_date, p_action, p_surface, p_request_id,
    p_recorded_at, p_ip, p_user_agent, p_network_status, p_ot_review
  );
$$;

revoke execute on function public.clock_attendance_self_service_manila(text, date, text, text, uuid, timestamptz, inet, text, text, text) from public, anon, authenticated;
grant execute on function public.clock_attendance_self_service_manila(text, date, text, text, uuid, timestamptz, inet, text, text, text) to service_role;

notify pgrst, 'reload schema';
