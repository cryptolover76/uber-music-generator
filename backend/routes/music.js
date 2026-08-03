import express from 'express';
import { getById } from '../../config/database.js';
import { montarLetra } from '../../shared/substituir.js';

export async function prepareManualMusic(input, findById = getById) {
  const { passageiroNome, genero, templateId, estiloId, climaId, periodoId, diaId } = input;
  const [template, estilo, clima, periodo, dia] = await Promise.all([
    findById('templates_letras', templateId), findById('estilos', estiloId),
    climaId ? findById('climas', climaId) : null,
    periodoId ? findById('periodos', periodoId) : null,
    diaId ? findById('dias_semana', diaId) : null,
  ]);
  if (!template || !estilo) return null;
  const lyrics = montarLetra([periodo, clima, dia].filter(Boolean), template, passageiroNome, genero);
  return { success: true, title: `Para ${passageiroNome}`, style: estilo.prompt, lyrics, sunoCreateUrl: 'https://suno.com/create' };
}

export function createMusicRouter({ findById = getById } = {}) {
  const router = express.Router();
  router.post('/generate', async (req, res) => {
    const { passageiroNome, genero, templateId, estiloId, climaId, periodoId, diaId } = req.body;
    if (!passageiroNome || !templateId || !estiloId) return res.status(400).json({ error: 'Nome, template e estilo são obrigatórios' });
    try {
      const result = await prepareManualMusic({ passageiroNome, genero, templateId, estiloId, climaId, periodoId, diaId }, findById);
      if (!result) return res.status(400).json({ error: 'Template e Estilo são obrigatórios' });
      res.json(result);
    } catch (error) {
      console.error('[Music] Error:', error.message);
      res.status(500).json({ error: 'Erro interno' });
    }
  });
  return router;
}

export default createMusicRouter();
