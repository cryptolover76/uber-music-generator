-- Controle de créditos do Suno para o fluxo Telegram.
-- Mantém o histórico diário existente e adiciona um saldo configurável por usuário.

CREATE TABLE public.telegram_credit_control (
  telegram_user_id bigint PRIMARY KEY
    CHECK (telegram_user_id > 0),

  telegram_chat_id bigint NOT NULL
    CHECK (telegram_chat_id <> 0),

  available_credits integer NOT NULL DEFAULT 0
    CHECK (available_credits >= 0),

  plan_credits integer NOT NULL DEFAULT 2500
    CHECK (plan_credits > 0),

  estimated_credit_cost integer NOT NULL DEFAULT 10
    CHECK (estimated_credit_cost > 0),

  reserve_credits integer NOT NULL DEFAULT 100
    CHECK (reserve_credits >= 0),

  renewal_day integer NOT NULL DEFAULT 31
    CHECK (renewal_day BETWEEN 1 AND 31),

  credits_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CHECK (reserve_credits <= plan_credits)
);

COMMENT ON TABLE public.telegram_credit_control IS
  'Saldo de créditos informado pelo usuário e configurações do ciclo Suno. Acesso exclusivo do backend service_role.';

ALTER TABLE public.telegram_credit_control ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.telegram_credit_control
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.telegram_credit_control
TO service_role;

CREATE INDEX telegram_credit_control_chat_idx
  ON public.telegram_credit_control (telegram_chat_id);

-- Cria ou atualiza a configuração de créditos do usuário.
CREATE FUNCTION public.update_telegram_credit_control(
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_available_credits integer,
  p_plan_credits integer DEFAULT 2500,
  p_estimated_credit_cost integer DEFAULT 10,
  p_reserve_credits integer DEFAULT 100,
  p_renewal_day integer DEFAULT 31
)
RETURNS TABLE (
  available_credits integer,
  plan_credits integer,
  estimated_credit_cost integer,
  reserve_credits integer,
  renewal_day integer,
  credits_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_telegram_user_id IS NULL OR p_telegram_user_id <= 0 THEN
    RAISE EXCEPTION 'Telegram user ID deve ser positivo';
  END IF;

  IF p_telegram_chat_id IS NULL OR p_telegram_chat_id = 0 THEN
    RAISE EXCEPTION 'Telegram chat ID nao pode ser zero';
  END IF;

  IF p_available_credits IS NULL OR p_available_credits < 0 THEN
    RAISE EXCEPTION 'Saldo de creditos deve ser zero ou positivo';
  END IF;

  IF p_plan_credits IS NULL OR p_plan_credits < 1 THEN
    RAISE EXCEPTION 'Total de creditos do plano deve ser positivo';
  END IF;

  IF p_estimated_credit_cost IS NULL OR p_estimated_credit_cost < 1 THEN
    RAISE EXCEPTION 'Custo estimado por musica deve ser positivo';
  END IF;

  IF p_reserve_credits IS NULL OR p_reserve_credits < 0
    OR p_reserve_credits > p_plan_credits THEN
    RAISE EXCEPTION 'Reserva de creditos invalida';
  END IF;

  IF p_renewal_day IS NULL OR p_renewal_day < 1 OR p_renewal_day > 28 THEN
    RAISE EXCEPTION 'Dia de renovacao deve estar entre 1 e 31';
  END IF;

  INSERT INTO public.telegram_credit_control (
    telegram_user_id,
    telegram_chat_id,
    available_credits,
    plan_credits,
    estimated_credit_cost,
    reserve_credits,
    renewal_day,
    credits_updated_at,
    updated_at
  )
  VALUES (
    p_telegram_user_id,
    p_telegram_chat_id,
    p_available_credits,
    p_plan_credits,
    p_estimated_credit_cost,
    p_reserve_credits,
    p_renewal_day,
    now(),
    now()
  )
  ON CONFLICT (telegram_user_id)
  DO UPDATE SET
    telegram_chat_id = EXCLUDED.telegram_chat_id,
    available_credits = EXCLUDED.available_credits,
    plan_credits = EXCLUDED.plan_credits,
    estimated_credit_cost = EXCLUDED.estimated_credit_cost,
    reserve_credits = EXCLUDED.reserve_credits,
    renewal_day = EXCLUDED.renewal_day,
    credits_updated_at = now(),
    updated_at = now();

  RETURN QUERY
  SELECT
    tcc.available_credits,
    tcc.plan_credits,
    tcc.estimated_credit_cost,
    tcc.reserve_credits,
    tcc.renewal_day,
    tcc.credits_updated_at
  FROM public.telegram_credit_control AS tcc
  WHERE tcc.telegram_user_id = p_telegram_user_id;
END;
$$;


-- Retorna os dados usados pelo painel de créditos no Telegram.
CREATE FUNCTION public.get_telegram_credit_status(
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint
)
RETURNS TABLE (
  available_credits integer,
  plan_credits integer,
  estimated_credit_cost integer,
  reserve_credits integer,
  renewal_day integer,
  usable_credits integer,
  estimated_songs_available integer,
  credits_updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF p_telegram_user_id IS NULL OR p_telegram_user_id <= 0 THEN
    RAISE EXCEPTION 'Telegram user ID deve ser positivo';
  END IF;

  IF p_telegram_chat_id IS NULL OR p_telegram_chat_id = 0 THEN
    RAISE EXCEPTION 'Telegram chat ID nao pode ser zero';
  END IF;

  RETURN QUERY
  SELECT
    tcc.available_credits,
    tcc.plan_credits,
    tcc.estimated_credit_cost,
    tcc.reserve_credits,
    tcc.renewal_day,
    GREATEST(tcc.available_credits - tcc.reserve_credits, 0),
    FLOOR(
      GREATEST(tcc.available_credits - tcc.reserve_credits, 0)::numeric
      / tcc.estimated_credit_cost
    )::integer,
    tcc.credits_updated_at
  FROM public.telegram_credit_control AS tcc
  WHERE tcc.telegram_user_id = p_telegram_user_id
    AND tcc.telegram_chat_id = p_telegram_chat_id;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.update_telegram_credit_control(
  bigint, bigint, integer, integer, integer, integer, integer
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_telegram_credit_status(
  bigint, bigint
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.update_telegram_credit_control(
  bigint, bigint, integer, integer, integer, integer, integer
) TO service_role;

GRANT EXECUTE ON FUNCTION public.get_telegram_credit_status(
  bigint, bigint
) TO service_role;




-- Substitui o limite diário rígido pelo saldo de créditos.
-- A assinatura permanece igual para preservar compatibilidade com o backend atual.
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
  credit_row public.telegram_credit_control%ROWTYPE;
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

  -- Repetir a confirmação não desconta novamente.
  IF request_row.quota_consumed_at IS NOT NULL THEN
    local_usage_date :=
      (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;

    SELECT tdu.*
    INTO usage_row
    FROM public.telegram_daily_usage AS tdu
    WHERE tdu.telegram_user_id = p_telegram_user_id
      AND tdu.usage_date = local_usage_date;

    RETURN QUERY
    SELECT
      request_row.status,
      false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);

    RETURN;
  END IF;

  IF request_row.status IN ('cancelled', 'expired') THEN
    RETURN QUERY
    SELECT
      request_row.status,
      false,
      0,
      0;

    RETURN;
  END IF;

  IF request_row.expires_at <= now() THEN
    UPDATE public.music_requests AS mr
    SET
      status = 'expired',
      updated_at = now()
    WHERE mr.id = request_row.id
    RETURNING mr.* INTO request_row;

    RETURN QUERY
    SELECT
      'expired'::text,
      false,
      0,
      0;

    RETURN;
  END IF;

  IF request_row.status NOT IN ('prepared', 'creation_confirmed') THEN
    RAISE EXCEPTION 'Pedido em estado invalido para confirmacao';
  END IF;

  -- Bloqueia a linha do saldo durante toda a operação.
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

  -- Mantém a tabela antiga compatível, mas sem bloqueio diário prático.
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
    status = 'creation_confirmed',
    estimated_credit_cost = p_credit_cost,
    quota_consumed_at = now(),
    creation_confirmed_at = now(),
    updated_at = now()
  WHERE mr.id = request_row.id
  RETURNING mr.* INTO request_row;

  RETURN QUERY
  SELECT
    'creation_confirmed'::text,
    true,
    usage_row.confirmed_creations_count,
    usage_row.estimated_credits_consumed;
END;
$$;


REVOKE EXECUTE ON FUNCTION public.confirm_music_creation(
  uuid, bigint, bigint, integer, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.confirm_music_creation(
  uuid, bigint, bigint, integer, integer
) TO service_role;
