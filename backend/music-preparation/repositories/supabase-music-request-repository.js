import { DuplicateTelegramUpdateError, MusicRequestPersistenceError } from '../validation.js';

const REQUEST_FIELDS = Object.freeze([
  'telegram_update_id', 'telegram_user_id', 'telegram_chat_id', 'passenger_name', 'passenger_gender',
  'selection_mode', 'template_id', 'style_id', 'climate_id', 'period_id', 'weekday_id', 'timezone',
  'local_datetime', 'local_weekday', 'local_period', 'weather_status', 'weather_summary', 'weather_provider',
  'title', 'style_name', 'style_prompt', 'lyrics', 'prompt_final', 'created_at', 'expires_at', 'updated_at',
]);
const SELECT_FIELDS = [
  'id', ...REQUEST_FIELDS, 'status', 'estimated_credit_cost', 'quota_consumed_at',
  'creation_confirmed_at', 'suno_share_link', 'linked_at',
].join(',');
const FORBIDDEN_TRANSITION_FIELDS = Object.freeze([
  'quota_consumed_at', 'creation_confirmed_at', 'suno_share_link', 'linked_at',
  'estimated_credits_consumed', 'estimated_credit_cost',
]);

function persistenceError(code, message, cause) {
  return new MusicRequestPersistenceError(code, message, undefined, { cause });
}

const TELEGRAM_UPDATE_CONSTRAINT = 'music_requests_telegram_update_id_fkey';
const QUOTED_TELEGRAM_UPDATE_CONSTRAINT = new RegExp(
  `constraint\\s+["']${TELEGRAM_UPDATE_CONSTRAINT}["']`,
  'i'
);

function isTelegramUpdateForeignKey(error) {
  if (error?.code !== '23503') return false;
  if (error.constraint === TELEGRAM_UPDATE_CONSTRAINT) return true;
  return [error.message, error.details].some(
    (value) => typeof value === 'string' && QUOTED_TELEGRAM_UPDATE_CONSTRAINT.test(value)
  );
}

function translateInsertError(error, updateId) {
  if (error?.code === '23505') return new DuplicateTelegramUpdateError(updateId, { cause: error });
  if (isTelegramUpdateForeignKey(error)) {
    return persistenceError(
      'TELEGRAM_UPDATE_NOT_CLAIMED',
      'Telegram update must be claimed before preparing a music request',
      error
    );
  }
  return persistenceError('MUSIC_REQUEST_INSERT_FAILED', 'Music request insert failed', error);
}

function preparedRow(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw persistenceError('INVALID_PREPARED_REQUEST', 'Prepared music request must be an object');
  }
  if (input.status !== undefined && input.status !== 'prepared') {
    throw persistenceError('INVALID_PREPARED_STATUS', 'Music request insert only accepts prepared status');
  }
  const populatedField = FORBIDDEN_TRANSITION_FIELDS.find((field) => input[field] != null);
  if (populatedField) {
    throw persistenceError(
      'PREPARED_REQUEST_HAS_TRANSITION_FIELDS',
      'Prepared music request contains a forbidden transition field'
    );
  }
  return Object.fromEntries([
    ...REQUEST_FIELDS.map((field) => [field, input[field]]),
    ['status', 'prepared'],
  ]);
}

export function createSupabaseMusicRequestRepository({ client } = {}) {
  if (!client || typeof client.from !== 'function') throw new TypeError('client.from is required');

  return Object.freeze({
    async findByTelegramUpdateId(updateId) {
      const { data, error } = await client.from('music_requests')
        .select(SELECT_FIELDS)
        .eq('telegram_update_id', updateId);
      if (error) throw persistenceError('MUSIC_REQUEST_LOOKUP_FAILED', 'Music request lookup failed', error);
      if (!Array.isArray(data)) {
        throw persistenceError('INVALID_MUSIC_REQUEST_RESULT', 'Music request lookup returned invalid data');
      }
      if (data.length > 1) {
        throw persistenceError('MULTIPLE_MUSIC_REQUESTS', 'Multiple music requests share one telegram_update_id');
      }
      return data[0] ?? null;
    },

    async listRecentTemplateIds({
      userId,
      chatId,
      templateIds,
      limit = 20,
    } = {}) {
      if (!Array.isArray(templateIds) || !templateIds.length || limit <= 0) {
        return [];
      }

      const { data, error } = await client
        .from('music_requests')
        .select('template_id,created_at')
        .eq('telegram_user_id', userId)
        .eq('telegram_chat_id', chatId)
        .in('template_id', templateIds)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw persistenceError(
          'MUSIC_REQUEST_HISTORY_FAILED',
          'Music request history lookup failed',
          error,
        );
      }

      if (!Array.isArray(data)) {
        throw persistenceError(
          'INVALID_MUSIC_REQUEST_RESULT',
          'Music request history returned invalid data',
        );
      }

      return data
        .map((row) => row.template_id)
        .filter(Boolean);
    },

    async insert(input) {
      const row = preparedRow(input);
      const { data, error } = await client.from('music_requests').insert(row).select(SELECT_FIELDS);
      if (error) throw translateInsertError(error, row.telegram_update_id);
      if (!Array.isArray(data)) {
        throw persistenceError('INVALID_MUSIC_REQUEST_RESULT', 'Music request insert returned invalid data');
      }
      if (data.length !== 1) {
        throw persistenceError(
          'INVALID_MUSIC_REQUEST_INSERT_COUNT',
          'Music request insert did not return exactly one row'
        );
      }
      return data[0];
    },
  });
}
