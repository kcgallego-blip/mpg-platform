BEGIN;

CREATE OR REPLACE FUNCTION public.delete_open_ticket(p_ticket_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  ticket_status text;
BEGIN
  SELECT status INTO ticket_status
  FROM public.tickets
  WHERE ticketid = p_ticket_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found' USING ERRCODE = 'P0002';
  END IF;

  IF ticket_status <> 'Open' THEN
    RAISE EXCEPTION 'Only Open tickets can be deleted' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.tickets
  WHERE ticketid = p_ticket_id;

  RETURN p_ticket_id;
END;
$$;

COMMIT;
