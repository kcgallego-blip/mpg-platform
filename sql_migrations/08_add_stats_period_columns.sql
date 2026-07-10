ALTER TABLE public.stats
ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'weekly',
ADD COLUMN IF NOT EXISTS period_value INTEGER;

UPDATE public.stats
SET
  period_type = COALESCE(period_type, 'weekly'),
  period_value = COALESCE(period_value, week)
WHERE period_type IS NULL OR period_value IS NULL;

ALTER TABLE public.stats
ALTER COLUMN period_type SET DEFAULT 'weekly';
ALTER TABLE public.stats
ALTER COLUMN period_type SET NOT NULL;
ALTER TABLE public.stats
ALTER COLUMN period_value SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stats_period_type_value ON public.stats(period_type, period_value);
