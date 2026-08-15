import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import musicRouter from './routes/music.js';
import { supabase, getAll, insertItem, updateItem, deleteItem, TIPOS_VALIDOS } from '../config/database.js';
import { startTelegramPolling } from './telegram-bot/runtime.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));
app.use('/shared', express.static('shared'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Servidor de Música Uber rodando com sucesso!',
    port: PORT,
  });
});

app.get('/api/estilos', async (req, res) => {
  try {
    res.json(await getAll('estilos'));
  } catch (error) {
    console.error('Erro ao buscar estilos:', error.message);
    res.status(500).json({ error: 'Erro ao buscar estilos' });
  }
});

app.get('/api/climas', async (req, res) => {
  try {
    res.json(await getAll('climas'));
  } catch (error) {
    console.error('Erro ao buscar climas:', error.message);
    res.status(500).json({ error: 'Erro ao buscar climas' });
  }
});

app.get('/api/periodos', async (req, res) => {
  try {
    res.json(await getAll('periodos'));
  } catch (error) {
    console.error('Erro ao buscar periodos:', error.message);
    res.status(500).json({ error: 'Erro ao buscar periodos' });
  }
});

app.get('/api/dias_semana', async (req, res) => {
  try {
    res.json(await getAll('dias_semana'));
  } catch (error) {
    console.error('Erro ao buscar dias da semana:', error.message);
    res.status(500).json({ error: 'Erro ao buscar dias da semana' });
  }
});

app.get('/api/templates_letras', async (req, res) => {
  try {
    res.json(await getAll('templates_letras'));
  } catch (error) {
    console.error('Erro ao buscar templates:', error.message);
    res.status(500).json({ error: 'Erro ao buscar templates' });
  }
});

app.post('/api/admin/add', async (req, res) => {
  console.log('📥 Recebido no Admin:', req.body);

  const {
    tipo,
    nome,
    conteudo,
    categoria,
    grupo: grupoVariacaoRaw,
  } = req.body;

  if (!tipo || !TIPOS_VALIDOS[tipo]) {
    return res.status(400).json({ success: false, error: `Tipo inválido: ${tipo}` });
  }
  if (!nome || nome.trim() === '') {
    return res.status(400).json({ success: false, error: 'O campo "Nome" está vazio.' });
  }
  if (!conteudo || conteudo.trim() === '') {
    return res.status(400).json({ success: false, error: 'O campo "Conteúdo" está vazio.' });
  }

  let grupoVariacao = null;

  if (
    grupoVariacaoRaw !== undefined
    && grupoVariacaoRaw !== null
    && grupoVariacaoRaw !== ''
  ) {
    grupoVariacao = Number(grupoVariacaoRaw);

    if (
      !Number.isSafeInteger(grupoVariacao)
      || grupoVariacao < 1
      || grupoVariacao > 999
    ) {
      return res.status(400).json({
        success: false,
        error: 'O grupo de variação deve ser um número inteiro entre 1 e 999.',
      });
    }
  }

  try {
    const item = await insertItem(
      tipo,
      nome.trim(),
      conteudo.trim(),
      categoria || null,
      grupoVariacao,
    );
    res.json({ success: true, item });
  } catch (error) {
    console.error('❌ Erro ao salvar:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use('/api/music', musicRouter);

app.get('/api/musicas', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('historico')
      .select('id, passageiro_nome, suno_share_link, tags, suno_music_id, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Erro ao buscar músicas:', error.message);
    res.status(500).json({ error: 'Erro ao buscar músicas' });
  }
});

app.get('/api/categorias/:tipo', (req, res) => {
  const { tipo } = req.params;
  if (!TIPOS_VALIDOS[tipo]) return res.status(400).json({ error: 'Tipo inválido' });
  res.json(TIPOS_VALIDOS[tipo].categorias || []);
});

app.get('/api/admin/list/:tipo', async (req, res) => {
  const { tipo } = req.params;
  if (!TIPOS_VALIDOS[tipo]) return res.status(400).json({ error: 'Tipo inválido' });
  try {
    res.json(await getAll(tipo));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/update/:tipo/:id', async (req, res) => {
  const { tipo, id } = req.params;
  const {
    nome,
    conteudo,
    categoria,
    grupo: grupoVariacaoRaw,
  } = req.body;
  if (!TIPOS_VALIDOS[tipo]) return res.status(400).json({ error: 'Tipo inválido' });
  if (!nome || !conteudo) return res.status(400).json({ error: 'Nome e conteúdo obrigatórios' });
  let grupoVariacao;

  if (grupoVariacaoRaw !== undefined) {
    if (
      grupoVariacaoRaw === null
      || grupoVariacaoRaw === ''
    ) {
      grupoVariacao = null;
    } else {
      grupoVariacao = Number(grupoVariacaoRaw);

      if (
        !Number.isSafeInteger(grupoVariacao)
        || grupoVariacao < 1
        || grupoVariacao > 999
      ) {
        return res.status(400).json({
          success: false,
          error: 'O grupo de variação deve ser um número inteiro entre 1 e 999.',
        });
      }
    }
  }

  try {
    const item = await updateItem(
      tipo,
      id,
      nome.trim(),
      conteudo.trim(),
      categoria !== undefined ? categoria : undefined,
      grupoVariacao,
    );
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/delete/:tipo/:id', async (req, res) => {
  const { tipo, id } = req.params;
  if (!TIPOS_VALIDOS[tipo]) return res.status(400).json({ error: 'Tipo inválido' });
  try {
    await deleteItem(tipo, id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

const telegramPoller = startTelegramPolling();
async function shutdown(signal) {
  console.log(`[Server] Encerrando por ${signal}`);
  await telegramPoller?.stop();
  server.close(() => process.exit(0));
}
process.once('SIGTERM', () => { void shutdown('SIGTERM'); });
process.once('SIGINT', () => { void shutdown('SIGINT'); });



export default app;
