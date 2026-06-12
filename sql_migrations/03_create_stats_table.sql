-- Create stats table for agent performance data
CREATE TABLE IF NOT EXISTS public.stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor TEXT NOT NULL,
  name TEXT NOT NULL,
  acw TEXT, -- Stored as MM:SS format
  aht TEXT, -- Stored as MM:SS format
  hold TEXT, -- Stored as MM:SS format
  talk_time TEXT, -- Stored as MM:SS format
  csat_score TEXT, -- Stored as percentage string
  dsat TEXT,
  nps_score DECIMAL,
  promoter INTEGER,
  mod TEXT, -- Stored as percentage string
  mod_value INTEGER,
  fcr TEXT, -- Stored as percentage string
  fcr_value INTEGER,
  surveys_answered INTEGER,
  calls_touched INTEGER,
  tickets_solved INTEGER,
  transactions INTEGER,
  productive_hours TEXT,
  tph DECIMAL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_stats_name ON public.stats(name);
CREATE INDEX IF NOT EXISTS idx_stats_supervisor ON public.stats(supervisor);
CREATE INDEX IF NOT EXISTS idx_stats_created_at ON public.stats(created_at DESC);
