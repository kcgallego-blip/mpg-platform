CREATE OR REPLACE FUNCTION public.mpg_normalize_person_name(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(string_agg(token, '' ORDER BY token), '')
  FROM (
    SELECT DISTINCT token
    FROM regexp_split_to_table(lower(COALESCE(value, '')), '[^a-z0-9]+') AS token
    WHERE token <> ''
  ) AS tokens;
$$;

CREATE OR REPLACE FUNCTION public.get_survey_period_dates(p_agent_name TEXT DEFAULT NULL)
RETURNS TABLE (survey_date DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT survey.survey_date
  FROM public.survey
  WHERE survey.survey_date IS NOT NULL
    AND (
      p_agent_name IS NULL
      OR public.mpg_normalize_person_name(survey.agent) = public.mpg_normalize_person_name(p_agent_name)
    )
  ORDER BY survey.survey_date DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_survey_page(
  p_from DATE,
  p_to DATE,
  p_agent_name TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_offset INTEGER DEFAULT 0,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  survey_date DATE,
  response_id TEXT,
  agent TEXT,
  csat TEXT,
  mod_comment TEXT,
  open_comment TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    survey.survey_date,
    survey.response_id,
    survey.agent,
    survey.csat::TEXT,
    survey.mod_comment,
    survey.open_comment,
    survey.created_at,
    count(*) OVER () AS total_count
  FROM public.survey
  WHERE survey.survey_date BETWEEN p_from AND p_to
    AND (
      p_agent_name IS NULL
      OR public.mpg_normalize_person_name(survey.agent) = public.mpg_normalize_person_name(p_agent_name)
    )
    AND (
      NULLIF(trim(p_search), '') IS NULL
      OR survey.response_id ILIKE '%' || trim(p_search) || '%'
      OR survey.agent ILIKE '%' || trim(p_search) || '%'
      OR survey.csat::TEXT ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(survey.mod_comment, '') ILIKE '%' || trim(p_search) || '%'
      OR COALESCE(survey.open_comment, '') ILIKE '%' || trim(p_search) || '%'
    )
  ORDER BY survey.survey_date DESC NULLS LAST, survey.created_at DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT LEAST(GREATEST(p_limit, 1), 50);
$$;

DROP FUNCTION IF EXISTS public.get_tph_productivity_buckets(DATE, TEXT);
DROP FUNCTION IF EXISTS public.get_tph_productivity_buckets(DATE, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.get_tph_productivity_buckets(
  p_shift_date DATE,
  p_status TEXT DEFAULT NULL,
  p_agent TEXT DEFAULT NULL,
  p_team_leader TEXT DEFAULT NULL
)
RETURNS TABLE (
  agent TEXT,
  ticket_status TEXT,
  hour_key TEXT,
  ticket_count BIGINT,
  first_ticket_time TIMESTAMPTZ,
  latest_ticket_time TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tph.agent,
    COALESCE(tph.status, 'No Status') AS ticket_status,
    to_char(tph.created_at AT TIME ZONE 'Asia/Manila', 'HH24') AS hour_key,
    count(*) AS ticket_count,
    min(tph.created_at) AS first_ticket_time,
    max(tph.created_at) AS latest_ticket_time
  FROM public.tph
  WHERE tph.shift_date = p_shift_date
    AND tph.agent IS NOT NULL
    AND (p_agent IS NULL OR lower(tph.agent) = lower(p_agent))
    AND (
      p_team_leader IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.agents
        WHERE lower(COALESCE(agents.email, '')) = lower(tph.agent)
          AND public.mpg_normalize_person_name(agents.team_leader) = public.mpg_normalize_person_name(p_team_leader)
      )
    )
    AND (
      NULLIF(trim(p_status), '') IS NULL
      OR p_status = 'All'
      OR lower(COALESCE(tph.status, '')) = lower(p_status)
    )
  GROUP BY tph.agent, COALESCE(tph.status, 'No Status'), to_char(tph.created_at AT TIME ZONE 'Asia/Manila', 'HH24')
  ORDER BY tph.agent, hour_key, ticket_status;
$$;

CREATE OR REPLACE FUNCTION public.get_stats_period_values(
  p_period_type TEXT,
  p_agent_name TEXT DEFAULT NULL
)
RETURNS TABLE (period_value INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_period_type = 'monthly' THEN
    RETURN QUERY
      SELECT DISTINCT stats_month.month::INTEGER
      FROM public.stats_month
      WHERE p_agent_name IS NULL
        OR public.mpg_normalize_person_name(stats_month.name) = public.mpg_normalize_person_name(p_agent_name)
      ORDER BY stats_month.month::INTEGER DESC;
  ELSE
    RETURN QUERY
      SELECT DISTINCT stats.week::INTEGER
      FROM public.stats
      WHERE p_agent_name IS NULL
        OR public.mpg_normalize_person_name(stats.name) = public.mpg_normalize_person_name(p_agent_name)
      ORDER BY stats.week::INTEGER DESC;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_survey_period_dates(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_survey_page(DATE, DATE, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_tph_productivity_buckets(DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_stats_period_values(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_survey_period_dates(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_survey_page(DATE, DATE, TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_tph_productivity_buckets(DATE, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_stats_period_values(TEXT, TEXT) TO service_role;

CREATE INDEX IF NOT EXISTS idx_survey_date_agent_name
  ON public.survey (survey_date DESC, public.mpg_normalize_person_name(agent));

CREATE INDEX IF NOT EXISTS idx_tickets_status_date
  ON public.tickets (status, date DESC, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_tph_shift_status_agent_created
  ON public.tph (shift_date, status, agent, created_at);

CREATE INDEX IF NOT EXISTS idx_agents_email_team_leader_name
  ON public.agents (lower(email), public.mpg_normalize_person_name(team_leader));
