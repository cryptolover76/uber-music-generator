import assert from 'node:assert/strict';
import test from 'node:test';
import { createLongPoller } from '../../backend/telegram-bot/polling.js';

async function diagnosticCase({ getUpdates, processUpdate = async () => {} }) {
  const entries = [];
  let poller;
  const logger = { error(...args) { entries.push(args); queueMicrotask(() => { void poller.stop(); }); } };
  poller = createLongPoller({ api: { getUpdates }, processUpdate, logger, baseBackoffMs: 0, maxBackoffMs: 0 });
  await poller.start();
  return entries[0];
}

test('diagnóstico diferencia falha ao buscar updates e registra cadeia limitada', async () => {
  const nested = Object.assign(new Error('socket indisponível'), { code: 'ECONNRESET' });
  const cause = Object.assign(new Error('serviço caiu'), { code: 'HTTP_503', cause: nested });
  const error = Object.assign(new Error('request em https://api.telegram.org/bot123:SECRET/getUpdates token=abc'), { code: 'FETCH_FAILED', cause });
  const [message, details] = await diagnosticCase({ getUpdates: async () => { throw error; } });
  assert.equal(message, '[Telegram polling] falha ao buscar updates; nova tentativa');
  assert.deepEqual(details, { name: 'Error', code: 'FETCH_FAILED', message: 'request em https://api.telegram.org/bot[REDACTED]/getUpdates token=[REDACTED]', causeCode: 'HTTP_503', causeMessage: 'serviço caiu', nestedCauseCode: 'ECONNRESET', nestedCauseMessage: 'socket indisponível' });
  assert.doesNotMatch(JSON.stringify(details), /123:SECRET|token=abc/u);
});

test('diagnóstico diferencia falha ao processar sem registrar update ou extras', async () => {
  const update = { update_id: 9, message: { text: '/musica Nome Secreto | F' } };
  const error = Object.assign(new Error('persistência indisponível'), { code: 'DB_FAILED', payload: update, headers: { authorization: 'secret' } });
  const [message, details] = await diagnosticCase({ getUpdates: async () => [update], processUpdate: async () => { throw error; } });
  assert.equal(message, '[Telegram polling] falha ao processar update; nova tentativa');
  assert.deepEqual(details, { name: 'Error', code: 'DB_FAILED', message: 'persistência indisponível' });
  assert.doesNotMatch(JSON.stringify(details), /Nome Secreto|authorization|message.*text/u);
});
