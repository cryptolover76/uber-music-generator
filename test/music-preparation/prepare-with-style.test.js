import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMusicRequestWithStyle } from '../../backend/music-preparation/prepare-music-request.js';

test('estilo escolhido é validado e template continua automático', async () => {
  const template = {
    id: '00000000-0000-4000-8000-000000000001',
    active: true,
    name: 'Base',
    letra: 'Olá {NOME}',
  };

  const style = {
    id: '00000000-0000-4000-8000-000000000002',
    active: true,
    name: 'Samba',
    prompt: 'samba alegre',
  };

  const calls = [];
  let persistedInput;

  const catalogRepository = {
    async list(type) {
      calls.push(['list', type]);
      return [template];
    },
    async findById(type, id) {
      calls.push(['find', type, id]);
      return id === style.id ? style : null;
    },
  };

  const preparationService = {
    async prepare(input) {
      persistedInput = input;
      return { request: input };
    },
  };

  await prepareMusicRequestWithStyle(
    { preparationService, catalogRepository },
    {
      update_id: 300,
      user_id: 10,
      chat_id: 10,
      name: 'Carlos',
      gender: 'M',
    },
    style.id,
  );

  assert.equal(persistedInput.selection_mode, 'automatic');
  assert.equal(persistedInput.template_id, undefined);
  assert.equal(persistedInput.style_id, style.id);
  assert.deepEqual(calls, [['find', 'styles', style.id]]);
});
