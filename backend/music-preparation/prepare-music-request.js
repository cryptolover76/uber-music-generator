import { montarLetra } from '../../shared/substituir.js';
import { applicableCatalogItems, CatalogSelectionError, defaultCatalogSelector } from './catalog-selector.js';
import { DEFAULT_TIMEZONE, getLocalContext } from './local-context.js';
import { DuplicateTelegramUpdateError, MusicPreparationError, MusicRequestPersistenceError, validateMusicPreparationInput } from './validation.js';

const CATALOG_TYPES = Object.freeze({
  template: 'templates',
  style: 'styles',
  period: 'periods',
  weekday: 'weekdays',
  climate: 'climates',
});

export class MusicRequestConflictError extends MusicPreparationError {
  constructor() {
    super('TELEGRAM_UPDATE_CONFLICT', 'telegram_update_id is already associated with a different request identity');
    this.name = 'MusicRequestConflictError';
  }
}

function nowFrom(clock) {
  const value = typeof clock === 'function' ? clock() : clock?.now?.();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('clock must return a valid date');
  return date;
}

function sameRequest(existing, input) {
  return existing.telegram_user_id === input.telegram_user_id &&
    existing.telegram_chat_id === input.telegram_chat_id &&
    existing.passenger_name === input.passenger_name &&
    existing.passenger_gender === input.passenger_gender &&
    existing.selection_mode === input.selection_mode &&
    (input.selection_mode !== 'manual' ||
      (existing.template_id === input.template_id && existing.style_id === input.style_id)) &&
    existing.climate_id === input.climate_id;
}

function toDto(request) {
  return Object.freeze({
    request,
    title: request.title,
    style_prompt: request.style_prompt,
    lyrics: request.lyrics,
    prompt_final: request.prompt_final,
  });
}

function validateCatalogRepository(repository) {
  if (
    !repository ||
    typeof repository !== 'object' ||
    Array.isArray(repository) ||
    typeof repository.list !== 'function' ||
    typeof repository.findById !== 'function'
  ) {
    throw new TypeError('catalogRepository must implement list(type) and findById(type, id)');
  }
}

async function listCatalog(repository, type) {
  return repository.list(CATALOG_TYPES[type]);
}

async function findCatalog(repository, type, id) {
  return repository.findById(CATALOG_TYPES[type], id);
}

function ensureManualItem(item, type, id) {
  if (!item || item.active !== true) {
    throw new MusicPreparationError('CATALOG_NOT_FOUND', 'No active ' + type + ' catalog item exists for ' + id, { catalogType: type, id });
  }
  const [validated] = applicableCatalogItems([item], { catalogType: type });
  return validated;
}

function select(selector, options) {
  const validatedItems = applicableCatalogItems(options.items, options);
  const callback = typeof selector === 'function' ? selector : selector?.select;
  if (typeof callback !== 'function') throw new TypeError('catalogSelector.select(options) is required');
  return callback({ ...options, items: validatedItems });
}

async function findExisting(repository, updateId) {
  if (typeof repository.findByTelegramUpdateId === 'function') return repository.findByTelegramUpdateId(updateId);
  throw new TypeError('musicRequestRepository.findByTelegramUpdateId(updateId) is required');
}

async function insertRequest(repository, row) {
  if (typeof repository.insert === 'function') return repository.insert(row);
  throw new TypeError('musicRequestRepository.insert(row) is required');
}

export function createMusicPreparationService({
  catalogRepository,
  musicRequestRepository,
  clock = { now: () => new Date() },
  catalogSelector = defaultCatalogSelector,
  settings = {},
}) {
  validateCatalogRepository(catalogRepository);
  if (!musicRequestRepository) throw new TypeError('musicRequestRepository is required');
  const timezone = settings.timezone ?? DEFAULT_TIMEZONE;
  const validityHours = settings.validityHours ?? 12;
  if (!(Number.isFinite(validityHours) && validityHours > 0)) throw new TypeError('settings.validityHours must be positive');

  return Object.freeze({
    async prepare(rawInput) {
      const input = validateMusicPreparationInput(rawInput);
      const existing = await findExisting(musicRequestRepository, input.telegram_update_id);
      if (existing) {
        if (!sameRequest(existing, input)) throw new MusicRequestConflictError();
        return toDto(existing);
      }

      const now = nowFrom(clock);
      const context = getLocalContext(now, timezone);
      let template;
      let style;
      if (input.selection_mode === 'manual') {
        [template, style] = await Promise.all([
          findCatalog(catalogRepository, 'template', input.template_id),
          findCatalog(catalogRepository, 'style', input.style_id),
        ]);
        template = ensureManualItem(template, 'template', input.template_id);
        style = ensureManualItem(style, 'style', input.style_id);
      } else {
        const [templates, styles] = await Promise.all([
          listCatalog(catalogRepository, 'template'),
          listCatalog(catalogRepository, 'style'),
        ]);
        template = select(catalogSelector, { items: templates, telegramUpdateId: input.telegram_update_id, catalogType: 'template' });
        style = select(catalogSelector, { items: styles, telegramUpdateId: input.telegram_update_id, catalogType: 'style' });
      }

      const periods = await listCatalog(catalogRepository, 'period');
      const periodo = select(catalogSelector, {
        items: periods,
        telegramUpdateId: input.telegram_update_id,
        catalogType: 'period',
        category: context.periodCategory,
      });
      const weekdays = await listCatalog(catalogRepository, 'weekday');
      let weekdayCandidates = weekdays;
      let weekdayCategory = context.weekdayCategory;
      if (context.isWeekend) {
        try {
          select(catalogSelector, {
            items: weekdays,
            telegramUpdateId: input.telegram_update_id,
            catalogType: 'weekday',
            category: weekdayCategory,
          });
        } catch (error) {
          if (!(error instanceof CatalogSelectionError)) throw error;
          weekdayCategory = 'Fim de semana';
        }
      }
      const dia = select(catalogSelector, {
        items: weekdayCandidates,
        telegramUpdateId: input.telegram_update_id,
        catalogType: 'weekday',
        category: weekdayCategory,
      });

      let clima = null;
      if (input.climate_id) {
        clima = ensureManualItem(await findCatalog(catalogRepository, 'climate', input.climate_id), 'climate', input.climate_id);
      }
      const partes = [periodo, clima, dia].filter(Boolean);
      const lyrics = montarLetra(partes, template, input.passenger_name, input.passenger_gender);
      const title = `Para ${input.passenger_name}`;
      const stylePrompt = style.prompt;
      const promptFinal = `Tags: ${stylePrompt}\n\n---\n\n${lyrics}`;
      const createdAt = now.toISOString();
      const row = {
        telegram_update_id: input.telegram_update_id,
        telegram_user_id: input.telegram_user_id,
        telegram_chat_id: input.telegram_chat_id,
        passenger_name: input.passenger_name,
        passenger_gender: input.passenger_gender,
        selection_mode: input.selection_mode,
        template_id: template.id,
        style_id: style.id,
        climate_id: clima?.id ?? null,
        period_id: periodo.id,
        weekday_id: dia.id,
        timezone,
        local_datetime: createdAt,
        local_weekday: context.localWeekday,
        local_period: context.localPeriod,
        weather_status: input.weather_status,
        weather_summary: input.weather_summary,
        weather_provider: input.weather_provider,
        title,
        style_name: style.name,
        style_prompt: stylePrompt,
        lyrics,
        prompt_final: promptFinal,
        status: 'prepared',
        estimated_credit_cost: null,
        quota_consumed_at: null,
        creation_confirmed_at: null,
        suno_share_link: null,
        linked_at: null,
        created_at: createdAt,
        expires_at: new Date(now.getTime() + validityHours * 60 * 60 * 1000).toISOString(),
        updated_at: createdAt,
      };
      try {
        const persisted = await insertRequest(musicRequestRepository, row);
        return toDto(persisted);
      } catch (error) {
        if (!(error instanceof DuplicateTelegramUpdateError)) throw error;
        const winner = await findExisting(musicRequestRepository, input.telegram_update_id);
        if (!winner) {
          throw new MusicRequestPersistenceError(
            'DUPLICATE_REQUEST_NOT_FOUND',
            'duplicate telegram_update_id was reported but the winning request could not be read',
            { telegramUpdateId: input.telegram_update_id },
            { cause: error }
          );
        }
        if (!sameRequest(winner, input)) throw new MusicRequestConflictError();
        return toDto(winner);
      }
    },
  });
}

export async function prepareMusicRequestWithStyle({
  preparationService,
  catalogRepository,
  catalogSelector = defaultCatalogSelector,
}, rawInput, styleId) {
  if (typeof preparationService?.prepare !== 'function') throw new TypeError('preparationService.prepare is required');
  validateCatalogRepository(catalogRepository);
  const input = validateMusicPreparationInput({ ...rawInput, selection_mode: 'automatic' });
  const [templates, style] = await Promise.all([
    listCatalog(catalogRepository, 'template'),
    findCatalog(catalogRepository, 'style', styleId),
  ]);
  const template = select(catalogSelector, {
    items: templates,
    telegramUpdateId: input.telegram_update_id,
    catalogType: 'template',
  });
  const validatedStyle = ensureManualItem(style, 'style', styleId);
  return preparationService.prepare({
    ...rawInput,
    selection_mode: 'manual',
    template_id: template.id,
    style_id: validatedStyle.id,
  });
}
