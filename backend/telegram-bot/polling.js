export function createLongPoller({ api, processUpdate, logger = console, baseBackoffMs = 500, maxBackoffMs = 10000 }) {
  let running = false; let controller; let task;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  function safeValue(value) {
    if (typeof value !== 'string') return value;
    return value
      .replace(/https:\/\/api\.telegram\.org\/bot[^/\s]+/giu, 'https://api.telegram.org/bot[REDACTED]')
      .replace(/\b(token|authorization|api[_-]?key|service[_-]?role[_-]?key)\s*[:=]\s*[^\s,;]+/giu, '$1=[REDACTED]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, '[REDACTED]')
      .slice(0, 500);
  }
  function diagnostic(error) {
    const details = {
      name: safeValue(error?.name), code: safeValue(error?.code), message: safeValue(error?.message),
      causeCode: safeValue(error?.cause?.code), causeMessage: safeValue(error?.cause?.message),
      nestedCauseCode: safeValue(error?.cause?.cause?.code), nestedCauseMessage: safeValue(error?.cause?.cause?.message),
    };
    return Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined));
  }
  async function loop() {
    let offset = 0; let backoff = baseBackoffMs;
    while (running) {
      controller = new AbortController();
      let phase = 'buscar updates';
      try {
        const updates = await api.getUpdates({ offset, timeout: 30, signal: controller.signal });
        backoff = baseBackoffMs;
        phase = 'processar update';
        for (const update of updates) {
          if (!running) break;
          await processUpdate(update);
          offset = Math.max(offset, Number(update.update_id) + 1);
        }
      } catch (error) {
        if (!running && error?.name === 'AbortError') break;
        logger.error(`[Telegram polling] falha ao ${phase}; nova tentativa`, diagnostic(error));
        await wait(backoff); backoff = Math.min(maxBackoffMs, backoff * 2);
      }
    }
  }
  return Object.freeze({
    start() { if (running) return task; running = true; task = loop(); return task; },
    async stop() { running = false; controller?.abort(); await task; },
    get running() { return running; },
  });
}
