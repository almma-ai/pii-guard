// Stand-in for gemini.google.com. Its structure was copied from the live page on 27 Nov 2026:
//  - the message box is a Quill 1.3.7 editor: <rich-textarea> holding <div class="ql-editor" contenteditable>
//    and Quill's hidden helper box <div class="ql-clipboard" contenteditable> (zero width, far off screen)
//  - no <form> anywhere
//  - Enter sends, Shift+Enter starts a new paragraph; an empty line is <p><br></p>
//  - a paste is taken from the paste event itself and goes in as plain text, blank lines and spaces kept
//  - the Send button is <gem-icon-button class="send-button has-input submit"><button aria-label="Send message">;
//    it exists only while the box has text. While a reply is being written the same slot holds
//    <gem-icon-button class="send-button stop"><button aria-label="Stop response">
//  - editing a sent prompt opens a second Quill box in its own <rich-textarea>, with
//    <gem-button class="cancel-button"><button>Cancel</button> and
//    <gem-button class="update-button"><button>Update</button>; these buttons have no aria-label
// ?send=Odeslat and ?update=Aktualizovat relabel the buttons, as in a non-English Gemini.
// ?slow=1 keeps the "reply is being written" state until the Stop button is clicked.
import Quill from 'quill';

const params = new URLSearchParams(location.search);
const sendLabel = params.get('send') || 'Send message';
const updateLabel = params.get('update') || 'Update';
const slow = params.get('slow') === '1';
window.__sent = [];
window.__edits = [];
window.__stopped = 0;

function makeBox(container, onEnter) {
  const quill = new Quill(container, {
    modules: {
      toolbar: false,
      keyboard: { bindings: { send: { key: 13, shiftKey: false, handler() { onEnter(quill); return false; } } } }
    }
  });
  quill.root.setAttribute('role', 'textbox');
  quill.root.setAttribute('aria-multiline', 'true');
  quill.root.setAttribute('aria-label', 'Enter a prompt for Gemini');
  // Gemini reads the pasted text from the event; Quill's own paste code (which waits for the browser to
  // fill the hidden helper box) then does nothing, because the event is already marked as handled.
  quill.root.addEventListener('paste', (e) => {
    const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
    if (!text) return;
    e.preventDefault();
    const range = quill.getSelection(true);
    quill.deleteText(range.index, range.length, 'user');
    quill.insertText(range.index, text.replace(/\r\n?/g, '\n'), 'user');
    quill.setSelection(range.index + text.length, 0, 'silent');
  }, true);
  return quill;
}
const textOf = (quill) => quill.getText().replace(/\n$/, '');
function take(quill, list) {
  const text = textOf(quill);
  if (!text.trim()) return false;
  list.push(text);
  quill.setText('', 'user');
  return true;
}

// ---- message box
const slot = document.getElementById('send-slot');
let writing = false;
function drawSlot() {
  const want = writing ? 'stop' : (textOf(composer).trim() ? 'submit' : 'none');
  if (slot.dataset.kind === want) return;
  slot.dataset.kind = want;
  slot.textContent = '';
  if (want === 'none') return;
  const wrap = document.createElement('gem-icon-button');
  const b = document.createElement('button');
  if (want === 'submit') {
    wrap.className = 'send-button has-input submit';
    b.setAttribute('aria-label', sendLabel); b.textContent = '↑';
    b.addEventListener('click', send);
  } else {
    wrap.className = 'send-button stop';
    b.setAttribute('aria-label', 'Stop response'); b.textContent = '■';
    b.addEventListener('click', () => { window.__stopped++; writing = false; drawSlot(); });
  }
  wrap.appendChild(b);
  slot.appendChild(wrap);
}
function send() {
  if (writing) return;
  if (take(composer, window.__sent) && slow) writing = true;
  drawSlot();
}
const composer = makeBox(document.getElementById('composer-box'), send);
composer.on('text-change', drawSlot);
window.__quill = composer;
drawSlot();

// ---- editing a sent prompt
const edit = makeBox(document.getElementById('edit-box'), () => take(edit, window.__edits));
window.__edit = edit;
const update = document.querySelector('.update-button > button');
update.textContent = updateLabel;
update.addEventListener('click', () => take(edit, window.__edits));

// ---- a rich-text box that is not a message box (a document editor): Enter only starts a new line
const doc = new Quill(document.getElementById('doc-box'), { modules: { toolbar: false } });
window.__doc = doc;
