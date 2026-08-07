BEGIN;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS history jsonb,
  ADD COLUMN IF NOT EXISTS notes jsonb;

-- Preserve installations that may already have text-based audit columns.
DO $$
DECLARE
  history_type text;
  notes_type text;
BEGIN
  SELECT data_type INTO history_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'history';

  IF history_type IS DISTINCT FROM 'jsonb' THEN
    EXECUTE $sql$
      ALTER TABLE public.tickets
      ALTER COLUMN history TYPE jsonb
      USING CASE
        WHEN history IS NULL OR btrim(history::text) = '' THEN '[]'::jsonb
        ELSE jsonb_build_array(jsonb_build_object(
          'timestamp', now(),
          'action', history::text,
          'actor', 'System'
        ))
      END
    $sql$;
  END IF;

  SELECT data_type INTO notes_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'notes';

  IF notes_type IS DISTINCT FROM 'jsonb' THEN
    EXECUTE $sql$
      ALTER TABLE public.tickets
      ALTER COLUMN notes TYPE jsonb
      USING CASE
        WHEN notes IS NULL OR btrim(notes::text) = '' THEN '[]'::jsonb
        ELSE jsonb_build_array(jsonb_build_object(
          'timestamp', now(),
          'note', notes::text,
          'author', 'Unknown'
        ))
      END
    $sql$;
  END IF;
END $$;

ALTER TABLE public.tickets
  ALTER COLUMN history SET DEFAULT '[]'::jsonb,
  ALTER COLUMN notes SET DEFAULT '[]'::jsonb,
  ALTER COLUMN status SET DEFAULT 'Open',
  ALTER COLUMN onsite SET DEFAULT true,
  ALTER COLUMN affected_five9 SET DEFAULT false;

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;

UPDATE public.tickets
SET status = CASE lower(coalesce(status, ''))
  WHEN 'pending' THEN 'Pending'
  WHEN 'solved' THEN 'Solved'
  WHEN 'resolved' THEN 'Solved'
  WHEN 'completed' THEN 'Solved'
  WHEN 'finished' THEN 'Solved'
  ELSE 'Open'
END;

UPDATE public.tickets SET onsite = true WHERE onsite IS NULL;
UPDATE public.tickets SET affected_five9 = false WHERE affected_five9 IS NULL;
UPDATE public.tickets SET history = '[]'::jsonb WHERE history IS NULL OR jsonb_typeof(history) <> 'array';
UPDATE public.tickets SET notes = '[]'::jsonb WHERE notes IS NULL OR jsonb_typeof(notes) <> 'array';

UPDATE public.tickets
SET history = jsonb_build_array(jsonb_build_object(
  'timestamp', CASE
    WHEN date IS NOT NULL
      THEN (date + coalesce(start_time, time '00:00:00')) AT TIME ZONE 'Asia/Manila'
    ELSE now()
  END,
  'action', format(
    'Ticket submitted by %s. Status: Open.',
    coalesce(nullif(btrim(name), ''), 'Unknown reporter')
  ),
  'actor', coalesce(nullif(btrim(name), ''), 'Unknown reporter')
))
WHERE jsonb_array_length(history) = 0;

ALTER TABLE public.tickets
  ALTER COLUMN history SET NOT NULL,
  ALTER COLUMN notes SET NOT NULL,
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN onsite SET NOT NULL,
  ALTER COLUMN affected_five9 SET NOT NULL;

ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_history_array_check;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_notes_array_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_check CHECK (status IN ('Open', 'Pending', 'Solved')),
  ADD CONSTRAINT tickets_history_array_check CHECK (jsonb_typeof(history) = 'array'),
  ADD CONSTRAINT tickets_notes_array_check CHECK (jsonb_typeof(notes) = 'array');

CREATE OR REPLACE FUNCTION public.initialize_ticket_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reporter text := coalesce(nullif(btrim(NEW.name), ''), 'Unknown reporter');
  submitted_at timestamptz := now();
BEGIN
  NEW.status := 'Open';
  NEW.history := coalesce(NEW.history, '[]'::jsonb);
  NEW.notes := coalesce(NEW.notes, '[]'::jsonb);

  IF jsonb_typeof(NEW.history) <> 'array' THEN
    RAISE EXCEPTION 'Ticket history must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(NEW.notes) <> 'array' THEN
    RAISE EXCEPTION 'Ticket notes must be a JSON array' USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(NEW.history) = 0 THEN
    NEW.history := jsonb_build_array(jsonb_build_object(
      'timestamp', submitted_at,
      'action', format('Ticket submitted by %s. Status: Open.', reporter),
      'actor', reporter
    ));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_initialize_audit ON public.tickets;
CREATE TRIGGER tickets_initialize_audit
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.initialize_ticket_audit();

CREATE OR REPLACE FUNCTION public.update_ticket_workflow(
  p_ticket_id bigint,
  p_action text,
  p_actor text,
  p_assisted_by text DEFAULT NULL,
  p_troubleshooting text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_event_timestamp timestamptz DEFAULT now(),
  p_end_time time DEFAULT NULL
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ticket_row public.tickets%ROWTYPE;
  actor_name text := coalesce(nullif(btrim(p_actor), ''), 'Unknown user');
  assisted_name text;
  event_entry jsonb;
  note_entry jsonb;
BEGIN
  SELECT * INTO ticket_row
  FROM public.tickets
  WHERE ticketid = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'pending' THEN
    IF ticket_row.status <> 'Open' THEN
      RAISE EXCEPTION 'Only Open tickets can be moved to Pending' USING ERRCODE = '22023';
    END IF;

    assisted_name := nullif(btrim(p_assisted_by), '');
    IF assisted_name IS NULL THEN
      RAISE EXCEPTION 'Assisted By is required before moving a ticket to Pending' USING ERRCODE = '22023';
    END IF;

    event_entry := jsonb_build_object(
      'timestamp', p_event_timestamp,
      'action', format('%s moved the ticket to Pending. Assigned to %s.', actor_name, assisted_name),
      'actor', actor_name
    );

    UPDATE public.tickets SET
      status = 'Pending',
      assisted_by = assisted_name,
      history = history || jsonb_build_array(event_entry)
    WHERE ticketid = p_ticket_id
    RETURNING * INTO ticket_row;

  ELSIF p_action = 'solve' THEN
    IF ticket_row.status NOT IN ('Open', 'Pending') THEN
      RAISE EXCEPTION 'Only Open or Pending tickets can be solved' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(p_troubleshooting), '') IS NULL THEN
      RAISE EXCEPTION 'Troubleshooting details are required before solving a ticket' USING ERRCODE = '22023';
    END IF;

    assisted_name := coalesce(
      nullif(btrim(p_assisted_by), ''),
      nullif(btrim(ticket_row.assisted_by), ''),
      nullif(btrim(ticket_row.name), ''),
      'Unknown reporter'
    );
    event_entry := jsonb_build_object(
      'timestamp', p_event_timestamp,
      'action', format('%s solved the ticket. Assisted by %s.', actor_name, assisted_name),
      'actor', actor_name
    );

    UPDATE public.tickets SET
      status = 'Solved',
      assisted_by = assisted_name,
      troubleshooting = btrim(p_troubleshooting),
      end_time = coalesce(p_end_time, p_event_timestamp::time),
      history = history || jsonb_build_array(event_entry)
    WHERE ticketid = p_ticket_id
    RETURNING * INTO ticket_row;

  ELSIF p_action = 'add_note' THEN
    IF ticket_row.status NOT IN ('Open', 'Pending') THEN
      RAISE EXCEPTION 'Solved tickets cannot accept new notes' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(p_note), '') IS NULL THEN
      RAISE EXCEPTION 'A note is required' USING ERRCODE = '22023';
    END IF;

    note_entry := jsonb_build_object(
      'timestamp', p_event_timestamp,
      'note', btrim(p_note),
      'author', actor_name
    );
    event_entry := jsonb_build_object(
      'timestamp', p_event_timestamp,
      'action', format('%s added a note.', actor_name),
      'actor', actor_name
    );

    UPDATE public.tickets SET
      notes = notes || jsonb_build_array(note_entry),
      history = history || jsonb_build_array(event_entry)
    WHERE ticketid = p_ticket_id
    RETURNING * INTO ticket_row;

  ELSIF p_action = 'save_troubleshooting' THEN
    IF ticket_row.status NOT IN ('Open', 'Pending') THEN
      RAISE EXCEPTION 'Solved tickets cannot be edited' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(p_troubleshooting), '') IS NULL THEN
      RAISE EXCEPTION 'Troubleshooting details are required' USING ERRCODE = '22023';
    END IF;

    event_entry := jsonb_build_object(
      'timestamp', p_event_timestamp,
      'action', format('%s updated troubleshooting details.', actor_name),
      'actor', actor_name
    );

    UPDATE public.tickets SET
      troubleshooting = btrim(p_troubleshooting),
      history = history || jsonb_build_array(event_entry)
    WHERE ticketid = p_ticket_id
    RETURNING * INTO ticket_row;
  ELSE
    RAISE EXCEPTION 'Unsupported ticket action' USING ERRCODE = '22023';
  END IF;

  RETURN NEXT ticket_row;
END;
$$;

COMMIT;
