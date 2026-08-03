import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => entry.isDirectory()
    ? sourceFiles(`${directory}/${entry.name}`)
    : [`${directory}/${entry.name}`]));
  return nested.flat();
}

test('produção não referencia automação antiga e rota importa sem Playwright', async () => {
  const files = (await Promise.all(['backend', 'config', 'frontend', 'shared'].map(sourceFiles))).flat();
  const forbidden = /playwright|suno-automation|SUNO_COOKIE|CHROMIUM_PATH|RapidAPI|localhost:8000/iu;
  for (const file of files) assert.doesNotMatch(await readFile(file, 'utf8'), forbidden, file);
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(packageJson.dependencies?.playwright, undefined);
  await assert.doesNotReject(import('../backend/routes/music.js'));
});
