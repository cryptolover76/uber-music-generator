import assert from 'node:assert/strict';
import test from 'node:test';
import { getLocalContext, periodForHour } from '../../backend/music-preparation/local-context.js';

test('classifica todos os limites dos períodos', () => {
  const expected = new Map([
    [0, 'Noite'], [4, 'Noite'], [5, 'Manhã'], [11, 'Manhã'],
    [12, 'Tarde'], [16, 'Tarde'], [17, 'Fim de tarde'], [18, 'Fim de tarde'],
    [19, 'Noite'], [23, 'Noite'],
  ]);
  for (const [hour, period] of expected) assert.equal(periodForHour(hour), period);
});

test('converte UTC para São Paulo atravessando a meia-noite', () => {
  const context = getLocalContext('2026-08-03T02:30:00.000Z');
  assert.equal(context.localDatetime, '2026-08-02T23:30:00');
  assert.equal(context.localWeekday, 'Domingo');
  assert.equal(context.localPeriod, 'Noite');
});

test('identifica todos os dias da semana', () => {
  const expected = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  for (let day = 3; day <= 9; day += 1) {
    assert.equal(getLocalContext(`2026-08-${String(day).padStart(2, '0')}T15:00:00Z`).localWeekday, expected[day - 3]);
  }
});
