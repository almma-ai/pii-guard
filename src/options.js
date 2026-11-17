// PII Guard - Settings page. Reads and writes the extension's own storage only.
// This file contains no code that transmits data anywhere.
'use strict';

const G = globalThis.PIIGuard;
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const GENERAL = [
  ['names', 'Names', 'Runs of capitalized words, e.g. John Smith'],
  ['titled', 'Names after a title', 'Dr. Lee, Prof Smith, Ms. Rivera'],
  ['email', 'E-mail addresses', 'j.smith@uni.edu'],
  ['numbers', 'Long numbers', 'phone, SSN, ZIP, student ID (digit count below)']
];
const HIPAA = [
  ['dates', 'Dates', 'March 3, 2024 · 3/14 · 2024-03-14 (a year alone is kept)'],
  ['addresses', 'Street addresses and PO boxes', '123 Main Street, Apt 4B, Vienna, VA 22180'],
  ['urls', 'Web addresses', 'https://… and www.…'],
  ['ips', 'IP addresses', '10.0.0.12 · fe80::1'],
  ['ages', 'Ages over 89', '92-year-old · aged 95'],
  ['labeledIds', 'Labeled record numbers', 'MRN: A4471 · policy # XJ-22 · member ID 88'],
  ['vin', 'Vehicle numbers (VIN)', '1HGCM82633A004352'],
  ['mixedIds', 'Letter-and-digit codes', 'AB1234 · XJ-4492-K (4+ digits)']
];

let state = { settings: { rules: {}, minDigits: 5, patterns: [] }, custom: [], ignore: [] };
let saveTimer = 0;

function lines(text) {
  const seen = new Set();
  return text.split(/\r?\n/).map((s) => s.trim()).filter((s) => {
    const k = s.toLowerCase();
    if (!s || seen.has(k)) return false;
    seen.add(k); return true;
  });
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const patterns = state.settings.patterns.filter((p) => p.regex && G.compilePattern(p));
    await chrome.storage.local.set({
      settings: { rules: state.settings.rules, minDigits: state.settings.minDigits, patterns },
      custom: state.custom,
      ignore: state.ignore
    });
    $('saved').textContent = 'Saved';
    setTimeout(() => { $('saved').textContent = ''; }, 1500);
  }, 250);
  preview();
}

function drawRules(boxId, list) {
  const box = $(boxId);
  box.textContent = '';
  list.forEach(([id, title, example]) => {
    const label = el('label');
    const cb = el('input'); cb.type = 'checkbox'; cb.id = 'rule-' + id;
    cb.checked = state.settings.rules[id] !== false;
    cb.addEventListener('change', () => { state.settings.rules[id] = cb.checked; save(); });
    const text = el('span', '', title);
    text.appendChild(el('small', '', example));
    label.appendChild(cb); label.appendChild(text);
    box.appendChild(label);
  });
}

function drawPatterns() {
  const body = $('patterns').querySelector('tbody');
  body.textContent = '';
  state.settings.patterns.forEach((p, i) => {
    const tr = el('tr');
    const label = el('input'); label.type = 'text'; label.value = p.label || ''; label.placeholder = 'COURSE';
    const regex = el('input'); regex.type = 'text'; regex.value = p.regex || ''; regex.placeholder = 'FIN\\s?\\d{3}';
    const err = el('div', 'err');
    const ci = el('input'); ci.type = 'checkbox'; ci.checked = !!p.ignoreCase;
    const on = el('input'); on.type = 'checkbox'; on.checked = p.enabled !== false;
    const rm = el('button', '', 'Remove');
    const check = () => {
      err.textContent = regex.value && !G.compilePattern({ regex: regex.value }) ? 'Not a valid pattern; it is not saved until fixed.' : '';
    };
    label.addEventListener('input', () => { p.label = G.cleanLabel(label.value); save(); });
    label.addEventListener('change', () => { label.value = p.label; });
    regex.addEventListener('input', () => { p.regex = regex.value; check(); save(); });
    ci.addEventListener('change', () => { p.ignoreCase = ci.checked; save(); });
    on.addEventListener('change', () => { p.enabled = on.checked; save(); });
    rm.addEventListener('click', () => { state.settings.patterns.splice(i, 1); drawPatterns(); save(); });
    const td = (cls, ...kids) => { const c = el('td', cls); kids.forEach((k) => c.appendChild(k)); return c; };
    tr.appendChild(td('label', label));
    tr.appendChild(td('', regex, err));
    tr.appendChild(td('small', ci));
    tr.appendChild(td('small', on));
    tr.appendChild(td('', rm));
    body.appendChild(tr);
    check();
  });
}

function drawAll() {
  drawRules('generalRules', GENERAL);
  drawRules('hipaaRules', HIPAA);
  $('minDigits').value = state.settings.minDigits;
  $('custom').value = state.custom.join('\n');
  $('ignore').value = state.ignore.join('\n');
  drawPatterns();
  preview();
}

function preview() {
  G.setConfig({
    rules: state.settings.rules, minDigits: state.settings.minDigits,
    patterns: state.settings.patterns.filter((p) => p.regex), custom: state.custom, ignore: state.ignore
  });
  const text = $('sample').value;
  const out = $('result');
  out.textContent = '';
  let pos = 0;
  G.detect(text, new Set()).forEach((m) => {
    out.appendChild(document.createTextNode(text.slice(pos, m.start)));
    out.appendChild(el('span', 'hit', m.text));
    out.appendChild(el('span', 'tag', m.type));
    pos = m.end;
  });
  out.appendChild(document.createTextNode(text.slice(pos)));
}

function preset(all) {
  const rules = {};
  Object.keys(G.DEFAULTS.rules).forEach((k) => { rules[k] = all || ['names', 'titled', 'email', 'numbers'].includes(k); });
  state.settings.rules = rules;
  state.settings.minDigits = 5;
  drawAll(); save();
}

$('presetAll').addEventListener('click', () => preset(true));
$('presetBasic').addEventListener('click', () => preset(false));
$('minDigits').addEventListener('input', () => {
  const v = parseInt($('minDigits').value, 10);
  if (v >= 1 && v <= 20) { state.settings.minDigits = v; save(); }
});
$('custom').addEventListener('input', () => { state.custom = lines($('custom').value); save(); });
$('ignore').addEventListener('input', () => { state.ignore = lines($('ignore').value); save(); });
$('addPattern').addEventListener('click', () => {
  state.settings.patterns.push({ label: 'CUSTOM', regex: '', ignoreCase: true, enabled: true });
  drawPatterns();
  const rows = $('patterns').querySelectorAll('tbody tr');
  rows[rows.length - 1].querySelector('input').focus();
});
$('sample').addEventListener('input', preview);

// Keep the lists in step when the right-click menu changes them while this page is open.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.custom && document.activeElement !== $('custom')) { state.custom = changes.custom.newValue || []; $('custom').value = state.custom.join('\n'); }
  if (changes.ignore && document.activeElement !== $('ignore')) { state.ignore = changes.ignore.newValue || []; $('ignore').value = state.ignore.join('\n'); }
  preview();
});

chrome.storage.local.get(['settings', 'custom', 'ignore']).then((stored) => {
  const st = stored.settings || {};
  const rules = {};
  Object.keys(G.DEFAULTS.rules).forEach((k) => { rules[k] = st.rules && typeof st.rules[k] === 'boolean' ? st.rules[k] : G.DEFAULTS.rules[k]; });
  state = {
    settings: { rules, minDigits: st.minDigits || G.DEFAULTS.minDigits, patterns: (st.patterns || []).map((p) => ({ ...p })) },
    custom: stored.custom || [], ignore: stored.ignore || []
  };
  drawAll();
});
