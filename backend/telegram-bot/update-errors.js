const PERMANENT_CODES = new Set([
  'CATALOG_NOT_FOUND', 'INVALID_CATALOG', 'TELEGRAM_UPDATE_CONFLICT',
  'INVALID_PASSENGER_NAME', 'INVALID_PASSENGER_GENDER', 'INVALID_SELECTION_MODE',
  'AUTOMATIC_MODE_REJECTS_MANUAL_IDS',
]);
const PERMANENT_MESSAGES = [
  /Pedido nao encontrado/u, /Pedido em estado invalido/u, /Pedido ja possui outro link/u,
  /link Suno ja (?:esta|está) associado/u, /Link Suno HTTPS invalido/u,
  /Configuracao diaria de cota divergente/u,
];

export class TelegramUpdateLeaseError extends Error {
  constructor() { super('Telegram update is already processing'); this.name = 'TelegramUpdateLeaseError'; this.code = 'TELEGRAM_UPDATE_LEASE_ACTIVE'; }
}

export function isPermanentUpdateError(error) {
  const codes = [error?.code, error?.cause?.code, error?.cause?.cause?.code];
  if (codes.some((code) => typeof code === 'string' && (PERMANENT_CODES.has(code) || code.startsWith('INVALID_')))) return true;
  const messages = [error?.message, error?.cause?.message, error?.cause?.cause?.message].filter((value) => typeof value === 'string');
  return messages.some((message) => PERMANENT_MESSAGES.some((pattern) => pattern.test(message)));
}
