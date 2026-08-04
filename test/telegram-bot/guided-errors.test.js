import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidedMusicFlow } from '../../backend/telegram-bot/guided-flow.js';

const ids = { userId: 10, chatId: 10 };
const row = (text, last_error = null) => ({ update_id: 100, processing_status: 'processed', last_error, payload: { message: { text, from: { id: 10 }, chat: { id: 10, type: 'private' } } } });
const callback = (data, update_id = 200) => ({ update_id, callback_query: { id: 'cb', data, from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } });
function flowWith(original, styles = []) {
  const sent = []; const answers = []; let acquired = 0;
  const repository = { async getGuidedUpdate(id) { return Number(id) === 100 ? original : null; }, async acquireGuidedFinalization() { acquired += 1; return null; } };
  const api = { async answerCallbackQuery(_id, options = {}) { answers.push(options); } };
  const flow = createGuidedMusicFlow({ api, repository, styleCatalog: { async list() { return styles; } }, prepareWithStyle: async () => {}, send: async (_chat, text) => { sent.push(text); } });
  return { flow, sent, answers, get acquired() { return acquired; } };
}

test('catálogo vazio informa ausência de ritmos ativos', async () => {
  const setup = flowWith(row('/musica Carlos'));
  await setup.flow.callback(callback('g:100:M'), ids);
  assert.equal(setup.sent[0], 'Não há ritmos ativos no momento.');
});

test('callback guiado fabricado para formato antigo é rejeitado', async () => {
  const setup = flowWith(row('/musica Carlos | M'));
  await setup.flow.callback(callback('g:100:F'), ids);
  assert.equal(setup.answers[0].text, 'Opção inválida ou expirada.');
  assert.equal(setup.sent.length, 0);
});
