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

export function graphemeLength(text) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
  return Array.from(segmenter.segment(text)).length;
}

export function splitPreformattedText(text, escapedLimit = 3800) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (!Number.isInteger(escapedLimit) || escapedLimit < 16) throw new TypeError('escapedLimit must be at least 16');
  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
  const units = Array.from(segmenter.segment(text), ({ segment }) => segment);
  if (units.length === 0) return [''];
  const prefix = [0];
  for (const unit of units) prefix.push(prefix.at(-1) + escapeHtml(unit).length);
  const maxEnd = (start) => {
    let low = start + 1; let high = units.length; let result = start;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (prefix[middle] - prefix[start] <= escapedLimit) { result = middle; low = middle + 1; } else high = middle - 1;
    }
    if (result === start) throw new RangeError('escapedLimit cannot fit one grapheme');
    return result;
  };
  const blocksFrom = (start) => { let count = 0; while (start < units.length) { start = maxEnd(start); count += 1; } return count; };
  const chunks = [];
  let start = 0;
  while (start < units.length) {
    const furthest = maxEnd(start);
    if (furthest === units.length) { chunks.push(units.slice(start).join('')); break; }
    const remainingBlocks = blocksFrom(furthest);
    const findPreferredCut = (paragraphsOnly) => {
      for (let candidate = furthest - 1; candidate > start; candidate -= 1) {
        const isParagraph = units[candidate - 1] === '\n' && units[candidate] === '\n';
        const isLine = units[candidate - 1] === '\n';
        if ((paragraphsOnly ? isParagraph : isLine) && blocksFrom(candidate) === remainingBlocks) return candidate;
      }
      return null;
    };
    const cut = findPreferredCut(true) ?? findPreferredCut(false) ?? furthest;
    chunks.push(units.slice(start, cut).join(''));
    start = cut;
  }
  return chunks;
}
