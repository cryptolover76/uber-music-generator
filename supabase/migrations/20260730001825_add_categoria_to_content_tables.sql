/*
# Adicionar coluna "categoria" às tabelas de conteúdo

1. Alterações
- Adiciona coluna `categoria` (text, nullable) em: climas, periodos, dias_semana, estilos, templates_letras.
- A coluna agrupa itens por categoria fixa (ex: "Ensolarado", "Chuvoso" para climas).
- templates_letras recebe categoria também para flexibilidade futura, mas sem categorias fixas obrigatórias.
2. Seed de novos itens
- Climas: garante cobertura de Ensolarado, Chuvoso, Nublado.
- Periodos: garante Manhã, Tarde, Fim de tarde, Noite.
- Dias: garante Segunda a Domingo, Feriado, Fim de semana.
- Estilos: adiciona Moda de viola, Rock 80, Rock 90, Pagode, Sertanejo universitário, Forró, Funk, Samba, Axé.
3. Segurança
- Sem mudanças de RLS (políticas existentes cobrem a nova coluna automaticamente).
4. Notas
- Categorias existentes são atribuídas retroativamente aos itens seed já presentes.
- A coluna é nullable para não quebrar itens existentes sem categoria.
*/

-- Adicionar coluna categoria
ALTER TABLE climas ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE periodos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE dias_semana ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE estilos ADD COLUMN IF NOT EXISTS categoria text;
ALTER TABLE templates_letras ADD COLUMN IF NOT EXISTS categoria text;

-- Atribuir categoria aos itens climas existentes
UPDATE climas SET categoria = 'Ensolarado' WHERE name ILIKE '%ensol%' AND categoria IS NULL;
UPDATE climas SET categoria = 'Chuvoso' WHERE name ILIKE '%chuv%' AND categoria IS NULL;
UPDATE climas SET categoria = 'Nublado' WHERE name ILIKE '%nubl%' AND categoria IS NULL;

-- Atribuir categoria aos itens periodos existentes
UPDATE periodos SET categoria = 'Manhã' WHERE name ILIKE '%manh%' AND categoria IS NULL;
UPDATE periodos SET categoria = 'Tarde' WHERE name ILIKE '%tarde%' AND categoria IS NULL;
UPDATE periodos SET categoria = 'Fim de tarde' WHERE name ILIKE '%fim%tarde%' AND categoria IS NULL;
UPDATE periodos SET categoria = 'Noite' WHERE name ILIKE '%noite%' AND categoria IS NULL;

-- Atribuir categoria aos itens dias_semana existentes
UPDATE dias_semana SET categoria = 'Segunda' WHERE name ILIKE '%segunda%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Terça' WHERE name ILIKE '%terça%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Quarta' WHERE name ILIKE '%quarta%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Quinta' WHERE name ILIKE '%quinta%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Sexta' WHERE name ILIKE '%sexta%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Sábado' WHERE name ILIKE '%sábado%' OR name ILIKE '%sabado%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Domingo' WHERE name ILIKE '%domingo%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Feriado' WHERE name ILIKE '%feriado%' AND categoria IS NULL;
UPDATE dias_semana SET categoria = 'Fim de semana' WHERE name ILIKE '%fim%semana%' AND categoria IS NULL;

-- Atribuir categoria aos estilos existentes
UPDATE estilos SET categoria = 'Sertanejo' WHERE name ILIKE '%sertanejo%' AND categoria IS NULL;
UPDATE estilos SET categoria = 'Pop' WHERE name ILIKE '%pop%' AND categoria IS NULL;
UPDATE estilos SET categoria = 'MPB' WHERE name ILIKE '%mpb%' AND categoria IS NULL;

-- Seed de estilos adicionais (apenas se não existir item com mesmo name)
INSERT INTO estilos (name, prompt, categoria)
SELECT * FROM (VALUES
  ('Moda de Viola', 'brazilian moda de viola, caipira folk, viola caipira, rural, storytelling', 'Moda de viola'),
  ('Rock 80', '80s rock, electric guitar, synthesizer, power ballad, energetic drums', 'Rock 80'),
  ('Rock 90', '90s rock, grunge influence, distorted guitar, alternative rock, raw vocals', 'Rock 90'),
  ('Pagode', 'brazilian pagode, percussion, cavaquinho, joyful, group vocals', 'Pagode'),
  ('Sertanejo Universitário', 'sertanejo universitario, acoustic guitar, romantic, young, catchy chorus', 'Sertanejo universitário'),
  ('Forró', 'brazilian forro, accordion, zabumba, triangle, northeastern, danceable', 'Forró'),
  ('Funk', 'brazilian funk, electronic beat, bass heavy, energetic, dance', 'Funk'),
  ('Samba', 'brazilian samba, percussion, cavaquinho, lively, carnival rhythm', 'Samba'),
  ('Axé', 'bahian axe, upbeat, brass, percussion, carnival, energetic', 'Axé')
) AS v(name, prompt, categoria)
WHERE NOT EXISTS (SELECT 1 FROM estilos WHERE name = v.name);

-- Seed de climas para garantir cobertura total
INSERT INTO climas (name, texto, categoria)
SELECT * FROM (VALUES
  ('Nublado Aconchegante', '[Intro falada] {NOME}, o céu tá meio nublado hoje, mas isso não atrapalha nossa viagem. Relaxa e aproveita o som!', 'Nublado')
) AS v(name, texto, categoria)
WHERE NOT EXISTS (SELECT 1 FROM climas WHERE name = v.name);

-- Seed de periodos para garantir cobertura total
INSERT INTO periodos (name, texto, categoria)
SELECT * FROM (VALUES
  ('Tarde Animada', 'Boa tarde, {NOME}! A tarde tá ótima e essa viagem vai ser rápida e animada.', 'Tarde'),
  ('Fim de Tarde Relax', 'O dia já tá acabando, {NOME}. Fim de tarde, sol baixando, e uma música pra fechar bem.', 'Fim de tarde')
) AS v(name, texto, categoria)
WHERE NOT EXISTS (SELECT 1 FROM periodos WHERE name = v.name);

-- Seed de dias_semana para garantir cobertura total
INSERT INTO dias_semana (name, texto, categoria)
SELECT * FROM (VALUES
  ('Segunda-feira', 'Segunda-feira chegou, {NOME}! Começando a semana com energia e boa música.', 'Segunda'),
  ('Terça-feira', 'Terça-feira, {NOME}! A semana já engrenou, bora continuar com tudo.', 'Terça'),
  ('Quarta-feira', 'Quarta-feira, {NOME}! Meio da semana já, falta pouco pro descanso.', 'Quarta'),
  ('Quinta-feira', 'Quinta-feira, {NOME}! Tá quase chegando o final de semana, anima aí!', 'Quinta'),
  ('Feriado', 'Hoje é feriado, {NOME}! Dia de descanso, sem pressa, só curtindo a viagem e o som.', 'Feriado')
) AS v(name, texto, categoria)
WHERE NOT EXISTS (SELECT 1 FROM dias_semana WHERE name = v.name);
