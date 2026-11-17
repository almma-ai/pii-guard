// PII Guard - page logic. Everything happens inside this browser tab.
// This file contains no code that transmits data anywhere.
(function () {
  'use strict';
  var G = globalThis.PIIGuard;
  var IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
  var MOD = IS_MAC ? '\u2318' : 'Ctrl';
  var approved = new Set();        // originals the user chose to keep, for this page session
  var passThrough = new WeakSet(); // events this script created itself
  var host = null, shadow = null, panel = null, mirrorBox = null, mirrorInner = null, toastEl = null;
  var activeRoot = null, refreshTimer = 0, panelOpen = false;

  // ---------- which elements are guarded ----------
  function editableRoot(node) {
    var el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (!el || el === host) return null;
    if (el.tagName === 'TEXTAREA') return el;
    if (el.isContentEditable) {
      while (el.parentElement && el.parentElement.isContentEditable) el = el.parentElement;
      return el;
    }
    return null;
  }
  function isMessageBox(el) {     // boxes where pressing Enter sends
    return el.isContentEditable || el.id === 'prompt-textarea';
  }

  // ---------- reading text ----------
  var BLOCK = /^(P|DIV|LI|UL|OL|H[1-6]|PRE|BLOCKQUOTE|TR|BR)$/;
  function collect(root) {         // rich-text box -> plain text plus a map back to its text nodes
    var text = '', segs = [];
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 3) {
        if (n.data.length) { segs.push({ node: n, start: text.length, len: n.data.length }); text += n.data; }
      } else if (BLOCK.test(n.tagName) && text.length && text[text.length - 1] !== '\n') {
        text += '\n';
      }
    }
    return { text: text, segs: segs };
  }
  function getText(root) { return root.tagName === 'TEXTAREA' ? root.value : collect(root).text; }

  // ---------- red marking inside the box ----------
  function ensureHost() {
    if (host) return;
    host = document.createElement('pii-guard-root');
    shadow = host.attachShadow({ mode: 'closed' });
    var style = document.createElement('style');
    style.textContent = PANEL_CSS;
    shadow.appendChild(style);
    mirrorBox = document.createElement('div'); mirrorBox.className = 'mirror';
    mirrorInner = document.createElement('div'); mirrorInner.className = 'mirror-inner';
    mirrorBox.appendChild(mirrorInner);
    shadow.appendChild(mirrorBox);
    document.documentElement.appendChild(host);
  }
  function clearMarks() {
    if (window.CSS && CSS.highlights) CSS.highlights.delete('pii-guard');
    if (mirrorBox) mirrorBox.style.display = 'none';
  }
  var COPY = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'fontKerning',
    'fontFeatureSettings', 'letterSpacing', 'wordSpacing', 'lineHeight', 'textTransform', 'textIndent', 'textAlign',
    'tabSize', 'direction', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
  function markTextarea(ta, text, matches) {
    ensureHost();
    var r = ta.getBoundingClientRect();
    if (!matches.length || !r.width || !r.height) { mirrorBox.style.display = 'none'; return; }
    var cs = getComputedStyle(ta);
    mirrorBox.style.display = 'block';
    mirrorBox.style.left = (r.left + parseFloat(cs.borderLeftWidth)) + 'px';
    mirrorBox.style.top = (r.top + parseFloat(cs.borderTopWidth)) + 'px';
    mirrorBox.style.width = ta.clientWidth + 'px';
    mirrorBox.style.height = ta.clientHeight + 'px';
    COPY.forEach(function (p) { mirrorInner.style[p] = cs[p]; });
    mirrorInner.style.width = ta.clientWidth + 'px';
    mirrorInner.style.transform = 'translate(' + (-ta.scrollLeft) + 'px,' + (-ta.scrollTop) + 'px)';
    mirrorInner.textContent = '';
    var pos = 0;
    matches.forEach(function (m) {
      mirrorInner.appendChild(document.createTextNode(text.slice(pos, m.start)));
      var s = document.createElement('span'); s.className = 'hit'; s.textContent = m.text;
      mirrorInner.appendChild(s);
      pos = m.end;
    });
    mirrorInner.appendChild(document.createTextNode(text.slice(pos) + '​'));
  }
  function markRich(root, c, matches) {
    if (mirrorBox) mirrorBox.style.display = 'none';
    if (!(window.CSS && CSS.highlights && window.Highlight)) return;
    var ranges = [];
    matches.forEach(function (m) {
      var a = null, b = null;
      for (var i = 0; i < c.segs.length; i++) {
        var s = c.segs[i];
        if (!a && m.start >= s.start && m.start < s.start + s.len) a = s;
        if (m.end > s.start && m.end <= s.start + s.len) { b = s; break; }
      }
      if (!a || !b) return;
      var range = new Range();
      range.setStart(a.node, m.start - a.start);
      range.setEnd(b.node, m.end - b.start);
      ranges.push(range);
    });
    if (ranges.length) CSS.highlights.set('pii-guard', new Highlight(...ranges));
    else CSS.highlights.delete('pii-guard');
  }
  function refresh() {
    var root = activeRoot;
    if (!root || !root.isConnected) { clearMarks(); return; }
    if (root.tagName === 'TEXTAREA') {
      if (window.CSS && CSS.highlights) CSS.highlights.delete('pii-guard');
      markTextarea(root, root.value, G.detect(root.value, approved));
    } else {
      var c = collect(root);
      markRich(root, c, G.detect(c.text, approved));
    }
  }
  function scheduleRefresh(delay) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, delay === undefined ? 120 : delay);
  }

  // ---------- putting text into the box ----------
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function squash(s) { return s.replace(/\s+/g, ''); }
  async function insertInto(root, text, where) {   // where: {all:true} or a saved caret
    var before = squash(getText(root));
    root.focus();
    if (root.tagName === 'TEXTAREA') {
      if (where.all) root.select(); else root.setSelectionRange(where.start, where.end);
      var ok = document.execCommand('insertText', false, text);
      if (!ok || squash(root.value).indexOf(squash(text)) === -1) {   // fallback for frameworks that ignore it
        var s = where.all ? 0 : where.start, e = where.all ? root.value.length : where.end;
        var next = root.value.slice(0, s) + text + root.value.slice(e);
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(root, next);
        root.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    } else {
      var sel = window.getSelection();
      sel.removeAllRanges();
      var haveCaret = !where.all && where.range && root.contains(where.range.startContainer);
      if (haveCaret) sel.addRange(where.range);
      else { sel.selectAllChildren(root); if (!where.all) sel.collapseToEnd(); }
      await sleep(60);                                    // let the editor notice the selection
      var dt = new DataTransfer();
      dt.setData('text/plain', text);
      var ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      passThrough.add(ev);
      var unhandled = root.dispatchEvent(ev);
      if (unhandled) document.execCommand('insertText', false, text);
    }
    // Some editors (e.g. ProseMirror in Firefox) insert a moment later; wait up to 1.5 s before calling it a failure.
    var wanted = squash(text);
    var landed = function () {
      var after = squash(getText(root));
      return (after !== before || wanted === '') && after.indexOf(wanted.slice(0, 60)) !== -1;
    };
    for (var waited = 0; waited <= 1500; waited += 50) {
      if (landed()) return true;
      await sleep(50);
    }
    return false;
  }
  function saveCaret(root) {
    if (root.tagName === 'TEXTAREA') return { start: root.selectionStart, end: root.selectionEnd };
    var sel = window.getSelection();
    var range = sel.rangeCount && root.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    return { range: range };
  }

  // ---------- review panel ----------
  var PANEL_CSS =
    ':host{all:initial}' +
    '.mirror{position:fixed;display:none;overflow:hidden;pointer-events:none;z-index:2147483646}' +
    '.mirror-inner{box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;color:transparent}' +
    '.hit{background:rgba(255,0,0,.16);text-decoration:underline wavy red;text-decoration-skip-ink:none}' +
    '.veil{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483647;display:flex;align-items:center;justify-content:center;font:14px/1.45 system-ui,Segoe UI,sans-serif;color:#111}' +
    '.box{background:#fff;width:min(760px,92vw);max-height:88vh;display:flex;flex-direction:column;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,.4);overflow:hidden}' +
    '.head{padding:14px 18px;font-weight:600;font-size:16px;border-bottom:1px solid #ddd}' +
    '.sub{font-weight:400;font-size:13px;color:#555;margin-top:2px}' +
    '.body{padding:12px 18px;overflow:auto}' +
    '.preview{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #ccc;border-radius:6px;padding:10px;max-height:30vh;overflow:auto;background:#fafafa}' +
    '.preview .on{background:rgba(255,0,0,.16);text-decoration:underline wavy red}' +
    '.preview .off{background:#e8e8e8}' +
    '.tools{margin:10px 0 4px;font-size:13px}' +
    '.tools button{font:inherit;border:0;background:none;color:#0645ad;cursor:pointer;padding:0;margin-right:14px;text-decoration:underline}' +
    '.row{display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid #eee}' +
    '.row input{width:16px;height:16px;flex:none}' +
    '.type{flex:none;width:64px;font-size:11px;color:#666}' +
    '.orig{flex:1;font-family:ui-monospace,Consolas,monospace;overflow-wrap:anywhere}' +
    '.tok{flex:none;font-family:ui-monospace,Consolas,monospace;color:#a00}' +
    '.foot{padding:12px 18px;border-top:1px solid #ddd;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}' +
    '.foot button{font:inherit;padding:8px 14px;border-radius:6px;border:1px solid #999;background:#fff;color:#111;cursor:pointer}' +
    '.foot kbd{font:11px ui-monospace,Consolas,monospace;margin-left:8px;padding:1px 5px;border:1px solid currentColor;border-radius:4px;opacity:.75}' +
    '.foot .primary{background:#b00020;border-color:#b00020;color:#fff;font-weight:600}' +
    '.fail{margin-top:10px;color:#b00020;font-weight:600}' +
    '.manual{width:100%;box-sizing:border-box;height:120px;margin-top:6px;font:13px ui-monospace,Consolas,monospace}' +
    '.preview .restored{background:#d8f0e4;border-bottom:2px solid #1a7f4b}' +
    '.preview .unknown{background:#fff1c2}' +
    '.note{margin-top:8px;font-size:13px;color:#555}' +
    '.toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#111;color:#fff;padding:10px 14px;border-radius:8px;font:13px system-ui,Segoe UI,sans-serif;max-width:360px}';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function toast(msg) {
    ensureHost();
    if (toastEl) toastEl.remove();
    toastEl = el('div', 'toast', msg);
    shadow.appendChild(toastEl);
    var mine = toastEl;
    setTimeout(function () { mine.remove(); }, 5000);
  }
  function button(label, hint, cls) {
    var b = el('button', cls, label);
    if (hint) b.appendChild(el('kbd', '', hint));
    return b;
  }
  function closePanel() {
    if (panel) panel.remove();
    panel = null; panelOpen = false;
  }

  // Ask the background worker for placeholders. Any failure keeps the text out of the page.
  function ask(msg) {
    try { return chrome.runtime.sendMessage(msg); }
    catch (err) { return Promise.reject(err); }
  }
  function workerFailed() {
    closePanel();
    toast('PII Guard was updated or restarted. Reload this tab. Nothing was inserted or sent.');
  }

  // job: {mode:'paste'|'send', text, matches, root, caret}
  function openPanel(job) {
    ensureHost();
    closePanel();
    panelOpen = true;                       // blocks further pastes and sends while we wait
    var seen = new Map();
    job.matches.forEach(function (m) { seen.set(m.type + '|' + G.key(m.text), { type: m.type, text: m.text }); });
    var items = Array.from(seen.values());
    ask({ op: 'tokens', items: items }).then(function (tokens) {
      if (!Array.isArray(tokens) || tokens.length !== items.length) throw new Error('bad reply');
      var tokenMap = new Map();
      items.forEach(function (it, i) { tokenMap.set(it.type + '|' + G.key(it.text), tokens[i]); });
      buildPanel(job, tokenMap);
    }).catch(workerFailed);
  }

  function buildPanel(job, tokenMap) {
    var tokenOf = function (m) { return tokenMap.get(m.type + '|' + G.key(m.text)); };
    var finishing = false;
    var groups = new Map();   // one row per distinct original
    job.matches.forEach(function (m) {
      var k = m.type + '|' + G.key(m.text);
      if (!groups.has(k)) groups.set(k, { type: m.type, text: m.text, on: true, count: 0 });
      groups.get(k).count++;
    });
    var groupOf = function (m) { return groups.get(m.type + '|' + G.key(m.text)); };

    panel = el('div', 'veil');
    var box = el('div', 'box');
    var head = el('div', 'head', 'PII Guard: ' + job.matches.length + ' flagged item' + (job.matches.length === 1 ? '' : 's'));
    head.appendChild(el('div', 'sub', job.mode === 'paste'
      ? 'Nothing has been put in the message box yet. Ticked items will be replaced by placeholders.'
      : 'Sending was stopped. This text is already in the message box. Ticked items will be replaced by placeholders.'));
    var body = el('div', 'body');
    var preview = el('div', 'preview');
    var list = el('div');
    var tools = el('div', 'tools');
    var failBox = el('div');

    function drawPreview() {
      preview.textContent = '';
      var pos = 0;
      job.matches.forEach(function (m) {
        preview.appendChild(document.createTextNode(job.text.slice(pos, m.start)));
        var g = groupOf(m);
        preview.appendChild(el('span', g.on ? 'on' : 'off', g.on ? anonymizerPreview(m) : m.text));
        pos = m.end;
      });
      preview.appendChild(document.createTextNode(job.text.slice(pos)));
    }
    function anonymizerPreview(m) { return m.text + ' → ' + tokenOf(m); }
    function drawList() {
      list.textContent = '';
      groups.forEach(function (g) {
        var row = el('label', 'row');
        var cb = el('input'); cb.type = 'checkbox'; cb.checked = g.on;
        cb.addEventListener('change', function () { g.on = cb.checked; drawPreview(); });
        row.appendChild(cb);
        row.appendChild(el('span', 'type', g.type + (g.count > 1 ? ' ×' + g.count : '')));
        row.appendChild(el('span', 'orig', g.text));
        row.appendChild(el('span', 'tok', tokenOf(g)));
        list.appendChild(row);
      });
    }
    function setAll(v) { groups.forEach(function (g) { g.on = v; }); drawList(); drawPreview(); }
    var allBtn = el('button', '', 'Tick all'); allBtn.addEventListener('click', function () { setAll(true); });
    var noneBtn = el('button', '', 'Untick all'); noneBtn.addEventListener('click', function () { setAll(false); });
    tools.appendChild(allBtn); tools.appendChild(noneBtn);

    async function finish(replaceTicked) {
      if (finishing) return;
      finishing = true;
      var useToken = tokenOf;
      if (replaceTicked) {
        // Reserve placeholders only for the items actually being replaced.
        var ticked = [];
        groups.forEach(function (g) { if (g.on) ticked.push({ type: g.type, text: g.text }); });
        try {
          var reserved = ticked.length ? await ask({ op: 'tokens', items: ticked, commit: true }) : [];
          if (!Array.isArray(reserved) || reserved.length !== ticked.length) throw new Error('bad reply');
          var final = new Map();
          ticked.forEach(function (it, i) { final.set(it.type + '|' + G.key(it.text), reserved[i]); });
          useToken = function (m) { return final.get(m.type + '|' + G.key(m.text)); };
        } catch (err) { workerFailed(); return; }
      }
      var out = G.applyTokens(job.text, job.matches, useToken, function (m) { return replaceTicked && groupOf(m).on; });
      job.matches.forEach(function (m) { if (!replaceTicked || !groupOf(m).on) approved.add(G.key(m.text)); });
      var unchanged = out === job.text;
      var ok = true;
      if (!(job.mode === 'send' && unchanged)) {
        ok = await insertInto(job.root, out, job.mode === 'send' ? { all: true } : job.caret);
      } else {
        job.root.focus();
      }
      if (!ok) {
        failBox.textContent = '';
        failBox.appendChild(el('div', 'fail', 'The page did not accept the text. Nothing was inserted. Copy it from here by hand:'));
        var ta = el('textarea', 'manual'); ta.readOnly = true; ta.value = out;
        failBox.appendChild(ta);
        ta.select();
        return;
      }
      closePanel();
      activeRoot = job.root;
      scheduleRefresh(0);
      toast(job.mode === 'send' ? 'PII Guard: reviewed. Press Enter or Send again to send.' : 'PII Guard: text inserted.');
    }
    function cancel() { closePanel(); job.root.focus(); }

    var foot = el('div', 'foot');
    var cancelBtn = button('Cancel', 'Esc', ''); cancelBtn.addEventListener('click', cancel);
    var keepBtn = button(job.mode === 'paste' ? 'Insert original, unchanged' : 'Keep everything as it is', MOD + '+Enter', '');
    keepBtn.addEventListener('click', function () { finish(false); });
    var goBtn = button(job.mode === 'paste' ? 'Insert with ticked items replaced' : 'Replace ticked items in the box', 'Enter', 'primary');
    goBtn.addEventListener('click', function () { finish(true); });
    foot.appendChild(cancelBtn); foot.appendChild(keepBtn); foot.appendChild(goBtn);
    panel.primary = function () { finish(true); };
    panel.keep = function () { finish(false); };

    body.appendChild(preview); body.appendChild(tools); body.appendChild(list); body.appendChild(failBox);
    box.appendChild(head); box.appendChild(body); box.appendChild(foot);
    panel.appendChild(box);
    panel.cancel = cancel;
    drawList(); drawPreview();
    shadow.appendChild(panel);
    goBtn.focus();
  }

  // ---------- settings (from the Settings page and the right-click menu) ----------
  var lists = { custom: [], ignore: [] };
  function applySettings(stored) {
    var before = new Set(lists.custom.map(G.key));
    lists.custom = stored.custom || [];
    lists.ignore = stored.ignore || [];
    lists.custom.forEach(function (t) { if (!before.has(G.key(t))) approved.delete(G.key(t)); });  // an earlier "keep" no longer applies
    var st = stored.settings || {};
    G.setConfig({ rules: st.rules, minDigits: st.minDigits, patterns: st.patterns, custom: lists.custom, ignore: lists.ignore });
    scheduleRefresh(0);
  }
  var loadSettings = function () {
    chrome.storage.local.get(['settings', 'custom', 'ignore']).then(applySettings).catch(function () {});
  };
  loadSettings();
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && (changes.settings || changes.custom || changes.ignore)) loadSettings();
  });

  // ---------- showing originals for placeholders in a reply ----------
  var lastSelection = '';
  window.addEventListener('contextmenu', function (e) {
    var t = e.target;
    if (t && t.tagName === 'TEXTAREA') lastSelection = t.value.slice(t.selectionStart, t.selectionEnd);
    else lastSelection = String(window.getSelection() || '');
  }, true);

  function showOriginals(text) {
    ask({ op: 'restore', text: text }).then(function (res) {
      if (!res || !Array.isArray(res.parts)) throw new Error('bad reply');
      if (!res.count && !res.unknown) { toast('PII Guard: no placeholders like [NAME_1] in the selected text.'); return; }
      ensureHost();
      closePanel();
      panelOpen = true;
      panel = el('div', 'veil');
      var box = el('div', 'box');
      var head = el('div', 'head', 'PII Guard: ' + res.count + ' placeholder' + (res.count === 1 ? '' : 's') + ' restored');
      head.appendChild(el('div', 'sub', 'Shown only in this panel. Nothing is put back into the page.'));
      var body = el('div', 'body');
      var preview = el('div', 'preview');
      var restoredText = '';
      res.parts.forEach(function (p) {
        if (p.plain !== undefined) { preview.appendChild(document.createTextNode(p.plain)); restoredText += p.plain; }
        else if (p.original === null) { preview.appendChild(el('span', 'unknown', p.token)); restoredText += p.token; }
        else {
          var sp = el('span', 'restored', p.original); sp.title = p.token;
          preview.appendChild(sp); restoredText += p.original;
        }
      });
      body.appendChild(preview);
      if (res.unknown) body.appendChild(el('div', 'note', res.unknown + ' placeholder' + (res.unknown === 1 ? ' is' : 's are') +
        ' not in the key (shown in yellow). The key is erased when Chrome closes.'));
      var copyBox = el('div');
      body.appendChild(copyBox);
      var foot = el('div', 'foot');
      var closeBtn = button('Close', 'Esc', '');
      var copyBtn = button('Copy restored text', 'Enter', 'primary');
      var cancel = function () { closePanel(); };
      closeBtn.addEventListener('click', cancel);
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(restoredText).then(function () {
          closePanel(); toast('PII Guard: restored text copied. If you paste it back into a chat, it will be checked again.');
        }).catch(function () {
          copyBox.textContent = '';
          copyBox.appendChild(el('div', 'note', 'Copying was blocked. Select the text below and press Ctrl+C:'));
          var ta = el('textarea', 'manual'); ta.readOnly = true; ta.value = restoredText;
          copyBox.appendChild(ta); ta.select();
        });
      });
      foot.appendChild(closeBtn); foot.appendChild(copyBtn);
      box.appendChild(head); box.appendChild(body); box.appendChild(foot);
      panel.appendChild(box);
      panel.cancel = cancel;
      panel.primary = function () { copyBtn.click(); };
      shadow.appendChild(panel);
      copyBtn.focus();
    }).catch(workerFailed);
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.op === 'list-result') {
      var r = msg.result || {};
      var name = r.list === 'ignore' ? 'never-flag' : 'always-flag';
      if (!r.ok) toast('PII Guard: ' + (r.reason || 'could not add that.'));
      else toast('PII Guard: "' + r.term + '"' + (r.already ? ' is already on the ' + name + ' list.' :
        (r.list === 'ignore' ? ' will never be flagged.' : ' will always be flagged.')));
    } else if (msg.op === 'show-originals') {
      showOriginals(lastSelection || msg.fallback || '');
    }
  });

  // ---------- interception ----------
  function fromPanel(e) { return host && e.target === host; }

  function onIncomingText(e, data) {      // paste and drop share this
    if (passThrough.has(e) || fromPanel(e)) return;
    var root = editableRoot(e.target);
    if (!root || !data) return;
    if (panelOpen) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    var text = data.getData('text/plain');
    if (!text) return;                    // files or images only: not inspected in this version
    var matches = G.detect(text, approved);
    if (!matches.length) { scheduleRefresh(); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    openPanel({ mode: 'paste', text: text, matches: matches, root: root, caret: saveCaret(root) });
  }
  window.addEventListener('paste', function (e) { onIncomingText(e, e.clipboardData); }, true);
  window.addEventListener('drop', function (e) { onIncomingText(e, e.dataTransfer); }, true);

  function guardSend(e, root) {           // true = sending was stopped
    if (!root || !root.isConnected) return false;
    var text = getText(root);
    var matches = G.detect(text, approved);
    if (!matches.length) return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!panelOpen) openPanel({ mode: 'send', text: text, matches: matches, root: root, caret: null });
    return true;
  }
  // Keys pressed inside the review panel stay private to it.
  ['keydown', 'keyup', 'keypress'].forEach(function (type) {
    window.addEventListener(type, function (e) {
      if (!fromPanel(e)) return;
      e.stopPropagation();
      if (type !== 'keydown' || !panel || e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); panel.cancel(); return; }
      if (e.key !== 'Enter' || e.shiftKey || e.altKey) return;
      var focused = shadow.activeElement;
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); if (panel.keep) panel.keep(); return; }
      if (focused && (focused.tagName === 'BUTTON' || focused.tagName === 'TEXTAREA')) return;  // let the focused button act
      e.preventDefault();
      if (panel.primary) panel.primary();
    }, true);
  });
  window.addEventListener('keydown', function (e) {
    if (fromPanel(e) || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    var root = editableRoot(e.target);
    if (root && isMessageBox(root)) guardSend(e, root);
  }, true);
  window.addEventListener('click', function (e) {
    if (fromPanel(e) || !e.target || !e.target.closest) return;
    var btn = e.target.closest('button');
    if (!btn) return;
    var label = (btn.getAttribute('aria-label') || '') + ' ' + (btn.getAttribute('data-testid') || '') + ' ' + btn.id;
    if (!/send/i.test(label)) return;
    var root = activeRoot && activeRoot.isConnected ? activeRoot : null;
    if (root && isMessageBox(root)) guardSend(e, root);
  }, true);
  window.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || !form.querySelectorAll) return;
    var boxes = form.querySelectorAll('textarea');
    for (var i = 0; i < boxes.length; i++) if (guardSend(e, boxes[i])) return;
  }, true);

  // ---------- keep the red marks current ----------
  function track(e) {
    if (fromPanel(e)) return;
    var root = editableRoot(e.target);
    if (root) { activeRoot = root; scheduleRefresh(); }
  }
  window.addEventListener('input', track, true);
  window.addEventListener('focusin', track, true);
  window.addEventListener('scroll', function () { if (activeRoot && activeRoot.tagName === 'TEXTAREA') scheduleRefresh(0); }, true);
  window.addEventListener('resize', function () { scheduleRefresh(0); });
  // The page can change or empty the box by itself (for example after sending), so re-check regularly.
  var lastSeen = '';
  setInterval(function () {
    if (!activeRoot || panelOpen) return;
    if (!activeRoot.isConnected) { activeRoot = null; clearMarks(); lastSeen = ''; return; }
    var r = activeRoot.getBoundingClientRect();
    var now = getText(activeRoot) + '|' + r.left + ',' + r.top + ',' + r.width + ',' + r.height + '|' + approved.size;
    if (now !== lastSeen) { lastSeen = now; refresh(); }
  }, 700);
})();
