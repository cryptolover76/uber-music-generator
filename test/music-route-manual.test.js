import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareManualMusic } from '../backend/routes/music.js';

test('fluxo web retorna título, estilo, letra e URL para criação manual', async () => {
  const items = {
    templates_letras: { id: 'template', letra: '[Chorus]\nOlá, {NOME}!' },
    estilos: { id: 'style', prompt: 'samba alegre' },
  };
  const result = await prepareManualMusic(
    { passageiroNome: 'Ana', genero: 'F', templateId: 'template', estiloId: 'style' },
    async (type) => items[type] ?? null
  );
  assert.deepEqual(result, { success: true, title: 'Para Ana', style: 'samba alegre', lyrics: '[Chorus]\nOlá, Ana!', sunoCreateUrl: 'https://suno.com/create' });
});
