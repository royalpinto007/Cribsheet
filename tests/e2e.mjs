/**
 * End to end: the real extension, in a real Chrome, on a real page.
 *
 * The unit tests cover every detector. What they cannot cover is the part that
 * only exists in a browser: injecting into a page, a shadow root that survives
 * the page's own stylesheet, positioning against a selection, and the fact
 * that nothing leaves the tab.
 *
 * Needs Playwright with its Chromium: npx playwright install chromium
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 8795;

/*
 * A page with a hostile stylesheet.
 *
 * Every rule here is something a real site does and something that would wreck
 * a popover injected without a shadow root: resetting every element, forcing a
 * font, hiding overflow, and claiming the top of the z-index.
 */
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title>
<style>
  * { all: revert; font-family: cursive !important; color: #ff00ff !important; }
  div { display: none !important; }
  body { background: #222; }
  .over { position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; }
</style></head>
<body>
  <p id="stamp">1700000000</p>
  <p id="cron">0 3 * * 1-5</p>
  <p id="prose">the quick brown fox</p>
  <div class="over"></div>
</body></html>`;

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(PAGE);
});
await new Promise((r) => server.listen(PORT, r));

const profile = '/tmp/cribsheet-e2e-profile';
fs.rmSync(profile, { recursive: true, force: true });
const ctx = await chromium.launchPersistentContext(profile, {
  headless: false,
  args: ['--headless=new', `--disable-extensions-except=${DIR}`, `--load-extension=${DIR}`],
});

let [worker] = ctx.serviceWorkers();
if (!worker) worker = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(worker.url()).host;

const fail = [];
const ok = (label, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`);
  if (!cond) fail.push(label);
};

/** Read the sheet out of the shadow root, since the page cannot see into it. */
const readSheet = (page) =>
  page.evaluate(() => {
    const host = document.getElementById('__cribsheet');
    if (!host?.shadowRoot) return null;
    const sheet = host.shadowRoot.querySelector('.sheet');
    if (!sheet) return null;
    return {
      titles: [...sheet.querySelectorAll('.title')].map((t) => t.textContent),
      rows: [...sheet.querySelectorAll('.row')].map((r) => r.textContent),
      empty: sheet.querySelector('.empty')?.textContent ?? null,
      font: getComputedStyle(sheet).fontFamily,
      colour: getComputedStyle(sheet).color,
      display: getComputedStyle(sheet).display,
      box: sheet.getBoundingClientRect().toJSON(),
    };
  });

const select = async (page, selector) => {
  await page.evaluate((s) => {
    const el = document.querySelector(s);
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }, selector);
};

try {
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`http://localhost:${PORT}/`);

  /* The panel, injected the way the worker injects it. ---------------------- */

  await select(page, '#stamp');
  await page.addScriptTag({ path: path.join(DIR, 'dist/panel.js') });
  await page.evaluate(() => window.__cribsheetShow());
  await page.waitForTimeout(200);

  let sheet = await readSheet(page);
  ok('a sheet appears in the page', !!sheet);
  ok('it names the timestamp first', /Unix time in seconds/.test(sheet.titles[0] ?? ''));
  ok('and says how sure it is, in words', /certain|likely/.test(sheet.titles[0] ?? ''));
  ok(
    'the decoded date is there',
    sheet.rows.some((r) => r.includes('2023-11-14'))
  );
  ok('with the other honest readings below', sheet.titles.length >= 2);

  /* The page's stylesheet does not reach inside. ---------------------------- */

  ok('the page cannot force its font on the sheet', !/cursive/.test(sheet.font));
  ok('nor its colour', sheet.colour !== 'rgb(255, 0, 255)');
  // `div { display: none !important }` would erase a popover built without a
  // shadow root, and this fixture is the site where that happens.
  ok('nor hide it outright', sheet.display !== 'none');

  /* Positioning, against the selection and inside the window. --------------- */

  const view = page.viewportSize();
  ok(
    'the sheet sits inside the window',
    sheet.box.left >= 0 && sheet.box.top >= 0 && sheet.box.right <= view.width + 1
  );

  /* Cron, through the same path. -------------------------------------------- */

  await select(page, '#cron');
  await page.evaluate(() => window.__cribsheetShow());
  await page.waitForTimeout(150);
  sheet = await readSheet(page);
  ok(
    `cron reads as a sentence: "${(sheet.rows[0] ?? '').replace('Runs', '')}"`,
    sheet.rows.some((r) => r.includes('Monday to Friday') && r.includes('03:00'))
  );

  /* Prose gets a plain answer rather than a shrug. -------------------------- */

  await select(page, '#prose');
  await page.evaluate(() => window.__cribsheetShow());
  await page.waitForTimeout(150);
  sheet = await readSheet(page);
  ok('prose is told plainly that it is prose', /reads values, not prose/.test(sheet.empty ?? ''));

  /* Dismissal. -------------------------------------------------------------- */

  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  ok('Escape closes it', (await readSheet(page)) === null);

  await select(page, '#stamp');
  await page.evaluate(() => window.__cribsheetShow());
  await page.waitForTimeout(150);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(150);
  ok('a click elsewhere closes it', (await readSheet(page)) === null);

  /* Nothing left the tab. --------------------------------------------------- */

  const offsite = requests.filter((u) => !u.startsWith(`http://localhost:${PORT}`));
  ok(`no request went anywhere else (${requests.length} total)`, offsite.length === 0);
  if (offsite.length) console.log(offsite.join('\n'));

  /* The worker registered its menu and holds no page access. ---------------- */

  const perms = await worker.evaluate(() => chrome.permissions.getAll());
  ok('no host permissions are held', (perms.origins ?? []).length === 0);
  ok(
    'and none are even optional',
    !(await worker.evaluate(() => chrome.runtime.getManifest().optional_host_permissions))
  );

  /* The popup decodes without touching a page at all. ----------------------- */

  const popup = await ctx.newPage();
  const popupErrors = [];
  popup.on('pageerror', (e) => popupErrors.push(String(e)));
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.waitForSelector('#input');
  await popup.fill(
    '#input',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0IiwiZXhwIjoxNzAwMDAzNjAwfQ.c2ln'
  );
  await popup.waitForTimeout(200);

  const popupOut = await popup.evaluate(() => ({
    title: document.querySelector('.title')?.textContent ?? '',
    note: document.querySelector('.note')?.textContent ?? '',
    warned: document.querySelectorAll('.value.warn').length,
  }));
  ok('the popup decodes a token', /JSON Web Token/.test(popupOut.title));
  ok('says it is expired', /expired/.test(popupOut.title));
  ok('and warns that nothing was verified', /signature is not checked/.test(popupOut.note));
  ok('with the expiry flagged', popupOut.warned >= 1);
  ok('no script errors in the popup', popupErrors.length === 0);
  if (popupErrors.length) console.log(popupErrors.join('\n'));
} finally {
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  server.close();
}

console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
