import assert from 'node:assert/strict';
import test from 'node:test';
import { escapeHtml, parseMusicCommand, parseSunoLink, splitTelegramText } from '../../backend/telegram-bot/parsers.js';
test('parser aceita /musica e normaliza', () => { assert.deepEqual(parseMusicCommand('/musica  João Pedro  | m'), { passengerName: 'João Pedro', gender: 'M' }); assert.deepEqual(parseMusicCommand('/musica Alex | N'), { passengerName: 'Alex', gender: 'N' }); assert.equal(parseMusicCommand('/musica Maria F'), null); });
test('valida estritamente link HTTPS Suno', () => { assert.equal(parseSunoLink('https://SUNO.com/song/abc'), 'https://suno.com/song/abc'); for (const value of ['http://suno.com/a', 'https://fakesuno.com/a', 'https://suno.com.evil/a', 'https://suno.com/a?x=1']) assert.equal(parseSunoLink(value), null, value); });
test('divide texto e respeita limite', () => { const chunks = splitTelegramText('a'.repeat(45), 20); assert.ok(chunks.every((chunk) => chunk.length <= 20)); assert.equal(chunks.join(''), 'a'.repeat(45)); });
test('escape HTML neutraliza metacaracteres', () => assert.equal(escapeHtml('<b x="1">&'), '&lt;b x=&quot;1&quot;&gt;&amp;'));
