# Chrome Web Store listing (draft)

Upload: `dist/pii-guard-chrome-<version>.zip` (made by `node build.js`).

## Store listing tab

**Name** (from the manifest): PII Guard (local)

**Summary** (from the manifest description, max 132 characters):
Flags names, numbers and other personal data in the Claude and AlmmaGPT message box before sending. Runs only on your computer.

**Description:**

PII Guard checks what you paste or type into the message box on claude.ai and chat.almma.ai, and catches personal data before it leaves your computer.

• Paste: the text is held back first. A review panel shows every flagged item and the placeholder that will replace it, e.g. John Smith → [NAME_1].
• Typing: flagged text is underlined in red, and sending is paused until you review it.
• One key to decide: Enter replaces, Ctrl+Enter keeps the original, Esc cancels.
• Reverse it: select the AI's reply, right-click, "show originals" — the real names come back in a private panel, never in the page.
• Your rules: switch each rule on or off, add names that must always (or never) be flagged, and add your own patterns.

What it catches: names, e-mail addresses, phone and ID numbers, dates, street addresses, web and IP addresses, ages over 89, medical record, policy and account numbers, vehicle numbers — the text-based identifiers in the HIPAA Safe Harbor list, plus student names and IDs relevant to FERPA.

Private by design: PII Guard contains no network code. No servers, no analytics, no account. The placeholder key lives in memory and is erased when the browser closes.

PII Guard lowers the risk of sharing personal data; it does not by itself make your use of an AI service compliant with FERPA, HIPAA or any other law. It does not inspect attached files or images.

**Category:** pick the closest offered in the dashboard (Privacy & Security if available, otherwise Tools).
**Language:** English.

**Graphics:**
- Icon 128×128: inside the zip (`icons/icon128.png`)
- Screenshots 1280×800: `store/screenshot-1-review.png`, `-2-typing.png`, `-3-originals.png`, `-4-settings.png`
- Small promo tile 440×280: `store/promo-small-440x280.png`

## Privacy practices tab (answers to confirm before submitting)

**Single purpose:** Detect personal data in the message box of two AI chat sites and replace it with placeholders before the user sends it.

**Permission justifications:**
- contextMenus: right-click items to always flag, never flag, or show the originals of placeholders in selected text.
- storage: keeps the user's settings and lists on the device, and the placeholder key in session memory.
- Host access (claude.ai, chat.almma.ai, via content scripts): needed to read the message box on those two sites; no other sites.

**Remote code:** No. All code is in the package.

**Data usage:** The extension reads text the user enters on the two sites in order to check it on the device. It does not transmit, sell or share any data. (Confirm how the dashboard's checkboxes define "collect" before ticking any category.)

**Certifications:** not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** needs a public address for `PRIVACY.md` (see the delivery notes).
