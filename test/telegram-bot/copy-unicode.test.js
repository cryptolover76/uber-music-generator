import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, splitPreformattedText } from '../../backend/telegram-bot/parsers.js';

test("blocos preformatados preservam Unicode e conteúdo sem perda", () => {
  const family = "👨‍👩‍👧‍👦"; const accented = "a\u0301";
  const value = family.repeat(1900) + "\n\n" + accented.repeat(1900);
  const chunks = splitPreformattedText(value);
  assert.equal(chunks.join(""), value);
  assert.equal(chunks.length, Math.ceil(escapeHtml(value).length / 3800));
  assert.ok(chunks.every((chunk) => escapeHtml(chunk).length <= 3800));
  assert.ok(chunks.every((chunk) => !chunk.startsWith("\u200d") && !chunk.endsWith("\u200d") && !chunk.startsWith("\u0301")));
});

test("texto de até aproximadamente 3800 caracteres fica em um bloco", () => {
  const value = "<Verse>\n" + "ação & emoção 🚙\n".repeat(180);
  const chunks = splitPreformattedText(value);
  assert.equal(chunks.length, 1);
  assert.equal(chunks.join(""), value);
});
