// Firefox test: loads the Firefox build into a real Firefox and repeats the main checks.
// Needs: firefox + geckodriver (FIREFOX_BIN, GECKODRIVER env vars) and selenium-webdriver (SELENIUM_PATH).
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const SITE = path.join(__dirname, 'site'), SHOTS = path.join(__dirname, 'shots');
const SEL = process.env.SELENIUM_PATH || 'selenium-webdriver';
const { Builder, Key } = require(SEL);
const firefox = require(SEL + '/firefox');
const PORT = 8765, BASE = 'http://localhost:' + PORT;
const UUID = '0b3f6f0e-6a64-4a8a-9c1e-5f2a9d1c7e11';
const FLAGGED = 'The student John Smith (ID 900123456) got 87.5.\nCall Dr. Maria de la Cruz at (555) 123-4567.';
const CLEAN_OUT = 'The student [NAME_1] (ID [ID_1]) got 87.5.\nCall [NAME_2] at [NUMBER_1].';
let pass = 0;
const ok = (c, msg) => { assert.ok(c, msg); pass++; console.log('  ok  ' + msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SHOTS, { recursive: true });

// 1. Firefox build that also runs on the local test pages
const TMP = '/tmp/pii-guard-fftest';
execFileSync('node', [path.join(ROOT, 'build.js')], { env: { ...process.env, PII_GUARD_DIST: TMP, PII_GUARD_EXTRA_MATCHES: 'http://localhost/*' } });
const XPI = fs.readdirSync(TMP).find((f) => f.startsWith('pii-guard-firefox') && f.endsWith('.zip'));

// 2. local web server for the stand-in pages
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, BASE);
  const f = u.pathname === '/rich' ? 'rich.html' : u.pathname === '/plain' ? 'plain.html' : u.pathname.slice(1);
  const full = path.join(SITE, f);
  if (!full.startsWith(SITE) || !fs.existsSync(full)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(full)] || 'text/plain' });
  res.end(fs.readFileSync(full));
}).listen(PORT);

(async () => {
  const options = new firefox.Options()
    .setBinary(process.env.FIREFOX_BIN || 'firefox')
    .addArguments('-headless')
    .setPreference('extensions.webextensions.uuids', JSON.stringify({ 'pii-guard@almma.ai': UUID }))
    .setPreference('dom.events.testing.asyncClipboard', true)
    .setPreference('extensions.webextOptionalPermissionPrompts', false);   // auto-accept the "Allow" prompt in this headless test
  options.windowSize({ width: 1000, height: 700 });
  const service = new firefox.ServiceBuilder(process.env.GECKODRIVER || 'geckodriver').addArguments('--allow-system-access');
  const d = await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  try {
    const caps = await d.getCapabilities();
    console.log('Firefox ' + caps.get('browserVersion'));
    await d.installAddon(path.join(TMP, XPI), true);
    await sleep(1500);

    // Extension pages can only be opened from the browser itself, as the toolbar button does.
    const openExt = async (page) => {
      await d.setContext(firefox.Context.CHROME);
      await d.executeScript('gBrowser.selectedTab = gBrowser.addTrustedTab(arguments[0]);', `moz-extension://${UUID}/${page}`);
      await d.setContext(firefox.Context.CONTENT);
      const handles = await d.getAllWindowHandles();
      await d.switchTo().window(handles[handles.length - 1]);
      await sleep(800);
    };
    const firstHandle = await d.getWindowHandle();

    console.log('\nsite access');
    await d.get(BASE + '/plain'); await sleep(600);
    await d.findElement({ css: '#prompt-textarea' }).sendKeys('Please email Priya Patel');
    await d.actions().sendKeys(Key.ENTER).perform(); await sleep(500);
    const ranBefore = (await d.executeScript('return window.__sent.length')) === 0;
    console.log('    (before allowing: page script ' + (ranBefore ? 'ran' : 'did not run') + ')');
    await openExt('popup.html');
    const shown = await d.executeScript('return !document.getElementById("access").hidden');
    ok(ranBefore ? !shown : shown, 'toolbar window ' + (shown ? 'shows the "not allowed" notice with an Allow button' : 'has no notice because access is already granted'));
    if (shown) {
      await d.findElement({ id: 'allow' }).click(); await sleep(800);
      ok(await d.executeScript('return document.getElementById("access").hidden'), 'clicking Allow grants access: ' + await d.findElement({ id: 'accessNote' }).getText());
    }
    await d.close();
    await d.switchTo().window(firstHandle);

    // Revoke site access the way the add-ons manager does, then recover with the Allow button.
    await d.setContext(firefox.Context.CHROME);
    const revoked = await d.executeAsyncScript(`const done = arguments[arguments.length - 1];
      const { ExtensionPermissions } = ChromeUtils.importESModule('resource://gre/modules/ExtensionPermissions.sys.mjs');
      const policy = WebExtensionPolicy.getByID('pii-guard@almma.ai');
      ExtensionPermissions.remove('pii-guard@almma.ai', { permissions: [], origins: policy.extension.manifest.host_permissions }, policy.extension)
        .then(() => done('ok'), (e) => done(String(e)));`);
    await d.setContext(firefox.Context.CONTENT);
    ok(revoked === 'ok', 'site access revoked (as a user can in the add-ons manager)');
    await d.get(BASE + '/plain'); await sleep(600);
    await d.findElement({ css: '#prompt-textarea' }).sendKeys('Please email Priya Patel');
    await d.actions().sendKeys(Key.ENTER).perform(); await sleep(500);
    ok((await d.executeScript('return window.__sent.length')) === 1, 'without access, nothing is checked (this is the risk the notice warns about)');
    await openExt('popup.html');
    ok(await d.executeScript('return !document.getElementById("access").hidden'), 'toolbar window now shows the "not allowed" notice');
    await d.findElement({ id: 'allow' }).click(); await sleep(800);
    const note = await d.findElement({ id: 'accessNote' }).getText();
    ok((await d.executeScript('return document.getElementById("access").hidden')) && note.startsWith('Allowed'), 'Allow restores access and says: "' + note + '"');
    await d.close(); await d.switchTo().window(firstHandle);
    await d.get(BASE + '/plain'); await sleep(600);
    await d.findElement({ css: '#prompt-textarea' }).sendKeys('Please email Priya Patel');
    await d.actions().sendKeys(Key.ENTER).perform(); await sleep(500);
    ok((await d.executeScript('return window.__sent.length')) === 0, 'after Allow and a reload, checking works again');
    await d.actions().sendKeys(Key.ESCAPE).perform(); await sleep(200);

    for (const site of [
      { name: 'rich editor (stands in for claude.ai)', url: BASE + '/rich', box: '.ProseMirror', send: '#send',
        read: 'return window.wrappedJSObject ? window.wrappedJSObject.__editor.getText({ blockSeparator: "\\n" }) : window.__editor.getText({ blockSeparator: "\\n" })' },
      { name: 'React textarea (stands in for chat.almma.ai)', url: BASE + '/plain', box: '#prompt-textarea', send: '#send-button',
        read: 'return window.__state' },
    ]) {
      console.log('\n' + site.name);
      const tag = site.box === '.ProseMirror' ? 'ff-rich' : 'ff-plain';
      await d.get(site.url);
      await sleep(800);
      const box = await d.findElement({ css: site.box });
      const read = () => d.executeScript(site.read);
      const panelOpen = () => d.executeScript('return !!document.activeElement && document.activeElement.tagName === "PII-GUARD-ROOT"');
      const sent = () => d.executeScript('return window.__sent.slice()');
      const press = async (...keys) => { await d.actions().keyDown(keys[0]).perform(); if (keys[1]) { await d.actions().sendKeys(keys[1]).perform(); } await d.actions().keyUp(keys[0]).perform(); };
      const enter = () => d.actions().sendKeys(Key.ENTER).perform();
      const clear = async () => {
        await box.click();
        await d.actions().keyDown(Key.CONTROL).sendKeys('a').keyUp(Key.CONTROL).sendKeys(Key.DELETE).perform();
        await d.executeScript('window.__sent.length = 0');
      };
      const paste = async (text) => {
        await d.executeAsyncScript('const done = arguments[arguments.length - 1]; navigator.clipboard.writeText(arguments[0]).then(() => done(true), (e) => done(String(e)));', text);
        await box.click();
        await d.actions().keyDown(Key.CONTROL).sendKeys('v').keyUp(Key.CONTROL).perform();
        await sleep(500);
      };

      ok(await d.executeScript('return typeof CSS !== "undefined" && "highlights" in CSS'), 'Firefox has the highlight feature used for red marks');
      await paste(FLAGGED);
      ok(await panelOpen(), 'a real Ctrl+V paste of flagged text opens the review panel');
      ok((await read()) === '', 'the message box is still empty while the panel is open');
      await d.takeScreenshot().then((b) => fs.writeFileSync(`${SHOTS}/${tag}-panel.png`, b, 'base64'));
      await enter(); await sleep(600);
      ok((await read()) === CLEAN_OUT, 'Enter inserts the anonymized text: ' + JSON.stringify(await read()));
      await box.click(); await enter(); await sleep(400);
      ok((await sent())[0] === CLEAN_OUT, 'it sends normally');

      await clear();
      await paste('Ask Lena Fischer today');
      await d.actions().keyDown(Key.CONTROL).sendKeys(Key.ENTER).keyUp(Key.CONTROL).perform(); await sleep(500);
      ok(!(await panelOpen()) && (await read()) === 'Ask Lena Fischer today', 'Ctrl+Enter inserts the original unchanged');

      await clear();
      await box.sendKeys('Please email Priya Patel about invoice 4471 today');
      await sleep(1000);
      await d.takeScreenshot().then((b) => fs.writeFileSync(`${SHOTS}/${tag}-typed.png`, b, 'base64'));
      await enter(); await sleep(500);
      ok((await sent()).length === 0 && (await panelOpen()), 'Enter with a typed name is stopped');
      await enter(); await sleep(600);
      ok((await read()) === 'Please email [NAME_3] about invoice 4471 today', 'replaced in the box: ' + JSON.stringify(await read()));
      await box.click(); await enter(); await sleep(400);
      ok((await sent())[0] === 'Please email [NAME_3] about invoice 4471 today', 'second Enter sends it');

      await clear();
      await box.sendKeys('Room 204 with Ana Lima');
      await d.findElement({ css: site.send }).click(); await sleep(500);
      ok((await sent()).length === 0 && (await panelOpen()), 'clicking Send is stopped');
      await d.actions().sendKeys(Key.ESCAPE).perform(); await sleep(300);
      ok(!(await panelOpen()) && (await read()) === 'Room 204 with Ana Lima', 'Escape cancels and leaves the text alone');

      await clear();
      await box.sendKeys('seen at 123 Main Street on March 3, 2024, MRN A4471');
      await enter(); await sleep(500); await enter(); await sleep(600);
      ok(/^seen at \[ADDRESS_\d+\] on \[DATE_\d+\], MRN \[ID_\d+\]$/.test(await read()), 'HIPAA items replaced: ' + JSON.stringify(await read()));
    }

    console.log('\nextension pages and background');
    const chatHandle = await d.getWindowHandle();
    await openExt('options.html');
    const tags = await d.executeScript('return [...document.querySelectorAll("#result .tag")].map((e) => e.textContent)');
    ok(['NAME', 'ID', 'DATE', 'ADDRESS', 'NUMBER', 'EMAIL'].every((t) => tags.includes(t)), 'Settings page works; "Try it" marks: ' + tags.join(','));
    const bg = await d.executeAsyncScript(`const done = arguments[arguments.length - 1];
      (async () => {
        const page = await browser.runtime.getBackgroundPage();
        const api = page && page.__piiGuard;
        if (!api) return { error: 'no background api' };
        const menuErrors = await api.createMenus();
        const [tab] = await browser.tabs.query({ url: 'http://localhost/*' });
        await api.handleMenuClick({ menuItemId: 'pii-guard-flag', selectionText: 'Solidcore', frameId: 0 }, { id: tab.id });
        await api.handleMenuClick({ menuItemId: 'pii-guard-ignore', selectionText: 'Boston', frameId: 0 }, { id: tab.id });
        const restored = await api.restore('[NAME_1] and [NUMBER_1]');
        const stored = await browser.storage.local.get(null);
        const session = await browser.storage.session.get(null);
        return { menuErrors, stored, restored: restored.parts.map((p) => p.plain !== undefined ? p.plain : p.original).join(''), sessionKeys: Object.keys(session) };
      })().then(done, (e) => done({ error: String(e) }));`);
    ok(!bg.error, 'background page reachable' + (bg.error ? ': ' + bg.error : ''));
    ok(bg.menuErrors.length === 0, 'right-click menu items created without error');
    ok(JSON.stringify(bg.stored.custom) === '["Solidcore"]' && JSON.stringify(bg.stored.ignore) === '["Boston"]', 'always / never flag from the menu are stored: ' + JSON.stringify(bg.stored));
    ok(bg.restored === 'John Smith and (555) 123-4567', 'placeholder key restores originals: ' + bg.restored);
    ok(bg.sessionKeys.includes('key'), 'the key lives in session storage');
    await d.close(); await d.switchTo().window(chatHandle);
    await openExt('popup.html');
    const keyText = await d.findElement({ id: 'key' }).getText();
    ok(keyText.includes('[NAME_1]') && keyText.includes('John Smith'), 'toolbar window lists the key');
    await d.close();
    await d.switchTo().window(chatHandle);
    const box = await d.findElement({ css: '#prompt-textarea' });
    await box.click();
    await d.actions().keyDown(Key.CONTROL).sendKeys('a').keyUp(Key.CONTROL).sendKeys(Key.DELETE).perform();
    await d.executeScript('window.__sent.length = 0');
    await box.sendKeys('class at solidcore in Boston');
    await d.actions().sendKeys(Key.ENTER).perform(); await sleep(500);
    ok(await d.executeScript('return document.activeElement.tagName === "PII-GUARD-ROOT"'), 'always-flag term added in the background takes effect in the open tab');

    console.log('\nALL ' + pass + ' FIREFOX CHECKS PASSED');
  } finally {
    await d.quit();
    server.close();
  }
})().catch((e) => { console.error('\nFAILED: ' + e.message); server.close(); process.exit(1); });
