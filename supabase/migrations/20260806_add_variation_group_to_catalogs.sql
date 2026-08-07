-- Agrupa blocos de letra que foram escritos para funcionar juntos.
-- Inicialmente o campo aceita NULL para preservar os cadastros existentes.

ALTER TABLE public.templates_letras
ADD COLUMN IF NOT EXISTS grupo integer;

ALTER TABLE public.climas
ADD COLUMN IF NOT EXISTS grupo integer;

ALTER TABLE public.periodos
ADD COLUMN IF NOT EXISTS grupo integer;

ALTER TABLE public.dias_semana
ADD COLUMN IF NOT EXISTS grupo integer;


ALTER TABLE public.templates_letras
DROP CONSTRAINT IF EXISTS templates_letras_grupo_check;

ALTER TABLE public.templates_letras
ADD CONSTRAINT templates_letras_grupo_check
CHECK (
  grupo IS NULL
  OR grupo > 0
);


ALTER TABLE public.climas
DROP CONSTRAINT IF EXISTS climas_grupo_check;

ALTER TABLE public.climas
ADD CONSTRAINT climas_grupo_check
CHECK (
  grupo IS NULL
  OR grupo > 0
);


ALTER TABLE public.periodos
DROP CONSTRAINT IF EXISTS periodos_grupo_check;

ALTER TABLE public.periodos
ADD CONSTRAINT periodos_grupo_check
CHECK (
  grupo IS NULL
  OR grupo > 0
);


ALTER TABLE public.dias_semana
DROP CONSTRAINT IF EXISTS dias_semana_grupo_check;

ALTER TABLE public.dias_semana
ADD CONSTRAINT dias_semana_grupo_check
CHECK (
  grupo IS NULL
  OR grupo > 0
);


CREATE INDEX IF NOT EXISTS templates_letras_grupo_idx
ON public.templates_letras (grupo)
WHERE active = true
  AND grupo IS NOT NULL;

CREATE INDEX IF NOT EXISTS climas_categoria_grupo_idx
ON public.climas (categoria, grupo)
WHERE active = true
  AND grupo IS NOT NULL;

CREATE INDEX IF NOT EXISTS periodos_categoria_grupo_idx
ON public.periodos (categoria, grupo)
WHERE active = true
  AND grupo IS NOT NULL;

CREATE INDEX IF NOT EXISTS dias_semana_categoria_grupo_idx
ON public.dias_semana (categoria, grupo)
WHERE active = true
  AND grupo IS NOT NULL;
