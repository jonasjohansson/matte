#!/usr/bin/env node
// Browser smoke test — serves the app, boots WebGPU in headless Chromium, and
// drives EVERY mode through the real UI. Fails on any WGSL/pipeline/JS error and
// on modes that render blank. This is the net that makes shader/UBO refactors
// safe. Run: node test/smoke.mjs   (PWDEBUG=1 to watch headed)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8900 + Math.floor(Math.random ? 0 : 0); // fixed; random throws in some sandboxes
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const f = normalize(join(ROOT, p));
    if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const b = await readFile(f);
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' });
    res.end(b);
  } catch { res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const fails = [];
const errors = [];
const browser = await chromium.launch({
  headless: !process.env.PWDEBUG,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  const t = m.text();
  if (/\[WGSL\]\s+error|pipeline error|\bWGSL\b.*error|Uncaught|is not a function|cannot read/i.test(t)) errors.push('console: ' + t.slice(0, 200));
});

try {
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__engine && window.__tool && window.__tool.device, null, { timeout: 30000 });
} catch (e) {
  console.error('\x1b[31mFAILED to boot WebGPU\x1b[0m:', e.message);
  if (errors.length) console.error(errors.join('\n'));
  await browser.close(); server.close(); process.exit(1);
}
if (errors.length) fails.push('init errors:\n  ' + errors.join('\n  '));

// canonical mode id list straight from the gallery. SMOKE_MODES=64,7 sweeps just
// those (fast iteration on one changed mode); unset sweeps all.
const allIds = await page.evaluate(() => Object.keys(window.__modeNames || {}).map(Number).sort((a, b) => a - b));
const only = (process.env.SMOKE_MODES || '').split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
const ids = only.length ? allIds.filter((id) => only.includes(id)) : allIds;
await page.evaluate(() => { document.body.classList.add('ui-hidden'); window.__tool.state.matteOutput = 1; window.__engine.setSize(640, 400); window.__engine.resize(); });

let blank = 0;
for (const id of ids) {
  const before = errors.length;
  await page.evaluate((id) => {
    const chip = document.querySelector('.chip[data-mode="' + id + '"]');
    if (chip) chip.click(); else window.__engine.setMode(id);
  }, id);
  // try a couple of t values — some modes are legitimately sparse at one moment
  let nonBlank = false, png;
  for (const t of [0.5, 0.75, 0.25]) {
    await page.evaluate((t) => window.__engine.scrub && window.__engine.scrub(t), t);
    await page.waitForTimeout(90);
    png = await page.locator('#canvas').screenshot();
    // a flat (all-black/all-white) frame compresses tiny; textured renders are larger
    if (png.length > 1200) { nonBlank = true; break; }
  }
  if (errors.length > before) fails.push(`mode ${id}: ` + errors.slice(before).join(' | '));
  if (!nonBlank) { blank++; fails.push(`mode ${id}: render looks blank (png ${png.length}B at 3 t-values)`); }
}

await browser.close();
server.close();

console.log(`swept ${ids.length} modes; ${blank} blank; ${errors.length} error log lines`);
if (fails.length) {
  console.log('\n\x1b[31mFAILED\x1b[0m\n' + fails.map((f) => '  • ' + f).join('\n') + '\n');
  process.exit(1);
}
console.log('\x1b[32mall modes render with no errors\x1b[0m');
