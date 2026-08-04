import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';

test('confirmação usa copy_text <= 256 preservando Unicode, linhas e conteúdo integral', async () => {
  const title = 'Para Carlos 🚙'; const style = `${'ritmo '.repeat(60)}🎵`;
  const lyrics = `[Verse 1]\n${'coração na estrada '.repeat(30)}🚗\n\n[Chorus]\n${'alegria '.repeat(70)}✨`;
  const sent = [];
  const api = { async sendMessage(_chat, text, options) { sent.push({ text, options }); }, async answerCallbackQuery() {} };
  const repository = {
    async getUpdateState() { return null; }, async claimUpdate() { return { claimed: true, processing_token: 'token' }; }, async completeUpdate() { return true; },
    async confirm() { return { request_status: 'creation_confirmed' }; }, async getRequest() { return { title, style_prompt: style, lyrics }; },
  };
  const bot = createTelegramBotService({ api, repository, preparationService: { async prepare() {} }, allowedUserId: 10 });
  await bot.processUpdate({ update_id: 1, callback_query: { id: 'cb', data: 'confirm:00000000-0000-4000-8000-000000000001', from: { id: 10 }, message: { chat: { id: 10, type: 'private' } } } });
  const copied = sent.flatMap((entry) => entry.options?.reply_markup?.inline_keyboard?.flat().map((button) => button.copy_text?.text).filter(Boolean) ?? []);
  assert.ok(copied.every((chunk) => Array.from(chunk).length <= 256));
  assert.equal(copied[0], title);
  const styleChunks = sent.filter((entry) => entry.text.startsWith('Ritmo/prompt')).map((entry) => entry.options.reply_markup.inline_keyboard[0][0].copy_text.text);
  const lyricChunks = sent.filter((entry) => entry.text.startsWith('Letra')).map((entry) => entry.options.reply_markup.inline_keyboard[0][0].copy_text.text);
  assert.equal(styleChunks.join(''), style); assert.equal(lyricChunks.join(''), lyrics);
  assert.ok(sent.some((entry) => entry.options?.reply_markup?.inline_keyboard?.[0]?.[0]?.url === 'https://suno.com/create'));
});
