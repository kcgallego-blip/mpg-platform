ALTER TABLE IF EXISTS public.survey
  DROP CONSTRAINT IF EXISTS survey_pkey;

ALTER TABLE IF EXISTS public.survey
  DROP CONSTRAINT IF EXISTS survey_response_id_key;

ALTER TABLE IF EXISTS public.survey
  DROP COLUMN IF EXISTS id;

ALTER TABLE IF EXISTS public.survey
  ALTER COLUMN survey_date TYPE DATE
  USING (survey_date AT TIME ZONE 'Asia/Manila')::date;

ALTER TABLE IF EXISTS public.survey
  ADD PRIMARY KEY (agent, response_id);
