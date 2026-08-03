import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MusicPreparationValidationError,
  normalizePassengerName,
  normalizeTelegramId,
  validateMusicPreparationInput,
} from '../../backend/music-preparation/validation.js';

const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';
const valid = { update_id: '9223372036854775807', user_id: '1', chat_id: '-2', name: ' Ana ', gender: 'f', selection_mode: 'manual', template_id: UUID_A, style_id: UUID_B };

test('normaliza nome em NFC, espaços e gênero minúsculo', () => {
  const result = validateMusicPreparationInput({ ...valid, name: '  Jose\u0301   D’Ávila-Silva  ' });
  assert.equal(result.passenger_name, 'José D’Ávila-Silva');
  assert.equal(result.passenger_gender, 'F');
});

test('rejeita nomes vazios, controles, linhas e mais de 120 pontos de código', () => {
  for (const name of ['   ', 'Ana\u0000', 'Ana\nMaria', '😀'.repeat(121)]) {
    assert.throws(() => normalizePassengerName(name), MusicPreparationValidationError);
  }
});

test('valida bigint sem conversão insegura e os sinais de IDs Telegram', () => {
  assert.equal(normalizeTelegramId('9223372036854775807', 'update_id'), '9223372036854775807');
  assert.equal(normalizeTelegramId('-9223372036854775808', 'chat_id', { allowNegative: true }), '-9223372036854775808');
  for (const value of ['9223372036854775808', '0', 9007199254740992]) {
    assert.throws(() => normalizeTelegramId(value, 'update_id'), MusicPreparationValidationError);
  }
  assert.throws(() => normalizeTelegramId('0', 'chat_id', { allowNegative: true }), MusicPreparationValidationError);
});

test('valida UUIDs e regras dos modos manual e automático', () => {
  assert.throws(() => validateMusicPreparationInput({ ...valid, template_id: 'not-uuid' }), /template_id/);
  assert.throws(() => validateMusicPreparationInput({ ...valid, style_id: undefined }), /style_id/);
  assert.throws(() => validateMusicPreparationInput({ ...valid, selection_mode: 'automatic' }), (error) => error.code === 'AUTOMATIC_MODE_REJECTS_MANUAL_IDS');
  const automatic = validateMusicPreparationInput({ update_id: '1', user_id: '2', chat_id: '-3', name: 'João', gender: 'm', selection_mode: 'automatic' });
  assert.equal(automatic.template_id, null);
});
