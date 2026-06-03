-- Preserve assigned roles, but make future unassigned users Agents by default.
ALTER TABLE public.users
  ALTER COLUMN role SET DEFAULT 'Agent';

UPDATE public.users
SET role = 'Agent'
WHERE role IS NULL;
