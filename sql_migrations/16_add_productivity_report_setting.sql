INSERT INTO public.feature_settings (key, enabled)
VALUES ('productivity_report_enabled', TRUE)
ON CONFLICT (key) DO NOTHING;
