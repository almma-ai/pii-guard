// Stand-in for chatgpt.com. Its structure was copied from the live page on 27 Nov 2026:
//  - the message box is a ProseMirror <div contenteditable> with no id, inside <form data-chatgpt-composer>
//  - the Send button is <button type="submit" aria-label="Send"> with no id and no data-testid;
//    on the start page it exists only while the box has text (an empty box shows "Start Voice" instead)
//  - Shift+Enter starts a new paragraph; an empty line is an empty <p>
//  - pasted text goes in "literally": one paragraph, each line break a <br>, blank lines kept
//  - a "writing block" in a reply is another ProseMirror box that is NOT in a form; Enter starts a new line there
//  - editing a sent message opens a third ProseMirror box in a form of its own, with a Cancel button and a
//    <button type="submit">Send</button> that has no aria-label
// ?send=Enviar gives the Send button another label, as in a non-English ChatGPT.
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Fragment, Slice } from '@tiptap/pm/model';

window.__sent = [];
window.__edits = [];
const sendLabel = new URLSearchParams(location.search).get('send') || 'Send';

function literalPaste(view, e) {
  const text = e.clipboardData && e.clipboardData.getData('text/plain');
  if (!text) return false;
  const { schema } = view.state;
  const nodes = [];
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, i) => {
    if (i) nodes.push(schema.nodes.hardBreak.create());
    if (line) nodes.push(schema.text(line));
  });
  view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.from(nodes), 0, 0)).scrollIntoView());
  return true;
}

// A box that sends on Enter and starts a new paragraph on Shift+Enter, as the message box and the edit box do.
function sendingBox(element, label, onSend, onUpdate) {
  const editor = new Editor({
    element, extensions: [StarterKit], content: '', injectCSS: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': label, 'data-composer-markdown': '' },
      handleKeyDown(view, e) {
        if (e.key !== 'Enter') return false;
        if (e.shiftKey) { editor.commands.splitBlock(); return true; }
        onSend(editor);               // straight to the send code, not through the form
        return true;
      },
      handlePaste: literalPaste
    },
    onUpdate: onUpdate || (() => {})
  });
  return editor;
}
function take(editor, list) {
  if (editor.isEmpty) return;
  list.push(editor.getText({ blockSeparator: '\n' }));
  editor.commands.clearContent(true);
}

// ---- message box
const form = document.getElementById('composer');
const action = document.getElementById('action');
function drawAction() {
  const want = editor.isEmpty ? 'voice' : 'send';
  if (action.dataset.kind === want) return;
  action.dataset.kind = want;
  action.textContent = '';
  const b = document.createElement('button');
  if (want === 'send') { b.type = 'submit'; b.setAttribute('aria-label', sendLabel); b.textContent = '↑'; }
  else { b.type = 'button'; b.setAttribute('aria-label', 'Start Voice'); b.textContent = '∿'; }
  action.appendChild(b);
}
const editor = sendingBox(document.getElementById('ed'), 'Ask ChatGPT', (ed) => take(ed, window.__sent), drawAction);
window.__editor = editor;
form.addEventListener('submit', (e) => { e.preventDefault(); take(editor, window.__sent); });
drawAction();

// ---- writing block in a reply: not in a form, Enter only starts a new line
window.__writing = new Editor({
  element: document.getElementById('writing'), extensions: [StarterKit], content: '', injectCSS: false,
  editorProps: { attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Start writing' }, handlePaste: literalPaste }
});

// ---- editing a sent message: a box in a form of its own
const editForm = document.getElementById('edit-form');
window.__edit = sendingBox(document.getElementById('edit-ed'), 'Edit message', (ed) => take(ed, window.__edits));
editForm.addEventListener('submit', (e) => { e.preventDefault(); take(window.__edit, window.__edits); });
