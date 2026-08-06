-- Inicia um prazo de 10 minutos quando o pedido é confirmado.

CREATE OR REPLACE FUNCTION public.set_music_request_link_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.status = 'creation_confirmed'
    AND OLD.status IS DISTINCT FROM 'creation_confirmed' THEN
    NEW.expires_at := now() + interval '10 minutes';
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS set_music_request_link_deadline
ON public.music_requests;

CREATE TRIGGER set_music_request_link_deadline
BEFORE UPDATE OF status
ON public.music_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_music_request_link_deadline();


-- Remove da lista os pedidos antigos que já ultrapassaram 10 minutos.
UPDATE public.music_requests
SET
  status = 'expired',
  updated_at = now()
WHERE status = 'creation_confirmed'
  AND suno_share_link IS NULL
  AND linked_at IS NULL
  AND creation_confirmed_at IS NOT NULL
  AND creation_confirmed_at <= now() - interval '10 minutes';
