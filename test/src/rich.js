import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
window.__sent = [];
const editor = new Editor({ element: document.getElementById('ed'), extensions: [StarterKit], content: '',
  editorProps: { handleKeyDown(view, e) { if (e.key === 'Enter' && !e.shiftKey) { send(); return true; } return false; } } });
window.__editor = editor;
function send() { window.__sent.push(editor.getText({ blockSeparator: '\n' })); editor.commands.clearContent(); }
document.getElementById('send').addEventListener('click', send);
