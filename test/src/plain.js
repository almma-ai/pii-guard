import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
window.__sent = [];
function App() {
  const [v, setV] = useState('');
  window.__state = v;
  const send = () => { window.__sent.push(v); setV(''); };
  return React.createElement('form', { onSubmit: (e) => { e.preventDefault(); send(); } },
    React.createElement('textarea', { id: 'prompt-textarea', 'data-testid': 'text-input', rows: 4, value: v,
      style: { width: '600px', font: '16px/1.5 Arial', padding: '12px', border: '2px solid #888' },
      onChange: (e) => setV(e.target.value),
      onKeyDown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } } }),
    React.createElement('button', { id: 'send-button', 'data-testid': 'send-button', 'aria-label': 'Send message', type: 'submit', disabled: !v }, 'Send'));
}
createRoot(document.getElementById('app')).render(React.createElement(App));
