CREATE TABLE IF NOT EXISTS public.feature_settings (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by TEXT NULL
);

INSERT INTO public.feature_settings (key, enabled)
VALUES ('attendance_route_enabled', FALSE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.feature_settings ENABLE ROW LEVEL SECURITY;

-- No anon/authenticated policies are intentional. Feature settings are read
-- and changed only by authenticated application API routes using the server's
-- service-role client; the PATCH route performs the Admin role check.
