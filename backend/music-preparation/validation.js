const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_INTEGER_PATTERN = /^-?(?:0|[1-9]\d*)$/;
const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = (2n ** 63n) - 1n;

export class MusicPreparationError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'MusicPreparationError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export class MusicPreparationValidationError extends MusicPreparationError {
  constructor(code, message, details) {
    super(code, message, details);
    this.name = 'MusicPreparationValidationError';
  }
}

export class DuplicateTelegramUpdateError extends MusicPreparationError {
  constructor(telegramUpdateId, options = {}) {
    super("DUPLICATE_TELEGRAM_UPDATE_ID", "telegram_update_id already exists", { telegramUpdateId });
    this.name = "DuplicateTelegramUpdateError";
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export class MusicRequestPersistenceError extends MusicPreparationError {
  constructor(code, message, details, options = {}) {
    super(code, message, details);
    this.name = "MusicRequestPersistenceError";
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

function invalid(field, reason) {
  throw new MusicPreparationValidationError(`INVALID_${field.toUpperCase()}`, `${field}: ${reason}`, { field });
}

export function normalizePassengerName(value) {
  if (typeof value !== 'string') invalid('passenger_name', 'must be a string');
  if (/\p{Cc}/u.test(value) || /[\r\n\u2028\u2029]/u.test(value)) invalid('passenger_name', 'must not contain controls or line breaks');
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!normalized) invalid('passenger_name', 'must not be empty');
  if ([...normalized].length > 120) invalid('passenger_name', 'must have at most 120 code points');
  return normalized;
}

export function normalizeGender(value) {
  if (typeof value !== 'string') invalid('passenger_gender', 'must be M, F or N');
  const normalized = value.toUpperCase();
  if (!['M', 'F', 'N'].includes(normalized)) invalid('passenger_gender', 'must be M, F or N');
  return normalized;
}

export function normalizeTelegramId(value, field, { allowNegative = false } = {}) {
  let decimal;
  if (typeof value === 'bigint') decimal = value.toString();
  else if (typeof value === 'string' && DECIMAL_INTEGER_PATTERN.test(value)) decimal = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) decimal = String(value);
  else invalid(field, 'must be a decimal integer');

  const bigint = BigInt(decimal);
  if (bigint < BIGINT_MIN || bigint > BIGINT_MAX) invalid(field, 'is outside the bigint range');
  if (allowNegative ? bigint === 0n : bigint <= 0n) invalid(field, allowNegative ? 'must not be zero' : 'must be positive');
  return bigint.toString();
}

export function normalizeUuid(value, field, { required = false } = {}) {
  if (value == null) {
    if (required) invalid(field, 'is required');
    return null;
  }
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) invalid(field, 'must be a valid UUID');
  return value.toLowerCase();
}

export function validateMusicPreparationInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('request', 'must be an object');
  const mode = input.selection_mode ?? input.selectionMode;
  if (mode !== 'manual' && mode !== 'automatic') invalid('selection_mode', 'must be manual or automatic');
  const rawTemplateId = input.template_id ?? input.templateId;
  const rawStyleId = input.style_id ?? input.styleId;
  if (mode === 'automatic' && (rawTemplateId != null || rawStyleId != null)) {
    throw new MusicPreparationValidationError('AUTOMATIC_MODE_REJECTS_MANUAL_IDS', 'automatic mode does not accept template_id or style_id');
  }

  return Object.freeze({
    telegram_update_id: normalizeTelegramId(input.telegram_update_id ?? input.telegramUpdateId ?? input.update_id, 'telegram_update_id'),
    telegram_user_id: normalizeTelegramId(input.telegram_user_id ?? input.telegramUserId ?? input.user_id, 'telegram_user_id'),
    telegram_chat_id: normalizeTelegramId(input.telegram_chat_id ?? input.telegramChatId ?? input.chat_id, 'telegram_chat_id', { allowNegative: true }),
    passenger_name: normalizePassengerName(input.passenger_name ?? input.passengerName ?? input.name),
    passenger_gender: normalizeGender(input.passenger_gender ?? input.passengerGender ?? input.gender),
    selection_mode: mode,
    template_id: normalizeUuid(rawTemplateId, 'template_id', { required: mode === 'manual' }),
    style_id: normalizeUuid(rawStyleId, 'style_id', { required: mode === 'manual' }),
    climate_id: normalizeUuid(input.climate_id ?? input.climateId, 'climate_id'),
    weather_status: (input.climate_id ?? input.climateId) ? 'applied' : 'not_requested',
    weather_summary: typeof input.weather_summary === 'string' && input.weather_summary.trim() ? input.weather_summary.trim().slice(0, 500) : null,
    weather_provider: input.weather_provider === 'open-meteo' ? 'open-meteo' : null,
  });
}

export const validatePreparationInput = validateMusicPreparationInput;
export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value);
