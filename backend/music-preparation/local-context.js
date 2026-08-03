export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const WEEKDAYS = Object.freeze({
  Mon: 'Segunda',
  Tue: 'Terça',
  Wed: 'Quarta',
  Thu: 'Quinta',
  Fri: 'Sexta',
  Sat: 'Sábado',
  Sun: 'Domingo',
});

export function periodForHour(hour) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError('hour must be an integer between 0 and 23');
  }
  if (hour >= 5 && hour < 12) return 'Manhã';
  if (hour >= 12 && hour < 17) return 'Tarde';
  if (hour >= 17 && hour < 19) return 'Fim de tarde';
  return 'Noite';
}

export function getLocalContext(value, timezone = DEFAULT_TIMEZONE) {
  const instant = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(instant.getTime())) throw new TypeError('A valid date is required');

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant).filter(({ type }) => type !== 'literal').map(({ type, value: part }) => [type, part])
  );

  const weekday = WEEKDAYS[parts.weekday];
  const hour = Number(parts.hour);
  return Object.freeze({
    timezone,
    instant,
    localDatetime: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${parts.hour}:${parts.minute}:${parts.second}`,
    localWeekday: weekday,
    localPeriod: periodForHour(hour),
    weekdayCategory: weekday,
    periodCategory: periodForHour(hour),
    isWeekend: weekday === 'Sábado' || weekday === 'Domingo',
  });
}

export const calculateLocalContext = getLocalContext;
