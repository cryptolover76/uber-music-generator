import assert from 'node:assert/strict'; import test from 'node:test';
import { startTelegramPolling, telegramPollingEnabled } from '../../backend/telegram-bot/runtime.js';
test('polling disabled não valida ambiente', () => { assert.equal(telegramPollingEnabled({}), false); assert.equal(startTelegramPolling({ env: {} }), null); });
