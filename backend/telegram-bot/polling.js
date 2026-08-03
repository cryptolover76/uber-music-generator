export function createLongPoller({ api, processUpdate, logger = console, baseBackoffMs = 500, maxBackoffMs = 10000 }) {
  let running = false; let controller; let task;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function loop() {
    let offset = 0; let backoff = baseBackoffMs;
    while (running) {
      controller = new AbortController();
      try {
        const updates = await api.getUpdates({ offset, timeout: 30, signal: controller.signal });
        backoff = baseBackoffMs;
        for (const update of updates) {
          if (!running) break;
          await processUpdate(update);
          offset = Math.max(offset, Number(update.update_id) + 1);
        }
      } catch (error) {
        if (!running && error?.name === 'AbortError') break;
        logger.error('[Telegram polling] erro temporário; nova tentativa');
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
