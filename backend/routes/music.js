import express from 'express';
import axios from 'axios';
import { supabase, getById } from '../../config/database.js';
import { montarLetra } from '../../shared/substituir.js';
import dotenv from 'dotenv';

dotenv.config();
const router = express.Router();

const SUNO_BASE = (process.env.SUNO_API_URL || 'https://suno-api.p.rapidapi.com').replace(/\/+$/, '');
const SUNO_API_KEY = process.env.SUNO_API_KEY;
const SUNO_HOST = new URL(SUNO_BASE).hostname;

function getSunoHeaders() {
  return {
    'x-rapidapi-key': SUNO_API_KEY,
    'x-rapidapi-host': SUNO_HOST,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
}

// Correct RapidAPI endpoint paths (confirmed from RapidAPI playground):
// POST /api/suno/v1/lyrics        - Generate Lyrics
// POST /api/suno/v1/music/concat  - Generate Music / Generate Full Song
// GET  /api/suno/v1/lyrics/{id}   - Get Generated Lyrics
// GET  /api/suno/v1/music/{id}    - Get Generated Music
const GENERATE_ENDPOINT = '/api/suno/v1/music/concat';
const STATUS_ENDPOINT = '/api/suno/v1/music';

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

    if (SUNO_API_KEY && SUNO_API_KEY !== 'sua_chave_aqui') {
      const body = {
        model: 'suno',
        task_type: 'music',
        input: {
          prompt: letraFinal,
          mv: 'chirp-crow',
          title: `Para ${passageiroNome}`,
          tags: tags,
        },
      };

      const endpoint = `${SUNO_BASE}${GENERATE_ENDPOINT}`;
      try {
        console.log(`🎵 Enviando para: ${endpoint}`);
        const sunoResponse = await axios.post(endpoint, body, { headers: getSunoHeaders() });
        sunoRawResponse = sunoResponse.data;
        console.log(`✅ Resposta:`, JSON.stringify(sunoResponse.data, null, 2));

        sunoTaskId =
          sunoResponse.data?.data?.task_id ||
          sunoResponse.data?.task_id ||
          sunoResponse.data?.id ||
          sunoResponse.data?.data?.id ||
          null;
        sunoStatus = sunoTaskId ? 'pending' : 'failed_no_task_id';
      } catch (err) {
        const msg = err.response?.data?.message || err.response?.data?.messages || err.response?.status || err.message;
        console.warn(`❌ Erro: ${msg}`);
        sunoRawResponse = err.response?.data || { error: msg };
        sunoStatus = 'error';
      }
    } else {
      sunoStatus = 'no_api_key';
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
      debug: { response: sunoRawResponse, endpoint: GENERATE_ENDPOINT },
    });
  } catch (error) {
    console.error('❌ Erro:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.get('/status/:taskId', async (req, res) => {
  const { taskId } = req.params;

  if (!SUNO_API_KEY || SUNO_API_KEY === 'sua_chave_aqui') {
    return res.status(400).json({ error: 'SUNO_API_KEY não configurada' });
  }

  const endpoint = `${SUNO_BASE}${STATUS_ENDPOINT}/${taskId}`;
  try {
    console.log(`🔍 Verificando status: ${endpoint}`);
    const response = await axios.get(endpoint, { headers: getSunoHeaders() });
    console.log('🔍 Resposta status:', JSON.stringify(response.data, null, 2));

    const taskData = response.data?.data || response.data;
    const status = taskData?.status || 'unknown';
    const clips = taskData?.output?.clips || taskData?.clips || [];

    res.json({
      success: true,
      taskId,
      status,
      clips: clips.map(clip => ({
        id: clip?.id,
        audioUrl: clip?.audio_url || clip?.url,
        videoUrl: clip?.video_url,
        title: clip?.title,
        duration: clip?.duration,
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
