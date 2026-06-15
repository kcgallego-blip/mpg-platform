ALTER TABLE public.stats
ADD COLUMN IF NOT EXISTS week INTEGER,
ADD COLUMN IF NOT EXISTS "range" INTEGER;

WITH stats_with_week AS (
  SELECT
    id,
    stat_date,
    week_start,
    (
      date_trunc('year', stat_date)::date
      - EXTRACT(DOW FROM date_trunc('year', stat_date)::date)::int
    ) AS year_first_week_start
  FROM (
    SELECT
      id,
      created_at::date AS stat_date,
      created_at::date - EXTRACT(DOW FROM created_at::date)::int AS week_start
    FROM public.stats
    WHERE week IS NULL OR "range" IS NULL
  ) stats_with_week_start
)
UPDATE public.stats s
SET
  week = COALESCE(s.week, FLOOR(((week_start - year_first_week_start) / 7) + 1)::int),
  "range" = COALESCE(s."range", EXTRACT(DOW FROM stat_date)::int + 1)
FROM stats_with_week sw
WHERE s.id = sw.id;

ALTER TABLE public.stats
ALTER COLUMN week SET NOT NULL,
ALTER COLUMN "range" SET NOT NULL;

ALTER TABLE public.stats
ALTER COLUMN week SET DEFAULT 1,
ALTER COLUMN "range" SET DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_stats_week_range ON public.stats(week, "range");
