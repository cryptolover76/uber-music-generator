import assert from 'node:assert/strict'; import test from 'node:test';
import { createLongPoller } from '../../backend/telegram-bot/polling.js';
test('polling é sequencial, avança offset e para limpo', async () => {
  const offsets = []; const processed = []; let poller;
  const api = { async getUpdates({ offset, signal }) { offsets.push(offset); if (offset === 0) return [{ update_id: 4 }, { update_id: 5 }]; await new Promise((resolve) => { signal.addEventListener('abort', resolve, { once: true }); }); const error = new Error('aborted'); error.name = 'AbortError'; throw error; } };
  poller = createLongPoller({ api, async processUpdate(update) { processed.push(update.update_id); if (update.update_id === 5) queueMicrotask(() => { void poller.stop(); }); }, logger: { error() {} } });
  await poller.start(); assert.deepEqual(processed, [4, 5]); assert.equal(offsets[0], 0); assert.equal(poller.running, false);
});
