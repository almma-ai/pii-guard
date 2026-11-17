const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'dist', 'chrome'), SITE = path.join(__dirname, 'site'), SHOTS = path.join(__dirname, 'shots');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const PW = process.env.PLAYWRIGHT_PATH || 'playwright';
fs.mkdirSync(SHOTS, { recursive: true });
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'";
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const FLAGGED = 'The student John Smith (ID 900123456) got 87.5.\nCall Dr. Maria de la Cruz at (555) 123-4567.';
const CLEAN_OUT = 'The student [NAME_1] (ID [ID_1]) got 87.5.\nCall [NAME_2] at [NUMBER_1].';
let pass = 0;
const ok = (c, msg) => { assert.ok(c, msg); pass++; console.log('  ok  ' + msg); };

(async () => {
  const { chromium } = require(PW);
  const ctx = await chromium.launchPersistentContext('/tmp/pg-profile-' + Date.now(), {
    executablePath: CHROME, headless: true, viewport: { width: 1000, height: 700 },
    args: ['--disable-extensions-except=' + EXT, '--load-extension=' + EXT, '--no-sandbox'],
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const requests = [];
  const serve = (file) => async (route) => {
    const u = new URL(route.request().url());
    const f = u.pathname === '/' || u.pathname === '/new' || u.pathname.startsWith('/c/') ? file : u.pathname.slice(1);
    const full = path.join(SITE, f);
    if (!fs.existsSync(full)) return route.fulfill({ status: 404, body: 'nf' });
    route.fulfill({ status: 200, contentType: types[path.extname(full)], body: fs.readFileSync(full), headers: { 'Content-Security-Policy': CSP } });
  };
  await ctx.route('https://claude.ai/**', serve('rich.html'));
  await ctx.route('https://chat.almma.ai/**', serve('plain.html'));
  ctx.on('request', (r) => requests.push(r.url()));
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;

  console.log('\nbackground worker');
  await new Promise((r) => setTimeout(r, 1000));
  const menuErr = await sw.evaluate(() => globalThis.__piiGuard.createMenus());
  ok(menuErr.length === 0, 'both right-click menu items are created without error ' + JSON.stringify(menuErr));
  ok((await sw.evaluate(() => globalThis.__piiGuard.cleanTerm(' "Solidcore," '))) === 'Solidcore', 'a selected word is cleaned of quotes and punctuation');

  for (const site of [
    { name: 'rich editor (stands in for claude.ai)', url: 'https://claude.ai/new', pattern: 'https://claude.ai/*', box: '.ProseMirror', send: '#send',
      read: (p) => p.evaluate(() => window.__editor.getText({ blockSeparator: '\n' })) },
    { name: 'React textarea (stands in for chat.almma.ai)', url: 'https://chat.almma.ai/c/new', pattern: 'https://chat.almma.ai/*', box: '#prompt-textarea', send: '#send-button',
      read: (p) => p.evaluate(() => window.__state) },
  ]) {
    console.log('\n' + site.name);
    const tag = site.box === '.ProseMirror' ? 'rich' : 'plain';
    await sw.evaluate(() => chrome.storage.local.set({ custom: [], ignore: [] }));   // lists are shared by all tabs
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(site.url);
    await page.waitForSelector(site.box);
    await page.waitForTimeout(300);
    const tabId = await sw.evaluate(async () => Math.max(...(await chrome.tabs.query({})).map((t) => t.id)));   // newest tab = this page
    ok(typeof tabId === 'number', 'background worker can address this tab');
    const panelOpen = () => page.evaluate(() => document.activeElement && document.activeElement.tagName === 'PII-GUARD-ROOT');
    const sent = () => page.evaluate(() => window.__sent.slice());
    const copy = (t) => page.evaluate((x) => navigator.clipboard.writeText(x), t);
    const clear = async () => { await page.click(site.box); await page.keyboard.press('Control+A'); await page.keyboard.press('Delete'); await page.evaluate(() => { window.__sent.length = 0; }); };
    const before = requests.length;

    // A-B paste, review, insert
    await copy(FLAGGED);
    await page.click(site.box);
    await page.keyboard.press('Control+V');
    await page.waitForTimeout(400);
    ok(await panelOpen(), 'paste of flagged text opens the review panel');
    ok((await site.read(page)) === '', 'the message box is still empty while the panel is open');
    await page.screenshot({ path: `${SHOTS}/${tag}-1-panel.png` });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    ok((await site.read(page)) === CLEAN_OUT, 'box holds the anonymized text; 87.5 left alone; same placeholders in every tab');
    await page.focus(site.box); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok((await sent())[0] === CLEAN_OUT, 'anonymized text sends normally on Enter');

    // keyboard: Ctrl+Enter keeps the original; Enter on the focused Cancel button cancels
    await clear();
    await copy('Ask Lena Fischer today');
    await page.click(site.box); await page.keyboard.press('Control+V'); await page.waitForTimeout(400);
    ok(await panelOpen(), 'panel open for the shortcut test');
    await page.keyboard.press('Control+Enter'); await page.waitForTimeout(400);
    ok(!(await panelOpen()) && (await site.read(page)) === 'Ask Lena Fischer today', 'Ctrl+Enter inserts the original unchanged');
    await clear();
    await copy('Ask Tomas Novak today');
    await page.click(site.box); await page.keyboard.press('Control+V'); await page.waitForTimeout(400);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok(!(await panelOpen()) && (await site.read(page)) === '', 'Enter on the focused Cancel button cancels (nothing inserted)');

    // C typed text
    await clear();
    await page.keyboard.type('Please email Priya Patel about invoice 4471 today');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SHOTS}/${tag}-3-typed-marks.png` });
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok((await sent()).length === 0 && (await panelOpen()), 'Enter with a typed name is stopped and the panel opens');
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    ok((await site.read(page)) === 'Please email [NAME_3] about invoice 4471 today', 'name replaced, 4-digit invoice number left alone');
    await page.focus(site.box); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok((await sent())[0] === 'Please email [NAME_3] about invoice 4471 today', 'second Enter sends it');

    // D cancel
    await clear();
    await page.keyboard.type('Room 204 with Ana Lima');
    await page.waitForTimeout(300);
    await page.click(site.send); await page.waitForTimeout(400);
    ok((await sent()).length === 0 && (await panelOpen()), 'clicking Send with flagged text is stopped');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    ok(!(await panelOpen()) && (await sent()).length === 0 && (await site.read(page)) === 'Room 204 with Ana Lima', 'Escape cancels; nothing sent, text unchanged');

    // E keep as is
    await clear();
    await copy('Meet Omar Haddad at 3');
    await page.click(site.box); await page.keyboard.press('Control+V'); await page.waitForTimeout(400);
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok((await site.read(page)) === 'Meet Omar Haddad at 3', '"insert original" inserts the text unchanged');
    await page.focus(site.box); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok((await sent())[0] === 'Meet Omar Haddad at 3', 'kept items are not asked about again');

    // F clean paste, short numbers
    await clear();
    await copy('room 204, 3 students, invoice 4471, score 87.5');
    await page.click(site.box); await page.keyboard.press('Control+V'); await page.waitForTimeout(300);
    ok(!(await panelOpen()) && (await site.read(page)) === 'room 204, 3 students, invoice 4471, score 87.5', 'short numbers paste straight in');

    // G mid-text paste
    await clear();
    await page.keyboard.type('start  end');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await copy('code 7771234');
    await page.keyboard.press('Control+V'); await page.waitForTimeout(400);
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    const mid = await site.read(page);
    ok(/^start\scode \[NUMBER_\d+\]\send$/.test(mid), 'mid-text paste lands at the caret: "' + mid + '"');

    // H right-click "always flag" (start with an empty list; it is shared by all tabs)
    await sw.evaluate(() => chrome.storage.local.set({ custom: [], ignore: [] }));
    await page.waitForTimeout(200);
    await clear();
    await page.keyboard.type('I train at solidcore weekly');
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    ok((await sent())[0] === 'I train at solidcore weekly', 'before adding: "solidcore" is not flagged');
    await clear();
    await page.keyboard.type('I train at solidcore weekly');
    await sw.evaluate(([id]) => globalThis.__piiGuard.handleMenuClick({ menuItemId: 'pii-guard-flag', selectionText: ' Solidcore, ', frameId: 0 }, { id }), [tabId]);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/${tag}-4-flag-added.png` });
    await page.focus(site.box); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok((await sent()).length === 0 && (await panelOpen()), 'after "always flag": the same text is stopped, any capitalization');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    // H2 right-click "never flag"; it also takes the term off the always-flag list
    await clear();
    await sw.evaluate(([id]) => globalThis.__piiGuard.handleMenuClick({ menuItemId: 'pii-guard-flag', selectionText: 'Priya', frameId: 0 }, { id }), [tabId]);
    await sw.evaluate(([id]) => globalThis.__piiGuard.handleMenuClick({ menuItemId: 'pii-guard-ignore', selectionText: 'Priya', frameId: 0 }, { id }), [tabId]);
    await sw.evaluate(([id]) => globalThis.__piiGuard.handleMenuClick({ menuItemId: 'pii-guard-ignore', selectionText: 'Boston.', frameId: 0 }, { id }), [tabId]);
    await page.waitForTimeout(500);
    const lists = await sw.evaluate(() => chrome.storage.local.get(['custom', 'ignore']));
    ok(JSON.stringify(lists) === JSON.stringify({ custom: ['Solidcore'], ignore: ['Priya', 'Boston'] }), 'never-flag moves "Priya" off the always list: ' + JSON.stringify(lists));
    await page.click(site.box);
    await page.keyboard.type('We met Priya in Boston');
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok((await sent())[0] === 'We met Priya in Boston' && !(await panelOpen()), 'never-flag words go through without a prompt');

    // HIPAA rules in the page
    await clear();
    await page.keyboard.type('seen at 123 Main Street on March 3, 2024, MRN A4471');
    await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    ok((await panelOpen()) && (await sent()).length === 0, 'address, date and MRN text is stopped');
    await page.keyboard.press('Enter'); await page.waitForTimeout(500);
    ok(/^seen at \[ADDRESS_\d+\] on \[DATE_\d+\], MRN \[ID_\d+\]$/.test(await site.read(page)), 'replaced with ADDRESS, DATE and ID placeholders: ' + (await site.read(page)));

    // I right-click "show originals" on a reply
    await clear();
    await page.evaluate(() => {
      let p = document.getElementById('reply');
      if (!p) { p = document.createElement('p'); p.id = 'reply'; document.body.appendChild(p); }
      p.textContent = 'AI reply: [NAME_1] scored well. Ask [NAME_2] to call [NUMBER_2]. Unknown: [NAME_99].';
      const r = document.createRange(); r.selectNodeContents(p);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      p.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await sw.evaluate(([id]) => globalThis.__piiGuard.handleMenuClick({ menuItemId: 'pii-guard-show', selectionText: 'x', frameId: 0 }, { id }), [tabId]);
    await page.waitForTimeout(600);
    ok(await panelOpen(), '"show originals" opens a panel');
    await page.screenshot({ path: `${SHOTS}/${tag}-5-originals.png` });
    ok(!(await page.evaluate(() => document.documentElement.innerText.includes('John Smith'))), 'restored names are not written into the page');
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);

    ok(errors.length === 0, 'no script errors on the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
    const during = requests.slice(before).filter((u) => !/\.(html|js|css)$|\/new$|\/c\/new$|favicon/.test(u));
    ok(during.length === 0, 'no network request of any kind' + (during.length ? ': ' + during.join(', ') : ''));
    await page.close();
  }

  console.log('\nbackground key and toolbar window');
  const r = await sw.evaluate(() => globalThis.__piiGuard.restore('[NAME_1] / [NAME_2] / [ID_1] / [NUMBER_1] / [NAME_3] / [NAME_99]'));
  const restored = r.parts.map((p) => p.plain !== undefined ? p.plain : (p.original === null ? p.token : p.original)).join('');
  ok(restored === 'John Smith / Dr. Maria de la Cruz / 900123456 / (555) 123-4567 / Priya Patel / [NAME_99]', 'key restores every placeholder: ' + restored);
  const area = await sw.evaluate(async () => ({ local: await chrome.storage.local.get(null), session: Object.keys(await chrome.storage.session.get(null)), sync: await chrome.storage.sync.get(null) }));
  ok(Object.keys(area.local).sort().join(',') === 'custom,ignore', 'local storage holds only the two lists: ' + Object.keys(area.local).join(','));
  ok(Object.keys(area.sync).length === 0, 'nothing in sync storage');
  const pop = await ctx.newPage();
  await pop.setViewportSize({ width: 450, height: 700 });
  await pop.goto(`chrome-extension://${extId}/popup.html`);
  await pop.waitForTimeout(400);
  ok(await pop.locator('#access').isHidden(), 'Chrome: no "not allowed" notice (site access is granted at install)');
  const keyText = await pop.locator('#key').innerText();
  ok(keyText.includes('[NAME_1]') && keyText.includes('John Smith') && keyText.includes('[NUMBER_2]'), 'toolbar window lists the placeholder key');
  await pop.fill('#reply', 'Thanks. [NAME_1] should contact [NAME_2] at [NUMBER_1].');
  await pop.waitForTimeout(200);
  ok((await pop.locator('#restored').innerText()) === 'Thanks. John Smith should contact Dr. Maria de la Cruz at (555) 123-4567.', 'pasting a reply into the toolbar window restores it');
  await pop.screenshot({ path: `${SHOTS}/popup.png`, fullPage: true });
  await pop.click('#forget'); await pop.waitForTimeout(300);
  ok((await pop.locator('#key').innerText()).includes('No placeholders'), '"Forget" erases the key');

  console.log('\nSettings page');
  const opt = await ctx.newPage();
  await opt.setViewportSize({ width: 1000, height: 900 });
  await opt.goto(`chrome-extension://${extId}/options.html`);
  await opt.waitForTimeout(500);
  ok((await opt.locator('#custom').inputValue()) === 'Solidcore' && (await opt.locator('#ignore').inputValue()) === 'Priya\nBoston', 'Settings shows the lists set from the right-click menu');
  const sampleHits = await opt.locator('#result .tag').allInnerTexts();
  ok(['NAME', 'ID', 'DATE', 'ADDRESS', 'NUMBER', 'EMAIL'].every((t) => sampleHits.includes(t)), 'the "Try it" box marks the sample: ' + sampleHits.join(','));
  await opt.screenshot({ path: `${SHOTS}/options.png`, fullPage: true });
  await opt.uncheck('#rule-dates'); await opt.fill('#minDigits', '4');
  await opt.click('#addPattern');
  const row = opt.locator('#patterns tbody tr').last();
  await row.locator('input[type=text]').nth(0).fill('course');
  await row.locator('input[type=text]').nth(1).fill('FIN\\s?\\d{3}');
  await opt.fill('#custom', 'Solidcore\nOkafor');
  await opt.waitForTimeout(700);
  const st = await sw.evaluate(() => chrome.storage.local.get(null));
  ok(st.settings.rules.dates === false && st.settings.minDigits === 4, 'turning off dates and setting 4 digits is saved');
  ok(st.settings.patterns.length === 1 && st.settings.patterns[0].label === 'COURSE' && st.settings.patterns[0].regex === 'FIN\\s?\\d{3}', 'own pattern saved: ' + JSON.stringify(st.settings.patterns));
  ok(JSON.stringify(st.custom) === '["Solidcore","Okafor"]', 'always-flag list edited in Settings is saved');
  const chat = await ctx.newPage();
  await chat.goto('https://chat.almma.ai/c/new'); await chat.waitForSelector('#prompt-textarea'); await chat.waitForTimeout(300);
  const sentChat = () => chat.evaluate(() => window.__sent.slice());
  await chat.click('#prompt-textarea'); await chat.keyboard.type('class on March 3 in room 204'); await chat.keyboard.press('Enter'); await chat.waitForTimeout(400);
  ok((await sentChat())[0] === 'class on March 3 in room 204', 'with dates off, a date goes through');
  await chat.keyboard.type('students of FIN 450 and invoice 4471'); await chat.keyboard.press('Enter'); await chat.waitForTimeout(400);
  await chat.keyboard.press('Enter'); await chat.waitForTimeout(500);
  ok(/^students of \[COURSE_\d+\] and invoice \[NUMBER_\d+\]$/.test(await chat.evaluate(() => window.__state)), 'own pattern and the 4-digit setting apply in an open tab: ' + await chat.evaluate(() => window.__state));
  const badRow = opt.locator('#patterns tbody tr').last();
  await badRow.locator('input[type=text]').nth(1).fill('FIN(');
  await opt.waitForTimeout(600);
  ok((await badRow.locator('.err').innerText()).includes('Not a valid'), 'an invalid pattern is reported and not saved');
  await chat.close(); await opt.close();

  console.log('\nALL ' + pass + ' CHECKS PASSED');
  await ctx.close();
})().catch((e) => { console.error('\nFAILED: ' + e.message); process.exit(1); });
