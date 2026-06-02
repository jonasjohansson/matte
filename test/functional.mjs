#!/usr/bin/env node
// Functional smoke test — exercises the interactive paths the render-only smoke
// test doesn't cover (randomize, presets, mode-switching, reset). Catches the
// class of regression the Tweakpane removal could have introduced. Fails on any
// console/page error or a broken assertion.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8861;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p)); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const b = await readFile(f); res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' }); res.end(b);
  } catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(PORT, r));

const fails = [], errs = [];
const browser = await chromium.launch({ headless: !process.env.PWDEBUG,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { const t = m.text(); if (/error|undefined is not|cannot read|is not a function/i.test(t)) errs.push('console: ' + t.slice(0, 160)); });

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__engine && window.__engine.presetOptions && document.querySelector('.chip'), null, { timeout: 30000 });
} catch (e) { console.error('\x1b[31mFAILED to boot\x1b[0m:', e.message, errs.join('\n')); await browser.close(); server.close(); process.exit(1); }

const r = await page.evaluate(async () => {
  const E = window.__engine, st = window.__tool.state; const checks = {};
  // mode-switch across the type spectrum (each runs updateModeFolders)
  for (const id of [50, 2, 28, 29, 32, 38, 54, 12, 0]) E.setMode(id);
  checks.modeSwitch = (st.mode === 0);
  // randomize via the real UI button changes params within range
  document.querySelector('.chip[data-mode="50"]').click(); await new Promise((r) => setTimeout(r, 30));
  const b = st.ambCount + ',' + st.seed;
  [...document.querySelectorAll('#params .btn')].find((x) => x.textContent === 'randomize')?.click();
  checks.randomize = (st.ambCount + ',' + st.seed !== b) && st.ambCount >= 0 && st.ambCount <= 1;
  // preset round-trip (save look, switch away, recall)
  E.setMode(51); st.ambCount = 0.77; st.gradeGamma = 1.7; E.savePreset('__fn');
  E.setMode(2); st.ambCount = 0.1; st.gradeGamma = 1;
  E.applyPreset('user:__fn');
  checks.preset = (st.mode === 51 && Math.abs(st.ambCount - 0.77) < 0.001 && Math.abs(st.gradeGamma - 1.7) < 0.001);
  E.deletePreset('user:__fn');
  // reset
  E.setMode(50); E.resetMode(50); checks.reset = true;

  // ── recording entry path ──────────────────────────────────────────────
  // The pane removal threaded through startRecording (it drives the old
  // btnRecord stub) and the recording-resolution switch, so guard the
  // lifecycle. Full encode is out of scope: headless Chromium has no
  // WebCodecs VideoEncoder, so startRecording takes its graceful no-codec
  // bail. We assert: it doesn't throw, the `recording` flag is left clean,
  // resize still works afterwards, and the export filename is derived from
  // the effect name (the "don't say mode39" guarantee) — not the mode id.
  E.setMode(2); // a named effect — its filename slug must come from the name
  const fname = E.exportFilename();
  const slug = fname.replace(/^transition__/, '').split('__')[0];
  checks.exportName = fname.startsWith('transition__') && /[a-z]/.test(slug) && !/^mode\d+$/.test(slug);
  let recErr = '';
  try { await E.startRecording(); } catch (e) { recErr = e.message || String(e); }
  checks.recordNoThrow = (recErr === '');
  checks.recordFlagClean = (E.recording === false);
  E.resize(); // restore preview size after the record-res switch
  checks.resizeAfterRecord = true;

  return { ...checks, _recErr: recErr };
});

if (r._recErr) errs.push('record threw: ' + r._recErr);
delete r._recErr;

for (const [k, v] of Object.entries(r)) if (!v) fails.push(`assertion failed: ${k}`);
if (errs.length) fails.push('errors:\n  ' + errs.join('\n  '));

await browser.close(); server.close();
if (fails.length) { console.log('\n\x1b[31mFAILED\x1b[0m\n' + fails.map((f) => '  • ' + f).join('\n') + '\n'); process.exit(1); }
console.log('\x1b[32mfunctional paths OK\x1b[0m (mode-switch, randomize, presets, reset)');
