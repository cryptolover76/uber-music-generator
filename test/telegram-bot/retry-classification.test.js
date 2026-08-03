import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogSelectionError } from '../../backend/music-preparation/catalog-selector.js';
import { createLongPoller } from '../../backend/telegram-bot/polling.js';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';

const update = { update_id: 21, message: { text: '/musica Ana | F', from: { id: 10 }, chat: { id: 10, type: 'private' } } };
function serviceWith(error) {
  const sent = []; const completed = [];
  const repository = {
    async claimUpdate() { return { claimed: true, processing_token: 'lease' }; },
    async getUpdateState() { return null; },
    async completeUpdate(...args) { completed.push(args); },
  };
  const api = { async sendMessage(_chat, text) { sent.push(text); } };
  const preparationService = { async prepare() { throw error; } };
  return { bot: createTelegramBotService({ api, repository, preparationService, allowedUserId: 10 }), sent, completed };
}

test('erro permanente avisa, conclui update como failed e não lança para o polling', async () => {
  const setup = serviceWith(new CatalogSelectionError('template'));
  assert.equal(await setup.bot.processUpdate(update), true);
  assert.equal(setup.sent.length, 1);
  assert.match(setup.sent[0], /catálogo/u);
  assert.deepEqual(setup.completed, [[21, 'lease', false, 'Erro permanente de domínio']]);
});

test('erro temporário não conclui update e continua disponível para retry', async () => {
  const error = Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' });
  const setup = serviceWith(error);
  await assert.rejects(setup.bot.processUpdate(update), error);
  assert.deepEqual(setup.completed, []);
  assert.deepEqual(setup.sent, []);
});

test('polling repete temporário no mesmo offset e avança após sucesso', async () => {
  const offsets = []; let attempts = 0; let poller;
  const api = { async getUpdates({ offset, signal }) {
    offsets.push(offset);
    if (offset === 0) return [update];
    queueMicrotask(() => { void poller.stop(); });
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    const error = new Error('aborted'); error.name = 'AbortError'; throw error;
  } };
  poller = createLongPoller({ api, async processUpdate() { attempts += 1; if (attempts === 1) throw new Error('temporary'); }, logger: { error() {} }, baseBackoffMs: 0, maxBackoffMs: 0 });
  await poller.start();
  assert.equal(attempts, 2);
  assert.deepEqual(offsets.slice(0, 3), [0, 0, 22]);
});
