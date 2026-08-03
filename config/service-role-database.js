import { createClient as defaultCreateClient } from '@supabase/supabase-js';

export class ServiceRoleDatabaseConfigurationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ServiceRoleDatabaseConfigurationError';
    this.code = code;
  }
}

function validateUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ServiceRoleDatabaseConfigurationError('MISSING_SUPABASE_URL', 'Supabase URL is required');
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported protocol');
  } catch {
    throw new ServiceRoleDatabaseConfigurationError('INVALID_SUPABASE_URL', 'Supabase URL must be a valid HTTP(S) URL');
  }
}

export function createServiceRoleDatabase(options = {}) {
  const { url, serviceRoleKey, createClient = defaultCreateClient } = options;
  validateUrl(url);
  if (typeof serviceRoleKey !== 'string' || serviceRoleKey.trim() === '') {
    throw new ServiceRoleDatabaseConfigurationError('MISSING_SUPABASE_SERVICE_ROLE_KEY', 'Supabase service role key is required');
  }
  if (typeof createClient !== 'function') throw new TypeError('createClient must be a function');

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
