CREATE TABLE IF NOT EXISTS public.survey (
  survey_date DATE NULL,
  response_id TEXT NOT NULL,
  agent TEXT NOT NULL,
  csat TEXT NOT NULL CHECK (csat IN ('Unsatisfied', 'Neutral', 'Satisfied')),
  mod_comment TEXT NULL,
  open_comment TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (agent, response_id)
);

CREATE INDEX IF NOT EXISTS idx_survey_agent ON public.survey(agent);
CREATE INDEX IF NOT EXISTS idx_survey_csat ON public.survey(csat);
CREATE INDEX IF NOT EXISTS idx_survey_date ON public.survey(survey_date);

CREATE OR REPLACE FUNCTION update_survey_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_survey_updated_at ON public.survey;
CREATE TRIGGER update_survey_updated_at
  BEFORE UPDATE ON public.survey
  FOR EACH ROW
  EXECUTE FUNCTION update_survey_updated_at();
