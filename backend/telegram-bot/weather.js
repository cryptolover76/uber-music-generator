const WMO_CATEGORIES = Object.freeze(new Map([
  [0, 'Ensolarado'], [1, 'Ensolarado'], [2, 'Nublado'], [3, 'Nublado'], [45, 'Nublado'], [48, 'Nublado'],
]));

export function weatherCategoryForCode(code) {
  if (!Number.isInteger(code)) return null;
  if (WMO_CATEGORIES.has(code)) return WMO_CATEGORIES.get(code);
  return code >= 51 && code <= 99 ? 'Chuvoso' : null;
}

function finite(value) { return typeof value === 'number' && Number.isFinite(value); }

export function createWeatherService({ fetchImpl = globalThis.fetch, timeoutMs = 2500 } = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is required');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new TypeError('timeoutMs must be positive');
  return Object.freeze({
    async current(location) {
      if (!finite(location?.latitude) || !finite(location?.longitude)) return null;
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', String(location.latitude));
      url.searchParams.set('longitude', String(location.longitude));
      url.searchParams.set('current', 'temperature_2m,apparent_temperature,precipitation,weather_code,is_day');
      url.searchParams.set('timezone', 'America/Sao_Paulo');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response?.ok) return null;
        const payload = await response.json();
        const current = payload?.current;
        const category = weatherCategoryForCode(current?.weather_code);
        if (!category || !finite(current?.temperature_2m) || !finite(current?.apparent_temperature) || !finite(current?.precipitation) || ![0, 1].includes(current?.is_day)) return null;
        return Object.freeze({
          category,
          summary: `${category}; temperatura ${current.temperature_2m} °C; sensação ${current.apparent_temperature} °C; precipitação ${current.precipitation} mm; ${current.is_day ? 'dia' : 'noite'}`,
        });
      } catch { return null; }
      finally { clearTimeout(timer); }
    },
  });
}
