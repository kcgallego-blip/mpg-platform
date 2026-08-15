-- Support Knowledge Base
-- Dynamic schemas and row values live in JSONB so adding a support column never
-- requires a database migration. All access is through authenticated API routes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.support_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 80),
  columns JSONB NOT NULL CHECK (
    jsonb_typeof(columns) = 'array'
    AND jsonb_array_length(columns) BETWEEN 1 AND 50
  ),
  is_quick_access BOOLEAN NOT NULL DEFAULT FALSE,
  quick_access_order SMALLINT NOT NULL DEFAULT 0 CHECK (quick_access_order BETWEEN 0 AND 999),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 9999),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_categories_name_lower_idx
  ON public.support_categories (lower(trim(name)));
CREATE INDEX IF NOT EXISTS support_categories_order_idx
  ON public.support_categories (sort_order, name);
CREATE INDEX IF NOT EXISTS support_categories_quick_idx
  ON public.support_categories (quick_access_order, name)
  WHERE is_quick_access;

CREATE TABLE IF NOT EXISTS public.support_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.support_categories(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(data) = 'object'),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_rows_category_created_idx
  ON public.support_rows (category_id, created_at, id);
CREATE INDEX IF NOT EXISTS support_rows_data_gin_idx
  ON public.support_rows USING gin (data jsonb_path_ops);

-- A singleton revision makes the agent freshness request a one-row lookup.
CREATE TABLE IF NOT EXISTS public.support_revision (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  version BIGINT NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.support_revision (id, version)
VALUES (TRUE, 1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_support_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_categories_set_updated_at ON public.support_categories;
CREATE TRIGGER support_categories_set_updated_at
BEFORE UPDATE ON public.support_categories
FOR EACH ROW EXECUTE FUNCTION public.set_support_updated_at();

DROP TRIGGER IF EXISTS support_rows_set_updated_at ON public.support_rows;
CREATE TRIGGER support_rows_set_updated_at
BEFORE UPDATE ON public.support_rows
FOR EACH ROW EXECUTE FUNCTION public.set_support_updated_at();

CREATE OR REPLACE FUNCTION public.bump_support_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_revision
  SET version = version + 1, updated_at = clock_timestamp()
  WHERE id = TRUE;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS support_categories_bump_revision ON public.support_categories;
CREATE TRIGGER support_categories_bump_revision
AFTER INSERT OR UPDATE OR DELETE ON public.support_categories
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_support_revision();

DROP TRIGGER IF EXISTS support_rows_bump_revision ON public.support_rows;
CREATE TRIGGER support_rows_bump_revision
AFTER INSERT OR UPDATE OR DELETE ON public.support_rows
FOR EACH STATEMENT EXECUTE FUNCTION public.bump_support_revision();

-- Returns one consistent JSON snapshot for the agent cache. The nested shape
-- avoids separate category/row round trips and cuts database egress.
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

-- JSONB bulk insert remains a single PostgreSQL transaction and fires one
-- statement-level revision bump regardless of the number of imported rows.
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

  INSERT INTO public.support_rows (category_id, data, created_by, updated_by)
  SELECT p_category_id, item, p_actor, p_actor
  FROM jsonb_array_elements(p_rows) AS items(item);

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_revision ENABLE ROW LEVEL SECURITY;

-- Deliberately no anon/authenticated policies. The service-role client is used
-- only after the Next.js API validates the signed session snapshot and role.
REVOKE ALL ON TABLE public.support_categories, public.support_rows, public.support_revision FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_support_payload() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bulk_insert_support_rows(UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.support_categories, public.support_rows TO service_role;
GRANT SELECT, UPDATE ON TABLE public.support_revision TO service_role;
GRANT EXECUTE ON FUNCTION public.get_support_payload() TO service_role;
GRANT EXECUTE ON FUNCTION public.bulk_insert_support_rows(UUID, JSONB, TEXT) TO service_role;
