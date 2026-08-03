import { createServiceRoleDatabase } from '../../config/service-role-database.js';
import { createSupabaseCatalogRepository } from '../music-preparation/repositories/supabase-catalog-repository.js';
import { createSupabaseMusicRequestRepository } from '../music-preparation/repositories/supabase-music-request-repository.js';
import { createMusicPreparationService } from '../music-preparation/prepare-music-request.js';
import { createTelegramApi } from './telegram-api.js';
import { createTelegramRepository } from './repository.js';
import { createTelegramBotService } from './service.js';
import { createLongPoller } from './polling.js';

function positiveInteger(name, value, fallback) { const raw = value ?? fallback; if (!/^\d+$/u.test(String(raw)) || Number(raw) < 1 || !Number.isSafeInteger(Number(raw))) throw new Error(`${name} must be a positive integer`); return Number(raw); }
function nonNegativeInteger(name, value, fallback) { const raw = value ?? fallback; if (!/^\d+$/u.test(String(raw)) || !Number.isSafeInteger(Number(raw))) throw new Error(`${name} must be a non-negative integer`); return Number(raw); }
export function telegramPollingEnabled(env = process.env) { return env.TELEGRAM_POLLING_ENABLED === 'true'; }
export function createTelegramRuntime({ env = process.env, fetchImpl = globalThis.fetch, logger = console, createClient } = {}) {
  const token = env.TELEGRAM_BOT_TOKEN; const allowedUserId = positiveInteger('TELEGRAM_ALLOWED_USER_ID', env.TELEGRAM_ALLOWED_USER_ID);
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  const client = createServiceRoleDatabase({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, ...(createClient ? { createClient } : {}) });
  const api = createTelegramApi({ token, fetchImpl }); const repository = createTelegramRepository({ client });
  const preparationService = createMusicPreparationService({ catalogRepository: createSupabaseCatalogRepository({ client }), musicRequestRepository: createSupabaseMusicRequestRepository({ client }) });
  const bot = createTelegramBotService({ api, repository, preparationService, allowedUserId, dailyLimit: positiveInteger('DAILY_MUSIC_LIMIT', env.DAILY_MUSIC_LIMIT, 8), creditCost: nonNegativeInteger('ESTIMATED_CREDIT_COST', env.ESTIMATED_CREDIT_COST, 10) });
  return createLongPoller({ api, processUpdate: bot.processUpdate, logger });
}
export function startTelegramPolling(options = {}) { if (!telegramPollingEnabled(options.env)) return null; const poller = createTelegramRuntime(options); poller.start(); return poller; }
