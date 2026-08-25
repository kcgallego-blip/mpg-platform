-- Changelog content is bundled with the application. The database stores only
-- one monotonic acknowledgement cursor per user to minimize free-tier egress.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_changelog_sequence BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_last_seen_changelog_sequence_nonnegative;

ALTER TABLE public.users
  ADD CONSTRAINT users_last_seen_changelog_sequence_nonnegative
  CHECK (last_seen_changelog_sequence >= 0);

CREATE OR REPLACE FUNCTION public.acknowledge_changelog(
  p_user_email TEXT,
  p_sequence BIGINT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acknowledged_sequence BIGINT;
BEGIN
  IF p_sequence < 0 THEN
    RAISE EXCEPTION 'Changelog sequence must not be negative' USING ERRCODE = '22023';
  END IF;

  UPDATE public.users
  SET last_seen_changelog_sequence = GREATEST(last_seen_changelog_sequence, p_sequence)
  WHERE email = lower(trim(p_user_email))
  RETURNING last_seen_changelog_sequence INTO acknowledged_sequence;

  IF acknowledged_sequence IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN acknowledged_sequence;
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_changelog(TEXT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_changelog(TEXT, BIGINT)
  TO service_role;
