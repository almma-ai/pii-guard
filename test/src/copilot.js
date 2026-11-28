// Stand-in for Microsoft Copilot Chat (copilot.cloud.microsoft). Its structure was copied from the live page
// on 27 Nov 2026:
//  - the message box is a Lexical rich-text editor:
//    <span id="m365-chat-editor-target-element" role="textbox" contenteditable aria-label="Message Copilot">
//    inside <div id="m365-chat-input-shared-container">; there is no <form> anywhere
//  - Enter sends, Shift+Enter starts a new paragraph; a pasted blank line becomes <p><br></p>
//  - after the text the live editor keeps <span aria-hidden="true">&#8203;&#8204;</span> (two invisible
//    characters). Lexical would remove a span it did not make, so this stand-in shows it in a separate,
//    plain rich-text box (#note) instead.
//  - the Send button exists only while the box has text:
//    <button type="submit" aria-label="Send" class="fui-Button fai-SendButton fai-BebopLiteChatInput__send">
// ?send=Odeslat relabels the Send button, as in a non-English Copilot.
import { createEditor, $getRoot, COMMAND_PRIORITY_HIGH, KEY_ENTER_COMMAND } from 'lexical';
import { registerRichText, HeadingNode, QuoteNode } from '@lexical/rich-text';

const params = new URLSearchParams(location.search);
const sendLabel = params.get('send') || 'Send';
window.__sent = [];

const root = document.getElementById('m365-chat-editor-target-element');
const editor = createEditor({ namespace: 'copilot-stand-in', nodes: [HeadingNode, QuoteNode], onError: (e) => { throw e; } });
editor.setRootElement(root);
registerRichText(editor);
const textOf = () => editor.getEditorState().read(() => $getRoot().getTextContent()).replace(/\n\n/g, '\n');
window.__lexicalText = () => editor.getEditorState().read(() =>
  $getRoot().getChildren().map((p) => p.getTextContent()).join('\n'));

function send() {
  const text = window.__lexicalText();
  if (!text.trim()) return;
  window.__sent.push(text);
  editor.update(() => { $getRoot().clear(); });
}
editor.registerCommand(KEY_ENTER_COMMAND, (e) => {
  if (e && e.shiftKey) return false;            // a new paragraph
  if (e) e.preventDefault();
  send();
  return true;
}, COMMAND_PRIORITY_HIGH);

const slot = document.getElementById('send-slot');
function drawSlot() {
  const want = textOf().trim() ? 'send' : 'none';
  if (slot.dataset.kind === want) return;
  slot.dataset.kind = want;
  slot.textContent = '';
  if (want === 'none') return;
  const b = document.createElement('button');
  b.type = 'submit';
  b.className = 'fui-Button r1f29ykk fai-SendButton fai-BebopLiteChatInput__send';
  b.setAttribute('aria-label', sendLabel);
  b.textContent = '↑';
  b.addEventListener('click', send);
  slot.appendChild(b);
}
editor.registerUpdateListener(drawSlot);
drawSlot();
