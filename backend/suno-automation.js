import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(__dirname, '..', 'browser-profile');

const SUNO_CREATE_URL = 'https://suno.com/create';
const SUNO_HOME_URL = 'https://suno.com';

const MAX_WAIT_MINUTES = 5;
const POLL_INTERVAL_MS = 5000;

const CHROMIUM_CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/local/bin/chromium',
  '/snap/bin/chromium',
].filter(Boolean);

function findChromium() {
  for (const candidate of CHROMIUM_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) {
        log(`Using Chromium at: ${candidate}`);
        return candidate;
      }
    } catch {}
  }
  log('No system Chromium found, falling back to Playwright bundled browser');
  return undefined;
}

let activeBrowser = null;
let activePage = null;

function log(msg) {
  console.log(`[Suno-Auto] ${msg}`);
}

export async function isLoggedIn(page) {
  try {
    await page.goto(SUNO_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    const loginButton = await page.$('button:has-text("Log In"), button:has-text("Sign In"), a:has-text("Log In"), a:has-text("Sign In")');
    if (loginButton) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function launchBrowser({ headless = true } = {}) {
  log(`Launching browser (headless=${headless})...`);
  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    executablePath: findChromium(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,900',
    ],
  });
  activeBrowser = browser;
  const pages = browser.pages();
  activePage = pages.length > 0 ? pages[0] : await browser.newPage();
  return { browser, page: activePage };
}

export async function closeBrowser() {
  if (activeBrowser) {
    try {
      await activeBrowser.close();
    } catch (e) {
      log(`Error closing browser: ${e.message}`);
    }
    activeBrowser = null;
    activePage = null;
  }
}

async function setEditorMode(page) {
  try {
    const customToggle = await page.$('button:has-text("Custom"), [aria-label*="Custom"], div:has-text("Custom") >> button');
    if (customToggle) {
      const isCustom = await page.$('button:has-text("Custom").bg-\[#1a1a1a\], button:has-text("Custom")[style*="background"]');
      if (!isCustom) {
        await customToggle.click();
        await page.waitForTimeout(1000);
        log('Switched to Custom mode');
      }
    }
  } catch {
    log('Could not toggle Custom mode (may already be in custom)');
  }
}

async function fillLyrics(page, lyrics) {
  log('Filling lyrics...');
  const textarea = await page.$('textarea:has-text("Enter lyrics here"), textarea[placeholder*="lyrics" i], textarea[placeholder*="Enter lyrics" i], textarea');
  if (!textarea) {
    throw new Error('Lyrics textarea not found');
  }
  await textarea.click();
  await textarea.fill('');
  await page.waitForTimeout(200);
  await textarea.fill(lyrics);
  await page.waitForTimeout(300);
  log('Lyrics filled');
}

async function fillStyle(page, tags) {
  log('Filling style tags...');
  const styleInput = await page.$('input[placeholder*="Style" i], input[placeholder*="tag" i], textarea[placeholder*="Style" i], textarea[placeholder*="tag" i]');
  if (!styleInput) {
    log('Style input not found - trying alternative selectors');
    const allInputs = await page.$$('input[type="text"], textarea');
    if (allInputs.length > 1) {
      await allInputs[allInputs.length - 1].click();
      await allInputs[allInputs.length - 1].fill(tags);
      log('Style filled via fallback');
      return;
    }
    throw new Error('Style input not found');
  }
  await styleInput.click();
  await styleInput.fill('');
  await page.waitForTimeout(200);
  await styleInput.fill(tags);
  await page.waitForTimeout(300);
  log('Style filled');
}

async function fillTitle(page, title) {
  log('Filling title...');
  const titleInput = await page.$('input[placeholder*="Title" i], input[placeholder*="title" i], textarea[placeholder*="Title" i]');
  if (titleInput) {
    await titleInput.click();
    await titleInput.fill('');
    await page.waitForTimeout(200);
    await titleInput.fill(title);
    log('Title filled');
  } else {
    log('Title input not found (skipping)');
  }
}

async function clickCreate(page) {
  log('Clicking Create button...');
  const createBtn = await page.$('button:has-text("Create"), button:has-text("Generate"), button:has-text("Create Music")');
  if (!createBtn) {
    throw new Error('Create button not found');
  }
  await createBtn.click();
  log('Create clicked');
}

async function waitForSongAndExtractLink(page, onProgress) {
  log('Waiting for song generation...');

  const maxMs = MAX_WAIT_MINUTES * 60 * 1000;
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < maxMs) {
    await page.waitForTimeout(POLL_INTERVAL_MS);

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    try {
      const pageContent = await page.content();

      if (pageContent.includes('Complete') || pageContent.includes('Ready') || pageContent.includes('Published')) {
        log(`Song appears ready at ${timeStr}`);
        const link = await extractShareLink(page);
        if (link) {
          if (onProgress) onProgress(`Música pronta! Extraindo link...`);
          return link;
        }
      }

      const shareBtn = await page.$('button:has-text("Share"), a:has-text("Share"), [aria-label*="Share" i]');
      if (shareBtn) {
        log(`Share button found at ${timeStr}`);
        const link = await extractShareLink(page);
        if (link) {
          if (onProgress) onProgress(`Música pronta! Extraindo link...`);
          return link;
        }
      }

      const songLinks = await page.$$eval('a[href*="/song/"]', links =>
        links.map(l => l.href).filter(href => /\/song\/[a-zA-Z0-9-]+/.test(href))
      );
      if (songLinks.length > 0) {
        const cleanLink = songLinks[0].split('?')[0];
        log(`Song link found in DOM at ${timeStr}: ${cleanLink}`);
        if (onProgress) onProgress(`Música pronta! Link encontrado.`);
        return cleanLink;
      }

      const currentStatus = `Gerando... ${timeStr}`;
      if (currentStatus !== lastStatus) {
        log(currentStatus);
        if (onProgress) onProgress(currentStatus);
        lastStatus = currentStatus;
      }
    } catch (err) {
      log(`Polling error (continuing): ${err.message}`);
    }
  }

  throw new Error(`Song generation timed out after ${MAX_WAIT_MINUTES} minutes`);
}

async function extractShareLink(page) {
  try {
    const shareBtn = await page.$('button:has-text("Share"), a:has-text("Share"), [aria-label*="Share" i]');
    if (!shareBtn) return null;

    await shareBtn.click();
    await page.waitForTimeout(1500);

    const copyBtn = await page.$('button:has-text("Copy"), button:has-text("Copy Link"), [aria-label*="Copy" i]');
    if (copyBtn) {
      await copyBtn.click();
      await page.waitForTimeout(500);
    }

    const linkInput = await page.$('input[readonly], input[type="text"][value*="suno"], input[type="url"], textarea[readonly]');
    if (linkInput) {
      const value = await linkInput.inputValue();
      if (value && value.includes('suno')) {
        log(`Share link extracted: ${value}`);
        return value.split('?')[0];
      }
    }

    const allInputs = await page.$$('input');
    for (const input of allInputs) {
      const val = await input.inputValue().catch(() => '');
      if (val && val.includes('suno') && (val.includes('/song/') || val.includes('/share/'))) {
        log(`Share link found via scan: ${val}`);
        return val.split('?')[0];
      }
    }

    const pageUrl = page.url();
    if (pageUrl.includes('/song/')) {
      log(`Using page URL as share link: ${pageUrl}`);
      return pageUrl.split('?')[0];
    }

    return null;
  } catch (err) {
    log(`extractShareLink error: ${err.message}`);
    return null;
  }
}

export async function generateSong({ lyrics, tags, title, onProgress, headless }) {
  let browser, page;

  try {
    if (onProgress) onProgress('Abrindo navegador...');
    const launched = await launchBrowser({ headless });
    browser = launched.browser;
    page = launched.page;

    if (onProgress) onProgress('Verificando login no Suno...');
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      if (onProgress) onProgress('Sessão expirada! Abrindo navegador para login manual...');
      log('Not logged in - opening visible browser for manual login');
      await closeBrowser();
      const visibleLaunched = await launchBrowser({ headless: false });
      browser = visibleLaunched.browser;
      page = visibleLaunched.page;
      await page.goto(SUNO_HOME_URL, { waitUntil: 'domcontentloaded' });
      if (onProgress) onProgress('Faça login no Suno. Aguardando...');
      log('Waiting for manual login (up to 5 minutes)...');

      const loginDeadline = Date.now() + 5 * 60 * 1000;
      while (Date.now() < loginDeadline) {
        await page.waitForTimeout(5000);
        const stillLogin = await page.$('button:has-text("Log In"), a:has-text("Log In")');
        if (!stillLogin) {
          log('Login detected!');
          break;
        }
      }

      const nowLoggedIn = await isLoggedIn(page);
      if (!nowLoggedIn) {
        throw new Error('Login não realizado dentro do tempo limite');
      }
      if (onProgress) onProgress('Login OK! Continuando...');
    }

    if (onProgress) onProgress('Navegando para a página de criação...');
    await page.goto(SUNO_CREATE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    if (onProgress) onProgress('Configurando modo Custom...');
    await setEditorMode(page);

    if (onProgress) onProgress('Preenchendo letra...');
    await fillLyrics(page, lyrics);

    if (onProgress) onProgress('Preenchendo estilo...');
    await fillStyle(page, tags);

    if (onProgress) onProgress('Preenchendo título...');
    await fillTitle(page, title || `Para Passageiro`);

    if (onProgress) onProgress('Clicando em Criar...');
    await clickCreate(page);

    if (onProgress) onProgress('Aguardando geração da música...');
    const shareLink = await waitForSongAndExtractLink(page, onProgress);

    log(`Done! Share link: ${shareLink}`);
    return { success: true, shareLink };
  } catch (error) {
    log(`Error: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await closeBrowser();
  }
}
