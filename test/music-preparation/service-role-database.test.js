import assert from 'node:assert/strict';
import test from 'node:test';

test('module import is inert and validation happens only when factory is called', async () => {
  const module = await import('../../config/service-role-database.js');
  assert.throws(
    () => module.createServiceRoleDatabase(),
    (error) => error.code === 'MISSING_SUPABASE_URL'
  );
  assert.throws(
    () => module.createServiceRoleDatabase({ url: 'not a URL', serviceRoleKey: 'secret' }),
    (error) => error.code === 'INVALID_SUPABASE_URL'
  );
});

test('factory passes the service role key and safe auth options to createClient', async () => {
  const { createServiceRoleDatabase } = await import('../../config/service-role-database.js');
  const calls = [];
  const expected = {};
  const actual = createServiceRoleDatabase({
    url: 'https://project.supabase.co',
    serviceRoleKey: 'service-role-secret',
    createClient(...args) {
      calls.push(args);
      return expected;
    },
  });

  assert.equal(actual, expected);
  assert.deepEqual(calls, [[
    'https://project.supabase.co',
    'service-role-secret',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  ]]);
});
test('import does not create a client or call process.exit', async () => {
  const originalExit = process.exit;
  let exitCalls = 0;
  process.exit = () => { exitCalls += 1; };
  try {
    await import(`../../config/service-role-database.js?inert=${Date.now()}`);
  } finally {
    process.exit = originalExit;
  }
  assert.equal(exitCalls, 0);
});

test('invalid configuration fails before injected createClient is called', async () => {
  const { createServiceRoleDatabase } = await import('../../config/service-role-database.js');
  let clientCalls = 0;
  const createClient = () => { clientCalls += 1; };

  assert.throws(
    () => createServiceRoleDatabase({ url: 'invalid', serviceRoleKey: 'secret', createClient }),
    (error) => error.code === 'INVALID_SUPABASE_URL'
  );
  assert.throws(
    () => createServiceRoleDatabase({ url: 'https://project.supabase.co', createClient }),
    (error) => error.code === 'MISSING_SUPABASE_SERVICE_ROLE_KEY'
  );
  assert.equal(clientCalls, 0);
});
