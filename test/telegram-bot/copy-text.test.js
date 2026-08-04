import assert from 'node:assert/strict';
import test from 'node:test';
import { createTelegramBotService } from '../../backend/telegram-bot/service.js';

test("resultado final usa um copy_text apenas para estilo curto e bloco único para letra normal", async () => {
  const title = "Para Carlos 🚙"; const style = "samba leve e alegre";
  const lyrics = "<Verse 1>\nCoração & estrada 🚗\n\n[Chorus]\n" + "alegria ".repeat(250) + "✨";
  const sent = [];
  const api = { async sendMessage(_chat, text, options) { sent.push({ text, options }); }, async answerCallbackQuery() {} };
  const repository = {
    async getUpdateState() { return null; }, async claimUpdate() { return { claimed: true, processing_token: "token" }; }, async completeUpdate() { return true; },
    async confirm() { return { request_status: "creation_confirmed" }; }, async getRequest() { return { title, style_prompt: style, lyrics }; },
  };
  const bot = createTelegramBotService({ api, repository, preparationService: { async prepare() {} }, allowedUserId: 10 });
  await bot.processUpdate({ update_id: 1, callback_query: { id: "cb", data: "confirm:00000000-0000-4000-8000-000000000001", from: { id: 10 }, message: { chat: { id: 10, type: "private" } } } });
  const buttons = sent.flatMap((entry) => entry.options?.reply_markup?.inline_keyboard?.flat() ?? []);
  const copied = buttons.filter((button) => button.copy_text);
  assert.match(sent[0].text, /Título: Para Carlos 🚙[\s\S]*Suno pode criar o título automaticamente/u);
  assert.equal(copied.length, 1); assert.equal(copied[0].text, "📋 Copiar estilo"); assert.equal(copied[0].copy_text.text, style);
  assert.ok(!buttons.some((button) => /Copiar título|Copiar letra/u.test(button.text)));
  const blocks = sent.filter((entry) => entry.options?.parse_mode === "HTML");
  assert.equal(blocks.length, 1); assert.equal(blocks[0].text, "<pre>" + lyrics.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;") + "</pre>");
  assert.equal(buttons.filter((button) => button.url === "https://suno.com/create").length, 1);
});

test("estilo longo usa bloco preformatado e nenhum copy_text", async () => {
  const style = "ritmo <seguro> & Unicode 🎵 " + "detalhado ".repeat(35); const sent = [];
  const api = { async sendMessage(_chat, text, options) { sent.push({ text, options }); }, async answerCallbackQuery() {} };
  const repository = { async getUpdateState() { return null; }, async claimUpdate() { return { claimed: true, processing_token: "t" }; }, async completeUpdate() { return true; }, async confirm() { return { request_status: "creation_confirmed" }; }, async getRequest() { return { title: "T", style_prompt: style, lyrics: "L" }; } };
  const bot = createTelegramBotService({ api, repository, preparationService: { async prepare() {} }, allowedUserId: 10 });
  await bot.processUpdate({ update_id: 2, callback_query: { id: "cb", data: "confirm:00000000-0000-4000-8000-000000000001", from: { id: 10 }, message: { chat: { id: 10, type: "private" } } } });
  const copy = sent.flatMap((entry) => entry.options?.reply_markup?.inline_keyboard?.flat() ?? []).filter((button) => button.copy_text);
  assert.equal(copy.length, 0); assert.ok(sent.some((entry) => entry.options?.parse_mode === "HTML" && entry.text.includes("ritmo &lt;seguro&gt; &amp; Unicode")));
});
