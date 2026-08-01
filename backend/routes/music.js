import express from 'express';
import { supabase, getById } from '../../config/database.js';
import { montarLetra } from '../../shared/substituir.js';
import { generateSong } from '../suno-automation.js';
import { sendTelegramMessage, formatMusicMessage } from '../telegram.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const jobs = new Map();

router.post('/generate', async (req, res) => {
  const { passageiroNome, genero, templateId, estiloId, climaId, periodoId, diaId } = req.body;

  if (!passageiroNome || !templateId || !estiloId) {
    return res.status(400).json({ error: 'Nome, template e estilo são obrigatórios' });
  }

  try {
    const [template, estilo, clima, periodo, dia] = await Promise.all([
      getById('templates_letras', templateId),
      getById('estilos', estiloId),
      climaId ? getById('climas', climaId) : null,
      periodoId ? getById('periodos', periodoId) : null,
      diaId ? getById('dias_semana', diaId) : null,
    ]);

    if (!template || !estilo) {
      return res.status(400).json({ error: 'Template e Estilo são obrigatórios' });
    }

    const partes = [periodo, clima, dia].filter(Boolean);
    const letraFinal = montarLetra(partes, template, passageiroNome, genero);
    const tags = estilo.prompt;
    const promptFinal = `Tags: ${tags}\n\n---\n\n${letraFinal}`;
    const title = `Para ${passageiroNome}`;

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    jobs.set(jobId, {
      status: 'starting',
      progress: 'Iniciando...',
      shareLink: null,
      error: null,
      passageiroNome,
      estilo: estilo.name,
      letraFinal,
      promptFinal,
      tags,
      startedAt: Date.now(),
    });

    res.json({ success: true, jobId, letraMontada: letraFinal, tags, promptUsado: promptFinal });

    runGeneration(jobId, { lyrics: letraFinal, tags, title, passageiroNome, estiloName: estilo.name, promptFinal });
  } catch (error) {
    console.error('[Music] Error:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

async function runGeneration(jobId, { lyrics, tags, title, passageiroNome, estiloName, promptFinal }) {
  const job = jobs.get(jobId);
  if (!job) return;

  try {
    job.status = 'running';
    job.progress = 'Abrindo navegador...';

    const result = await generateSong({
      lyrics,
      tags,
      title,
      headless: true,
      onProgress: (msg) => {
        job.progress = msg;
        console.log(`[Job ${jobId}] ${msg}`);
      },
    });

    if (result.success && result.shareLink) {
      job.status = 'completed';
      job.shareLink = result.shareLink;
      job.progress = 'Música pronta!';

      const { error: insertError } = await supabase
        .from('historico')
        .insert({
          passageiro_nome: passageiroNome,
          prompt_final: promptFinal,
          suno_music_id: 'browser_auto',
          suno_share_link: result.shareLink,
          tags,
        });
      if (insertError) console.warn('[Music] Falha ao salvar histórico:', insertError.message);

      const tgResult = await sendTelegramMessage(
        formatMusicMessage({ passageiroNome, shareLink: result.shareLink, estilo: estiloName })
      );
      job.telegramSent = tgResult.success;
      job.progress = tgResult.success ? 'Link enviado no Telegram!' : 'Música pronta, mas falha ao enviar Telegram';
    } else {
      job.status = 'failed';
      job.error = result.error || 'Falha desconhecida na geração';
      job.progress = `Erro: ${job.error}`;
    }
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    job.progress = `Erro: ${err.message}`;
    console.error(`[Job ${jobId}] Error:`, err.message);
  }
}

router.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job não encontrado' });
  }

  res.json({
    success: true,
    jobId,
    status: job.status,
    progress: job.progress,
    shareLink: job.shareLink,
    error: job.error,
    telegramSent: job.telegramSent,
  });
});

export default router;
