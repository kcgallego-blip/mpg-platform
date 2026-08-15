-- Adds safe, whole-cell text formatting without changing the JSONB value model.
-- Existing support rows remain valid and receive an empty formatting object.

ALTER TABLE public.support_rows
  ADD COLUMN IF NOT EXISTS cell_formats JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.support_rows
  DROP CONSTRAINT IF EXISTS support_rows_cell_formats_object;
ALTER TABLE public.support_rows
  ADD CONSTRAINT support_rows_cell_formats_object
  CHECK (jsonb_typeof(cell_formats) = 'object');

CREATE OR REPLACE FUNCTION public.get_support_payload()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'version', revision.version,
    'latestUpdateTimestamp', revision.updated_at,
    'categories', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', category.id,
          'name', category.name,
          'columns', category.columns,
          'isQuickAccess', category.is_quick_access,
          'quickAccessOrder', category.quick_access_order,
          'sortOrder', category.sort_order,
          'createdAt', category.created_at,
          'updatedAt', category.updated_at,
          'rows', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', support_row.id,
                'categoryId', support_row.category_id,
                'data', support_row.data,
                'cellFormats', support_row.cell_formats,
                'createdAt', support_row.created_at,
                'updatedAt', support_row.updated_at
              ) ORDER BY support_row.created_at, support_row.id
            )
            FROM public.support_rows AS support_row
            WHERE support_row.category_id = category.id
          ), '[]'::jsonb)
        ) ORDER BY category.sort_order, category.name
      )
      FROM public.support_categories AS category
    ), '[]'::jsonb)
  )
  FROM public.support_revision AS revision
  WHERE revision.id = TRUE;
$$;

CREATE OR REPLACE FUNCTION public.bulk_insert_support_rows(
  p_category_id UUID,
  p_rows JSONB,
  p_actor TEXT
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count BIGINT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.support_categories WHERE id = p_category_id) THEN
    RAISE EXCEPTION 'Support category not found' USING ERRCODE = 'P0002';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'Support import must contain between 1 and 5000 rows' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) AS items(item) WHERE jsonb_typeof(item) <> 'object') THEN
    RAISE EXCEPTION 'Every support row must be a JSON object' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.support_rows (category_id, data, cell_formats, created_by, updated_by)
  SELECT
    p_category_id,
    CASE WHEN item ? 'data' THEN item->'data' ELSE item END,
    CASE WHEN item ? 'data' THEN COALESCE(item->'cellFormats', '{}'::jsonb) ELSE '{}'::jsonb END,
    p_actor,
    p_actor
  FROM jsonb_array_elements(p_rows) AS items(item);

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_support_payload() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_insert_support_rows(UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_support_payload() TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_insert_support_rows(UUID, JSONB, TEXT) TO service_role;

-- Force every agent cache to fetch the payload shape containing cellFormats.
UPDATE public.support_revision
SET version = version + 1, updated_at = clock_timestamp()
WHERE id = TRUE;
