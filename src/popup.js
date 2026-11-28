// PII Guard - toolbar window. Reads and edits the extension's own storage only.
// This file contains no code that transmits data anywhere.
'use strict';

const TOKEN = /\[[A-Z][A-Z0-9]{1,15}_\d+\]/g;   // [NAME_1], [DATE_3], [COURSE_2] ...
const $ = (id) => document.getElementById(id);
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

let byToken = {};

async function drawKey() {
  const { key } = await chrome.storage.session.get('key');
  byToken = (key && key.byToken) || {};
  const order = (key && key.order) || [];
  const box = $('key');
  box.textContent = '';
  if (!order.length) { box.appendChild(el('div', 'empty', 'No placeholders yet.')); return; }
  const table = el('table');
  order.forEach((token) => {
    const tr = el('tr');
    tr.appendChild(el('td', 'tok', token));
    tr.appendChild(el('td', '', byToken[token]));
    table.appendChild(tr);
  });
  box.appendChild(table);
}

function drawRestore() {
  const text = $('reply').value;
  const out = $('restored');
  out.textContent = '';
  let restored = '', pos = 0, found = 0;
  text.replace(TOKEN, (token, offset) => {
    const plain = text.slice(pos, offset);
    out.appendChild(document.createTextNode(plain)); restored += plain;
    if (Object.prototype.hasOwnProperty.call(byToken, token)) {
      const s = el('span', 'restored', byToken[token]); s.title = token;
      out.appendChild(s); restored += byToken[token];
    } else {
      out.appendChild(el('span', 'unknown', token)); restored += token;
    }
    found++;
    pos = offset + token.length;
    return token;
  });
  if (!found) { out.textContent = ''; $('copy').hidden = true; return; }
  const tail = text.slice(pos);
  out.appendChild(document.createTextNode(tail)); restored += tail;
  $('copy').hidden = false;
  $('copy').onclick = () => navigator.clipboard.writeText(restored).then(() => { $('copy').textContent = 'Copied'; });
}

$('forget').addEventListener('click', async () => {
  await chrome.storage.session.remove('key');
  await drawKey();
  drawRestore();
});
$('reply').addEventListener('input', drawRestore);
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

// Firefox lets people withhold or later remove site access; check it and offer to grant it.
const ORIGINS = (chrome.runtime.getManifest().content_scripts || []).flatMap((c) => c.matches || []);
const HOSTS = [...new Set(ORIGINS.map((o) => { try { return new URL(o.replace('*', '')).hostname; } catch (e) { return o; } }))];
$('allow').textContent = 'Allow on ' + (HOSTS.length > 1 ? HOSTS.slice(0, -1).join(', ') + ' and ' + HOSTS[HOSTS.length - 1] : HOSTS[0]);
async function checkAccess() {
  let has = true;
  try { has = await chrome.permissions.contains({ origins: ORIGINS }); } catch (e) { has = true; }
  $('access').hidden = has;
  return has;
}
$('allow').addEventListener('click', async () => {
  let granted = false;
  try { granted = await chrome.permissions.request({ origins: ORIGINS }); } catch (e) { granted = false; }
  if (await checkAccess() || granted) $('accessNote').textContent = 'Allowed. Reload your open chat tabs.';
  else { $('access').hidden = false; $('accessNote').textContent = 'Not allowed. You can also allow it in the add-ons manager.'; }
});

drawKey();
checkAccess();
