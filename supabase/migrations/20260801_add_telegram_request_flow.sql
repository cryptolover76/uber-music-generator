CREATE TABLE public.telegram_user_locations (
  telegram_user_id bigint PRIMARY KEY CHECK (telegram_user_id > 0),
  telegram_chat_id bigint NOT NULL CHECK (telegram_chat_id <> 0),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.music_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_update_id bigint NOT NULL UNIQUE,
  telegram_user_id bigint NOT NULL CHECK (telegram_user_id > 0),
  telegram_chat_id bigint NOT NULL CHECK (telegram_chat_id <> 0),
  passenger_name text NOT NULL CHECK (char_length(passenger_name) BETWEEN 1 AND 120),
  passenger_gender text NOT NULL CHECK (passenger_gender IN ('M', 'F', 'N')),
  selection_mode text NOT NULL CHECK (selection_mode IN ('manual', 'automatic')),
  template_id uuid NOT NULL REFERENCES public.templates_letras(id),
  style_id uuid NOT NULL REFERENCES public.estilos(id),
  climate_id uuid REFERENCES public.climas(id),
  period_id uuid REFERENCES public.periodos(id),
  weekday_id uuid REFERENCES public.dias_semana(id),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  local_datetime timestamptz NOT NULL,
  local_weekday text NOT NULL,
  local_period text NOT NULL,
  weather_status text NOT NULL CHECK (weather_status IN ('applied', 'unavailable', 'failed', 'not_requested')),
  weather_summary text,
  weather_provider text,
  title text NOT NULL,
  style_name text NOT NULL,
  style_prompt text NOT NULL,
  lyrics text NOT NULL,
  prompt_final text NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK (
    status IN ('prepared', 'creation_confirmed', 'linked', 'expired', 'cancelled')
  ),
  estimated_credit_cost integer CHECK (estimated_credit_cost >= 0),
  quota_consumed_at timestamptz,
  creation_confirmed_at timestamptz,
  suno_share_link text,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CONSTRAINT music_requests_suno_share_link_check CHECK (
    suno_share_link IS NULL
    OR (
      suno_share_link = btrim(suno_share_link)
      AND suno_share_link !~ '[[:space:]@]'
      AND suno_share_link ~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*suno\.com(/[^[:space:]?#]*)?$'
    )
  ),
  CONSTRAINT music_requests_fixed_credit_cost_check CHECK (
    (quota_consumed_at IS NULL AND estimated_credit_cost IS NULL)
    OR (quota_consumed_at IS NOT NULL AND estimated_credit_cost IS NOT NULL)
  ),
  CONSTRAINT music_requests_status_fields_check CHECK (
    (
      status = 'prepared'
      AND quota_consumed_at IS NULL
      AND creation_confirmed_at IS NULL
      AND suno_share_link IS NULL
      AND linked_at IS NULL
    )
    OR (
      status = 'creation_confirmed'
      AND quota_consumed_at IS NOT NULL
      AND creation_confirmed_at IS NOT NULL
      AND suno_share_link IS NULL
      AND linked_at IS NULL
    )
    OR (
      status = 'linked'
      AND quota_consumed_at IS NOT NULL
      AND creation_confirmed_at IS NOT NULL
      AND suno_share_link IS NOT NULL
      AND linked_at IS NOT NULL
    )
    OR (
      status IN ('expired', 'cancelled')
      AND suno_share_link IS NULL
      AND linked_at IS NULL
      AND (
        (quota_consumed_at IS NULL AND creation_confirmed_at IS NULL)
        OR (quota_consumed_at IS NOT NULL AND creation_confirmed_at IS NOT NULL)
      )
    )
  ),
  CONSTRAINT music_requests_owner_request_key
    UNIQUE (id, telegram_user_id, telegram_chat_id)
);

CREATE TABLE public.telegram_daily_usage (
  telegram_user_id bigint NOT NULL CHECK (telegram_user_id > 0),
  usage_date date NOT NULL,
  prepared_count integer NOT NULL DEFAULT 0 CHECK (prepared_count >= 0),
  confirmed_creations_count integer NOT NULL DEFAULT 0 CHECK (confirmed_creations_count >= 0),
  estimated_credits_consumed integer NOT NULL DEFAULT 0 CHECK (estimated_credits_consumed >= 0),
  daily_limit integer,
  credit_cost integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_user_id, usage_date),
  CONSTRAINT telegram_daily_usage_quota_check CHECK (
    (
      daily_limit IS NULL
      AND credit_cost IS NULL
      AND confirmed_creations_count = 0
      AND estimated_credits_consumed = 0
    )
    OR (
      daily_limit >= 1
      AND credit_cost >= 0
      AND confirmed_creations_count <= daily_limit
      AND estimated_credits_consumed::bigint =
        confirmed_creations_count::bigint * credit_cost::bigint
    )
  )
);

CREATE TABLE public.telegram_link_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_update_id bigint NOT NULL UNIQUE,
  telegram_user_id bigint NOT NULL CHECK (telegram_user_id > 0),
  telegram_chat_id bigint NOT NULL CHECK (telegram_chat_id <> 0),
  suno_share_link text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_selection' CHECK (
    status IN ('awaiting_selection', 'completed', 'expired', 'cancelled')
  ),
  selected_request_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CONSTRAINT telegram_link_submissions_suno_share_link_check CHECK (
    suno_share_link = btrim(suno_share_link)
    AND suno_share_link !~ '[[:space:]@]'
    AND suno_share_link ~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*suno\.com(/[^[:space:]?#]*)?$'
  ),
  CONSTRAINT telegram_link_submissions_status_fields_check CHECK (
    (status = 'completed' AND selected_request_id IS NOT NULL)
    OR (status IN ('awaiting_selection', 'expired', 'cancelled') AND selected_request_id IS NULL)
  ),
  CONSTRAINT telegram_link_submissions_owner_request_fkey
    FOREIGN KEY (selected_request_id, telegram_user_id, telegram_chat_id)
    REFERENCES public.music_requests (id, telegram_user_id, telegram_chat_id)
);

CREATE TABLE public.telegram_updates (
  update_id bigint PRIMARY KEY CHECK (update_id > 0),
  payload jsonb NOT NULL,
  processing_status text NOT NULL DEFAULT 'received' CHECK (
    processing_status IN ('received', 'processing', 'processed', 'failed')
  ),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  received_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  processing_finished_at timestamptz,
  processing_token uuid,
  lease_expires_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (
      processing_status = 'received'
      AND processing_token IS NULL
      AND lease_expires_at IS NULL
      AND processing_started_at IS NULL
      AND processing_finished_at IS NULL
    )
    OR (
      processing_status = 'processing'
      AND processing_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND processing_started_at IS NOT NULL
      AND processing_finished_at IS NULL
      AND lease_expires_at > processing_started_at
    )
    OR (
      processing_status IN ('processed', 'failed')
      AND processing_token IS NULL
      AND lease_expires_at IS NULL
      AND processing_started_at IS NOT NULL
      AND processing_finished_at IS NOT NULL
    )
  ),
  CHECK (
    processing_finished_at IS NULL
    OR processing_finished_at >= processing_started_at
  )
);

ALTER TABLE public.music_requests
  ADD CONSTRAINT music_requests_telegram_update_id_fkey
  FOREIGN KEY (telegram_update_id)
  REFERENCES public.telegram_updates(update_id)
  ON DELETE RESTRICT;

ALTER TABLE public.telegram_link_submissions
  ADD CONSTRAINT telegram_link_submissions_telegram_update_id_fkey
  FOREIGN KEY (telegram_update_id)
  REFERENCES public.telegram_updates(update_id)
  ON DELETE RESTRICT;

CREATE INDEX music_requests_pending_owner_idx
  ON public.music_requests (telegram_user_id, telegram_chat_id, status, expires_at DESC)
  WHERE status IN ('prepared', 'creation_confirmed');

CREATE INDEX music_requests_recent_selection_idx
  ON public.music_requests (telegram_user_id, created_at DESC)
  INCLUDE (template_id, style_id, climate_id, period_id, weekday_id)
  WHERE status IN ('prepared', 'creation_confirmed', 'linked');

CREATE INDEX music_requests_template_id_idx
  ON public.music_requests (template_id);

CREATE INDEX music_requests_style_id_idx
  ON public.music_requests (style_id);

CREATE INDEX music_requests_climate_id_idx
  ON public.music_requests (climate_id)
  WHERE climate_id IS NOT NULL;

CREATE INDEX music_requests_period_id_idx
  ON public.music_requests (period_id)
  WHERE period_id IS NOT NULL;

CREATE INDEX music_requests_weekday_id_idx
  ON public.music_requests (weekday_id)
  WHERE weekday_id IS NOT NULL;

CREATE UNIQUE INDEX music_requests_suno_share_link_normalized_key
  ON public.music_requests (
    lower(split_part(btrim(suno_share_link), '/', 3)),
    substring(
      btrim(suno_share_link)
      FROM char_length('https://' || split_part(btrim(suno_share_link), '/', 3)) + 1
    )
  )
  WHERE suno_share_link IS NOT NULL;

CREATE INDEX telegram_link_submissions_pending_owner_idx
  ON public.telegram_link_submissions (telegram_user_id, telegram_chat_id, expires_at DESC)
  WHERE status = 'awaiting_selection';

CREATE INDEX telegram_link_submissions_selected_request_owner_idx
  ON public.telegram_link_submissions (
    selected_request_id,
    telegram_user_id,
    telegram_chat_id
  );

CREATE INDEX telegram_updates_recovery_idx
  ON public.telegram_updates (processing_status, lease_expires_at, received_at)
  WHERE processing_status IN ('received', 'processing', 'failed');

COMMENT ON TABLE public.telegram_user_locations IS 'Dados privados: backend com SUPABASE_SERVICE_ROLE_KEY.';
COMMENT ON TABLE public.music_requests IS 'Dados privados: backend com SUPABASE_SERVICE_ROLE_KEY.';
COMMENT ON TABLE public.telegram_daily_usage IS 'Dados privados: backend com SUPABASE_SERVICE_ROLE_KEY.';
COMMENT ON TABLE public.telegram_link_submissions IS 'Dados privados: backend com SUPABASE_SERVICE_ROLE_KEY.';
COMMENT ON TABLE public.telegram_updates IS 'Dados privados: backend com SUPABASE_SERVICE_ROLE_KEY.';

ALTER TABLE public.telegram_user_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.telegram_user_locations,
  public.music_requests,
  public.telegram_daily_usage,
  public.telegram_link_submissions,
  public.telegram_updates
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.telegram_user_locations,
  public.music_requests,
  public.telegram_daily_usage,
  public.telegram_link_submissions,
  public.telegram_updates
TO service_role;

-- Decisao arquitetural: service_role e backend confiavel; operacoes normais usam RPCs transacionais.
-- Escritas diretas futuras sao responsabilidade exclusiva desse backend confiavel.

CREATE FUNCTION public.increment_prepared_music_request_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  local_usage_date date;
BEGIN
  local_usage_date := (NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date;

  INSERT INTO public.telegram_daily_usage (telegram_user_id, usage_date, prepared_count, updated_at)
  VALUES (NEW.telegram_user_id, local_usage_date, 1, now())
  ON CONFLICT (telegram_user_id, usage_date)
  DO UPDATE SET
    prepared_count = public.telegram_daily_usage.prepared_count + 1,
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE TRIGGER music_requests_increment_prepared_usage
AFTER INSERT ON public.music_requests
FOR EACH ROW
WHEN (NEW.status = 'prepared')
EXECUTE FUNCTION public.increment_prepared_music_request_usage();

CREATE FUNCTION public.claim_telegram_update(
  p_update_id bigint,
  p_payload jsonb,
  p_lease_seconds integer DEFAULT 120
)
RETURNS TABLE (
  claimed boolean,
  processing_token uuid
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  claim_token uuid := gen_random_uuid();
  persisted_payload jsonb;
BEGIN
  IF p_update_id IS NULL OR p_update_id <= 0 THEN
    RAISE EXCEPTION 'Update ID deve ser positivo';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 1 THEN
    RAISE EXCEPTION 'Lease deve ser positivo';
  END IF;
  IF p_payload IS NULL THEN
    RAISE EXCEPTION 'Payload obrigatorio';
  END IF;

  INSERT INTO public.telegram_updates (update_id, payload)
  VALUES (p_update_id, p_payload)
  ON CONFLICT (update_id) DO NOTHING;

  SELECT tu.payload INTO persisted_payload
  FROM public.telegram_updates AS tu
  WHERE tu.update_id = p_update_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falha ao criar ou recuperar update do Telegram';
  END IF;

  IF persisted_payload <> p_payload THEN
    RAISE EXCEPTION 'Update ID ja associado a outro payload';
  END IF;

  RETURN QUERY
  WITH claimed_update AS (
    UPDATE public.telegram_updates AS tu
    SET
      processing_status = 'processing',
      attempts = tu.attempts + 1,
      processing_started_at = now(),
      processing_finished_at = NULL,
      processing_token = claim_token,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error = NULL,
      updated_at = now()
    WHERE tu.update_id = p_update_id
      AND (
        tu.processing_status IN ('received', 'failed')
        OR (
          tu.processing_status = 'processing'
          AND tu.lease_expires_at <= now()
        )
      )
    RETURNING tu.processing_token
  )
  SELECT true, cu.processing_token
  FROM claimed_update AS cu
  UNION ALL
  SELECT false, NULL::uuid
  WHERE NOT EXISTS (SELECT 1 FROM claimed_update);
END;
$$;

CREATE FUNCTION public.complete_telegram_update(
  p_update_id bigint,
  p_processing_token uuid,
  p_success boolean,
  p_error text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  was_completed boolean := false;
BEGIN
  IF p_update_id IS NULL OR p_update_id <= 0 THEN
    RAISE EXCEPTION 'Update ID deve ser positivo';
  END IF;
  IF p_processing_token IS NULL THEN
    RAISE EXCEPTION 'Token de processamento obrigatorio';
  END IF;

  UPDATE public.telegram_updates AS tu
  SET
    processing_status = CASE WHEN p_success THEN 'processed' ELSE 'failed' END,
    processing_finished_at = now(),
    processing_token = NULL,
    lease_expires_at = NULL,
    last_error = CASE WHEN p_success THEN NULL ELSE p_error END,
    updated_at = now()
  WHERE tu.update_id = p_update_id
    AND tu.processing_status = 'processing'
    AND tu.processing_token = p_processing_token
    AND tu.lease_expires_at > now()
  RETURNING true INTO was_completed;

  RETURN COALESCE(was_completed, false);
END;
$$;

CREATE FUNCTION public.create_or_get_telegram_link_submission(
  p_telegram_update_id bigint,
  p_telegram_user_id bigint,
  p_telegram_chat_id bigint,
  p_suno_share_link text
)
RETURNS TABLE (
  id uuid,
  status text,
  suno_share_link text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  submission_row public.telegram_link_submissions%ROWTYPE;
  normalized_suno_share_link text;
  suno_host text;
  suno_path text;
BEGIN
  IF p_telegram_update_id IS NULL OR p_telegram_update_id <= 0 THEN
    RAISE EXCEPTION 'Update ID deve ser positivo';
  END IF;
  IF p_telegram_user_id IS NULL OR p_telegram_user_id <= 0 THEN
    RAISE EXCEPTION 'Telegram user ID deve ser positivo';
  END IF;
  IF p_telegram_chat_id IS NULL OR p_telegram_chat_id = 0 THEN
    RAISE EXCEPTION 'Telegram chat ID nao pode ser zero';
  END IF;

  normalized_suno_share_link := btrim(p_suno_share_link);

  IF normalized_suno_share_link IS NULL
    OR normalized_suno_share_link ~ '[[:space:]@]'
    OR normalized_suno_share_link !~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*suno\.com(/[^[:space:]?#]*)?$' THEN
    RAISE EXCEPTION 'Link Suno HTTPS invalido';
  END IF;

  suno_host := split_part(normalized_suno_share_link, '/', 3);
  suno_path := substring(
    normalized_suno_share_link
    FROM char_length('https://' || suno_host) + 1
  );
  normalized_suno_share_link := 'https://' || lower(suno_host) || suno_path;

  INSERT INTO public.telegram_link_submissions (
    telegram_update_id,
    telegram_user_id,
    telegram_chat_id,
    suno_share_link,
    status,
    created_at,
    expires_at,
    updated_at
  )
  VALUES (
    p_telegram_update_id,
    p_telegram_user_id,
    p_telegram_chat_id,
    normalized_suno_share_link,
    'awaiting_selection',
    now(),
    now() + interval '12 hours',
    now()
  )
  ON CONFLICT (telegram_update_id) DO NOTHING;

  SELECT tls.* INTO submission_row
  FROM public.telegram_link_submissions AS tls
  WHERE tls.telegram_update_id = p_telegram_update_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Falha ao criar ou recuperar submissao de link';
  END IF;

  IF submission_row.telegram_user_id IS DISTINCT FROM p_telegram_user_id
    OR submission_row.telegram_chat_id IS DISTINCT FROM p_telegram_chat_id
    OR submission_row.suno_share_link IS DISTINCT FROM normalized_suno_share_link THEN
    RAISE EXCEPTION 'Update ID ja associado a outra submissao de link';
  END IF;

  RETURN QUERY SELECT
    submission_row.id,
    submission_row.status,
    submission_row.suno_share_link,
    submission_row.created_at,
    submission_row.expires_at;
END;
$$;

CREATE FUNCTION public.confirm_music_creation(
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
  IF p_daily_limit IS NULL OR p_daily_limit < 1 THEN
    RAISE EXCEPTION 'Limite diario deve ser positivo';
  END IF;
  IF p_credit_cost IS NULL OR p_credit_cost < 0 THEN
    RAISE EXCEPTION 'Custo estimado nao pode ser negativo';
  END IF;

  SELECT mr.* INTO request_row
  FROM public.music_requests AS mr
  WHERE mr.id = p_request_id
    AND mr.telegram_user_id = p_telegram_user_id
    AND mr.telegram_chat_id = p_telegram_chat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado para este usuario e chat';
  END IF;

  IF request_row.status IN ('cancelled', 'expired') THEN
    IF request_row.quota_consumed_at IS NOT NULL THEN
      local_usage_date := (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT tdu.* INTO usage_row
      FROM public.telegram_daily_usage AS tdu
      WHERE tdu.telegram_user_id = p_telegram_user_id
        AND tdu.usage_date = local_usage_date;

      IF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
        OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
        RAISE EXCEPTION 'Configuracao diaria de cota divergente';
      END IF;
    END IF;

    RETURN QUERY SELECT request_row.status, false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);
    RETURN;
  END IF;

  IF request_row.status <> 'linked' AND request_row.expires_at <= now() THEN
    UPDATE public.music_requests AS mr
    SET
      status = 'expired',
      updated_at = now()
    WHERE mr.id = request_row.id
      AND mr.status IN ('prepared', 'creation_confirmed')
    RETURNING mr.* INTO request_row;

    IF request_row.quota_consumed_at IS NOT NULL THEN
      local_usage_date := (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT tdu.* INTO usage_row
      FROM public.telegram_daily_usage AS tdu
      WHERE tdu.telegram_user_id = p_telegram_user_id
        AND tdu.usage_date = local_usage_date;

      IF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
        OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
        RAISE EXCEPTION 'Configuracao diaria de cota divergente';
      END IF;
    END IF;

    RETURN QUERY SELECT 'expired'::text, false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);
    RETURN;
  END IF;

  IF request_row.quota_consumed_at IS NOT NULL THEN
    local_usage_date := (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;
    SELECT tdu.* INTO usage_row
    FROM public.telegram_daily_usage AS tdu
    WHERE tdu.telegram_user_id = p_telegram_user_id
      AND tdu.usage_date = local_usage_date;

    IF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
      OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
      RAISE EXCEPTION 'Configuracao diaria de cota divergente';
    END IF;

    RETURN QUERY SELECT request_row.status, false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);
    RETURN;
  END IF;

  IF request_row.status NOT IN ('prepared', 'creation_confirmed') THEN
    RAISE EXCEPTION 'Pedido em estado invalido para confirmacao';
  END IF;

  local_usage_date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  INSERT INTO public.telegram_daily_usage (telegram_user_id, usage_date, updated_at)
  VALUES (p_telegram_user_id, local_usage_date, now())
  ON CONFLICT (telegram_user_id, usage_date) DO NOTHING;

  SELECT tdu.* INTO usage_row
  FROM public.telegram_daily_usage AS tdu
  WHERE tdu.telegram_user_id = p_telegram_user_id
    AND tdu.usage_date = local_usage_date
  FOR UPDATE;

  IF usage_row.daily_limit IS NULL AND usage_row.credit_cost IS NULL THEN
    UPDATE public.telegram_daily_usage AS tdu
    SET
      daily_limit = p_daily_limit,
      credit_cost = p_credit_cost,
      updated_at = now()
    WHERE tdu.telegram_user_id = p_telegram_user_id
      AND tdu.usage_date = local_usage_date
    RETURNING tdu.* INTO usage_row;
  ELSIF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
    OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
    RAISE EXCEPTION 'Configuracao diaria de cota divergente';
  END IF;

  IF usage_row.confirmed_creations_count >= usage_row.daily_limit THEN
    RAISE EXCEPTION 'Limite diario de criacoes confirmadas atingido';
  END IF;

  UPDATE public.telegram_daily_usage AS tdu
  SET
    confirmed_creations_count = tdu.confirmed_creations_count + 1,
    estimated_credits_consumed = tdu.estimated_credits_consumed + usage_row.credit_cost,
    updated_at = now()
  WHERE tdu.telegram_user_id = p_telegram_user_id
    AND tdu.usage_date = local_usage_date
  RETURNING tdu.* INTO usage_row;

  UPDATE public.music_requests AS mr
  SET
    status = 'creation_confirmed',
    estimated_credit_cost = p_credit_cost,
    quota_consumed_at = now(),
    creation_confirmed_at = now(),
    updated_at = now()
  WHERE mr.id = request_row.id
  RETURNING mr.* INTO request_row;

  RETURN QUERY SELECT 'creation_confirmed'::text, true,
    usage_row.confirmed_creations_count,
    usage_row.estimated_credits_consumed;
END;
$$;

CREATE FUNCTION public.attach_suno_link(
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
  confirmation_row record;
  normalized_suno_share_link text;
  suno_host text;
  suno_path text;
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
  IF p_daily_limit IS NULL OR p_daily_limit < 1 THEN
    RAISE EXCEPTION 'Limite diario deve ser positivo';
  END IF;
  IF p_credit_cost IS NULL OR p_credit_cost < 0 THEN
    RAISE EXCEPTION 'Custo estimado nao pode ser negativo';
  END IF;

  normalized_suno_share_link := btrim(p_suno_share_link);

  IF normalized_suno_share_link IS NULL
    OR normalized_suno_share_link ~ '[[:space:]@]'
    OR normalized_suno_share_link !~* '^https://([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*suno\.com(/[^[:space:]?#]*)?$' THEN
    RAISE EXCEPTION 'Link Suno HTTPS invalido';
  END IF;

  suno_host := split_part(normalized_suno_share_link, '/', 3);
  suno_path := substring(
    normalized_suno_share_link
    FROM char_length('https://' || suno_host) + 1
  );
  normalized_suno_share_link := 'https://' || lower(suno_host) || suno_path;

  PERFORM pg_advisory_xact_lock(hashtextextended(normalized_suno_share_link, 0));

  SELECT mr.* INTO request_row
  FROM public.music_requests AS mr
  WHERE mr.id = p_request_id
    AND mr.telegram_user_id = p_telegram_user_id
    AND mr.telegram_chat_id = p_telegram_chat_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido nao encontrado para este usuario e chat';
  END IF;

  IF request_row.status IN ('cancelled', 'expired') THEN
    IF request_row.quota_consumed_at IS NOT NULL THEN
      local_usage_date := (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT tdu.* INTO usage_row
      FROM public.telegram_daily_usage AS tdu
      WHERE tdu.telegram_user_id = p_telegram_user_id
        AND tdu.usage_date = local_usage_date;

      IF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
        OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
        RAISE EXCEPTION 'Configuracao diaria de cota divergente';
      END IF;
    END IF;

    RETURN QUERY SELECT request_row.status, false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);
    RETURN;
  END IF;

  IF request_row.status = 'linked' THEN
    IF lower(split_part(request_row.suno_share_link, '/', 3)) = lower(suno_host)
      AND substring(
        request_row.suno_share_link
        FROM char_length('https://' || split_part(request_row.suno_share_link, '/', 3)) + 1
      ) = suno_path THEN
      local_usage_date := (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT tdu.* INTO usage_row
      FROM public.telegram_daily_usage AS tdu
      WHERE tdu.telegram_user_id = p_telegram_user_id
        AND tdu.usage_date = local_usage_date;

      IF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
        OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
        RAISE EXCEPTION 'Configuracao diaria de cota divergente';
      END IF;

      RETURN QUERY SELECT
        request_row.status,
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
      AND mr.status IN ('prepared', 'creation_confirmed')
    RETURNING mr.* INTO request_row;

    IF request_row.quota_consumed_at IS NOT NULL THEN
      local_usage_date := (request_row.quota_consumed_at AT TIME ZONE 'America/Sao_Paulo')::date;
      SELECT tdu.* INTO usage_row
      FROM public.telegram_daily_usage AS tdu
      WHERE tdu.telegram_user_id = p_telegram_user_id
        AND tdu.usage_date = local_usage_date;

      IF usage_row.daily_limit IS DISTINCT FROM p_daily_limit
        OR usage_row.credit_cost IS DISTINCT FROM p_credit_cost THEN
        RAISE EXCEPTION 'Configuracao diaria de cota divergente';
      END IF;
    END IF;

    RETURN QUERY SELECT 'expired'::text, false,
      COALESCE(usage_row.confirmed_creations_count, 0),
      COALESCE(usage_row.estimated_credits_consumed, 0);
    RETURN;
  END IF;

  PERFORM 1
  FROM public.music_requests AS mr
  WHERE lower(split_part(mr.suno_share_link, '/', 3)) = lower(suno_host)
    AND substring(
      mr.suno_share_link
      FROM char_length('https://' || split_part(mr.suno_share_link, '/', 3)) + 1
    ) = suno_path
    AND mr.id <> p_request_id
  FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION 'Este link Suno ja esta associado a outro pedido';
  END IF;

  SELECT * INTO confirmation_row
  FROM public.confirm_music_creation(
    p_request_id,
    p_telegram_user_id,
    p_telegram_chat_id,
    p_daily_limit,
    p_credit_cost
  );

  UPDATE public.music_requests AS mr
  SET
    status = 'linked',
    suno_share_link = normalized_suno_share_link,
    linked_at = now(),
    updated_at = now()
  WHERE mr.id = p_request_id
  RETURNING mr.* INTO request_row;

  RETURN QUERY SELECT 'linked'::text,
    confirmation_row.quota_consumed_now,
    confirmation_row.confirmed_creations_count,
    confirmation_row.estimated_credits_consumed;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Este link Suno ja esta associado a outro pedido';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.increment_prepared_music_request_usage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_telegram_update(bigint, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_telegram_update(bigint, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_or_get_telegram_link_submission(bigint, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_music_creation(uuid, bigint, bigint, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.attach_suno_link(uuid, bigint, bigint, text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.increment_prepared_music_request_usage() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telegram_update(bigint, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telegram_update(bigint, uuid, boolean, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_or_get_telegram_link_submission(bigint, bigint, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_music_creation(uuid, bigint, bigint, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_suno_link(uuid, bigint, bigint, text, integer, integer) TO service_role;
