import { applicableCatalogItems } from '../music-preparation/catalog-selector.js';
import { callbackDataBytes, parseMusicCommand } from './parsers.js';
import { normalizePassengerName } from '../music-preparation/validation.js';

const PAGE_SIZE = 8;
const GENDERS = Object.freeze({ M: 'Masculino', F: 'Feminino', N: 'Neutro' });
const CLIMATE_ICONS = Object.freeze({ Ensolarado: '☀️', Nublado: '☁️', Chuvoso: '🌧️' });
const CLIMATE_ORDER = Object.freeze({ Ensolarado: 0, Nublado: 1, Chuvoso: 2 });
const terminalState = (row) => row?.last_error === 'GUIDED_COMPLETED' || row?.last_error === 'GUIDED_CANCELLED' || row?.last_error?.startsWith('GUIDED_FINALIZING:');
const owner = (payload, ids) => {
  const from = payload?.message?.from ?? payload?.callback_query?.from;
  const chat = payload?.message?.chat ?? payload?.callback_query?.message?.chat;
  return String(from?.id) === String(ids.userId) && String(chat?.id) === String(ids.chatId) && chat?.type === 'private';
};
function button(text, callback_data) { if (callbackDataBytes(callback_data) > 64) throw new Error('callback_data exceeds Telegram limit'); return { text, callback_data }; }
function commandFrom(row, ids) {
  if (!row || !owner(row.payload, ids)) return null;
  const text = row.payload?.message?.text;
  try {
    const parsed = parseMusicCommand(text);
    if (parsed) return { ...parsed, gender: null };
    if (typeof text === 'string' && !text.startsWith('/') && !text.startsWith('🎵') && !text.startsWith('📊') && !text.startsWith('📍') && !text.startsWith('❌')) return { passengerName: normalizePassengerName(text), gender: null };
  } catch {}
  return null;
}
function sortedCatalog(rows, type) {
  return applicableCatalogItems(rows, { catalogType: type }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
}

export function createGuidedMusicFlow({ api, repository, styleCatalog, prepareWithStyle, weatherService, send }) {
  async function originalFromGender(genderUpdateId, ids) {
    const genderRow = await repository.getGuidedUpdate(genderUpdateId);
    if (!genderRow || !owner(genderRow.payload, ids)) return null;
    const match = String(genderRow.payload?.callback_query?.data || '').match(/^g:(\d+):([MFN])$/u);
    if (!match) return null;
    const original = await repository.getGuidedUpdate(match[1]); const command = commandFrom(original, ids);
    return command ? { original, command, gender: match[2], genderRow } : null;
  }
  async function stateFromStyle(styleUpdateId, ids) {
    const styleRow = await repository.getGuidedUpdate(styleUpdateId);
    if (!styleRow || !owner(styleRow.payload, ids)) return null;
    const match = String(styleRow.payload?.callback_query?.data || '').match(/^r:(\d+):([0-9a-f-]{36})$/iu);
    if (!match) return null;
    const state = await originalFromGender(match[1], ids);
    return state ? { ...state, styleId: match[2], styleRow } : null;
  }
  async function styles() { return sortedCatalog(await styleCatalog.list('styles'), 'style'); }
  async function climates() {
    const rows = await styleCatalog.list('climates');
    return applicableCatalogItems(rows.filter((item) => item.categoria != null && CLIMATE_ICONS[item.categoria]), { catalogType: 'climate' }).sort((a, b) => CLIMATE_ORDER[a.categoria] - CLIMATE_ORDER[b.categoria] || a.id.localeCompare(b.id));
  }
  async function showStyles(chatId, genderUpdateId, originId, page) {
    const items = await styles();
    if (!items.length) { await send(chatId, 'Não há ritmos ativos no momento.'); return; }
    const pages = Math.ceil(items.length / PAGE_SIZE); const safePage = Math.max(0, Math.min(page, pages - 1));
    const rows = items.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((style) => [button(style.name, `r:${genderUpdateId}:${style.id}`)]);
    const navigation = [];
    if (safePage > 0) navigation.push(button('⬅️ Anterior', `p:${genderUpdateId}:${safePage - 1}`));
    if (safePage + 1 < pages) navigation.push(button('Próxima ➡️', `p:${genderUpdateId}:${safePage + 1}`));
    if (navigation.length) rows.push(navigation);
    rows.push([button('Cancelar', `x:${originId}`)]);
    await send(chatId, `Escolha o ritmo (${safePage + 1}/${pages}):`, { reply_markup: { inline_keyboard: rows } });
  }
  async function fallback(chatId, styleUpdateId, originId) {
    const items = await climates();
    const rows = items.map((item) => [button(`${CLIMATE_ICONS[item.categoria]} ${item.categoria}`, `c:${styleUpdateId}:${item.id}`)]);
    rows.push([button('❌ Cancelar', `x:${originId}`)]);
    await send(chatId, 'Não consegui verificar o clima. Como está o tempo agora?', { reply_markup: { inline_keyboard: rows } });
  }
  async function prepare(state, update, ids, style, climate, weather) {
    const expectedMarker = `GUIDED_FINALIZING:${update.update_id}`;
    if (terminalState(state.original) && state.original.last_error !== expectedMarker) { await api.answerCallbackQuery(update.callback_query.id, { text: 'Pedido já processado.' }); return; }
    const marker = state.original.last_error === expectedMarker ? expectedMarker : await repository.acquireGuidedFinalization(state.original.update_id, update.update_id);
    if (!marker) { await api.answerCallbackQuery(update.callback_query.id, { text: 'Pedido já processado.' }); return; }
    try {
      const prepared = await prepareWithStyle({ update_id: update.update_id, user_id: ids.userId, chat_id: ids.chatId, name: state.command.passengerName, gender: state.gender, climate_id: climate.id, weather_status: 'applied', weather_summary: weather.summary, weather_provider: weather.provider }, style.id);
      const request = prepared.request;
      await send(ids.chatId, `Pedido preparado\nNome: ${request.passenger_name}\nGênero: ${GENDERS[request.passenger_gender]}\nTítulo: ${request.title}\nRitmo: ${request.style_name}\nClima: ${climate.categoria}\nPeríodo: ${request.local_period}\nDia: ${request.local_weekday}`, { reply_markup: { inline_keyboard: [[button('Confirmar e criar', `confirm:${request.id}`)]] } });
      const finished = await repository.finishGuidedFinalization(state.original.update_id, marker);
      if (!finished) throw new Error('guided finalization lease lost');
    } catch (error) { await repository.releaseGuidedFinalization(state.original.update_id, marker); throw error; }
  }
  async function invalid(query) { await api.answerCallbackQuery(query.id, { text: 'Opção inválida ou expirada.' }); }
  return Object.freeze({
    async start(update, ids, parsed) {
      if (parsed.gender) return false;
      const origin = String(update.update_id);
      await send(ids.chatId, `Nome: ${parsed.passengerName}\nEscolha o gênero:`, { reply_markup: { inline_keyboard: [[button('Masculino (M)', `g:${origin}:M`), button('Feminino (F)', `g:${origin}:F`)], [button('Neutro (N)', `g:${origin}:N`), button('Cancelar', `x:${origin}`)]] } });
      return true;
    },
    async callback(update, ids) {
      const query = update.callback_query; const data = String(query?.data || ''); let match = data.match(/^g:(\d+):([MFN])$/u);
      if (match) {
        const original = await repository.getGuidedUpdate(match[1]); const command = commandFrom(original, ids);
        if (!command) { await invalid(query); return true; }
        if (terminalState(original)) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
        if (typeof repository.listRecentUpdates === 'function') {
          const rows = await repository.listRecentUpdates();
          const repeated = rows.some((row) => String(row.update_id) !== String(update.update_id) && row.processing_status === 'processed' && owner(row.payload, ids) && row.payload?.callback_query?.data === data);
          if (repeated) { await api.answerCallbackQuery(query.id, { text: 'Opção já selecionada.' }); return true; }
        }
        await api.answerCallbackQuery(query.id); await showStyles(ids.chatId, String(update.update_id), match[1], 0); return true;
      }
      match = data.match(/^p:(\d+):(\d+)$/u);
      if (match) { const state = await originalFromGender(match[1], ids); if (!state || terminalState(state.original)) { await invalid(query); return true; } await api.answerCallbackQuery(query.id); await showStyles(ids.chatId, match[1], state.original.update_id, Number(match[2])); return true; }
      match = data.match(/^r:(\d+):([0-9a-f-]{36})$/iu);
      if (match) {
        const state = await originalFromGender(match[1], ids); if (!state) { await invalid(query); return true; }
        if (terminalState(state.original)) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
        const style = await styleCatalog.findById('styles', match[2]); if (!style) { await api.answerCallbackQuery(query.id, { text: 'Ritmo indisponível.' }); return true; } applicableCatalogItems([style], { catalogType: 'style' });
        await api.answerCallbackQuery(query.id);
        if (typeof repository.getLocation !== 'function' && typeof weatherService?.current !== 'function') {
          const marker = await repository.acquireGuidedFinalization(state.original.update_id, update.update_id);
          if (!marker) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
          try {
            const prepared = await prepareWithStyle({ update_id: update.update_id, user_id: ids.userId, chat_id: ids.chatId, name: state.command.passengerName, gender: state.gender }, style.id);
            const request = prepared.request;
            await send(ids.chatId, `Pedido preparado\nNome: ${request.passenger_name}\nGênero: ${GENDERS[request.passenger_gender]}\nTítulo: ${request.title}\nRitmo: ${request.style_name}\nPeríodo: ${request.local_period}\nDia: ${request.local_weekday}`, { reply_markup: { inline_keyboard: [[button('Confirmar e criar', `confirm:${request.id}`)]] } });
            await repository.finishGuidedFinalization(state.original.update_id, marker);
          } catch (error) { await repository.releaseGuidedFinalization(state.original.update_id, marker); throw error; }
          return true;
        }
        const location = await repository.getLocation?.(ids.userId, ids.chatId) ?? null; const current = location ? await weatherService?.current?.(location) ?? null : null;
        if (current) {
          const matching = (await climates()).filter((item) => item.categoria === current.category);
          if (matching[0]) { await prepare(state, update, ids, style, matching[0], { summary: current.summary, provider: 'open-meteo' }); return true; }
        }
        await fallback(ids.chatId, update.update_id, state.original.update_id); return true;
      }
      match = data.match(/^c:(\d+):([0-9a-f-]{36})$/iu);
      if (match) {
        const state = await stateFromStyle(match[1], ids); if (!state) { await invalid(query); return true; }
        if (terminalState(state.original)) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
        const [style, climate] = await Promise.all([styleCatalog.findById('styles', state.styleId), styleCatalog.findById('climates', match[2])]);
        if (!style || !climate || climate.categoria == null || !CLIMATE_ICONS[climate.categoria]) { await invalid(query); return true; }
        applicableCatalogItems([style], { catalogType: 'style' }); applicableCatalogItems([climate], { catalogType: 'climate' });
        await api.answerCallbackQuery(query.id); await prepare(state, update, ids, style, climate, { summary: climate.categoria, provider: null }); return true;
      }
      match = data.match(/^x:(\d+)$/u);
      if (match) { const original = await repository.getGuidedUpdate(match[1]); if (!commandFrom(original, ids)) { await invalid(query); return true; } const cancelled = await repository.cancelGuidedUpdate(match[1]); await api.answerCallbackQuery(query.id, { text: cancelled ? 'Cancelado.' : 'Pedido já processado.' }); return true; }
      return false;
    },
    async cancel(ids) { const updates = await repository.listRecentUpdates(); const pending = updates.find((row) => row.processing_status === 'processed' && row.last_error == null && commandFrom(row, ids)?.gender == null); return pending ? repository.cancelGuidedUpdate(pending.update_id) : false; },
  });
}
