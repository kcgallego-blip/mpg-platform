ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS password_reset_requested_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS password_reset_requested_by TEXT;

COMMENT ON COLUMN public.users.must_change_password IS
  'True when the local password is temporary and must be replaced before local sign-in completes.';

COMMENT ON COLUMN public.users.session_version IS
  'Incremented to invalidate normal and password-change sessions issued for an older account state.';

