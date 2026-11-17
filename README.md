# Almma’s PII Guard

A browser extension that catches personal data (names, IDs, dates, addresses, phone numbers, e-mail addresses) in the message box of **claude.ai** and **chat.almma.ai** before it is sent, and replaces it with placeholders such as `[NAME_1]`. It runs entirely in your browser: the code contains no network calls.

Demo video (73 s): https://www.youtube.com/watch?v=k2dVQsBeQo4

Built for FERPA- and HIPAA-sensitive work. It lowers risk; it is **not** a compliance guarantee.

## What it does

- **Paste:** pasted text is held back before the page sees it. A review panel lists every flagged item with its placeholder; you tick what to replace.
- **Typing:** flagged text is underlined in red as you type, and Enter / Send is stopped until you review it.
- **Shortcuts in the panel:** `Enter` replace · `Ctrl+Enter` (`⌘+Enter` on Mac) keep original · `Esc` cancel.
- **Right-click on selected text:** *always flag*, *never flag*, *show originals* (turns `[NAME_1]` in an AI reply back into the real name, in a private panel; nothing is written back into the page).
- **Toolbar button:** placeholder key for this browser session, and a box to restore a pasted reply.
- **Settings page:** switch each rule on or off, set the digit count for numbers, edit the always / never lists, add your own patterns (label + regular expression), and try everything on sample text.

### Rules

| Rule | Examples | Placeholder |
|---|---|---|
| Names (capitalized runs, titles, your lists) | John Smith, Dr. Maria de la Cruz | `NAME` |
| E-mail addresses | j.smith@uni.edu | `EMAIL` |
| Numbers with ≥ 5 digits (adjustable) | (555) 123-4567, 22180 | `NUMBER` |
| Dates | March 3, 2024 · 3/14 · 2024-03-14 | `DATE` |
| Street addresses, PO boxes | 123 Main Street, Apt 4B, Vienna, VA 22180 | `ADDRESS` |
| Web and IP addresses | https://…, 10.0.0.12 | `URL`, `IP` |
| Ages over 89 | 92-year-old, aged 95 | `AGE` |
| Labeled record numbers, VINs, letter-digit codes | MRN: A4471, policy # XJ-22, AB1234 | `ID` |
| Your own patterns | label `COURSE`, pattern `FIN\s?\d{3}` | `COURSE` |

**Known limits:** a single unlisted name at the very start of a sentence ("John failed.") is not flagged; lower-case names are not flagged unless listed; fractions like 1/2 can be taken for dates; letter-digit codes can catch product codes (ISO27001). Attached files and images are not inspected. Text that identifies someone indirectly ("the only student who…") cannot be caught by patterns.

## Where data is kept

| What | Where | Lifetime |
|---|---|---|
| Placeholder key (`[NAME_1]` = original) | `storage.session` (memory) | erased when the browser closes, or "Forget" |
| Always / never lists, settings | `storage.local` (this computer) | until removed or the extension is uninstalled |
| `src/roster.js` | the extension folder | edit by hand |

Web pages cannot read any of these. Nothing uses `storage.sync`.

## Install (developer mode)

```
node build.js          # writes dist/chrome, dist/firefox and a zip of each
```

- **Chrome / Edge:** `chrome://extensions` (or `edge://extensions`) → Developer mode → *Load unpacked* → `dist/chrome`.
- **Firefox:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on* → `dist/firefox/manifest.json` (removed when Firefox restarts; a permanent install needs Mozilla signing).

After an update: reload the extension, then reload open chat tabs.

## Check there is no network code

```
grep -n -i -E "fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|connectNative|storage\.sync" src/*.js src/*.html
```
Windows: `findstr /n /i /l "fetch XMLHttpRequest WebSocket sendBeacon EventSource importScripts connectNative storage.sync" src\*.js src\*.html`

Both must print nothing.

## Tests

```
node test/patterns.test.js                 # rule tests (no browser needed)
node build.js && node test/chrome.test.js  # Chrome, via Playwright
node test/firefox.test.js                  # Firefox, via Selenium + geckodriver
```

- The browser tests run against stand-in pages (`test/site/`) that use the same kinds of editor as the real sites: a ProseMirror rich-text box and a React textarea. They do not visit claude.ai or chat.almma.ai.
- Environment variables: `CHROME_PATH`, `PLAYWRIGHT_PATH`, `FIREFOX_BIN`, `GECKODRIVER`, `SELENIUM_PATH`.
- `test/screenshots.js` makes the store screenshots from a neutral demo page.

Last run (v0.3.2): 50 rule assertions, 71 Chrome checks (Chrome 153), 38 Firefox checks (Firefox 160), Mozilla `addons-linter`: 0 errors, 0 warnings.

## Layout

```
src/         extension source (shared by Chrome and Firefox)
build.js     writes per-browser manifests into dist/
test/        rule tests, browser tests, stand-in pages
store/       store screenshots, promo tile, listing text
PRIVACY.md   privacy policy
```

## License

MIT, see [LICENSE](LICENSE).
