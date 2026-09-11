-- Persist one private AI encouragement per Agent and Manila calendar day.
-- Only server-side service-role routes may read or write these rows.

CREATE TABLE IF NOT EXISTS public.home_messages (
  agent_email TEXT NOT NULL REFERENCES public.users(email)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  message_date DATE NOT NULL,
  message TEXT NOT NULL,
  source_category TEXT NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  refresh_used BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (agent_email, message_date),
  CONSTRAINT home_messages_message_length
    CHECK (char_length(message) BETWEEN 1 AND 280),
  CONSTRAINT home_messages_source_category
    CHECK (source_category IN (
      'repeated_kpi_miss',
      'customer_praise',
      'kpi_improvement',
      'kpi_passing_streak',
      'current_kpi_miss',
      'period_summary',
      'survey_participation',
      'generic'
    ))
);

CREATE INDEX IF NOT EXISTS idx_home_messages_agent_generated
  ON public.home_messages (agent_email, generated_at DESC);

ALTER TABLE public.home_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.home_messages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.home_messages TO service_role;

COMMENT ON TABLE public.home_messages IS
  'Daily Agent encouragement generated from server-side structured performance context.';

