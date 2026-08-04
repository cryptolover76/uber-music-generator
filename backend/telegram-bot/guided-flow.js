import { applicableCatalogItems } from '../music-preparation/catalog-selector.js';
import { callbackDataBytes, parseMusicCommand } from './parsers.js';

const PAGE_SIZE = 8;
const GENDERS = Object.freeze({ M: 'Masculino', F: 'Feminino', N: 'Neutro' });
const terminalState = (row) => row?.last_error === 'GUIDED_COMPLETED' || row?.last_error === 'GUIDED_CANCELLED' || row?.last_error?.startsWith('GUIDED_FINALIZING:');
const owner = (payload, ids) => {
  const from = payload?.message?.from ?? payload?.callback_query?.from;
  const chat = payload?.message?.chat ?? payload?.callback_query?.message?.chat;
  return String(from?.id) === String(ids.userId) && String(chat?.id) === String(ids.chatId) && chat?.type === 'private';
};
function button(text, callback_data) {
  if (callbackDataBytes(callback_data) > 64) throw new Error('callback_data exceeds Telegram limit');
  return { text, callback_data };
}
function commandFrom(row, ids) {
  if (!row || !owner(row.payload, ids)) return null;
  try {
    const parsed = parseMusicCommand(row.payload?.message?.text);
    return parsed?.gender == null ? parsed : null;
  } catch { return null; }
}

export function createGuidedMusicFlow({ api, repository, styleCatalog, prepareWithStyle, send }) {
  async function originalFromGender(genderUpdateId, ids) {
    const genderRow = await repository.getGuidedUpdate(genderUpdateId);
    if (!genderRow || !owner(genderRow.payload, ids)) return null;
    const match = String(genderRow.payload?.callback_query?.data || '').match(/^g:(\d+):([MFN])$/u);
    if (!match) return null;
    const original = await repository.getGuidedUpdate(match[1]);
    const command = commandFrom(original, ids);
    return command ? { original, command, gender: match[2] } : null;
  }
  async function styles() {
    const rows = await styleCatalog.list('styles');
    return applicableCatalogItems(rows, { catalogType: 'style' }).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
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
  async function invalid(query) { await api.answerCallbackQuery(query.id, { text: 'Opção inválida ou expirada.' }); }
  return Object.freeze({
    async start(update, ids, parsed) {
      if (parsed.gender) return false;
      const origin = String(update.update_id);
      await send(ids.chatId, `Nome: ${parsed.passengerName}\nEscolha o gênero:`, { reply_markup: { inline_keyboard: [
        [button('Masculino (M)', `g:${origin}:M`), button('Feminino (F)', `g:${origin}:F`)],
        [button('Neutro (N)', `g:${origin}:N`), button('Cancelar', `x:${origin}`)],
      ] } });
      return true;
    },
    async callback(update, ids) {
      const query = update.callback_query; const data = String(query?.data || '');
      let match = data.match(/^g:(\d+):([MFN])$/u);
      if (match) {
        const original = await repository.getGuidedUpdate(match[1]); const command = commandFrom(original, ids);
        if (!command) { await invalid(query); return true; }
        if (terminalState(original)) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
        await api.answerCallbackQuery(query.id);
        await showStyles(ids.chatId, String(update.update_id), match[1], 0);
        return true;
      }
      match = data.match(/^p:(\d+):(\d+)$/u);
      if (match) {
        const state = await originalFromGender(match[1], ids);
        if (!state || terminalState(state.original)) { await invalid(query); return true; }
        await api.answerCallbackQuery(query.id); await showStyles(ids.chatId, match[1], state.original.update_id, Number(match[2])); return true;
      }
      match = data.match(/^r:(\d+):([0-9a-f-]{36})$/iu);
      if (match) {
        const state = await originalFromGender(match[1], ids);
        if (!state) { await invalid(query); return true; }
        const expectedMarker = `GUIDED_FINALIZING:${update.update_id}`;
        if (terminalState(state.original) && state.original.last_error !== expectedMarker) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
        const selectedStyle = await styleCatalog.findById('styles', match[2]);
        if (!selectedStyle) { await api.answerCallbackQuery(query.id, { text: 'Ritmo indisponível.' }); return true; }
        applicableCatalogItems([selectedStyle], { catalogType: 'style' });
        const marker = state.original.last_error === expectedMarker ? expectedMarker :
          await repository.acquireGuidedFinalization(state.original.update_id, update.update_id);
        if (!marker) { await api.answerCallbackQuery(query.id, { text: 'Pedido já processado.' }); return true; }
        await api.answerCallbackQuery(query.id);
        try {
          const prepared = await prepareWithStyle({ update_id: update.update_id, user_id: ids.userId, chat_id: ids.chatId, name: state.command.passengerName, gender: state.gender }, selectedStyle.id);
          const request = prepared.request;
          await send(ids.chatId, `Pedido preparado\nNome: ${request.passenger_name}\nGênero: ${GENDERS[request.passenger_gender]}\nTítulo: ${request.title}\nRitmo: ${request.style_name}\nPeríodo: ${request.local_period}\nDia: ${request.local_weekday}`, { reply_markup: { inline_keyboard: [[button('Confirmar e criar', `confirm:${request.id}`)]] } });
          const finished = await repository.finishGuidedFinalization(state.original.update_id, marker);
          if (!finished) throw new Error('guided finalization lease lost');
        } catch (error) {
          await repository.releaseGuidedFinalization(state.original.update_id, marker);
          throw error;
        }
        return true;
      }
      match = data.match(/^x:(\d+)$/u);
      if (match) {
        const original = await repository.getGuidedUpdate(match[1]);
        if (!commandFrom(original, ids)) { await invalid(query); return true; }
        const cancelled = await repository.cancelGuidedUpdate(match[1]);
        await api.answerCallbackQuery(query.id, { text: cancelled ? 'Cancelado.' : 'Pedido já processado.' });
        return true;
      }
      return false;
    },
    async cancel(ids) {
      const updates = await repository.listRecentUpdates();
      const pending = updates.find((row) => row.processing_status === 'processed' && row.last_error == null && commandFrom(row, ids)?.gender == null);
      return pending ? repository.cancelGuidedUpdate(pending.update_id) : false;
    },
  });
}
