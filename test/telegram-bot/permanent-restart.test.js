import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';

test('erro permanente persistido avança sem reclamar nem repetir mensagem', async () => {
  let claims = 0; const sent = [];
  const repository = {
    async getUpdateState() { return { processing_status: 'failed', last_error: 'Erro permanente de domínio' }; },
    async claimUpdate() { claims += 1; return { claimed: true, processing_token: 'unexpected' }; },
  };
  const api = { async sendMessage(_chat, text) { sent.push(text); } };
  const preparationService = { async prepare() { throw new Error('não deveria processar'); } };
  const bot = createTelegramBotService({ api, repository, preparationService, allowedUserId: 10 });
  const update = { update_id: 21, message: { text: '/musica Ana | F', from: { id: 10 }, chat: { id: 10, type: 'private' } } };
  assert.equal(await bot.processUpdate(update), false);
  assert.equal(claims, 0);
  assert.deepEqual(sent, []);
});
