/*
# Criar tabelas do Gerador de Música Uber

1. Novas Tabelas
- `estilos` — estilos musicais com prompt descritivo para a IA (coluna `prompt`).
- `templates_letras` — letras principais/templates com coluna `letra`.
- `climas` — blocos de texto de contexto (clima), coluna `texto`.
- `periodos` — blocos de texto de contexto (período do dia), coluna `texto`.
- `dias_semana` — blocos de texto de contexto (dia da semana), coluna `texto`.
- `historico` — registro de gerações enviadas ao Suno (nome, prompt final, id da música).
2. Segurança
- RLS habilitado em todas as tabelas.
- App sem tela de login: políticas `TO anon, authenticated` (CRUD público/compartilhado).
3. Notas
- `active` booleano padrão true para soft-delete dos itens de catálogo.
- `created_at` padrão now() no historico.
- Seed com os mesmos dados que existiam no SQLite.
*/

CREATE TABLE IF NOT EXISTS estilos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prompt text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates_letras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  letra text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS climas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  texto text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  texto text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dias_semana (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  texto text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passageiro_nome text,
  prompt_final text,
  suno_music_id text,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE estilos ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_letras ENABLE ROW LEVEL SECURITY;
ALTER TABLE climas ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dias_semana ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico ENABLE ROW LEVEL SECURITY;

-- Políticas: app sem login, dados compartilhados -> TO anon, authenticated
-- estilos
DROP POLICY IF EXISTS "anon_crud_estilos_select" ON estilos;
CREATE POLICY "anon_crud_estilos_select" ON estilos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_crud_estilos_insert" ON estilos;
CREATE POLICY "anon_crud_estilos_insert" ON estilos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_estilos_update" ON estilos;
CREATE POLICY "anon_crud_estilos_update" ON estilos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_estilos_delete" ON estilos;
CREATE POLICY "anon_crud_estilos_delete" ON estilos FOR DELETE TO anon, authenticated USING (true);

-- templates_letras
DROP POLICY IF EXISTS "anon_crud_templates_select" ON templates_letras;
CREATE POLICY "anon_crud_templates_select" ON templates_letras FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_crud_templates_insert" ON templates_letras;
CREATE POLICY "anon_crud_templates_insert" ON templates_letras FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_templates_update" ON templates_letras;
CREATE POLICY "anon_crud_templates_update" ON templates_letras FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_templates_delete" ON templates_letras;
CREATE POLICY "anon_crud_templates_delete" ON templates_letras FOR DELETE TO anon, authenticated USING (true);

-- climas
DROP POLICY IF EXISTS "anon_crud_climas_select" ON climas;
CREATE POLICY "anon_crud_climas_select" ON climas FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_crud_climas_insert" ON climas;
CREATE POLICY "anon_crud_climas_insert" ON climas FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_climas_update" ON climas;
CREATE POLICY "anon_crud_climas_update" ON climas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_climas_delete" ON climas;
CREATE POLICY "anon_crud_climas_delete" ON climas FOR DELETE TO anon, authenticated USING (true);

-- periodos
DROP POLICY IF EXISTS "anon_crud_periodos_select" ON periodos;
CREATE POLICY "anon_crud_periodos_select" ON periodos FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_crud_periodos_insert" ON periodos;
CREATE POLICY "anon_crud_periodos_insert" ON periodos FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_periodos_update" ON periodos;
CREATE POLICY "anon_crud_periodos_update" ON periodos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_periodos_delete" ON periodos;
CREATE POLICY "anon_crud_periodos_delete" ON periodos FOR DELETE TO anon, authenticated USING (true);

-- dias_semana
DROP POLICY IF EXISTS "anon_crud_dias_select" ON dias_semana;
CREATE POLICY "anon_crud_dias_select" ON dias_semana FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_crud_dias_insert" ON dias_semana;
CREATE POLICY "anon_crud_dias_insert" ON dias_semana FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_dias_update" ON dias_semana;
CREATE POLICY "anon_crud_dias_update" ON dias_semana FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_dias_delete" ON dias_semana;
CREATE POLICY "anon_crud_dias_delete" ON dias_semana FOR DELETE TO anon, authenticated USING (true);

-- historico
DROP POLICY IF EXISTS "anon_crud_historico_select" ON historico;
CREATE POLICY "anon_crud_historico_select" ON historico FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_crud_historico_insert" ON historico;
CREATE POLICY "anon_crud_historico_insert" ON historico FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_historico_update" ON historico;
CREATE POLICY "anon_crud_historico_update" ON historico FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_crud_historico_delete" ON historico;
CREATE POLICY "anon_crud_historico_delete" ON historico FOR DELETE TO anon, authenticated USING (true);

-- Seed (apenas se vazio)
INSERT INTO estilos (name, prompt)
SELECT * FROM (VALUES
  ('Sertanejo', 'brazilian sertanejo, acoustic guitar, emotional vocals, moderate tempo'),
  ('Pop', 'modern pop, catchy, radio friendly, upbeat'),
  ('MPB', 'Música Popular Brasileira, sophisticated, bossa nova influence, warm vocals')
) AS v(name, prompt)
WHERE NOT EXISTS (SELECT 1 FROM estilos);

INSERT INTO templates_letras (name, letra)
SELECT 'Boas-vindas Animada', '[Verso 1]
O carro chegou, o motor já ligou
{NOME} embarcou e a vibe mudou
Pela janela o mundo vai passar
Mas essa música é pra te animar

[Refrão]
{NOME}, {NOME}, você é demais
Nesse carro a gente canta em paz
{NOME}, {NOME}, aproveita o som
Essa viagem é só nossa, e tá muito bom'
WHERE NOT EXISTS (SELECT 1 FROM templates_letras);

INSERT INTO climas (name, texto)
SELECT * FROM (VALUES
  ('Ensolarado', '[Intro falada] Ei {NOME}, o dia tá lindo e ensolarado lá fora! Aproveita essa energia boa.'),
  ('Chuvoso', '[Intro falada] {NOME}, tá chovendo aqui fora, mas relaxa que aqui dentro o clima é de aconchego e bom som.')
) AS v(name, texto)
WHERE NOT EXISTS (SELECT 1 FROM climas);

INSERT INTO periodos (name, texto)
SELECT * FROM (VALUES
  ('Manhã', 'Bom dia, {NOME}! Começando o dia com o pé direito e essa trilha sonora especial.'),
  ('Noite', 'A noite caiu, {NOME}, e a viagem só fica melhor agora.')
) AS v(name, texto)
WHERE NOT EXISTS (SELECT 1 FROM periodos);

INSERT INTO dias_semana (name, texto)
SELECT * FROM (VALUES
  ('Sexta-feira', 'É sexta-feira, {NOME}! Deixa os problemas no trabalho e vem curtir.'),
  ('Fim de Semana', 'Fim de semana chegou, {NOME}! Modo descanso e boa música ativado.')
) AS v(name, texto)
WHERE NOT EXISTS (SELECT 1 FROM dias_semana);
