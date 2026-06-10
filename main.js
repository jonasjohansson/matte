// WebGPU port of the transition tool.
//
// Milestone 1: scaffold + smooth organic crossfade.
// The JS shell (state, Tweakpane, slots, recorder, presets) mirrors the WebGL2
// version but the rendering path is rebuilt on WebGPU. Modes will be ported in
// subsequent milestones; right now only the default smooth dissolve runs.

// The legacy Tweakpane UI is retired — ui.js is the real interface. Its ~300
// historical .addBinding/.addFolder sites now run against an inert chainable stub
// (below) so they no-op without surgical removal, and the two Tweakpane deps are
// gone. The few preset/state helpers that lived alongside it are still used by
// window.__engine and ui.js.
// mp4-muxer is lazy-imported inside startRecording() (only needed when recording)
import { SHADER, SIM_SHADER, INIT_SHADER } from './shader.js';
import { IDB_NAME, IDB_STORE, IDB_LIB_STORE, idbOpen, idbGet, idbPut, idbClearAll, libList, libAdd, libDelete, makeThumb } from './idb.js';
import { fitInfo, hexToRgb } from './util.js';
import { ENCODER_CANDIDATES, encoderConfigSupported } from './recorder.js';
import { HAS_FS_ACCESS, getOutputDir, setOutputDir, getOutputDirHandleWithPermission, saveBlobToOutputFolder } from './output.js';
import { state } from './state.js';
// Pristine snapshot of the default state, captured BEFORE any session restore or
// user mutation. Source of truth for per-parameter "reset to default" (right-click
// a control). state.js is pure data, so this import-time clone is the clean baseline.
const BASE_DEFAULTS = structuredClone(state);
import { canvas, adapter, device, ctx, presentationFormat, GPU_MAX_TEX } from './core.js';
import { particles, ensureParticles, initParticleData, simAndDrawParticles } from './particles.js';


// ============================================================================
// Shader (WGSL)
// ============================================================================
// SHADER moved to ./shader.js

const module = device.createShaderModule({ code: SHADER });
const compInfo = await module.getCompilationInfo();
if (compInfo.messages.length) {
  for (const m of compInfo.messages) {
    console[m.type === 'error' ? 'error' : 'warn']('[WGSL]', m.type, m.lineNum + ':' + m.linePos, m.message);
  }
  // Surface the first compile error in the UI — a blank canvas with the reason
  // only in devtools is the project's classic silent failure.
  const firstErr = compInfo.messages.find(m => m.type === 'error');
  if (firstErr) {
    const el = document.getElementById('gpu-error'), msg = document.getElementById('gpu-error-msg');
    if (msg) msg.innerHTML = '<b>Shader failed to compile (line ' + firstErr.lineNum + '): ' + firstErr.message + '</b>';
    if (el) el.classList.add('show');
  }
}

// Bind group layout
const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }, // colourise LUT
  ],
});
device.pushErrorScope('validation');
const pipeline = device.createRenderPipeline({
  label: 'main-pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
  vertex: { module, entryPoint: 'vs' },
  fragment: { module, entryPoint: 'fs', targets: [{ format: presentationFormat }] },
  primitive: { topology: 'triangle-list' },
});
device.popErrorScope().then(err => { if (err) console.error('[pipeline error]', err.message); });

// ============================================================================
// Advection sim — render-to-texture ping-pong (mode 10..14)
// ============================================================================
const STATE_FORMAT = 'rgba16float';
// SIM_SHADER moved to ./shader.js

// INIT_SHADER moved to ./shader.js

const simModule  = device.createShaderModule({ code: SIM_SHADER });
const initModule = device.createShaderModule({ code: INIT_SHADER });
const simPipeline = device.createRenderPipeline({
  label: 'sim-pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
  vertex:   { module: simModule, entryPoint: 'vs' },
  fragment: { module: simModule, entryPoint: 'fs', targets: [{ format: STATE_FORMAT }] },
  primitive: { topology: 'triangle-list' },
});
const initPipeline = device.createRenderPipeline({
  label: 'init-pipeline',
  layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
  vertex:   { module: initModule, entryPoint: 'vs' },
  fragment: { module: initModule, entryPoint: 'fs', targets: [{ format: STATE_FORMAT }] },
  primitive: { topology: 'triangle-list' },
});

let stateTexA = null, stateTexB = null;
let stateW = 0, stateH = 0;
const advec = { src: 'A', lastT: 0, needsReset: true };

function ensureStateTextures() {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return;
  if (w === stateW && h === stateH && stateTexA) return;
  if (stateTexA) stateTexA.destroy();
  if (stateTexB) stateTexB.destroy();
  stateTexA = device.createTexture({
    label: 'state-A',
    size: [w, h, 1], format: STATE_FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  stateTexB = device.createTexture({
    label: 'state-B',
    size: [w, h, 1], format: STATE_FORMAT,
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  stateW = w; stateH = h;
  advec.needsReset = true;
}

// Build bind groups dynamically — they must reference texA/texB/state textures
// that all change at runtime. Cheap to recreate, so do it each step.
function makeSimBindGroup(stateIn) {
  return device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texA.createView() },
      { binding: 2, resource: texB.createView() },
      { binding: 3, resource: sampler },
      { binding: 4, resource: stateIn.createView() },
      { binding: 5, resource: (texT || placeholderTexT).createView() },
      { binding: 6, resource: texRegions.createView() },
      { binding: 7, resource: texTexture.createView() },
      { binding: 8, resource: texLut.createView() },
    ],
  });
}
function makeDisplayBindGroup(finalState) {
  return device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texA.createView() },
      { binding: 2, resource: texB.createView() },
      { binding: 3, resource: sampler },
      { binding: 4, resource: finalState.createView() },
      { binding: 5, resource: (texT || placeholderTexT).createView() },
      { binding: 6, resource: texRegions.createView() },
      { binding: 7, resource: texTexture.createView() },
      { binding: 8, resource: texLut.createView() },
    ],
  });
}

// Uniform buffer — 208 bytes total, matches the Params struct in WGSL.
// Offsets (in 4-byte units, which is the JS Float32Array / Uint32Array index):
//   0  t            8   scaleA.x      16 bg.r          20 curve          24 rimWidth       32 diffStrength    40 irisFocus.x   44 bleedFinger    48 runDrip
//   1  spread       9   scaleA.y      17 bg.g          21 sedDirection   25 rimDark        33 diffRadius      41 irisFocus.y   45 bleedAmount    49 _p1
//   2  organic      10  offsetA.x     18 bg.b          22 sedSource      26 paperAngle     34 sedBands        42 irisJitter    46 bleedHalo      50 _p2
//   3  edges        11  offsetA.y     19 mode          23 saltSource     27 paperAniso     35 sedSoftness     43 _p0           47 runGravity     51 _p3
//   4  maskScale    12  scaleB.x                                          28 paperGran      36 saltDensity
//   5  seed         13  scaleB.y                                          29 bloomCount     37 saltContrast
//   6  validA       14  offsetB.x                                         30 bloomRim       38 saltBias
//   7  validB       15  offsetB.y                                         31 bloomRate      39 saltImage
const UBO_SIZE = 1232;  // 308 f32: ... +swipe (282-286) +pad (287) +swipeW[16] (288-303) +box rect (304-306, pad 307)
const uniformBuffer = device.createBuffer({
  size: UBO_SIZE,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const uboHost = new ArrayBuffer(UBO_SIZE);
const uboF32 = new Float32Array(uboHost);
const uboU32 = new Uint32Array(uboHost);

const sampler = device.createSampler({
  magFilter: 'linear', minFilter: 'linear',
  addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
});

// Placeholder 1×1 textures so the bind group is valid before images load.
function makePlaceholderTexture() {
  const tex = device.createTexture({
    size: [1, 1, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: tex }, new Uint8Array([0, 0, 0, 255]), { bytesPerRow: 4 }, [1, 1, 1]);
  return tex;
}
let texA = makePlaceholderTexture();
let texB = makePlaceholderTexture();
let texTexture = makePlaceholderTexture();  // grunge / paper texture (binding 7)
// Colourise gradient-map LUT (binding 8): a horizontal ramp the matte's
// brightness samples. Default = grayscale (black→white) so the matte stays pure
// B/W; a user-uploaded gradient colourises the on-screen PREVIEW only (swapped
// back to grayscale while recording, so the exported matte is untouched).
function makeGrayRampTexture() {
  const N = 256, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) { data[i*4]=i; data[i*4+1]=i; data[i*4+2]=i; data[i*4+3]=255; }
  const tex = device.createTexture({ label: 'lut-gray', size: [N, 1, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: N * 4 }, [N, 1, 1]);
  return tex;
}
const grayRampTex = makeGrayRampTexture();
let texLut = grayRampTex;   // currently-bound LUT (gray ramp ⇒ no colourise)
let colourLut = null;       // user-uploaded colour ramp, applied in preview when state.colourise
let placeholderTexT = makePlaceholderTexture();
let texT = null;
// Per-pixel "fade time" texture for mode 31 (sequential region reveal). r =
// pixelT in [0,1]; built from SAM regions. Default is a 1×1 with r=1 so when
// no regions are saved, mode 31 just shows A unchanged (instead of flipping
// to B at t=0, which would look broken).
function makeRegionsPlaceholderTexture() {
  const tex = device.createTexture({
    label: 'tex-regions-placeholder',
    size: [1, 1, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: tex }, new Uint8Array([255, 0, 0, 255]), { bytesPerRow: 4 }, [1, 1, 1]);
  return tex;
}
const placeholderTexRegions = makeRegionsPlaceholderTexture();
let texRegions = placeholderTexRegions;

// Placeholder state texture so the bind group is valid before sim runs.
// Replaced with real ping-pong textures on first advection frame.
let placeholderState = device.createTexture({
  label: 'state-placeholder',
  size: [1, 1, 1], format: STATE_FORMAT,
  usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
});

function makeBindGroup(stateView) {
  return device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: texA.createView() },
      { binding: 2, resource: texB.createView() },
      { binding: 3, resource: sampler },
      { binding: 4, resource: stateView || placeholderState.createView() },
      { binding: 5, resource: (texT || placeholderTexT).createView() },
      { binding: 6, resource: texRegions.createView() },
      { binding: 7, resource: texTexture.createView() },
      { binding: 8, resource: texLut.createView() },
    ],
  });
}
let bindGroup = makeBindGroup();

// ── Colourise (gradient map) — preview only ──────────────────────────────────
// Upload a gradient image; the matte's brightness samples across it so the B/W
// effect becomes coloured ON SCREEN. The recorded matte stays B/W (startRecording
// swaps texLut back to the grayscale ramp for the duration of the encode).
async function loadColourise(file) {
  try {
    const bmp = await createImageBitmap(file);
    const tex = device.createTexture({ label: 'lut-colour', size: [bmp.width, bmp.height, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
    device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [bmp.width, bmp.height, 1]);
    bmp.close();
    if (colourLut) colourLut.destroy();
    colourLut = tex; state.colourise = true; texLut = colourLut; bindGroup = makeBindGroup();
  } catch (e) { console.error('[colourise]', e); }
}
function clearColourise() {
  state.colourise = false; texLut = grayRampTex; bindGroup = makeBindGroup();
  if (colourLut) { colourLut.destroy(); colourLut = null; }
}

// ── Lamp Grid (mode 29) "analysed regions" — segment image A into colour
// regions on the CPU and bake a per-pixel light-up-time map into texRegions,
// so the mode lights real collage parts in sequence (not a fixed grid). Re-run
// via the Analyse button / on demand. by = 'warmth' | 'brightness' | 'random'.
function analyseCellRegions(by) {
  if (!state.imgA) { console.warn('[cells] no image in slot A to analyse'); return false; }
  const img = state.imgA;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const W = Math.max(8, Math.min(220, Math.round(iw)));
  const H = Math.max(4, Math.round(ih * (W / iw)));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const px = cx.getImageData(0, 0, W, H).data;
  const NP = W * H;
  const parent = new Int32Array(NP); for (let i = 0; i < NP; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
  const cz = Math.min(1, Math.max(0, state.cellCoarseness == null ? 0.5 : state.cellCoarseness));
  const THRESH = Math.round(20 + 230 * cz);  // colour-distance to merge neighbours (coarseness)
  const near = (i, j) => { const a = i*4, b = j*4;
    return Math.abs(px[a]-px[b]) + Math.abs(px[a+1]-px[b+1]) + Math.abs(px[a+2]-px[b+2]) < THRESH; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y*W + x;
    if (x+1 < W && near(i, i+1)) uni(i, i+1);
    if (y+1 < H && near(i, i+W)) uni(i, i+W);
  }
  const roots = new Map();
  for (let i = 0; i < NP; i++) { const r = find(i); let o = roots.get(r);
    if (!o) { o = { r:0, g:0, b:0, n:0 }; roots.set(r, o); }
    const a = i*4; o.r += px[a]; o.g += px[a+1]; o.b += px[a+2]; o.n++; }
  const regs = [...roots.entries()].map(([root, o]) => {
    const r = o.r/o.n, g = o.g/o.n, b = o.b/o.n;
    return { root, warmth: r - b, bright: 0.299*r + 0.587*g + 0.114*b, rnd: Math.random() }; });
  const keyFn = by === 'warmth' ? (z => -z.warmth) : by === 'brightness' ? (z => -z.bright) : (z => z.rnd);
  regs.sort((A, B) => keyFn(A) - keyFn(B));
  const N = regs.length;
  const timeOf = new Map(); regs.forEach((z, idx) => timeOf.set(z.root, N > 1 ? idx/(N-1) : 0));
  const data = new Uint8Array(NP * 4);
  for (let i = 0; i < NP; i++) { const t = timeOf.get(find(i)) || 0; data[i*4] = Math.round(t*255); data[i*4+3] = 255; }
  if (texRegions && texRegions !== placeholderTexRegions) texRegions.destroy();
  const tex = device.createTexture({ label: 'tex-cell-regions', size: [W, H, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
  device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: W*4 }, [W, H, 1]);
  texRegions = tex; bindGroup = makeBindGroup();
  console.log(`[cells] analysed A: ${W}x${H}, ${N} regions, order=${by}`);
  return N;
}

// ============================================================================
// Particle layer (GPU compute sim + additive instanced draw)
// ----------------------------------------------------------------------------
// A large particle buffer is simulated each frame in a compute shader and drawn
// additively on top of the transition. Particles are seeded across image A,
// inherit its colour, and are born in an expanding front (staggered by radius
// from a centre) so the burst grows organically rather than all at once. One
// shared engine covers two reference looks via `partBurst`: low burst + high
// curl = a glowing, drifting reveal-rim; high burst + trail = a radial
// streak-burst. The sim is driven by transition time `t` (not wall-clock) so it
// stays deterministic for recording.
// Particle defaults live in the `state` object (declared further below); the
// pipelines/buffers here read state only at render time.
// ============================================================================
// particle system -> ./particles.js

async function uploadImageToSlot(img, slot) {
  // premultiplyAlpha:'none' keeps the PNG's straight (un-premultiplied) alpha in
  // the texture. The shader blends straight RGB and premultiplies once at output
  // (canvas is alphaMode:'premultiplied'), so a premultiplied bitmap here would
  // double-darken semi-transparent edges.
  let bitmap = await createImageBitmap(img, { premultiplyAlpha: 'none' });
  let w = bitmap.width, h = bitmap.height;
  // If the image is larger than the GPU's max 2D texture dimension, downscale
  // it during decode rather than letting the texture creation fail silently.
  const longer = Math.max(w, h);
  if (longer > GPU_MAX_TEX) {
    const scale = GPU_MAX_TEX / longer;
    const nw = Math.round(w * scale), nh = Math.round(h * scale);
    console.log(`[upload ${slot}] image ${w}x${h} exceeds GPU max ${GPU_MAX_TEX} — downscaling to ${nw}x${nh}`);
    const big = bitmap;
    bitmap = await createImageBitmap(big, { resizeWidth: nw, resizeHeight: nh, resizeQuality: 'high', premultiplyAlpha: 'none' });
    big.close();
    w = nw; h = nh;
  }
  console.log(`[upload ${slot}] bitmap ${w}x${h}`);
  const tex = device.createTexture({
    label: `tex${slot}`,
    size: [w, h, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.pushErrorScope('validation');
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: tex }, [w, h, 1]);
  device.popErrorScope().then(err => { if (err) console.error(`[upload ${slot}] error`, err.message); });
  if (slot === 'A') { texA.destroy(); texA = tex; }
  else              { texB.destroy(); texB = tex; }
  bitmap.close();
  bindGroup = makeBindGroup();
  advec.needsReset = true;
  console.log(`[upload ${slot}] new bind group ready`);
  if (slot === 'A') {
    // A source image dictates the aspect ratio — drop the custom size lock so
    // the canvas matches A's native dimensions.
    state.customSize = false;
    if (typeof pane !== 'undefined') pane.refresh();
    if (typeof resizeCanvas === 'function') resizeCanvas();
    if (state.originFromImage) computeOriginFromImage(img);
  }
}

// Derive a reveal origin from image A's bright focal region (brightness-weighted
// centroid) so the transition starts "from within the painting".
function computeOriginFromImage(img) {
  try {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, 64, 64);
    const d = cx.getImageData(0, 0, 64, 64).data;
    let sx = 0, sy = 0, sw = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
      const w = l * l;  // bias toward bright "light source" regions
      sx += x * w; sy += y * w; sw += w;
    }
    if (sw > 0) {
      state.originX = (sx / sw) / 63;
      state.originY = (sy / sw) / 63;
      if (typeof pane !== 'undefined') pane.refresh();
    }
  } catch {}
}

// ---- texture input (grunge / watercolor paper) ----
async function uploadTexture(img) {
  let bitmap = await createImageBitmap(img, { premultiplyAlpha: 'none' });
  let w = bitmap.width, h = bitmap.height;
  const longer = Math.max(w, h);
  if (longer > GPU_MAX_TEX) {
    const s = GPU_MAX_TEX / longer;
    const nw = Math.round(w * s), nh = Math.round(h * s);
    const big = bitmap;
    bitmap = await createImageBitmap(big, { resizeWidth: nw, resizeHeight: nh, resizeQuality: 'high', premultiplyAlpha: 'none' });
    big.close(); w = nw; h = nh;
  }
  const tex = device.createTexture({
    label: 'texTexture', size: [w, h, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  device.queue.copyExternalImageToTexture({ source: bitmap }, { texture: tex }, [w, h, 1]);
  texTexture.destroy(); texTexture = tex;
  bitmap.close();
  bindGroup = makeBindGroup();
  state.texImg = img;
  state.texAspect = w / Math.max(1, h);  // for contain-fit in the shader
  if (state.texAmount < 0.001 && state.texBg < 0.001) state.texAmount = 0.4;  // make it visible on first load
  if (typeof pane !== 'undefined') pane.refresh();
}
function loadTextureFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  idbPut('texture', file);
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { uploadTexture(img); URL.revokeObjectURL(url); };
  img.src = url;
}
function clearTexture() {
  state.texImg = null; state.texAmount = 0; state.texBg = 0;
  texTexture.destroy(); texTexture = makePlaceholderTexture();
  bindGroup = makeBindGroup();
  idbPut('texture', null);
  if (typeof pane !== 'undefined') pane.refresh();
}

// ============================================================================
// State
// ============================================================================
// state object -> ./state.js

// ============================================================================
// Sizing
// ============================================================================
// moved to util.js (fitInfo)
function composedFit(slot, cw, ch) {
  const img = slot === 'A' ? state.imgA : state.imgB;
  const z = slot === 'A' ? state.zoomA : state.zoomB;
  const px = slot === 'A' ? state.panAx : state.panBx;
  const py = slot === 'A' ? state.panAy : state.panBy;
  const f = fitInfo(img, cw, ch, state.fit);
  return {
    sx: f.sx * z, sy: f.sy * z,
    ox: z * f.ox + 0.5 * (1 - z) - z * px,
    oy: z * f.oy + 0.5 * (1 - z) - z * py,
  };
}

// Recording flag — hoisted so resizeCanvas can force full res during capture.
let recording = false;

// The export format: the full output dimensions the user set, clamped to GPU max.
function computeOutputDims() {
  let w, h;
  const matchRef = state.matchInput ? (state.imgA || state.imgB) : null;
  if (matchRef) {
    // Match the source's aspect ratio, keeping the chosen output's longer edge.
    const ar = matchRef.naturalWidth / Math.max(1, matchRef.naturalHeight);
    const longEdge = Math.max(2, Math.round(Math.max(state.outW, state.outH)));
    if (ar >= 1) { w = longEdge; h = Math.max(2, Math.round(longEdge / ar)); }
    else         { h = longEdge; w = Math.max(2, Math.round(longEdge * ar)); }
  } else if (state.customSize || (!state.imgA && !state.imgB)) {
    w = Math.max(2, Math.round(state.outW));
    h = Math.max(2, Math.round(state.outH));
  } else {
    const aReal = state.slotAFillMode === 'image' && state.imgA;
    const bReal = state.slotBFillMode === 'image' && state.imgB;
    const ref = aReal ? state.imgA : (bReal ? state.imgB : (state.imgA || state.imgB));
    w = ref.naturalWidth; h = ref.naturalHeight;
  }
  const longer = Math.max(w, h);
  if (longer > GPU_MAX_TEX) { const sc = GPU_MAX_TEX / longer; w = Math.round(w * sc); h = Math.round(h * sc); }
  return { w, h };
}
// On-screen downscale (1 = full). Recording ignores this and renders full-res.
// 'full' = render at the output size; otherwise cap the preview's LONGER edge to
// an absolute pixel size (e.g. 1440), so making the OUTPUT bigger never makes the
// live preview heavier — output size stays purely a recording concern.
function previewScaleFactor(w, h) {
  const ps = state.previewScale;
  if (!ps || ps === 'full' || ps === '1') return 1;
  const cap = parseFloat(ps);                 // longer-edge pixel cap (e.g. 1440)
  if (!(cap > 0)) return 1;
  const longer = Math.max(w, h);
  return longer > cap ? cap / longer : 1;      // only ever scale DOWN
}
function resizeCanvas() {
  // Full-bleed: the effect fills the whole window; the rails float on top with a
  // frosted backdrop, so no horizontal space is reserved for them.
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const { w, h } = computeOutputDims();
  // The display is purely a preview that always matches the OUTPUT aspect ratio.
  // CSS size = the output fit on screen; backing store = that size x dpr (sharp),
  // except while recording, when we render the full output resolution. There is
  // no separate "display size" to pick — only the output resolution matters.
  const fit = Math.min(maxW / w, maxH / h, 1);
  const dispW = Math.max(2, w * fit), dispH = Math.max(2, h * fit);
  const dpr = window.devicePixelRatio || 1;
  // Backing-store resolution. While recording we render full output res; while
  // scrubbing we cap the longer edge via the "display" preview-scale control so
  // the heaviest modes stay smooth on Retina/4K (the cap was previously dead).
  let bw = recording ? w : dispW * dpr;
  let bh = recording ? h : dispH * dpr;
  if (!recording) { const psf = previewScaleFactor(bw, bh); bw *= psf; bh *= psf; }
  canvas.width  = Math.max(2, Math.round(bw));
  canvas.height = Math.max(2, Math.round(bh));
  canvas.style.width = dispW + 'px';
  canvas.style.height = dispH + 'px';
  canvas.classList.remove('empty');  // sized → visible (images or custom size)
}

// moved to util.js (hexToRgb)

function writeUniforms() {
  const cw = canvas.width, ch = canvas.height;
  const fA = composedFit('A', cw, ch);
  const fB = composedFit('B', cw, ch);
  const bg = hexToRgb(state.bg);

  // -- 0..7 --
  uboF32[0]  = state.t;
  uboF32[1]  = state.spread;
  uboF32[2]  = state.organic;
  uboF32[3]  = state.edges;
  uboF32[4]  = state.maskScale;
  // "animate": evolve the noise seed/phase over the loop so every mode morphs
  // in its own characteristic way (fibers shimmer, sediment shifts, blooms
  // migrate…) — animation relative to each mode, from one global lever.
  uboF32[5]  = state.seed + (state.animate || 0) * state.t * 8.0;
  // valid encoding: 0=no image (bg), 1=image, 2=solid color, 3=transparent.
  const _useSrc = state.useSources !== false;
  uboU32[6]  = !_useSrc ? 0 : (state.slotAFillMode === 'solid' ? 2 : state.slotAFillMode === 'transparent' ? 3 : (state.imgA ? 1 : 0));
  uboU32[7]  = !_useSrc ? 0 : (state.slotBFillMode === 'solid' ? 2 : state.slotBFillMode === 'transparent' ? 3 : (state.imgB ? 1 : 0));
  // -- 8..15 --
  uboF32[8]  = fA.sx; uboF32[9]  = fA.sy;
  uboF32[10] = fA.ox; uboF32[11] = fA.oy;
  uboF32[12] = fB.sx; uboF32[13] = fB.sy;
  uboF32[14] = fB.ox; uboF32[15] = fB.oy;
  // -- 16..19 --
  uboF32[16] = bg[0]; uboF32[17] = bg[1]; uboF32[18] = bg[2];
  uboU32[19] = state.mode;
  // -- 20..23 -- enum-style u32s
  uboU32[20] = state.curve;
  uboU32[21] = state.sedDirection;
  uboU32[22] = state.sedSource;
  uboU32[23] = state.saltSource;
  // -- 24..31 -- rim, paper, blooms scalars
  uboF32[24] = state.rimWidth;
  uboF32[25] = state.rimDark;
  uboF32[26] = state.paperAngle;
  uboF32[27] = state.paperAniso;
  uboF32[28] = state.paperGranulation;
  uboU32[29] = state.bloomCount;
  uboF32[30] = state.bloomRim;
  uboF32[31] = state.bloomRate;
  // -- 32..39 -- diffusion, sediment, salt scalars
  uboF32[32] = state.diffStrength;
  uboF32[33] = state.diffRadius;
  uboF32[34] = state.sedBands;
  uboF32[35] = state.sedSoftness;
  uboF32[36] = state.saltDensity;
  uboF32[37] = state.saltContrast;
  uboF32[38] = state.saltBias;
  uboU32[39] = state.saltImage;
  // -- 40..43 -- iris
  uboF32[40] = state.irisFocusX;
  uboF32[41] = state.irisFocusY;
  uboF32[42] = state.irisJitter;
  uboU32[43] = state.irisUniform ? 1 : 0;
  // -- 44..47 -- bleed + run
  uboF32[44] = state.bleedFinger;
  uboF32[45] = state.bleedAmount;
  uboF32[46] = state.bleedHalo;
  uboF32[47] = state.runGravity;
  // -- 48..51 --
  uboF32[48] = state.runDrip;
  uboU32[49] = (state.mode >= 11 && state.mode <= 14) ? (state.mode - 10) : 0; // advVariant
  uboF32[50] = state.advecVisc;
  uboF32[51] = state.advecRate;
  // -- 52..55 -- gravity
  uboF32[52] = state.advecGravity;
  uboF32[53] = state.advecGravBias;
  uboF32[54] = state.advecGravAngle;
  uboF32[55] = state.advecGravStreak;
  // -- 56..59 -- lateral + curl + brush
  uboF32[56] = state.advecGravLateral;
  uboF32[57] = state.advecCurlStr;
  uboF32[58] = state.advecCurlScale;
  uboF32[59] = state.advecBrushFollow;
  // -- 60..63 -- seed + canvas aspect
  uboU32[60] = state.advecSeedCount;
  uboF32[61] = state.advecSeedRadius;
  // surface padding entered in OUTPUT pixels → independent fractions per side.
  // The effect fills the remaining content rectangle.
  const _od = computeOutputDims();
  const _clp = v => Math.max(0, Math.min(0.95, v));
  const padTop    = _od.h > 0 ? _clp((state.padTopPx    || 0) / _od.h) : 0;
  const padBottom = _od.h > 0 ? _clp((state.padBottomPx || 0) / _od.h) : 0;
  const padLeft   = _od.w > 0 ? _clp((state.padLeftPx   || 0) / _od.w) : 0;
  const padRight  = _od.w > 0 ? _clp((state.padRightPx  || 0) / _od.w) : 0;
  // canvasAspect uses the CONTENT RECT dimensions (full minus padding) so the
  // effect renders at the rect's true aspect instead of being squished.
  const bandW = cw * Math.max(0.02, 1 - padLeft - padRight);
  const bandH = ch * Math.max(0.02, 1 - padTop - padBottom);
  uboF32[62] = bandH > 0 ? bandW / bandH : 1.0;
  uboF32[63] = state.texImg ? (state.texAspect || 1.0) : 1.0;  // texture aspect for contain-fit
  // -- 64..67 -- wet edge (mode 15): rect ingress
  uboF32[64] = state.weEdgeScale;
  uboF32[65] = state.weEdgeWobble;
  uboF32[66] = state.weDryRing;
  uboF32[67] = state.weBleed;
  // -- 68..71 -- wet edge: tendrils
  uboU32[68] = state.weTendrilCount;
  uboF32[69] = state.weTendrilReach;
  uboF32[70] = state.weTendrilWidth;
  uboF32[71] = state.weTendrilStrength;
  // -- 72..75 -- detail bias + new wet-edge biases (reverse, B detail)
  uboF32[72] = state.weDetailBias;
  // slot 73 (moldTendrilsPerSeed) is written below in the mold block
  uboU32[74] = state.weReverse ? 1 : 0;
  uboF32[75] = state.weBDetailBias;
  // -- 73 -- mold tendrils per-seed count (slot was _p6)
  uboU32[73] = state.moldTendrilsPerSeed;
  // -- 76..79 -- mold tendrils (mode 22): direct path approach
  uboF32[76] = state.moldWidth;
  uboF32[77] = state.moldWobble;
  uboU32[78] = state.moldSeedCount;
  uboF32[79] = state.moldReach;
  // -- 96..111 -- new strong watercolor modes (23..26)
  uboU32[96]  = state.formStrokeCount;
  uboF32[97]  = state.formStrokeSize;
  uboF32[98]  = state.formStrokeWobble;
  uboF32[99]  = state.texImg ? state.texAmount : 0;  // texAmount (0 if no texture loaded)
  uboF32[100] = state.bloomLightBias;
  uboF32[101] = state.bloomWobble;
  uboF32[102] = state.bloomPaperShow;
  uboF32[103] = state.bloomImageBias;
  uboF32[104] = state.stageBands;
  uboF32[105] = state.stageOverlap;
  // Show the B/W matte when explicitly requested, or implicitly when there's no
  // source image to blend — so the tool works as a pure transition/matte
  // generator: set dimensions, see white↔black movement, no footage required.
  const showMatte = state.matteOutput || (state.useSources === false) || (!state.imgA && !state.imgB);
  uboU32[106] = showMatte ? 1 : 0;
  uboU32[107] = state.matteInvert ? 1 : 0;
  uboF32[108] = state.migrationStrength;
  uboU32[109] = state.migrationDir;
  uboF32[110] = state.migrationTurb;
  uboF32[111] = state.texImg ? state.texBg : 0;  // texBg (0 if no texture loaded)
  // -- 112..119 -- global transition bounds
  uboU32[112] = state.boundsEnable ? 1 : 0;
  uboF32[113] = state.boundsCx;
  uboF32[114] = state.boundsCy;
  uboF32[115] = state.boundsW;
  uboF32[116] = state.boundsH;
  uboF32[117] = state.boundsSoftness;
  uboF32[118] = state.weBLumaBias;
  uboF32[119] = state.maskShift;
  // -- 120..127 -- per-slot solid colors (used when fill mode = 'solid')
  const ca = hexToRgb(state.slotAColor);
  const cb = hexToRgb(state.slotBColor);
  uboF32[120] = ca[0]; uboF32[121] = ca[1]; uboF32[122] = ca[2];
  uboU32[123] = state.keepAOutsideB ? 1 : 0;
  uboF32[124] = cb[0]; uboF32[125] = cb[1]; uboF32[126] = cb[2]; uboU32[127] = state.texFit;
  // -- 128..135 -- burn mode 27 (paper scorch from edges)
  uboF32[128] = state.burnEdgeWobble;
  uboF32[129] = state.burnCharIntensity;
  uboF32[130] = state.burnCharWidth;
  uboF32[131] = state.burnGlowIntensity;
  uboF32[132] = state.burnGlowWidth;
  uboU32[133] = state.burnSeedCount;
  uboF32[134] = state.burnBrowning;
  uboF32[135] = state.burnBrowningWidth;
  uboF32[136] = state.burnAshSpatter;
  uboF32[137] = state.burnCharPersistence;
  uboF32[138] = state.burnEmberTrail;
  uboF32[139] = state.burnBIgnite;
  const gc = hexToRgb(state.burnGlowColor);
  uboF32[140] = gc[0]; uboF32[141] = gc[1]; uboF32[142] = gc[2];
  uboF32[143] = state.burnGlowFromB;
  // -- 144..147 -- video mask (mode 28)
  uboU32[144] = state.videoMaskInvert ? 1 : 0;
  uboF32[145] = state.videoMaskFeather;
  uboF32[146] = state.burnColorBleed;
  uboF32[147] = state.videoDisplace;
  // -- 148..159 -- film melt (mode 29)
  uboF32[148] = state.meltCellScale;
  uboF32[149] = state.meltCenterX;
  uboF32[150] = state.meltCenterY;
  uboF32[151] = state.meltInkAmount;
  uboF32[152] = state.meltGlowIntensity;
  uboF32[153] = state.meltCellJitter;
  uboF32[154] = state.videoDisplaceB;
  uboF32[155] = state.videoBrightness;
  const mgc = hexToRgb(state.meltGlowColor);
  uboF32[156] = mgc[0]; uboF32[157] = mgc[1]; uboF32[158] = mgc[2]; uboF32[159] = state.videoContrast;
  // -- 160..167 -- light bloom (mode 30)
  uboF32[160] = state.lightIntensity;
  uboF32[161] = state.lightSpread;
  uboF32[162] = state.lightPeakT;
  uboF32[163] = state.lightFlashWidth;
  const lc = hexToRgb(state.lightColor);
  uboF32[164] = lc[0]; uboF32[165] = lc[1]; uboF32[166] = lc[2]; uboF32[167] = state.videoSaturate;
  // -- 168..170 -- mode 2 paper-grain organic/animated extensions
  uboF32[168] = state.paperGrowth;
  uboF32[169] = state.paperFollow;
  uboF32[170] = state.paperPatches;
  uboF32[171] = state.videoDisplaceAmount;
  // -- 172..175 -- origin (inside-out reveal)
  uboF32[172] = state.originAmount;
  uboF32[173] = state.originX;
  uboF32[174] = state.originY;
  uboF32[175] = state.turbulence;
  // -- 176..207 -- origin points 0..7: one vec4 each (x, y, startTime, _).
  // -- 236..267 -- origin points 8..15 (originPts2). 208 = count.
  const pts = state.originPoints || [];
  const nPts = Math.min(16, pts.length);
  const stag = state.pointStagger || 0, rnd = state.pointRandom || 0;
  const maxI = Math.max(1, nPts - 1);
  for (let i = 0; i < nPts; i++) {
    const orderFrac = i / maxI;                 // 0..1 in placement order
    const r = (pts[i].r != null) ? pts[i].r : 0; // per-point random
    const startT = Math.min(0.95, Math.max(0, (orderFrac + (r - orderFrac) * rnd) * stag));
    const o = (i < 8) ? (176 + i * 4) : (236 + (i - 8) * 4);
    uboF32[o] = pts[i].x; uboF32[o + 1] = pts[i].y; uboF32[o + 2] = startT; uboF32[o + 3] = 0;
  }
  uboF32[268] = state.pointSize;   // lamp radius cap
  uboF32[269] = state.pointPop;    // ignition snap (0 grow .. 1 instant)
  uboF32[270] = state.pointFill ? 1 : 0;  // fill out: bloom past lamp edge to full coverage
  uboF32[271] = padTop;     // surface padding fractions per side
  uboF32[272] = padBottom;
  uboF32[273] = padLeft;
  uboF32[274] = padRight;
  uboF32[275] = state.gradeBright || 0;     // global grade (applied to the matte)
  uboF32[276] = state.gradeContrast || 0;
  uboF32[277] = state.gradeBlack || 0;
  uboF32[278] = (state.gradeWhite == null ? 1 : state.gradeWhite);
  uboF32[279] = (state.gradeGamma == null ? 1 : state.gradeGamma);
  // footage-driven modes: a loaded T-slot video acts as a spatial mask — the real
  // foliage canopy (54), the godray occluder (39), or the matte source (62).
  uboF32[280] = ((state.mode === 54 || state.mode === 39 || state.mode === 62) && state.videoT) ? 1 : 0;
  uboF32[281] = state.foliageDrift;  // footage sway/parallax amount (modes 39/54)
  // column-swipe transition (mode 63)
  uboF32[282] = state.swipeCols;
  uboF32[283] = state.swipeDir;
  uboF32[284] = state.swipeStagger;
  uboF32[285] = state.swipeColW;
  uboF32[286] = state.swipeSoft;
  uboF32[287] = state.mirrorDir;     // mode 64 centre-out direction
  // per-column widths (mode 63): swipeColWidths are PIXELS; send each as a
  // fraction of the across axis (width for up/down, height for left/right).
  // 0 (or unset) = auto equal share. 16 floats at 288-303.
  {
    const axis = ((state.swipeDir < 2 ? state.outW : state.outH) || 1920);
    const cols = Math.max(1, Math.round(state.swipeCols));
    const eq = 1 / cols;
    const _sw = state.swipeColWidths || [];
    for (let i = 0; i < 16; i++) {
      const px = _sw[i];
      uboF32[288 + i] = (px > 0 ? px / axis : eq);
    }
  }
  // box reveal (mode 68): centred seed rectangle half-size + how far the front travels
  uboF32[304] = (state.rectW == null ? 0.15 : state.rectW);
  uboF32[305] = (state.rectH == null ? 0.15 : state.rectH);
  uboF32[306] = (state.rectReach == null ? 0.6 : state.rectReach);
  uboF32[307] = (state.gdSpeed == null ? 2 : state.gdSpeed);   // godray animation rate (mode 39)
  uboU32[208] = (state.originSource === 'paint' && state._paintReady) ? 255 : nPts;
  uboF32[209] = state.flow;  // turbulence time-drift (animated ink)
  uboF32[210] = state.undulate;  // slow large-scale dance of the reveal front
  uboF32[211] = state.auroraDensity;
  uboF32[212] = state.auroraHeight;
  uboF32[213] = state.auroraSpeed;
  uboF32[214] = state.auroraDark;
  uboF32[215] = state.auroraWave;
  uboF32[216] = state.driftAngle;
  uboF32[217] = state.driftAmount;
  uboF32[218] = state.gdIntensity;
  uboF32[219] = state.gdBeams;
  uboF32[220] = state.gdCloud;
  uboF32[221] = state.gdPulse;
  uboF32[222] = state.ambCount;
  uboF32[223] = state.ambSize;
  uboF32[224] = state.ambSoft;
  uboF32[225] = state.ambSpeed;
  uboF32[226] = state.ambDetail;
  uboF32[227] = state.sunX;
  uboF32[228] = state.sunY;
  uboF32[229] = state.streakMove;
  uboF32[230] = state.vignAmount;
  uboF32[231] = state.vignFeather;
  uboF32[232] = state.vignAnimate;
  uboF32[233] = state.vignTexture;
  uboF32[234] = state.vignShape;
  uboF32[235] = state.ambRole;
  // -- 80..95 -- new painterly modes (16..21) + global paper grain
  uboF32[80] = state.strokeScale;
  uboF32[81] = state.strokeAniso;
  uboF32[82] = state.glazeBands;
  uboF32[83] = state.glazeSoftness;
  uboU32[84] = state.glazeDirection;
  uboF32[85] = state.glazeWarm;
  uboF32[86] = state.edgeFirstInk;
  uboF32[87] = state.edgeFirstFade;
  uboF32[88] = state.edgeFirstScale;
  uboF32[89] = state.flowAmount;
  uboU32[90] = state.dabsCount;
  uboF32[91] = state.dabsReach;
  uboF32[92] = state.dabsWobble;
  uboF32[93] = state.densityGravity;
  uboF32[94] = state.densitySmear;
  uboF32[95] = state.paperGrain;

  // Lamp Grid (mode 29): its own controls map into spare slots only while active,
  // so other modes never bleed soft/foreign values into it.
  if (state.mode === 29) {
    uboF32[34] = state.cellCols;                    // columns
    uboU32[29] = Math.max(1, (state.cellRows | 0)); // rows
    uboF32[92] = state.cellJitter;                  // jitter
    uboF32[30] = state.cellGlow;                    // glow (centre-out bulb)
    uboF32[77] = state.cellOrder;                   // order: sequential -> random
    uboF32[85] = state.cellCascade;                 // cascade (front-load)
    uboF32[1]  = state.cellSnap;                    // ignite softness (0 = instant pop)
    uboF32[101] = state.cellSpill;                  // spill past cell edges
    uboF32[105] = state.cellIgniteBy;               // ignite order source (0 rand,1 warm,2 bright,3 sat)
  }

  device.queue.writeBuffer(uniformBuffer, 0, uboHost);
}

// ============================================================================
// Render loop
// ============================================================================
let _frameCount = 0;
window.__frameCount = () => _frameCount;
function render() {
  _frameCount++;
  if (state.playing) {
    const now = performance.now();
    const elapsed = (now - state.startTime) / 1000;
    let pT = elapsed / state.duration;
    if (pT >= 1) {
      if (state.loop) {
        // Restart forward each loop (start → stop → restart), not ping-pong.
        state.startTime = now; pT = 0; state.reverse = false;
        if (state.partEnable) particles.needsReset = true;
      } else {
        pT = 1; state.playing = false;
        if (typeof updateTransportLabels !== 'undefined') updateTransportLabels();
      }
    }
    state.t = state.reverse ? (1 - pT) : pT;
    if (typeof bT !== 'undefined') bT.refresh();
  }
  renderFrame();
  requestAnimationFrame(render);
}

// Synchronous GPU draw — used by the rAF render loop and by the recorder.
function renderFrame() {
  // Matte-first: always render. Image-free we render the B/W matte at the
  // custom dimensions; with images we render the A->B transition.
  // Sync the T-slot video to state.t. Strategy: rather than seek per render
  // frame (expensive for codecs with sparse keyframes), match the video's
  // playbackRate to state.duration so it naturally plays in sync. Only re-seek
  // when the user has clearly scrubbed (drift > 0.2 s) — that's cheap because
  // it happens only on jumps, not every frame.
  if (state.videoT) {
    const v = state.videoT;
    if (v.duration && isFinite(v.duration) && state.duration > 0) {
      if (state.reverse) {
        // Browsers can't play in reverse — pause natural playback and seek
        // each frame manually. Tight threshold keeps us in sync.
        if (!v.paused) v.pause();
        const target = state.t * v.duration;
        if (Math.abs(v.currentTime - target) > 1 / 30) v.currentTime = target;
      } else {
        const desiredRate = v.duration / state.duration;
        if (Math.abs(v.playbackRate - desiredRate) > 0.01) v.playbackRate = desiredRate;
        if (state.playing && v.paused) v.play().catch(() => {});
        const target = state.t * v.duration;
        if (Math.abs(v.currentTime - target) > 0.2) v.currentTime = target;
      }
    }
    uploadVideoFrameToT();
  }
  writeUniforms();

  const isAdvec = (state.mode >= 10 && state.mode <= 14) || state.mode === 67;
  let finalState = null;
  const enc = device.createCommandEncoder();

  if (isAdvec) {
    ensureStateTextures();
    if (advec.needsReset || state.t < advec.lastT - 0.03 || state.t === 0) {
      const initPass = enc.beginRenderPass({
        colorAttachments: [{
          view: stateTexA.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear', storeOp: 'store',
        }],
      });
      initPass.setPipeline(initPipeline);
      initPass.setBindGroup(0, makeSimBindGroup(stateTexB));
      initPass.draw(6);
      initPass.end();
      advec.src = 'A';
      advec.lastT = 0;
      advec.needsReset = false;
      // Fog sim (67) accumulates over many steps, so when scrubbing/jumping we
      // warm up proportionally to t for a representative preview (record plays
      // forward and accumulates frame-by-frame, so it only pays this at t≈0).
      const warm = state.mode === 67
        ? Math.min(600, Math.max(24, Math.round(state.t * 500)))
        : Math.max(8, Math.round(state.advecSteps * 8));
      for (let i = 0; i < warm; i++) {
        runSimStepInto(enc, state.t * ((i + 1) / warm));
      }
    } else {
      const N = Math.max(1, Math.round(state.advecSteps));
      const startT = advec.lastT, endT = state.t;
      for (let i = 0; i < N; i++) {
        runSimStepInto(enc, startT + (endT - startT) * ((i + 1) / N));
      }
    }
    advec.lastT = state.t;
    finalState = (advec.src === 'A') ? stateTexA : stateTexB;
  }

  const displayBG = isAdvec ? makeDisplayBindGroup(finalState) : bindGroup;
  const canvasView = ctx.getCurrentTexture().createView();
  const pass = enc.beginRenderPass({
    colorAttachments: [{
      view: canvasView,
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'clear', storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, displayBG);
  pass.draw(6);
  pass.end();

  // Particle overlay: simulate then additively draw on top of the transition.
  if (state.partEnable) simAndDrawParticles(enc, canvasView, texA, sampler);

  device.queue.submit([enc.finish()]);
}

// Run one sim step into the off-source ping-pong texture, then swap which is
// "current". Writes the current t into the uniform first (so successive steps
// can interpolate from lastT to current).
function runSimStepInto(encoder, tAt) {
  // Patch uniform t for this step (rest of params unchanged from writeUniforms).
  uboF32[0] = tAt;
  device.queue.writeBuffer(uniformBuffer, 0, uboHost, 0, 4);

  const srcTex = (advec.src === 'A') ? stateTexA : stateTexB;
  const dstTex = (advec.src === 'A') ? stateTexB : stateTexA;
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: dstTex.createView(),
      clearValue: { r: 0, g: 0, b: 0, a: 1 },
      loadOp: 'load', storeOp: 'store',
    }],
  });
  pass.setPipeline(simPipeline);
  pass.setBindGroup(0, makeSimBindGroup(srcTex));
  pass.draw(6);
  pass.end();
  advec.src = (advec.src === 'A') ? 'B' : 'A';
}
requestAnimationFrame(render);

// ============================================================================
// UI — image slots
// ============================================================================
const filepicker = document.getElementById('filepicker');
let pickingSlot = null;
document.querySelectorAll('.slot').forEach(s => {
  s.addEventListener('click', () => { pickingSlot = s.dataset.slot; filepicker.click(); });
});
filepicker.addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) loadFile(f, pickingSlot);
  e.target.value = '';
});

// IndexedDB: 'images' tracks the last A/B (key 'imageA'/'imageB'); 'library'
// is the persistent gallery of every image the user has ever loaded.
// moved to idb.js

function loadFile(file, slot) {
  // Videos always go to the T slot — they drive the transition mask, never
  // replace A or B image content.
  if (file.type.startsWith('video/')) {
    loadVideoToT(file);
    return;
  }
  if (slot === 'T') return;  // T only accepts videos
  if (!file.type.startsWith('image/')) return;
  idbPut(slot === 'A' ? 'imageA' : 'imageB', file);
  loadFromUrl(URL.createObjectURL(file), slot);
  addToLibrary(file).then(() => renderLibrary());
}

// ---- transition-video slot (T) ----
function loadVideoToT(file) {
  // Persist so the same video reloads after refresh.
  idbPut('videoT', file);
  const url = URL.createObjectURL(file);
  // Reuse a <video> element inside the T slot so the user sees a live preview
  // and we sample the same element to GPU each frame.
  const el = document.querySelector('.slot[data-slot="T"]');
  el.querySelector('.placeholder')?.remove();
  let v = el.querySelector('video');
  if (!v) {
    v = document.createElement('video');
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
    el.appendChild(v);
  }
  if (state.videoT && state.videoT !== v) state.videoT.pause();
  v.src = url;
  v.addEventListener('loadeddata', () => {
    state.videoT = v;
    v.play().catch(() => {/* autoplay may be blocked until first interaction */});
  }, { once: true });
}
async function uploadVideoFrameToT() {
  const v = state.videoT;
  if (!v || v.readyState < 2) return;
  const w = v.videoWidth, h = v.videoHeight;
  if (w === 0 || h === 0) return;
  if (!texT || texT.width !== w || texT.height !== h) {
    if (texT) texT.destroy();
    texT = device.createTexture({
      label: 'texT-video',
      size: [w, h, 1], format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    bindGroup = makeBindGroup();
  }
  device.queue.copyExternalImageToTexture({ source: v }, { texture: texT }, [w, h, 1]);
}
async function addToLibrary(file) {
  const thumb = await makeThumb(file, 256);
  if (!thumb) return null;
  return libAdd({
    blob: file,
    thumb,
    addedAt: Date.now(),
    name: file.name || 'untitled',
  });
}

// ---- library UI ----
const libGridEl = document.getElementById('library-grid');
const _libThumbUrls = new Map();  // id -> object URL (revoked on re-render)
let _libCache = [];

function libRevokeAll() {
  for (const url of _libThumbUrls.values()) URL.revokeObjectURL(url);
  _libThumbUrls.clear();
}
function activeBlobIds() {
  // Track which library entries correspond to the slots' current images. We
  // compare by blob identity since loadFile keeps a single source-of-truth.
  return { A: state._libIdA || null, B: state._libIdB || null };
}
async function renderLibrary() {
  _libCache = await libList();
  libRevokeAll();
  libGridEl.innerHTML = '';
  if (_libCache.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'library-empty';
    empty.textContent = 'drop or pick images into A/B — they show here';
    libGridEl.appendChild(empty);
    return;
  }
  const { A: idA, B: idB } = activeBlobIds();
  for (const entry of _libCache) {
    const url = URL.createObjectURL(entry.thumb);
    _libThumbUrls.set(entry.id, url);
    const tile = document.createElement('div');
    tile.className = 'library-thumb' + (entry.id === idA ? ' in-A' : '') + (entry.id === idB ? ' in-B' : '');
    tile.title = `${entry.name}\ndrag onto a slot A / T / B`;
    tile.dataset.libId = entry.id;
    tile.draggable = true;
    tile.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('application/x-lib-id', String(entry.id)); ev.dataTransfer.effectAllowed = 'copy'; });
    const img = document.createElement('img');
    img.src = url;
    img.alt = entry.name || 'library image';
    tile.appendChild(img);
    const del = document.createElement('span');
    del.className = 'lib-del'; del.textContent = '×'; del.title = 'Remove';
    tile.appendChild(del);
    libGridEl.appendChild(tile);
  }
}
libGridEl.addEventListener('click', async e => {
  const tile = e.target.closest('.library-thumb');
  if (!tile) return;
  const id = parseInt(tile.dataset.libId, 10);
  // × button removes the image (no confirm — easy remove)
  if (e.target.classList.contains('lib-del')) {
    await libDelete(id);
    if (state._libIdA === id) state._libIdA = null;
    if (state._libIdB === id) state._libIdB = null;
    renderLibrary();
    return;
  }
  const entry = _libCache.find(x => x.id === id);
  if (!entry) return;
  const slot = e.shiftKey ? 'B' : 'A';
  // Don't recurse through loadFile's addToLibrary — load directly + persist as last-A/B.
  state['_libId' + slot] = id;
  idbPut(slot === 'A' ? 'imageA' : 'imageB', entry.blob);
  loadFromUrl(URL.createObjectURL(entry.blob), slot);
  renderLibrary();
});
libGridEl.addEventListener('contextmenu', async e => {
  const tile = e.target.closest('.library-thumb');
  if (!tile) return;
  e.preventDefault();
  const id = parseInt(tile.dataset.libId, 10);
  if (!confirm('Delete this image from the library?')) return;
  await libDelete(id);
  if (state._libIdA === id) state._libIdA = null;
  if (state._libIdB === id) state._libIdB = null;
  renderLibrary();
});
function loadFromUrl(url, slot) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = async () => {
    if (slot === 'A') state.imgA = img; else state.imgB = img;
    await uploadImageToSlot(img, slot);
    updateSlotPreview(slot, url);
    canvas.classList.remove('empty');
    resizeCanvas();
    maybeAutoplay();
  };
  img.onerror = () => {
    console.warn('[matte] failed to load image for slot', slot);
    if (typeof url === 'string' && url.startsWith('blob:')) URL.revokeObjectURL(url);
  };
  img.src = url;
}
function updateSlotPreview(slot, url) {
  const el = document.querySelector(`.slot[data-slot="${slot}"]`);
  if (!el) return;   // slot DOM may be relocated/absent in the custom UI — skip the thumbnail
  el.querySelector('.placeholder')?.remove();
  let im = el.querySelector('img');
  if (!im) { im = document.createElement('img'); im.alt = `source image ${slot}`; el.appendChild(im); }
  // revoke the previous preview blob URL before swapping (avoids a slow leak when
  // repeatedly swapping sources in a long session).
  const prev = im.dataset.objurl;
  if (prev && prev !== url && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
  im.src = url;
  if (typeof url === 'string' && url.startsWith('blob:')) im.dataset.objurl = url; else delete im.dataset.objurl;
}

let _autoplayStarted = false;
function maybeAutoplay() {
  if (_autoplayStarted) return;
  if (!state.imgA || !state.imgB) return;
  _autoplayStarted = true;
  state.playing = true;
  state.t = 0;
  state.startTime = performance.now();
  if (typeof updateTransportLabels !== 'undefined') updateTransportLabels();
}
// On startup: try to restore persisted A/B from IndexedDB; fall back to the
// bundled defaults if a slot has nothing stored. Then render the library grid.
async function seedLibraryWithDefaultsIfEmpty() {
  const list = await libList();
  if (list.length > 0) return;
  for (const path of ['./defaults/lofoten_A.jpg', './defaults/lofoten_B.jpg']) {
    try {
      const resp = await fetch(path);
      if (!resp.ok) continue;
      const blob = await resp.blob();
      await addToLibrary(new File([blob], path.split('/').pop(), { type: blob.type }));
    } catch {}
  }
}
(async () => {
  const [blobA, blobB, blobT] = await Promise.all([
    idbGet('imageA'), idbGet('imageB'), idbGet('videoT'),
  ]);
  // Restore previously-used images if present, but DON'T force the Lerin
  // defaults — trans boots as a matte builder (image-free). The defaults stay
  // in the library to drag in when you want to preview over real footage.
  if (blobA) loadFromUrl(URL.createObjectURL(blobA), 'A');
  if (blobB) loadFromUrl(URL.createObjectURL(blobB), 'B');
  if (blobT) loadVideoToT(blobT);  // restores last-used transition video
  const texBlob = await idbGet('texture');
  if (texBlob) loadTextureFile(texBlob);  // restore last-used grunge/paper texture
  await seedLibraryWithDefaultsIfEmpty();
  renderLibrary();
  resizeCanvas();          // size + reveal the matte canvas (works image-free)
  state.playing = true;    // auto-loop so the matte previews live on load
  state.startTime = performance.now();
})();

// per-slot drag-and-drop
document.querySelectorAll('.slot').forEach(s => {
  s.addEventListener('dragenter', e => { e.preventDefault(); e.stopPropagation(); s.classList.add('drop-target'); });
  s.addEventListener('dragover',  e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; });
  s.addEventListener('dragleave', e => { e.preventDefault(); e.stopPropagation(); s.classList.remove('drop-target'); });
  s.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    s.classList.remove('drop-target');
    const libId = e.dataTransfer.getData('application/x-lib-id');
    if (libId) {
      const item = (_libCache || []).find(it => String(it.id) === libId);
      if (item) loadFromUrl(URL.createObjectURL(item.blob), s.dataset.slot);
      return;
    }
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (files.length) loadFile(files[0], s.dataset.slot);
  });
});
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop',     e => e.preventDefault());

document.getElementById('swap').addEventListener('click', async () => {
  if (!state.imgA && !state.imgB) return;
  const tmpImg = state.imgA; state.imgA = state.imgB; state.imgB = tmpImg;
  // re-upload both
  if (state.imgA) await uploadImageToSlot(state.imgA, 'A');
  if (state.imgB) await uploadImageToSlot(state.imgB, 'B');
  const sA = document.querySelector('.slot[data-slot="A"] img');
  const sB = document.querySelector('.slot[data-slot="B"] img');
  if (sA && sB) { const u = sA.src; sA.src = sB.src; sB.src = u; }
});
document.getElementById('clear').addEventListener('click', async () => {
  state.imgA = null; state.imgB = null;
  texA.destroy(); texB.destroy();
  texA = makePlaceholderTexture();
  texB = makePlaceholderTexture();
  bindGroup = makeBindGroup();
  document.querySelectorAll('.slot').forEach(s => {
    s.querySelector('img')?.remove();
    if (!s.querySelector('.placeholder')) {
      const ph = document.createElement('span');
      ph.className = 'placeholder'; ph.textContent = 'click / drop';
      s.appendChild(ph);
    }
  });
  // Keep the canvas live as a matte generator when a custom size is set;
  // otherwise hide it until an image is loaded.
  if (state.customSize) resizeCanvas(); else canvas.classList.add('empty');
  await idbClearAll();
});

document.getElementById('reset').addEventListener('click', async () => {
  await idbClearAll();
  loadFromUrl('./defaults/lofoten_A.jpg', 'A');
  loadFromUrl('./defaults/lofoten_B.jpg', 'B');
});

window.addEventListener('resize', resizeCanvas);

// (panel show/hide is owned by ui.js — H / Tab toggles body.ui-hidden)

// ============================================================================
// Inert UI registry (was Tweakpane). A chainable Proxy: every method/property
// returns the same stub so all historical .addFolder().addBinding().on() chains
// no-op safely. `children` is [] (dispose loops short-circuit) and `pages` yields
// the stub (tab/page chains keep working). The real UI is ui.js.
// ============================================================================
const _paneStub = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === 'children') return [];
    if (prop === 'pages') return [_paneStub, _paneStub, _paneStub, _paneStub];
    if (prop === 'element' || prop === 'controller_') return document.createElement('div');
    if (prop === Symbol.toPrimitive || prop === 'then' || prop === Symbol.iterator) return undefined;
    return _paneStub;
  },
  apply() { return _paneStub; },
  set() { return true; },
});
const pane = _paneStub;

// Wrap addBinding / addFolder so every tracked binding records its options,
// letting randomizeMode pick values in each control's actual UI range without
// duplicating range tables. Applies recursively to all sub-folders.
const _bindOpts = new WeakMap();
const _bindKey  = new WeakMap();
function _patchAdders(folder) {
  const origBind = folder.addBinding.bind(folder);
  folder.addBinding = (target, key, opts) => {
    const api = origBind(target, key, opts);
    // Only track bindings against the main state object — rating bindings use
    // a local object so they never appear in the randomize walk.
    if (target === state) {
      _bindOpts.set(api, opts || {});
      _bindKey.set(api, key);
    }
    return api;
  };
  const origFolder = folder.addFolder.bind(folder);
  folder.addFolder = (opts) => _patchAdders(origFolder(opts));
  if (folder.addTab) {
    const origTab = folder.addTab.bind(folder);
    folder.addTab = (opts) => {
      const tab = origTab(opts);
      for (const page of tab.pages) _patchAdders(page);
      return tab;
    };
  }
  return folder;
}
_patchAdders(pane);

// ---- per-mode starred flag (simple boolean) ----
const STARRED_LS_KEY = 'trans:starred';
const starred = (() => { try { return JSON.parse(localStorage.getItem(STARRED_LS_KEY)) || {}; } catch { return {}; } })();
function saveStarred() { try { localStorage.setItem(STARRED_LS_KEY, JSON.stringify(starred)); } catch {} }
function setStarred(modeId, on) { if (on) starred[modeId] = true; else delete starred[modeId]; saveStarred(); }
function isStarred(modeId)      { return !!starred[modeId]; }

// Randomize the mode-specific controls of a folder using each binding's actual
// UI range (recorded by _patchAdders). Rating + button-grid + button children
// aren't tracked, so they're skipped naturally.
function randomizeMode(modeId, folder) {
  for (const child of folder.children) {
    if (!_bindKey.has(child)) continue;
    const key  = _bindKey.get(child);
    const opts = _bindOpts.get(child) || {};
    if (opts.options) {
      const values = Object.values(opts.options);
      state[key] = values[Math.floor(Math.random() * values.length)];
    } else if (typeof opts.min === 'number' && typeof opts.max === 'number') {
      const step = opts.step || 0.001;
      const v = opts.min + Math.random() * (opts.max - opts.min);
      state[key] = Math.round(v / step) * step;
    } else if (typeof state[key] === 'boolean') {
      state[key] = Math.random() < 0.5;
    }
  }
  state.seed = Math.floor(Math.random() * 999);
  if (modeId >= 10 && modeId <= 14) advec.needsReset = true;
  pane.refresh();
}

// ---- Setup: the first things you set — dimensions, output mode, timing ----
const fPlay = pane.addFolder({ title: 'Setup', expanded: true });

// — dimensions (independent of any footage) —
const sizePresets = { _v: '1920x1080' };
fPlay.addBinding(sizePresets, '_v', {
  label: 'output size',
  options: {
    // ELVERKET projection surfaces. The .mp4 (HEVC) encoder caps ~8192px wide,
    // so the three smaller surfaces record at their TRUE full pixel map, while
    // ALL & Panorama record at the largest that fits and are upscaled to the
    // real size (shown as →) in AE / the media server. Mattes are soft, so the
    // upscale is invisible.
    'ELVERKET ALL · 8000×4373 (→12000×6559)':   '8000x4373',
    'ELVERKET Panorama · 8000×3411 (→10879×4639)': '8000x3411',
    'ELVERKET Floor · 8160×2719 (full)':        '8160x2719',
    'ELVERKET Long wall · 8160×1920 (full)':    '8160x1920',
    'ELVERKET Short wall · 2719×1920 (full)':   '2719x1920',
    '8K · 7680×4320':  '7680x4320',
    '6K · 5760×3240':  '5760x3240',
    '4K · 3840×2160':  '3840x2160',
    '1440p · 2560×1440': '2560x1440',
    '1080p · 1920×1080': '1920x1080',
    '720p · 1280×720':   '1280x720',
    'Square · 1080×1080':   '1080x1080',
    'Vertical · 1080×1920': '1080x1920',
    'custom': 'custom',
  },
}).on('change', (e) => {
  if (e.value === 'custom') { syncSizeFields(); return; }
  const [w, h] = e.value.split('x').map(Number);
  state.outW = w; state.outH = h; state.customSize = true;
  pane.refresh(); resizeCanvas(); syncSizeFields();
});
// Width/height only show when "custom" is picked (otherwise the preset says it).
const bOutW = fPlay.addBinding(state, 'outW', { step: 1, format: (v) => `${Math.round(v)}`, label: 'width' })
  .on('change', () => { sizePresets._v = 'custom'; resizeCanvas(); });
const bOutH = fPlay.addBinding(state, 'outH', { step: 1, format: (v) => `${Math.round(v)}`, label: 'height' })
  .on('change', () => { sizePresets._v = 'custom'; resizeCanvas(); });
function syncSizeFields() { const custom = sizePresets._v === 'custom'; bOutW.hidden = !custom; bOutH.hidden = !custom; }
syncSizeFields();

// — display size: how large/sharp the on-screen preview renders. The recording
// always uses the full OUTPUT size above regardless of this — drop it to keep
// big outputs (4k/6k) smooth to scrub.
fPlay.addBinding(state, 'previewScale', {
  label: 'display',
  options: { 'Auto (≤1440p, smooth)': '1440', '720p (lightest)': '720', '1080p': '1080', '4K': '3840', 'Full (= output)': 'full' },
}).on('change', () => resizeCanvas());

// — B/W matte output (always). Invert flips black<->white direction. —
fPlay.addBinding(state, 'matteInvert', { label: 'invert (B↔W)' });

// — global vignette (all modes): edge darkening, optional pulse —
const fVignette = fPlay.addFolder({ title: 'Vignette', expanded: false });
fVignette.addBinding(state, 'vignAmount',  { min: 0, max: 1, step: 0.01, label: 'amount' });
fVignette.addBinding(state, 'vignFeather', { min: 0, max: 1, step: 0.01, label: 'feather' });
fVignette.addBinding(state, 'vignAnimate', { min: 0, max: 1, step: 0.01, label: 'animate (pulse)' });

// — timing — duration as a plain number field (type it), not a slider —
fPlay.addBinding(state, 'duration', { step: 0.5, format: (v) => `${v.toFixed(1)}s`, label: 'duration' });
const bT = fPlay.addBinding(state, 't', { min: 0, max: 1, step: 0.001, label: 'progress' });

function togglePlay() {
  if (state.playing) { state.playing = false; }
  else {
    state.playing = true;
    const consumed = state.reverse ? (1 - state.t) : state.t;
    state.startTime = performance.now() - consumed * state.duration * 1000;
  }
  updateTransportLabels();
}
function restartPlayback() {
  state.t = 0; state.reverse = false; state.playing = true;
  state.startTime = performance.now();
  updateTransportLabels();
}
function toggleLoop() {
  state.loop = !state.loop;
  updateTransportLabels();
}
const transportGrid = fPlay.addBlade({
  view: 'buttongrid',
  size: [3, 1],
  cells: (x) => ({ title: [state.playing ? 'Pause' : 'Play', 'Restart', 'Loop'][x] }),
  label: '',
});
transportGrid.on('click', e => {
  const idx = e.index[0];
  if (idx === 0) togglePlay();
  else if (idx === 1) restartPlayback();
  else if (idx === 2) toggleLoop();
});
function updateTransportLabels() {
  const btns = transportGrid.element.querySelectorAll('button');
  if (btns[0]) btns[0].textContent = state.playing ? 'Pause' : 'Play';
  if (btns[2]) {
    btns[2].textContent = 'Loop';
    btns[2].classList.toggle('rating-active', state.loop);
  }
}
const btnRecordSetup = fPlay.addButton({ title: '● Record matte' });
btnRecordSetup.on('click', async () => {
  btnRecordSetup.title = 'Recording…';
  try { await startRecording(); } finally { btnRecordSetup.title = '● Record matte'; }
});

// ---- output folder (File System Access API, Chromium-only) ----
const outputFolderProxy = { name: 'browser default' };
(async () => {
  const saved = await idbGet('outputDir');
  if (saved) {
    setOutputDir(saved);
    outputFolderProxy.name = saved.name;
    try { pane.refresh(); } catch {}
  }
})();
// file output -> ./output.js
fPlay.addBinding(outputFolderProxy, 'name', { readonly: true, label: 'output folder' });
fPlay.addBlade({
  view: 'buttongrid',
  size: [2, 1],
  cells: (x) => ({ title: HAS_FS_ACCESS ? ['📁 Pick folder', 'Use default'][x] : ['(not supported in this browser)', ''][x] }),
  label: '',
}).on('click', async e => {
  if (!HAS_FS_ACCESS) return;
  if (e.index[0] === 0) {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setOutputDir(handle);
      outputFolderProxy.name = handle.name;
      await idbPut('outputDir', handle);
      pane.refresh();
    } catch (err) { if (err.name !== 'AbortError') alert('Folder pick failed: ' + err.message); }
  } else {
    setOutputDir(null);
    outputFolderProxy.name = 'browser default';
    await idbPut('outputDir', null);
    pane.refresh();
  }
});


// ---- top-level tabs (Setup stays above; everything else goes in a tab) ----
const tabs = pane.addTab({
  pages: [
    { title: 'Mode' },
    { title: 'Texture' },
  ],
});
const tabMode    = tabs.pages[0];
const tabTexture = tabs.pages[1];
// Output export, particles, presets, segmentation, framing, style are dropped
// from this matte-builder build (B/W mattes via the Setup "Record matte"
// button with sensible defaults). Their UI still builds, into a hidden folder.
const _hiddenTab = pane.addFolder({ title: '·', expanded: false });
_hiddenTab.hidden = true;
const tabOutput    = _hiddenTab;  // export settings (hidden; defaults used)
const tabFrame     = _hiddenTab;  // Style + Framing (hidden)
const tabParticles = _hiddenTab;
const tabSaved     = _hiddenTab;
const tabSegment   = _hiddenTab;

// ----- Particles (GPU compute layer) -----
const fPart = tabParticles.addFolder({ title: 'Particles', expanded: true });
fPart.addBinding(state, 'partEnable', { label: 'enable' });
fPart.addBinding(state, 'partCount', { min: 1000, max: 600000, step: 1000, label: 'count' })
  .on('change', () => { particles.needsReset = true; });
fPart.addBinding(state, 'partBurst',  { min: 0, max: 1, step: 0.01, label: 'burst ↔ glow' });
fPart.addBinding(state, 'partSpeed',  { min: 0, max: 6, step: 0.01, label: 'speed' });
fPart.addBinding(state, 'partCurl',   { min: 0, max: 1, step: 0.01, label: 'curl drift' });
fPart.addBinding(state, 'partTrail',  { min: 0, max: 1, step: 0.01, label: 'streak / trail' });
fPart.addBinding(state, 'partDrag',   { min: 0, max: 4, step: 0.01, label: 'drag' });
fPart.addBinding(state, 'partGravity',{ min: -2, max: 2, step: 0.01, label: 'gravity' });
fPart.addBinding(state, 'partLife',   { min: 0.05, max: 1.5, step: 0.01, label: 'life' });
fPart.addBinding(state, 'partFade',   { min: 0, max: 1, step: 0.01, label: 'fade curve' });
fPart.addBinding(state, 'partSize',   { min: 0.001, max: 0.04, step: 0.001, label: 'size' });
fPart.addBinding(state, 'partGlow',   { min: 0, max: 3, step: 0.01, label: 'glow' });
fPart.addBinding(state, 'partColorMix', { min: 0, max: 1, step: 0.01, label: 'source colour' });
fPart.addBinding(state, 'partGlowColor', { view: 'color', label: 'glow colour' });
fPart.addBinding(state, 'partSpread', { min: 0, max: 1, step: 0.01, label: 'front spread' })
  .on('change', () => { particles.needsReset = true; });
fPart.addBinding(state, 'partCenterX', { min: 0, max: 1, step: 0.01, label: 'centre x' })
  .on('change', () => { particles.needsReset = true; });
fPart.addBinding(state, 'partCenterY', { min: 0, max: 1, step: 0.01, label: 'centre y' })
  .on('change', () => { particles.needsReset = true; });

// Per-mode default values — used by the "Reset defaults" button in each
// mode folder to restore that mode's params without touching anything else.
const MODE_DEFAULTS = {
  29: { cellCols: 5, cellRows: 10, cellJitter: 0.3, cellGlow: 0.12, cellOrder: 0.6, cellCascade: 0.3, cellSnap: 0.0, cellSpill: 0.0, cellIgniteBy: 0, cellCoarseness: 0.5 },
  1:  { rimWidth: 0.12, rimDark: 0.6 },
  2:  { paperAngle: 0, paperAniso: 4, paperGranulation: 0.5, paperGrowth: 0.5, paperFollow: 0.35, paperPatches: 0.45 },
  3:  { bloomCount: 8, bloomRim: 0.6, bloomRate: 0.55, bloomImageBias: 0.6 },
  4:  { diffStrength: 0.55, diffRadius: 0.45 },
  5:  { sedBands: 6, sedSoftness: 0.35, sedDirection: 0, sedSource: 0 },
  6:  { saltDensity: 0.0, saltContrast: 0.55, saltSource: 1, saltBias: 0.6, saltImage: 2 },
  7:  { irisFocusX: 0.5, irisFocusY: 0.5, irisJitter: 0.35, irisUniform: true },
  8:  { bleedFinger: 0.5, bleedAmount: 0.45, bleedHalo: 0.5 },
  9:  { runGravity: 0.5, runDrip: 0.35 },
  10: { advecVisc: 0.55, advecRate: 0.18, advecSteps: 3 },
  11: { advecGravity: 0.6, advecGravBias: 0.5, advecGravAngle: 0, advecGravStreak: 0.4, advecGravLateral: 0.3 },
  12: { advecCurlStr: 0.5, advecCurlScale: 2.5 },
  13: { advecBrushFollow: 0.7 },
  14: { advecSeedCount: 5, advecSeedRadius: 0.45 },
  66: { originX: 0.5, originY: 0.5, maskScale: 1.6, organic: 0.55, spread: 0.45, turbulence: 0.35, flow: 0.4, undulate: 0.4, edges: 0.3, seed: 1 },
  67: { originX: 0.5, originY: 0.5, maskScale: 1.5, organic: 0.55, spread: 0.4, turbulence: 0.5, flow: 0.4, undulate: 0.4, edges: 0.4, seed: 1 },
  15: {
    weEdgeScale: 6.0, weEdgeWobble: 0.55,
    weDryRing: 0.45, weBleed: 0.5,
    weTendrilCount: 6, weTendrilReach: 0.4, weTendrilWidth: 0.5, weTendrilStrength: 0.55,
    weDetailBias: 0.35,
    weReverse: false, weBDetailBias: 0.0, weBLumaBias: 0.0,
  },
  16: { strokeScale: 6.0, strokeAniso: 4.0 },
  17: { glazeBands: 3.0, glazeSoftness: 0.55, glazeDirection: 0, glazeWarm: 0.35 },
  18: { edgeFirstInk: 0.55, edgeFirstFade: 0.35, edgeFirstScale: 3.0 },
  19: { flowAmount: 0.55 },
  20: { dabsCount: 28, dabsReach: 0.32, dabsWobble: 0.6 },
  21: { densityGravity: 0.45, densitySmear: 0.45 },
  22: { moldSeedCount: 5, moldTendrilsPerSeed: 4, moldReach: 0.5, moldWidth: 0.35, moldWobble: 0.6 },
  23: { formStrokeCount: 32, formStrokeSize: 0.05, formStrokeWobble: 0.5 },
  24: { bloomLightBias: 0.85, bloomWobble: 0.5, bloomPaperShow: 0.6 },
  25: { stageBands: 4, stageOverlap: 0.5 },
  26: { migrationStrength: 0.6, migrationDir: 0, migrationTurb: 0.5 },
  27: {
    burnEdgeWobble: 1.0, burnCharIntensity: 1.0, burnCharWidth: 0.07,
    burnCharPersistence: 0.0,
    burnGlowIntensity: 0.35, burnGlowWidth: 0.3, burnEmberTrail: 0.5,
    burnSeedCount: 0,
    burnBrowning: 0.5, burnBrowningWidth: 0.1,
    burnAshSpatter: 0,
    burnGlowColor: '#b04514',
    burnBIgnite: 0, burnGlowFromB: 0,
    burnColorBleed: 0,
  },
  29: {
    meltCellScale: 7, meltCenterX: 0.5, meltCenterY: 0.5, meltCellJitter: 0.7,
    meltInkAmount: 0.8, meltGlowIntensity: 0.5, meltGlowColor: '#c46a18',
  },
  30: {
    lightIntensity: 1.0, lightSpread: 0.4, lightPeakT: 0.5, lightFlashWidth: 0.1,
    lightColor: '#fff7e6',
  },
  // radial burst (48) + smoke ring (49) reuse the generic reveal controls; these
  // are good starting points for each effect's character.
  48: { originX: 0.5, originY: 0.5, organic: 0.55, edges: 0.4, turbulence: 0.3, flow: 0.5, spread: 0.18, curve: 3, seed: 42 },
  49: { originX: 0.5, originY: 0.5, organic: 0.45, edges: 0.0, turbulence: 0.6, flow: 0.5, spread: 0.32, curve: 0, seed: 7 },
  // mirror expand (64): gate-from-black by default — organic off, edge tight so
  // it opens as a thin centre sliver rather than a soft bloom.
  64: { mirrorDir: 0, organic: 0, spread: 0.06, maskScale: 0.9 },
  // door (65): clean panel parting — crisp seam, no organic involved at all.
  65: { mirrorDir: 0, spread: 0.03 },
  // box reveal (68): centred rectangle that expands uniformly outward with crisp
  // square corners. Seed half-size 0.15, front travels 0.6 past the edges.
  68: { rectW: 0.15, rectH: 0.15, rectReach: 0.6, spread: 0.03, originAmount: 0 },
};
function resetModeDefaults(modeId) {
  const d = MODE_DEFAULTS[modeId];
  if (!d) return;
  for (const [k, v] of Object.entries(d)) state[k] = v;
  if (modeId >= 10 && modeId <= 14) advec.needsReset = true;
  pane.refresh();
}
function addModeFooter(folder, modeId) {
  // Randomize + Reset side-by-side.
  const actionGrid = folder.addBlade({
    view: 'buttongrid',
    size: [2, 1],
    cells: (x) => ({ title: ['🎲 Randomize', 'Reset'][x] }),
    label: '',
  });
  actionGrid.on('click', e => {
    if (e.index[0] === 0) randomizeMode(modeId, folder);
    else resetModeDefaults(modeId);
  });
}

// ----- Watercolor mode + per-mode controls -----
const fWater = tabMode.addFolder({ title: 'Effect', expanded: true });
const MODE_OPTIONS = {
  '— off (smooth)':                       0,
  'Painterly — pigment rim':              1,
  'Painterly — paper grain':              2,
  'Painterly — backrun blooms':           3,
  'Painterly — wet diffusion':            4,
  'Painterly — tonal sediment':           5,
  'Painterly — salt':                     6,
  'Painterly — iris':                     7,
  'Painterly — wet bleed':                8,
  'Painterly — pigment run':              9,
  'Advection — wet':                      10,
  'Advection — gravity':                  11,
  'Advection — curl-noise eddies':        12,
  'Advection — brush-channel':            13,
  'Advection — seed-point injection':     14,
  'Wet edge — rect ingress':              15,
  'Image-driven — stroke-follow':         16,
  'Image-driven — tonal wash':            17,
  'Image-driven — edge underdrawing':     18,
  'Image-driven — painterly flow':        19,
  'Image-driven — color-pool dabs':       20,
  'Image-driven — wet-density gravity':   21,
  'Decay — mold tendrils':                22,
  'Strong watercolor — formation':        23,
  'Strong watercolor — cauliflower bloom':24,
  'Strong watercolor — wet-stage layer':  25,
  'Strong watercolor — pigment migration':26,
  'Burn — paper scorch from edges':       27,
  'Video mask (T slot)':                  28,
  'Light & burn — lamp grid':             29,
  'Light bloom — overexposure to reveal': 30,
  'Light & burn — radial burst':          48,
  'Light & burn — smoke ring':            49,
  'Texture — reveal by luminance':        32,
  'Ambient — bokeh (looping)':            33,
  'Ambient — water ripples (looping)':    34,
  'Ambient — sun glare (looping)':        35,
  'Ambient — light streaks (looping)':    36,
  'Paint — paint the movement':           37,
  'Ambient — aurora / borealis (looping)':38,
  'Ambient — godrays through clouds (looping)':39,
  'Ambient — organic blooms (looping)':40,
};
const MODE_NAMES_FULL = Object.fromEntries(Object.entries(MODE_OPTIONS).map(([n, id]) => [id, n]));
fWater.addBinding(state, 'mode', {
  label: 'mode',
  options: MODE_OPTIONS,
}).on('change', () => { updateModeFolders(); advec.needsReset = true; particles.needsReset = true; if (typeof syncPaintMode === 'function') syncPaintMode(); restartPlayback(); });

const fRim    = fWater.addFolder({ title: 'Pigment rim',    expanded: true });
fRim.addBinding(state, 'rimWidth', { min: 0, max: 0.4, step: 0.005, label: 'rim width' });
fRim.addBinding(state, 'rimDark',  { min: 0, max: 1, step: 0.01, label: 'rim dark' });
addModeFooter(fRim, 1);

const fPaper  = fWater.addFolder({ title: 'Paper grain',    expanded: true });
fPaper.addBinding(state, 'paperAngle',       { min: 0, max: 1, step: 0.005, label: 'fiber angle' });
fPaper.addBinding(state, 'paperAniso',       { min: 1, max: 10, step: 0.1, label: 'anisotropy' });
fPaper.addBinding(state, 'paperGranulation', { min: 0, max: 1, step: 0.01, label: 'granulation' });
fPaper.addBinding(state, 'paperGrowth',      { min: 0, max: 1, step: 0.01, label: 'fiber growth' });
fPaper.addBinding(state, 'paperFollow',      { min: 0, max: 1, step: 0.01, label: 'follow B strokes' });
fPaper.addBinding(state, 'paperPatches',     { min: 0, max: 1, step: 0.01, label: 'local patches' });
addModeFooter(fPaper, 2);

const fBlooms = fWater.addFolder({ title: 'Backrun blooms', expanded: true });
fBlooms.addBinding(state, 'bloomCount', { min: 1, max: 24, step: 1, label: 'count' });
fBlooms.addBinding(state, 'bloomRate',  { min: 0.1, max: 2, step: 0.01, label: 'growth rate' });
fBlooms.addBinding(state, 'bloomRim',   { min: 0, max: 1, step: 0.01, label: 'rim dark' });
fBlooms.addBinding(state, 'bloomImageBias', { min: 0, max: 1, step: 0.01, label: 'follow B lights' });
addModeFooter(fBlooms, 3);

const fDiff   = fWater.addFolder({ title: 'Wet diffusion',  expanded: true });
fDiff.addBinding(state, 'diffStrength', { min: 0, max: 1, step: 0.01, label: 'strength' });
fDiff.addBinding(state, 'diffRadius',   { min: 0, max: 1, step: 0.01, label: 'radius' });
addModeFooter(fDiff, 4);

const fSed    = fWater.addFolder({ title: 'Tonal sediment', expanded: true });
fSed.addBinding(state, 'sedSource', {
  label: 'decompose by',
  options: { 'luminance': 0, 'saturation': 1, 'hue': 2, 'detail': 3, 'temperature': 4 },
});
fSed.addBinding(state, 'sedBands',    { min: 1, max: 16, step: 1, label: 'bands' });
fSed.addBinding(state, 'sedSoftness', { min: 0, max: 1, step: 0.01, label: 'softness' });
fSed.addBinding(state, 'sedDirection', {
  label: 'order',
  options: { 'low → high': 0, 'high → low': 1 },
});
addModeFooter(fSed, 5);

const fSalt   = fWater.addFolder({ title: 'Salt',           expanded: true });
fSalt.addBinding(state, 'saltDensity',  { min: 0, max: 1, step: 0.01, label: 'grain' });
fSalt.addBinding(state, 'saltContrast', { min: 0, max: 1, step: 0.01, label: 'contrast' });
fSalt.addBinding(state, 'saltSource', {
  label: 'reveal from',
  options: { 'random (none)': 0, 'light areas': 1, 'dark areas': 2, 'coloured areas': 3, 'edge detail': 4 },
});
fSalt.addBinding(state, 'saltImage', {
  label: 'sample',
  options: { 'A': 0, 'B': 1, 'both': 2 },
});
fSalt.addBinding(state, 'saltBias',     { min: 0, max: 1, step: 0.01, label: 'bias amount' });
addModeFooter(fSalt, 6);

const fIris   = fWater.addFolder({ title: 'Iris',           expanded: true });
fIris.addBinding(state, 'irisUniform', { label: 'uniform circle' });
fIris.addBinding(state, 'irisFocusX', { min: 0, max: 1, step: 0.005, label: 'focus x' });
fIris.addBinding(state, 'irisFocusY', { min: 0, max: 1, step: 0.005, label: 'focus y' });
fIris.addBinding(state, 'irisJitter', { min: 0, max: 1, step: 0.01, label: 'jitter' });
addModeFooter(fIris, 7);

const fBleed  = fWater.addFolder({ title: 'Wet bleed',      expanded: true });
fBleed.addBinding(state, 'bleedFinger', { min: 0, max: 1, step: 0.01, label: 'finger' });
fBleed.addBinding(state, 'bleedAmount', { min: 0, max: 1, step: 0.01, label: 'amount' });
fBleed.addBinding(state, 'bleedHalo',   { min: 0, max: 1, step: 0.01, label: 'wet halo' });
addModeFooter(fBleed, 8);

const fRun    = fWater.addFolder({ title: 'Pigment run',    expanded: true });
fRun.addBinding(state, 'runGravity', { min: 0, max: 1, step: 0.01, label: 'gravity' });
fRun.addBinding(state, 'runDrip',    { min: 0, max: 1, step: 0.01, label: 'drip' });
addModeFooter(fRun, 9);

const fAdvec  = fWater.addFolder({ title: 'Wet advection',  expanded: true });
fAdvec.addBinding(state, 'advecVisc',  { min: 0, max: 1, step: 0.01, label: 'viscosity' });
fAdvec.addBinding(state, 'advecRate',  { min: 0, max: 1, step: 0.01, label: 'mixing rate' });
fAdvec.addBinding(state, 'advecSteps', { min: 1, max: 8, step: 1, label: 'steps / frame' });
addModeFooter(fAdvec, 10);
fAdvec.addButton({ title: 'Reset simulation' }).on('click', () => { advec.needsReset = true; });

const fAdvecG = fWater.addFolder({ title: 'Gravity advection', expanded: true });
fAdvecG.addBinding(state, 'advecGravAngle',   { min: 0, max: 1, step: 0.005, label: 'flow angle' });
fAdvecG.addBinding(state, 'advecGravity',     { min: 0, max: 1, step: 0.01, label: 'gravity' });
fAdvecG.addBinding(state, 'advecGravStreak',  { min: 0, max: 1, step: 0.01, label: 'streak' });
fAdvecG.addBinding(state, 'advecGravLateral', { min: 0, max: 1, step: 0.01, label: 'lateral spread' });
fAdvecG.addBinding(state, 'advecGravBias',    { min: 0, max: 1, step: 0.01, label: 'shadow ↔ flow' });
addModeFooter(fAdvecG, 11);
fAdvecG.addButton({ title: 'Reset simulation' }).on('click', () => { advec.needsReset = true; });

const fAdvecC = fWater.addFolder({ title: 'Curl-noise eddies', expanded: true });
fAdvecC.addBinding(state, 'advecCurlStr',   { min: 0, max: 1, step: 0.01, label: 'eddy strength' });
fAdvecC.addBinding(state, 'advecCurlScale', { min: 0.5, max: 8, step: 0.1, label: 'eddy scale' });
addModeFooter(fAdvecC, 12);
fAdvecC.addButton({ title: 'Reset simulation' }).on('click', () => { advec.needsReset = true; });

const fAdvecB = fWater.addFolder({ title: 'Brush-channel advection', expanded: true });
fAdvecB.addBinding(state, 'advecBrushFollow', { min: 0, max: 1, step: 0.01, label: 'follow strokes' });
addModeFooter(fAdvecB, 13);
fAdvecB.addButton({ title: 'Reset simulation' }).on('click', () => { advec.needsReset = true; });

const fAdvecS = fWater.addFolder({ title: 'Seed-point injection', expanded: true });
fAdvecS.addBinding(state, 'advecSeedCount',  { min: 1, max: 16, step: 1, label: 'seed count' });
fAdvecS.addBinding(state, 'advecSeedRadius', { min: 0.1, max: 1, step: 0.01, label: 'reach' });
addModeFooter(fAdvecS, 14);
fAdvecS.addButton({ title: 'Reset simulation' }).on('click', () => { advec.needsReset = true; });

const fWetEdge = fWater.addFolder({ title: 'Wet edge (rect)', expanded: true });
fWetEdge.addBinding(state, 'weEdgeScale',       { min: 1,    max: 16, step: 0.1,  label: 'edge scale' });
fWetEdge.addBinding(state, 'weEdgeWobble',      { min: 0,    max: 1,  step: 0.01, label: 'edge wobble' });
fWetEdge.addBinding(state, 'weTendrilCount',    { min: 0,    max: 32, step: 1,    label: 'tendril count' });
fWetEdge.addBinding(state, 'weTendrilReach',    { min: 0.02, max: 1,  step: 0.01, label: 'tendril reach' });
fWetEdge.addBinding(state, 'weTendrilWidth',    { min: 0.02, max: 1,  step: 0.01, label: 'tendril width' });
fWetEdge.addBinding(state, 'weTendrilStrength', { min: 0,    max: 1,  step: 0.01, label: 'tendril strength' });
fWetEdge.addBinding(state, 'weDetailBias',      { min: 0,    max: 1,  step: 0.01, label: 'detail bias (A)' });
fWetEdge.addBinding(state, 'weBDetailBias',     { min: 0,    max: 1,  step: 0.01, label: 'detail bias (B)' });
fWetEdge.addBinding(state, 'weBLumaBias',       { min: -1,   max: 1,  step: 0.01, label: 'B luma bias' });
fWetEdge.addBinding(state, 'weReverse',         { label: 'reverse (center→out)' });
fWetEdge.addBinding(state, 'weDryRing',         { min: 0,    max: 1,  step: 0.01, label: 'dry-ring dark' });
fWetEdge.addBinding(state, 'weBleed',           { min: 0,    max: 1,  step: 0.01, label: 'anticipatory bleed' });
addModeFooter(fWetEdge, 15);

const fStroke = fWater.addFolder({ title: 'Stroke-follow', expanded: true });
fStroke.addBinding(state, 'strokeScale', { min: 0.5, max: 20, step: 0.1, label: 'stroke scale' });
fStroke.addBinding(state, 'strokeAniso', { min: 1,   max: 12, step: 0.1, label: 'anisotropy' });
addModeFooter(fStroke, 16);

const fGlaze = fWater.addFolder({ title: 'Tonal wash', expanded: true });
fGlaze.addBinding(state, 'glazeBands',    { min: 2, max: 8, step: 1,    label: 'washes' });
fGlaze.addBinding(state, 'glazeSoftness', { min: 0, max: 1, step: 0.01, label: 'softness' });
fGlaze.addBinding(state, 'glazeDirection', {
  label: 'order',
  options: { 'darks first': 0, 'lights first': 1 },
});
fGlaze.addBinding(state, 'glazeWarm', { min: 0, max: 1, step: 0.01, label: 'warm dry-shift' });
addModeFooter(fGlaze, 17);

const fEdgeFirst = fWater.addFolder({ title: 'Edge underdrawing', expanded: true });
fEdgeFirst.addBinding(state, 'edgeFirstInk',   { min: 0,    max: 1,  step: 0.01, label: 'ink' });
fEdgeFirst.addBinding(state, 'edgeFirstFade',  { min: 0.05, max: 0.9, step: 0.01, label: 'sketch fades at t=' });
fEdgeFirst.addBinding(state, 'edgeFirstScale', { min: 1,    max: 10, step: 0.1,  label: 'mask scale' });
addModeFooter(fEdgeFirst, 18);

const fFlow = fWater.addFolder({ title: 'Painterly flow', expanded: true });
fFlow.addBinding(state, 'flowAmount', { min: 0, max: 1, step: 0.01, label: 'flow amount' });
addModeFooter(fFlow, 19);

const fDabs = fWater.addFolder({ title: 'Color-pool dabs', expanded: true });
fDabs.addBinding(state, 'dabsCount',  { min: 1,    max: 128, step: 1,    label: 'dab count' });
fDabs.addBinding(state, 'dabsReach',  { min: 0.05, max: 1,   step: 0.01, label: 'reach' });
fDabs.addBinding(state, 'dabsWobble', { min: 0,    max: 1,   step: 0.01, label: 'edge wobble' });
addModeFooter(fDabs, 20);

const fDensity = fWater.addFolder({ title: 'Wet-density gravity', expanded: true });
fDensity.addBinding(state, 'densityGravity', { min: 0, max: 1, step: 0.01, label: 'gravity bias' });
fDensity.addBinding(state, 'densitySmear',   { min: 0, max: 1, step: 0.01, label: 'wet smear' });
addModeFooter(fDensity, 21);

const fMold = fWater.addFolder({ title: 'Mold tendrils', expanded: true });
fMold.addBinding(state, 'moldSeedCount',        { min: 1,    max: 16, step: 1,    label: 'seed count' });
fMold.addBinding(state, 'moldTendrilsPerSeed',  { min: 1,    max: 8,  step: 1,    label: 'tendrils / seed' });
fMold.addBinding(state, 'moldReach',            { min: 0.05, max: 1,  step: 0.01, label: 'reach' });
fMold.addBinding(state, 'moldWidth',            { min: 0.05, max: 1,  step: 0.01, label: 'tendril width' });
fMold.addBinding(state, 'moldWobble',           { min: 0,    max: 1,  step: 0.01, label: 'wobble' });
addModeFooter(fMold, 22);

const fForm = fWater.addFolder({ title: 'Watercolor formation', expanded: true });
fForm.addBinding(state, 'formStrokeCount',  { min: 1,    max: 64,  step: 1,    label: 'stroke count' });
fForm.addBinding(state, 'formStrokeSize',   { min: 0.01, max: 0.2, step: 0.005, label: 'stroke size' });
fForm.addBinding(state, 'formStrokeWobble', { min: 0,    max: 1,   step: 0.01, label: 'edge wobble' });
addModeFooter(fForm, 23);

const fBloom = fWater.addFolder({ title: 'Cauliflower bloom', expanded: true });
fBloom.addBinding(state, 'bloomLightBias',  { min: 0, max: 1, step: 0.01, label: 'light bias (B)' });
fBloom.addBinding(state, 'bloomWobble',     { min: 0, max: 1, step: 0.01, label: 'bloom wobble' });
fBloom.addBinding(state, 'bloomPaperShow',  { min: 0, max: 1, step: 0.01, label: 'paper-show pop' });
addModeFooter(fBloom, 24);

const fStage = fWater.addFolder({ title: 'Wet-stage layering', expanded: true });
fStage.addBinding(state, 'stageBands',   { min: 2, max: 8, step: 1,    label: 'stages' });
fStage.addBinding(state, 'stageOverlap', { min: 0, max: 1, step: 0.01, label: 'stage overlap' });
addModeFooter(fStage, 25);

const fMig = fWater.addFolder({ title: 'Pigment migration', expanded: true });
fMig.addBinding(state, 'migrationStrength', { min: 0, max: 1, step: 0.01, label: 'strength' });
fMig.addBinding(state, 'migrationDir', {
  label: 'direction',
  options: { 'along gradient': 0, 'perpendicular': 1 },
});
fMig.addBinding(state, 'migrationTurb', { min: 0, max: 1, step: 0.01, label: 'turbulence' });
addModeFooter(fMig, 26);

const fBurn = fWater.addFolder({ title: 'Paper scorch (burn)', expanded: true });
fBurn.addBinding(state, 'burnEdgeWobble',      { min: 0,    max: 1,   step: 0.01, label: 'front irregularity' });
fBurn.addBinding(state, 'burnCharIntensity',   { min: 0,    max: 1,   step: 0.01, label: 'char depth' });
fBurn.addBinding(state, 'burnCharWidth',       { min: 0.01, max: 0.5, step: 0.005, label: 'char band width' });
fBurn.addBinding(state, 'burnCharPersistence', { min: 0,    max: 1,   step: 0.01, label: 'char persistence' });
fBurn.addBinding(state, 'burnBrowning',        { min: 0,    max: 1,   step: 0.01, label: 'browning halo' });
fBurn.addBinding(state, 'burnBrowningWidth',   { min: 0.01, max: 0.3, step: 0.005, label: 'browning width' });
fBurn.addBinding(state, 'burnAshSpatter',      { min: 0,    max: 1,   step: 0.01, label: 'ash spatter' });
fBurn.addBinding(state, 'burnGlowIntensity',   { min: 0,    max: 1.5, step: 0.01, label: 'glow' });
fBurn.addBinding(state, 'burnGlowWidth',       { min: 0.05, max: 1,   step: 0.01, label: 'glow width' });
fBurn.addBinding(state, 'burnEmberTrail',      { min: 0,    max: 1,   step: 0.01, label: 'ember trail' });
fBurn.addBinding(state, 'burnGlowColor',       { view: 'color', label: 'glow color' });
fBurn.addBinding(state, 'burnGlowFromB',       { min: 0,    max: 1,   step: 0.01, label: 'glow ← B color' });
fBurn.addBinding(state, 'burnSeedCount',       { min: 0,    max: 16,  step: 1,    label: 'extra ignition spots' });
fBurn.addBinding(state, 'burnBIgnite',         { min: 0,    max: 1,   step: 0.01, label: 'ignite from B' });
fBurn.addBinding(state, 'burnColorBleed',      { min: 0,    max: 1,   step: 0.01, label: 'color bleed (A → B)' });
addModeFooter(fBurn, 27);

const fVideoMask = fWater.addFolder({ title: 'Video mask (T slot)', expanded: true });
fVideoMask.addBinding(state, 'videoMaskInvert', { label: 'invert (dark first)' });
fVideoMask.addBinding(state, 'videoMaskFeather', { min: 0, max: 1, step: 0.01, label: 'feather (show video at front)' });
fVideoMask.addBinding(state, 'videoBrightness', { min: -1, max: 1, step: 0.01, label: 'brightness' });
fVideoMask.addBinding(state, 'videoContrast',   { min: 0,  max: 3, step: 0.01, label: 'contrast' });
fVideoMask.addBinding(state, 'videoSaturate',   { min: 0,  max: 3, step: 0.01, label: 'saturate' });
addModeFooter(fVideoMask, 28);

const fMelt = fWater.addFolder({ title: 'Film melt (ink burn)', expanded: true });
fMelt.addBinding(state, 'meltCellScale',     { min: 3,   max: 30,  step: 1,    label: 'cells across' });
fMelt.addBinding(state, 'meltCellJitter',    { min: 0,   max: 1,   step: 0.01, label: 'cell jitter' });
fMelt.addBinding(state, 'meltCenterX',       { min: 0,   max: 1,   step: 0.005, label: 'center x' });
fMelt.addBinding(state, 'meltCenterY',       { min: 0,   max: 1,   step: 0.005, label: 'center y' });
fMelt.addBinding(state, 'meltInkAmount',     { min: 0,   max: 1,   step: 0.01, label: 'ink lines' });
fMelt.addBinding(state, 'meltGlowIntensity', { min: 0,   max: 1.5, step: 0.01, label: 'glow' });
fMelt.addBinding(state, 'meltGlowColor',     { view: 'color', label: 'glow color' });
addModeFooter(fMelt, 29);

const fLight = fWater.addFolder({ title: 'Light bloom (overexposure)', expanded: true });
fLight.addBinding(state, 'lightIntensity',   { min: 0,    max: 2.5,  step: 0.01, label: 'light intensity' });
fLight.addBinding(state, 'lightSpread',      { min: 0,    max: 1,    step: 0.01, label: 'spread (uniformity)' });
fLight.addBinding(state, 'lightPeakT',       { min: 0.2,  max: 0.8,  step: 0.01, label: 'peak at (t)' });
fLight.addBinding(state, 'lightFlashWidth',  { min: 0.03, max: 0.4,  step: 0.01, label: 'flash width' });
fLight.addBinding(state, 'lightColor',       { view: 'color', label: 'light color' });
addModeFooter(fLight, 30);

const fAurora = fWater.addFolder({ title: 'Aurora', expanded: true });
fAurora.addBinding(state, 'auroraDensity', { min: 0, max: 1, step: 0.01, label: 'curtain density' });
fAurora.addBinding(state, 'auroraHeight',  { min: 0, max: 1, step: 0.01, label: 'ray height' });
fAurora.addBinding(state, 'auroraSpeed',   { min: 0, max: 1, step: 0.01, label: 'speed' });
fAurora.addBinding(state, 'auroraWave',    { min: 0, max: 1, step: 0.01, label: 'wave through' });
fAurora.addBinding(state, 'auroraDark',    { min: 0, max: 1, step: 0.01, label: 'darkness' });

const fAmbient = fWater.addFolder({ title: 'Ambient', expanded: true });
fAmbient.addBinding(state, 'ambCount', { min: 0, max: 1, step: 0.01, label: 'count / density' });
fAmbient.addBinding(state, 'ambSize',  { min: 0, max: 1, step: 0.01, label: 'size / scale' });
fAmbient.addBinding(state, 'ambSoft',  { min: 0, max: 1, step: 0.01, label: 'softness' });
fAmbient.addBinding(state, 'ambSpeed', { min: 0, max: 1, step: 0.01, label: 'speed' });
fAmbient.addBinding(state, 'ambDetail', { min: 0, max: 1, step: 0.01, label: 'detail / fidelity' });

// direction / source — used by bokeh, streaks, sun glare, godrays
const fDir = fWater.addFolder({ title: 'Direction / source', expanded: true });
fDir.addBinding(state, 'driftAngle', { min: 0, max: 1, step: 0.01, label: 'direction' });
fDir.addBinding(state, 'driftAmount', { min: 0, max: 1, step: 0.01, label: 'amount' });
fDir.addBinding(state, 'sunX', { min: 0, max: 1, step: 0.01, label: 'sun / source x' });
fDir.addBinding(state, 'sunY', { min: 0, max: 1, step: 0.01, label: 'sun / source y' });
fDir.addBinding(state, 'streakMove', { min: 0, max: 1, step: 0.01, label: 'movement dir' });

const fGodray = fWater.addFolder({ title: 'Godrays', expanded: true });
fGodray.addBinding(state, 'gdIntensity', { min: 0, max: 1, step: 0.01, label: 'intensity' });
fGodray.addBinding(state, 'gdBeams',     { min: 0, max: 1, step: 0.01, label: 'beam count / thinness' });
fGodray.addBinding(state, 'gdCloud',     { min: 0, max: 1, step: 0.01, label: 'break through cloud' });
fGodray.addBinding(state, 'gdPulse',     { min: 0, max: 1, step: 0.01, label: 'pulse (in & out)' });
fGodray.addBinding(state, 'gdSpeed',     { min: 0.25, max: 4, step: 0.05, label: 'animation speed' });

// The legacy pane's per-mode folder visibility. The real per-mode params are
// built by ui.js (buildParams), so this is now a no-op kept only because the
// engine + ui call it on mode change.
function updateModeFolders() {}

const fDis = tabMode.addFolder({ title: 'Reveal', expanded: true });
// — core: where it starts and how soft the edge is —
const bFromWithin = fDis.addBinding(state, 'originAmount', { min: 0, max: 1, step: 0.01, label: 'from within' });
const bEdgeSoft = fDis.addBinding(state, 'spread',    { min: 0, max: 1, step: 0.01, label: 'edge softness' });

// — movement (collapsed) — animation for transition modes —
const fMove = fDis.addFolder({ title: 'Movement', expanded: false });
fMove.addBinding(state, 'turbulence', { min: 0, max: 1, step: 0.01, label: 'turbulence (ink)' });
fMove.addBinding(state, 'flow', { min: 0, max: 1, step: 0.01, label: 'flow' });
fMove.addBinding(state, 'undulate', { min: 0, max: 1, step: 0.01, label: 'undulate (dance)' });
fMove.addBinding(state, 'animate', { min: 0, max: 1, step: 0.01, label: 'animate (per-mode)' });

// — start points & paint (collapsed) — where the reveal emanates from —
const fPts = fDis.addFolder({ title: 'Start points / paint', expanded: false });
const btnPlace = fPts.addButton({ title: '✛ Place start points' });
btnPlace.on('click', () => {
  setPlacePoints(!state.placePoints);
  btnPlace.title = state.placePoints ? '✓ Click canvas to add — done' : '✛ Place start points';
});
fPts.addButton({ title: 'Clear points' }).on('click', () => {
  state.originPoints = []; drawOriginPoints(); restartPlayback();
});
fPts.addBinding(state, 'originFromImage', { label: 'else: from image A' })
  .on('change', () => { if (state.originFromImage && state.imgA) computeOriginFromImage(state.imgA); });
fPts.addBinding(state, 'pointSize', { min: 0, max: 1, step: 0.01, label: 'lamp size' });
fPts.addBinding(state, 'pointPop', { min: 0, max: 1, step: 0.01, label: 'pop (instant on)' });
fPts.addBinding(state, 'pointStagger', { min: 0, max: 1, step: 0.01, label: 'stagger' });
fPts.addBinding(state, 'pointRandom', { min: 0, max: 1, step: 0.01, label: 'stagger random' });
fPts.addBinding(state, 'pointFill', { label: 'fill out (cover by end)' });
fPts.addBinding(state, 'paintBrush', { min: 0.02, max: 0.4, step: 0.01, label: 'paint brush' });
fPts.addButton({ title: 'Clear paint' }).on('click', () => { if (typeof clearPaint === 'function') clearPaint(); });

// — advanced shaping (collapsed) —
const fAdv = fDis.addFolder({ title: 'Advanced', expanded: false });
fAdv.addBinding(state, 'originX', { min: 0, max: 1, step: 0.01, label: 'origin x' });
fAdv.addBinding(state, 'originY', { min: 0, max: 1, step: 0.01, label: 'origin y' });
fAdv.addBinding(state, 'maskScale', { min: 0.3, max: 4, step: 0.05, label: 'mask scale' });
fAdv.addBinding(state, 'curve', { label: 'timing', options: { 'linear': 0, 'ease-in-out': 1, 'ease-in': 2, 'ease-out': 3 } });
fAdv.addBinding(state, 'seed', { min: 0, max: 999, step: 1 });
fAdv.addBinding(state, 'maskShift', { min: -0.5, max: 0.5, step: 0.005, label: 'mask shift' });
fAdv.addBinding(state, 'organic',   { min: 0, max: 1, step: 0.01, label: 'organic (smooth mode)' });
fAdv.addBinding(state, 'edges',     { min: -1, max: 1, step: 0.01, label: 'edges (smooth mode)' });

updateModeFolders();   // initial visibility — now that all folders/bindings exist

// ----- Canvas size (custom transition dimensions, independent of source) -----
// (Canvas size moved to the top "Setup" block.)

// ----- Texture (grunge / watercolor paper drives the dissolve) -----
const fTex = tabTexture.addFolder({ title: 'Texture', expanded: true });
fTex.addButton({ title: 'Load texture…' }).on('click', () => {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => { if (inp.files && inp.files[0]) loadTextureFile(inp.files[0]); };
  inp.click();
});
fTex.addBinding(state, 'texFit', { label: 'fit', options: { 'contain': 1, 'cover': 2, 'stretch': 0 } });
fTex.addBinding(state, 'texAmount', { min: 0, max: 1, step: 0.01, label: 'dissolve along texture' });
fTex.addBinding(state, 'texBg', { min: 0, max: 1, step: 0.01, label: 'bg tint (image mode)' });
fTex.addButton({ title: 'Clear texture' }).on('click', () => clearTexture());

const fImg = _hiddenTab.addFolder({ title: 'Framing', expanded: true });  // hidden in matte build
fImg.addBinding(state, 'zoomA', { min: 0.5, max: 4, step: 0.01, label: 'A zoom' });
fImg.addBinding(state, 'panAx', { min: -1, max: 1, step: 0.005, label: 'A pan x' });
fImg.addBinding(state, 'panAy', { min: -1, max: 1, step: 0.005, label: 'A pan y' });
fImg.addBinding(state, 'zoomB', { min: 0.5, max: 4, step: 0.01, label: 'B zoom' });
fImg.addBinding(state, 'panBx', { min: -1, max: 1, step: 0.005, label: 'B pan x' });
fImg.addBinding(state, 'panBy', { min: -1, max: 1, step: 0.005, label: 'B pan y' });

// ----- Export / Record -----
state.exportFps = 25;
state.exportSizeMode = 'src';   // record at the canvas resolution (sharp at 4k/6k)
// (matteOutput / matteInvert now live in the state literal — bound in Setup.)
state.exportPadBottom = 0;  // 0 = no padding; 1 = add full-height black below; 1.416 ≈ Elverket floor ratio

// Prefer HEVC (H.265) over H.264 — HEVC headroom is ~7680 vs ~3840 for AVC, so
// wide panoramas survive without aggressive downscaling. Falls back gracefully.
// (dead MediaRecorder helpers removed)

const MODE_NAMES_V2 = {
  0: 'off', 1: 'rim', 2: 'paper', 3: 'blooms', 4: 'diffusion',
  5: 'sediment', 6: 'salt', 7: 'iris', 8: 'wet-bleed', 9: 'pigment-run',
  10: 'advec', 15: 'wet-edge',
  16: 'stroke', 17: 'glaze', 18: 'edge-first', 19: 'flow', 20: 'dabs', 21: 'density',
  22: 'mold', 27: 'burn',
  23: 'wc-form', 24: 'cauliflower-bloom', 25: 'wet-stage', 26: 'pig-migration',
};
const SED_SOURCE_NAMES = ['luma','sat','hue','detail','temp'];
const SALT_SOURCE_NAMES = ['random','light','dark','col','edge'];
const fx = (v, n = 2) => (Math.round(v * Math.pow(10, n)) / Math.pow(10, n)).toString();

function makeFilenameV2() {
  const m = state.mode;
  // prefer the gallery name (kept in sync by ui.js), slugified; fall back to the
  // short v2 names, then mode<id>.
  const gName = (typeof window !== 'undefined' && window.__modeNames && window.__modeNames[m]) || '';
  const slug = gName ? gName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
  const parts = [slug || MODE_NAMES_V2[m] || `mode${m}`];
  if      (m === 1)  parts.push(`rimW=${fx(state.rimWidth)}`, `dark=${fx(state.rimDark)}`);
  else if (m === 2)  parts.push(`ang=${fx(state.paperAngle)}`, `aniso=${fx(state.paperAniso,1)}`, `gran=${fx(state.paperGranulation)}`);
  else if (m === 3)  parts.push(`n=${state.bloomCount}`, `rate=${fx(state.bloomRate)}`, `rim=${fx(state.bloomRim)}`);
  else if (m === 4)  parts.push(`str=${fx(state.diffStrength)}`, `r=${fx(state.diffRadius)}`);
  else if (m === 5)  parts.push(`by=${SED_SOURCE_NAMES[state.sedSource] || 'luma'}`, `bands=${state.sedBands}`, `soft=${fx(state.sedSoftness)}`);
  else if (m === 6)  parts.push(`from=${SALT_SOURCE_NAMES[state.saltSource] || 'random'}`, `grain=${fx(state.saltDensity)}`, `bias=${fx(state.saltBias)}`);
  else if (m === 7)  parts.push(`focus=${fx(state.irisFocusX)}-${fx(state.irisFocusY)}`, `jit=${fx(state.irisJitter)}`, state.irisUniform ? 'uniform' : 'stretched');
  else if (m === 8)  parts.push(`fing=${fx(state.bleedFinger)}`, `amt=${fx(state.bleedAmount)}`, `halo=${fx(state.bleedHalo)}`);
  else if (m === 9)  parts.push(`grav=${fx(state.runGravity)}`, `drip=${fx(state.runDrip)}`);
  else if (m === 10) parts.push(`visc=${fx(state.advecVisc)}`, `rate=${fx(state.advecRate)}`);
  else if (m === 15) {
    parts.push(`wob=${fx(state.weEdgeWobble)}`, `tend=${state.weTendrilCount}`, `det=${fx(state.weDetailBias)}`, `ring=${fx(state.weDryRing)}`);
    if (state.weReverse) parts.push('rev');
    if (state.weBDetailBias > 0.001) parts.push(`detB=${fx(state.weBDetailBias)}`);
    if (Math.abs(state.weBLumaBias) > 0.001) parts.push(`lumB=${fx(state.weBLumaBias)}`);
  }
  else if (m === 16) parts.push(`sc=${fx(state.strokeScale,1)}`, `aniso=${fx(state.strokeAniso,1)}`);
  else if (m === 17) parts.push(`bands=${state.glazeBands}`, `soft=${fx(state.glazeSoftness)}`, state.glazeDirection ? 'lights-first' : 'darks-first', `warm=${fx(state.glazeWarm)}`);
  else if (m === 18) parts.push(`ink=${fx(state.edgeFirstInk)}`, `fade=${fx(state.edgeFirstFade)}`);
  else if (m === 19) parts.push(`flow=${fx(state.flowAmount)}`);
  else if (m === 20) parts.push(`n=${state.dabsCount}`, `reach=${fx(state.dabsReach)}`, `wob=${fx(state.dabsWobble)}`);
  else if (m === 21) parts.push(`grav=${fx(state.densityGravity)}`, `smear=${fx(state.densitySmear)}`);
  else if (m === 22) parts.push(`seeds=${state.moldSeedCount}`, `per=${state.moldTendrilsPerSeed}`, `reach=${fx(state.moldReach)}`, `wob=${fx(state.moldWobble)}`);
  else if (m === 23) parts.push(`n=${state.formStrokeCount}`, `sz=${fx(state.formStrokeSize)}`, `wob=${fx(state.formStrokeWobble)}`);
  else if (m === 24) parts.push(`bias=${fx(state.bloomLightBias)}`, `wob=${fx(state.bloomWobble)}`, `paper=${fx(state.bloomPaperShow)}`);
  else if (m === 25) parts.push(`bands=${state.stageBands}`, `over=${fx(state.stageOverlap)}`);
  else if (m === 26) parts.push(`str=${fx(state.migrationStrength)}`, state.migrationDir ? 'perp' : 'along', `turb=${fx(state.migrationTurb)}`);
  else if (m === 27) parts.push(`wob=${fx(state.burnEdgeWobble)}`, `char=${fx(state.burnCharIntensity)}`, `glow=${fx(state.burnGlowIntensity)}`);
  if (state.paperGrain > 0.001) parts.push(`paper=${fx(state.paperGrain)}`);
  // duration / fps / dimensions / pad are appended by the recorder using
  // the actual output values (after any encoder downscale).
  return `transition__${parts.join('__')}`;
}

const fExp = tabOutput.addFolder({ title: 'Export', expanded: true });
// (Output mode + invert moved to the top "Setup" block.)
fExp.addBinding(state, 'exportFps', {
  label: 'fps', options: { '24 fps': 24, '25 fps': 25, '30 fps': 30, '50 fps': 50, '60 fps': 60 },
});
fExp.addBinding(state, 'exportSizeMode', {
  label: 'size',
  options: {
    'source (full)': 'src', '5120 wide': '5120', '3840 wide': '3840',
    '2560 wide': '2560', '1920 wide': '1920', '1280 wide': '1280', '960 wide': '960',
  },
});
// Preset dropdown that writes into state.exportPadBottom on change. Slider
// stays available for fine-tuning.
const padPresets = { _v: state.exportPadBottom };
const bPadPreset = fExp.addBinding(padPresets, '_v', {
  label: 'pad preset',
  options: {
    'none':                  0,
    'half (0.5)':            0.5,
    'full (1.0)':            1.0,
    'Elverket panorama':     1.416,
    'double (2.0)':          2.0,
  },
});
bPadPreset.on('change', e => {
  state.exportPadBottom = e.value;
  pane.refresh();
});
const bPad = fExp.addBinding(state, 'exportPadBottom', { min: 0, max: 3, step: 0.001, label: 'pad below (× h)' });

// Slider → preset: keep the dropdown showing the matching preset (or 'none')
// when the slider lands on a value we have a preset for.
bPad.on('change', () => {
  const v = state.exportPadBottom;
  const presets = [0, 0.5, 1.0, 1.416, 2.0];
  const match = presets.find(p => Math.abs(p - v) < 0.001);
  padPresets._v = match !== undefined ? match : 0;
  bPadPreset.refresh();
});
const btnRecord = fExp.addButton({ title: 'Record video' });
btnRecord.on('click', () => startRecording());

// pickEncoderConfig -> ./recorder.js

// Maximum dimension a given codec / level can encode. Use these to scale the
// recording before configuring the encoder.
// codecMaxDim -> ./recorder.js

const recBar = document.createElement('div');
recBar.id = 'rec-progress';
recBar.innerHTML = '<div class="rec-fill"></div><div class="rec-label"></div>';
document.body.appendChild(recBar);
const _recFill = recBar.querySelector('.rec-fill');
const _recLabel = recBar.querySelector('.rec-label');
let _recHideTimer = null;
function showRecordProgress(on) {
  if (on && _recHideTimer) { clearTimeout(_recHideTimer); _recHideTimer = null; }
  recBar.classList.toggle('show', on);
}
function setRecordProgress(frac, text, kind) {
  _recFill.style.width = Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%';
  _recFill.style.background = kind === 'error' ? '#e44' : kind === 'done' ? '#2ec27a' : 'var(--accent)';
  _recLabel.textContent = text;
  recBar.dataset.kind = kind || 'progress';  // ui.js reads this (robust vs colour-string parsing)
}
function finishRecordProgress(text, kind, ms) {
  setRecordProgress(1, text, kind);
  _recHideTimer = setTimeout(() => showRecordProgress(false), ms || 2500);
}

async function startRecording(opts = {}) {
  if (recording) return;
  // Lazy-load the muxer (only needed when recording) so its ~61 KiB stays off
  // the initial page load. Same-origin + service-worker-precached, so it works
  // offline once the shell is cached.
  let Muxer, ArrayBufferTarget;
  try { ({ Muxer, ArrayBufferTarget } = await import('mp4-muxer')); }
  catch (e) { console.error('[record] could not load the muxer', e); finishRecordProgress('Recorder failed to load', 'error', 4000); return; }
  // Matte-first: record whatever the (always-sized) canvas shows — image-free
  // matte or A->B transition. No image requirement.

  // Record at the full output resolution regardless of the on-screen preview scale.
  const _od = computeOutputDims();
  if (canvas.width !== _od.w || canvas.height !== _od.h) { canvas.width = _od.w; canvas.height = _od.h; ensureStateTextures(); }

  const fps = state.exportFps;
  const sizeMode = state.exportSizeMode;
  let recW = canvas.width, recH = canvas.height;
  if (sizeMode !== 'src') {
    const w = parseInt(sizeMode, 10);
    const h = Math.round(w * canvas.height / canvas.width);
    recW = w; recH = h;
  }
  const padPx0 = Math.round(recH * state.exportPadBottom);

  recording = true;
  const originalTitle = btnRecord.title;
  btnRecord.title = 'Preparing…';
  showRecordProgress(true);
  setRecordProgress(0, 'Preparing encoder…');

  // ── Encoder analysis: find the largest size + best codec that ACTUALLY
  // produces a file on THIS machine. isConfigSupported() lies on some GPUs
  // (says yes, then encodes nothing — e.g. HEVC encode on Chrome/Windows), so
  // for each standard target long-edge × candidate codec we cheap-gate, then
  // really encode+mux 2 test frames and confirm bytes come out. First hit wins
  // (largest size, highest-capability codec). On a 4090 this should land AV1@8K;
  // elsewhere it falls back to 4K H.264. ──
  const BITRATE = 12_000_000;
  async function probeRealEncode(codec, muxerCodec, w, h) {
    // Definitive: encode+mux 2 black frames, confirm a real file. Resolves fast
    // when an encoder emits nothing; 7s timeout guards a genuinely-stuck path.
    const fd = 1_000_000 / fps;
    return await Promise.race([
      (async () => {
        let err = null, enc = null;
        try {
          const m = new Muxer({ target: new ArrayBufferTarget(), video: { codec: muxerCodec, width: w, height: h, frameRate: fps }, fastStart: 'in-memory' });
          enc = new VideoEncoder({ output: (ch, meta) => { try { m.addVideoChunk(ch, meta); } catch (e) { err = err || e; } }, error: e => { err = err || e; } });
          enc.configure({ codec, width: w, height: h, framerate: fps, bitrate: BITRATE, hardwareAcceleration: 'prefer-hardware' });
          // Encode two NON-uniform, frame-to-frame-varying frames. A flat/black
          // probe compresses below the size threshold at small resolutions and
          // false-negatives a working encoder, so paint real entropy instead.
          const cv = new OffscreenCanvas(w, h); const cx = cv.getContext('2d');
          for (let i = 0; i < 2; i++) {
            const g = cx.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, '#000'); g.addColorStop(0.5, i ? '#fff' : '#aaa'); g.addColorStop(1, '#555');
            cx.fillStyle = g; cx.fillRect(0, 0, w, h);
            for (let j = 0; j < 32; j++) { cx.fillStyle = (j + i) % 2 ? '#fff' : '#000'; cx.fillRect((j * 31 + i * 7) % w, (j * 47) % h, 10, 10); }
            const vf = new VideoFrame(cv, { timestamp: Math.round(i * fd), duration: Math.round(fd) }); enc.encode(vf); vf.close();
          }
          await enc.flush(); m.finalize();
          try { enc.close(); } catch (e) {}
          return !err && m.target.buffer.byteLength > 1024;
        } catch (e) { try { if (enc) enc.close(); } catch (e2) {} return false; }
      })(),
      new Promise(res => setTimeout(() => res(false), 7000)),
    ]);
  }

  const baseLong = Math.max(recW, recH + padPx0);
  const baseW = recW, baseH = recH;
  const longs = [...new Set([baseLong, 7680, 4096, 3840, 2560, 1920].filter(d => d <= baseLong))];
  setRecordProgress(0, 'Analysing encoder…');

  let scale = 1, pick = null;
  outer:
  for (const L of longs) {
    const s = L / baseLong;
    const w = Math.round(baseW * s), h = Math.round(baseH * s);
    const padS = Math.round(padPx0 * s);
    const tW = w + (w % 2), tH = (h + padS) + ((h + padS) % 2);
    for (const c of ENCODER_CANDIDATES) {
      if (Math.max(tW, tH) > c.max) continue;
      if (!(await encoderConfigSupported(c.codec, tW, tH, fps, BITRATE))) continue;
      setRecordProgress(0, `Analysing encoder… ${c.label} @ ${tW}×${tH}`);
      const ok = await probeRealEncode(c.codec, c.muxer, tW, tH);
      console.log(`[record] probe ${c.label} @ ${tW}×${tH}: ${ok ? 'works ✓' : 'no output'}`);
      if (ok) {
        pick = { config: { codec: c.codec, width: tW, height: tH, framerate: fps, bitrate: BITRATE, hardwareAcceleration: 'prefer-hardware' }, muxerCodec: c.muxer, label: c.label };
        scale = s; recW = w; recH = h; break outer;
      }
    }
  }
  if (!pick) {
    btnRecord.title = 'FAILED — no usable video encoder';
    setTimeout(() => { btnRecord.title = originalTitle; }, 4000);
    finishRecordProgress('No usable video encoder', 'error', 4000);
    recording = false;
    return;
  }

  const padPx = Math.round(recH * state.exportPadBottom);
  const totalH = (recH + padPx) + ((recH + padPx) % 2);
  const offW = recW + (recW % 2);
  const off = document.createElement('canvas');
  off.width = offW; off.height = totalH;
  const offCtx = off.getContext('2d');
  offCtx.fillStyle = '#000';
  offCtx.fillRect(0, 0, off.width, off.height);

  console.log(`[record] codec ${pick.config.codec}  ${offW}×${totalH}  ${fps}fps` + (scale < 1 ? `  (scaled ×${scale.toFixed(2)} from canvas ${canvas.width}×${canvas.height})` : ''));

  // Set up muxer + encoder.
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: pick.muxerCodec, width: offW, height: totalH, frameRate: fps },
    fastStart: 'in-memory',
  });
  // Capture encoder/muxer errors (the output + error callbacks fire async and
  // outside the try below, so route them to a flag we re-throw on).
  let encErr = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (e) { encErr = encErr || e; console.error('[mux]', e); } },
    error: e => { encErr = encErr || e; console.error('[encoder]', e); },
  });

  const totalFrames = Math.max(2, Math.round(state.duration * fps));
  const frameDuration = 1_000_000 / fps; // microseconds
  const wasPlaying = state.playing;
  const prevT = state.t;
  // Colourise is preview-only: record with the grayscale ramp so the exported
  // matte stays pure B/W, then restore the colour ramp afterwards.
  const lutWasColour = (texLut !== grayRampTex);
  if (lutWasColour) { texLut = grayRampTex; bindGroup = makeBindGroup(); }

  // Everything from configure → encode → mux → save is wrapped so a codec/mux
  // failure surfaces a message and still resets state (was silently aborting
  // with no file and no error before).
  try {
    encoder.configure({ ...pick.config, width: offW, height: totalH });
    state.playing = false;
    if (state.mode >= 10 && state.mode <= 14) advec.needsReset = true;
    if (state.partEnable) particles.needsReset = true;  // restart particle sim for a clean recording

    btnRecord.title = scale < 1 ? `Scaled to ${offW}×${totalH}. Recording…` : 'Recording…';

    for (let i = 0; i < totalFrames; i++) {
      state.t = i / (totalFrames - 1);
      // If T-slot has a video, seek it to the exact frame for this p.t and
      // wait for the seek to complete BEFORE rendering — otherwise the GPU
      // texture gets whatever frame was previously decoded, not the target.
      const vT = state.videoT;
      if (vT && vT.duration && isFinite(vT.duration)) {
        const target = state.t * vT.duration;
        if (Math.abs(vT.currentTime - target) > 1 / (fps * 2)) {
          await new Promise(resolve => {
            const onSeeked = () => { vT.removeEventListener('seeked', onSeeked); resolve(); };
            vT.addEventListener('seeked', onSeeked);
            vT.currentTime = Math.min(Math.max(0, target), vT.duration - 1e-4);
            // safety timeout so a stalled seek doesn't hang the recording
            setTimeout(() => { vT.removeEventListener('seeked', onSeeked); resolve(); }, 1000);
          });
        }
      }
      renderFrame();
      // wait one rAF so the WebGPU swap-chain commits the just-submitted frame
      await new Promise(r => requestAnimationFrame(r));
      offCtx.drawImage(canvas, 0, 0, recW, recH);

      const vf = new VideoFrame(off, {
        timestamp: Math.round(i * frameDuration),
        duration: Math.round(frameDuration),
      });
      encoder.encode(vf);
      vf.close();
      if (encErr) throw encErr;   // bail as soon as the encoder/mux complains

      btnRecord.title = `frame ${i + 1} / ${totalFrames}`;
      setRecordProgress((i + 1) / totalFrames, `Recording ${Math.round((i + 1) / totalFrames * 100)}% · frame ${i + 1} / ${totalFrames}`);
      // Back-pressure: if the encoder queue is getting long, let it drain.
      if (encoder.encodeQueueSize > 16) {
        await new Promise(r => setTimeout(r, 0));
      }
    }
    setRecordProgress(1, 'Encoding & muxing…');
    await encoder.flush();
    muxer.finalize();
    if (encErr) throw encErr;

    const blob = new Blob([muxer.target.buffer], { type: 'video/mp4' });
    if (blob.size < 1024) throw new Error('empty output — the encoder produced no data (codec or size unsupported)');
    // returnBlob: hand the bytes back instead of saving/downloading (used by the
    // preview-baking automation, which captures the blob and writes it to disk).
    if (opts.returnBlob) return blob;

    // Build filename with duration, fps, actual output dimensions, and pad.
    let base = opts.filename || makeFilenameV2();
    // Prepend "[project_]NNNN_" — an always-incrementing export index (persisted)
    // so every file is uniquely named and sorts in the order it was made.
    const proj = (state.projectName || '').trim().replace(/[^A-Za-z0-9-]/g, '');
    let seq = 1;
    try { seq = (parseInt(localStorage.getItem('matte.exportSeq') || '0', 10) || 0) + 1; localStorage.setItem('matte.exportSeq', String(seq)); }
    catch (e) { seq = 1; }
    const head = (proj ? proj + '_' : '') + String(seq).padStart(4, '0');
    if (!base.startsWith(head + '_')) base = `${head}_${base}`;
    if (!/\.mp4$/i.test(base)) {
      const tail = [`${Math.round(state.duration)}s`, `${fps}fps`, `${offW}x${totalH}`];
      if (state.exportPadBottom > 0) tail.push(`pad=${fx(state.exportPadBottom)}`);
      if (state.matteOutput || (!state.imgA && !state.imgB)) tail.push(state.matteInvert ? 'matte-inv' : 'matte');
      base = `${base}__${tail.join('__')}`;
    }
    const filename = /\.mp4$/i.test(base) ? base : `${base}.mp4`;
    const mb = (blob.size / 1048576).toFixed(1);

    // Try the persistent output folder first; fall back to a browser download.
    const savedToFolder = await saveBlobToOutputFolder(blob, filename);
    let where = '';
    if (savedToFolder) {
      const dir = getOutputDir()?.name || 'folder';
      where = ` → ${dir}`;
      // full path to the file the user can actually open (folder handle + name).
      console.log(`[record] saved → ${dir}/${filename}  (${mb} MB)`);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.style.display = 'none';
      document.body.appendChild(a);   // some browsers ignore click() on a detached anchor
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 1000);
      // no output folder set → the browser writes it to its Downloads dir; the
      // real OS path isn't exposed to JS, so name the folder we know it lands in.
      console.log(`[record] downloaded → <Downloads>/${filename}  (${mb} MB)`);
    }

    finishRecordProgress(`Done ✓ · ${mb} MB${where}`, 'done', 3500);
    btnRecord.title = `saved (${mb} MB)${where}`;
    setTimeout(() => { btnRecord.title = originalTitle; }, 2500);

    // Export history — so Jonas can see which modes were used. Keep last 50.
    try {
      const hist = JSON.parse(localStorage.getItem('matte.exports') || '[]');
      hist.unshift({ mode: state.mode, fps, w: offW, h: totalH,
                     dur: Math.round(state.duration), mb: +mb, file: filename, t: Date.now() });
      localStorage.setItem('matte.exports', JSON.stringify(hist.slice(0, 50)));
      window.dispatchEvent(new CustomEvent('matte-export'));
    } catch (e) { /* private mode / quota — non-fatal */ }
  } catch (err) {
    const msg = (err && err.message) || String(err);
    console.error('[record] failed', err);
    finishRecordProgress('Record failed: ' + msg, 'error', 6000);
    btnRecord.title = 'FAILED — ' + msg;
    setTimeout(() => { btnRecord.title = originalTitle; }, 5000);
  } finally {
    recording = false;
    state.t = prevT;
    state.playing = wasPlaying;
    if (lutWasColour) { texLut = colourLut || grayRampTex; bindGroup = makeBindGroup(); }  // restore colourise preview
    try { if (encoder.state !== 'closed') encoder.close(); } catch (e) {}
    resizeCanvas();  // restore the on-screen preview scale after full-res capture
  }
}

const fStyle = tabFrame.addFolder({ title: 'Style', expanded: true });
fStyle.addBinding(state, 'fit', {
  options: { 'cover (crop)': 'cover', 'contain': 'contain', 'stretch': 'stretch' },
});
fStyle.addBinding(state, 'bg', { view: 'color' });
fStyle.addBinding(state, 'paperGrain', { min: 0, max: 1, step: 0.01, label: 'paper grain' });
fStyle.addBinding(state, 'videoDisplaceAmount', { min: 0, max: 4, step: 0.01, label: 'T displace amount' });
fStyle.addBinding(state, 'videoDisplace',  { min: -1, max: 1, step: 0.01, label: 'T displace A' });
fStyle.addBinding(state, 'videoDisplaceB', { min: -1, max: 1, step: 0.01, label: 'T displace B' });

const fSlotFill = fStyle.addFolder({ title: 'A / B fill', expanded: false });
fSlotFill.addBinding(state, 'slotAFillMode', {
  label: 'A fill',
  options: { 'image': 'image', 'solid color': 'solid', 'transparent (alpha)': 'transparent' },
}).on('change', () => resizeCanvas());
fSlotFill.addBinding(state, 'slotAColor', { view: 'color', label: 'A color' });
fSlotFill.addBinding(state, 'slotBFillMode', {
  label: 'B fill',
  options: { 'image': 'image', 'solid color': 'solid', 'transparent (alpha)': 'transparent' },
}).on('change', () => resizeCanvas());
fSlotFill.addBinding(state, 'slotBColor', { view: 'color', label: 'B color' });
fSlotFill.addBinding(state, 'keepAOutsideB', { label: 'keep A outside B' });

const fBounds = fStyle.addFolder({ title: 'Transition bounds', expanded: false });
fBounds.addBinding(state, 'boundsEnable',   { label: 'limit to box' });
fBounds.addBinding(state, 'boundsCx',       { min: 0, max: 1,    step: 0.005, label: 'center x' });
fBounds.addBinding(state, 'boundsCy',       { min: 0, max: 1,    step: 0.005, label: 'center y' });
fBounds.addBinding(state, 'boundsW',        { min: 0.02, max: 1, step: 0.005, label: 'width' });
fBounds.addBinding(state, 'boundsH',        { min: 0.02, max: 1, step: 0.005, label: 'height' });
fBounds.addBinding(state, 'boundsSoftness', { min: 0, max: 0.3,  step: 0.005, label: 'edge softness' });

// ----- Presets -----
const PRESET_KEYS = [
  'duration', 'mode', 'curve', 'seed',
  'rimWidth', 'rimDark',
  'paperAngle', 'paperAniso', 'paperGranulation', 'paperGrowth', 'paperFollow', 'paperPatches',
  'bloomCount', 'bloomRim', 'bloomRate', 'bloomImageBias',
  'diffStrength', 'diffRadius',
  'sedBands', 'sedSoftness', 'sedDirection', 'sedSource',
  'saltDensity', 'saltContrast', 'saltSource', 'saltBias', 'saltImage',
  'irisFocusX', 'irisFocusY', 'irisJitter', 'irisUniform',
  'bleedFinger', 'bleedAmount', 'bleedHalo',
  'runGravity', 'runDrip',
  'advecVisc', 'advecRate', 'advecSteps',
  'advecGravity', 'advecGravBias', 'advecGravAngle', 'advecGravStreak', 'advecGravLateral',
  'advecCurlStr', 'advecCurlScale',
  'advecBrushFollow',
  'advecSeedCount', 'advecSeedRadius',
  'weEdgeScale', 'weEdgeWobble', 'weDryRing', 'weBleed',
  'weTendrilCount', 'weTendrilReach', 'weTendrilWidth', 'weTendrilStrength',
  'weDetailBias', 'weReverse', 'weBDetailBias', 'weBLumaBias',
  'strokeScale', 'strokeAniso',
  'glazeBands', 'glazeSoftness', 'glazeDirection', 'glazeWarm',
  'edgeFirstInk', 'edgeFirstFade', 'edgeFirstScale',
  'flowAmount',
  'dabsCount', 'dabsReach', 'dabsWobble',
  'densityGravity', 'densitySmear',
  'paperGrain',
  'moldSeedCount', 'moldTendrilsPerSeed', 'moldReach', 'moldWidth', 'moldWobble',
  'formStrokeCount', 'formStrokeSize', 'formStrokeWobble',
  'bloomLightBias', 'bloomWobble', 'bloomPaperShow',
  'stageBands', 'stageOverlap',
  'migrationStrength', 'migrationDir', 'migrationTurb',
  'burnEdgeWobble', 'burnCharIntensity', 'burnCharWidth', 'burnCharPersistence',
  'burnGlowIntensity', 'burnGlowWidth', 'burnEmberTrail',
  'burnSeedCount', 'burnBrowning', 'burnBrowningWidth', 'burnAshSpatter', 'burnGlowColor',
  'burnBIgnite', 'burnGlowFromB', 'burnColorBleed',
  'videoMaskInvert', 'videoMaskFeather', 'videoDisplace', 'videoDisplaceB', 'videoDisplaceAmount',
  'videoBrightness', 'videoContrast', 'videoSaturate',
  'meltCellScale', 'meltCenterX', 'meltCenterY', 'meltCellJitter',
  'meltInkAmount', 'meltGlowIntensity', 'meltGlowColor',
  'lightIntensity', 'lightSpread', 'lightPeakT', 'lightFlashWidth', 'lightColor',
  'boundsEnable', 'boundsCx', 'boundsCy', 'boundsW', 'boundsH', 'boundsSoftness',
  'organic', 'edges', 'spread', 'maskScale', 'maskShift',
  'swipeCols', 'swipeDir', 'swipeStagger', 'swipeColW', 'swipeSoft', 'swipeColWidths',
  'mirrorDir',
  'rectW', 'rectH', 'rectReach',
  'zoomA', 'panAx', 'panAy', 'zoomB', 'panBx', 'panBy',
  // movement / ambient / direction / grade / vignette — the look knobs the
  // current modes actually use (were missing, so presets couldn't capture them).
  'turbulence', 'flow', 'undulate', 'animate',
  'ambCount', 'ambSize', 'ambSoft', 'ambSpeed', 'ambDetail', 'ambRole',
  'driftAngle', 'driftAmount', 'sunX', 'sunY', 'streakMove', 'foliageDrift',
  'auroraDensity', 'auroraHeight', 'auroraSpeed', 'auroraWave', 'auroraDark',
  'gdIntensity', 'gdBeams', 'gdCloud', 'gdPulse', 'gdSpeed',
  'cellCols', 'cellRows', 'cellIgniteBy', 'cellAnalyseBy', 'cellCoarseness',
  'cellOrder', 'cellCascade', 'cellJitter', 'cellGlow', 'cellSnap', 'cellSpill',
  'originX', 'originY', 'originAmount', 'pointSize', 'pointPop', 'pointFill',
  'vignAmount', 'vignFeather', 'vignAnimate', 'vignTexture', 'vignShape',
  'gradeBright', 'gradeContrast', 'gradeBlack', 'gradeWhite', 'gradeGamma',
];

const FACTORY_PRESETS = {
  'Smooth dreamy': {
    duration: 5, mode: 0, curve: 1, seed: 42,
    organic: 0.65, edges: 0.25, spread: 0.55, maskScale: 0.9,
  },
  'Paper grain — cold press': {
    duration: 7, mode: 2, curve: 1, seed: 42,
    paperAngle: 0, paperAniso: 6, paperGranulation: 0.7,
    organic: 0.3, edges: 0.15, spread: 0.35, maskScale: 0.9,
  },
  'Backruns — dramatic': {
    duration: 12, mode: 3, curve: 2, seed: 12,
    bloomCount: 4, bloomRate: 0.45, bloomRim: 0.75,
    organic: 0.5, edges: 0.2, spread: 0.5, maskScale: 0.9,
  },
  'Sediment — hue': {
    duration: 8, mode: 5, curve: 0, seed: 42,
    sedSource: 2, sedBands: 5, sedSoftness: 0.35,
    organic: 0.5, spread: 0.5,
  },
  'Salt — light bias': {
    duration: 6, mode: 6, curve: 0, seed: 42,
    saltDensity: 0.55, saltContrast: 0.55, saltSource: 1, saltBias: 0.75, saltImage: 2,
  },
  'Wet advection (smooth)': {
    duration: 10, mode: 10, curve: 0, seed: 42,
    advecVisc: 0.55, advecRate: 0.18, advecSteps: 3,
    organic: 0.6, spread: 0.55, maskScale: 0.9,
  },
  'Gravity advection — down': {
    duration: 10, mode: 11, curve: 0, seed: 42,
    advecGravAngle: 0, advecGravity: 0.8, advecGravStreak: 0.5,
    advecGravLateral: 0.3, advecGravBias: 0.5,
    advecVisc: 0.55, advecRate: 0.18,
  },
  'Curl-noise eddies': {
    duration: 10, mode: 12, curve: 0, seed: 42,
    advecCurlStr: 0.8, advecCurlScale: 1.5,
    advecVisc: 0.55, advecRate: 0.18,
  },
};

const LS_KEY = 'trans:presets';
const loadUserPresets = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; } };
const saveUserPresetsToLS = (o) => localStorage.setItem(LS_KEY, JSON.stringify(o));

function snapshotState() {
  const out = {};
  for (const k of PRESET_KEYS) out[k] = state[k];
  return out;
}
function applyPreset(id) {
  const [kind, name] = id.split(':');
  const src = kind === 'factory' ? FACTORY_PRESETS[name] : loadUserPresets()[name];
  if (!src) return;
  for (const k of PRESET_KEYS) if (k in src) state[k] = src[k];
  if (state.mode >= 10 && state.mode <= 14) advec.needsReset = true;
  // The legacy Tweakpane mode dropdown's options are stale (stop at mode 49), so
  // pane.refresh() with a mode >= 50 snaps it back to 0 and writes that to state.
  // Preserve the intended mode across the refresh.
  const wantMode = state.mode;
  pane.refresh();
  state.mode = wantMode;
  updateModeFolders();
}

const presetUI = { current: '', newName: '' };
const fPresets = tabSaved.addFolder({ title: 'Presets', expanded: true });

function buildPresetOptions() {
  const opts = { '— select —': '' };
  for (const k of Object.keys(FACTORY_PRESETS)) opts['★ ' + k] = 'factory:' + k;
  const user = loadUserPresets();
  for (const k of Object.keys(user))            opts['user · ' + k] = 'user:' + k;
  return opts;
}

function rebuildPresetsFolder() {
  while (fPresets.children.length) fPresets.children[0].dispose();
  presetUI.current = '';
  fPresets.addBinding(presetUI, 'current', { label: 'load', options: buildPresetOptions() })
    .on('change', e => { if (e.value) applyPreset(e.value); });
  fPresets.addBinding(presetUI, 'newName', { label: 'name' });
  fPresets.addButton({ title: 'Save current as preset' }).on('click', () => {
    const name = presetUI.newName.trim();
    if (!name) return;
    const user = loadUserPresets();
    user[name] = snapshotState();
    saveUserPresetsToLS(user);
    presetUI.newName = '';
    rebuildPresetsFolder();
  });
  fPresets.addButton({ title: 'Delete selected (user only)' }).on('click', () => {
    if (!presetUI.current.startsWith('user:')) return;
    const name = presetUI.current.slice(5);
    const user = loadUserPresets();
    delete user[name];
    saveUserPresetsToLS(user);
    rebuildPresetsFolder();
  });
}
rebuildPresetsFolder();

// ----- Starred modes export -----
const fStarred = tabSaved.addFolder({ title: 'Starred modes', expanded: true });
fStarred.addButton({ title: '📋 Copy starred summary' }).on('click', async () => {
  const entries = Object.keys(starred)
    .map(id => ({ id: +id, name: MODE_NAMES_FULL[+id] || `mode ${id}` }))
    .sort((a, b) => a.id - b.id);
  if (entries.length === 0) {
    alert('No starred modes yet — star some first.');
    return;
  }
  const text = `# Starred modes (transition-v3, ${new Date().toISOString().slice(0, 10)})\n` +
    entries.map(e => `★  ${e.name} (mode ${e.id})`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    alert(`Copied ${entries.length} starred mode${entries.length === 1 ? '' : 's'} to clipboard.\nPaste it back to Claude.`);
  } catch {
    console.log(text);
    alert('Clipboard blocked — see browser console for the summary.');
  }
});
fStarred.addButton({ title: 'Clear all stars' }).on('click', () => {
  if (!confirm('Clear all starred modes?')) return;
  for (const k of Object.keys(starred)) delete starred[k];
  saveStarred();
});

// Keyboard
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === ' ')          { e.preventDefault(); togglePlay(); }
  if (e.key === 'ArrowLeft')  { state.t = Math.max(0, state.t - 0.02); pane.refresh(); }
  if (e.key === 'ArrowRight') { state.t = Math.min(1, state.t + 0.02); pane.refresh(); }
});

// ============================================================================
// SAM (Segment Anything) — point-prompt segmentation on image A.
//
// MVP: load model on demand, encode A once, click overlay to drop a positive
// (or shift-click negative) point, see the predicted mask as a tinted overlay
// on top of the WebGPU canvas. Multi-region storage + sequential reveal will
// build on this once the interaction feels right.
//
// Notes:
//  - Uses transformers.js with the slimsam-77-uniform checkpoint (~25 MB)
//    instead of full SAM (~360 MB). Quality is good enough for figure picking.
//  - The overlay-to-image mapping currently assumes A fills the canvas. If A
//    is letterboxed via fillMode/scale/offset, the click position will be off.
//    Fix once we wire the mask into the GPU pipeline.
// ============================================================================

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';
const SAM_MODEL_ID = 'Xenova/slimsam-77-uniform';

const sam = {
  status: 'idle',     // idle | loading | ready | encoding | encoded | segmenting | error
  lib: null,
  model: null,
  processor: null,
  rawImage: null,
  imageInputs: null,
  imageEmbeddings: null,
  encodedImgRef: null,
  points: [],         // [{x, y, label}] in source-image pixel coords
  maskCanvas: null,   // OffscreenCanvas with the current mask painted
  segmentMode: false,
};

const samUIState = { status: 'load model to begin' };
let samStatusBinding = null;

function samSetStatus(msg) {
  samUIState.status = msg;
  if (samStatusBinding) samStatusBinding.refresh();
  console.log('[SAM]', msg);
}

async function samLoadModel() {
  if (['loading','ready','encoding','encoded','segmenting'].includes(sam.status)) {
    samSetStatus('model already loaded');
    return;
  }
  if (!navigator.onLine && !sam.lib) {
    samSetStatus('offline — SAM needs internet to download its model (~25 MB)');
    return;
  }
  sam.status = 'loading';
  samSetStatus('loading model (~25 MB on first run) …');
  try {
    sam.lib = sam.lib || await import(TRANSFORMERS_URL);
    sam.model = await sam.lib.SamModel.from_pretrained(SAM_MODEL_ID, { device: 'webgpu', dtype: 'fp16' })
      .catch(async (e) => {
        console.warn('[SAM] webgpu/fp16 load failed, falling back', e);
        return sam.lib.SamModel.from_pretrained(SAM_MODEL_ID);
      });
    sam.processor = await sam.lib.AutoProcessor.from_pretrained(SAM_MODEL_ID);
    sam.status = 'ready';
    samSetStatus('model ready — encode A next');
  } catch (err) {
    console.error('[SAM] load failed', err);
    sam.status = 'error';
    samSetStatus(`load failed: ${err.message || err}`);
  }
}

async function samEncodeA() {
  if (!sam.model) { samSetStatus('load model first'); return; }
  if (!state.imgA) { samSetStatus('no image in slot A'); return; }
  sam.status = 'encoding';
  samSetStatus('encoding image A …');
  try {
    const bitmap = await createImageBitmap(state.imgA);
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const cctx = c.getContext('2d');
    cctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const imageData = cctx.getImageData(0, 0, c.width, c.height);
    sam.rawImage = new sam.lib.RawImage(imageData.data, c.width, c.height, 4);
    sam.imageInputs = await sam.processor(sam.rawImage);
    sam.imageEmbeddings = await sam.model.get_image_embeddings(sam.imageInputs);
    sam.encodedImgRef = state.imgA;
    sam.points = [];
    sam.maskCanvas = null;
    samDrawOverlay();
    sam.status = 'encoded';
    samSetStatus(`encoded ${c.width}×${c.height} — click overlay to segment`);
  } catch (err) {
    console.error('[SAM] encode failed', err);
    sam.status = 'error';
    samSetStatus(`encode failed: ${err.message || err}`);
  }
}

async function samSegmentAtPoint(imgX, imgY, label = 1) {
  if (!sam.imageEmbeddings) { samSetStatus('encode A first'); return; }
  if (sam.encodedImgRef !== state.imgA) { samSetStatus('A changed — re-encode'); return; }
  sam.points.push({ x: imgX, y: imgY, label });
  const wasStatus = sam.status;
  sam.status = 'segmenting';
  samSetStatus(`segmenting (${sam.points.length} pt${sam.points.length===1?'':'s'}) …`);
  try {
    // shape: [num_objects=1, num_points, 2] and [num_objects=1, num_points]
    const points = [sam.points.map(p => [p.x, p.y])];
    const labels = [sam.points.map(p => p.label)];
    const decoderInputs = await sam.processor(sam.rawImage, {
      input_points: points,
      input_labels: labels,
    });
    const outputs = await sam.model({
      ...sam.imageEmbeddings,
      input_points: decoderInputs.input_points,
      input_labels: decoderInputs.input_labels,
    });
    const masks = await sam.processor.post_process_masks(
      outputs.pred_masks,
      sam.imageInputs.original_sizes,
      sam.imageInputs.reshaped_input_sizes,
    );
    const scores = outputs.iou_scores.data;
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) if (scores[i] > scores[bestIdx]) bestIdx = i;
    sam.maskCanvas = samBuildMaskCanvas(masks[0], bestIdx);
    samDrawOverlay();
    sam.status = 'encoded';
    samSetStatus(`mask (iou=${scores[bestIdx].toFixed(2)}) — click to refine, shift-click excludes`);
  } catch (err) {
    console.error('[SAM] segment failed', err);
    sam.status = wasStatus;
    samSetStatus(`segment failed: ${err.message || err}`);
  }
}

function samBuildMaskCanvas(maskTensor, maskIdx) {
  // maskTensor.dims = [num_obj=1, num_masks_per_obj, H, W]
  const dims = maskTensor.dims;
  const H = dims[dims.length - 2];
  const W = dims[dims.length - 1];
  const stride = H * W;
  const start = maskIdx * stride;
  const data = maskTensor.data;
  const c = new OffscreenCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let i = 0; i < stride; i++) {
    const on = Boolean(data[start + i]);
    const o = i * 4;
    img.data[o + 0] = 70;
    img.data[o + 1] = 170;
    img.data[o + 2] = 255;
    img.data[o + 3] = on ? 120 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const samOverlay = document.getElementById('sam-overlay');
const samOverlayCtx = samOverlay.getContext('2d');

function samSyncOverlay() {
  const r = canvas.getBoundingClientRect();
  samOverlay.style.left   = r.left   + 'px';
  samOverlay.style.top    = r.top    + 'px';
  samOverlay.style.width  = r.width  + 'px';
  samOverlay.style.height = r.height + 'px';
  const dpr = window.devicePixelRatio || 1;
  const bw = Math.max(1, Math.round(r.width  * dpr));
  const bh = Math.max(1, Math.round(r.height * dpr));
  if (samOverlay.width  !== bw) samOverlay.width  = bw;
  if (samOverlay.height !== bh) samOverlay.height = bh;
}

function samDrawOverlay() {
  if (!sam.segmentMode) return;
  samSyncOverlay();
  samOverlayCtx.clearRect(0, 0, samOverlay.width, samOverlay.height);
  if (!sam.encodedImgRef) return;
  const iw = sam.encodedImgRef.naturalWidth  || sam.encodedImgRef.width;
  const ih = sam.encodedImgRef.naturalHeight || sam.encodedImgRef.height;
  if (sam.maskCanvas) {
    samOverlayCtx.imageSmoothingEnabled = false;
    samOverlayCtx.drawImage(sam.maskCanvas, 0, 0, samOverlay.width, samOverlay.height);
  }
  const dpr = window.devicePixelRatio || 1;
  for (const p of sam.points) {
    const cx = (p.x / iw) * samOverlay.width;
    const cy = (p.y / ih) * samOverlay.height;
    samOverlayCtx.beginPath();
    samOverlayCtx.arc(cx, cy, 6 * dpr, 0, Math.PI * 2);
    samOverlayCtx.fillStyle = p.label === 1 ? '#4af' : '#f55';
    samOverlayCtx.fill();
    samOverlayCtx.lineWidth = 1.5 * dpr;
    samOverlayCtx.strokeStyle = '#000';
    samOverlayCtx.stroke();
  }
}

// ---- click-placed emission / start points (reuses the sam-overlay canvas) ----
function drawOriginPoints() {
  samSyncOverlay();
  samOverlayCtx.clearRect(0, 0, samOverlay.width, samOverlay.height);
  const dpr = window.devicePixelRatio || 1;
  for (const pt of state.originPoints) {
    const cx = pt.x * samOverlay.width;
    const cy = pt.y * samOverlay.height;  // origin uv is y-down (matches shader + from-image)
    samOverlayCtx.beginPath();
    samOverlayCtx.arc(cx, cy, 7 * dpr, 0, Math.PI * 2);
    samOverlayCtx.fillStyle = 'rgba(74,158,255,0.9)';
    samOverlayCtx.fill();
    samOverlayCtx.lineWidth = 2 * dpr; samOverlayCtx.strokeStyle = '#000'; samOverlayCtx.stroke();
  }
  const _pm = ((state.mode <= 32 && state.mode !== 31) || state.mode === 34) || (state.mode >= 33 && state.mode <= 47) || state.mode === 50 || state.mode === 51 || state.mode === 52 || (state.mode >= 54 && state.mode <= 60);
  samOverlay.classList.toggle('visible', _pm && (state.placePoints || state.originPoints.length > 0));
}
function setPlacePoints(on) {
  state.placePoints = on;
  samOverlay.classList.toggle('interactive', on);
  drawOriginPoints();
}
function onPlaceClick(e) {
  if (!state.placePoints) return;
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top) / r.height;  // y-down to match the shader origin
  state.originPoints.push({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), r: Math.random() });
  drawOriginPoints();
  restartPlayback();  // replay so the bloom from the new point is visible
}
canvas.addEventListener('click', onPlaceClick);
samOverlay.addEventListener('click', onPlaceClick);
window.addEventListener('resize', () => { if (state.originPoints.length || state.placePoints) drawOriginPoints(); else if (state.mode === 37) drawPaintPreview(); });

// ---- paint mode (37): paint movement strokes that drive & grow the reveal ----
let paintCanvas = null, paintCtx = null, paintStrokeIdx = 0, painting = false, paintDirty = false, _curStrokeVal = 1;
function ensurePaintCanvas() {
  const aspect = canvas.width / Math.max(1, canvas.height);
  const W = 1024, H = Math.max(2, Math.round(1024 / aspect));
  if (!paintCanvas) { paintCanvas = document.createElement('canvas'); paintCtx = paintCanvas.getContext('2d'); }
  if (paintCanvas.width !== W || paintCanvas.height !== H) {
    paintCanvas.width = W; paintCanvas.height = H;
    paintCtx.fillStyle = '#000'; paintCtx.fillRect(0, 0, W, H);
  }
}
async function uploadPaintTexture() {
  ensurePaintCanvas();
  const bmp = await createImageBitmap(paintCanvas);
  const tex = device.createTexture({ label: 'paint', size: [paintCanvas.width, paintCanvas.height, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT });
  device.queue.copyExternalImageToTexture({ source: bmp }, { texture: tex }, [paintCanvas.width, paintCanvas.height, 1]);
  texTexture.destroy(); texTexture = tex; bmp.close();
  state.texAspect = paintCanvas.width / paintCanvas.height;
  bindGroup = makeBindGroup();
}
function clearPaint() { ensurePaintCanvas(); paintCtx.fillStyle = '#000'; paintCtx.fillRect(0, 0, paintCanvas.width, paintCanvas.height); paintStrokeIdx = 0; uploadPaintTexture(); drawPaintPreview(); }
function paintDab(sx, sy, val) {
  ensurePaintCanvas();
  const x = sx * paintCanvas.width, y = sy * paintCanvas.height;
  const R = Math.max(6, state.paintBrush * paintCanvas.width);
  const c = Math.round(Math.min(1, Math.max(0, val)) * 255);
  const g = paintCtx.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, `rgba(${c},${c},${c},1)`); g.addColorStop(1, `rgba(${c},${c},${c},0)`);
  paintCtx.globalCompositeOperation = 'lighten';
  paintCtx.fillStyle = g; paintCtx.fillRect(x - R, y - R, R * 2, R * 2);
}
function drawPaintPreview() {
  samSyncOverlay();
  samOverlayCtx.clearRect(0, 0, samOverlay.width, samOverlay.height);
  if (paintCanvas) { samOverlayCtx.globalAlpha = 0.35; samOverlayCtx.drawImage(paintCanvas, 0, 0, samOverlay.width, samOverlay.height); samOverlayCtx.globalAlpha = 1; }
  samOverlay.classList.toggle('visible', state.mode === 37 || state.originSource === 'paint');
}
function syncPaintMode() {
  const paintOrigin = (state.originSource === 'paint') && (state.mode <= 32 || state.mode === 34) && state.mode !== 31;
  const on = state.mode === 37 || paintOrigin;
  if (on) { ensurePaintCanvas(); uploadPaintTexture(); drawPaintPreview(); }
  samOverlay.classList.toggle('interactive', on || state.placePoints);
  const _pm2 = ((state.mode <= 32 && state.mode !== 31) || state.mode === 34) || (state.mode >= 33 && state.mode <= 47) || state.mode === 50 || state.mode === 51 || state.mode === 52 || (state.mode >= 54 && state.mode <= 60);
  samOverlay.classList.toggle('visible', on || (_pm2 && (state.placePoints || state.originPoints.length > 0)));
}
function paintAt(e) {
  const r = canvas.getBoundingClientRect();
  const sx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const sy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  paintDab(sx, sy, _curStrokeVal); drawPaintPreview(); paintDirty = true;
}
samOverlay.addEventListener('pointerdown', e => {
  if (state.mode !== 37 && state.originSource !== 'paint') return;
  painting = true;
  // each stroke staggers like the points (order + randomness)
  const k = paintStrokeIdx, rr = Math.random();
  const orderFrac = Math.min(1, k * 0.18);
  const startT = Math.min(0.92, (orderFrac + (rr - orderFrac) * (state.pointRandom || 0)) * (state.pointStagger || 0));
  _curStrokeVal = 1 - startT;
  paintAt(e);
});
samOverlay.addEventListener('pointermove', e => { if (painting) paintAt(e); });
window.addEventListener('pointerup', () => { if (!painting) return; painting = false; paintStrokeIdx++; state._paintReady = true; uploadPaintTexture(); restartPlayback(); });
setInterval(() => { if (painting && paintDirty) { paintDirty = false; uploadPaintTexture(); } }, 160);

function samSetSegmentMode(on) {
  sam.segmentMode = on;
  samOverlay.classList.toggle('visible', on);
  samOverlay.classList.toggle('interactive', on);
  if (on) samDrawOverlay();
}

samOverlay.addEventListener('click', (e) => {
  if (!sam.segmentMode) return;
  if (!sam.encodedImgRef) { samSetStatus('encode A first'); return; }
  const r = samOverlay.getBoundingClientRect();
  const iw = sam.encodedImgRef.naturalWidth  || sam.encodedImgRef.width;
  const ih = sam.encodedImgRef.naturalHeight || sam.encodedImgRef.height;
  if (e.altKey) { sam.points = []; sam.maskCanvas = null; samDrawOverlay(); return; }
  const label = e.shiftKey ? 0 : 1;
  const px = ((e.clientX - r.left) / r.width)  * iw;
  const py = ((e.clientY - r.top)  / r.height) * ih;
  samSegmentAtPoint(px, py, label);
});

window.addEventListener('resize', () => { if (sam.segmentMode) samDrawOverlay(); });
new ResizeObserver(() => { if (sam.segmentMode) samDrawOverlay(); }).observe(canvas);

function samClearMask() {
  sam.points = [];
  sam.maskCanvas = null;
  samDrawOverlay();
  samSetStatus(sam.encodedImgRef ? 'cleared — click overlay to start' : 'load model + encode A');
}

// ----- Saved regions: build a per-pixel "fade time" texture for mode 31 -----
//
// Each saved region is a binary mask at the encoded image's resolution. To
// drive mode 31 we pack them into one rgba8unorm texture where r = pixelT in
// [0,1], the t at which that pixel should be midway through fading A→B. With
// N saved regions we use N+1 time slots: region i (1-indexed) → (i-0.5)/(N+1),
// background → (N+0.5)/(N+1). Overlapping regions: latest save wins.
sam.regions = []; // [{ id, name, w, h, data: Uint8Array(w*h) of 0|1 }]

function samExtractCurrentMaskAsBinary() {
  if (!sam.maskCanvas) return null;
  const W = sam.maskCanvas.width;
  const H = sam.maskCanvas.height;
  const ctx = sam.maskCanvas.getContext('2d');
  const img = ctx.getImageData(0, 0, W, H);
  const out = new Uint8Array(W * H);
  for (let i = 0, j = 3; i < out.length; i++, j += 4) out[i] = img.data[j] > 0 ? 1 : 0;
  return { w: W, h: H, data: out };
}

function samRebuildRegionsTexture() {
  // Replace the bound texRegions texture in-place. If no regions remain, fall
  // back to the 1×1 placeholder (r=0 means everything fades immediately at
  // t=0 — but mode 31 only renders sensibly with at least one region).
  const wasReal = texRegions && texRegions !== placeholderTexRegions;
  if (!sam.regions.length) {
    if (wasReal) texRegions.destroy();
    texRegions = placeholderTexRegions;
    bindGroup = makeBindGroup();
    return;
  }
  const W = sam.regions[0].w;
  const H = sam.regions[0].h;
  const N = sam.regions.length;
  const slots = N + 1; // +1 for background
  const bgByte = Math.round(((slots - 0.5) / slots) * 255);
  const data = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) { data[i*4 + 0] = bgByte; data[i*4 + 3] = 255; }
  for (let r = 0; r < N; r++) {
    const region = sam.regions[r];
    if (region.w !== W || region.h !== H) {
      console.warn(`[SAM] region ${r} size ${region.w}×${region.h} ≠ first ${W}×${H} — skipping`);
      continue;
    }
    const ptByte = Math.round((((r + 1) - 0.5) / slots) * 255);
    const mask = region.data;
    for (let i = 0; i < W * H; i++) if (mask[i]) data[i*4 + 0] = ptByte;
  }
  if (wasReal) texRegions.destroy();
  const tex = device.createTexture({
    label: 'tex-regions',
    size: [W, H, 1], format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture({ texture: tex }, data, { bytesPerRow: W * 4 }, [W, H, 1]);
  texRegions = tex;
  bindGroup = makeBindGroup();
}

function samSaveCurrentMaskAsRegion(name) {
  const bin = samExtractCurrentMaskAsBinary();
  if (!bin) { samSetStatus('no mask to save — click first'); return; }
  // sanity check: region sizes must match across the list
  if (sam.regions.length && (sam.regions[0].w !== bin.w || sam.regions[0].h !== bin.h)) {
    samSetStatus(`size mismatch ${bin.w}×${bin.h} ≠ ${sam.regions[0].w}×${sam.regions[0].h} — clear regions first`);
    return;
  }
  const id = Date.now() + Math.random();
  const finalName = name || `region ${sam.regions.length + 1}`;
  sam.regions.push({ id, name: finalName, w: bin.w, h: bin.h, data: bin.data });
  sam.points = [];
  sam.maskCanvas = null;
  samDrawOverlay();
  samRebuildRegionsTexture();
  samRefreshRegionsList();
  samSetStatus(`saved "${finalName}" — ${sam.regions.length} region${sam.regions.length===1?'':'s'} — click to start the next`);
}

function samRemoveRegion(id) {
  const before = sam.regions.length;
  sam.regions = sam.regions.filter(r => r.id !== id);
  if (sam.regions.length !== before) {
    samRebuildRegionsTexture();
    samRefreshRegionsList();
    samSetStatus(`removed — ${sam.regions.length} left`);
  }
}

function samClearRegions() {
  if (!sam.regions.length) { samSetStatus('no regions to clear'); return; }
  sam.regions = [];
  samRebuildRegionsTexture();
  samRefreshRegionsList();
  samSetStatus('all regions cleared');
}

// ----- UI -----
const fSamLoad = tabSegment.addFolder({ title: 'Model', expanded: true });
samStatusBinding = fSamLoad.addBinding(samUIState, 'status', { readonly: true, label: 'status' });
fSamLoad.addButton({ title: '1. Load model (~25 MB)' }).on('click', () => samLoadModel());
fSamLoad.addButton({ title: '2. Encode current A' }).on('click', () => samEncodeA());

const fSamPick = tabSegment.addFolder({ title: 'Pick (overlay clicks)', expanded: true });
const samToggle = { active: false };
fSamPick.addBinding(samToggle, 'active', { label: 'segment mode' }).on('change', (ev) => {
  samSetSegmentMode(ev.value);
});
fSamPick.addButton({ title: 'Clear points / mask' }).on('click', () => samClearMask());
fSamPick.addButton({ title: '+ Save current mask as region' }).on('click', () => samSaveCurrentMaskAsRegion());

const fSamRegions = tabSegment.addFolder({ title: 'Regions', expanded: true });
fSamRegions.addButton({ title: 'Clear all regions' }).on('click', () => samClearRegions());
// Child folder so dynamically-added per-region buttons stay grouped — refresh
// just disposes and rebuilds the children, not the parent's structural buttons.
const fSamRegionsList = fSamRegions.addFolder({ title: 'List', expanded: true });
let samRegionBlades = [];
function samRefreshRegionsList() {
  for (const b of samRegionBlades) b.dispose();
  samRegionBlades = [];
  if (!sam.regions.length) {
    samRegionBlades.push(fSamRegionsList.addButton({ title: '(none — save a mask first)', disabled: true }));
  } else {
    for (let i = 0; i < sam.regions.length; i++) {
      const region = sam.regions[i];
      const btn = fSamRegionsList.addButton({ title: `× ${i + 1}. ${region.name}` });
      btn.on('click', () => samRemoveRegion(region.id));
      samRegionBlades.push(btn);
    }
  }
}
samRefreshRegionsList();

const fSamHelp = tabSegment.addFolder({ title: 'Help', expanded: false });
const samHelp = {
  click: 'include region',
  shiftClick: 'exclude region',
  altClick: 'reset mask',
};
fSamHelp.addBinding(samHelp, 'click',      { readonly: true, label: 'click' });
fSamHelp.addBinding(samHelp, 'shiftClick', { readonly: true, label: 'shift-click' });
fSamHelp.addBinding(samHelp, 'altClick',   { readonly: true, label: 'alt-click' });

// Expose for headless / automation experiments
// ----- Auto-persist all settings to localStorage -----
const SESSION_LS_KEY = 'trans:session';
// Bump when default values change so stale saved sessions don't mask new
// defaults (e.g. matte-first, cover texture fit, turbulence, origin).
const SESSION_VERSION = 21;
const PERSIST_KEYS = [
  ...PRESET_KEYS,
  'fit', 'bg',
  'customSize', 'matchInput', 'lockAspect', 'outW', 'outH', 'previewScale', 'padTopPx', 'padBottomPx', 'padLeftPx', 'padRightPx', 'useSources', 'texAmount', 'texBg', 'texFit',
  'originAmount', 'originX', 'originY', 'originFromImage', 'turbulence', 'flow', 'undulate', 'animate', 'originPoints',
  'pointStagger', 'pointRandom', 'pointSize', 'pointPop', 'pointFill', 'paintBrush',
  'auroraDensity', 'auroraHeight', 'auroraSpeed', 'auroraDark', 'auroraWave', 'driftAngle', 'driftAmount',
  'gdIntensity', 'gdBeams', 'gdCloud', 'gdPulse', 'gdSpeed',
  'ambCount', 'ambSize', 'ambSoft', 'ambSpeed', 'ambDetail', 'sunX', 'sunY', 'streakMove', 'vignAmount', 'vignFeather', 'vignAnimate', 'vignTexture', 'vignShape', 'ambRole',
  'gradeBright', 'gradeContrast', 'gradeBlack', 'gradeWhite', 'gradeGamma',
  'exportFps', 'exportSizeMode', 'exportPadBottom', 'matteOutput', 'matteInvert', 'projectName',
  'cellCols', 'cellRows', 'cellJitter', 'cellGlow', 'cellOrder', 'cellCascade', 'cellSnap', 'cellSpill', 'cellIgniteBy', 'cellAnalyseBy', 'cellCoarseness',
  'slotAFillMode', 'slotAColor', 'slotBFillMode', 'slotBColor', 'keepAOutsideB',
  'partEnable', 'partCount', 'partBurst', 'partSpeed', 'partCurl', 'partTrail',
  'partDrag', 'partGravity', 'partLife', 'partFade', 'partSize', 'partGlow',
  'partColorMix', 'partGlowColor', 'partSpread', 'partCenterX', 'partCenterY',
];
function saveSession() {
  try {
    const out = { __v: SESSION_VERSION };
    for (const k of PERSIST_KEYS) out[k] = state[k];
    localStorage.setItem(SESSION_LS_KEY, JSON.stringify(out));
  } catch {}
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_LS_KEY) || 'null');
    if (!s || s.__v !== SESSION_VERSION) return;  // discard stale-schema sessions
    for (const k of PERSIST_KEYS) if (k in s) state[k] = s[k];
    // sync the pad-preset dropdown to whatever the restored slider value is
    const presets = [0, 0.5, 1.0, 1.416, 2.0];
    const match = presets.find(p => Math.abs(p - state.exportPadBottom) < 0.001);
    padPresets._v = match !== undefined ? match : 0;
    pane.refresh();
    updateModeFolders();
    if (Array.isArray(state.originPoints) && state.originPoints.length) drawOriginPoints();
    if (state.mode === 37 && typeof syncPaintMode === 'function') syncPaintMode();
    if (typeof syncSizeFields === 'function') { sizePresets._v = 'custom'; syncSizeFields(); }
    if (state.mode >= 10 && state.mode <= 14) advec.needsReset = true;
  } catch {}
}
loadSession();
pane.on('change', () => saveSession());

window.__tool = { state, pane, device, adapter, uploadTexture, loadTextureFile, clearTexture, loadFromUrl, computeOutputDims, previewScaleFactor };

// ── Engine API for the custom UI (ui.js). Tweakpane stays alive underneath as
// the side-effect registry; the custom UI drives state + calls these so handler
// wiring can't silently break. ──────────────────────────────────────────────
window.__engine = {
  state,
  // apply a state change with the right side-effect
  setMatchInput(on) { state.matchInput = !!on; resizeCanvas(); saveSession(); },
  get matchInput() { return !!state.matchInput; },
  setSize(w, h) {
    state.outW = Math.max(2, Math.round(w)); state.outH = Math.max(2, Math.round(h));
    state.customSize = true; resizeCanvas(); saveSession();
  },
  setPreview(scale) { state.previewScale = scale; resizeCanvas(); saveSession(); },
  setMode(m) {
    const prev = state.mode;
    state.mode = m; updateModeFolders();
    // mirror expand (64) reads best as a gate cracking open from black — snap
    // the shared organic wobble off and the edge tight on entry, so it starts
    // fully black and opens as a thin centre sliver (opt INTO softness/organic).
    if (m === 64 && prev !== 64) { state.organic = 0; state.spread = 0.06; }
    // door (65) is geometrically clean (ignores organic) — just snap the seam
    // crisp on entry so it reads as a hard panel, not a soft fade.
    if (m === 65 && prev !== 65) state.spread = 0.03;
    // fog bloom (66) / fog sim (67): apply their tuned defaults on entry so they
    // don't inherit stale values from the previous mode (e.g. a negative edges).
    if ((m === 66 || m === 67) && prev !== m) resetModeDefaults(m);
    advec.needsReset = true; particles.needsReset = true;
    if (typeof syncPaintMode === 'function') syncPaintMode();
    restartPlayback(); saveSession();
  },
  scrub(t) {
    state.t = Math.min(1, Math.max(0, t)); state.playing = false;
    if (typeof updateTransportLabels === 'function') updateTransportLabels();
  },
  togglePlay, restartPlayback, toggleLoop, startRecording,
  // Bake hover-preview clips: loop every mode and record a short low-res matte
  // of each as previews/mNN.mp4 (via the same recorder the user already uses).
  // Run once in real Chrome (pick an output folder first, or it downloads each):
  //   await window.__engine.bakePreviews()
  async bakePreviews(opts = {}) {
    const ids = (window.__modeNames ? Object.keys(window.__modeNames).map(Number) : [])
      .filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
    const W = opts.w || 384, H = opts.h || 240, dur = opts.duration || 2, fps = opts.fps || 15;
    const saved = { mode: state.mode, outW: state.outW, outH: state.outH, customSize: state.customSize,
                    duration: state.duration, exportFps: state.exportFps, exportSizeMode: state.exportSizeMode };
    state.outW = W; state.outH = H; state.customSize = true; state.duration = dur;
    state.exportFps = fps; state.exportSizeMode = 'src'; resizeCanvas();
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      if (opts.onProgress) try { opts.onProgress(k + 1, ids.length, id); } catch (e) {}
      state.mode = id; updateModeFolders(); advec.needsReset = true; particles.needsReset = true; restartPlayback();
      await new Promise((r) => setTimeout(r, 250));
      try { await startRecording({ filename: 'm' + String(id).padStart(2, '0') + '.mp4' }); }
      catch (e) { console.warn('[bake] mode', id, 'failed', e); }
    }
    Object.assign(state, saved); resizeCanvas(); restartPlayback(); saveSession();
    console.log('[bake] done — ' + ids.length + ' previews. Move the mNN.mp4 files into ./previews/');
  },
  resize: resizeCanvas, save: saveSession,
  setPlacePoints, drawOriginPoints,
  clearPoints() { state.originPoints = []; drawOriginPoints(); restartPlayback(); },
  setOriginSource(srcMode) { state.originSource = srcMode; if (srcMode === 'paint') { ensurePaintCanvas(); state.placePoints = false; } if (typeof syncPaintMode === 'function') syncPaintMode(); drawPaintPreview(); restartPlayback(); saveSession(); },
  originSource() { return state.originSource || 'auto'; },
  setPaintBackdrop(ab) { state.paintBackdrop = ab; state.t = (ab === 'B' ? 1 : 0); state.playing = false; drawPaintPreview(); saveSession(); },
  paintBackdrop() { return state.paintBackdrop || 'A'; },
  clearPaint() { ensurePaintCanvas(); paintCtx.fillStyle = '#000'; paintCtx.fillRect(0, 0, paintCanvas.width, paintCanvas.height); paintStrokeIdx = 0; state._paintReady = false; uploadPaintTexture(); drawPaintPreview(); restartPlayback(); },
  setFill(slot, mode) { state[slot === 'A' ? 'slotAFillMode' : 'slotBFillMode'] = mode; resizeCanvas(); },
  get playing() { return state.playing; },
  get loop() { return state.loop; },
  get recording() { return typeof recording !== 'undefined' ? recording : false; },
  // the filename a record/export would use — effect-name based, not "modeN".
  // exposed for the UI export-name preview and as a regression guard in tests.
  exportFilename() { return makeFilenameV2(); },
  // ── per-mode reset / randomize ──
  resetMode(m) {
    if (typeof MODE_DEFAULTS !== 'undefined' && MODE_DEFAULTS[m]) {
      for (const k in MODE_DEFAULTS[m]) state[k] = MODE_DEFAULTS[m][k];
    }
    const AMB = { ambCount: 0.5, ambSize: 0.5, ambSoft: 0.5, ambSpeed: 0.25, ambDetail: 0.5,
                  driftAngle: 0.25, driftAmount: 0.3, sunX: 0.5, sunY: 0.3, streakMove: 0.25 };
    if (m >= 33) { for (const k in AMB) state[k] = AMB[k]; }
    if (m === 38) { state.auroraDensity = 0.5; state.auroraHeight = 0.5; state.auroraSpeed = 0.5; state.auroraWave = 0.5; state.auroraDark = 0.5; }
    if (m === 39) { state.gdIntensity = 0.5; state.gdBeams = 0.5; state.gdCloud = 0.5; state.gdPulse = 0.4; state.gdSpeed = 2; }
    try { pane.refresh(); } catch (e) {}
    if (m >= 10 && m <= 14) advec.needsReset = true;
    restartPlayback(); saveSession();
  },
  // Reset ONE parameter to its default (right-click a control). Precedence mirrors
  // resetMode: per-mode override > ambient defaults (mode>=33) > pristine base.
  // Returns the value applied, or undefined if the key has no known default.
  resetParam(key) {
    const m = state.mode;
    const AMB = { ambCount: 0.5, ambSize: 0.5, ambSoft: 0.5, ambSpeed: 0.25, ambDetail: 0.5,
                  driftAngle: 0.25, driftAmount: 0.3, sunX: 0.5, sunY: 0.3, streakMove: 0.25 };
    let d;
    if (typeof MODE_DEFAULTS !== 'undefined' && MODE_DEFAULTS[m] && key in MODE_DEFAULTS[m]) d = MODE_DEFAULTS[m][key];
    else if (m >= 33 && key in AMB) d = AMB[key];
    else d = BASE_DEFAULTS[key];
    if (d === undefined) return undefined;
    state[key] = d;
    if (m >= 10 && m <= 14) advec.needsReset = true;
    try { pane.refresh(); } catch (e) {}
    saveSession();
    return d;
  },
  resetVignette() { state.vignAmount = 0; state.vignShape = 0.5; state.vignFeather = 0.5; state.vignTexture = 0; state.vignAnimate = 0; try { pane.refresh(); } catch (e) {} restartPlayback(); saveSession(); },
  setMatte(on) { state.matteOutput = !!on; if (typeof pane!=='undefined') try{pane.refresh();}catch(e){} saveSession(); },
  get matteOutput() { return state.matteOutput; },
  setUseSources(on) { state.useSources = !!on; resizeCanvas(); saveSession(); },
  get useSources() { return state.useSources !== false; },
  randomizeMode(m) {
    // reset to defaults then jitter each numeric amb/mode key a little — folder-free
    this.resetMode(m);
    const jit = (k, lo, hi) => { state[k] = lo + Math.random() * (hi - lo); };
    if (m >= 33) { jit('ambCount',0,1); jit('ambSize',0,1); jit('ambSoft',0,1); jit('ambSpeed',0,1); jit('ambDetail',0,1); jit('driftAngle',0,1); }
    if (m === 38) { jit('auroraDensity',0,1); jit('auroraHeight',0,1); jit('auroraSpeed',0,1); jit('auroraWave',0,1); jit('auroraDark',0,1); }
    if (m === 39) { jit('gdIntensity',0,1); jit('gdBeams',0,1); jit('gdCloud',0,1); jit('gdPulse',0,1); }
    if (m < 33 && typeof randomizeMode === 'function') { try { randomizeMode(m, null); } catch (e) {} }
    try { pane.refresh(); } catch (e) {}
    restartPlayback(); saveSession();
  },
  // ── sources / texture ──
  loadFile, clearTexture,
  loadTexture(file) { if (file) loadTextureFile(file); },
  // foliage footage for sun-through-trees (mode 54): a T-slot video drives the canopy.
  loadFoliageVideo(file) { if (file) loadVideoToT(file); },
  clearFoliageVideo() { if (state.videoT) { try { state.videoT.pause(); } catch {} state.videoT = null; } },
  hasFoliageVideo() { return !!state.videoT; },
  // colourise (gradient map, preview only)
  loadColourise, clearColourise,
  analyseCells(by) { return analyseCellRegions(by || 'random'); },
  get colourise() { return !!state.colourise; },
  // ── output folder ──
  hasFolderAPI: HAS_FS_ACCESS,
  get folderName() { return outputFolderProxy.name; },
  async pickFolder() {
    if (!HAS_FS_ACCESS) return false;
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setOutputDir(handle); outputFolderProxy.name = handle.name;
      await idbPut('outputDir', handle); try { pane.refresh(); } catch {}
      return handle.name;
    } catch (err) { if (err.name !== 'AbortError') alert('Folder pick failed: ' + err.message); return false; }
  },
  async clearFolder() { setOutputDir(null); outputFolderProxy.name = 'browser default'; await idbPut('outputDir', null); try { pane.refresh(); } catch {} },
  // ── presets ──
  presetOptions() {
    const opts = [];
    for (const k of Object.keys(FACTORY_PRESETS)) opts.push({ id: 'factory:' + k, label: '★ ' + k });
    const user = loadUserPresets();
    for (const k of Object.keys(user)) opts.push({ id: 'user:' + k, label: 'user · ' + k });
    return opts;
  },
  applyPreset(id) { applyPreset(id); if (typeof rebuildPresetsFolder === 'function') rebuildPresetsFolder(); },
  savePreset(name) {
    name = (name || '').trim(); if (!name) return false;
    const user = loadUserPresets(); user[name] = snapshotState(); saveUserPresetsToLS(user);
    if (typeof rebuildPresetsFolder === 'function') rebuildPresetsFolder(); return true;
  },
  deletePreset(id) {
    if (!id || !id.startsWith('user:')) return false;
    const user = loadUserPresets(); delete user[id.slice(5)]; saveUserPresetsToLS(user);
    if (typeof rebuildPresetsFolder === 'function') rebuildPresetsFolder(); return true;
  },
};
console.log('[trans] WebGPU ready, format:', presentationFormat);
