import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidedMusicFlow } from '../../backend/telegram-bot/guided-flow.js';
import { callbackDataBytes } from '../../backend/telegram-bot/parsers.js';

const ids = { userId: 10, chatId: 10 };
const original = { update_id: 100, processing_status: 'processed', last_error: null, payload: { update_id: 100, message: { text: '/musica Carlos da Silva', from: { id: 10 }, chat: { id: 10, type: 'private' } } } };
const genderUpdate = { update_id: 200, payload: { update_id: 200, callback_query: { data: 'g:100:M', from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } } };
const style = (index, active = true) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, active, name: `Ritmo ${String(index).padStart(2, '0')}`, prompt: `prompt ${index}` });

function setup(options = {}) {
  const sent = []; const answers = []; const calls = { prepared: [], acquired: 0, finished: 0, released: 0, cancelled: 0 };
  const updates = new Map([[100, options.original ?? original], [200, options.genderUpdate ?? genderUpdate]]);
  const styles = options.styles ?? Array.from({ length: 10 }, (_, index) => style(index + 1));
  const repository = {
    async getGuidedUpdate(id) { return updates.get(Number(id)) ?? null; },
    async acquireGuidedFinalization() { calls.acquired += 1; return options.marker === null ? null : 'GUIDED_FINALIZING:300'; },
    async finishGuidedFinalization() { calls.finished += 1; return true; },
    async releaseGuidedFinalization() { calls.released += 1; },
    async cancelGuidedUpdate() { calls.cancelled += 1; return true; },
    async listRecentUpdates() { return [original]; },
  };
  const styleCatalog = { async list() { return styles; }, async findById(_type, id) { return styles.find((item) => item.id === id && item.active) ?? null; } };
  const api = { async answerCallbackQuery(_id, value = {}) { answers.push(value); } };
  const send = async (chatId, text, optionsArg) => { sent.push({ chatId, text, options: optionsArg }); };
  const prepareWithStyle = async (input, styleId) => { calls.prepared.push({ input, styleId }); return { request: { id: '10000000-0000-4000-8000-000000000001', passenger_name: input.name, passenger_gender: input.gender, title: `Para ${input.name}`, style_name: styles.find((item) => item.id === styleId).name, local_period: 'Tarde', local_weekday: 'Segunda' } }; };
  return { flow: createGuidedMusicFlow({ api, repository, styleCatalog, prepareWithStyle, send }), sent, answers, calls, styles };
}
const callback = (update_id, data, userId = 10, chatId = 10) => ({ update_id, callback_query: { id: `cb-${update_id}`, data, from: { id: userId }, message: { chat: { id: chatId, type: 'private' } } } });

test('/musica Nome com espaços mostra botões M/F/N e cancelar', async () => {
  const s = setup();
  assert.equal(await s.flow.start(original.payload, ids, { passengerName: 'Carlos da Silva', gender: null }), true);
  const keyboard = s.sent[0].options.reply_markup.inline_keyboard;
  assert.deepEqual(keyboard.flat().map((item) => item.text), ['Masculino (M)', 'Feminino (F)', 'Neutro (N)', 'Cancelar']);
  assert.ok(keyboard.flat().every((item) => callbackDataBytes(item.callback_data) <= 64));
});

test('gênero lista somente estilos ativos, ordena e pagina em grupos de oito', async () => {
  const styles = [style(10), style(2), style(1, false), ...Array.from({ length: 8 }, (_, i) => style(i + 20))];
  const s = setup({ styles }); await s.flow.callback(callback(200, 'g:100:F'), ids);
  const keyboard = s.sent[0].options.reply_markup.inline_keyboard;
  const rhythmButtons = keyboard.flat().filter((item) => item.callback_data.startsWith('r:'));
  assert.equal(rhythmButtons.length, 8); assert.ok(rhythmButtons.every((item) => item.text !== 'Ritmo 01'));
  assert.equal(keyboard.flat().some((item) => item.text === 'Próxima ➡️'), true);
  assert.ok(keyboard.flat().every((item) => callbackDataBytes(item.callback_data) <= 64));
});

test('paginação seguinte preserva estado pelo update de gênero', async () => {
  const s = setup(); await s.flow.callback(callback(201, 'p:200:1'), ids);
  const buttons = s.sent[0].options.reply_markup.inline_keyboard.flat();
  assert.equal(buttons.filter((item) => item.callback_data.startsWith('r:')).length, 2);
  assert.equal(buttons.some((item) => item.text === '⬅️ Anterior'), true);
});

test('seleção valida dono, persiste escolha e torna repetição idempotente', async () => {
  const s = setup(); const selected = s.styles[0];
  await s.flow.callback(callback(300, `r:200:${selected.id}`), ids);
  assert.deepEqual(s.calls.prepared[0], { input: { update_id: 300, user_id: 10, chat_id: 10, name: 'Carlos da Silva', gender: 'M' }, styleId: selected.id });
  assert.match(s.sent[0].text, /Nome: Carlos da Silva[\s\S]*Gênero: Masculino[\s\S]*Ritmo: Ritmo 01/u);
  assert.equal(s.calls.finished, 1);
  const repeated = setup({ marker: null }); await repeated.flow.callback(callback(301, `r:200:${selected.id}`), ids);
  assert.equal(repeated.calls.prepared.length, 0); assert.equal(repeated.answers.at(-1).text, 'Pedido já processado.');
});

test('usuário ou chat divergente não acessa estado e callback inválido é curto', async () => {
  const s = setup(); await s.flow.callback(callback(300, 'g:100:M', 11, 11), { userId: 11, chatId: 11 });
  assert.equal(s.sent.length, 0); assert.equal(s.answers[0].text, 'Opção inválida ou expirada.');
});

test('cancelamento por botão e comando afeta somente interação guiada pendente', async () => {
  const byButton = setup(); await byButton.flow.callback(callback(300, 'x:100'), ids); assert.equal(byButton.calls.cancelled, 1);
  const byCommand = setup(); assert.equal(await byCommand.flow.cancel(ids), true); assert.equal(byCommand.calls.cancelled, 1);
});
