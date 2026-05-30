// GPU particle system for matte (mode 31): self-contained compute + draw passes.
// Imports the shared GPU singletons + state + a colour helper; exports the
// handles the render loop needs. WGSL templates + writePartUBO stay internal.

import { device, presentationFormat, canvas } from './core.js';
import { state } from './state.js';
import { hexToRgb } from './util.js';

const PART_STRIDE_F32 = 8;  // spawn.xy, pos.xy, vel.xy, age, seed
export const particles = { buffer: null, count: 0, lastT: 0, needsReset: true };

const PART_STRUCTS = /* wgsl */`
struct P { spawn: vec2f, pos: vec2f, vel: vec2f, age: f32, seedf: f32 };
struct PP {
  tA: vec4f,        // t, dt, aspect, seed
  f0: vec4f,        // burst, speed, curl, drag
  f1: vec4f,        // gravity, life, size, trail
  f2: vec4f,        // spread, glow, colorMix, fade
  center: vec4f,    // cx, cy, matteFlag, _
  glowColor: vec4f, // rgb, _
};
fn ph21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
fn pnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = ph21(i); let b = ph21(i + vec2f(1.0, 0.0));
  let c = ph21(i + vec2f(0.0, 1.0)); let d = ph21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn pfbm(p: vec2f) -> f32 { return pnoise(p) * 0.6 + pnoise(p * 2.03) * 0.3; }
fn pcurl(p: vec2f) -> vec2f {
  let e = 0.01;
  let ny = pfbm(p + vec2f(0.0, e)) - pfbm(p - vec2f(0.0, e));
  let nx = pfbm(p + vec2f(e, 0.0)) - pfbm(p - vec2f(e, 0.0));
  return vec2f(ny, -nx) / (2.0 * e);
}
`;

const PART_COMPUTE = PART_STRUCTS + /* wgsl */`
@group(0) @binding(0) var<storage, read_write> parts: array<P>;
@group(0) @binding(1) var<uniform> pp: PP;
@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&parts)) { return; }
  var pt = parts[i];
  let t = pp.tA.x; let dt = pp.tA.y;
  let burst = pp.f0.x; let speed = pp.f0.y; let curlF = pp.f0.z; let drag = pp.f0.w;
  let gravity = pp.f1.x; let life = pp.f1.y;
  let center = pp.center.xy;
  let prevAge = pt.age;
  pt.age = pt.age + dt;
  if (prevAge < 0.0 && pt.age >= 0.0) {
    let dir = normalize(pt.spawn - center + vec2f(1e-4, 1e-4));
    pt.pos = pt.spawn;
    pt.vel = dir * speed * (0.3 + burst);
  }
  if (pt.age >= 0.0 && pt.age < life) {
    let dir = normalize(pt.pos - center + vec2f(1e-4, 1e-4));
    var acc = dir * speed * burst;
    acc += pcurl(pt.pos * 3.0 + pt.seedf * 10.0 + t) * curlF;
    acc.y += gravity;
    pt.vel = pt.vel + acc * dt;
    pt.vel = pt.vel * (1.0 - clamp(drag * dt, 0.0, 1.0));
    pt.pos = pt.pos + pt.vel * dt;
  }
  parts[i] = pt;
}
`;

const PART_DRAW = PART_STRUCTS + /* wgsl */`
@group(0) @binding(0) var<storage, read> parts: array<P>;
@group(0) @binding(1) var<uniform> pp: PP;
@group(0) @binding(2) var texA: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
};
@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var out: VSOut;
  let pt = parts[ii];
  let life = pp.f1.y; let size = pp.f1.z; let trail = pp.f1.w; let aspect = pp.tA.z;
  if (pt.age < 0.0 || pt.age >= life) {
    out.pos = vec4f(2.0, 2.0, 0.0, 1.0); out.local = vec2f(0.0);
    out.color = vec3f(0.0); out.alpha = 0.0; return out;
  }
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let c = corners[vi];
  let p = vec2f(pt.pos.x * 2.0 - 1.0, 1.0 - pt.pos.y * 2.0);
  let sp = length(pt.vel);
  let dirv = select(vec2f(1.0, 0.0), normalize(pt.vel), sp > 1e-5);
  let perp = vec2f(-dirv.y, dirv.x);
  let along = dirv * (size * (1.0 + trail * sp * 8.0));
  let across = perp * size;
  var offset = c.x * across + c.y * along;
  offset.x = offset.x / aspect;
  out.pos = vec4f(p + offset, 0.0, 1.0);
  out.local = c;
  let src = textureSampleLevel(texA, samp, pt.spawn, 0.0).rgb;
  out.color = mix(pp.glowColor.rgb, src, pp.f2.z);
  let lifeT = pt.age / life;
  let aLife = pow(1.0 - lifeT, mix(0.5, 3.0, pp.f2.w));
  let aBirth = smoothstep(0.0, 0.05 * life, pt.age);
  out.alpha = aLife * aBirth;
  return out;
}
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let d = length(in.local);
  let falloff = pow(clamp(1.0 - d, 0.0, 1.0), 2.0);
  let a = falloff * in.alpha * pp.f2.y;
  var col = in.color;
  if (pp.center.z > 0.5) { col = vec3f(1.0); }  // matte: white luma
  return vec4f(col * a, a);
}
`;

const partComputePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: { module: device.createShaderModule({ code: PART_COMPUTE }), entryPoint: 'cs' },
});
const partDrawPipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module: device.createShaderModule({ code: PART_DRAW }), entryPoint: 'vs' },
  fragment: {
    module: device.createShaderModule({ code: PART_DRAW }), entryPoint: 'fs',
    targets: [{
      format: presentationFormat,
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      },
    }],
  },
  primitive: { topology: 'triangle-list' },
});
const partUBO = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
const partUBOHost = new Float32Array(24);

export function ensureParticles() {
  const N = Math.max(1, state.partCount | 0);
  if (!particles.buffer || particles.count !== N) {
    particles.buffer?.destroy?.();
    particles.buffer = device.createBuffer({
      size: N * PART_STRIDE_F32 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    particles.count = N;
    particles.needsReset = true;
  }
  if (particles.needsReset) { initParticleData(); particles.needsReset = false; particles.lastT = 0; }
}
export function initParticleData() {
  const N = particles.count;
  const data = new Float32Array(N * PART_STRIDE_F32);
  const cx = state.partCenterX, cy = state.partCenterY, spread = state.partSpread;
  for (let i = 0; i < N; i++) {
    const sx = Math.random(), sy = Math.random();
    const r = Math.min(1, Math.hypot(sx - cx, sy - cy) / 0.7071);
    const birth = Math.min(0.95, Math.max(0, r * spread + Math.random() * (1 - spread) * 0.6));
    const o = i * PART_STRIDE_F32;
    data[o] = sx; data[o + 1] = sy; data[o + 2] = sx; data[o + 3] = sy;
    data[o + 4] = 0; data[o + 5] = 0; data[o + 6] = -birth; data[o + 7] = Math.random();
  }
  device.queue.writeBuffer(particles.buffer, 0, data);
}
function writePartUBO(dt) {
  const aspect = canvas.width / Math.max(1, canvas.height);
  const gc = hexToRgb(state.partGlowColor);
  const h = partUBOHost;
  h[0] = state.t; h[1] = dt; h[2] = aspect; h[3] = state.seed * 0.123;
  h[4] = state.partBurst; h[5] = state.partSpeed; h[6] = state.partCurl; h[7] = state.partDrag;
  h[8] = state.partGravity; h[9] = Math.max(0.05, state.partLife); h[10] = state.partSize; h[11] = state.partTrail;
  const noImg = !state.imgA && !state.imgB;
  // No source → particles use the flat glow colour (sampling the placeholder
  // would make them black), and they render as white luma to match the matte.
  h[12] = state.partSpread; h[13] = state.partGlow; h[14] = noImg ? 0 : state.partColorMix; h[15] = state.partFade;
  h[16] = state.partCenterX; h[17] = state.partCenterY; h[18] = (state.matteOutput || noImg) ? 1 : 0; h[19] = 0;
  h[20] = gc[0]; h[21] = gc[1]; h[22] = gc[2]; h[23] = 0;
  device.queue.writeBuffer(partUBO, 0, h);
}
export function simAndDrawParticles(enc, canvasView, texA, sampler) {
  ensureParticles();
  let dt = state.t - particles.lastT;
  if (dt < 0) { particles.needsReset = true; ensureParticles(); dt = 0; }
  particles.lastT = state.t;
  writePartUBO(dt);
  const cbg = device.createBindGroup({
    layout: partComputePipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: particles.buffer } }, { binding: 1, resource: { buffer: partUBO } }],
  });
  const cpass = enc.beginComputePass();
  cpass.setPipeline(partComputePipeline);
  cpass.setBindGroup(0, cbg);
  cpass.dispatchWorkgroups(Math.ceil(particles.count / 64));
  cpass.end();
  const dbg = device.createBindGroup({
    layout: partDrawPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: particles.buffer } },
      { binding: 1, resource: { buffer: partUBO } },
      { binding: 2, resource: texA.createView() },
      { binding: 3, resource: sampler },
    ],
  });
  const dpass = enc.beginRenderPass({ colorAttachments: [{ view: canvasView, loadOp: 'load', storeOp: 'store' }] });
  dpass.setPipeline(partDrawPipeline);
  dpass.setBindGroup(0, dbg);
  dpass.draw(6, particles.count);
  dpass.end();
}
