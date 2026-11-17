window.__sent = [];
const ta = document.getElementById('prompt-textarea');
document.getElementById('composer').addEventListener('submit', (e) => { e.preventDefault(); window.__sent.push(ta.value); ta.value = ''; });
ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('send-button').click(); } });
