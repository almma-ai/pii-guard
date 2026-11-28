# Firefox Add-ons (AMO) listing

Upload: `dist/pii-guard-firefox-<version>.zip` (made by `node build.js`). Upload the zip as it is.

Facts about the package:

- Add-on ID (in the manifest): `pii-guard@almma.ai`. AMO checks that this ID is unique at the first upload.
- Firefox 142 or later, desktop. The manifest has no `gecko_android` entry, so it is not offered for Firefox for Android.
- The manifest declares `data_collection_permissions: none` (required by AMO for new extensions since November 2025).
- Mozilla's checker (`addons-linter`, the same one AMO runs on upload) reports 0 errors, 0 warnings, 0 notices for 0.5.0.

## Steps (addons.mozilla.org, signed in with a Mozilla account)

1. Open the **Developer Hub** and click **Submit a New Add-on** (the first time it says **Submit Your First Add-on**).
2. Choose **On this site**, then **Continue**.
3. **Upload Version:** click **Select a file** and pick the zip. Wait for the validation to finish.
4. Compatible platforms: Firefox. Then **Continue**.
5. Source code question: **No**. The package is the readable source; `build.js` only writes `manifest.json` and zips `src/`.
6. Fill in the **Describe Add-on** page with the texts below.
7. Click **Submit Version**. AMO sends a confirmation e-mail. Its documentation gives no review time.

Later versions: upload them from the add-on's own page in the Developer Hub, so AMO treats them as updates.

## Describe Add-on

**Name:** Almma’s PII Guard

**Summary** (limit 250 characters; this one is 221):
Flags names, numbers and other personal data before you send them to Claude, ChatGPT, Gemini or AlmmaGPT, and swaps them for placeholders like [NAME_1]. Runs only on your computer: no servers, no account, no network code.

**Description:**

PII Guard checks what you paste or type into the message box on claude.ai, chatgpt.com, gemini.google.com and chat.almma.ai, and catches personal data before it leaves your computer.

• Paste: the text is held back first. A review panel shows every flagged item and the placeholder that will replace it, e.g. John Smith → [NAME_1].
• Typing: flagged text is underlined in red, and sending is paused until you review it.
• One key to decide: Enter replaces, Ctrl+Enter keeps the original, Esc cancels.
• Reverse it: select the AI's reply, right-click, "show originals". The real names come back in a private panel, never in the page.
• Your rules: switch each rule on or off, add names that must always (or never) be flagged, and add your own patterns.

What it catches: names, e-mail addresses, phone and ID numbers, dates, street addresses, web and IP addresses, ages over 89, medical record, policy and account numbers, and vehicle numbers. That covers many of the HIPAA identifiers that appear in text, plus student names and IDs relevant to FERPA.

Private by design: PII Guard contains no network code. No servers, no analytics, no account. The placeholder key lives in memory and is erased when the browser closes.

Site access: Firefox lets you withdraw an add-on's access to a site at any time. If that happens, PII Guard cannot check anything; its toolbar window shows a warning and a button to allow it again.

PII Guard lowers the risk of sharing personal data; it does not by itself make your use of an AI service compliant with FERPA, HIPAA or any other law. It does not inspect attached files, images or voice input. In a ChatGPT writing block (editable text inside a reply), pasted text is checked; text typed there is marked but not held back. The canvas in ChatGPT and in Gemini has not been tested.

Source code: https://github.com/almma-ai/pii-guard

**This add-on is experimental:** no.
**This add-on requires payment, non-free services or software, or additional hardware:** no.
**Categories** (up to 2): Privacy & Security, or the closest one offered.
**Support email:** info@almma.ai
**Support website:** https://github.com/almma-ai/pii-guard
**License:** MIT License.
**Privacy policy:** AMO asks for one when data leaves the device; PII Guard sends nothing. Ticking the box and pasting the text of `PRIVACY.md` is optional.
**Screenshots:** the four `store/screenshot-*.png` files.

**Notes for Reviewers:**

PII Guard runs only on claude.ai, chatgpt.com, gemini.google.com and chat.almma.ai. It has no network code: no fetch, XMLHttpRequest, WebSocket, sendBeacon or remote scripts, and nothing is transmitted. The package is the unminified source. The public repository is https://github.com/almma-ai/pii-guard; its build.js only writes manifest.json and zips src/.

Permissions: host access to the four sites (content script that reads the message box), contextMenus (three right-click items), storage (storage.local for settings and the always/never lists; storage.session for the placeholder key, which is kept in memory only).

To try it without any account: open the add-on's Settings page and use the "Try it" box. On a chat site: type "Please email Priya Patel" in the message box and press Enter. A review panel opens instead of sending; Enter replaces the name with [NAME_1], Esc cancels.
