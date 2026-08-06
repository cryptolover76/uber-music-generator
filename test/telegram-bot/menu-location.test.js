import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';

const msg = (id, text, extra = {}) => ({ update_id: id, message: { text, from: { id: 10 }, chat: { id: 10, type: 'private' }, ...extra } });
function setup({ savedLocation = null, recent = [] } = {}) {
  const sent = []; const saved = []; const prepared = [];
  const api = { async sendMessage(_chat, text, options) { sent.push({ text, options }); }, async answerCallbackQuery() {} };
  const repository = {
    async getUpdateState() { return null; }, async claimUpdate() { return { claimed: true, processing_token: 't' }; }, async completeUpdate() { return true; },
    async getLocation() { return savedLocation; }, async saveLocation(...args) { saved.push(args); }, async listRecentUpdates() { return recent; }, async cancelPending() { return false; }, async status() { return { confirmed_creations_count: 0, estimated_credits_consumed: 0 }; },
  };
  const bot = createTelegramBotService({ api, repository, preparationService: { async prepare(input) { prepared.push(input); } }, allowedUserId: 10 });
  return { bot, sent, saved, prepared };
}

test('/start mantém menu persistente e solicita localização apenas quando ausente', async () => {
  const first = setup(); await first.bot.processUpdate(msg(1, '/start'));
  const menu = first.sent[0].options.reply_markup; assert.equal(menu.resize_keyboard, true); assert.equal(menu.is_persistent, true);
  assert.deepEqual(menu.keyboard.flat().map((button) => button.text), ['🎵 Nova música', '📊 Status', '💳 Créditos', '📍 Localização', '❌ Cancelar']);
  assert.equal(first.sent[1].options.reply_markup.keyboard[0][0].request_location, true);
  const returning = setup({ savedLocation: { latitude: 1, longitude: 2 } }); await returning.bot.processUpdate(msg(2, '/start')); assert.equal(returning.sent.length, 1);
});

test('Nova música pergunta nome e a resposta sem comando inicia gênero', async () => {
  const origin = msg(10, '🎵 Nova música'); const first = setup(); await first.bot.processUpdate(origin); assert.equal(first.sent[0].text, 'Qual é o nome do passageiro?');
  const second = setup({ recent: [{ update_id: 10, payload: origin }] }); await second.bot.processUpdate(msg(11, 'Carlos da Silva'));
  assert.match(second.sent[0].text, /Nome: Carlos da Silva[\s\S]*Escolha o gênero/u);
  const menuText = setup({ recent: [{ update_id: 10, payload: origin }] }); await menuText.bot.processUpdate(msg(12, '📊 Status'));
  assert.ok(!menuText.sent.some((entry) => /Escolha o gênero/u.test(entry.text)));
});

test('localização é arredondada, substituída pelo repositório e coordenadas não são exibidas', async () => {
  const s = setup(); await s.bot.processUpdate(msg(20, undefined, { location: { latitude: -27.59449, longitude: -48.54851 } }));
  assert.deepEqual(s.saved[0], [10, 10, -27.594, -48.549]);
  assert.equal(s.sent[0].text, 'Localização salva. Não será necessário compartilhar novamente.');
  assert.ok(!s.sent[0].text.includes('-27') && s.sent[0].options.reply_markup.is_persistent);
});
