-- Attendance is keyed by the normalized email captured in the operational roster.
-- A roster agent does not need an application login, and historical attendance must
-- remain after a login or roster row is removed. Server routes validate active roster
-- emails before writes, so the legacy user-account foreign key is inappropriate here.

alter table public.attendance
  drop constraint if exists attendance_agent_fkey;

notify pgrst, 'reload schema';
