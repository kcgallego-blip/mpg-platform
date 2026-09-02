-- Track manual Staffing presence changes so absent agents can be reset at the
-- 6:00 AM America/New_York boundary without clearing absences marked afterward.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS present boolean NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS presence_updated_at timestamptz NULL;

UPDATE public.agents
SET present = true
WHERE present IS NULL;

ALTER TABLE public.agents
  ALTER COLUMN present SET DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_agents_absence_reset
  ON public.agents (presence_updated_at)
  WHERE present IS FALSE;

COMMENT ON COLUMN public.agents.presence_updated_at IS
  'Timestamp of the latest manual or automatic Staffing presence change.';
