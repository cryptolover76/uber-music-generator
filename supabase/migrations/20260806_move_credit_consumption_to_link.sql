-- O crédito passa a ser consumido somente quando o link Suno é vinculado.

ALTER TABLE public.music_requests
DROP CONSTRAINT IF EXISTS music_requests_status_fields_check;

ALTER TABLE public.music_requests
ADD CONSTRAINT music_requests_status_fields_check CHECK (
  (
    status = 'prepared'
    AND quota_consumed_at IS NULL
    AND creation_confirmed_at IS NULL
    AND suno_share_link IS NULL
    AND linked_at IS NULL
  )
  OR (
    status = 'creation_confirmed'
    AND creation_confirmed_at IS NOT NULL
    AND suno_share_link IS NULL
    AND linked_at IS NULL
    AND (
      (
        quota_consumed_at IS NULL
        AND estimated_credit_cost IS NULL
      )
      OR (
        quota_consumed_at IS NOT NULL
        AND estimated_credit_cost IS NOT NULL
      )
    )
  )
  OR (
    status = 'linked'
    AND quota_consumed_at IS NOT NULL
    AND estimated_credit_cost IS NOT NULL
    AND creation_confirmed_at IS NOT NULL
    AND suno_share_link IS NOT NULL
    AND linked_at IS NOT NULL
  )
  OR (
    status IN ('expired', 'cancelled')
    AND suno_share_link IS NULL
    AND linked_at IS NULL
    AND (
      (
        quota_consumed_at IS NULL
        AND estimated_credit_cost IS NULL
        AND creation_confirmed_at IS NULL
      )
      OR (
        quota_consumed_at IS NOT NULL
        AND estimated_credit_cost IS NOT NULL
        AND creation_confirmed_at IS NOT NULL
      )
    )
  )
);


-- Confirmar libera letra e prompt, mas não desconta créditos.
CREATE OR REPLACE FUNCTION public.confirm_music_creation(
  p_request_id uuid,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_daily_limit integer,
  p_credit_cost integer
)
RETURNS TABLE (
  request_status text,
  quota_consumed_now boolean,
  confirmed_creations_count integer,
  estimated_credits_consumed integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  request_row public.music_requests%ROWTYPE;
  usage_row public.telegram_daily_usage%ROWTYPE;
  local_usage_date date;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Pedido obrigatorio';
  END IF;

  IF p_telegram_user_id IS NULL OR p_telegram_user_id <= 0 THEN
    RAISE EXCEPTION 'Telegram user ID deve ser positivo';
  END IF;

  IF p_telegram_chat_id IS NULL OR p_telegram_chat_id = 0 THEN
    RAISE EXCEPTION 'Telegram chat ID nao pode ser zero';
  END IF;

  SELECT mr.*
  INTO request_row
  FROM public.music_requests AS mr
  WHERE mr.id = p_request_id
    AND mr.telegram_user_id = p_telegram_user_id
    AND mr.telegram_chat_id = p_telegram_chat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado para este usuario e chat';
  END IF;

  -- Pedidos antigos que já consumiram continuam idempotentes.
  IF request_row.quota_consumed_at IS NOT NULL THEN
    local_usage_date :=
      (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;

    SELECT tdu.*
    INTO usage_row
    FROM public.telegram_daily_usage AS tdu
    WHERE tdu.telegram_user_id = p_telegram_user_id
      AND tdu.usage_date = local_usage_date;

    RETURN QUERY SELECT
      request_row.status,
      false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);

    RETURN;
  END IF;

  IF request_row.status IN ('cancelled', 'expired') THEN
    RETURN QUERY SELECT request_row.status, false, 0, 0;
    RETURN;
  END IF;

  IF request_row.expires_at <= now() THEN
    UPDATE public.music_requests AS mr
    SET
      status = 'expired',
      updated_at = now()
    WHERE mr.id = request_row.id
    RETURNING mr.* INTO request_row;

    RETURN QUERY SELECT 'expired'::text, false, 0, 0;
    RETURN;
  END IF;

  IF request_row.status = 'prepared' THEN
    UPDATE public.music_requests AS mr
    SET
      status = 'creation_confirmed',
      creation_confirmed_at = now(),
      updated_at = now()
    WHERE mr.id = request_row.id
    RETURNING mr.* INTO request_row;
  ELSIF request_row.status <> 'creation_confirmed' THEN
    RAISE EXCEPTION 'Pedido em estado invalido para confirmacao';
  END IF;

  local_usage_date :=
    (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT tdu.*
  INTO usage_row
  FROM public.telegram_daily_usage AS tdu
  WHERE tdu.telegram_user_id = p_telegram_user_id
    AND tdu.usage_date = local_usage_date;

  RETURN QUERY SELECT
    request_row.status,
    false,
    COALESCE(usage_row.confirmed_creations_count, 0),
    COALESCE(usage_row.estimated_credits_consumed, 0);
END;
$$;


-- O desconto acontece na primeira vinculação válida do link.
CREATE OR REPLACE FUNCTION public.attach_suno_link(
  p_request_id uuid,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_suno_share_link text,
  p_daily_limit integer,
  p_credit_cost integer
)
RETURNS TABLE (
  request_status text,
  quota_consumed_now boolean,
  confirmed_creations_count integer,
  estimated_credits_consumed integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  request_row public.music_requests%ROWTYPE;
  usage_row public.telegram_daily_usage%ROWTYPE;
  credit_row public.telegram_credit_control%ROWTYPE;
  normalized_suno_share_link text;
  suno_host text;
  suno_path text;
  local_usage_date date;
  unlimited_daily_limit integer := 2147483647;
BEGIN
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'Pedido obrigatorio';
  END IF;

  IF p_telegram_user_id IS NULL OR p_telegram_user_id <= 0 THEN
    RAISE EXCEPTION 'Telegram user ID deve ser positivo';
  END IF;

  IF p_telegram_chat_id IS NULL OR p_telegram_chat_id = 0 THEN
    RAISE EXCEPTION 'Telegram chat ID nao pode ser zero';
  END IF;

  IF p_credit_cost IS NULL OR p_credit_cost < 1 THEN
    RAISE EXCEPTION 'Custo estimado deve ser positivo';
  END IF;

  normalized_suno_share_link := btrim(p_suno_share_link);

  IF normalized_suno_share_link IS NULL
    OR normalized_suno_share_link ~ '[[:space:]@]'
    OR normalized_suno_share_link !~*
      '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*suno\.com(/[^[:space:]?#]*)?$' THEN
    RAISE EXCEPTION 'Link Suno HTTPS invalido';
  END IF;

  suno_host := split_part(normalized_suno_share_link, '/', 3);
  suno_path := substring(
    normalized_suno_share_link
    FROM char_length('https://' || suno_host) + 1
  );

  normalized_suno_share_link :=
    'https://' || lower(suno_host) || suno_path;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(normalized_suno_share_link, 0)
  );

  SELECT mr.*
  INTO request_row
  FROM public.music_requests AS mr
  WHERE mr.id = p_request_id
    AND mr.telegram_user_id = p_telegram_user_id
    AND mr.telegram_chat_id = p_telegram_chat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado para este usuario e chat';
  END IF;

  IF request_row.status IN ('cancelled', 'expired') THEN
    RETURN QUERY SELECT request_row.status, false, 0, 0;
    RETURN;
  END IF;

  -- Repetir o mesmo link não cobra novamente.
  IF request_row.status = 'linked' THEN
    IF request_row.suno_share_link = normalized_suno_share_link THEN
      local_usage_date :=
        (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;

      SELECT tdu.*
      INTO usage_row
      FROM public.telegram_daily_usage AS tdu
      WHERE tdu.telegram_user_id = p_telegram_user_id
        AND tdu.usage_date = local_usage_date;

      RETURN QUERY SELECT
        'linked'::text,
        false,
        COALESCE(usage_row.confirmed_creations_count, 0),
        COALESCE(usage_row.estimated_credits_consumed, 0);

      RETURN;
    END IF;

    RAISE EXCEPTION 'Pedido ja possui outro link Suno';
  END IF;

  IF request_row.expires_at <= now() THEN
    UPDATE public.music_requests AS mr
    SET
      status = 'expired',
      updated_at = now()
    WHERE mr.id = request_row.id
    RETURNING mr.* INTO request_row;

    RETURN QUERY SELECT 'expired'::text, false, 0, 0;
    RETURN;
  END IF;

  IF request_row.status <> 'creation_confirmed' THEN
    RAISE EXCEPTION 'Confirme a criacao antes de vincular o link';
  END IF;

  PERFORM 1
  FROM public.music_requests AS mr
  WHERE mr.suno_share_link = normalized_suno_share_link
    AND mr.id <> p_request_id
  FOR UPDATE;

  IF FOUND THEN
    RAISE EXCEPTION 'Este link Suno ja esta associado a outro pedido';
  END IF;

  -- Pedido legado já cobrado: apenas vincula o link.
  IF request_row.quota_consumed_at IS NOT NULL THEN
    local_usage_date :=
      (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;

    SELECT tdu.*
    INTO usage_row
    FROM public.telegram_daily_usage AS tdu
    WHERE tdu.telegram_user_id = p_telegram_user_id
      AND tdu.usage_date = local_usage_date;

    UPDATE public.music_requests AS mr
    SET
      status = 'linked',
      suno_share_link = normalized_suno_share_link,
      linked_at = now(),
      updated_at = now()
    WHERE mr.id = p_request_id;

    RETURN QUERY SELECT
      'linked'::text,
      false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);

    RETURN;
  END IF;

  SELECT tcc.*
  INTO credit_row
  FROM public.telegram_credit_control AS tcc
  WHERE tcc.telegram_user_id = p_telegram_user_id
    AND tcc.telegram_chat_id = p_telegram_chat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Controle de creditos ainda nao configurado';
  END IF;

  IF credit_row.estimated_credit_cost <> p_credit_cost THEN
    RAISE EXCEPTION 'Custo de creditos divergente da configuracao';
  END IF;

  IF credit_row.available_credits - p_credit_cost
    < credit_row.reserve_credits THEN
    RAISE EXCEPTION
      'Saldo de creditos insuficiente considerando a reserva';
  END IF;

  local_usage_date :=
    (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.telegram_daily_usage (
    telegram_user_id,
    usage_date,
    updated_at
  )
  VALUES (
    p_telegram_user_id,
    local_usage_date,
    now()
  )
  ON CONFLICT (telegram_user_id, usage_date)
  DO NOTHING;

  SELECT tdu.*
  INTO usage_row
  FROM public.telegram_daily_usage AS tdu
  WHERE tdu.telegram_user_id = p_telegram_user_id
    AND tdu.usage_date = local_usage_date
  FOR UPDATE;

  IF usage_row.confirmed_creations_count > 0
    AND usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
    RAISE EXCEPTION 'Custo diario divergente do historico existente';
  END IF;

  UPDATE public.telegram_daily_usage AS tdu
  SET
    daily_limit = unlimited_daily_limit,
    credit_cost = p_credit_cost,
    confirmed_creations_count =
      tdu.confirmed_creations_count + 1,
    estimated_credits_consumed =
      tdu.estimated_credits_consumed + p_credit_cost,
    updated_at = now()
  WHERE tdu.telegram_user_id = p_telegram_user_id
    AND tdu.usage_date = local_usage_date
  RETURNING tdu.* INTO usage_row;

  UPDATE public.telegram_credit_control AS tcc
  SET
    available_credits =
      tcc.available_credits - p_credit_cost,
    updated_at = now()
  WHERE tcc.telegram_user_id = p_telegram_user_id
    AND tcc.telegram_chat_id = p_telegram_chat_id;

  UPDATE public.music_requests AS mr
  SET
    status = 'linked',
    estimated_credit_cost = p_credit_cost,
    quota_consumed_at = now(),
    creation_confirmed_at =
      COALESCE(mr.creation_confirmed_at, now()),
    suno_share_link = normalized_suno_share_link,
    linked_at = now(),
    updated_at = now()
  WHERE mr.id = p_request_id;

  RETURN QUERY SELECT
    'linked'::text,
    true,
    usage_row.confirmed_creations_count,
    usage_row.estimated_credits_consumed;

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION
      'Este link Suno ja esta associado a outro pedido';
END;
$$;


REVOKE EXECUTE ON FUNCTION public.confirm_music_creation(
  uuid, bigint, bigint, integer, integer
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.attach_suno_link(
  uuid, bigint, bigint, text, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_music_creation(
  uuid, bigint, bigint, integer, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.attach_suno_link(
  uuid, bigint, bigint, text, integer, integer
) TO service_role;
