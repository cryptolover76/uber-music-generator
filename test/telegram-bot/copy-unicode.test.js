import assert from 'node:assert/strict';
import test from 'node:test';
import { splitCopyText } from '../../backend/telegram-bot/parsers.js';

test('splitCopyText preserva emoji composto, acentos e quebras sem perda', () => {
  const family = '👨‍👩‍👧‍👦'; const accented = 'a\u0301';
  const value = `${family.repeat(140)}\n\n${accented.repeat(140)}`;
  const chunks = splitCopyText(value);
  assert.equal(chunks.join(''), value);
  assert.ok(chunks.every((chunk) => !chunk.startsWith('\u200d') && !chunk.endsWith('\u200d') && !chunk.startsWith('\u0301')));
  assert.ok(chunks.every((chunk) => [...new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(chunk)].length <= 256));
});
