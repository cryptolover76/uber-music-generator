import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';
import { callbackDataBytes } from '../../backend/telegram-bot/parsers.js';

const style = { id: '00000000-0000-4000-8000-000000000001', name: 'Samba ativo', prompt: 'samba', active: true };
const message = (updateId, text, userId = 10) => ({ update_id: updateId, message: { text, from: { id: userId }, chat: { id: 10, type: 'private' } } });
const callback = (updateId, data, userId = 10) => ({ update_id: updateId, callback_query: { id: `cb-${updateId}`, data, from: { id: userId }, message: { chat: { id: 10, type: 'private' } } } });

function harness() {
  const rows = new Map(); const sent = []; const answers = [];
  const repository = {
    async getUpdateState(id) { const row = rows.get(Number(id)); return row ? { processing_status: row.processing_status, last_error: row.last_error } : null; },
    async claimUpdate(id, payload) { if (rows.has(Number(id))) return { claimed: false }; rows.set(Number(id), { update_id: Number(id), payload, processing_status: 'processing', last_error: null, received_at: new Date(Number(id) * 1000).toISOString() }); return { claimed: true, processing_token: `token-${id}` }; },
    async completeUpdate(id) { rows.get(Number(id)).processing_status = 'processed'; return true; },
    async getGuidedUpdate(id) { return rows.get(Number(id)) ?? null; },
    async listRecentUpdates() { return [...rows.values()].sort((a, b) => b.update_id - a.update_id); },
    async cancelGuidedUpdate(id) { const row = rows.get(Number(id)); if (!row || row.last_error) return false; row.last_error = 'GUIDED_CANCELLED'; return true; },
    async cancelPending() { return false; }, async getLocation() { return { latitude: -27.5, longitude: -48.5 }; },
  };
  const api = { async sendMessage(_chat, text, options) { sent.push({ text, options }); }, async answerCallbackQuery(_id, options = {}) { answers.push(options); } };
  const styleCatalog = { async list(type) { return type === 'styles' ? [style] : []; }, async findById() { return style; } };
  const bot = createTelegramBotService({ api, repository, preparationService: { async prepare() {} }, styleCatalog, prepareWithStyle: async () => {}, weatherService: { async current() { return null; } }, allowedUserId: 10 });
  return { bot, rows, sent, answers };
}

async function menuToGender(gender, name = 'Monica', base = 1) {
  const h = harness();
  await h.bot.processUpdate(message(base, '🎵 Nova música'));
  await h.bot.processUpdate(message(base + 1, name));
  const genderButtons = h.sent.at(-1).options.reply_markup.inline_keyboard.flat();
  const selected = genderButtons.find((button) => button.callback_data.endsWith(`:${gender}`));
  assert.ok(selected); assert.ok(callbackDataBytes(selected.callback_data) <= 64);
  assert.equal(selected.callback_data, `g:${base + 1}:${gender}`);
  await h.bot.processUpdate(callback(base + 2, selected.callback_data));
  return h;
}

test('integração exata Nova música → Monica → gênero F → ritmos ativos', async () => {
  const h = await menuToGender('F');
  assert.equal(h.rows.get(2).payload.message.text, 'Monica');
  assert.match(h.sent.at(-1).text, /Escolha o ritmo/u);
  assert.equal(h.sent.at(-1).options.reply_markup.inline_keyboard[0][0].text, 'Samba ativo');
  assert.equal(h.answers.at(-1).text, undefined);
});

test('gêneros M/N e nome com espaços recuperam o mesmo update persistido', async () => {
  for (const [index, gender] of ['M', 'N'].entries()) {
    const h = await menuToGender(gender, 'Maria da Silva', 10 + index * 10);
    assert.match(h.sent.at(-1).text, /Escolha o ritmo/u);
  }
});

test('outro usuário é rejeitado e repetição do dono é idempotente', async () => {
  const h = harness(); await h.bot.processUpdate(message(30, '🎵 Nova música')); await h.bot.processUpdate(message(31, 'Monica'));
  const data = 'g:31:F'; await h.bot.processUpdate(callback(32, data, 11)); assert.ok(!h.sent.some((entry) => /Escolha o ritmo/u.test(entry.text)));
  await h.bot.processUpdate(callback(33, data)); await h.bot.processUpdate(callback(34, data));
  assert.equal(h.sent.filter((entry) => /Escolha o ritmo/u.test(entry.text)).length, 1);
  assert.equal(h.answers.at(-1).text, 'Opção já selecionada.');
});

test('comando antigo com gênero continua recuperável pelo callback', async () => {
  const h = harness(); await h.bot.processUpdate(message(40, '/musica Maria | F'));
  const data = h.sent.at(-1).options.reply_markup.inline_keyboard.flat().find((button) => button.callback_data.endsWith(':F')).callback_data;
  await h.bot.processUpdate(callback(41, data)); assert.match(h.sent.at(-1).text, /Escolha o ritmo/u);
});
