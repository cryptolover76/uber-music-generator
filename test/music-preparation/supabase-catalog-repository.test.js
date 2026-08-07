import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CatalogRepositoryError,
  InvalidCatalogTypeError,
  createSupabaseCatalogRepository,
} from '../../backend/music-preparation/repositories/supabase-catalog-repository.js';

function fakeClient(result) {
  const calls = [];
  const builder = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    then(resolve) { return Promise.resolve(result).then(resolve); },
  };
  return {
    calls,
    client: { from(table) { calls.push(['from', table]); return builder; } },
  };
}

test('list uses a whitelisted table, explicit columns, active filter and deterministic order', async () => {
  const fake = fakeClient({ data: [
    { id: 'b', name: 'B', prompt: 'b', active: true, categoria: null },
    { id: 'a', name: 'A', prompt: 'a', active: true, categoria: null },
  ], error: null });
  const repository = createSupabaseCatalogRepository({ client: fake.client });

  const rows = await repository.list('styles');

  assert.deepEqual(rows.map(({ id }) => id), ['a', 'b']);
  assert.deepEqual(fake.calls, [
    ['from', 'estilos'],
    ['select', 'id,name,prompt,active,categoria'],
    ['eq', 'active', true],
  ]);
});

test('invalid catalog type is rejected before the client is queried', async () => {
  let queried = false;
  const repository = createSupabaseCatalogRepository({
    client: { from() { queried = true; } },
  });

  await assert.rejects(() => repository.list('arbitrary_table'), InvalidCatalogTypeError);
  assert.equal(queried, false);
});

test('findById uses actual migration columns and active filter', async () => {
  const row = { id: 'one', name: 'Template', letra: 'text', active: true, categoria: null };
  const fake = fakeClient({ data: [row], error: null });
  const repository = createSupabaseCatalogRepository({ client: fake.client });

  assert.equal(await repository.findById('templates', 'one'), row);
  assert.deepEqual(fake.calls, [
    ['from', 'templates_letras'],
    ['select', 'id,name,letra,active,categoria,tema,grupo'],
    ['eq', 'active', true],
    ['eq', 'id', 'one'],
  ]);
});

test('Supabase catalog errors are translated with their cause', async () => {
  const cause = { code: 'XX000', message: 'database failure' };
  const fake = fakeClient({ data: null, error: cause });
  const repository = createSupabaseCatalogRepository({ client: fake.client });

  await assert.rejects(
    () => repository.list('periods'),
    (error) => error instanceof CatalogRepositoryError &&
      error.code === 'CATALOG_QUERY_FAILED' && error.cause === cause
  );
});
test('public catalog repository interface is exactly list and findById', () => {
  const repository = createSupabaseCatalogRepository({ client: fakeClient({ data: [], error: null }).client });
  assert.deepEqual(Object.keys(repository), ['list', 'findById']);
});

test('every catalog list uses its migration table, explicit columns and active filter', async () => {
  const cases = [
    ['templates', 'templates_letras', 'id,name,letra,active,categoria,tema,grupo'],
    ['styles', 'estilos', 'id,name,prompt,active,categoria'],
    ['periods', 'periodos', 'id,name,texto,active,categoria,tema,grupo'],
    ['weekdays', 'dias_semana', 'id,name,texto,active,categoria,tema,grupo'],
    ['climates', 'climas', 'id,name,texto,active,categoria,tema,grupo'],
  ];
  for (const [type, table, columns] of cases) {
    const fake = fakeClient({ data: [], error: null });
    const repository = createSupabaseCatalogRepository({ client: fake.client });
    await repository.list(type);
    assert.deepEqual(fake.calls, [
      ['from', table],
      ['select', columns],
      ['eq', 'active', true],
    ]);
  }
});
