-- Split generic leave into explicit Vacation Leave and Sick Leave, and allow a
-- manager-confirmed Absent exception. Missing attendance is still never marked
-- Absent automatically.

begin;

alter table public.attendance_schedule_exceptions
  drop constraint if exists attendance_schedule_exceptions_kind_check;

update public.attendance_schedule_exceptions
set kind = 'vacation_leave'
where kind = 'leave';

alter table public.attendance_schedule_exceptions
  add constraint attendance_schedule_exceptions_kind_check
  check (kind in (
    'holiday_off',
    'vacation_leave',
    'sick_leave',
    'transition_off',
    'day_off',
    'absent',
    'scheduled'
  ));

commit;

notify pgrst, 'reload schema';
