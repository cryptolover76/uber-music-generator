import assert from 'node:assert/strict';
import test from 'node:test';
import { createMusicPreparationService, MusicRequestConflictError } from '../../backend/music-preparation/prepare-music-request.js';
import { createBarrier, createFakeCatalogRepository, createFakeMusicRequestRepository } from '../helpers/fake-music-preparation-repositories.js';
import { DuplicateTelegramUpdateError, MusicRequestPersistenceError } from '../../backend/music-preparation/validation.js';

const ids = Object.freeze({
  template: '00000000-0000-4000-8000-000000000001', style: '00000000-0000-4000-8000-000000000002',
  period: '00000000-0000-4000-8000-000000000003', weekday: '00000000-0000-4000-8000-000000000004',
  weekend: '00000000-0000-4000-8000-000000000005', climate: '00000000-0000-4000-8000-000000000006',
  template2: '00000000-0000-4000-8000-000000000011',
  period2: '00000000-0000-4000-8000-000000000012',
  weekday2: '00000000-0000-4000-8000-000000000013',
  climate2: '00000000-0000-4000-8000-000000000014',
});

function catalogs({ exactWeekend = true } = {}) {
  return {
    templates: [{ id: ids.template, active: true, name: 'Base', letra: '[Chorus]\nOlá, {NOME}!' }],
    styles: [{ id: ids.style, active: true, name: 'Samba', prompt: 'samba alegre' }],
    periods: [{ id: ids.period, active: true, categoria: 'Noite', texto: 'Noite com {NOME}.' }],
    weekdays: [
      ...(exactWeekend ? [{ id: ids.weekday, active: true, categoria: 'Sábado', texto: 'Sábado de {NOME}.' }] : []),
      { id: ids.weekend, active: true, categoria: 'Fim de semana', texto: 'Fim de semana de {NOME}.' },
    ],
  };
}

function input(overrides = {}) {
  return { update_id: '9007199254740993', user_id: '10', chat_id: '-20', name: ' Ana ', gender: 'f', selection_mode: 'automatic', ...overrides };
}

function service(options = {}) {
  const catalogRepository = createFakeCatalogRepository(options.catalogs ?? catalogs());
  const musicRequestRepository = options.musicRequestRepository ?? createFakeMusicRequestRepository();
  return {
    catalogRepository,
    musicRequestRepository,
    instance: createMusicPreparationService({ catalogRepository, musicRequestRepository, clock: options.clock ?? { now: () => new Date('2026-08-09T01:00:00.000Z') } }),
  };
}

test('modo automático compõe período, clima ausente, dia e template com montarLetra real', async () => {
  const { instance } = service();
  const dto = await instance.prepare(input());
  const lyrics = '[Verse 1]\nNoite com Ana.\n\n[Verse 2]\nSábado de Ana.\n\n[Chorus]\nOlá, Ana!';
  assert.equal(dto.title, 'Para Ana');
  assert.equal(dto.style_prompt, 'samba alegre');
  assert.equal(dto.lyrics, lyrics);
  assert.equal(dto.prompt_final, `Tags: samba alegre\n\n---\n\n${lyrics}`);
});

test('clima selecionado compõe período, clima e dia e persiste metadados compatíveis', async () => {
  const withClimate = catalogs(); withClimate.climates = [{ id: ids.climate, active: true, name: 'Ensolarado', categoria: 'Ensolarado', texto: 'Clima ensolarado com {NOME}.' }];
  const dto = await service({ catalogs: withClimate }).instance.prepare(input({ climate_id: ids.climate, weather_summary: 'Ensolarado; temperatura 25 °C', weather_provider: 'open-meteo' }));
  assert.equal(dto.request.climate_id, ids.climate); assert.equal(dto.request.weather_status, 'applied'); assert.equal(dto.request.weather_provider, 'open-meteo');
  assert.equal(dto.lyrics, '[Verse 1]\nNoite com Ana.\n\n[Verse 2]\nClima ensolarado com Ana.\n\n[Verse 3]\nSábado de Ana.\n\n[Chorus]\nOlá, Ana!');
});

test('fim de semana usa categoria exata ou fallback', async () => {
  assert.equal((await service().instance.prepare(input())).request.weekday_id, ids.weekday);
  assert.equal((await service({ catalogs: catalogs({ exactWeekend: false }) }).instance.prepare(input())).request.weekday_id, ids.weekend);
});

test('modo manual usa IDs fornecidos', async () => {
  const { instance } = service();
  const dto = await instance.prepare(input({ selection_mode: 'manual', template_id: ids.template, style_id: ids.style }));
  assert.equal(dto.request.template_id, ids.template);
  assert.equal(dto.request.style_id, ids.style);
});

test('linha preparada tem campos e nulos compatíveis com a migration e validade de 12 horas', async () => {
  const { instance } = service();
  const row = (await instance.prepare(input())).request;
  assert.deepEqual(
    { climate_id: row.climate_id, weather_status: row.weather_status, weather_summary: row.weather_summary, weather_provider: row.weather_provider,
      estimated_credit_cost: row.estimated_credit_cost, quota_consumed_at: row.quota_consumed_at, creation_confirmed_at: row.creation_confirmed_at,
      suno_share_link: row.suno_share_link, linked_at: row.linked_at },
    { climate_id: null, weather_status: 'not_requested', weather_summary: null, weather_provider: null,
      estimated_credit_cost: null, quota_consumed_at: null, creation_confirmed_at: null, suno_share_link: null, linked_at: null }
  );
  assert.equal(row.timezone, 'America/Sao_Paulo');
  assert.equal(row.local_datetime, '2026-08-09T01:00:00.000Z');
  assert.equal(row.expires_at, '2026-08-09T13:00:00.000Z');
  assert.equal(row.status, 'prepared');
});

test('valida antes de acessar persistência', async () => {
  const { instance, catalogRepository, musicRequestRepository } = service();
  await assert.rejects(instance.prepare(input({ name: '\n' })));
  assert.equal(catalogRepository.calls.length, 0);
  assert.equal(musicRequestRepository.insertCount, 0);
});

test('retry equivalente retorna existente sem inserir e identidade divergente conflita sem sobrescrever', async () => {
  const setup = service();
  const first = await setup.instance.prepare(input());
  const retry = await setup.instance.prepare(input({ name: 'Ana' }));
  assert.deepEqual(retry, first);
  assert.equal(setup.musicRequestRepository.insertCount, 1);
  await assert.rejects(setup.instance.prepare(input({ user_id: '11' })), MusicRequestConflictError);
  assert.equal(setup.musicRequestRepository.insertCount, 1);
  assert.equal(setup.musicRequestRepository.rows.length, 1);
});

test('domingo usa categoria exata e faz fallback para Fim de semana', async () => {
  const sundayClock = { now: () => new Date('2026-08-10T01:00:00.000Z') };
  const exact = catalogs({ exactWeekend: false });
  exact.weekdays.unshift({ id: ids.weekday, active: true, categoria: 'Domingo', texto: 'Domingo de {NOME}.' });
  assert.equal((await service({ catalogs: exact, clock: sundayClock }).instance.prepare(input())).request.weekday_id, ids.weekday);
  assert.equal((await service({ catalogs: catalogs({ exactWeekend: false }), clock: sundayClock }).instance.prepare(input())).request.weekday_id, ids.weekend);
});

test('catálogo automático inválido falha antes da persistência', async (t) => {
  const cases = [
    ['UUID inválido', (value) => { value.templates[0].id = 'não-uuid'; }],
    ['style.name vazio', (value) => { value.styles[0].name = ' '; }],
    ['style.prompt vazio', (value) => { value.styles[0].prompt = ''; }],
    ['template vazio', (value) => { value.templates[0].letra = ' '; }],
    ['período vazio', (value) => { value.periods[0].texto = ' '; }],
    ['dia vazio', (value) => { value.weekdays[0].texto = ' '; }],
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const value = catalogs();
      mutate(value);
      const setup = service({ catalogs: value });
      await assert.rejects(setup.instance.prepare(input()), (error) => error.code === 'INVALID_CATALOG');
      assert.equal(setup.musicRequestRepository.insertCount, 0);
    });
  }
});

test('linha prepared contém integralmente os campos obrigatórios da migration', async () => {
  const row = (await service().instance.prepare(input())).request;
  const required = [
    'id', 'telegram_update_id', 'telegram_user_id', 'telegram_chat_id', 'passenger_name', 'passenger_gender',
    'selection_mode', 'template_id', 'style_id', 'timezone', 'local_datetime', 'local_weekday', 'local_period',
    'weather_status', 'title', 'style_name', 'style_prompt', 'lyrics', 'prompt_final', 'status', 'created_at',
    'expires_at', 'updated_at',
  ];
  for (const field of required) {
    assert.ok(Object.hasOwn(row, field), `campo ausente: ${field}`);
    assert.notEqual(row[field], null, `campo nulo: ${field}`);
    if (typeof row[field] === 'string') assert.notEqual(row[field].trim(), '', `campo vazio: ${field}`);
  }
});

test('duas preparações equivalentes concorrentes convergem para uma inserção', async () => {
  const barrier = createBarrier(2);
  const repository = createFakeMusicRequestRepository([], { insertBarrier: barrier });
  const setup = service({ musicRequestRepository: repository });
  const [first, second] = await Promise.all([setup.instance.prepare(input()), setup.instance.prepare(input())]);
  assert.equal(barrier.arrivals, 2);
  assert.equal(repository.insertAttempts, 2);
  assert.equal(repository.insertCount, 1);
  assert.equal(repository.rows.length, 1);
  assert.deepEqual(first, second);
  assert.equal(first.request.id, repository.rows[0].id);
});

test('preparações divergentes concorrentes preservam o vencedor e conflitam a perdedora', async () => {
  const barrier = createBarrier(2);
  const repository = createFakeMusicRequestRepository([], { insertBarrier: barrier });
  const setup = service({ musicRequestRepository: repository });
  const outcomes = await Promise.allSettled([
    setup.instance.prepare(input({ user_id: '10' })),
    setup.instance.prepare(input({ user_id: '11' })),
  ]);
  const fulfilled = outcomes.filter((outcome) => outcome.status === 'fulfilled');
  const rejected = outcomes.filter((outcome) => outcome.status === 'rejected');
  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(rejected[0].reason instanceof MusicRequestConflictError);
  assert.equal(repository.insertAttempts, 2);
  assert.equal(repository.insertCount, 1);
  assert.equal(repository.rows.length, 1);
  assert.equal(fulfilled[0].value.request.id, repository.rows[0].id);
  assert.equal(repository.rows[0].telegram_user_id, fulfilled[0].value.request.telegram_user_id);
});

test('erro genérico de insert é propagado sem ser convertido em duplicidade', async () => {
  const generic = new Error('database unavailable');
  const repository = createFakeMusicRequestRepository([], { insertError: generic });
  const setup = service({ musicRequestRepository: repository });
  await assert.rejects(setup.instance.prepare(input()), (error) => error === generic);
  assert.equal(repository.insertAttempts, 1);
  assert.equal(repository.insertCount, 0);
});

test('duplicidade sem vencedor na releitura gera erro explícito de persistência', async () => {
  const repository = {
    async findByTelegramUpdateId() { return null; },
    async insert(row) { throw new DuplicateTelegramUpdateError(row.telegram_update_id); },
  };
  const setup = service({ musicRequestRepository: repository });
  await assert.rejects(
    setup.instance.prepare(input()),
    (error) => error instanceof MusicRequestPersistenceError && error.code === 'DUPLICATE_REQUEST_NOT_FOUND'
  );
});

test('template segue exatamente a precedência letra || texto do montarLetra', async (t) => {
  await t.test('letra somente com espaços rejeita mesmo quando texto é válido', async () => {
    const value = catalogs();
    value.templates[0] = { ...value.templates[0], letra: '   ', texto: '[Chorus]\nTexto válido para {NOME}.' };
    const setup = service({ catalogs: value });
    await assert.rejects(setup.instance.prepare(input()), (error) => error.code === 'INVALID_CATALOG');
    assert.equal(setup.musicRequestRepository.insertCount, 0);
  });

  const accepted = [
    ['letra vazia usa texto', { letra: '', texto: '[Chorus]\nTexto escolhido para {NOME}.' }],
    ['sem letra usa texto', { texto: '[Chorus]\nTexto escolhido para {NOME}.' }],
  ];
  for (const [name, templateContent] of accepted) {
    await t.test(name, async () => {
      const value = catalogs();
      value.templates[0] = { ...value.templates[0], ...templateContent };
      if (!Object.hasOwn(templateContent, 'letra')) delete value.templates[0].letra;
      const dto = await service({ catalogs: value }).instance.prepare(input());
      assert.match(dto.lyrics, /Texto escolhido para Ana\./);
    });
  }

  await t.test('letra válida prevalece sobre texto alternativo', async () => {
    const value = catalogs();
    value.templates[0] = {
      ...value.templates[0],
      letra: '[Chorus]\nLetra escolhida para {NOME}.',
      texto: '[Chorus]\nTexto alternativo para {NOME}.',
    };
    const dto = await service({ catalogs: value }).instance.prepare(input());
    assert.match(dto.lyrics, /Letra escolhida para Ana\./);
    assert.doesNotMatch(dto.lyrics, /Texto alternativo/);
  });
});
test('contrato completo do catalogRepository é validado na criação do serviço', () => {
  const validCatalogRepository = {
    async list() { return []; },
    async findById() { return null; },
  };
  const musicRequestRepository = createFakeMusicRequestRepository();

  assert.doesNotThrow(() => createMusicPreparationService({
    catalogRepository: validCatalogRepository,
    musicRequestRepository,
  }));

  const invalidRepositories = [
    ['somente list', { async list() { return []; } }],
    ['somente findById', { async findById() { return null; } }],
    ['somente listActive', { async listActive() { return []; } }],
    ['list não função', { list: [], async findById() { return null; } }],
    ['findById não função', { async list() { return []; }, findById: true }],
  ];

  for (const [name, catalogRepository] of invalidRepositories) {
    assert.throws(
      () => createMusicPreparationService({ catalogRepository, musicRequestRepository }),
      (error) => error instanceof TypeError &&
        error.message === 'catalogRepository must implement list(type) and findById(type, id)',
      name
    );
  }
});

test('contrato de catálogo falha antes de clock ou persistência', () => {
  let clockCalls = 0;
  let persistenceCalls = 0;
  const clock = { now() { clockCalls += 1; return new Date(); } };
  const musicRequestRepository = {
    async findByTelegramUpdateId() { persistenceCalls += 1; return null; },
    async insert() { persistenceCalls += 1; return null; },
  };

  assert.throws(
    () => createMusicPreparationService({
      catalogRepository: { async listActive() { return []; } },
      musicRequestRepository,
      clock,
    }),
    (error) => error instanceof TypeError &&
      error.message === 'catalogRepository must implement list(type) and findById(type, id)'
  );
  assert.equal(clockCalls, 0);
  assert.equal(persistenceCalls, 0);
});

test('seleção automática mantém template, clima, período e dia no mesmo grupo de variação', async () => {
  const grouped = {
    templates: [
      {
        id: ids.template,
        active: true,
        name: 'Base 1',
        letra: '[Chorus]\nTemplate grupo 1 para {NOME}.',
        grupo: 1,
      },
      {
        id: ids.template2,
        active: true,
        name: 'Base 2',
        letra: '[Chorus]\nTemplate grupo 2 para {NOME}.',
        grupo: 2,
      },
    ],
    styles: [
      {
        id: ids.style,
        active: true,
        name: 'Samba',
        prompt: 'samba alegre',
      },
    ],
    periods: [
      {
        id: ids.period,
        active: true,
        categoria: 'Noite',
        texto: 'Período grupo 1 para {NOME}.',
        grupo: 1,
      },
      {
        id: ids.period2,
        active: true,
        categoria: 'Noite',
        texto: 'Período grupo 2 para {NOME}.',
        grupo: 2,
      },
    ],
    weekdays: [
      {
        id: ids.weekday,
        active: true,
        categoria: 'Sábado',
        texto: 'Dia grupo 1 para {NOME}.',
        grupo: 1,
      },
      {
        id: ids.weekday2,
        active: true,
        categoria: 'Sábado',
        texto: 'Dia grupo 2 para {NOME}.',
        grupo: 2,
      },
    ],
    climates: [
      {
        id: ids.climate,
        active: true,
        name: 'Ensolarado 1',
        categoria: 'Ensolarado',
        texto: 'Clima grupo 1 para {NOME}.',
        grupo: 1,
      },
      {
        id: ids.climate2,
        active: true,
        name: 'Ensolarado 2',
        categoria: 'Ensolarado',
        texto: 'Clima grupo 2 para {NOME}.',
        grupo: 2,
      },
    ],
  };

  const dto = await service({ catalogs: grouped }).instance.prepare(
    input({
      climate_id: ids.climate2,
      weather_status: 'applied',
      weather_summary: 'Ensolarado',
      weather_provider: 'open-meteo',
    }),
  );

  assert.equal(dto.request.climate_id, ids.climate2);
  assert.equal(dto.request.template_id, ids.template2);
  assert.equal(dto.request.period_id, ids.period2);
  assert.equal(dto.request.weekday_id, ids.weekday2);

  assert.match(dto.lyrics, /Template grupo 2/);
  assert.match(dto.lyrics, /Clima grupo 2/);
  assert.match(dto.lyrics, /Período grupo 2/);
  assert.match(dto.lyrics, /Dia grupo 2/);
});

test('rotação automática não repete família até usar todos os grupos disponíveis', async () => {
  const grouped = {
    templates: [],
    styles: [
      {
        id: ids.style,
        active: true,
        name: 'Samba',
        prompt: 'samba alegre',
      },
    ],
    periods: [],
    weekdays: [],
    climates: [],
  };

  for (let grupo = 1; grupo <= 5; grupo += 1) {
    const suffix = String(grupo).padStart(2, '0');

    grouped.templates.push({
      id: `00000000-0000-4000-8000-0000000001${suffix}`,
      active: true,
      name: `Template ${grupo}`,
      letra: `[Chorus]\nFamília ${grupo} para {NOME}.`,
      tema: 'Normal',
      grupo,
    });

    grouped.periods.push({
      id: `00000000-0000-4000-8000-0000000002${suffix}`,
      active: true,
      name: `Noite ${grupo}`,
      categoria: 'Noite',
      texto: `Período família ${grupo}.`,
      tema: 'Normal',
      grupo,
    });

    grouped.weekdays.push({
      id: `00000000-0000-4000-8000-0000000003${suffix}`,
      active: true,
      name: `Sábado ${grupo}`,
      categoria: 'Sábado',
      texto: `Dia família ${grupo}.`,
      tema: 'Normal',
      grupo,
    });
  }

  const repository = createFakeMusicRequestRepository();

  const setup = service({
    catalogs: grouped,
    musicRequestRepository: repository,
  });

  const gruposUsados = [];

  for (let index = 0; index < 5; index += 1) {
    const updateId = String(9007199254742000n + BigInt(index));

    const result = await setup.instance.prepare(
      input({
        update_id: updateId,
        name: `Pessoa ${index + 1}`,
      }),
    );

    const template = grouped.templates.find(
      (item) => item.id === result.request.template_id,
    );

    gruposUsados.push(template.grupo);
  }

  assert.equal(gruposUsados.length, 5);
  assert.equal(new Set(gruposUsados).size, 5);

  const sexto = await setup.instance.prepare(
    input({
      update_id: '9007199254742005',
      name: 'Pessoa 6',
    }),
  );

  const templateSexto = grouped.templates.find(
    (item) => item.id === sexto.request.template_id,
  );

  assert.ok([1, 2, 3, 4, 5].includes(templateSexto.grupo));
});

test('sábado alterna entre categoria específica e Fim de semana dentro do mesmo grupo', async () => {
  const weekendCatalog = {
    templates: [
      {
        id: ids.template,
        active: true,
        name: 'Base',
        letra: '[Chorus]\nOlá, {NOME}!',
        tema: 'Normal',
        grupo: 1,
      },
    ],
    styles: [
      {
        id: ids.style,
        active: true,
        name: 'Samba',
        prompt: 'samba alegre',
      },
    ],
    periods: [
      {
        id: ids.period,
        active: true,
        categoria: 'Noite',
        texto: 'Noite com {NOME}.',
        tema: 'Normal',
        grupo: 1,
      },
    ],
    weekdays: [
      {
        id: ids.weekday,
        active: true,
        categoria: 'Sábado',
        texto: 'Sábado de {NOME}.',
        tema: 'Normal',
        grupo: 1,
      },
      {
        id: ids.weekend,
        active: true,
        categoria: 'Fim de semana',
        texto: 'Fim de semana de {NOME}.',
        tema: 'Normal',
        grupo: 1,
      },
    ],
    climates: [],
  };

  const setup = service({
    catalogs: weekendCatalog,
  });

  const usados = new Set();

  for (let index = 0; index < 30; index += 1) {
    const result = await setup.instance.prepare(
      input({
        update_id: String(9007199254750000n + BigInt(index)),
        name: `Pessoa ${index}`,
      }),
    );

    usados.add(result.request.weekday_id);
  }

  assert.ok(usados.has(ids.weekday));
  assert.ok(usados.has(ids.weekend));
});

test('domingo alterna entre categoria específica e Fim de semana dentro do mesmo grupo', async () => {
  const sundayId = '00000000-0000-4000-8000-000000000099';

  const weekendCatalog = {
    templates: [
      {
        id: ids.template,
        active: true,
        name: 'Base',
        letra: '[Chorus]\nOlá, {NOME}!',
        tema: 'Normal',
        grupo: 1,
      },
    ],
    styles: [
      {
        id: ids.style,
        active: true,
        name: 'Samba',
        prompt: 'samba alegre',
      },
    ],
    periods: [
      {
        id: ids.period,
        active: true,
        categoria: 'Noite',
        texto: 'Noite com {NOME}.',
        tema: 'Normal',
        grupo: 1,
      },
    ],
    weekdays: [
      {
        id: sundayId,
        active: true,
        categoria: 'Domingo',
        texto: 'Domingo de {NOME}.',
        tema: 'Normal',
        grupo: 1,
      },
      {
        id: ids.weekend,
        active: true,
        categoria: 'Fim de semana',
        texto: 'Fim de semana de {NOME}.',
        tema: 'Normal',
        grupo: 1,
      },
    ],
    climates: [],
  };

  const sundayClock = {
    now: () => new Date('2026-08-10T01:00:00.000Z'),
  };

  const setup = service({
    catalogs: weekendCatalog,
    clock: sundayClock,
  });

  const usados = new Set();

  for (let index = 0; index < 30; index += 1) {
    const result = await setup.instance.prepare(
      input({
        update_id: String(9007199254760000n + BigInt(index)),
        name: `Pessoa ${index}`,
      }),
    );

    usados.add(result.request.weekday_id);
  }

  assert.ok(usados.has(sundayId));
  assert.ok(usados.has(ids.weekend));
});
