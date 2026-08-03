import { createHash } from 'node:crypto';
import { isUuid, MusicPreparationError } from './validation.js';

const REQUIRED_FIELDS = Object.freeze({
  template: ['letra', 'texto'],
  style: ['name', 'prompt'],
  period: ['texto'],
  weekday: ['texto'],
  climate: ['texto'],
});

export class CatalogSelectionError extends MusicPreparationError {
  constructor(catalogType, category = null) {
    super('CATALOG_NOT_FOUND', `No applicable ${catalogType} catalog item was found`, { catalogType, category });
    this.name = 'CatalogSelectionError';
  }
}

export class InvalidCatalogError extends MusicPreparationError {
  constructor(catalogType, reason, details = {}) {
    super('INVALID_CATALOG', 'Invalid ' + catalogType + ' catalog: ' + reason, { catalogType, reason, ...details });
    this.name = 'InvalidCatalogError';
  }
}

function hasContent(item, type) {
  const fields = REQUIRED_FIELDS[type] ?? [];
  if (type === 'template') {
    const selectedTemplateContent = item.letra || item.texto;
    return typeof selectedTemplateContent === 'string' && selectedTemplateContent.trim() !== '';
  }
  return fields.every((field) => typeof item[field] === 'string' && item[field].trim());
}

export function applicableCatalogItems(items, { catalogType, category } = {}) {
  if (!Array.isArray(items)) return [];
  const active = items.filter((item) => item?.active === true);
  const normalized = [];
  const ids = new Set();
  for (const item of active) {
    if (!isUuid(item.id)) throw new InvalidCatalogError(catalogType, 'id must be a valid UUID', { id: item.id ?? null });
    const id = item.id.toLowerCase();
    if (ids.has(id)) throw new InvalidCatalogError(catalogType, 'duplicate id after UUID normalization', { id });
    if (!hasContent(item, catalogType)) throw new InvalidCatalogError(catalogType, 'required content must be a non-empty string', { id });
    ids.add(id);
    if (category == null || item.categoria === category) normalized.push({ ...item, id });
  }
  return normalized;
}

export function selectCatalogItem({ items, telegramUpdateId, catalogType, category = null }) {
  const candidates = applicableCatalogItems(items, { catalogType, category })
    .slice().sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  if (!candidates.length) throw new CatalogSelectionError(catalogType, category);
  const digest = createHash('sha256').update(`${telegramUpdateId}:${catalogType}`, 'utf8').digest();
  const index = Number(digest.readBigUInt64BE(0) % BigInt(candidates.length));
  return candidates[index];
}

export function createCatalogSelector() {
  return { select: selectCatalogItem };
}

export const defaultCatalogSelector = Object.freeze({ select: selectCatalogItem });
