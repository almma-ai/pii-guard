// Builds dist/chrome and dist/firefox from src/, plus a zip of each.
// Usage: node build.js        (no dependencies; needs the `zip` command)
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const DIST = process.env.PII_GUARD_DIST || path.join(ROOT, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const SITES = ['https://claude.ai/*', 'https://chatgpt.com/*', 'https://gemini.google.com/*', 'https://chat.almma.ai/*'];

const base = {
  manifest_version: 3,
  name: 'Almma\u2019s PII Guard',
  version: pkg.version,
  description: 'Flags names, numbers and other personal data before you send it to Claude, ChatGPT, Gemini or AlmmaGPT. Runs only on your computer.',
  permissions: ['contextMenus', 'storage'],
  icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png', 48: 'icons/icon48.png', 128: 'icons/icon128.png' },
  action: { default_title: 'Almma\u2019s PII Guard', default_popup: 'popup.html',
    default_icon: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' } },
  options_ui: { page: 'options.html', open_in_tab: true },
  content_scripts: [{
    matches: SITES,
    js: ['roster.js', 'patterns.js', 'content.js'],
    css: ['highlight.css'],
    run_at: 'document_start'
  }]
};

const targets = {
  chrome: { ...base, background: { service_worker: 'background.js' } },
  firefox: {
    ...base,
    background: { scripts: ['background.js'] },
    host_permissions: SITES,
    browser_specific_settings: {
      gecko: {
        id: 'pii-guard@almma.ai',
        strict_min_version: '142.0',
        data_collection_permissions: { required: ['none'] }
      }
    }
  }
};

// Optional: extra sites for local testing only (never used for store builds).
const extra = (process.env.PII_GUARD_EXTRA_MATCHES || '').split(',').filter(Boolean);

fs.rmSync(DIST, { recursive: true, force: true });
for (const [name, manifest] of Object.entries(targets)) {
  const out = path.join(DIST, name);
  fs.cpSync(SRC, out, { recursive: true, filter: (p) => !p.endsWith('icon512.png') });
  if (extra.length) {
    manifest.content_scripts[0].matches = SITES.concat(extra);
    if (manifest.host_permissions) manifest.host_permissions = SITES.concat(extra);
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const zip = path.join(DIST, `pii-guard-${name}-${pkg.version}.zip`);
  execFileSync('zip', ['-q', '-r', '-X', zip, '.'], { cwd: out });
  console.log('built', path.relative(ROOT, out), '+', path.relative(ROOT, zip));
}
