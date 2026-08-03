import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseMusicRequestRepository } from '../../backend/music-preparation/repositories/supabase-music-request-repository.js';
import { DuplicateTelegramUpdateError, MusicRequestPersistenceError } from '../../backend/music-preparation/validation.js';

function fakeClient(result) {
  const calls = [];
  const builder = {
    select(columns) { calls.push(['select', columns]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    insert(row) { calls.push(['insert', row]); return this; },
    then(resolve) { return Promise.resolve(result).then(resolve); },
  };
  return { calls, client: { from(table) { calls.push(['from', table]); return builder; } } };
}

test('findByTelegramUpdateId returns an existing row using an explicit select', async () => {
  const row = { id: 'request', telegram_update_id: '42' };
  const fake = fakeClient({ data: [row], error: null });
  const repository = createSupabaseMusicRequestRepository({ client: fake.client });
  assert.equal(await repository.findByTelegramUpdateId('42'), row);
  assert.equal(fake.calls[0][1], 'music_requests');
  assert.match(fake.calls[1][1], /^id,telegram_update_id,/);
  assert.deepEqual(fake.calls[2], ['eq', 'telegram_update_id', '42']);
});

test('findByTelegramUpdateId returns null for no row and rejects multiple rows', async () => {
  const absent = createSupabaseMusicRequestRepository({ client: fakeClient({ data: [], error: null }).client });
  assert.equal(await absent.findByTelegramUpdateId('42'), null);
  const multiple = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: [{ id: 'a' }, { id: 'b' }], error: null }).client,
  });
  await assert.rejects(
    () => multiple.findByTelegramUpdateId('42'),
    (error) => error instanceof MusicRequestPersistenceError && error.code === 'MULTIPLE_MUSIC_REQUESTS'
  );
});

test('insert persists only explicit prepared fields and returns the row', async () => {
  const persisted = { id: 'request', telegram_update_id: '42' };
  const fake = fakeClient({ data: [persisted], error: null });
  const repository = createSupabaseMusicRequestRepository({ client: fake.client });
  assert.equal(await repository.insert({
    telegram_update_id: '42', telegram_user_id: '7', telegram_chat_id: '-8',
    status: 'prepared', unexpected: 'must not persist',
  }), persisted);
  const insert = fake.calls.find(([method]) => method === 'insert')[1];
  assert.equal(insert.telegram_update_id, '42');
  assert.equal(insert.status, 'prepared');
  assert.equal(Object.hasOwn(insert, 'unexpected'), false);
  assert.equal(Object.hasOwn(insert, 'id'), false);
});

test('23505 is translated to the duplicate error recognized by Phase 2A', async () => {
  const cause = { code: '23505', message: 'unique violation' };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error instanceof DuplicateTelegramUpdateError &&
      error.code === 'DUPLICATE_TELEGRAM_UPDATE_ID' && error.cause === cause
  );
});

test('telegram update foreign-key failure is translated to not claimed', async () => {
  const cause = {
    code: '23503',
    constraint: 'music_requests_telegram_update_id_fkey',
    message: 'foreign key violation',
  };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error instanceof MusicRequestPersistenceError &&
      error.code === 'TELEGRAM_UPDATE_NOT_CLAIMED' && error.cause === cause
  );
});

test('generic Supabase errors remain generic persistence errors', async () => {
  const cause = { code: 'XX000', message: 'database failure' };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error instanceof MusicRequestPersistenceError &&
      error.code === 'MUSIC_REQUEST_INSERT_FAILED' &&
      !(error instanceof DuplicateTelegramUpdateError) && error.cause === cause
  );
});
test('non-prepared statuses are rejected before querying the client', async () => {
  for (const status of ['creation_confirmed', 'linked']) {
    let queries = 0;
    const repository = createSupabaseMusicRequestRepository({
      client: { from() { queries += 1; } },
    });
    await assert.rejects(
      () => repository.insert({ status }),
      (error) => error.code === 'INVALID_PREPARED_STATUS'
    );
    assert.equal(queries, 0);
  }
});

test('populated transition fields are rejected before querying the client', async () => {
  for (const input of [
    { suno_share_link: 'https://suno.com/song' },
    { quota_consumed_at: '2026-08-03T12:00:00.000Z' },
    { creation_confirmed_at: '2026-08-03T12:00:00.000Z' },
  ]) {
    let queries = 0;
    const repository = createSupabaseMusicRequestRepository({
      client: { from() { queries += 1; } },
    });
    await assert.rejects(
      () => repository.insert(input),
      (error) => error.code === 'PREPARED_REQUEST_HAS_TRANSITION_FIELDS'
    );
    assert.equal(queries, 0);
  }
});

test('insert sends exactly the prepared allowlist and omits null transition fields', async () => {
  const fake = fakeClient({ data: [{ id: 'request' }], error: null });
  const repository = createSupabaseMusicRequestRepository({ client: fake.client });
  await repository.insert({
    telegram_update_id: '42',
    status: undefined,
    quota_consumed_at: null,
    creation_confirmed_at: null,
    suno_share_link: null,
    linked_at: null,
    estimated_credit_cost: null,
    unknown: 'ignored',
  });

  const row = fake.calls.find(([method]) => method === 'insert')[1];
  assert.deepEqual(Object.keys(row), [
    'telegram_update_id', 'telegram_user_id', 'telegram_chat_id', 'passenger_name', 'passenger_gender',
    'selection_mode', 'template_id', 'style_id', 'climate_id', 'period_id', 'weekday_id', 'timezone',
    'local_datetime', 'local_weekday', 'local_period', 'weather_status', 'weather_summary', 'weather_provider',
    'title', 'style_name', 'style_prompt', 'lyrics', 'prompt_final', 'created_at', 'expires_at', 'updated_at',
    'status',
  ]);
  assert.equal(row.status, 'prepared');
  for (const field of [
    'quota_consumed_at', 'creation_confirmed_at', 'suno_share_link', 'linked_at',
    'estimated_credit_cost', 'unknown',
  ]) {
    assert.equal(Object.hasOwn(row, field), false);
  }
});

test('23503 from another foreign key remains generic and preserves cause', async () => {
  const cause = {
    code: '23503',
    constraint: 'music_requests_template_id_fkey',
    message: 'foreign key violation on template_id',
  };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error instanceof MusicRequestPersistenceError &&
      error.code === 'MUSIC_REQUEST_INSERT_FAILED' && error.cause === cause
  );
});
test('full PostgreSQL constraint name in message translates 23503', async () => {
  const cause = {
    code: '23503',
    message: 'insert or update violates foreign key constraint "music_requests_telegram_update_id_fkey"',
  };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error.code === 'TELEGRAM_UPDATE_NOT_CLAIMED' && error.cause === cause
  );
});

test('ambiguous telegram_update_id mention does not translate 23503', async () => {
  const cause = {
    code: '23503',
    message: 'foreign key violation for telegram_update_id',
    details: 'Key (telegram_update_id) is not present',
  };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error.code === 'MUSIC_REQUEST_INSERT_FAILED' && error.cause === cause
  );
});

test('similar prefixed or suffixed constraint names do not translate 23503', async () => {
  for (const constraint of [
    'prefix_music_requests_telegram_update_id_fkey',
    'music_requests_telegram_update_id_fkey_suffix',
  ]) {
    const cause = {
      code: '23503',
      constraint,
      message: `violates foreign key constraint "${constraint}"`,
    };
    const repository = createSupabaseMusicRequestRepository({
      client: fakeClient({ data: null, error: cause }).client,
    });
    await assert.rejects(
      () => repository.insert({ telegram_update_id: '42' }),
      (error) => error.code === 'MUSIC_REQUEST_INSERT_FAILED' && error.cause === cause
    );
  }
});

test('constraint name in hint alone does not translate 23503', async () => {
  const cause = {
    code: '23503',
    message: 'foreign key violation',
    hint: 'constraint "music_requests_telegram_update_id_fkey"',
  };
  const repository = createSupabaseMusicRequestRepository({
    client: fakeClient({ data: null, error: cause }).client,
  });
  await assert.rejects(
    () => repository.insert({ telegram_update_id: '42' }),
    (error) => error.code === 'MUSIC_REQUEST_INSERT_FAILED' && error.cause === cause
  );
});
