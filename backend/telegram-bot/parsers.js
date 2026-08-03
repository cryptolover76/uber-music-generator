import { normalizePassengerName } from '../music-preparation/validation.js';

export function parseMusicCommand(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/^\/musica(?:@[A-Za-z0-9_]+)?\s+(.+?)\s*\|\s*([MFN])\s*$/iu);
  if (!match) return null;
  return { passengerName: normalizePassengerName(match[1]), gender: match[2].toUpperCase() };
}

export function parseSunoLink(text) {
  if (typeof text !== 'string' || text !== text.trim() || /\s|@/u.test(text)) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:' || !(url.hostname === 'suno.com' || url.hostname.endsWith('.suno.com'))) return null;
    if (url.username || url.password || url.port || url.search || url.hash) return null;
    return `https://${url.hostname.toLowerCase()}${url.pathname}`;
  } catch {
    return null;
  }
}

export function splitTelegramText(text, limit = 4096) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('limit must be positive');
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < Math.floor(limit / 2)) cut = rest.lastIndexOf(' ', limit);
    if (cut < 1) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/u, '');
  }
  if (rest || chunks.length === 0) chunks.push(rest);
  return chunks;
}

export function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
