// Makes the 1280x800 store screenshots on a neutral demo chat page (test/site/demo.html).
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), EXT = path.join(ROOT, 'dist', 'chrome'), SITE = path.join(__dirname, 'site'), OUT = path.join(ROOT, 'store');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
(async () => {
  const ctx = await chromium.launchPersistentContext('/tmp/pg-shots-' + Date.now(), {
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, viewport: { width: 1280, height: 800 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox'], permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('https://chat.almma.ai/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    const f = path.join(SITE, p === '/' ? 'demo.html' : p.slice(1));
    route.fulfill({ status: fs.existsSync(f) ? 200 : 404, contentType: types[path.extname(f)], body: fs.existsSync(f) ? fs.readFileSync(f) : '' });
  });
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto('https://chat.almma.ai/'); await page.waitForTimeout(500);
  const text = 'Draft feedback for Jordan Ellis (student ID 20481937, DOB March 3, 2004).\nCopy Dr. Maria de la Cruz, and reply to j.ellis@uni.edu or (555) 123-4567.';
  await page.evaluate((t) => navigator.clipboard.writeText(t), text);
  await page.click('#prompt-textarea'); await page.keyboard.press('Control+V'); await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'raw', 'review.png') });
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.keyboard.type('Ask Jordan Ellis to email me from j.ellis@uni.edu about the March 3, 2024 lab');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, 'raw', 'typing.png') });
  // set up a key so "show originals" has something to restore
  await sw.evaluate(() => globalThis.__piiGuard.tokensFor([{ type: 'NAME', text: 'Jordan Ellis' }, { type: 'NUMBER', text: '(555) 123-4567' }, { type: 'NAME', text: 'Dr. Maria de la Cruz' }], true));
  await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
  await page.evaluate(() => { const p = document.getElementById('reply'); const r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true })); });
  const tabId = await sw.evaluate(async () => Math.max(...(await chrome.tabs.query({})).map((t) => t.id)));
  await sw.evaluate(([id]) => globalThis.__piiGuard.handleMenuClick({ menuItemId: 'pii-guard-show', selectionText: 'x', frameId: 0 }, { id }), [tabId]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, 'raw', 'originals.png') });
  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/options.html`); await opt.waitForTimeout(600);
  await opt.screenshot({ path: path.join(OUT, 'raw', 'settings.png') });
  await ctx.close();
  console.log('screenshots written to store/');
})();
