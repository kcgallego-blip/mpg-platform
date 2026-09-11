-- Persist uploader-approved pre-shift and post-shift overtime independently.
-- The new RPC name prevents older database functions from silently ignoring
-- approval fields sent by a newer application build.

alter table public.attendance
  add column if not exists pre_shift_ot_approved boolean not null default false,
  add column if not exists post_shift_ot_approved boolean not null default false;

create or replace function public.commit_attendance_rows_with_overtime(
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
        pre_shift_ot_approved = case
          when item ? 'pre_shift_ot_approved' then coalesce((item->>'pre_shift_ot_approved')::boolean, false)
          else current_row.pre_shift_ot_approved
        end,
        post_shift_ot_approved = case
          when item ? 'post_shift_ot_approved' then coalesce((item->>'post_shift_ot_approved')::boolean, false)
          else current_row.post_shift_ot_approved
        end,
        source = p_source,
        updated_by = p_actor,
        updated_at = now(),
        import_id = new_import_id
      where lower(btrim(agent)) = lower(btrim(item->>'agent_email')) and shift_date = row_shift_date;
    else
      insert into public.attendance(
        agent, shift_date, time_in, time_out, pre_shift_ot_approved,
        post_shift_ot_approved, source, updated_by, import_id
      )
      values (
        lower(btrim(item->>'agent_email')),
        row_shift_date,
        nullif(item->>'time_in', '')::timestamp,
        nullif(item->>'time_out', '')::timestamp,
        coalesce((item->>'pre_shift_ot_approved')::boolean, false),
        coalesce((item->>'post_shift_ot_approved')::boolean, false),
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

revoke execute on function public.commit_attendance_rows_with_overtime(date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_attendance_rows_with_overtime(date, text, text, jsonb) to service_role;

notify pgrst, 'reload schema';
