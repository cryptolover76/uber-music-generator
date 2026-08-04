import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';

function setup() {
  const sent = []; const prepared = [];
  const api = { async sendMessage(_chat, text, options) { sent.push({ text, options }); }, async answerCallbackQuery() {} };
  const repository = {
    async getUpdateState() { return null; }, async claimUpdate() { return { claimed: true, processing_token: 'token' }; }, async completeUpdate() { return true; },
  };
  const preparationService = { async prepare(input) { prepared.push(input); return { request: { id: '00000000-0000-4000-8000-000000000001', title: 'Para Ana', style_name: 'Samba', local_period: 'Tarde', local_weekday: 'Segunda' } }; } };
  const bot = createTelegramBotService({ api, repository, preparationService, allowedUserId: 10 });
  return { bot, sent, prepared };
}
const message = (update_id, text) => ({ update_id, message: { text, from: { id: 10 }, chat: { id: 10, type: 'private' } } });

test('/musica Carlos inicia gênero e formato antigo continua preparando', async () => {
  const guided = setup(); await guided.bot.processUpdate(message(1, '/musica Carlos'));
  assert.match(guided.sent[0].text, /Escolha o gênero/u);
  assert.deepEqual(guided.sent[0].options.reply_markup.inline_keyboard.flat().map((item) => item.text), ['Masculino (M)', 'Feminino (F)', 'Neutro (N)', 'Cancelar']);
  assert.equal(guided.prepared.length, 0);

  const legacy = setup(); await legacy.bot.processUpdate(message(2, '/musica Ana Maria | F'));
  assert.equal(legacy.prepared[0].name, 'Ana Maria'); assert.equal(legacy.prepared[0].gender, 'F');
});
