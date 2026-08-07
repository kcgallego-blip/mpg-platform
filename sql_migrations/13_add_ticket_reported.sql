BEGIN;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS reported boolean;

UPDATE public.tickets
SET reported = false
WHERE reported IS NULL;

ALTER TABLE public.tickets
  ALTER COLUMN reported SET DEFAULT false,
  ALTER COLUMN reported SET NOT NULL;

CREATE OR REPLACE FUNCTION public.set_ticket_reported(
  p_ticket_id bigint,
  p_actor text,
  p_reported boolean,
  p_event_timestamp timestamptz DEFAULT now()
)
RETURNS SETOF public.tickets
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ticket_row public.tickets%ROWTYPE;
  actor_name text := coalesce(nullif(btrim(p_actor), ''), 'Unknown user');
  event_entry jsonb;
BEGIN
  SELECT * INTO ticket_row
  FROM public.tickets
  WHERE ticketid = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF ticket_row.reported = p_reported THEN
    RETURN NEXT ticket_row;
    RETURN;
  END IF;

  event_entry := jsonb_build_object(
    'timestamp', p_event_timestamp,
    'action', CASE
      WHEN p_reported THEN format('%s marked the ticket as Reported.', actor_name)
      ELSE format('%s removed the Reported flag.', actor_name)
    END,
    'actor', actor_name
  );

  UPDATE public.tickets SET
    reported = p_reported,
    history = history || jsonb_build_array(event_entry)
  WHERE ticketid = p_ticket_id
  RETURNING * INTO ticket_row;

  RETURN NEXT ticket_row;
END;
$$;

COMMIT;
