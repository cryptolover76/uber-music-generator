import { randomUUID } from 'node:crypto';
import { DuplicateTelegramUpdateError } from '../../backend/music-preparation/validation.js';

export function createBarrier(parties = 2) {
  if (!Number.isInteger(parties) || parties < 1) throw new TypeError('parties must be a positive integer');
  let arrivals = 0;
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  return Object.freeze({
    async wait() {
      arrivals += 1;
      if (arrivals >= parties) release();
      await released;
    },
    get arrivals() { return arrivals; },
  });
}

export function createFakeCatalogRepository(catalogs = {}) {
  const values = new Map(Object.entries(catalogs).map(([type, items]) => [type, items.map((item) => ({ ...item }))]));
  const calls = [];
  return {
    calls,
    async list(type) {
      calls.push({ method: 'list', type });
      return (values.get(type) ?? []).map((item) => ({ ...item }));
    },
    async findById(type, id) {
      calls.push({ method: 'findById', type, id });
      const item = (values.get(type) ?? []).find((candidate) => candidate.id === id);
      return item ? { ...item } : null;
    },
  };
}

export function createFakeMusicRequestRepository(initialRows = [], options = {}) {
  const rows = initialRows.map((row) => ({ ...row }));
  let insertCount = 0;
  let insertAttempts = 0;
  return {
    rows,
    get insertCount() { return insertCount; },
    get insertAttempts() { return insertAttempts; },
    async findByTelegramUpdateId(updateId) {
      const row = rows.find((candidate) => candidate.telegram_update_id === updateId);
      return row ? { ...row } : null;
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

      const allowed = new Set(templateIds);

      return rows
        .filter((row) =>
          row.telegram_user_id === userId
          && row.telegram_chat_id === chatId
          && allowed.has(row.template_id)
        )
        .slice()
        .sort((a, b) =>
          new Date(b.created_at || 0).getTime()
          - new Date(a.created_at || 0).getTime()
        )
        .slice(0, limit)
        .map((row) => row.template_id);
    },
    async insert(row) {
      insertAttempts += 1;
      if (options.insertBarrier) await options.insertBarrier.wait();
      if (options.insertError) throw options.insertError;
      if (rows.some((candidate) => candidate.telegram_update_id === row.telegram_update_id)) {
        throw new DuplicateTelegramUpdateError(row.telegram_update_id);
      }
      insertCount += 1;
      const persisted = { id: randomUUID(), ...row };
      rows.push(persisted);
      return { ...persisted };
    },
  };
}
