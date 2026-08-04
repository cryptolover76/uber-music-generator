import { normalizePassengerName } from '../music-preparation/validation.js';

export function parseMusicCommand(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/^\/musica(?:@[A-Za-z0-9_]+)?\s+(.+?)(?:\s*\|\s*([MFN]))?\s*$/iu);
  if (!match) return null;
  return { passengerName: normalizePassengerName(match[1]), gender: match[2]?.toUpperCase() ?? null };
}

export function callbackDataBytes(value) {
  return Buffer.byteLength(value, 'utf8');
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

export function splitCopyText(text, limit = 256) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isInteger(limit) || limit < 1 || limit > 256) throw new TypeError('copy_text limit must be between 1 and 256');
  const chunks = [];
  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
  let remaining = Array.from(segmenter.segment(text), ({ segment }) => segment);
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    let cut = -1;
    for (let index = window.length - 1; index > 0; index -= 1) {
      if (window[index - 1] === '\n' && window[index] === '\n') { cut = index + 1; break; }
    }
    if (cut < 1) cut = window.lastIndexOf('\n') + 1;
    if (cut < 1) {
      for (let index = window.length - 1; index > 0; index -= 1) {
        if (/\s/u.test(window[index])) { cut = index + 1; break; }
      }
    }
    if (cut < 1) cut = limit;
    chunks.push(remaining.slice(0, cut).join(''));
    remaining = remaining.slice(cut);
  }
  if (remaining.length || chunks.length === 0) chunks.push(remaining.join(''));
  return chunks;
}
