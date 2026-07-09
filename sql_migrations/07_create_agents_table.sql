-- Create agents table for management utilities
CREATE TABLE IF NOT EXISTS public.agents (
  name text not null,
  team_leader text null,
  setting text null,
  role text null,
  off_1 text null,
  off_2 text null,
  start_shift text null,
  end_shift text null,
  comments text null,
  constraint agents_pkey primary key (name)
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_agents_team_leader ON public.agents(team_leader);
CREATE INDEX IF NOT EXISTS idx_agents_role ON public.agents(role);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read agents" ON public.agents;
CREATE POLICY "Authenticated users can read agents"
  ON public.agents
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage agents" ON public.agents;
CREATE POLICY "Authenticated users can manage agents"
  ON public.agents
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
