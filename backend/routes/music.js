import express from 'express';
import { supabase, getById } from '../../config/database.js';
import { montarLetra } from '../../shared/substituir.js';
import { hasSunoConfigured, getGenerateEndpoint, gerarMusica, verificarStatus } from '../../config/suno.js';

const router = express.Router();

router.post('/generate', async (req, res) => {
  const { passageiroNome, genero, templateId, estiloId, climaId, periodoId, diaId } = req.body;

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

    let sunoTaskId = null;
    let sunoStatus = 'not_sent';
    let sunoRawResponse = null;

    if (hasSunoConfigured()) {
      try {
        sunoRawResponse = await gerarMusica({ letraFinal, tags, passageiroNome });
        console.log(`✅ Resposta:`, JSON.stringify(sunoRawResponse, null, 2));

        const clips = Array.isArray(sunoRawResponse) ? sunoRawResponse : [];
        sunoTaskId = clips.map(c => c.id).filter(Boolean).join(',');
        sunoStatus = sunoTaskId ? 'pending' : 'failed_no_task_id';
      } catch (err) {
        const msg = err.response?.data?.error || err.response?.data?.message || err.response?.status || err.message;
        console.warn(`❌ Erro Suno: ${msg}`);
        sunoRawResponse = err.response?.data || { error: msg };
        sunoStatus = 'error';
      }
    } else {
      sunoStatus = 'no_cookie';
    }

    const promptFinal = `Tags: ${tags}\n\n---\n\n${letraFinal}`;

    const { error: insertError } = await supabase
      .from('historico')
      .insert({
        passageiro_nome: passageiroNome,
        prompt_final: promptFinal,
        suno_music_id: sunoTaskId || 'no_task',
      });
    if (insertError) console.warn('⚠️ Falha ao salvar histórico:', insertError.message);

    res.json({
      success: true,
      taskId: sunoTaskId,
      status: sunoStatus,
      letraMontada: letraFinal,
      tags: tags,
      promptUsado: promptFinal,
      debug: { response: sunoRawResponse, endpoint: getGenerateEndpoint() },
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/status/:taskId', async (req, res) => {
  const { taskId } = req.params;

  if (!hasSunoConfigured()) {
    return res.status(400).json({ error: 'Cookie do Suno não configurado' });
  }

  try {
    const rawData = await verificarStatus(taskId);
    console.log('🔍 Resposta status:', JSON.stringify(rawData, null, 2));

    const clips = Array.isArray(rawData) ? rawData : [];

    const allComplete = clips.length > 0 && clips.every(c => c.status === 'complete');
    const anyError = clips.some(c => c.status === 'error');
    const overallStatus = anyError ? 'error' : allComplete ? 'completed' : 'pending';

    res.json({
      success: true,
      taskId,
      status: overallStatus,
      clips: clips.map(clip => ({
        id: clip?.id,
        audioUrl: clip?.audio_url,
        videoUrl: clip?.video_url,
        title: clip?.title,
        duration: clip?.duration,
        status: clip?.status,
      })),
    });
  } catch (err) {
    console.warn(`❌ Status falhou:`, err.response?.data || err.message);
    res.status(500).json({
      error: 'Não foi possível verificar o status',
      details: err.response?.data || err.message,
    });
  }
});

export default router;
