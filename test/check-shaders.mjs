#!/usr/bin/env node
// Pure-Node shader integrity check — no browser, no deps. Catches the two
// recurring failure modes in this project before they ever reach the GPU:
//   1. a backtick inside a WGSL comment silently closing the JS template literal
//      (the file fails to parse, or a string ends early)
//   2. the three near-identical `struct Params` blocks drifting out of sync
// Run: node test/check-shaders.mjs   (exit 0 = pass, 1 = fail)
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => { fail.push(m); console.log('  \x1b[31m✗\x1b[0m ' + m); };

// 1. The file must parse as an ES module. A stray backtick in a WGSL comment
//    breaks the template literal and throws here with a telling message.
let mod;
try {
  mod = await import(join(root, 'shader.js'));
  ok('shader.js parses as a module (no broken template literals)');
} catch (e) {
  bad(`shader.js failed to import — almost certainly a backtick inside a WGSL `
    + `comment closing the template literal: ${e.message}`);
  console.log('\n\x1b[31mFAILED\x1b[0m\n');
  process.exit(1);
}

// 2. Each exported WGSL string must contain no backticks (template delimiters
//    are the only legal backticks; any inside the string is the footgun).
const shaders = { SHADER: mod.SHADER, SIM_SHADER: mod.SIM_SHADER, INIT_SHADER: mod.INIT_SHADER };
for (const [name, src] of Object.entries(shaders)) {
  if (typeof src !== 'string') { bad(`${name} is not an exported string`); continue; }
  if (src.includes('`')) bad(`${name} contains a backtick (\`) — likely in a comment; remove it`);
  else ok(`${name} is backtick-free (${src.length} chars)`);
}

// 3. The three `struct Params { ... }` blocks must be byte-identical (they share
//    one UBO layout). This is the drift guard until they're generated from one
//    source. After unification this still validates the interpolation matches.
const structOf = (src) => {
  const m = src && src.match(/struct Params \{[\s\S]*?\n\};/);
  return m ? m[0].replace(/\r/g, '') : null;
};
const structs = Object.fromEntries(Object.entries(shaders).map(([n, s]) => [n, structOf(s)]));
const ref = structs.SHADER;
if (!ref) bad('could not locate `struct Params` in SHADER');
else {
  ok(`struct Params found (${ref.split('\n').length} lines)`);
  for (const n of ['SIM_SHADER', 'INIT_SHADER']) {
    if (structs[n] === ref) ok(`${n} struct Params matches SHADER`);
    else bad(`${n} struct Params DIFFERS from SHADER — UBO layout drift`);
  }
}

// 4. Sanity: the hand-indexed UBO in main.js must be large enough for the struct.
//    Count scalar slots conservatively (each f32/u32 = 1, vec2=2, vec3/vec4=4,
//    array<vec4,N>=4N) and compare to UBO_SIZE/4.
try {
  const main = await readFile(join(root, 'main.js'), 'utf8');
  const um = main.match(/const UBO_SIZE = (\d+)/);
  if (um && ref) {
    const uboFloats = (+um[1]) / 4;
    let slots = 0;
    for (const line of ref.split('\n')) {
      for (const [, type] of line.matchAll(/:\s*(f32|u32|vec2f|vec3f|vec4f|array<vec4f,\s*(\d+)>)/g)) {
        if (type.startsWith('array')) slots += 4 * (+type.match(/(\d+)/)[1]);
        else if (type === 'vec2f') slots += 2;
        else if (type === 'vec3f' || type === 'vec4f') slots += 4;
        else slots += 1;
      }
    }
    // struct alignment rounds up to 16B (4 floats); allow that slack.
    if (uboFloats >= slots) ok(`UBO_SIZE ${+um[1]}B (${uboFloats} floats) ≥ struct need (~${slots} slots)`);
    else bad(`UBO_SIZE ${+um[1]}B (${uboFloats} floats) is SMALLER than struct (~${slots} slots) — buffer too small`);
  }
} catch (e) { /* main.js optional for this check */ }

if (fail.length) { console.log(`\n\x1b[31mFAILED\x1b[0m (${fail.length} issue${fail.length > 1 ? 's' : ''})\n`); process.exit(1); }
console.log('\n\x1b[32mshader integrity OK\x1b[0m\n');
