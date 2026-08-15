-- Deletes a manager's selected rows in one transaction and one SQL statement.
-- The existing statement-level support_rows trigger bumps the cache revision once.

CREATE OR REPLACE FUNCTION public.bulk_delete_support_rows(p_row_ids UUID[])
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count BIGINT;
BEGIN
  IF p_row_ids IS NULL OR cardinality(p_row_ids) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Select between 1 and 5000 support rows' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.support_rows
  WHERE id = ANY(p_row_ids);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_delete_support_rows(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_delete_support_rows(UUID[]) TO service_role;
