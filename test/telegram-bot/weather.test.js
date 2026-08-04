import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherService, weatherCategoryForCode } from '../../backend/telegram-bot/weather.js';

test('mapeia códigos WMO para as três categorias suportadas', () => {
  for (const code of [0, 1]) assert.equal(weatherCategoryForCode(code), 'Ensolarado');
  for (const code of [2, 3, 45, 48]) assert.equal(weatherCategoryForCode(code), 'Nublado');
  for (const code of [51, 61, 80, 99]) assert.equal(weatherCategoryForCode(code), 'Chuvoso');
  assert.equal(weatherCategoryForCode(50), null); assert.equal(weatherCategoryForCode(100), null);
});

test('consulta Open-Meteo uma vez com campos obrigatórios e retorna resumo sem coordenadas', async () => {
  const calls = [];
  const service = createWeatherService({ fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, async json() { return { current: { temperature_2m: 25, apparent_temperature: 26, precipitation: 0, weather_code: 1, is_day: 1 } }; } }; } });
  const result = await service.current({ latitude: -27.594, longitude: -48.548 });
  assert.equal(calls.length, 1); assert.equal(result.category, 'Ensolarado');
  assert.ok(!result.summary.includes('-27.594') && !result.summary.includes('-48.548'));
  const url = new URL(calls[0].url); assert.equal(url.pathname, '/v1/forecast'); assert.equal(url.searchParams.get('timezone'), 'America/Sao_Paulo');
  assert.equal(url.searchParams.get('current'), 'temperature_2m,apparent_temperature,precipitation,weather_code,is_day');
});

test('erro, resposta inválida e código desconhecido retornam fallback sem retry', async () => {
  let calls = 0; const failing = createWeatherService({ fetchImpl: async () => { calls += 1; throw new Error('network'); }, timeoutMs: 10 });
  assert.equal(await failing.current({ latitude: 1, longitude: 2 }), null); assert.equal(calls, 1);
  const invalid = createWeatherService({ fetchImpl: async () => ({ ok: true, async json() { return { current: { weather_code: 50 } }; } }) });
  assert.equal(await invalid.current({ latitude: 1, longitude: 2 }), null);
});
