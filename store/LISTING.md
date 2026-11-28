# Chrome Web Store listing (draft)

Upload: `dist/pii-guard-chrome-<version>.zip` (made by `node build.js`).

## Store listing tab

**Name** (from the manifest): Almma’s PII Guard

**Summary** (from the manifest description, max 132 characters; this one is 125):
Flags names, numbers and other personal data before you send them to Claude, ChatGPT or AlmmaGPT. Runs only on your computer.

**Description:**

PII Guard checks what you paste or type into the message box on claude.ai, chatgpt.com and chat.almma.ai, and catches personal data before it leaves your computer.

• Paste: the text is held back first. A review panel shows every flagged item and the placeholder that will replace it, e.g. John Smith → [NAME_1].
• Typing: flagged text is underlined in red, and sending is paused until you review it.
• One key to decide: Enter replaces, Ctrl+Enter keeps the original, Esc cancels.
• Reverse it: select the AI's reply, right-click, "show originals" — the real names come back in a private panel, never in the page.
• Your rules: switch each rule on or off, add names that must always (or never) be flagged, and add your own patterns.

What it catches: names, e-mail addresses, phone and ID numbers, dates, street addresses, web and IP addresses, ages over 89, medical record, policy and account numbers, and vehicle numbers. That covers many of the HIPAA identifiers that appear in text, plus student names and IDs relevant to FERPA.

Private by design: PII Guard contains no network code. No servers, no analytics, no account. The placeholder key lives in memory and is erased when the browser closes.

PII Guard lowers the risk of sharing personal data; it does not by itself make your use of an AI service compliant with FERPA, HIPAA or any other law. It does not inspect attached files, images or voice input. In ChatGPT writing blocks and canvas, pasted text is checked; text typed there is marked but not held back.

**Category:** pick the closest offered in the dashboard (Privacy & Security if available, otherwise Tools).
**Language:** English.

**Promo video:** https://www.youtube.com/watch?v=k2dVQsBeQo4

**Graphics:**
- Store icon 128×128: `store-icon-128.png` (96×96 artwork with 16 px transparent padding, as Google asks). The same file is `icons/icon128.png` inside the zip.
- Screenshots 1280×800 (in this order): `screenshot-1-review.png`, `screenshot-2-typing.png`, `screenshot-3-originals.png`, `screenshot-4-settings.png` (a fifth, `screenshot-5-rightclick.png`, is made only when a right-click frame is supplied)
- Small promo tile 440×280: `promo-small-440x280.png`
- Marquee promo tile 1400×560 (optional): `promo-marquee-1400x560.png`
- All are 24-bit PNG without transparency. Rebuild with `node test/screenshots.js` and then `python3 store/make-store-images.py [store/raw/rightclick.png]`.

## Privacy practices tab (answers to confirm before submitting)

**Single purpose:** Detect personal data in the message box of three AI chat sites and replace it with placeholders before the user sends it.

**Permission justifications:**
- contextMenus: right-click items to always flag, never flag, or show the originals of placeholders in selected text.
- storage: keeps the user's settings and lists on the device, and the placeholder key in session memory.
- Host access (claude.ai, chatgpt.com, chat.almma.ai, via content scripts): needed to read the message box on those three sites; no other sites.

**Remote code:** No. All code is in the package.

**Data usage:** The extension reads text the user enters on the three sites in order to check it on the device. It does not transmit, sell or share any data. (Confirm how the dashboard's checkboxes define "collect" before ticking any category.)

**Certifications:** not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used to determine creditworthiness or for lending.

**Privacy policy URL:** https://github.com/almma-ai/pii-guard/blob/main/PRIVACY.md

## Updating the published item to 0.4.0 (adds chatgpt.com)

1. In the Developer Dashboard open the item, **Package → Upload new package**, and upload `dist/pii-guard-chrome-0.4.0.zip` as it is.
2. **Store listing tab:** replace the description with the text above. Replace `screenshot-4-settings.png` (its wording changed).
3. **Privacy practices tab:** update the single-purpose text and the host-access justification with the texts above. The dashboard will show chatgpt.com as a new host.
4. Submit for review.

What users see: 0.4.0 asks for one more site (chatgpt.com). Chrome switches an extension off when an update asks for a new site, and keeps it off until the user accepts the new permission. People who already have PII Guard will therefore see a "needs new permissions" notice and must click to accept it; until they do, PII Guard does not run on any site. New installs are not affected. Say so in the release notes and on the listing.
