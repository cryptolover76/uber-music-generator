export class TelegramApiError extends Error {
  constructor(message, { temporary = false } = {}) { super(message); this.name = 'TelegramApiError'; this.temporary = temporary; }
}

export function createTelegramApi({ token, fetchImpl = globalThis.fetch }) {
  if (typeof token !== 'string' || !token.trim()) throw new TypeError('Telegram bot token is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  const baseUrl = `https://api.telegram.org/bot${token}`;
  async function call(method, body, signal) {
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      throw new TelegramApiError('Falha temporária na API do Telegram', { temporary: true });
    }
    let payload;
    try { payload = await response.json(); } catch { throw new TelegramApiError('Resposta inválida da API do Telegram', { temporary: response.status >= 500 }); }
    if (!response.ok || !payload?.ok) {
      throw new TelegramApiError(payload?.description || 'Erro da API do Telegram', { temporary: response.status === 429 || response.status >= 500 });
    }
    return payload.result;
  }
  return Object.freeze({
    getUpdates: ({ offset, timeout = 30, signal } = {}) => call('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }, signal),
    sendMessage: (chatId, text, options = {}) => call('sendMessage', { chat_id: chatId, text, ...options }),
    answerCallbackQuery: (id, options = {}) => call('answerCallbackQuery', { callback_query_id: id, ...options }),
  });
}
