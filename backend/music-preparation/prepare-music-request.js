import { montarLetra } from '../../shared/substituir.js';
import {
  applicableCatalogItems,
  CatalogSelectionError,
  defaultCatalogSelector,
  detectGroup,
} from './catalog-selector.js';
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
    (!input.template_id || existing.template_id === input.template_id) &&
    (!input.style_id || existing.style_id === input.style_id) &&
    (!input.period_id || existing.period_id === input.period_id) &&
    (!input.weekday_id || existing.weekday_id === input.weekday_id) &&
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

async function recentTemplateIds(repository, options) {
  if (typeof repository.listRecentTemplateIds !== 'function') {
    return [];
  }

  return repository.listRecentTemplateIds(options);
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
      // O clima escolhido funciona como âncora da família musical.
      // Quando ele possui grupo, template, período e dia
      // precisam pertencer ao mesmo grupo.
      let clima = null;
      let selectedGroup = null;
      let selectedTheme =
        typeof rawInput?.tema === 'string' && rawInput.tema.trim()
          ? rawInput.tema.trim()
          : 'Normal';

      if (input.climate_id) {
        clima = ensureManualItem(
          await findCatalog(
            catalogRepository,
            'climate',
            input.climate_id,
          ),
          'climate',
          input.climate_id,
        );
      }

      if (
        !(typeof rawInput?.tema === 'string' && rawInput.tema.trim())
        && typeof clima?.tema === 'string'
        && clima.tema.trim()
      ) {
        selectedTheme = clima.tema.trim();
      }

      function itensDoTema(items) {
        return items.filter((item) => {
          const temaItem =
            typeof item.tema === 'string' && item.tema.trim()
              ? item.tema.trim()
              : 'Normal';

          return temaItem === selectedTheme;
        });
      }

      const templatesDoTema = itensDoTema(
        await listCatalog(catalogRepository, 'template'),
      );

      let selectedWeekdayCategory = context.weekdayCategory;

      if (input.selection_mode === 'automatic') {
        const periodsDoTema = itensDoTema(
          await listCatalog(catalogRepository, 'period'),
        );

        const weekdaysDoTema = itensDoTema(
          await listCatalog(catalogRepository, 'weekday'),
        );

        const climatesDoTema = itensDoTema(
          await listCatalog(catalogRepository, 'climate'),
        );

        function grupos(items, category = null) {
          return new Set(
            items
              .filter((item) =>
                (category == null || item.categoria === category)
                && Number.isInteger(item.grupo)
                && item.grupo > 0
              )
              .map((item) => item.grupo),
          );
        }

        function intersecao(...sets) {
          if (!sets.length) return [];

          return [...sets[0]].filter(
            (value) => sets.every((set) => set.has(value)),
          );
        }

        const templateGroups = grupos(templatesDoTema);
        const periodGroups = grupos(
          periodsDoTema,
          context.periodCategory,
        );

        const requiredSets = [
          templateGroups,
          periodGroups,
        ];

        if (clima?.categoria) {
          requiredSets.push(
            grupos(climatesDoTema, clima.categoria),
          );
        }

        let completeGroups;

        if (context.isWeekend) {
          const exactGroups = intersecao(
            ...requiredSets,
            grupos(weekdaysDoTema, selectedWeekdayCategory),
          );

          const weekendGroups = intersecao(
            ...requiredSets,
            grupos(weekdaysDoTema, 'Fim de semana'),
          );

          completeGroups = [
            ...new Set([
              ...exactGroups,
              ...weekendGroups,
            ]),
          ].sort((a, b) => a - b);
        } else {
          completeGroups = intersecao(
            ...requiredSets,
            grupos(weekdaysDoTema, selectedWeekdayCategory),
          );
        }

        const usesGroups =
          templateGroups.size > 0;

        if (usesGroups && !completeGroups.length) {
          throw new CatalogSelectionError(
            'variation-group',
            `${selectedTheme}:${context.periodCategory}:${selectedWeekdayCategory}`,
          );
        }

        if (completeGroups.length) {
          const rotationTemplates = templatesDoTema.filter(
            (item) => completeGroups.includes(item.grupo),
          );

          /*
           * Rotação sem repetição:
           *
           * Com N grupos disponíveis, nenhum dos últimos N-1 grupos
           * usados neste Tema pode ser escolhido novamente.
           *
           * Exemplo com grupos 1..5:
           * uma família só volta depois que as outras quatro passaram.
           *
           * O histórico vem de music_requests, portanto sobrevive
           * a restart do PM2.
           */
          const recentIds = await recentTemplateIds(
            musicRequestRepository,
            {
              userId: input.telegram_user_id,
              chatId: input.telegram_chat_id,
              templateIds: rotationTemplates.map((item) => item.id),
              limit: Math.max(0, completeGroups.length - 1),
            },
          );

          const groupByTemplateId = new Map(
            rotationTemplates.map((item) => [item.id, item.grupo]),
          );

          const recentGroups = new Set(
            recentIds
              .map((id) => groupByTemplateId.get(id))
              .filter((group) => Number.isInteger(group)),
          );

          const unusedGroups = completeGroups.filter(
            (group) => !recentGroups.has(group),
          );

          const selectableGroups = unusedGroups.length
            ? unusedGroups
            : completeGroups;

          selectedGroup = detectGroup(
            rotationTemplates.filter(
              (item) => selectableGroups.includes(item.grupo),
            ),
            {
              telegramUpdateId: input.telegram_update_id,
              catalogType: 'template',
            },
          );

          if (clima?.categoria) {
            clima = select(catalogSelector, {
              items: climatesDoTema.filter(
                (item) => item.grupo === selectedGroup,
              ),
              telegramUpdateId: input.telegram_update_id,
              catalogType: 'climate',
              category: clima.categoria,
            });
          }
        }
      } else {
        selectedGroup =
          Number.isInteger(clima?.grupo) && clima.grupo > 0
            ? clima.grupo
            : detectGroup(templatesDoTema, {
                telegramUpdateId: input.telegram_update_id,
                catalogType: 'template',
              });
      }

      function itensDoGrupo(items) {
        const itemsDoTema = itensDoTema(items);

        if (selectedGroup == null) {
          return itemsDoTema;
        }

        return itemsDoTema.filter(
          (item) => item.grupo === selectedGroup,
        );
      }

      let template;

      if (input.template_id) {
        template = ensureManualItem(
          await findCatalog(
            catalogRepository,
            'template',
            input.template_id,
          ),
          'template',
          input.template_id,
        );
      } else {
        const templates = itensDoGrupo(
          await listCatalog(catalogRepository, 'template'),
        );

        template = select(catalogSelector, {
          items: templates,
          telegramUpdateId: input.telegram_update_id,
          catalogType: 'template',
        });
      }

      let style;

      if (input.style_id) {
        style = ensureManualItem(
          await findCatalog(
            catalogRepository,
            'style',
            input.style_id,
          ),
          'style',
          input.style_id,
        );
      } else {
        const styles = await listCatalog(
          catalogRepository,
          'style',
        );

        style = select(catalogSelector, {
          items: styles,
          telegramUpdateId: input.telegram_update_id,
          catalogType: 'style',
        });
      }

      let periodo;

      if (input.period_id) {
        periodo = ensureManualItem(
          await findCatalog(
            catalogRepository,
            'period',
            input.period_id,
          ),
          'period',
          input.period_id,
        );
      } else {
        const periods = itensDoGrupo(
          await listCatalog(catalogRepository, 'period'),
        );

        periodo = select(catalogSelector, {
          items: periods,
          telegramUpdateId: input.telegram_update_id,
          catalogType: 'period',
          category: context.periodCategory,
        });
      }

      let dia;

      if (input.weekday_id) {
        dia = ensureManualItem(
          await findCatalog(
            catalogRepository,
            'weekday',
            input.weekday_id,
          ),
          'weekday',
          input.weekday_id,
        );
      } else {
        const weekdays = itensDoGrupo(
          await listCatalog(catalogRepository, 'weekday'),
        );

        if (context.isWeekend) {
          const categoriasDisponiveis = [
            selectedWeekdayCategory,
            'Fim de semana',
          ].filter((categoria, index, array) =>
            array.indexOf(categoria) === index
            && weekdays.some(
              (item) => item.categoria === categoria,
            )
          );

          if (!categoriasDisponiveis.length) {
            throw new CatalogSelectionError(
              'weekday',
              selectedWeekdayCategory,
            );
          }

          const categorySeedItems = categoriasDisponiveis.map(
            (categoria, index) => ({
              id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
              active: true,
              categoria,
              texto: categoria,
            }),
          );

          const categoriaEscolhida = select(catalogSelector, {
            items: categorySeedItems,
            telegramUpdateId: input.telegram_update_id,
            catalogType: 'weekday',
          }).categoria;

          dia = select(catalogSelector, {
            items: weekdays,
            telegramUpdateId: input.telegram_update_id,
            catalogType: 'weekday',
            category: categoriaEscolhida,
          });
        } else {
          dia = select(catalogSelector, {
            items: weekdays,
            telegramUpdateId: input.telegram_update_id,
            catalogType: 'weekday',
            category: selectedWeekdayCategory,
          });
        }
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

export async function prepareMusicRequestWithStyle({ preparationService, catalogRepository }, rawInput, styleId) {
  if (typeof preparationService?.prepare !== 'function') throw new TypeError('preparationService.prepare is required');
  validateCatalogRepository(catalogRepository);
  const style = ensureManualItem(await findCatalog(catalogRepository, 'style', styleId), 'style', styleId);
  return preparationService.prepare({ ...rawInput, selection_mode: 'automatic', style_id: style.id });
}

export async function prepareCustomizedMusicRequest({ preparationService }, rawInput, selections) {
  if (typeof preparationService?.prepare !== 'function') throw new TypeError('preparationService.prepare is required');
  return preparationService.prepare({ ...rawInput, selection_mode: 'manual', template_id: selections.templateId, style_id: selections.styleId, climate_id: selections.climateId, period_id: selections.periodId, weekday_id: selections.weekdayId, weather_status: 'applied', weather_summary: selections.weatherSummary, weather_provider: null });
}
