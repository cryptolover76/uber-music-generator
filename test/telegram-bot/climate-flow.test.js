import assert from 'node:assert/strict';
import test from 'node:test';
import { createGuidedMusicFlow } from '../../backend/telegram-bot/guided-flow.js';

const ids = { userId: 10, chatId: 10 };
const style = { id: '00000000-0000-4000-8000-000000000001', name: 'Samba', prompt: 'samba', active: true };
const climate = (id, categoria, active = true) => ({ id: `10000000-0000-4000-8000-${String(id).padStart(12, '0')}`, name: categoria ?? 'Sem categoria', texto: `Texto ${categoria}`, categoria, active });
const original = { update_id: 100, processing_status: 'processed', last_error: null, payload: { message: { text: '/musica Carlos', from: { id: 10 }, chat: { id: 10, type: 'private' } } } };
const gender = { update_id: 200, processing_status: 'processed', last_error: null, payload: { callback_query: { data: 'g:100:M', from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } } };
const styleUpdate = { update_id: 300, processing_status: 'processed', last_error: null, payload: { callback_query: { data: `r:200:${style.id}`, from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } } };
const callback = (id, data, user = 10, chat = 10) => ({ update_id: id, callback_query: { id: `cb-${id}`, data, from: { id: user }, message: { chat: { id: chat, type: 'private' } } } });

function setup({ weather = null, location = { latitude: 1, longitude: 2 }, climateRows } = {}) {
  const sent = []; const prepared = []; const answers = []; const updates = new Map([[100, original], [200, gender], [300, styleUpdate]]);
  const rows = climateRows ?? [climate(1, 'Ensolarado'), climate(2, 'Nublado'), climate(3, 'Chuvoso'), climate(4, null), climate(5, 'Nublado', false)];
  const repository = {
    async getGuidedUpdate(id) { return updates.get(Number(id)) ?? null; }, async getLocation() { return location; },
    async acquireGuidedFinalization() { return 'GUIDED_FINALIZING:400'; }, async finishGuidedFinalization() { return true; }, async releaseGuidedFinalization() {}, async listRecentUpdates() { return []; },
  };
  const catalog = { async list(type) { return type === 'climates' ? rows : [style]; }, async findById(type, id) { return (type === 'climates' ? rows : [style]).find((row) => row.id === id && row.active) ?? null; } };
  const api = { async answerCallbackQuery(_id, value = {}) { answers.push(value); } };
  const prepareWithStyle = async (input, styleId) => { prepared.push({ input, styleId }); return { request: { id: '20000000-0000-4000-8000-000000000001', passenger_name: input.name, passenger_gender: input.gender, title: 'Para Carlos', style_name: 'Samba', local_period: 'Tarde', local_weekday: 'Segunda' } }; };
  const flow = createGuidedMusicFlow({ api, repository, styleCatalog: catalog, prepareWithStyle, weatherService: { async current() { return weather; } }, send: async (_chat, text, options) => sent.push({ text, options }) });
  return { flow, sent, prepared, answers, rows };
}

test('clima automático seleciona categoria ativa e persiste metadados Open-Meteo', async () => {
  const s = setup({ weather: { category: 'Ensolarado', summary: 'Ensolarado; temperatura 25 °C' } });
  await s.flow.callback(callback(300, `r:200:${style.id}`), ids);
  assert.equal(s.prepared.length, 1); assert.equal(s.prepared[0].input.climate_id, climate(1, 'Ensolarado').id);
  assert.equal(s.prepared[0].input.weather_provider, 'open-meteo'); assert.equal(s.prepared[0].input.weather_status, 'applied');
  assert.match(s.sent[0].text, /Clima: Ensolarado/u);
});

test('ausência de localização ou falha meteorológica abre fallback sem categoria null', async () => {
  const s = setup({ location: null }); await s.flow.callback(callback(300, `r:200:${style.id}`), ids);
  assert.equal(s.prepared.length, 0); assert.equal(s.sent[0].text, 'Não consegui verificar o clima. Como está o tempo agora?');
  const buttons = s.sent[0].options.reply_markup.inline_keyboard.flat();
  assert.deepEqual(buttons.map((item) => item.text), ['☀️ Ensolarado', '☁️ Nublado', '🌧️ Chuvoso', '❌ Cancelar']);
  assert.ok(buttons.every((item) => !item.text.includes('Sem categoria')));
});

test('clima manual revalida dono e catálogo e continua a mesma preparação', async () => {
  const s = setup({ location: null }); const selected = climate(2, 'Nublado');
  await s.flow.callback(callback(400, `c:300:${selected.id}`), ids);
  assert.equal(s.prepared[0].input.climate_id, selected.id); assert.equal(s.prepared[0].input.weather_provider, null); assert.equal(s.prepared[0].input.weather_summary, 'Nublado');
  const wrong = setup({ location: null }); await wrong.flow.callback(callback(401, `c:300:${selected.id}`, 11, 11), { userId: 11, chatId: 11 });
  assert.equal(wrong.prepared.length, 0); assert.equal(wrong.answers[0].text, 'Opção inválida ou expirada.');
});
