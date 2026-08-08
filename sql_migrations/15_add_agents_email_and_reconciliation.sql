-- Add agent email support and provide one atomic operation for schedule imports.
-- The reconciliation function intentionally never reads or writes `present`;
-- attendance remains owned by the schedule API.

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS email text NULL;

ALTER TABLE public.agents
  DROP COLUMN IF EXISTS setting;

CREATE OR REPLACE FUNCTION public.reconcile_agents(
  p_updates jsonb DEFAULT '[]'::jsonb,
  p_new_agents jsonb DEFAULT '[]'::jsonb,
  p_delete_names text[] DEFAULT ARRAY[]::text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  existing_name text;
  incoming_name text;
  updated_count integer := 0;
  inserted_count integer := 0;
  deleted_count integer := 0;
  affected_count integer := 0;
  duplicate_name text;
BEGIN
  IF jsonb_typeof(COALESCE(p_updates, '[]'::jsonb)) <> 'array'
    OR jsonb_typeof(COALESCE(p_new_agents, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Reconciliation payloads must be JSON arrays';
  END IF;

  -- Reject duplicate destination names before changing any primary keys.
  SELECT payload.name
  INTO duplicate_name
  FROM (
    SELECT NULLIF(BTRIM(value ->> 'name'), '') AS name
    FROM jsonb_array_elements(COALESCE(p_updates, '[]'::jsonb))
    UNION ALL
    SELECT NULLIF(BTRIM(value ->> 'name'), '') AS name
    FROM jsonb_array_elements(COALESCE(p_new_agents, '[]'::jsonb))
  ) AS payload
  WHERE payload.name IS NOT NULL
  GROUP BY payload.name
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_name IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate destination agent name: %', duplicate_name;
  END IF;

  -- Update matched rows in place. A renamed primary key keeps the existing
  -- row's attendance value because `present` is deliberately omitted here.
  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_updates, '[]'::jsonb))
  LOOP
    existing_name := NULLIF(BTRIM(item ->> 'existing_name'), '');
    incoming_name := NULLIF(BTRIM(item ->> 'name'), '');

    IF existing_name IS NULL OR incoming_name IS NULL THEN
      RAISE EXCEPTION 'Each update requires existing_name and name';
    END IF;

    UPDATE public.agents
    SET
      name = incoming_name,
      email = CASE WHEN item ? 'email' THEN NULLIF(BTRIM(item ->> 'email'), '') ELSE email END,
      team_leader = CASE WHEN item ? 'team_leader' THEN NULLIF(BTRIM(item ->> 'team_leader'), '') ELSE team_leader END,
      role = CASE WHEN item ? 'role' THEN NULLIF(BTRIM(item ->> 'role'), '') ELSE role END,
      off_1 = CASE WHEN item ? 'off_1' THEN NULLIF(BTRIM(item ->> 'off_1'), '') ELSE off_1 END,
      off_2 = CASE WHEN item ? 'off_2' THEN NULLIF(BTRIM(item ->> 'off_2'), '') ELSE off_2 END,
      start_shift = CASE WHEN item ? 'start_shift' THEN NULLIF(BTRIM(item ->> 'start_shift'), '') ELSE start_shift END,
      end_shift = CASE WHEN item ? 'end_shift' THEN NULLIF(BTRIM(item ->> 'end_shift'), '') ELSE end_shift END,
      comments = CASE WHEN item ? 'comments' THEN NULLIF(BTRIM(item ->> 'comments'), '') ELSE comments END
    WHERE name = existing_name;

    GET DIAGNOSTICS affected_count = ROW_COUNT;
    IF affected_count <> 1 THEN
      RAISE EXCEPTION 'Existing agent was not found: %', existing_name;
    END IF;
    updated_count := updated_count + affected_count;
  END LOOP;

  -- New rows receive the database default for attendance. If another import
  -- inserted the same key concurrently, only schedule-owned columns change.
  FOR item IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_new_agents, '[]'::jsonb))
  LOOP
    incoming_name := NULLIF(BTRIM(item ->> 'name'), '');
    IF incoming_name IS NULL THEN
      RAISE EXCEPTION 'Each new agent requires a name';
    END IF;

    INSERT INTO public.agents (
      name,
      email,
      team_leader,
      role,
      off_1,
      off_2,
      start_shift,
      end_shift,
      comments
    ) VALUES (
      incoming_name,
      NULLIF(BTRIM(item ->> 'email'), ''),
      NULLIF(BTRIM(item ->> 'team_leader'), ''),
      NULLIF(BTRIM(item ->> 'role'), ''),
      NULLIF(BTRIM(item ->> 'off_1'), ''),
      NULLIF(BTRIM(item ->> 'off_2'), ''),
      NULLIF(BTRIM(item ->> 'start_shift'), ''),
      NULLIF(BTRIM(item ->> 'end_shift'), ''),
      NULLIF(BTRIM(item ->> 'comments'), '')
    )
    ON CONFLICT (name) DO UPDATE
    SET
      email = EXCLUDED.email,
      team_leader = EXCLUDED.team_leader,
      role = EXCLUDED.role,
      off_1 = EXCLUDED.off_1,
      off_2 = EXCLUDED.off_2,
      start_shift = EXCLUDED.start_shift,
      end_shift = EXCLUDED.end_shift,
      comments = EXCLUDED.comments;

    inserted_count := inserted_count + 1;
  END LOOP;

  DELETE FROM public.agents
  WHERE name = ANY(COALESCE(p_delete_names, ARRAY[]::text[]));
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'updated', updated_count,
    'inserted', inserted_count,
    'deleted', deleted_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_agents(jsonb, jsonb, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_agents(jsonb, jsonb, text[]) TO authenticated;

COMMENT ON COLUMN public.agents.email IS
  'Agent email imported from the workforce schedule.';

COMMENT ON FUNCTION public.reconcile_agents(jsonb, jsonb, text[]) IS
  'Atomically reconciles schedule-owned agent fields without modifying attendance/present.';
