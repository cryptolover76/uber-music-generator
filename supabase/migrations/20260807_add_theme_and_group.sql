BEGIN;

--------------------------------------------------------
-- Templates
--------------------------------------------------------

ALTER TABLE public.templates_letras
ADD COLUMN IF NOT EXISTS tema text NOT NULL DEFAULT 'Normal';

ALTER TABLE public.templates_letras
RENAME COLUMN grupo TO grupo;

CREATE INDEX IF NOT EXISTS idx_templates_tema_grupo
ON public.templates_letras (tema, grupo);

--------------------------------------------------------
-- Climas
--------------------------------------------------------

ALTER TABLE public.climas
ADD COLUMN IF NOT EXISTS tema text NOT NULL DEFAULT 'Normal';

ALTER TABLE public.climas
RENAME COLUMN grupo TO grupo;

CREATE INDEX IF NOT EXISTS idx_climas_tema_grupo
ON public.climas (tema, grupo);

--------------------------------------------------------
-- Períodos
--------------------------------------------------------

ALTER TABLE public.periodos
ADD COLUMN IF NOT EXISTS tema text NOT NULL DEFAULT 'Normal';

ALTER TABLE public.periodos
RENAME COLUMN grupo TO grupo;

CREATE INDEX IF NOT EXISTS idx_periodos_tema_grupo
ON public.periodos (tema, grupo);

--------------------------------------------------------
-- Dias da semana
--------------------------------------------------------

ALTER TABLE public.dias_semana
ADD COLUMN IF NOT EXISTS tema text NOT NULL DEFAULT 'Normal';

ALTER TABLE public.dias_semana
RENAME COLUMN grupo TO grupo;

CREATE INDEX IF NOT EXISTS idx_dias_tema_grupo
ON public.dias_semana (tema, grupo);

COMMIT;