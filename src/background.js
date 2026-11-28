// PII Guard - background worker.
// Holds the placeholder key ([NAME_1] = original) and the right-click menu.
// The key lives in chrome.storage.session: kept in memory, never written to disk,
// erased when the browser closes, and not readable by the web pages themselves.
// This file contains no code that transmits data anywhere.
'use strict';

// The sites it runs on are listed once, in build.js, and read back from the manifest here.
const SITES = (chrome.runtime.getManifest().content_scripts || []).flatMap((c) => c.matches || []);
const MENU_FLAG = 'pii-guard-flag';
const MENU_IGNORE = 'pii-guard-ignore';
const MENU_SHOW = 'pii-guard-show';
const TOKEN = /\[[A-Z][A-Z0-9]{1,15}_\d+\]/g;   // [NAME_1], [DATE_3], [COURSE_2] ...
const MAX_TERM = 100;

function norm(text) { return String(text).toLowerCase().replace(/\s+/g, ' ').trim(); }

// ---------- right-click menu ----------
// Menu set-up runs one at a time; overlapping runs (install + startup) would clash over the item ids.
let menuQueue = Promise.resolve();
function createMenus() {
  const run = menuQueue.then(buildMenus);
  menuQueue = run.catch(() => {});
  return run;
}
function buildMenus() {
  return new Promise((resolve) => {
    chrome.contextMenus.removeAll(() => {
      const errors = [];
      const done = () => { if (chrome.runtime.lastError) errors.push(chrome.runtime.lastError.message); };
      chrome.contextMenus.create({ id: MENU_FLAG, title: 'PII Guard: always flag "%s"', contexts: ['selection'], documentUrlPatterns: SITES }, done);
      chrome.contextMenus.create({ id: MENU_IGNORE, title: 'PII Guard: never flag "%s"', contexts: ['selection'], documentUrlPatterns: SITES }, done);
      chrome.contextMenus.create({ id: MENU_SHOW, title: 'PII Guard: show originals', contexts: ['selection'], documentUrlPatterns: SITES }, () => { done(); resolve(errors); });
    });
  });
}
chrome.runtime.onInstalled.addListener(createMenus);
chrome.runtime.onStartup.addListener(createMenus);

// Clean a selected phrase: trim spaces and surrounding punctuation.
function cleanTerm(raw) {
  return String(raw || '').replace(/\s+/g, ' ').trim()
    .replace(/^[\s"'“”‘’()\[\]{}<>.,;:!?]+|[\s"'“”‘’()\[\]{}<>.,;:!?]+$/g, '');
}

// Add a term to 'custom' (always flag) or 'ignore' (never flag); it is taken off the other list.
async function addTerm(raw, list) {
  list = list === 'ignore' ? 'ignore' : 'custom';
  const other = list === 'ignore' ? 'custom' : 'ignore';
  const term = cleanTerm(raw);
  if (!term) return { ok: false, list, reason: 'Nothing usable was selected.' };
  if (term.length > MAX_TERM) return { ok: false, list, reason: 'Selection is longer than ' + MAX_TERM + ' characters. Select just the name or word.' };
  const stored = await chrome.storage.local.get([list, other]);
  const mine = stored[list] || [], theirs = stored[other] || [];
  const already = mine.some((t) => norm(t) === norm(term));
  if (!already) mine.push(term);
  await chrome.storage.local.set({ [list]: mine, [other]: theirs.filter((t) => norm(t) !== norm(term)) });
  return { ok: true, list, term, already };
}

async function handleMenuClick(info, tab) {
  if (!tab || tab.id === undefined) return;
  const target = { frameId: info.frameId || 0 };
  if (info.menuItemId === MENU_FLAG || info.menuItemId === MENU_IGNORE) {
    const result = await addTerm(info.selectionText, info.menuItemId === MENU_IGNORE ? 'ignore' : 'custom');
    chrome.tabs.sendMessage(tab.id, { op: 'list-result', result }, target).catch(() => {});
  } else if (info.menuItemId === MENU_SHOW) {
    chrome.tabs.sendMessage(tab.id, { op: 'show-originals', fallback: info.selectionText || '' }, target).catch(() => {});
  }
}
chrome.contextMenus.onClicked.addListener(handleMenuClick);

// ---------- placeholder key ----------
let queue = Promise.resolve();
function serial(fn) { const p = queue.then(fn); queue = p.catch(() => {}); return p; }

async function loadKey() {
  const { key } = await chrome.storage.session.get('key');
  return key || { byOriginal: {}, byToken: {}, counts: {}, order: [] };
}

// Same original always gets the same placeholder, in every tab, until the browser closes.
// commit=false only previews (nothing is stored); commit=true reserves the placeholders.
function tokensFor(items, commit) {
  return serial(async () => {
    const k = await loadKey();
    const counts = { ...k.counts };
    const fresh = {};
    let changed = false;
    const tokens = items.map(({ type, text }) => {
      const id = type + '|' + norm(text);
      if (k.byOriginal[id]) return k.byOriginal[id];
      if (fresh[id]) return fresh[id];
      counts[type] = (counts[type] || 0) + 1;
      const token = '[' + type + '_' + counts[type] + ']';
      fresh[id] = token;
      if (commit) {
        k.byOriginal[id] = token;
        k.byToken[token] = text;
        k.order.push(token);
        changed = true;
      }
      return token;
    });
    if (changed) { k.counts = counts; await chrome.storage.session.set({ key: k }); }
    return tokens;
  });
}

async function restore(text) {
  const k = await loadKey();
  let count = 0, unknown = 0;
  const parts = [];
  let pos = 0;
  String(text).replace(TOKEN, (token, offset) => {
    parts.push({ plain: text.slice(pos, offset) });
    if (Object.prototype.hasOwnProperty.call(k.byToken, token)) { parts.push({ token, original: k.byToken[token] }); count++; }
    else { parts.push({ token, original: null }); unknown++; }
    pos = offset + token.length;
    return token;
  });
  parts.push({ plain: text.slice(pos) });
  return { parts, count, unknown };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;
  if (msg.op === 'tokens') { tokensFor(msg.items || [], msg.commit === true).then(sendResponse); return true; }
  if (msg.op === 'restore') { restore(msg.text || '').then(sendResponse); return true; }
  return false;
});

// Exposed only for the automated tests.
globalThis.__piiGuard = { createMenus, handleMenuClick, addTerm, tokensFor, restore, cleanTerm };
