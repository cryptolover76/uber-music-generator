import { getLocalContext } from '../music-preparation/local-context.js';
import { escapeHtml, graphemeLength, parseMusicCommand, parseSunoLink, splitPreformattedText, splitTelegramText } from './parsers.js';
import { normalizePassengerName } from '../music-preparation/validation.js';
import { isPermanentUpdateError, TelegramUpdateLeaseError } from './update-errors.js';
import { createGuidedMusicFlow } from './guided-flow.js';

const HELP = 'Envie /musica Nome\nExemplo: /musica Maria da Silva\nEscolha gênero e ritmo, confirme, crie no Suno e cole aqui o link HTTPS.\n/status mostra o uso; /cancelar cancela a interação pendente.';
const SUNO_CREATE_URL = 'https://suno.com/create';
const MENU_LABELS = Object.freeze({
  newMusic: '🎵 Nova música',
  status: '📊 Status',
  credits: '💳 Créditos',
  location: '📍 Localização',
  cancel: '❌ Cancelar',
});
const MENU = Object.freeze({
  keyboard: [
    [{ text: MENU_LABELS.newMusic }, { text: MENU_LABELS.status }],
    [{ text: MENU_LABELS.credits }, { text: MENU_LABELS.location }],
    [{ text: MENU_LABELS.cancel }],
  ],
  resize_keyboard: true,
  is_persistent: true,
});
const LOCATION_KEYBOARD = Object.freeze({ keyboard: [[{ text: '📍 Ativar clima automático', request_location: true }]], resize_keyboard: true, is_persistent: true });
function identity(update) { const source = update.message ?? update.callback_query?.message; const from = update.message?.from ?? update.callback_query?.from; return { chatId: source?.chat?.id, chatType: source?.chat?.type, userId: from?.id }; }
function localDate(clock) { return getLocalContext(clock(), 'America/Sao_Paulo').localDate; }

function creditCycleStatus(clock, renewalDay, songsAvailable) {
  const [year, month, day] = localDate(clock).split('-').map(Number);

  const daysInCurrentMonth = new Date(
    Date.UTC(year, month, 0),
  ).getUTCDate();

  let renewalYear = year;
  let renewalMonth = month;
  let effectiveRenewalDay = Math.min(
    renewalDay,
    daysInCurrentMonth,
  );

  let renewalDate = new Date(
    Date.UTC(renewalYear, renewalMonth - 1, effectiveRenewalDay),
  );

  const today = new Date(Date.UTC(year, month - 1, day));

  if (renewalDate <= today) {
    renewalMonth += 1;

    if (renewalMonth > 12) {
      renewalMonth = 1;
      renewalYear += 1;
    }

    const daysInNextMonth = new Date(
      Date.UTC(renewalYear, renewalMonth, 0),
    ).getUTCDate();

    effectiveRenewalDay = Math.min(
      renewalDay,
      daysInNextMonth,
    );

    renewalDate = new Date(
      Date.UTC(
        renewalYear,
        renewalMonth - 1,
        effectiveRenewalDay,
      ),
    );
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  const daysRemaining = Math.max(
    1,
    Math.ceil((renewalDate - today) / millisecondsPerDay),
  );

  const recommendedToday = Math.max(
    0,
    Math.ceil(songsAvailable / daysRemaining),
  );

  return {
    daysRemaining,
    recommendedToday,
    effectiveRenewalDay,
  };
}

export function createTelegramBotService({ api, repository, preparationService, styleCatalog, prepareWithStyle, weatherService, allowedUserId, dailyLimit = 8, creditCost = 10, clock = () => new Date() }) {
  if (!api || !repository || !preparationService) throw new TypeError('Bot dependencies are required');
  const authorized = String(allowedUserId);
  async function send(chatId, message, options) { for (const chunk of splitTelegramText(message)) await api.sendMessage(chatId, chunk, options); }
  const guided = createGuidedMusicFlow({ api, repository, styleCatalog, prepareWithStyle, weatherService, send });
  async function sendPreformatted(chatId, value) {
    for (const chunk of splitPreformattedText(value)) await api.sendMessage(chatId, "<pre>" + escapeHtml(chunk) + "</pre>", { parse_mode: "HTML" });
  }
  async function deliver(chatId, request) {
    await api.sendMessage(chatId, "Pedido confirmado\nTítulo: " + request.title + "\nO Suno pode criar o título automaticamente.");
    if (graphemeLength(request.style_prompt) <= 256) {
      await api.sendMessage(chatId, "Ritmo/prompt de estilo\n" + request.style_prompt, { reply_markup: { inline_keyboard: [[{ text: "📋 Copiar estilo", copy_text: { text: request.style_prompt } }]] } });
    } else {
      await api.sendMessage(chatId, "Ritmo/prompt de estilo (copie pelo ícone do bloco):");
      await sendPreformatted(chatId, request.style_prompt);
    }
    await api.sendMessage(chatId, "Toque no ícone de copiar do bloco para copiar a letra completa.");
    await sendPreformatted(chatId, request.lyrics);
    await api.sendMessage(chatId, SUNO_CREATE_URL, { disable_web_page_preview: false, reply_markup: { inline_keyboard: [[{ text: "🎵 Abrir Suno", url: SUNO_CREATE_URL }]] } });
  }
  async function confirm(requestId, ids) {
    let result;
    try { result = await repository.confirm(requestId, ids.userId, ids.chatId, dailyLimit, creditCost); }
    catch (error) {
      if (error?.cause?.message?.includes('Limite diario') || error?.message?.includes('Limite diario')) return send(ids.chatId, `Limite diário de ${dailyLimit} músicas atingido.`);
      throw error;
    }
    if (['expired', 'cancelled'].includes(result.request_status)) return send(ids.chatId, 'Este pedido não está mais disponível. Prepare uma nova música.');
    const request = await repository.getRequest(requestId, ids.userId, ids.chatId);
    if (!request) return send(ids.chatId, 'Pedido não encontrado para este chat.');
    await deliver(ids.chatId, request);
  }
  async function attach(requestId, link, ids) {
    const result = await repository.attach(requestId, ids.userId, ids.chatId, link, dailyLimit, creditCost);
    if (result.request_status !== 'linked') return send(ids.chatId, 'Não foi possível vincular: o pedido expirou ou foi cancelado.');
    await send(ids.chatId, 'Música vinculada com sucesso.');
  }
  async function handleLink(update, link, ids) {
    if (await repository.findByLink(link, ids.userId, ids.chatId)) return send(ids.chatId, 'Este link já estava vinculado à sua música.');
    const candidates = await repository.findUnlinked(ids.userId, ids.chatId);
    if (candidates.length === 0) return send(ids.chatId, 'Não há pedido confirmado aguardando link neste chat.');
    if (candidates.length === 1) return attach(candidates[0].id, link, ids);
    await repository.createLinkSubmission(update.update_id, ids.userId, ids.chatId, link);
    const keyboard = candidates.map((item) => [{ text: item.title || `Música para ${item.passenger_name}`, callback_data: `link:${item.id}` }]);
    await send(ids.chatId, 'Há mais de um pedido aguardando. Escolha a música correta:', { reply_markup: { inline_keyboard: keyboard } });
  }
  async function callback(update, ids) {
    const guidedHandled = await guided.callback(update, ids);
    if (guidedHandled) return;
    const query = update.callback_query; const [action, id, extra] = String(query.data || '').split(':');
    if (extra || !/^[0-9a-f-]{36}$/iu.test(id || '')) return api.answerCallbackQuery(query.id, { text: 'Ação inválida.' });
    await api.answerCallbackQuery(query.id);
    if (action === 'confirm') return confirm(id, ids);
    if (action === 'link') {
      const submission = await repository.latestLinkSubmission(ids.userId, ids.chatId);
      if (!submission) return send(ids.chatId, 'A seleção de link expirou. Cole o link novamente.');
      await attach(id, submission.suno_share_link, ids);
      await repository.completeLinkSubmission(submission.id, id, ids.userId, ids.chatId);
      return;
    }
  }
  async function showStatus(ids) {
    const usage = await repository.status(ids.userId, localDate(clock)); const count = usage.confirmed_creations_count ?? 0;
    return send(ids.chatId, `Uso de hoje: ${count}/${dailyLimit} criações. Saldo diário estimado: ${dailyLimit - count}. Créditos estimados consumidos: ${usage.estimated_credits_consumed ?? count * creditCost}.`, { reply_markup: MENU });
  }
  async function showCredits(ids) {
    const credit = await repository.getCreditStatus(ids.userId, ids.chatId);
    if (!credit) {
      return send(
        ids.chatId,
        '💳 Controle de créditos ainda não configurado.\n\n' +
          'Envie o saldo atual mostrado no Suno assim:\n\n' +
          '/creditos 2500',
        { reply_markup: MENU },
      );
    }
    const cycle = creditCycleStatus(
      clock,
      credit.renewal_day,
      credit.estimated_songs_available,
    );

    return send(
      ids.chatId,
      `💳 Créditos Suno\n\n` +
        `Saldo atual: ${credit.available_credits}\n` +
        `Reserva de segurança: ${credit.reserve_credits}\n` +
        `Créditos utilizáveis: ${credit.usable_credits}\n` +
        `Custo estimado por música: ${credit.estimated_credit_cost}\n` +
        `Músicas disponíveis: ${credit.estimated_songs_available}\n` +
        `Renovação: dia ${String(cycle.effectiveRenewalDay).padStart(2, '0')}\n` +
        `Dias restantes: ${cycle.daysRemaining}\n` +
        `Sugestão para hoje: ${cycle.recommendedToday} músicas\n\n` +
        `Para atualizar, envie:\n/creditos NOVO_SALDO`,
      { reply_markup: MENU },
    );
  }
  async function cancelInteraction(ids) {
    const guidedCancelled = await guided.cancel(ids);
    const cancelled = guidedCancelled || await repository.cancelPending(ids.userId, ids.chatId);
    return send(ids.chatId, cancelled ? 'Interação pendente cancelada.' : 'Não há interação pendente para cancelar.', { reply_markup: MENU });
  }
  async function requestLocation(chatId, firstUse = false) {
    const prefix = firstUse ? 'Para incluir o clima nas músicas, compartilhe sua localização uma única vez. ' : '';
    return send(chatId, prefix + 'Toque em “📍 Ativar clima automático”.', { reply_markup: LOCATION_KEYBOARD });
  }
  async function awaitingPassengerName(ids, updateId) {
    if (typeof repository.listRecentUpdates !== 'function') return false;
    const rows = await repository.listRecentUpdates();
    const previous = rows.find((row) => String(row.update_id) !== String(updateId) && String(row.payload?.message?.from?.id) === String(ids.userId) && String(row.payload?.message?.chat?.id) === String(ids.chatId));
    return previous?.payload?.message?.text?.trim() === MENU_LABELS.newMusic;
  }
  async function message(update, ids) {
    const location = update.message?.location;
    if (location) {
      if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude) || Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180 || typeof repository.saveLocation !== 'function') return send(ids.chatId, 'Não foi possível salvar a localização.', { reply_markup: MENU });
      const latitude = Math.round(location.latitude * 1000) / 1000; const longitude = Math.round(location.longitude * 1000) / 1000;
      await repository.saveLocation(ids.userId, ids.chatId, latitude, longitude);
      return send(ids.chatId, 'Localização salva. Não será necessário compartilhar novamente.', { reply_markup: MENU });
    }
    const text = update.message?.text?.trim(); if (!text) return;
    const command = text.match(/^\/(\w+)(?:@[A-Za-z0-9_]+)?/u)?.[1]?.toLowerCase();
    if (command === 'start' || command === 'ajuda') {
      await send(ids.chatId, HELP, { reply_markup: MENU });
      const saved = typeof repository.getLocation === 'function' ? await repository.getLocation(ids.userId, ids.chatId) : null;
      if (!saved) await requestLocation(ids.chatId, true);
      return;
    }
    if (command === 'status' || text === MENU_LABELS.status) return showStatus(ids);
    if (command === 'creditos') {
      const match = text.match(
        /^\/creditos(?:@[A-Za-z0-9_]+)?(?:\s+(\d+))?\s*$/u,
      );

      if (!match?.[1]) {
        return showCredits(ids);
      }

      const availableCredits = Number(match[1]);

      if (
        !Number.isSafeInteger(availableCredits) ||
        availableCredits < 0 ||
        availableCredits > 100000
      ) {
        return send(
          ids.chatId,
          'Saldo inválido. Envie somente um número inteiro.\n\n' +
            'Exemplo:\n/creditos 1840',
          { reply_markup: MENU },
        );
      }

      const current = await repository.getCreditStatus(
        ids.userId,
        ids.chatId,
      );

      await repository.updateCreditBalance(
        ids.userId,
        ids.chatId,
        availableCredits,
        current
          ? {
              planCredits: current.plan_credits,
              estimatedCreditCost: current.estimated_credit_cost,
              reserveCredits: current.reserve_credits,
              renewalDay: current.renewal_day,
            }
          : {
              planCredits: 2500,
              estimatedCreditCost: creditCost,
              reserveCredits: 100,
              renewalDay: 1,
            },
      );

      return showCredits(ids);
    }

    if (text === MENU_LABELS.credits) {
      return showCredits(ids);
    }
    if (command === 'cancelar' || text === MENU_LABELS.cancel) return cancelInteraction(ids);
    if (text === MENU_LABELS.location) return requestLocation(ids.chatId, false);
    if (text === MENU_LABELS.newMusic) {
      await guided.cancel(ids); await repository.cancelPending(ids.userId, ids.chatId);
      return send(ids.chatId, 'Qual é o nome do passageiro?', { reply_markup: MENU });
    }
    if (command === 'musica') {
      let parsed; try { parsed = parseMusicCommand(text); } catch { parsed = null; }
      if (!parsed) return send(ids.chatId, 'Formato inválido. Use: /musica Nome', { reply_markup: MENU });
      if (parsed.gender && typeof repository.getLocation !== 'function' && typeof weatherService?.current !== 'function') {
        const prepared = await preparationService.prepare({ update_id: update.update_id, user_id: ids.userId, chat_id: ids.chatId, name: parsed.passengerName, gender: parsed.gender, selection_mode: 'automatic' }); const req = prepared.request;
        return send(ids.chatId, `Pedido preparado\nTítulo: ${req.title}\nEstilo: ${req.style_name}\nPeríodo: ${req.local_period}\nDia: ${req.local_weekday}`, { reply_markup: { inline_keyboard: [[{ text: 'Confirmar e criar', callback_data: `confirm:${req.id}` }]] } });
      }
      await guided.start(update, ids, { ...parsed, gender: null }); return;
    }
    if (await awaitingPassengerName(ids, update.update_id)) {
      let passengerName; try { passengerName = normalizePassengerName(text); } catch { return send(ids.chatId, 'Nome inválido. Informe somente o nome do passageiro.', { reply_markup: MENU }); }
      await guided.start(update, ids, { passengerName, gender: null }); return;
    }
    const link = parseSunoLink(text); if (link) return handleLink(update, link, ids);
    if (/^https?:\/\//iu.test(text)) return send(ids.chatId, 'Link inválido. Envie um link HTTPS do domínio suno.com.', { reply_markup: MENU });
    return send(ids.chatId, HELP, { reply_markup: MENU });
  }
  return Object.freeze({ async processUpdate(update) {
    const persisted = await repository.getUpdateState(update.update_id);
    if (persisted?.processing_status === 'failed' && persisted.last_error === 'Erro permanente de domínio') return false;
    const claim = await repository.claimUpdate(update.update_id, update);
    if (!claim.claimed) {
      const state = await repository.getUpdateState(update.update_id);
      const terminal = state?.processing_status === 'processed' ||
        (state?.processing_status === 'failed' && state.last_error === 'Erro permanente de domínio');
      if (!terminal) throw new TelegramUpdateLeaseError();
      return false;
    }
    try {
      const ids = identity(update);
      if (ids.chatType === 'private' && String(ids.userId) === authorized) {
        if (update.callback_query) await callback(update, ids); else await message(update, ids);
      }
      const completed = await repository.completeUpdate(update.update_id, claim.processing_token, true, null);
      if (completed === false) throw new TelegramUpdateLeaseError();
      return true;
    } catch (error) {
      if (!isPermanentUpdateError(error)) throw error;
      const ids = identity(update);
      if (ids.chatType === 'private' && String(ids.userId) === authorized) {
        const limitReached = [error?.message, error?.cause?.message].some((value) => value?.includes('Limite diario'));
        await send(ids.chatId, limitReached ? `Limite diário de ${dailyLimit} músicas atingido.` : 'Não foi possível concluir este pedido. Verifique o comando ou o catálogo e tente novamente.');
      }
      const completed = await repository.completeUpdate(update.update_id, claim.processing_token, false, 'Erro permanente de domínio');
      if (completed === false) throw new TelegramUpdateLeaseError();
      return true;
    }
  } });
}
