-- Ensure category positions are deterministic. Existing duplicates keep the
-- first category at its current position; later duplicates move above the
-- current maximum in a stable created_at/id order.

ALTER TABLE public.support_categories
  DROP CONSTRAINT IF EXISTS support_categories_quick_access_order_check;
ALTER TABLE public.support_categories
  DROP CONSTRAINT IF EXISTS support_categories_sort_order_check;

ALTER TABLE public.support_categories
  ADD CONSTRAINT support_categories_quick_access_order_check
  CHECK (quick_access_order BETWEEN 0 AND 32767);
ALTER TABLE public.support_categories
  ADD CONSTRAINT support_categories_sort_order_check
  CHECK (sort_order BETWEEN 0 AND 2147483647);

WITH ranked AS (
  SELECT
    id,
    sort_order,
    created_at,
    row_number() OVER (
      PARTITION BY sort_order
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.support_categories
),
duplicates AS (
  SELECT
    id,
    (SELECT COALESCE(max(sort_order), -1) FROM public.support_categories)
      + row_number() OVER (ORDER BY sort_order, created_at, id) AS next_order
  FROM ranked
  WHERE duplicate_rank > 1
)
UPDATE public.support_categories AS category
SET sort_order = duplicates.next_order
FROM duplicates
WHERE category.id = duplicates.id;

WITH ranked AS (
  SELECT
    id,
    quick_access_order,
    created_at,
    row_number() OVER (
      PARTITION BY quick_access_order
      ORDER BY created_at, id
    ) AS duplicate_rank
  FROM public.support_categories
),
duplicates AS (
  SELECT
    id,
    (SELECT COALESCE(max(quick_access_order), -1) FROM public.support_categories)
      + row_number() OVER (ORDER BY quick_access_order, created_at, id) AS next_order
  FROM ranked
  WHERE duplicate_rank > 1
)
UPDATE public.support_categories AS category
SET quick_access_order = duplicates.next_order
FROM duplicates
WHERE category.id = duplicates.id;

CREATE UNIQUE INDEX IF NOT EXISTS support_categories_sort_order_unique_idx
  ON public.support_categories (sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS support_categories_quick_order_unique_idx
  ON public.support_categories (quick_access_order);

UPDATE public.support_revision
SET version = version + 1, updated_at = clock_timestamp()
WHERE id = TRUE;
