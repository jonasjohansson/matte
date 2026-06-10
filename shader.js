// WGSL shaders for matte. The uniform layout is defined ONCE in PARAMS_STRUCT
// below and interpolated into all three modules, so they can't drift; that layout
// must stay in lockstep with the hand-indexed UBO in writeUniforms() (main.js).
// test/check-shaders.mjs guards both invariants. Imported by main.js.

// Single source of truth for the uniform layout — interpolated into all three
// WGSL modules below so they can never drift (and matches the hand-indexed UBO in
// main.js writeUniforms). Keep field order in lockstep with that index table.
const PARAMS_STRUCT = `
struct Params {
  // -- 0..31 -- scalars & ints
  t: f32, spread: f32, organic: f32, edges: f32,
  maskScale: f32, seed: f32, validA: u32, validB: u32,
  // -- 32..63 -- image fit transforms (vec2 align 8)
  scaleA: vec2f, offsetA: vec2f, scaleB: vec2f, offsetB: vec2f,
  // -- 64..79 -- bg (vec3 align 16) + mode tightly packed
  bg: vec3f, mode: u32,
  // -- 80..95 -- enum-style u32s
  curve: u32, sedDirection: u32, sedSource: u32, saltSource: u32,
  // -- 96..127 -- rim, paper, blooms scalar params
  rimWidth: f32, rimDark: f32,
  paperAngle: f32, paperAniso: f32, paperGranulation: f32,
  bloomCount: u32, bloomRim: f32, bloomRate: f32,
  // -- 128..159 -- diffusion, sediment, salt scalar params
  diffStrength: f32, diffRadius: f32,
  sedBands: f32, sedSoftness: f32,
  saltDensity: f32, saltContrast: f32, saltBias: f32, saltImage: u32,
  // -- 160..175 -- iris (vec2 align 8) + jitter + uniform-circle toggle
  irisFocus: vec2f, irisJitter: f32, irisUniform: u32,
  // -- 176..191 -- bleed, run scalars
  bleedFinger: f32, bleedAmount: f32, bleedHalo: f32, runGravity: f32,
  // -- 192..207 -- run drip + advection-family params (start)
  runDrip: f32, advVariant: u32, advVisc: f32, advRate: f32,
  // -- 208..223 -- gravity params
  advGravity: f32, advGravBias: f32, advGravAngle: f32, advGravStreak: f32,
  // -- 224..239 -- gravity lateral + curl + brush
  advGravLateral: f32, advCurlStr: f32, advCurlScale: f32, advBrushFollow: f32,
  // -- 240..255 -- seed + canvas aspect (w/h) used by uniform-circle iris
  advSeedCount: u32, advSeedRadius: f32, canvasAspect: f32, texAspect: f32,
  // -- 256..271 -- wet edge (mode 15): rect ingress
  weEdgeScale: f32, weEdgeWobble: f32, weDryRing: f32, weBleed: f32,
  // -- 272..287 -- wet edge: tendrils
  weTendrilCount: u32, weTendrilReach: f32, weTendrilWidth: f32, weTendrilStrength: f32,
  // -- 288..303 -- wet edge: detail bias + future padding
  weDetailBias: f32, moldTendrilsPerSeed: u32, weReverse: u32, weBDetailBias: f32,
  // -- 304..319 -- mold tendrils (mode 22): direct fbm-warped tendril paths
  moldWidth: f32, moldWobble: f32, moldSeedCount: u32, moldReach: f32,
  // -- 320..335 -- new painterly modes 16..21: stroke / glaze
  strokeScale: f32, strokeAniso: f32, glazeBands: f32, glazeSoftness: f32,
  // -- 336..351 -- glaze direction + warm tint / edge-first + dabs
  glazeDirection: u32, glazeWarm: f32, edgeFirstInk: f32, edgeFirstFade: f32,
  // -- 352..367 -- edge-first scale / flow / dabs count + reach
  edgeFirstScale: f32, flowAmount: f32, dabsCount: u32, dabsReach: f32,
  // -- 368..383 -- dabs wobble / density / global paper grain
  dabsWobble: f32, densityGravity: f32, densitySmear: f32, paperGrain: f32,
  formStrokeCount: u32, formStrokeSize: f32, formStrokeWobble: f32, texAmount: f32,
  bloomLightBias: f32, bloomWobble: f32, bloomPaperShow: f32, bloomImageBias: f32,
  stageBands: f32, stageOverlap: f32, matteOutput: u32, matteInvert: u32,
  migrationStrength: f32, migrationDir: u32, migrationTurb: f32, texBg: f32,
  boundsEnable: u32, boundsCx: f32, boundsCy: f32, boundsW: f32,
  boundsH: f32, boundsSoftness: f32, weBLumaBias: f32, maskShift: f32,
  slotAColor: vec3f, keepAOutsideB: u32,
  slotBColor: vec3f, texFit: u32,
  burnEdgeWobble: f32, burnCharIntensity: f32, burnCharWidth: f32, burnGlowIntensity: f32,
  burnGlowWidth: f32, burnSeedCount: u32, burnBrowning: f32, burnBrowningWidth: f32,
  burnAshSpatter: f32, burnCharPersistence: f32, burnEmberTrail: f32, burnBIgnite: f32,
  burnGlowColor: vec3f, burnGlowFromB: f32,
  videoMaskInvert: u32, videoMaskFeather: f32, burnColorBleed: f32, videoDisplace: f32,
  meltCellScale: f32, meltCenterX: f32, meltCenterY: f32, meltInkAmount: f32,
  meltGlowIntensity: f32, meltCellJitter: f32, videoDisplaceB: f32, videoBrightness: f32,
  meltGlowColor: vec3f, videoContrast: f32,
  lightIntensity: f32, lightSpread: f32, lightPeakT: f32, lightFlashWidth: f32,
  lightColor: vec3f, videoSaturate: f32,
  paperGrowth: f32, paperFollow: f32, paperPatches: f32, videoDisplaceAmount: f32,
  originAmount: f32, originX: f32, originY: f32, turbulence: f32,
  originPts: array<vec4f, 8>,
  originCount: u32, flow: f32, undulate: f32, auroraDensity: f32,
  auroraHeight: f32, auroraSpeed: f32, auroraDark: f32, auroraWave: f32,
  driftAngle: f32, driftAmount: f32, gdIntensity: f32, gdBeams: f32,
  gdCloud: f32, gdPulse: f32, ambCount: f32, ambSize: f32,
  ambSoft: f32, ambSpeed: f32, ambDetail: f32, sunX: f32,
  sunY: f32, streakMove: f32, vignAmount: f32, vignFeather: f32,
  vignAnimate: f32, vignTexture: f32, vignShape: f32, ambRole: f32,
  originPts2: array<vec4f, 8>,
  pointSize: f32, pointPop: f32, pointFill: f32, padTop: f32,
  padBottom: f32, padLeft: f32, padRight: f32, gradeBright: f32,
  gradeContrast: f32, gradeBlack: f32, gradeWhite: f32, gradeGamma: f32,
  footageMask: f32, foliageDrift: f32, swipeCols: f32, swipeDir: f32,
  swipeStagger: f32, swipeColW: f32, swipeSoft: f32, mirrorDir: f32,
  swipeW: array<vec4f, 4>,   // per-column width weights (mode 63), default 1 = equal
  rectW: f32, rectH: f32, rectReach: f32, padRect: f32,   // box reveal (mode 68): seed half-size + travel
};`;

export const SHADER = /* wgsl */`
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

// 1120-byte uniform layout (280 f32; carefully aligned for WGSL std140-ish rules).
// Offsets are documented in JS-side writeUniforms() at the matching index.
${PARAMS_STRUCT}

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var texA: texture_2d<f32>;
@group(0) @binding(2) var texB: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var advState: texture_2d<f32>;
@group(0) @binding(5) var texT: texture_2d<f32>;
@group(0) @binding(6) var texRegions: texture_2d<f32>;
@group(0) @binding(7) var texTexture: texture_2d<f32>;
@group(0) @binding(8) var texLut: texture_2d<f32>;

fn texFitUV(uv: vec2f) -> vec2f {
  // texFit: 0 = stretch (fill, distort), 1 = contain (fit inside, letterbox),
  // 2 = cover (fill, crop). Aspect-correct using canvas vs texture aspect.
  if (p.texFit == 0u) { return uv; }
  let cAR = p.canvasAspect;
  let tAR = p.texAspect;
  var u = uv;
  if (p.texFit == 2u) {            // cover — contract to a centred sub-rect
    if (tAR > cAR) { u.x = (uv.x - 0.5) * (cAR / tAR) + 0.5; }
    else           { u.y = (uv.y - 0.5) * (tAR / cAR) + 0.5; }
  } else {                          // contain — expand past edges (letterbox)
    if (tAR > cAR) { u.y = (uv.y - 0.5) * (tAR / cAR) + 0.5; }
    else           { u.x = (uv.x - 0.5) * (cAR / tAR) + 0.5; }
  }
  return u;
}
fn texFitLuma(uv: vec2f) -> f32 {
  let u = texFitUV(uv);
  // Outside [0,1] only happens for 'contain' letterbox → neutral 0.5 (no effect).
  if (u.x < 0.0 || u.x > 1.0 || u.y < 0.0 || u.y > 1.0) { return 0.5; }
  return luma(textureSampleLevel(texTexture, samp, u, 0.0).rgb);
}

@vertex fn vs(@builtin(vertex_index) idx: u32) -> VSOut {
  // 6-vertex fullscreen triangle pair, with UV in [0,1] (y up to match WebGL).
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  );
  var out: VSOut;
  out.pos = vec4f(positions[idx], 0.0, 1.0);
  out.uv = uvs[idx];
  return out;
}

fn applyCurve(x: f32, mode: u32) -> f32 {
  let c = clamp(x, 0.0, 1.0);
  if (mode == 1u) { return c * c * (3.0 - 2.0 * c); }     // ease-in-out
  if (mode == 2u) { return c * c; }                        // ease-in
  if (mode == 3u) { return 1.0 - (1.0 - c) * (1.0 - c); }  // ease-out
  return c;
}

fn hash21(q: vec2f) -> f32 {
  var x = fract(q * vec2f(123.34, 456.21));
  x += dot(x, x + 45.32);
  return fract(x.x * x.y);
}
fn vnoise(q: vec2f) -> f32 {
  let i = floor(q);
  let f = fract(q);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(q: vec2f) -> f32 {
  var v = 0.0;
  var amp = 0.5;
  var pp = q;
  for (var i = 0; i < 5; i = i + 1) {
    v += amp * vnoise(pp);
    pp *= 2.03;
    amp *= 0.5;
  }
  return v;
}
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
// Global grade applied to the final matte value: levels (black/white/gamma) then
// brightness + contrast. Identity at defaults (black 0, white 1, gamma 1, others 0).
fn grade1(x: f32) -> f32 {
  var v = clamp((x - p.gradeBlack) / max(0.001, p.gradeWhite - p.gradeBlack), 0.0, 1.0);
  v = pow(v, 1.0 / max(0.05, p.gradeGamma));
  v = (v - 0.5) * (1.0 + p.gradeContrast) + 0.5 + p.gradeBright;
  return clamp(v, 0.0, 1.0);
}
// 3D value noise + fbm, for the raymarched volumetric fog (mode 52). Marching a
// true 3D field is what gives volumetric depth + self-shadowing vs. stacked 2D.
fn hash31(q: vec3f) -> f32 {
  var p3 = fract(q * 0.1031);
  p3 = p3 + dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
fn vnoise3(q: vec3f) -> f32 {
  let i = floor(q);
  let f = fract(q);
  let u = f * f * (3.0 - 2.0 * f);
  let x00 = mix(hash31(i + vec3f(0.0,0.0,0.0)), hash31(i + vec3f(1.0,0.0,0.0)), u.x);
  let x10 = mix(hash31(i + vec3f(0.0,1.0,0.0)), hash31(i + vec3f(1.0,1.0,0.0)), u.x);
  let x01 = mix(hash31(i + vec3f(0.0,0.0,1.0)), hash31(i + vec3f(1.0,0.0,1.0)), u.x);
  let x11 = mix(hash31(i + vec3f(0.0,1.0,1.0)), hash31(i + vec3f(1.0,1.0,1.0)), u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
}
fn fbm3(q: vec3f) -> f32 {
  var v = 0.0; var amp = 0.5; var pp = q;
  for (var i = 0; i < 4; i = i + 1) {
    v = v + amp * vnoise3(pp);
    pp = pp * 2.02; amp = amp * 0.5;
  }
  return v;
}

// ---- ambient/lingering matte generators (loop over t; organic, never white) ----
fn ambPointBias(uv: vec2f, field: f32) -> f32 {
  // When 1..8 start-points are placed, concentrate the ambient field near them:
  // a smooth distance falloff (aspect-correct) multiplies the field, so the
  // pattern clusters around clicks and fades elsewhere. No points -> unchanged.
  if (p.originCount == 0u || p.originCount >= 200u) { return field; }
  let diag = sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  var nearest = 1.0;
  for (var i = 0u; i < 8u; i = i + 1u) {
    if (i >= p.originCount) { break; }
    var duv = uv - p.originPts[i].xy;
    duv.x = duv.x * p.canvasAspect;
    nearest = min(nearest, length(duv) / (0.5 * diag));
  }
  // reach scales with ambSize so bigger fields spread wider from each point
  let reach = mix(0.22, 0.7, p.ambSize);
  // sharp pull: full strength right at a point, a gentle curve, and a 0.3 floor
  // far away so the field still reads (instead of crushing to black).
  let w = pow(1.0 - smoothstep(0.0, reach, nearest), 1.6);  // 1 at point -> 0 past reach
  return field * mix(0.3, 1.55, w);                          // boost near, dim (not kill) far
}
fn ambBokeh(uv: vec2f) -> f32 {
  let ph = p.t * 6.2831853;
  var auv = uv; auv.x = auv.x * p.canvasAspect;
  let dir = vec2f(cos(p.driftAngle * 6.2831853), sin(p.driftAngle * 6.2831853));
  let dd = dir * p.driftAmount;
  let count = u32(mix(6.0, 40.0, p.ambCount));
  let szMul = mix(0.45, 1.8, p.ambSize);
  let travel = (0.05 + p.ambSpeed * 0.4) * p.t;          // slow net drift over the loop
  // soft defocused light field underneath, drifting slowly
  var v = fbm(uv * 2.2 + dd * travel * 0.6) * 0.3;
  for (var i = 0u; i < 40u; i = i + 1u) {
    if (i >= count) { break; }
    let fi = f32(i) + 1.0;
    let phase = hash21(vec2f(fi, 6.6)) * 6.2831853;
    // tiny slow breathing wobble (1 cycle) + net directional drift, wrapped
    let wob = 0.02 * vec2f(sin(ph + phase), cos(ph + phase * 1.3));
    var c = fract(vec2f(hash21(vec2f(fi, 3.7)), hash21(vec2f(fi, 9.1))) + wob + dd * travel);
    // fade near the frame edges so the wrap is invisible -> smooth directional flow
    let efade = smoothstep(0.0, 0.1, c.x) * smoothstep(1.0, 0.9, c.x)
              * smoothstep(0.0, 0.1, c.y) * smoothstep(1.0, 0.9, c.y);
    c.x = c.x * p.canvasAspect;
    let d = length(auv - c);
    let r = mix(0.03, 0.22, hash21(vec2f(fi, 5.5))) * szMul;       // size / focus variation
    let soft = mix(0.6, 0.04, hash21(vec2f(fi, 8.8)) * (0.4 + 0.6 * p.ambSoft));  // edge softness
    let disc = smoothstep(r, r * soft, d);
    let rim = exp(-pow((d - r) / (r * 0.3 + 0.004), 2.0)) * 0.5;  // defocused bokeh rim
    let bright = 0.55 + 0.45 * (0.5 + 0.5 * sin(ph + phase * 2.0));  // slow twinkle, never off
    v = v + (disc + rim) * bright * efade * mix(0.4, 1.0, hash21(vec2f(fi, 1.1)));
  }
  // foliage: slow dark leaf shapes drifting across, so the glare reads as seen
  // THROUGH trees (dappled occlusion)
  let foliage = mix(1.0, smoothstep(0.28, 0.72, fbm(uv * 4.0 + dd * travel * 0.8 + 2.0)), 0.5);
  var m = v * foliage;
  if (p.ambDetail > 0.001) {                                  // fine sparkle on lit bokeh + finer leaf breakup
    let spark = fbm(auv * mix(16.0, 46.0, p.ambDetail) + ph * 0.15) - 0.5;
    let leaf  = smoothstep(0.35, 0.65, fbm(uv * mix(9.0, 22.0, p.ambDetail) + 7.0));
    m = m * (1.0 + spark * p.ambDetail * 0.9) * mix(1.0, leaf, p.ambDetail * 0.35);
  }
  return clamp(m, 0.0, 1.0);
}
fn ambStreaks(uv: vec2f) -> f32 {
  let ph = p.t * 6.2831853;
  // driftAngle sets the streak orientation/direction: 0 = left<->right, 0.25 = up<->down
  let a = p.driftAngle * 6.2831853;
  let dir = vec2f(cos(a), sin(a));
  let perp = vec2f(-dir.y, dir.x);
  var pp = uv; pp.x = pp.x * p.canvasAspect;
  let across = dot(pp, perp);
  let along  = dot(pp, dir);
  // movement direction (streakMove) is independent of the line orientation (driftAngle):
  // project a movement vector onto the across/along axes so vertical lines can slide sideways.
  let speed = ph * (0.04 + p.ambSpeed * 0.22);
  let mvA = p.streakMove * 6.2831853;
  let moveV = vec2f(cos(mvA), sin(mvA)) * speed;
  let dAcross = dot(moveV, perp) * 4.0;
  let dAlong  = dot(moveV, dir);
  let sc = vec2f(across * mix(3.5, 11.0, p.ambCount) + dAcross, along * mix(1.4, 0.7, p.ambSize) + dAlong);
  var s = fbm(sc) + 0.55 * fbm(sc * vec2f(2.2, 1.0) + vec2f(0.0, dAlong));
  s = pow(clamp((s - 0.45) * 1.9, 0.0, 1.0), mix(2.6, 0.9, p.ambSoft));  // sharpen->soften
  let smear = (fbm(sc + vec2f(0.0, 0.05)) + fbm(sc - vec2f(0.0, 0.05))) * 0.12;
  var m = s + smear;
  if (p.ambDetail > 0.001) {                                  // fine striations within the streaks
    let fineSc = vec2f(across * mix(14.0, 40.0, p.ambDetail), along * mix(2.0, 1.0, p.ambSize) + dAlong * 1.7);
    m = m * (1.0 + (fbm(fineSc) - 0.5) * p.ambDetail * 0.7);
  }
  return clamp(m, 0.0, 1.0);
}
fn ambBlooms(uv: vec2f) -> f32 {
  // Ambient organic blooms: soft domain-warped fbm patches that bloom open and
  // breathe, looping seamlessly over t (circular drift so t=0 == t=1). Stays
  // organic and never quite reaches full white — a lingering ambient matte.
  let ph = p.t * 6.2831853;
  var auv = uv; auv.x = auv.x * p.canvasAspect;
  let sc = mix(1.4, 4.5, p.ambSize);                  // bloom scale (size)
  let amp = 0.12 + p.ambSpeed * 0.5;
  let drift = vec2f(sin(ph), cos(ph)) * amp;          // seamless looping drift
  let warp = mix(0.6, 2.2, p.ambCount);               // density / turbulence of blooms
  let q = vec2f(fbm(auv * sc + drift + p.seed * 0.11),
                fbm(auv * sc + vec2f(5.2, 1.3) - drift + p.seed * 0.11)) - vec2f(0.5, 0.5);
  var v = fbm(auv * sc + q * warp + p.seed * 0.07);
  // soft bloom shaping: patches open / breathe; ambSoft widens the wet falloff
  v = smoothstep(mix(0.55, 0.30, p.ambSoft), mix(0.78, 0.92, p.ambSoft), v);
  if (p.ambDetail > 0.001) {                          // fine granulation inside the blooms
    let g = fbm(auv * mix(8.0, 26.0, p.ambDetail) + ph * 0.1) - 0.5;
    v = v * (1.0 + g * p.ambDetail * 0.7);
  }
  return clamp(v * 0.92, 0.0, 1.0);
}
fn ambRipples(uv: vec2f) -> f32 {
  let ph = p.t * 6.2831853 * (0.3 + p.ambSpeed * 0.9);   // slower base speed
  var auv = uv; auv.x = auv.x * p.canvasAspect;
  let w = vec2f(fbm(auv * 3.0 + ph * 0.06), fbm(auv * 3.0 + 5.0 - ph * 0.05)) - vec2f(0.5, 0.5);
  // placed points become ripple sources; with none placed, count sets how many
  // procedural sources there are.
  let useClicked = p.originCount > 0u && p.originCount < 200u;
  let nsrc = select(u32(mix(1.0, 6.0, p.ambCount) + 0.5), min(6u, p.originCount), useClicked);
  var v = 0.0;
  for (var i = 0u; i < 6u; i = i + 1u) {
    if (i >= nsrc) { break; }
    let fi = f32(i) + 1.0;
    var c = vec2f(hash21(vec2f(fi, 1.3)), hash21(vec2f(fi, 4.8)));
    if (useClicked) { c = p.originPts[i].xy; }    // placed point as a ripple source
    c.x = c.x * p.canvasAspect;
    let d = length(auv + w * 0.14 - c);
    let freq = mix(26.0, 9.0, p.ambSize) + fi * 3.0;
    let ring = sin(d * freq - ph * (1.0 + fi * 0.2)) * exp(-d * 1.7);           // outward, decaying
    let fine = sin(d * freq * 2.7 - ph * (1.6 + fi * 0.2)) * exp(-d * 2.2);     // finer concentric rings
    v = v + 0.5 + 0.5 * (ring + fine * p.ambDetail * 0.5);
  }
  var m = pow(clamp(v / f32(nsrc), 0.0, 1.0), mix(2.6, 1.1, p.ambSoft));        // caustic sharp->soft
  if (p.ambDetail > 0.001) {                                                    // water-surface micro detail (keeps blacks)
    let g = fbm(auv * mix(14.0, 42.0, p.ambDetail) + ph * 0.2) - 0.5;
    m = m * (1.0 + g * p.ambDetail * 0.8);
  }
  return clamp(m, 0.0, 1.0);
}
fn ambAurora(uv: vec2f) -> f32 {
  let ph = p.t * 6.2831853 * (0.4 + p.auroraSpeed * 1.4);
  let x = uv.x * p.canvasAspect;                 // aspect-consistent horizontal
  let dens = mix(0.8, 3.2, p.auroraDensity);
  let reach = mix(5.5, 1.6, p.auroraHeight);     // smaller = rays reach higher
  var v = 0.0;
  // a few overlapping curtain layers at different depths and drift speeds
  for (var i = 0u; i < 3u; i = i + 1u) {
    let fi = f32(i) + 1.0;
    let drift = ph * (0.04 + 0.03 * fi);
    // soft, irregular lit clusters along x (not evenly spaced)
    let cluster = pow(clamp(fbm(vec2f(x * dens * (0.6 + 0.3 * fi) + drift, ph * 0.1 + fi * 3.0)), 0.0, 1.0), 1.4);
    // fine wavering vertical ray striations
    let waver = fbm(vec2f(x * 4.0 + drift, ph * 0.2 + fi)) * 6.0;
    let rays = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(x * (12.0 + 5.0 * fi) + waver), 2.2);
    // wavy base height; rays shoot UP from it (uv.y is y-down) and fade
    let base = 0.6 + 0.18 * fbm(vec2f(x * 1.4 + drift, 7.0 + fi));
    let up = clamp(base - uv.y, 0.0, 1.0);
    let env = exp(-up * reach) * smoothstep(base + 0.12, base - 0.03, uv.y) * smoothstep(0.0, 0.12, uv.y);
    v = v + cluster * mix(0.5, 1.0, rays) * env * (0.7 + 0.3 * sin(ph * 1.1 + x * 2.0 + fi * 2.0));
  }
  // a broad brightness wave of borealis travelling sideways through the curtains
  let wave = 0.5 + 0.5 * sin(x * 0.55 - ph * 0.7 + fbm(vec2f(x * 0.4, ph * 0.1)) * 3.5);
  v = v * mix(1.0, wave, p.auroraWave);
  v = clamp(v * 1.5, 0.0, 1.0);
  // darkness: deepen the gaps and boost contrast for more variance
  v = pow(v, 1.0 + p.auroraDark * 3.0);
  return v;
}
fn ambGlare(uv: vec2f) -> f32 {
  let ph = p.t * 6.2831853;
  var sun = vec2f(p.sunX, p.sunY);                       // sun position set by sliders
  sun = sun + vec2f(0.04 * sin(ph * 0.5), 0.03 * cos(ph * 0.4));
  var duv = uv - sun; duv.x = duv.x * p.canvasAspect;
  let d = length(duv);
  let ang = atan2(duv.y, duv.x);
  let nrays = mix(4.0, 16.0, p.ambCount);          // ray count
  let rays0 = 0.5 + 0.5 * sin(ang * nrays + ph * (0.5 + p.ambSpeed)) * (fbm(vec2f(ang * 2.0, ph * 0.3) + 3.0) + 0.4);
  let rays = rays0 + 0.5 * sin(ang * nrays * 3.0 + ph) * p.ambDetail * 0.4;   // finer ray striations
  let core = exp(-d * mix(6.0, 2.0, p.ambSize));   // bigger size -> wider core
  let dust = (fbm(duv * mix(110.0, 290.0, p.ambDetail) + ph * 0.25) - 0.5) * p.ambDetail * 0.7;  // atmospheric shimmer
  let halo = exp(-d * mix(2.0, 0.7, p.ambSize)) * (0.4 + 0.6 * mix(rays, 1.0, p.ambSoft)) * (1.0 + dust);  // soft -> less rayed
  let foliage = smoothstep(0.3, 0.72, fbm(uv * 5.0 + vec2f(ph * 0.1, -ph * 0.15)));
  return clamp((core + halo) * mix(0.45, 1.0, foliage), 0.0, 1.0);
}
fn ambGodrays(uv: vec2f) -> f32 {
  // light shafts fanning down from a high sun, broken by drifting cloud gaps
  let ph = p.t * 6.2831853;
  var sun = vec2f(p.sunX, p.sunY);                            // sun position set by sliders
  var d = uv - sun; d.x = d.x * p.canvasAspect;
  let ang = atan2(d.x, d.y);                  // 0 = straight down from the sun
  let dist = length(d);
  let drift = ph * (0.03 + p.driftAmount * 0.1);
  // beam size: fewer/wider at low gdBeams, many/thin at high
  let beams = pow(clamp(fbm(vec2f(ang * mix(4.0, 11.0, p.gdBeams) + drift, ph * 0.05)) * 1.5, 0.0, 1.0), 1.8);
  // cloud break-through: higher gdCloud lowers the gap threshold so more light passes
  let gaps  = smoothstep(mix(0.55, 0.18, p.gdCloud), 0.85, fbm(vec2f(ang * 3.0 + drift, dist * 2.0 + 1.0)));
  // dappled foliage / tree-canopy breakup (finer, scrolling)
  let foliage = smoothstep(0.35, 0.78, fbm(uv * 9.0 + vec2f(drift, ph * 0.04)));
  let fade  = exp(-dist * 1.0) * mix(0.55, 1.0, foliage);   // brighter near the sun, fading down
  // pulse: the light grows in and out / more & less intense over the loop
  let pulse = mix(1.0, 0.35 + 0.65 * (0.5 + 0.5 * sin(ph + fbm(vec2f(ph * 0.2, 3.0)) * 3.0)), p.gdPulse);
  // footage occluder: with a clip loaded, light streams through ITS bright gaps
  // instead of procedural clouds — "light through your footage" (blinds, leaves,
  // a window, a crowd…). March toward the sun accumulating footage openness so
  // the beams emanate from the gaps; gdCloud lifts the gap threshold.
  if (p.footageMask > 0.5) {
    let drff = (vec2f(sin(ph * 0.7), cos(ph * 0.5))) * 0.02 * p.foliageDrift;
    var shaft = 0.0;
    for (var i = 1; i <= 6; i = i + 1) {
      let tt = f32(i) / 7.0;
      let sp = mix(uv, sun, tt * 0.9) + drff;
      shaft = shaft + smoothstep(mix(0.42, 0.12, p.gdCloud), 0.8, luma(textureSampleLevel(texT, samp, sp, 0.0).rgb));
    }
    shaft = shaft / 6.0;
    return clamp((beams * shaft + 0.06) * fade * 2.3 * mix(0.4, 1.6, p.gdIntensity) * pulse, 0.0, 1.0);
  }
  return clamp((beams * gaps + 0.1) * fade * 2.3 * mix(0.4, 1.6, p.gdIntensity) * pulse, 0.0, 1.0);
}
fn ambFootageMatte(uv: vec2f) -> f32 {
  // Footage -> matte stylizer (mode 62): turn ANY loaded clip into a clean B/W
  // luma matte for AE. ambSoft = key contrast, ambSize = glow radius,
  // ambCount = glow strength, ambDetail = edge-detect mix. The global
  // levels/invert grade applies on top for final trimming.
  if (p.footageMask < 0.5) {
    // no clip yet: a dim drifting hatch so the mode reads as "waiting for
    // footage" and never renders blank.
    let h = 0.5 + 0.5 * sin((uv.x + uv.y) * 60.0 + p.t * 6.2831853);
    return 0.08 + 0.10 * h;
  }
  let r = mix(0.002, 0.05, p.ambSize);
  let l = luma(textureSampleLevel(texT, samp, uv, 0.0).rgb);
  // glow: 8-tap ring blur of luminance -> soft bright halo (bloom)
  let r2 = r * 0.7071;
  var glow = luma(textureSampleLevel(texT, samp, uv + vec2f(r, 0.0), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv - vec2f(r, 0.0), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv + vec2f(0.0, r), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv - vec2f(0.0, r), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv + vec2f(r2, r2), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv + vec2f(-r2, r2), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv + vec2f(r2, -r2), 0.0).rgb)
           + luma(textureSampleLevel(texT, samp, uv + vec2f(-r2, -r2), 0.0).rgb);
  glow = glow / 8.0;
  let base = max(l, glow * p.ambCount);                  // bloom adds a bright halo
  // contrast key around mid: soft gradient -> hard threshold
  let key = clamp((base - 0.5) * mix(1.0, 8.0, p.ambSoft) + 0.5, 0.0, 1.0);
  // edge detect (central differences) — optional structural outline
  let ex = luma(textureSampleLevel(texT, samp, uv + vec2f(r, 0.0), 0.0).rgb)
         - luma(textureSampleLevel(texT, samp, uv - vec2f(r, 0.0), 0.0).rgb);
  let ey = luma(textureSampleLevel(texT, samp, uv + vec2f(0.0, r), 0.0).rgb)
         - luma(textureSampleLevel(texT, samp, uv - vec2f(0.0, r), 0.0).rgb);
  let edge = clamp(length(vec2f(ex, ey)) * 5.0, 0.0, 1.0);
  return clamp(mix(key, max(key, edge), p.ambDetail), 0.0, 1.0);
}
fn ambClouds(uv: vec2f) -> f32 {
  // drifting volumetric clouds: domain-warped fbm blown along a wind direction.
  // reuses ambient params: count=coverage, size=scale, soft=edge, speed=wind, detail=wisps.
  let ph = p.t * 6.2831853;
  var auv = uv; auv.x = auv.x * p.canvasAspect;
  let a = p.driftAngle * 6.2831853;
  let dir = vec2f(cos(a), sin(a));
  let drift = dir * ph * (0.04 + p.ambSpeed * 0.5);          // wind travel
  let sc = mix(1.3, 5.0, p.ambSize);                         // cloud scale
  let w = vec2f(fbm(auv * sc * 0.5 + drift * 0.7 + 11.0),
                fbm(auv * sc * 0.5 - drift * 0.6 + 23.0)) - vec2f(0.5);
  var c = fbm(auv * sc + w * 0.8 + drift);                   // billowing base
  c = c + (fbm(auv * sc * 2.3 + w + drift * 1.7) - 0.5) * mix(0.12, 0.55, p.ambDetail);  // wisps
  let cov = mix(0.64, 0.16, p.ambCount);                     // low=sparse, high=overcast
  let soft = mix(0.05, 0.45, p.ambSoft);
  return clamp(smoothstep(cov, cov + soft, c), 0.0, 1.0);
}
fn ambCaustics(uv: vec2f) -> f32 {
  // water-surface caustic web: domain-warped ridged noise that flows + glimmers.
  let ph = p.t * 6.2831853 * (0.25 + p.ambSpeed * 0.6);
  var q = uv; q.x = q.x * p.canvasAspect;
  let a = p.driftAngle * 6.2831853;
  let wind = vec2f(cos(a), sin(a)) * ph * 0.15 * p.driftAmount;
  var s = q * mix(3.5, 12.0, p.ambSize) + wind;
  let w = vec2f(fbm(s * 0.6 + ph * 0.1), fbm(s * 0.6 + 5.2 - ph * 0.08)) - vec2f(0.5);
  s = s + w * 1.5;
  var v = 0.0; var amp = 0.6; var fr = 1.0;
  for (var i = 0; i < 3; i = i + 1) {
    let n = vnoise(s * fr + ph * (0.2 + 0.1 * f32(i)));
    v = v + amp * (1.0 - abs(2.0 * n - 1.0));
    fr = fr * 2.1; amp = amp * 0.55;
  }
  v = pow(clamp(v, 0.0, 1.0), mix(3.0, 1.0, p.ambSoft));
  let glim = (fbm(s * 6.0 + ph * 0.6) - 0.5) * p.ambDetail * 0.9;
  return clamp(v * (1.0 + glim), 0.0, 1.0);
}
fn caus2_cell(pt: vec2f, ph: f32) -> vec2f {
  // nearest (F1) and second-nearest (F2) distances to animated feature points.
  // Each point orbits inside its cell so the equidistant borders ripple like a
  // moving water surface — that border motion is what reads as living caustics.
  let n = floor(pt); let f = fract(pt);
  var f1 = 9.0; var f2 = 9.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let g = vec2f(f32(i), f32(j));
      let h = hash22(n + g);
      let o = vec2f(0.5) + vec2f(0.42) * sin(ph + h * 6.2831853 + vec2f(0.0, 1.7));
      let r = g + o - f;
      let d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return vec2f(sqrt(f1), sqrt(f2));
}
fn ambCaustics2(uv: vec2f) -> f32 {
  // Voronoi light-net caustics: bright threads where refracted rays bunch along
  // moving cell borders — the sharp polygonal net you see on a sunlit pool floor.
  // Distinct from mode 41 (soft ridged-noise webbing); this is crisp + nodal.
  let ph = p.t * 6.2831853 * (0.15 + p.ambSpeed * 0.7);
  var q = uv; q.x = q.x * p.canvasAspect;
  let a = p.driftAngle * 6.2831853;
  let wind = vec2f(cos(a), sin(a)) * ph * 0.12 * p.driftAmount;
  let sc = mix(4.0, 14.0, p.ambSize);
  // gentle domain warp so the net flows instead of sitting on a rigid lattice
  let warp = vec2f(fbm(q * sc * 0.5 + ph * 0.1), fbm(q * sc * 0.5 + 9.1 - ph * 0.08)) - vec2f(0.5);
  let base = q * sc + wind + warp * 0.8;
  let c0 = caus2_cell(base, ph);                 // coarse net
  let c1 = caus2_cell(base * 2.3 + 3.1, ph * 1.4); // fine net
  // border distance F2-F1 is small on cell edges -> bright threads. ambSoft maps
  // thread width: soft (wide glow) -> thin (sharp filament).
  let w0 = mix(0.18, 0.045, p.ambSoft);
  let net0 = 1.0 - smoothstep(0.0, w0, c0.y - c0.x);
  let net1 = 1.0 - smoothstep(0.0, w0 * 0.7, c1.y - c1.x);
  // product term brightens the nodes where coarse + fine borders cross
  var v = net0 * 0.7 + net1 * 0.45 + net0 * net1 * 0.7;
  v = pow(clamp(v, 0.0, 1.0), mix(1.5, 0.7, p.ambSoft));
  let glint = pow(net0 * net1, 3.0) * p.ambDetail * 0.85;  // sparkle on the crossings
  return clamp(v + glint, 0.0, 1.0);
}
fn ambEmbers(uv: vec2f) -> f32 {
  // drifting glowing motes (embers / fireflies): rise + twinkle, soft glow.
  let ph = p.t * 6.2831853;
  var q = uv; q.x = q.x * p.canvasAspect;
  let count = u32(mix(10.0, 60.0, p.ambCount));
  let a = p.driftAngle * 6.2831853;
  let dir = vec2f(cos(a), sin(a));
  var v = 0.0;
  for (var i = 0u; i < 60u; i = i + 1u) {
    if (i >= count) { break; }
    let fi = f32(i) + 1.0;
    let speed = 0.3 + 0.7 * hash21(vec2f(fi, 2.1));
    let base = vec2f(hash21(vec2f(fi, 1.3)), hash21(vec2f(fi, 7.7)));
    var c = fract(base + dir * ph * 0.04 * speed * p.driftAmount
                + vec2f(0.0, -ph * 0.05 * speed)
                + 0.02 * vec2f(sin(ph * speed * 2.0 + fi), cos(ph * speed * 1.7 + fi)));
    let efade = smoothstep(0.0, 0.08, c.x) * smoothstep(1.0, 0.92, c.x)
              * smoothstep(0.0, 0.08, c.y) * smoothstep(1.0, 0.92, c.y);
    c.x = c.x * p.canvasAspect;
    let d = length(q - c);
    let r = mix(0.004, 0.02, hash21(vec2f(fi, 5.5))) * mix(0.6, 1.6, p.ambSize);
    let tw = 0.5 + 0.5 * sin(ph * (1.5 + speed * 3.0) + fi * 2.0);
    let core = exp(-d * d / (r * r));
    let glow = exp(-d / (r * 4.0 + 0.002)) * (0.2 + 0.2 * p.ambDetail);
    v = v + (core * 1.3 + glow * 1.4) * mix(0.45, 1.0, tw) * efade;
  }
  return clamp(v, 0.0, 1.0);
}
fn ambMist(uv: vec2f) -> f32 {
  // slow low-lying fog: parallax fbm layers sliding on the wind.
  let ph = p.t * 6.2831853 * (0.15 + p.ambSpeed * 0.4);
  var q = uv; q.x = q.x * p.canvasAspect;
  let a = p.driftAngle * 6.2831853;
  let wind = vec2f(cos(a), sin(a));
  let sc = mix(1.2, 4.0, p.ambSize);
  var v = 0.0; var amp = 0.55;
  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i);
    let off = wind * ph * (0.1 + 0.08 * fi) + vec2f(0.0, fi * 3.3);
    let w = vec2f(fbm(q * sc * 0.5 + off), fbm(q * sc * 0.5 + off + 5.0)) - vec2f(0.5);
    v = v + amp * fbm(q * sc * (1.0 + fi * 0.6) + w * 0.8 + off);
    amp = amp * 0.6;
  }
  let cov = mix(0.7, 0.25, p.ambCount);
  v = smoothstep(cov, cov + mix(0.05, 0.4, p.ambSoft), v);
  v = v * (1.0 + (fbm(q * sc * 4.0 + ph) - 0.5) * p.ambDetail * 0.4);
  return clamp(v, 0.0, 1.0);
}
fn ambSmoke(uv: vec2f) -> f32 {
  // Volumetric smoke / fog. Real rolling fog comes from PARALLAX: several noise
  // layers drifting along the wind at different speeds + scales, summed — that
  // depth-cued sliding is what reads as a fog bank rolling through, vs. one flat
  // sheet. driftAmount morphs the whole look: 0 = low-lying fog rolling in from a
  // direction, 1 = a turbulent rising plume.
  //   driftAngle  = direction the fog comes FROM (denser on that side, thinning
  //                 across the frame so the bank reads as travelling)
  //   flow        = how fast it rolls across      turbulence = billow / curl
  //   undulate    = slow sideways sway            ambSpeed   = in-place churn rate
  //   ambSize     = scale   ambSoft = edge softness   ambCount = coverage/density
  let rise = clamp(p.driftAmount, 0.0, 1.0);                 // 0 fog .. 1 plume
  var q = uv; q.x = q.x * p.canvasAspect;
  let sc = mix(1.0, 4.0, p.ambSize);

  let a = p.driftAngle * 6.2831853;
  let windDir = vec2f(cos(a), sin(a));                       // toward driftAngle
  let perp = vec2f(-windDir.y, windDir.x);
  let churn = p.t * 6.2831853 * (0.05 + p.ambSpeed * 0.4);   // in-place morph
  // drift travels across the frame; a plume also lifts upward (y=0 is up).
  let drift = windDir * (p.t * 6.2831853) * (0.04 + p.flow * 0.5)
            + vec2f(0.0, (p.t * 6.2831853) * 0.4 * rise);

  // anisotropy: fog = wide horizontal banks, plume = tall vertical columns.
  var s = q * sc;
  s.x = s.x * mix(0.45, 1.0, rise);
  s.y = s.y / mix(1.0, 2.3, rise);

  // slow sway perpendicular to the wind, and a shared billowing warp field whose
  // strength is driven by the turbulence param (the curl that makes it churn).
  let und = perp * sin(dot(q, perp) * 2.0 + churn * 1.3) * (p.undulate * 0.5);
  let warpAmt = mix(0.35, 1.0, p.ambDetail) + p.turbulence * 1.6;
  let wf = vec2f(fbm(s * 0.6 + churn * 0.12 + 3.0),
                 fbm(s * 0.6 - churn * 0.09 + 8.0)) - vec2f(0.5);
  // rotating the warp 90 degrees yields a swirling, divergence-free-ish eddy
  // field, so the layers curl around vortices instead of sliding straight.
  let swirl = vec2f(-wf.y, wf.x) * (0.4 + p.turbulence * 1.4);

  // parallax depth layers — the heart of the rolling-fog motion. Each layer is
  // decorrelated (own scale, drift speed, time phase and swirl share) so the
  // depth feels independent rather than a rigid stack.
  var dens = 0.0; var amp = 0.6; var wsum = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i);
    let ls = s * (1.0 + fi * 0.6) + drift * (0.5 + fi * 0.6) + und
           + wf * warpAmt + swirl * (0.5 + fi * 0.4)
           + vec2f(fi * 4.7, fi * 2.3) + vec2f(0.0, fi * churn * 0.35);
    dens = dens + amp * fbm(ls);
    wsum = wsum + amp; amp = amp * 0.55;
  }
  dens = dens / wsum;
  // erode the edges with a finer octave so boundaries fray into wisps/tendrils
  // instead of reading as smooth blobs.
  let detail = fbm(s * 3.4 + drift * 1.6 + churn * 0.25 + 17.0);
  dens = dens - (1.0 - detail) * mix(0.02, 0.2, p.ambDetail);

  // directional bank: denser toward the source side, thinning downwind, so the
  // fog clearly comes FROM driftAngle. Disabled for the plume.
  let along = dot(uv - vec2f(0.5, 0.5), windDir);
  dens = dens + mix(0.45, 0.0, rise) * along;

  // fog = soft, low-contrast, semi-transparent; plume = denser & punchier.
  let cov = mix(0.52, 0.18, p.ambCount);
  let soft = mix(0.18, 0.5, p.ambSoft) * mix(1.7, 1.0, rise);
  var v = smoothstep(cov - 0.5 * soft, cov + soft, dens);
  // vertical profile: fog lies low (denser toward the bottom, y=1); plume
  // dissipates toward the top (y=0).
  let lowlying = mix(0.6, 1.0, smoothstep(-0.1, 1.0, uv.y));
  v = v * mix(lowlying, smoothstep(-0.05, 0.8, uv.y), rise);
  v = v * mix(0.82, 1.0, rise);                             // thin the fog (translucent)
  return clamp(v, 0.0, 1.0);
}
fn ambFire(uv: vec2f) -> f32 {
  // Rising flames: the smoke field cranked hot — strong upward buoyancy, vertical
  // tongue stretch, fast flicker, density concentrated at the base and licking up.
  // Returns 0..1 heat intensity (white-hot matte); pair with a fire gradient LUT
  // for the black->red->orange->white colour ramp on screen.
  // Extra movement params (active for mode 51): flow = rise speed / reach,
  // turbulence = curl/lick strength, undulate = side-to-side sway. ambSoft now
  // spans crisp tongues all the way to a soft luminous glow.
  let riseSpd = 0.6 + p.flow * 1.9;
  let ph = p.t * 6.2831853 * (0.5 + p.ambSpeed * 1.5);
  var q = uv; q.x = q.x * p.canvasAspect;
  let sc = mix(1.0, 6.0, p.ambSize);                       // wider scale range
  let h = uv.y;                                            // 0 top .. 1 bottom (base)

  // Narrow, TALL tongues: high frequency across x (so flames separate into
  // individual licks) and low frequency in y (tall vertical streaks), advected up.
  let sway = sin(uv.y * 6.0 + ph * 1.5) * p.undulate * 0.2;
  var s = vec2f((q.x + sway) * sc * 1.9, q.y * sc * 0.55) + vec2f(0.0, ph * riseSpd);
  // curl warp + a finer octave so each tongue licks and shimmers organically.
  let curl = mix(0.3, 2.6, p.turbulence);
  let w1 = vec2f(fbm(s * 1.2 + vec2f(0.0, ph * 0.5)),
                 fbm(s * 1.2 + vec2f(4.0, ph * 0.6))) - vec2f(0.5);
  let sw = s + w1 * curl * mix(0.5, 1.2, p.ambDetail);
  var flame = fbm(sw) + 0.5 * fbm(sw * 2.3 + vec2f(0.0, ph * 1.3));
  flame = flame / 1.5;

  // Classic flame shaping: subtract a ramp that GROWS with height, so the turbulent
  // body thins into sparse, tapering tongues that die out toward the top (bright
  // licks on black, not a slab). Then re-anchor a thin luminous base where the fire
  // is rooted at the very bottom.
  let upB = 1.0 - h;                                       // 0 base .. 1 top
  var d = flame - upB * mix(0.45, 0.95, 1.0 - p.ambCount);
  d = d + (1.0 - smoothstep(0.0, 0.32, upB)) * 0.32;       // hot base, softly faded
  let cov = mix(0.36, 0.2, p.ambCount);
  let soft = mix(0.015, 0.6, p.ambSoft);                  // MUCH wider: crisp → soft glow
  var v = smoothstep(cov, cov + soft, d);
  // organic flicker that scrolls upward like heat (fbm, not a clean wave → no bands)
  v = v * (0.78 + 0.34 * fbm(q * 5.0 + vec2f(0.0, ph * 2.2)));
  return clamp(v, 0.0, 1.0);
}
fn ambVolFog(uv: vec2f) -> f32 {
  // FOG 2 — raymarched volumetric fog. For each pixel we march a 3D noise volume
  // front-to-back, accumulating density with Beer-Lambert extinction (transmittance
  // T *= exp(-density*dt)). A short secondary march toward a movable light gives
  // real self-shadowing, so the fog has lit and shadowed FORM, not flat grey.
  //   ambSize = scale   ambCount = density/thickness   ambSpeed = evolution + drift
  //   ambDetail = (reserved)   ambSoft = ambient fill   driftAngle = wind direction
  //   driftAmount = light intensity   sunX/sunY = light position
  let tt = p.t * 6.2831853;
  var q = uv; q.x = q.x * p.canvasAspect;
  let scale = mix(2.6, 7.5, p.ambSize);

  let a = p.driftAngle * 6.2831853;
  let spd = 0.04 + p.ambSpeed * 0.4;
  let wind = vec3f(cos(a), sin(a) * 0.35, 0.0) * spd * tt;     // drift across the volume
  let evo = vec3f(0.0, 0.0, tt * (0.03 + p.ambSpeed * 0.25));  // roll through depth over time
  let lightDir = normalize(vec3f((p.sunX - 0.5) * 2.0, -(p.sunY - 0.5) * 2.0, 0.7));

  // LOW-LYING: real fog pools near the ground and thins with height. This vertical
  // profile (dense toward the bottom, y=1 → fading out toward the top) is what
  // separates ground fog from an isotropic cloud volume.
  let ground = smoothstep(-0.15, 1.05, uv.y);                 // 0 top .. 1 bottom

  let floorD = mix(0.56, 0.34, p.ambCount);                   // density threshold
  let ext = mix(2.0, 6.5, p.ambCount);                        // extinction strength
  let STEPS = 18;
  let dz = 1.4 / f32(STEPS);
  var trans = 1.0;                                            // transmittance front->back
  var lum = 0.0;                                              // accumulated in-scatter
  for (var i = 0; i < STEPS; i = i + 1) {
    let z = -0.2 + f32(i) * dz;
    // strongly anisotropic: wide flat horizontal banks (low x-freq), layered in y.
    let sp = vec3f(q.x * scale * 0.42, q.y * scale * 0.85, z * scale) + wind + evo;
    var dens = max(0.0, fbm3(sp) - floorD) * ext;
    dens = dens * mix(0.1, 1.0, ground);                      // hug the ground
    if (dens > 0.001) {
      // cheap self-shadow: two coarse density taps toward the light.
      var sh = 0.0;
      sh = sh + max(0.0, fbm3(sp + lightDir * 0.18 * scale) - floorD) * ext * mix(0.1, 1.0, ground);
      sh = sh + max(0.0, fbm3(sp + lightDir * 0.44 * scale) - floorD) * ext * mix(0.1, 1.0, ground);
      let lightT = exp(-sh * 0.5);                            // shadowing
      let dt = dens * dz;
      lum = lum + trans * (0.1 + 0.9 * lightT) * dt;          // ambient + lit in-scatter
      trans = trans * exp(-dt);
    }
    if (trans < 0.02) { break; }
  }
  let opacity = 1.0 - trans;
  // tone-map: soft exponential rolloff so dense/lit regions stay translucent
  // (atmospheric) instead of blowing out to a flat white blob.
  let raw = lum * mix(1.0, 2.2, p.driftAmount) + opacity * mix(0.04, 0.26, p.ambSoft);
  let v = 1.0 - exp(-raw * 1.6);
  return clamp(v, 0.0, 1.0);
}
fn hash22(p: vec2f) -> vec2f {
  return fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453);
}
fn worleyF1(p: vec2f) -> f32 {
  // distance to the nearest cell point: ~0 at leaf-clump centres, larger in the
  // gaps between clumps. Cells are animated by jittering each point.
  let n = floor(p); let f = fract(p);
  var minD = 8.0;
  for (var j = -1; j <= 1; j = j + 1) {
    for (var i = -1; i <= 1; i = i + 1) {
      let g = vec2f(f32(i), f32(j));
      let o = hash22(n + g);
      let r = g + o - f;
      minD = min(minD, dot(r, r));
    }
  }
  return sqrt(minD);
}
fn canopyOpen(uv: vec2f, drift: vec2f, scale: f32, detail: f32, texDrift: vec2f) -> f32 {
  // 1 = open sky/gap (light passes), 0 = dense leaf clump (blocked).
  // With real footage loaded in the T-slot (footageMask), sample its luminance
  // as the canopy — bright = sky gaps the light streams through, dark = leaves.
  // texDrift gently warps the sample point (foliageDrift control): a bounded sway
  // for life + a per-layer offset so near/far layers misalign into parallax depth.
  if (p.footageMask > 0.5) {
    let l = luma(textureSampleLevel(texT, samp, uv + texDrift, 0.0).rgb);
    return clamp(smoothstep(0.22, 0.7, l), 0.0, 1.0);
  }
  // procedural canopy: worley clump structure, fbm-frayed leafy edges.
  var q = uv; q.x = q.x * p.canvasAspect;
  let w = worleyF1(q * scale + drift);
  let leaf = (fbm(q * scale * 3.5 + drift * 2.0) - 0.5) * 0.5;          // frayed clump edges
  let fine = (fbm(q * scale * 9.0 + drift * 3.0) - 0.5) * 0.24 * detail; // leaf detail
  return clamp(smoothstep(0.18, 0.44, w + leaf + fine), 0.0, 1.0);
}
fn ambForestLight(uv: vec2f) -> f32 {
  // Sun shining THROUGH a forest canopy: a procedural foliage canopy (worley leaf
  // clumps with frayed leafy edges, two swaying depth layers) occludes the light;
  // godray shafts stream from the sun through the gaps; bokeh dapples float in the
  // bright patches. A backlit "light through trees" matte.
  //   sunX/sunY = sun   ambSize = leaf scale   ambDetail = leaf/ray detail
  //   ambSoft = ray softness   ambSpeed = sway   ambCount = bokeh   turbulence = density
  let tt = p.t * 6.2831853;
  var q = uv; q.x = q.x * p.canvasAspect;
  let sun = vec2f(p.sunX * p.canvasAspect, p.sunY);
  let dd = q - sun;
  let dist = length(dd);
  let a = p.driftAngle * 6.2831853;
  let wind = vec2f(cos(a), sin(a));
  let scale = mix(4.0, 11.0, 1.0 - p.ambSize);            // bigger size = bigger clumps
  let sway = wind * tt * (0.01 + p.ambSpeed * 0.05) + vec2f(sin(tt * 0.4) * 0.02, cos(tt * 0.3) * 0.02);
  // footage drift: a bounded (oscillating, loop-safe) sway for the loaded clip so
  // the leaves feel alive beyond raw playback. layB also gets a small constant
  // offset so near/far footage layers misalign back into parallax depth.
  let fdr = p.foliageDrift;
  let foot = (wind * sin(tt * (0.3 + p.ambSpeed)) + vec2f(sin(tt * 0.7), cos(tt * 0.5)) * 0.4) * 0.02 * fdr;
  // local canopy: two depth layers — light only where BOTH are open (real depth).
  let layA = canopyOpen(uv, sway, scale, p.ambDetail, foot);
  let layB = canopyOpen(uv, sway * 1.7 + 4.0, scale * 1.9, p.ambDetail, foot * 1.4 + vec2f(0.03, 0.0) * fdr);
  let openLocal = pow(layA * layB, mix(0.7, 1.8, p.turbulence));   // turbulence = density
  // godrays: short march toward the sun, accumulating how open the canopy is along
  // the way — light only reaches a pixel through gaps between the sun and it.
  var shaft = 0.0;
  for (var i = 1; i <= 5; i = i + 1) {
    let t = f32(i) / 6.0;
    let sp = mix(uv, vec2f(p.sunX, p.sunY), t * 0.9);
    shaft = shaft + canopyOpen(sp, sway, scale, p.ambDetail, foot);
  }
  shaft = shaft / 5.0;
  let falloff = exp(-dist * mix(1.2, 3.0, p.ambSoft));
  let core = exp(-dist * mix(5.0, 12.0, 1.0 - p.ambSize));        // bright sun disc
  // radial god-ray striations — visible beams fanning out from the sun.
  let ang = atan2(dd.y, dd.x);
  let rayStr = 0.5 + 0.5 * pow(0.5 + 0.5 * sin(ang * mix(14.0, 40.0, p.ambDetail)
             + fbm(vec2f(ang * 4.0, dist * 3.0)) * 5.0), 2.2);
  var v = core * 1.2 + shaft * falloff * rayStr * 1.9 * openLocal + openLocal * 0.1;
  // bokeh dapples floating in the lit gaps.
  let count = u32(mix(3.0, 16.0, p.ambCount) + 0.5);
  for (var i = 0u; i < 16u; i = i + 1u) {
    if (i >= count) { break; }
    let fi = f32(i) + 1.0;
    let sp2 = 0.3 + 0.7 * hash21(vec2f(fi, 2.1));
    var c = fract(vec2f(hash21(vec2f(fi, 1.3)), hash21(vec2f(fi, 7.7)))
              + wind * tt * 0.015 * sp2 * (0.3 + p.ambSpeed));
    let fade = smoothstep(0.0, 0.1, c.x) * smoothstep(1.0, 0.9, c.x)
             * smoothstep(0.0, 0.1, c.y) * smoothstep(1.0, 0.9, c.y);
    c.x = c.x * p.canvasAspect;
    let od = length(q - c);
    let rad = mix(0.015, 0.07, hash21(vec2f(fi, 5.5))) * mix(0.6, 1.6, p.ambSize);
    let orb = smoothstep(rad, rad * 0.4, od) * 0.5 + exp(-pow((od - rad) / (rad * 0.3), 2.0)) * 0.4;
    v = v + orb * fade * canopyOpen(c.xy / vec2f(p.canvasAspect, 1.0), sway, scale, p.ambDetail, foot) * 0.7;
  }
  return clamp(v, 0.0, 1.0);
}
fn ambInk(uv: vec2f) -> f32 {
  // Ink / dye dispersing in water: curl-noise advection unfurls the dye into
  // swirling tendrils, densest near the injection point (origin) and dispersing.
  //   ambSize = scale/spread   ambCount = density   ambSoft = edge   ambSpeed = flow
  //   turbulence = swirl strength   originX/Y = injection point
  // The dispersion plays from the moment the drop lands: over t the stain grows from
  // a tiny dense blob at the drop point and unfurls into swirling tendrils.
  let grow = clamp(p.t, 0.0, 1.0);
  let tt = p.t * 6.2831853;
  var q = uv; q.x = q.x * p.canvasAspect;
  let sc = mix(2.0, 7.0, p.ambSize);
  let evo = tt * (0.05 + p.ambSpeed * 0.4);
  // iterated curl warp → unfurling tendrils (rotate the warp 90° for swirl). The
  // swirl strength grows as the drop spreads, so tendrils unfurl as it disperses.
  let w1 = vec2f(fbm(q * sc * 0.5 + vec2f(0.0, evo)),
                 fbm(q * sc * 0.5 + vec2f(evo, 4.0))) - vec2f(0.5);
  let swirl = vec2f(-w1.y, w1.x) * mix(1.0, 4.0, p.turbulence) * (0.3 + grow);
  let s = q * sc + swirl + w1 * 1.5;
  var ink = fbm(s) + 0.5 * fbm(s * 2.3 - vec2f(0.0, evo));
  ink = ink / 1.5;
  // dispersion front grows out from the drop point over t.
  let c = vec2f(p.originX, p.originY);
  var dd = uv - c; dd.x = dd.x * p.canvasAspect;
  let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  let r = length(dd) / diag;
  let frontR = mix(0.03, 1.3, pow(grow, 0.55));            // tiny drop → full cloud
  let conc = 1.0 - smoothstep(frontR * mix(0.05, 0.4, p.ambSoft), frontR, r);   // dense → dispersed
  // translucent dye: tendril structure modulated by concentration, with a soft
  // Beer-Lambert rolloff so the dense centre stays a deep tone with visible swirls
  // instead of blowing out to a flat white blob.
  let dye = ink * conc * mix(1.0, 2.3, p.ambCount);
  let v = 1.0 - exp(-dye * 1.25);
  return clamp(v, 0.0, 1.0);
}
fn ambSunBokeh(uv: vec2f) -> f32 {
  // Solar flare + drifting bokeh: a sun (sunX/sunY) with a soft core glow, an
  // anamorphic horizontal streak and a radial starburst, plus floating bokeh orbs
  // (soft discs with a brighter rim) drifting on the wind.
  //   sunX/sunY = sun position   ambCount = orb count   ambSize = glow/orb size
  //   ambDetail = streak + ray strength   ambSpeed = orb drift   driftAngle = wind
  let tt = p.t * 6.2831853;
  var q = uv; q.x = q.x * p.canvasAspect;
  let sun = vec2f(p.sunX * p.canvasAspect, p.sunY);
  let dd = q - sun;
  let r = length(dd);
  // direct light: core glow + anamorphic streak + starburst rays.
  var direct = exp(-r * mix(2.5, 7.0, 1.0 - p.ambSize)) * 1.1;
  let streak = exp(-abs(dd.y) * mix(40.0, 95.0, 1.0 - p.ambSize)) * exp(-abs(dd.x) * 1.2);
  direct = direct + streak * mix(0.15, 1.4, p.ambDetail);
  let ang = atan2(dd.y, dd.x);
  let rays = pow(0.5 + 0.5 * sin(ang * mix(6.0, 16.0, p.ambDetail) + p.seed), 5.0) * exp(-r * 3.5);
  direct = direct + rays * 0.5;
  // dappled canopy: the sun filters through drifting leaves/branches. A two-scale
  // foliage field (broad branches + fine leaves) gently swaying occludes the direct
  // light into shifting dapples. turbulence = how dense the canopy is.
  let a = p.driftAngle * 6.2831853;
  let dir = vec2f(cos(a), sin(a));
  let sway = dir * tt * 0.012 + vec2f(sin(tt * 0.5) * 0.02, cos(tt * 0.4) * 0.02);
  let leafW = vec2f(fbm(q * 3.5 + sway * 3.0), fbm(q * 3.5 + 9.0 - sway * 2.0)) - vec2f(0.5);
  let canopy = fbm(q * mix(5.0, 13.0, p.ambDetail) + leafW * 1.4 + sway);
  let dapple = mix(1.0, smoothstep(0.34, 0.62, canopy), p.turbulence);   // gaps let light through
  var v = direct * dapple;
  let count = u32(mix(4.0, 20.0, p.ambCount) + 0.5);
  for (var i = 0u; i < 20u; i = i + 1u) {
    if (i >= count) { break; }
    let fi = f32(i) + 1.0;
    let sp = 0.3 + 0.7 * hash21(vec2f(fi, 2.1));
    var c = fract(vec2f(hash21(vec2f(fi, 1.3)), hash21(vec2f(fi, 7.7)))
              + dir * tt * 0.02 * sp * (0.3 + p.ambSpeed));
    let fade = smoothstep(0.0, 0.1, c.x) * smoothstep(1.0, 0.9, c.x)
             * smoothstep(0.0, 0.1, c.y) * smoothstep(1.0, 0.9, c.y);
    c.x = c.x * p.canvasAspect;
    let od = length(q - c);
    let rad = mix(0.02, 0.1, hash21(vec2f(fi, 5.5))) * mix(0.6, 1.8, p.ambSize);
    // ambSoft morphs the orbs: low = sharp-edged catadioptric discs with a tight
    // bright rim; high = soft, dreamy, gradient orbs.
    let disc = smoothstep(rad, rad * mix(0.9, 0.2, p.ambSoft), od);
    let rim = exp(-pow((od - rad) / (rad * mix(0.1, 0.45, p.ambSoft)), 2.0)) * mix(0.7, 0.3, p.ambSoft);
    v = v + (disc * 0.45 + rim) * fade * (0.4 + 0.6 * hash21(vec2f(fi, 9.1)));
  }
  return clamp(v, 0.0, 1.0);
}
fn ambWaterShimmer(uv: vec2f) -> f32 {
  // Sunlit water surface: interfering travelling wavefronts sharpened into caustic
  // ridges that shimmer and flow. Smooth gradients make a lovely displacement map.
  //   ambSize = scale   ambSoft = contrast   ambSpeed = speed   ambDetail = glints
  let tt = p.t * 6.2831853 * (0.006 + p.ambSpeed * 0.6);    // crawls to near-still at low speed
  var q = uv; q.x = q.x * p.canvasAspect;
  let sc = mix(3.0, 12.0, p.ambSize);
  var w = 0.0;
  for (var i = 0; i < 5; i = i + 1) {
    let fi = f32(i);
    let a = fi * 2.4 + p.seed * 0.5;
    let dir = vec2f(cos(a), sin(a));
    w = w + sin(dot(q, dir) * sc * (0.6 + 0.18 * fi) + tt * (0.6 + 0.12 * fi)) / (1.0 + 0.3 * fi);
  }
  // the smooth interference of the travelling waves IS the shimmer; a little noise
  // just breaks up the regularity. sin(w·k) turns the wave field into caustic
  // ridges. Low contrast → clean water surface + displacement map.
  let warp = vec2f(fbm(q * sc * 0.3 + tt * 0.12), fbm(q * sc * 0.3 + 5.0 - tt * 0.1)) - vec2f(0.5);
  let caustic = pow(0.5 + 0.5 * sin(w * 1.9 + warp.x * 2.2 + warp.y * 1.6),
                    mix(0.7, 3.0, p.ambSoft));
  let glint = pow(caustic, 4.0) * p.ambDetail * 0.7;                     // sparkle
  return clamp(caustic * 0.85 + glint, 0.0, 1.0);
}
fn ambSilk(uv: vec2f) -> f32 {
  // Flow-field silk: iterated curl-noise advection bends the space into smooth
  // streamlines, rendered as flowing satin bands with a moving sheen. Gorgeous as
  // a displacement driver. turbulence = flow/curl strength.
  //   ambSize = scale   ambDetail = band frequency   ambSoft = band sharpness
  let tt = p.t * 6.2831853 * (0.25 + p.ambSpeed * 0.6);
  var q = uv; q.x = q.x * p.canvasAspect;
  let sc = mix(1.5, 5.0, p.ambSize);
  var pp = q * sc;
  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i);
    let wv = vec2f(fbm(pp + vec2f(0.0, tt * 0.2) + fi),
                   fbm(pp + vec2f(5.2, 0.0 - tt * 0.15) + fi)) - vec2f(0.5);
    pp = pp + vec2f(-wv.y, wv.x) * mix(0.35, 1.1, p.turbulence);         // curl advection
  }
  // smooth flowing satin bands following the curl field; gentle contrast so it
  // reads as silk (and works as a smooth displacement driver).
  let bands = 0.5 + 0.5 * sin(pp.x * mix(2.0, 7.0, p.ambDetail) + pp.y * 0.5);
  var silk = pow(bands, mix(0.6, 2.0, p.ambSoft));
  silk = silk * (0.78 + 0.34 * (0.5 + 0.5 * sin(pp.y * 3.0 - tt)));      // moving sheen
  return clamp(silk, 0.0, 1.0);
}
fn ambInkPaper(uv: vec2f) -> f32 {
  // Ink seeping into watercolour paper. The stain spreads from the drop point over
  // t (so it plays from the moment the ink lands), its edge frayed by paper fibres
  // (capillary wicking), pooling into the paper's tooth (granulation) with a darker
  // pigment rim at the wet front — the hallmarks of ink on aquarelle paper.
  //   originX/Y = drop point   ambSize = spread scale   ambSoft = wetness/feather
  //   ambDetail = paper grain   ambCount = pigment density
  let grow = clamp(p.t, 0.0, 1.0);
  var q = uv; q.x = q.x * p.canvasAspect;
  let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  let sc = mix(2.0, 6.0, p.ambSize);
  var dd = uv - vec2f(p.originX, p.originY); dd.x = dd.x * p.canvasAspect;
  // capillary wicking: the front frays along paper fibres (domain-warped detail).
  let w = vec2f(fbm(q * sc * 0.7), fbm(q * sc * 0.7 + 5.0)) - vec2f(0.5);
  let fiber = fbm(q * mix(12.0, 34.0, p.ambDetail) + w * 2.0) - 0.5;
  let r = length(dd) / diag + fiber * 0.28;
  let frontR = mix(0.04, 1.2, pow(grow, 0.6));               // stain grows from the drop
  let soft = mix(0.06, 0.32, p.ambSoft);
  var ink = 1.0 - smoothstep(frontR - soft, frontR, r);
  // granulation: pigment settles into the paper's tooth — a coarse mottle plus a
  // finer grain, so the texture clumps the way watercolour does (not flat noise).
  let paper = fbm(q * mix(20.0, 50.0, p.ambDetail)) * 0.65 + fbm(q * mix(70.0, 150.0, p.ambDetail)) * 0.35;
  ink = ink * (0.4 + 0.95 * paper);
  // pigment rim: darker accumulation at the advancing wet edge (watercolour edge).
  let band = exp(-pow((r - (frontR - soft * 0.5)) / (soft * 0.6), 2.0));
  ink = clamp(ink + band * (1.0 - smoothstep(frontR, frontR + soft, r)) * 0.55, 0.0, 1.0);
  return clamp(ink * mix(0.7, 1.25, p.ambCount), 0.0, 1.0);
}
fn ambNebula(uv: vec2f) -> f32 {
  // Deep-space nebula + starfield: slow domain-warped cosmic dust with bright cores
  // and dark lanes, overlaid with twinkling stars. Lovely with a colour LUT.
  //   ambCount = nebula density   ambSize = scale   ambSoft = gas contrast
  //   ambSpeed = drift   ambDetail = star density
  //   turbulence = swirl   flow = star glow/size   undulate = dust-lane depth
  let tt = p.t * 6.2831853 * (0.04 + p.ambSpeed * 0.2);        // very slow
  var q = uv; q.x = q.x * p.canvasAspect;
  let sc = mix(1.4, 4.0, p.ambSize);
  // iterated warp for billowing gas clouds; turbulence adds curl-swirl wispiness.
  let w1 = vec2f(fbm(q * sc * 0.5 + vec2f(0.0, tt * 0.1)),
                 fbm(q * sc * 0.5 + vec2f(5.0, 0.0 - tt * 0.08))) - vec2f(0.5);
  let swirl = vec2f(-w1.y, w1.x) * p.turbulence * 2.0;
  let w2 = vec2f(fbm(q * sc + w1 * 1.6 + swirl), fbm(q * sc + w1 * 1.6 + swirl + 7.0)) - vec2f(0.5);
  var neb = fbm(q * sc + w2 * 2.0);
  // dark dust lanes: subtract a sharper ridged noise so the gas is threaded with
  // dark filaments instead of a uniform glow (undulate sets how dark/deep).
  let lane = pow(clamp(1.0 - abs(2.0 * fbm(q * sc * 1.7 + w2) - 1.0), 0.0, 1.0), 2.0);
  neb = neb - lane * mix(0.12, 0.55, p.undulate);
  neb = pow(clamp(neb, 0.0, 1.0), mix(1.2, 2.8, p.ambSoft)) * mix(0.55, 1.4, p.ambCount);
  neb = neb + pow(clamp(neb, 0.0, 1.0), 2.0) * 0.45;          // glowing cores (bloom)
  // starfield: one candidate star per cell, twinkling; a few bright, many faint.
  // flow grows the stars from pin-pricks to glowing points.
  let cell = mix(45.0, 130.0, p.ambDetail);
  let g = q * cell;
  let id = floor(g);
  let rnd = hash21(id);
  var star = 0.0;
  if (rnd > 0.78) {
    let center = vec2f(hash21(id + vec2f(1.3, 0.0)), hash21(id + vec2f(0.0, 2.7)));
    let sd = length(fract(g) - center);
    let bright = smoothstep(0.78, 1.0, rnd);                  // rarer = brighter
    let tw = 0.5 + 0.5 * sin(tt * 40.0 + rnd * 50.0);
    let glow = mix(0.6, 1.8, p.flow);
    star = (exp(-sd * sd * mix(360.0, 150.0, p.flow)) + exp(-sd * 9.0) * 0.25 * glow) * (0.5 + 0.9 * bright) * tw;
  }
  return clamp(neb + star, 0.0, 1.0);
}
fn ambRain(uv: vec2f) -> f32 {
  // falling rain streaks, slanted by direction; faint haze behind.
  let ph = p.t * 6.2831853 * (0.6 + p.ambSpeed * 1.2);
  var q = uv; q.x = q.x * p.canvasAspect;
  let slant = (p.driftAngle - 0.5) * 1.4;
  let sx = q.x + q.y * slant;
  let cols = mix(60.0, 200.0, p.ambCount);
  let colf = sx * cols;
  let col = floor(colf);
  let fx = fract(colf);
  let seed = hash21(vec2f(col, 1.7));
  let speed = 0.6 + seed;
  let yy = fract(q.y * mix(1.0, 3.0, p.ambSize) + ph * speed + seed * 10.0);
  let streak = pow(1.0 - yy, mix(8.0, 28.0, 1.0 - p.ambSoft));
  let lineW = pow(smoothstep(0.5, 0.0, abs(fx - 0.5)), mix(6.0, 26.0, p.ambSize));
  var v = streak * lineW * (0.7 + 0.5 * seed);
  v = v + fbm(q * 8.0 + ph * 0.3) * 0.08 * p.ambDetail;
  return clamp(v, 0.0, 1.0);
}
fn ambSnow(uv: vec2f) -> f32 {
  // drifting snow in parallax depth layers, gentle sway.
  let ph = p.t * 6.2831853;
  var q = uv; q.x = q.x * p.canvasAspect;
  let a = p.driftAngle * 6.2831853;
  let dir = vec2f(cos(a), sin(a));
  var v = 0.0;
  for (var L = 0; L < 3; L = L + 1) {
    let lf = f32(L);
    let dens = mix(12.0, 34.0, p.ambCount) * (1.0 + lf * 0.5);
    let sz = mix(0.5, 1.4, p.ambSize) * (1.0 - lf * 0.22);
    let sp = (0.05 + 0.04 * lf) * (0.5 + p.ambSpeed);
    let drift = dir * ph * 0.02 * p.driftAmount + vec2f(sin(ph * 0.5 + lf) * 0.02, -ph * sp);
    let g = (q + drift) * dens;
    let cell = floor(g); let f = fract(g);
    let rnd = hash21(cell + lf * 13.0);
    let rnd2 = hash21(cell + lf * 7.0 + 3.0);
    let center = vec2f(0.3 + 0.4 * rnd, 0.3 + 0.4 * rnd2);
    let d = length(f - center);
    let r = 0.10 * sz * (0.6 + 0.5 * rnd);
    let flake = smoothstep(r, r * 0.2, d);
    let sway = 0.5 + 0.5 * sin(ph * (1.0 + rnd * 2.0) + cell.x);
    v = v + flake * mix(0.6, 1.0, sway) * (0.7 + 0.5 / (1.0 + lf));
  }
  return clamp(v, 0.0, 1.0);
}
fn ambMarble(uv: vec2f) -> f32 {
  // flowing liquid marble veins from repeated domain warping.
  let ph = p.t * 6.2831853 * (0.1 + p.ambSpeed * 0.4);
  var q = uv; q.x = q.x * p.canvasAspect;
  let a = p.driftAngle * 6.2831853;
  let wind = vec2f(cos(a), sin(a)) * ph * 0.1 * p.driftAmount;
  var s = q * mix(2.0, 6.0, p.ambSize) + wind;
  for (var i = 0; i < 3; i = i + 1) {
    let w = vec2f(fbm(s + ph * 0.1 + f32(i) * 2.0), fbm(s + 5.0 - ph * 0.08 + f32(i) * 2.0)) - vec2f(0.5);
    s = s + w * mix(0.6, 1.4, p.ambDetail);
  }
  var v = 0.5 + 0.5 * sin((s.x + s.y) * 1.5 + fbm(s * 2.0) * 4.0);
  v = pow(v, mix(2.5, 0.8, p.ambSoft));
  return clamp(v, 0.0, 1.0);
}

fn sampleFit(tex: texture_2d<f32>, uv: vec2f, scale: vec2f, offset: vec2f, valid: u32, color: vec3f) -> vec4f {
  // valid encoding: 0 = no image (bg fallback), 1 = image, 2 = solid color, 3 = transparent.
  if (valid == 0u) { return vec4f(p.bg, 1.0); }
  if (valid == 2u) { return vec4f(color, 1.0); }
  if (valid == 3u) { return vec4f(0.0, 0.0, 0.0, 0.0); }
  let q = (uv - offset) / scale;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { return vec4f(p.bg, 1.0); }
  // textureSampleLevel avoids the uniform-control-flow requirement of
  // textureSample (no implicit derivatives → safe inside conditionals).
  return textureSampleLevel(tex, samp, q, 0.0);
}

fn edgeMag(tex: texture_2d<f32>, uv: vec2f, scale: vec2f, offset: vec2f, valid: u32, color: vec3f) -> f32 {
  if (valid == 0u) { return 0.0; }
  let e = 0.0025;
  let cx1 = luma(sampleFit(tex, uv + vec2f( e, 0.0), scale, offset, valid, color).rgb);
  let cx2 = luma(sampleFit(tex, uv - vec2f( e, 0.0), scale, offset, valid, color).rgb);
  let cy1 = luma(sampleFit(tex, uv + vec2f(0.0, e), scale, offset, valid, color).rgb);
  let cy2 = luma(sampleFit(tex, uv - vec2f(0.0, e), scale, offset, valid, color).rgb);
  return clamp(length(vec2f(cx1 - cx2, cy1 - cy2)) * 4.0, 0.0, 1.0);
}

// ---- mode-specific mask functions ------------------------------------------

fn paperMask(uv: vec2f) -> f32 {
  let ang = p.paperAngle * 3.14159265;
  let ca = cos(ang); let sa = sin(ang);
  var g  = vec2f(ca * (uv.x - 0.5) + sa * (uv.y - 0.5),
                -sa * (uv.x - 0.5) + ca * (uv.y - 0.5));

  // ---- image follow: bend the fiber frame along B's local luma gradient so
  // the grain runs with the painting's strokes instead of one fixed angle.
  if (p.paperFollow > 0.001) {
    let e = 0.004;
    let gx = luma(sampleFit(texB, uv + vec2f(e, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, uv - vec2f(e, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let gy = luma(sampleFit(texB, uv + vec2f(0.0, e), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, uv - vec2f(0.0, e), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    g = g + vec2f(gx, gy) * p.paperFollow * 2.5;
  }

  let stretched = vec2f(g.x * p.maskScale, g.y * p.maskScale * p.paperAniso);
  let base = fbm(stretched + p.seed * 0.13);

  // ---- fiber growth: the fine "tooth" grain creeps ALONG the fiber direction
  // as t advances. Early on it is sampled offset down the grain (filaments
  // look short / unformed), settling into place by t=1 so individual fibers
  // appear to extend and fill in rather than simply fade up in place.
  let grow = (1.0 - clamp(p.t, 0.0, 1.0)) * p.paperGrowth;
  let toothUV = uv * (p.maskScale * 14.0) + vec2f(ca, sa) * grow * 5.0 + p.seed * 1.7;
  let tooth = fbm(toothUV) - 0.5;
  var m = clamp(base + tooth * p.paperGranulation * 0.35, 0.0, 1.0);

  // ---- local patches: a coarse low-frequency field gives scattered regions a
  // head start, so the reveal ignites in organic pools across the surface
  // rather than sweeping as a single global threshold front.
  if (p.paperPatches > 0.001) {
    let patchN = fbm(uv * 2.3 + p.seed * 0.37 + 11.0);
    m = clamp(m + (patchN - 0.5) * p.paperPatches * 1.2, 0.0, 1.0);
  }
  return m;
}

fn bloomsMask(uv: vec2f) -> f32 {
  var minReveal = 1.0;
  for (var i = 0u; i < 24u; i = i + 1u) {
    if (i >= p.bloomCount) { break; }
    let fi = f32(i) + p.seed * 0.07 + 1.0;
    var sp = vec2f(hash21(vec2f(fi * 1.3, 13.0)), hash21(vec2f(fi * 2.7, 47.0)));

    // ---- image-driven seeding: try a few candidate origins and migrate the
    // bloom toward the brightest pool in B nearby — backruns form where wet
    // pigment collects, so blooms erupt from the painting's light areas
    // instead of purely random points.
    if (p.bloomImageBias > 0.001) {
      var best = sp;
      var bestL = luma(sampleFit(texB, sp, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
      for (var k = 1u; k < 4u; k = k + 1u) {
        let cand = vec2f(hash21(vec2f(fi * 1.3 + f32(k) * 7.1, 13.0)),
                         hash21(vec2f(fi * 2.7 + f32(k) * 3.9, 47.0)));
        let lc = luma(sampleFit(texB, cand, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
        if (lc > bestL) { bestL = lc; best = cand; }
      }
      sp = mix(sp, best, p.bloomImageBias);
    }

    let startT = hash21(vec2f(fi, 91.0)) * 0.4;
    let jitter = 0.85 + 0.3 * hash21(vec2f(fi, 11.0));
    let d = distance(uv, sp);
    let wob = (fbm(uv * 4.0 + fi * 3.0) - 0.5) * 0.08;
    let reveal = startT + (d + wob) * (1.0 / max(p.bloomRate, 0.05)) * jitter;
    minReveal = min(minReveal, reveal);
  }
  return clamp(minReveal, 0.0, 1.0);
}

fn sedimentMask(uv: vec2f, cA: vec3f, cB: vec3f) -> f32 {
  let src = (cA + cB) * 0.5;
  var v: f32;
  if (p.sedSource == 0u) {                    // luminance
    v = luma(src);
  } else if (p.sedSource == 1u) {             // saturation
    let mx = max(max(src.r, src.g), src.b);
    let mn = min(min(src.r, src.g), src.b);
    v = select(0.0, (mx - mn) / mx, mx > 1e-4);
  } else if (p.sedSource == 2u) {             // hue
    let mx = max(max(src.r, src.g), src.b);
    let mn = min(min(src.r, src.g), src.b);
    let c  = mx - mn;
    var h = 0.0;
    if (c > 1e-4) {
      if (mx == src.r) {
        h = (src.g - src.b) / c;
        h = h - floor(h / 6.0) * 6.0;
      } else if (mx == src.g) {
        h = ((src.b - src.r) / c) + 2.0;
      } else {
        h = ((src.r - src.g) / c) + 4.0;
      }
      h = h / 6.0;
    }
    v = h;
  } else if (p.sedSource == 3u) {             // edge detail
    let eA = edgeMag(texA, uv, p.scaleA, p.offsetA, p.validA, p.slotAColor);
    let eB = edgeMag(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
    v = max(eA, eB);
  } else {                                     // temperature
    v = clamp(0.5 + (src.r - src.b) * 0.7, 0.0, 1.0);
  }
  if (p.sedDirection == 1u) { v = 1.0 - v; }
  let bands = max(1.0, p.sedBands);
  let quantized = floor(v * bands) / max(1.0, bands - 1.0);
  return clamp(mix(quantized, v, p.sedSoftness), 0.0, 1.0);
}

fn saltMask(uv: vec2f, cA: vec3f, cB: vec3f) -> f32 {
  let density = 6.0 + p.saltDensity * 90.0;
  let n1 = vnoise(uv * density + p.seed * 1.7);
  let n2 = vnoise(uv * density * 0.35 + p.seed * 0.3);
  let n = mix(n2, n1, 0.75);
  let k = 0.5 + p.saltContrast * 5.0;
  let m = clamp(0.5 + (n - 0.5) * k, 0.0, 1.0);
  var salt = 1.0 - m;

  if (p.saltSource != 0u && p.saltBias > 0.001) {
    var src: vec3f;
    if (p.saltImage == 0u)      { src = cA; }
    else if (p.saltImage == 1u) { src = cB; }
    else                         { src = (cA + cB) * 0.5; }
    var prop = 0.0;
    if (p.saltSource == 1u) { prop = luma(src); }
    else if (p.saltSource == 2u) { prop = 1.0 - luma(src); }
    else if (p.saltSource == 3u) {
      let mx = max(max(src.r, src.g), src.b);
      let mn = min(min(src.r, src.g), src.b);
      prop = select(0.0, (mx - mn) / mx, mx > 1e-4);
    } else if (p.saltSource == 4u) {
      let eA = edgeMag(texA, uv, p.scaleA, p.offsetA, p.validA, p.slotAColor);
      let eB = edgeMag(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
      if (p.saltImage == 0u) { prop = eA; }
      else if (p.saltImage == 1u) { prop = eB; }
      else { prop = max(eA, eB); }
    }
    salt = clamp(salt - prop * p.saltBias * 0.75, 0.0, 1.0);
  }
  return salt;
}

fn irisMask(uv: vec2f) -> f32 {
  var d = uv - p.irisFocus;
  var norm = 1.4142;
  if (p.irisUniform == 1u) {
    // Aspect-correct so the iris is a circle in pixel space (not stretched
    // along the wider canvas axis). Renormalize so corners still reach r=1.
    d.x = d.x * p.canvasAspect;
    norm = 2.0 / sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  }
  let r = length(d) * norm;
  let jit = (fbm(uv * 3.5 + p.seed * 0.21) - 0.5) * p.irisJitter * 0.3;
  return clamp(r + jit, 0.0, 1.0);
}

fn wetBleedMask(uv: vec2f, lA: f32, lB: f32) -> f32 {
  let base = mix(0.5, 0.5 + 0.5 * (lB - lA), 0.55);
  let aniso = mix(8.0, 28.0, p.bleedFinger);
  let fingUV = uv * vec2f(aniso, aniso * 0.35);
  let n1 = fbm(fingUV + p.seed * 0.3);
  let n2 = fbm(uv * 3.0 + p.seed * 0.7);
  let fingers = (n1 - 0.5) * p.bleedAmount * 0.8 + (n2 - 0.5) * 0.18;
  return clamp(base + fingers, 0.0, 1.0);
}

fn pigmentRunMask(uv: vec2f, lA: f32) -> f32 {
  let m = mix(lA, uv.y, p.runGravity);
  let n = (fbm(uv * 2.5 + p.seed * 0.11) - 0.5) * 0.06;
  return clamp(m + n, 0.0, 1.0);
}

fn paperFiber(uv: vec2f) -> f32 {
  // Multi-octave fine fibers. Returns signed [-0.5..0.5]-ish modulation.
  let f1 = vnoise(uv * 300.0 + p.seed * 1.7) - 0.5;
  let f2 = vnoise(uv *  80.0 + p.seed * 0.4) - 0.5;
  let f3 = vnoise(uv * 700.0 + p.seed * 0.9) - 0.5;
  return f1 * 0.4 + f2 * 0.3 + f3 * 0.3;
}

fn strokeFollowMask(uv: vec2f) -> f32 {
  // Local gradient of B's luma → perpendicular is the local stroke direction.
  let e = 0.003;
  let gx = luma(sampleFit(texB, uv + vec2f( e, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
         - luma(sampleFit(texB, uv - vec2f( e, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
  let gy = luma(sampleFit(texB, uv + vec2f(0.0,  e), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
         - luma(sampleFit(texB, uv - vec2f(0.0,  e), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
  let grad = vec2f(gx, gy);
  let glen = length(grad);
  let strokeDir = select(vec2f(1.0, 0.0), vec2f(-grad.y, grad.x) / glen, glen > 1e-4);
  let perpDir = vec2f(-strokeDir.y, strokeDir.x);
  // Anisotropic noise space: long along strokes, narrow across them.
  let alongScale  = max(0.5, p.strokeScale);
  let acrossScale = alongScale * max(1.0, p.strokeAniso);
  let aco = vec2f(dot(uv - 0.5, strokeDir) * alongScale,
                  dot(uv - 0.5, perpDir)  * acrossScale) + p.seed * 0.13;
  let n = fbm(aco);
  let grain = (vnoise(uv * 110.0 + p.seed * 1.7) - 0.5) * 0.06;
  return clamp(n + grain, 0.0, 1.0);
}

fn tonalGlazeMask(uv: vec2f) -> f32 {
  let cB = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  let L = luma(cB.rgb);
  let v = select(L, 1.0 - L, p.glazeDirection == 1u);
  let bands = max(2.0, p.glazeBands);
  let q = floor(v * bands) / max(1.0, bands - 1.0);
  // glazeSoftness = 1 → continuous wash; 0 → hard bands.
  let m = mix(q, v, p.glazeSoftness);
  // Per-band wet wobble (the v term shifts the noise per tonal region).
  let wob = (fbm(uv * 3.5 + v * 7.3 + p.seed * 0.21) - 0.5) * 0.12;
  let grain = (vnoise(uv * 130.0 + p.seed * 0.7) - 0.5) * 0.05;
  return clamp(m + wob + grain, 0.0, 1.0);
}

fn edgeFirstMask(uv: vec2f) -> f32 {
  let eB = edgeMag(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  // Edges reveal early (low mask), flat areas reveal late.
  let base = clamp(1.0 - eB * 2.5, 0.0, 1.0);
  let wob = (fbm(uv * max(1.0, p.edgeFirstScale) + p.seed * 0.13) - 0.5) * 0.18;
  let grain = (vnoise(uv * 120.0 + p.seed * 1.3) - 0.5) * 0.05;
  return clamp(base + wob + grain, 0.0, 1.0);
}

fn dabsMask(uv: vec2f) -> f32 {
  var minReveal = 1.0;
  for (var i = 0u; i < 128u; i = i + 1u) {
    if (i >= p.dabsCount) { break; }
    let fi = f32(i) + p.seed * 0.07 + 1.0;
    let sp = vec2f(hash21(vec2f(fi * 1.3, 13.0)), hash21(vec2f(fi * 2.7, 47.0)));
    let startT = hash21(vec2f(fi, 91.0)) * 0.5;
    let sizeJit = 0.6 + 0.8 * hash21(vec2f(fi, 11.0));
    let d = distance(uv, sp);
    let w1 = (fbm(uv * 3.0 + fi * 5.0) - 0.5) * p.dabsWobble * 0.08;
    let w2 = (vnoise(uv * 12.0 + fi * 2.0) - 0.5) * p.dabsWobble * 0.02;
    let reveal = startT + (d + w1 + w2) * (1.0 / max(p.dabsReach * sizeJit, 0.05));
    minReveal = min(minReveal, reveal);
  }
  let grain = (vnoise(uv * 120.0 + p.seed * 1.7) - 0.5) * 0.05;
  return clamp(minReveal + grain, 0.0, 1.0);
}

fn wetDensityMask(uv: vec2f) -> f32 {
  let cB = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  let mx = max(max(cB.r, cB.g), cB.b);
  let mn = min(min(cB.r, cB.g), cB.b);
  let sat = select(0.0, (mx - mn) / mx, mx > 1e-4);
  let density = clamp((1.0 - luma(cB.rgb)) * 0.65 + sat * 0.35, 0.0, 1.0);
  // uv.y near 1.0 is the bottom of the canvas in this UV layout. Bottom-heavy pigment pools earliest.
  let bottomBias = uv.y * p.densityGravity * 0.5;
  let m = 1.0 - density - bottomBias * density;
  let wob = (fbm(uv * 3.0 + p.seed * 0.13) - 0.5) * 0.12;
  let grain = (vnoise(uv * 120.0 + p.seed * 1.7) - 0.5) * 0.05;
  return clamp(m + wob + grain, 0.0, 1.0);
}

fn moldTendrilMask(uv: vec2f) -> f32 {
  // Each seed spawns N tendrils as fbm-warped lines growing outward, plus
  // one level of sub-branches per tendril. Mask = "how late this pixel
  // is touched by the closest tendril" — base of tendril reveals first,
  // tip reveals last.
  var minM = 1.0;
  let nSeed = max(1u, p.moldSeedCount);
  let nTend = max(1u, p.moldTendrilsPerSeed);
  let reach = max(0.02, p.moldReach);
  let halfW = max(0.003, p.moldWidth * 0.03);
  let wobAmp = p.moldWobble;

  for (var i = 0u; i < 16u; i = i + 1u) {
    if (i >= nSeed) { break; }
    let fi = f32(i) + p.seed * 0.07 + 1.0;
    let sp = vec2f(hash21(vec2f(fi * 1.3, 13.0)), hash21(vec2f(fi * 2.7, 47.0)));

    for (var j = 0u; j < 8u; j = j + 1u) {
      if (j >= nTend) { break; }
      let fj = f32(j) + 1.0;
      let angle = hash21(vec2f(fi * 2.0 + fj, 91.0)) * 6.2831853;
      let dir = vec2f(cos(angle), sin(angle));
      let perp = vec2f(-dir.y, dir.x);
      // fbm-warp the tendril path so it curves like a real hypha.
      let wig = (fbm(uv * 6.0 + fi * 3.0 + fj * 2.0) - 0.5) * wobAmp * 0.12;
      let qw = uv + perp * wig;
      let rel = qw - sp;
      let along = dot(rel, dir);
      let perpD = dot(rel, perp);
      if (along > 0.0 && along < reach) {
        let radial = along / reach;
        let m = max(radial, abs(perpD) / halfW);
        minM = min(minM, m);
      }

      // Three sub-branches per tendril, at random offsets along the parent,
      // each going off at ±~35° with shorter reach + thinner width.
      for (var k = 0u; k < 3u; k = k + 1u) {
        let fk = f32(k) + 1.0;
        let branchAt = 0.2 + hash21(vec2f(fi * 5.0 + fj * 3.0, fk)) * 0.6;
        let branchOff = (hash21(vec2f(fi + fj * 7.0, fk * 11.0)) - 0.5) * 1.2;
        let bAngle = angle + branchOff;
        let bdir = vec2f(cos(bAngle), sin(bAngle));
        let bperp = vec2f(-bdir.y, bdir.x);
        let bsp = sp + dir * branchAt * reach;
        let bwig = (fbm(uv * 9.0 + fk * 4.0 + fj * 1.7) - 0.5) * wobAmp * 0.08;
        let bqw = uv + bperp * bwig;
        let brel = bqw - bsp;
        let balong = dot(brel, bdir);
        let bperpD = dot(brel, bperp);
        let branchReach = reach * 0.45;
        let branchHalfW = halfW * 0.65;
        if (balong > 0.0 && balong < branchReach) {
          // Branch reveals AFTER the parent reaches its branch-off point.
          let bRadial = branchAt + (balong / branchReach) * (1.0 - branchAt);
          let bm = max(bRadial, abs(bperpD) / branchHalfW);
          minM = min(minM, bm);
        }
      }
    }
  }

  let grain = (vnoise(uv * 100.0 + p.seed * 1.7) - 0.5) * 0.05;
  return clamp(minM + grain, 0.0, 1.0);
}

fn watercolorFormationMask(uv: vec2f) -> f32 {
  // Many strokes painted across the canvas, each oriented along B's local gradient.
  var bestT = 1.0;
  let nStrokes = p.formStrokeCount;
  let size = max(0.005, p.formStrokeSize);
  for (var i = 0u; i < 64u; i = i + 1u) {
    if (i >= nStrokes) { break; }
    let fi = f32(i) + p.seed * 0.07 + 1.0;
    let sp = vec2f(hash21(vec2f(fi * 1.3, 13.0)), hash21(vec2f(fi * 2.7, 47.0)));
    let startT = hash21(vec2f(fi, 91.0)) * 0.7;
    // Orientation: perpendicular to B's gradient at the stroke origin.
    let e = 0.005;
    let gx = luma(sampleFit(texB, sp + vec2f(e, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, sp - vec2f(e, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let gy = luma(sampleFit(texB, sp + vec2f(0.0, e), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, sp - vec2f(0.0, e), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let grad = vec2f(gx, gy);
    let glen = length(grad);
    let strokeDir = select(vec2f(1.0, 0.0), vec2f(-grad.y, grad.x) / glen, glen > 1e-4);
    let perpDir = vec2f(-strokeDir.y, strokeDir.x);
    let sizeJit = 0.6 + 0.7 * hash21(vec2f(fi, 11.0));
    let strokeLen = size * 3.0 * sizeJit;
    let strokeWid = size * 1.0 * sizeJit;
    let rel = uv - sp;
    let along  = dot(rel, strokeDir) / strokeLen;
    let across = dot(rel, perpDir)   / strokeWid;
    // Wobble the elliptical edge with fbm so strokes have torn watercolor borders.
    let wob = (fbm(uv * 8.0 + fi * 3.0) - 0.5) * p.formStrokeWobble * 0.5;
    let d = sqrt(along * along + across * across) * (1.0 + wob);
    if (d < 1.0) {
      let revealT = startT + d * 0.2;
      bestT = min(bestT, revealT);
    }
  }
  let grain = (fbm(uv * 60.0 + p.seed * 1.7) - 0.5) * 0.05;
  return clamp(bestT + grain, 0.0, 1.0);
}

fn cauliflowerBloomMask(uv: vec2f) -> f32 {
  // B's lightest pixels are the bloom origins (paper-show-through). Multi-octave
  // wobble breaks the iso-luma contours into cauliflower shapes.
  let cB = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  let L = luma(cB.rgb);
  let base = mix(0.5, 1.0 - L, p.bloomLightBias);
  let w1 = (fbm(uv * 2.0 + p.seed * 0.13) - 0.5) * 0.20 * p.bloomWobble;
  let w2 = (fbm(uv * 6.0 + p.seed * 0.27) - 0.5) * 0.10 * p.bloomWobble;
  let w3 = (vnoise(uv * 30.0 + p.seed * 0.71) - 0.5) * 0.04;
  let grain = (vnoise(uv * 130.0 + p.seed * 0.5) - 0.5) * 0.04;
  return clamp(base + w1 + w2 + w3 + grain, 0.0, 1.0);
}

fn wetStageMask(uv: vec2f) -> f32 {
  // Watercolor painting stages: lightest wash first, darkest accents last.
  let cB = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  let L = luma(cB.rgb);
  let v = 1.0 - L;
  let bands = max(2.0, p.stageBands);
  let stage = floor(v * bands);
  let withinStage = fract(v * bands);
  let stageBlend = mix(stage / bands, (stage + withinStage) / bands, p.stageOverlap);
  let wob = (fbm(uv * 3.0 + v * 5.0 + p.seed * 0.21) - 0.5) * 0.15;
  let grain = (vnoise(uv * 130.0 + p.seed * 0.7) - 0.5) * 0.04;
  return clamp(stageBlend + wob + grain, 0.0, 1.0);
}

// Worley/Voronoi: returns (d1, d2) — nearest and second-nearest distances
// to randomly-placed cell points in a 'scale x scale' grid.
fn cellDist(uv: vec2f, scale: f32, sd: f32) -> vec2f {
  let cellUv = uv * scale;
  let id = floor(cellUv);
  let frac = fract(cellUv);
  var d1 = 9.0;
  var d2 = 9.0;
  for (var y = -1; y <= 1; y = y + 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      let off = vec2f(f32(x), f32(y));
      let nid = id + off;
      let h = vec2f(
        hash21(nid + vec2f(sd * 0.13, 17.3)),
        hash21(nid + vec2f(91.7, sd * 0.17)),
      );
      let pt = off + h;
      let d = distance(frac, pt);
      if (d < d1) { d2 = d1; d1 = d; }
      else if (d < d2) { d2 = d; }
    }
  }
  return vec2f(d1, d2);
}

fn filmMeltMask(uv: vec2f) -> f32 {
  // Each Voronoi cell reveals at a time proportional to its own centre's
  // distance from the user-chosen melt centre — so the burn opens from the
  // middle and bubbles outward through the cellular grid.
  let center = vec2f(p.meltCenterX, p.meltCenterY);
  let scale  = max(2.0, p.meltCellScale);
  let cellUv = uv * scale;
  let id     = floor(cellUv);
  // Cell anchor with optional per-cell jitter so cells aren't on a clean grid.
  let jitter = vec2f(
    hash21(id + vec2f(p.seed * 0.11, 7.3)),
    hash21(id + vec2f(13.1, p.seed * 0.19)),
  ) - 0.5;
  let cellAnchor = (id + vec2f(0.5) + jitter * p.meltCellJitter) / scale;
  let cellRadial = distance(cellAnchor, center);
  // Per-pixel cellular distance for within-cell variation (so the reveal
  // sweeps across each cell rather than snapping).
  let cell = cellDist(uv, scale, p.seed);
  let m = cellRadial * 1.3 + cell.x * 0.25;
  // Fine noise so the front isn't perfectly clean across each cell.
  let n = (fbm(uv * 8.0 + p.seed * 0.41) - 0.5) * 0.12;
  return clamp(m + n, 0.0, 1.0);
}

// Sample the T-slot video with brightness / contrast / saturation applied,
// so the user can shape the mask polarity without re-encoding the source.
fn adjustedT(uv: vec2f) -> vec3f {
  let raw = textureSampleLevel(texT, samp, uv, 0.0).rgb;
  var c = raw + vec3f(p.videoBrightness);
  c = (c - 0.5) * p.videoContrast + 0.5;
  let gray = luma(c);
  c = mix(vec3f(gray), c, p.videoSaturate);
  return clamp(c, vec3f(0.0), vec3f(1.0));
}

fn burnMask(uv: vec2f) -> f32 {
  // Two-octave UV warp BEFORE measuring distance — macro deformation of the
  // canvas "edges" so the front is organic at multiple scales (no uniform sweep).
  let warpX1 = fbm(uv * 1.5 + p.seed * 0.13);
  let warpY1 = fbm(uv * 1.5 + 91.7 + p.seed * 0.09);
  let uvW1 = uv + (vec2f(warpX1, warpY1) - 0.5) * 0.7 * p.burnEdgeWobble;
  // Second warp applied on the already-warped UV — recursive distortion for
  // even more irregular macro shape.
  let warpX2 = fbm(uvW1 * 4.0 + p.seed * 0.21);
  let warpY2 = fbm(uvW1 * 4.0 + 53.3 + p.seed * 0.17);
  let uvW = uvW1 + (vec2f(warpX2, warpY2) - 0.5) * 0.25 * p.burnEdgeWobble;
  // Distance to nearest edge in warped space.
  let dbX = min(uvW.x, 1.0 - uvW.x);
  let dbY = min(uvW.y, 1.0 - uvW.y);
  var db  = min(dbX, dbY);
  // Optional additional ignition points anywhere in the canvas.
  if (p.burnSeedCount > 0u) {
    for (var i = 0u; i < 16u; i = i + 1u) {
      if (i >= p.burnSeedCount) { break; }
      let fi = f32(i) + p.seed * 0.07 + 1.0;
      let sp = vec2f(hash21(vec2f(fi * 1.3, 13.0)), hash21(vec2f(fi * 2.7, 47.0)));
      db = min(db, distance(uv, sp));
    }
  }
  // Ignition bias: shifts db upward in most regions so only the "lucky" few
  // perimeter spots ignite at t=0 — burn spreads from those points instead of
  // every edge igniting simultaneously. Subtracting 0.22 from fbm tilts the
  // bias mostly positive (i.e. most edges delayed; only the lowest-fbm pockets
  // ignite immediately). Scaled by edgeWobble so the user controls how
  // selective the ignition is.
  let igniteBias = (fbm(uv * 1.3 + p.seed * 0.33) - 0.22) * 1.4 * p.burnEdgeWobble;
  db = max(0.0, db + igniteBias);
  // B-driven ignition: B's bright pixels are "fire sources" that the burn
  // radiates from, looking like B is burning through A.
  if (p.burnBIgnite > 0.001 && p.validB > 0u) {
    let lB = luma(sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let bDist = (1.0 - lB) * 0.4;
    db = mix(db, min(db, bDist), p.burnBIgnite);
  }
  // Per-region burn rate — multi-octave speed field so propagation rate
  // varies at multiple scales (more organic, less uniform).
  let speedLow = fbm(uv * 2.0 + p.seed * 0.41) * 0.8 + 0.55;
  let speedHi  = (fbm(uv * 8.0 + p.seed * 0.91) - 0.5) * 0.4 * p.burnEdgeWobble;
  let speedField = max(0.25, speedLow * (1.0 + speedHi));
  db = db / speedField;
  // Multi-scale ragged wobble.
  let w1 = (fbm(uv * 4.0  + p.seed * 0.27) - 0.5) * 0.45 * p.burnEdgeWobble;
  let w2 = (fbm(uv * 14.0 + p.seed * 0.51) - 0.5) * 0.25 * p.burnEdgeWobble;
  let w3 = (fbm(uv * 30.0 + p.seed * 0.83) - 0.5) * 0.12 * p.burnEdgeWobble;
  let w4 = (vnoise(uv * 60.0 + p.seed * 0.71) - 0.5) * 0.03;
  // Mask capped at 0.85 (not 1.0) so the burn front reaches every pixel by
  // p.t≈0.69, leaving ~0.3 of the timeline for the burn to actually play
  // out visually before the end-fade kicks in.
  // Cap at 1.2 (not 0.85): with hard-step mixT, late pixels reveal at p.t up
  // to ~0.94, so the burn front continues sweeping into the last part of the
  // timeline instead of finishing at 0.69 and leaving dead time at the end.
  return clamp((db + w1 + w2 + w3 + w4) * 1.6, 0.0, 1.2);
}

fn wetEdgeMask(uv: vec2f) -> f32 {
  // No B → nothing to bleed in.
  if (p.validB == 0u) { return 0.0; }
  // Work in B-local coords so the "rectangle" is always B's image bounds.
  let q = (uv - p.offsetB) / p.scaleB;
  // Outside B's rect → stay as A (mask > 1 keeps the smoothstep window above t).
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { return 10.0; }

  // Distance from B's rectangular border, B-local. 0 at edge → 0.5 at center.
  let dbX = min(q.x, 1.0 - q.x);
  let dbY = min(q.y, 1.0 - q.y);
  let db  = min(dbX, dbY);

  // Wavy wet front — fbm perturbs the iso-distance contours.
  let wob = (fbm(q * p.weEdgeScale + p.seed * 0.13) - 0.5) * p.weEdgeWobble * 0.18;

  // Normalize: border → 0, center → ~1.
  var m = (db + wob) * 2.0;
  // Reverse direction: bleed from center outward instead of border inward.
  if (p.weReverse == 1u) {
    m = 1.0 - m;
  }

  // Capillary tendrils: pick seed points on the border, each growing inward.
  if (p.weTendrilCount > 0u && p.weTendrilStrength > 0.001) {
    var bestInfluence = 0.0;
    for (var i = 0u; i < 32u; i = i + 1u) {
      if (i >= p.weTendrilCount) { break; }
      let fi = f32(i) + p.seed * 0.07 + 1.0;
      let side = u32(hash21(vec2f(fi * 1.3, 3.1)) * 4.0) % 4u;
      let bp = hash21(vec2f(fi * 1.7, 7.2));
      var sp: vec2f;
      var dir: vec2f;
      if (side == 0u)      { sp = vec2f(bp,   0.0); dir = vec2f(0.0,  1.0); }
      else if (side == 1u) { sp = vec2f(1.0,  bp ); dir = vec2f(-1.0, 0.0); }
      else if (side == 2u) { sp = vec2f(bp,   1.0); dir = vec2f(0.0, -1.0); }
      else                  { sp = vec2f(0.0,  bp ); dir = vec2f(1.0,  0.0); }
      let perpDir = vec2f(-dir.y, dir.x);
      // Wobble the tendril's path so it curves like a paint feeler.
      let wig = (fbm(q * 5.5 + fi * 4.3) - 0.5) * 0.05;
      let qw = q + perpDir * wig;
      let rel = qw - sp;
      let along = dot(rel, dir);
      let perp  = dot(rel, perpDir);
      let reach = max(0.01, p.weTendrilReach);
      let width = max(0.002, p.weTendrilWidth * 0.04);
      if (along > 0.0 && along < reach) {
        let perpFall  = exp(-(perp * perp) / (width * width));
        let alongFall = 1.0 - along / reach;
        bestInfluence = max(bestInfluence, perpFall * alongFall);
      }
    }
    m = m - bestInfluence * p.weTendrilStrength * 0.5;
  }

  // Detail bias — A's high-detail regions reveal earlier (paint hangs in soft areas).
  if (p.weDetailBias > 0.001) {
    let eA = edgeMag(texA, uv, p.scaleA, p.offsetA, p.validA, p.slotAColor);
    m = m - eA * p.weDetailBias * 0.35;
  }

  // B detail bias — front "reaches toward" B's focal points so they reveal first.
  if (p.weBDetailBias > 0.001) {
    let eB = edgeMag(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
    m = m - eB * p.weBDetailBias * 0.35;
  }

  // B luma bias — positive: dark areas of B reveal first; negative: lights first.
  if (abs(p.weBLumaBias) > 0.001) {
    let lB = luma(sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    m = m - (lB - 0.5) * p.weBLumaBias * 0.5;
  }

  return clamp(m, 0.0, 1.0);
}

fn swW(i: u32) -> f32 {            // per-column width weight (swipeW[] as 4 vec4s)
  let v = p.swipeW[i / 4u];
  let c = i % 4u;
  if (c == 0u) { return v.x; } else if (c == 1u) { return v.y; }
  else if (c == 2u) { return v.z; } return v.w;
}
fn swipeMask(uv: vec2f) -> f32 {
  // Column-swipe reveal: the frame is split into N columns (across the axis
  // perpendicular to the swipe); each column wipes along the swipe direction,
  // started at a staggered time, with an organic noise-displaced fade front.
  // Returns a per-pixel reveal time (low = reveals first).
  //   swipeCols = column count   swipeDir 0=up 1=down 2=left 3=right
  //   swipeStagger = per-column time offset   swipeColW = column fill (gaps follow)
  //   swipeSoft = organic edge break-up
  let cols = max(1.0, floor(p.swipeCols + 0.5));
  let nc = u32(cols + 0.5);
  let dir = u32(p.swipeDir + 0.5);
  var along = uv.y; var across = uv.x;          // vertical swipe, columns across x
  if (dir >= 2u) { along = uv.x; across = uv.y; } // horizontal swipe, columns across y
  // a = distance from the reveal-start edge (0 reveals first). uv.y=0 is top.
  var a = along;
  if (dir == 0u || dir == 2u) { a = 1.0 - along; }  // up: from bottom; left: from right
  // per-column widths: swipeW[i] is each column's width as a FRACTION of the
  // across axis (CPU sends pixels / axis size; 0 = auto equal share). Columns
  // tile from the start edge; the last one fills any remainder so it completes.
  var acc = 0.0; var col = 0.0; var colStart = 0.0; var colFrac = 1.0 / cols;
  for (var i = 0u; i < 16u; i = i + 1u) {
    if (i >= nc) { break; }
    var wf = swW(i);
    if (wf <= 0.0) { wf = 1.0 / cols; }
    if (i == nc - 1u) { wf = max(wf, 1.0 - acc); }
    if (across < acc + wf || i == nc - 1u) { col = f32(i); colStart = acc; colFrac = wf; break; }
    acc = acc + wf;
  }
  let inCol = clamp((across - colStart) / max(colFrac, 0.0001), 0.0, 1.0);  // 0..1 within column
  let colOrder = col / max(1.0, cols - 1.0);          // 0..1 left/top -> right/bottom
  let colStartT = colOrder * p.swipeStagger;
  // duty cycle: the active strip fills swipeColW of each column; the gaps near the
  // column edges fall back to the plain (un-staggered) front so the matte completes.
  let edgeDist = abs(inCol - 0.5) * 2.0;              // 0 centre .. 1 column edge
  let colMix = 1.0 - smoothstep(p.swipeColW - 0.08, p.swipeColW + 0.08, edgeDist);
  let staggered = colStartT + a * (1.0 - p.swipeStagger);
  var m = mix(a, staggered, colMix);
  // organic front: break the reveal line up with per-column noise
  let n = fbm(vec2f(across * cols * 1.6, along * 4.5) + col * 3.1 + p.seed * 0.13) - 0.5;
  m = m + n * p.swipeSoft * 0.5;
  return clamp(m, 0.0, 1.0);
}
fn mirrorMask(uv: vec2f) -> f32 {
  // Centre-out mirror reveal: the matte opens from the middle of the frame and
  // expands symmetrically toward the edges. Per-pixel reveal time = distance
  // from the centre (low = reveals first), so the middle pops first and the
  // outer edges fill in last, mirrored about the centre.
  //   mirrorDir 0=left/right (vertical split)  1=up/down (horizontal split)
  //             2=radial (circle)              3=diamond (square)
  let dir = u32(p.mirrorDir + 0.5);
  var d: f32;
  if (dir == 0u) {
    d = abs(uv.x - 0.5) * 2.0;                 // open across x, mirrored L/R
  } else if (dir == 1u) {
    d = abs(uv.y - 0.5) * 2.0;                 // open across y, mirrored U/D
  } else if (dir == 2u) {
    var q = uv - vec2f(0.5); q.x = q.x * p.canvasAspect;   // aspect-correct circle
    let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
    d = length(q) / diag;                      // 0 centre .. 1 far corner
  } else {
    d = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;       // expanding square
  }
  // organic front: break the expanding edge up with noise. The noise is ramped
  // in with distance (core stays pristine) so the reveal always nucleates at the
  // EXACT centre and grows outward — organic=0 gives a perfectly straight/round
  // front, higher values get progressively more ragged toward the edges.
  //   organic = wave amount   maskScale = wave frequency
  let core = smoothstep(0.0, 0.18, d);
  let n = fbm(uv * (2.5 + p.maskScale * 2.5) + p.seed * 0.13) - 0.5;
  d = d + n * p.organic * 0.5 * core;
  return clamp(d, 0.0, 1.0);
}
fn doorMask(uv: vec2f) -> f32 {
  // Pure geometric door — opens from the centre with NO organic noise, EVER, so
  // it can never look ragged regardless of the shared organic param. Just a
  // clean panel parting; only edge softness (spread) feathers the seam.
  //   mirrorDir 0=double doors (L/R)  1=up/down  2=radial (iris)  3=diamond
  let dir = u32(p.mirrorDir + 0.5);
  var d: f32;
  if (dir == 0u) {
    d = abs(uv.x - 0.5) * 2.0;
  } else if (dir == 1u) {
    d = abs(uv.y - 0.5) * 2.0;
  } else if (dir == 2u) {
    var q = uv - vec2f(0.5); q.x = q.x * p.canvasAspect;
    let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
    d = length(q) / diag;
  } else {
    d = max(abs(uv.x - 0.5), abs(uv.y - 0.5)) * 2.0;
  }
  return clamp(d, 0.0, 1.0);
}
fn boxRevealMask(uv: vec2f) -> f32 {
  // Box reveal — the matte opens as a centred rectangle and the front marches
  // UNIFORMLY outward from its edges (sharp square corners, no rounding). Per
  // pixel reveal time = Chebyshev distance to the rectangle's surface: inside
  // the seed rect reveals at t=0, then every point flips in proportion to how
  // far it sits beyond the nearest edge. Purely geometric — no organic noise.
  //   rectW/rectH = seed half-size (uv units, aspect-corrected on x)
  //   rectReach   = how far the front travels past the edge before t=1
  var q = uv - vec2f(0.5);
  q.x = q.x * p.canvasAspect;
  // distance OUTSIDE the box along each axis (0 inside), then take the larger:
  // a square (∞-norm) front so corners stay crisp instead of rounding off.
  let dd = max(abs(q) - vec2f(p.rectW, p.rectH), vec2f(0.0));
  let d = max(dd.x, dd.y);
  return clamp(d / max(p.rectReach, 0.0001), 0.0, 1.0);
}
fn organicMask(uv: vec2f, lA: f32, lB: f32, edge: f32) -> f32 {
  let n1 = fbm(uv * p.maskScale + p.seed * 0.13);
  let n2 = fbm(uv * p.maskScale * 2.3 + 17.0 + p.seed * 0.09);
  let noiseMask = mix(n1, n2, 0.35);
  let lumMask = 0.5 + 0.5 * (lB - lA);
  var m = mix(noiseMask, lumMask, p.organic);
  m = m - p.edges * edge * 0.45;
  return clamp(m, 0.0, 1.0);
}

// ---- main shader ------------------------------------------------------------

fn cellIgnite(gx: f32, gy: f32, cols: f32, rows: f32, total: f32) -> f32 {
  // ignite ORDER. p.stageOverlap selects: 0 = random/sequential, 1 = warmth,
  // 2 = brightness, 3 = saturation (sampled from image A at the cell centre).
  let by = round(p.stageOverlap);
  if (by >= 0.5 && p.validA == 1u) {
    let cu = vec2f((gx + 0.5) / cols, (gy + 0.5) / rows);
    let c = sampleFit(texA, cu, p.scaleA, p.offsetA, p.validA, p.slotAColor).rgb;
    var prop = 0.0;
    if (by < 1.5) {
      prop = clamp(0.5 + (c.r - c.b) * 0.6, 0.0, 1.0);                    // warmth (warm = high)
    } else if (by < 2.5) {
      prop = clamp(dot(c, vec3f(0.299, 0.587, 0.114)), 0.0, 1.0);        // brightness
    } else {
      let mx = max(c.r, max(c.g, c.b)); let mn = min(c.r, min(c.g, c.b));
      prop = select(0.0, (mx - mn) / mx, mx > 0.001);                    // saturation
    }
    let jit = (hash21(vec2f(gx + 5.1, gy + 9.3) + p.seed) - 0.5) * 0.12 * clamp(p.moldWobble, 0.0, 1.0);
    return clamp(1.0 - prop + jit, 0.0, 1.0);                            // high property -> earlier
  }
  let h = hash21(vec2f(gx + 1.7, gy + 3.3) + p.seed * 1.31);
  let seq = (gx + gy * cols + 0.5) / total;
  var ig = mix(seq, h, clamp(p.moldWobble, 0.0, 1.0));                   // order: sequential -> random
  return pow(clamp(ig, 0.0, 1.0), mix(1.0, 2.6, clamp(p.glazeWarm, 0.0, 1.0)));  // cascade bias
}
fn cellsMask(uv: vec2f) -> f32 {
  // Lamp grid (mode 29): a jittered grid of cells, each "igniting" (black->white)
  // at its own staggered time so a collage lights up cell by cell like lamps.
  // "analysed regions" (ignite by = 4): reveal the CPU-baked per-pixel light-up
  // map (texRegions.r) instead of a fixed grid.
  if (round(p.stageOverlap) > 3.5) {
    return clamp(textureSampleLevel(texRegions, samp, uv, 0.0).r, 0.0, 1.0);
  }
  let cols = max(1.0, round(p.sedBands));
  let rows = max(1.0, round(f32(p.bloomCount)));
  var guv = uv;
  if (p.dabsWobble > 0.001) {
    let w = fbm(vec2f(uv.x * cols, uv.y * rows) + p.seed * 0.07);
    guv = uv + (w - 0.5) * p.dabsWobble * 0.12;
  }
  let fx = clamp(guv.x, 0.0, 0.9999) * cols;
  let fy = clamp(guv.y, 0.0, 0.9999) * rows;
  let gx = floor(fx);
  let gy = floor(fy);
  let total = max(1.0, cols * rows);
  var ignite = cellIgnite(gx, gy, cols, rows, total);
  let spill = clamp(p.bloomWobble, 0.0, 1.0);
  if (spill > 0.001) {
    let sub = vec2f(fx - gx - 0.5, fy - gy - 0.5);
    for (var oy = -1; oy < 2; oy = oy + 1) {
      for (var ox = -1; ox < 2; ox = ox + 1) {
        if (ox == 0 && oy == 0) { continue; }
        let nx = gx + f32(ox);
        let ny = gy + f32(oy);
        if (nx < 0.0 || ny < 0.0 || nx >= cols || ny >= rows) { continue; }
        let nig = cellIgnite(nx, ny, cols, rows, total);
        let d = length(sub - vec2f(f32(ox), f32(oy)));
        let w = clamp(1.0 - (d - 0.5) / max(0.05, spill * 0.9), 0.0, 1.0);
        ignite = min(ignite, mix(1.0, nig, w));
      }
    }
  }
  let cuv = vec2f(fx - gx - 0.5, fy - gy - 0.5);
  ignite = ignite + length(cuv) * 1.414 * clamp(p.bloomRim, 0.0, 1.0) * 0.2;
  return clamp(ignite, 0.0, 1.0);
}

// mode 48 — radial burst: fine filaments explode outward from a centre point, like
// a stretched-pixel shockwave / anemone. Streaks are coherent along the radius
// (so they read as long radial threads) and break up by angle. originX/Y = centre,
// organic = streak density, edges = how far filaments reach ahead, turbulence =
// front chaos, flow = churn speed, seed = variation.
fn radialBurstMask(uv: vec2f) -> f32 {
  let c = vec2f(p.originX, p.originY);
  var d = uv - c;
  d.x = d.x * p.canvasAspect;
  let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  let r = length(d) / diag;                         // 0 at centre .. ~1 at corner
  let ang = atan2(d.y, d.x);
  let dir = vec2f(cos(ang), sin(ang));              // periodic -> no angular seam
  let anim = p.t * p.flow * 0.8 + p.seed * 0.37;
  let freq = mix(10.0, 60.0, p.organic);            // streak density
  // Domain-warp the angular streak field by a radius-dependent offset so filaments
  // meander and branch along their length instead of reading as straight rays.
  // (dir keeps it seamless around the circle; r breaks coherence down each thread.)
  let wf = vec2f(
    fbm(dir * (freq * 0.35) + vec2f(r * 2.5, anim)),
    fbm(dir * (freq * 0.35) + vec2f(anim, r * 2.5))
  ) - vec2f(0.5);
  let curl = wf * mix(0.6, 3.0, p.turbulence);
  var streak = fbm(dir * freq + curl + anim * 0.5);
  streak = streak + 0.4 * fbm(dir * freq * 2.6 + curl * 1.6 + vec2f(0.0, r * 3.0) + anim);  // feathered, branching tips
  streak = streak / 1.4;
  let warp = (fbm(uv * mix(3.0, 11.0, p.turbulence) + anim) - 0.5) * p.turbulence * 0.25;
  let reach = mix(0.15, 0.7, clamp(p.edges * 0.5 + 0.5, 0.0, 1.0));
  // Filaments reach further ahead at the tips (scaled by r) -> tapered, frayed front.
  let m = r - (streak - 0.5) * reach * (0.6 + 0.8 * r) + warp;
  return clamp(m, 0.0, 1.0);
}

// mode 49 — smoke ring: a wispy, lobed region grows from a centre, its boundary
// warped by domain noise into smoky tendrils (the glowing rim is added in the
// output pass). originX/Y = centre, organic = lobe count, turbulence = smoke
// wispiness, flow = churn speed, seed = variation.
fn smokeRingMask(uv: vec2f) -> f32 {
  let c = vec2f(p.originX, p.originY);
  var d = uv - c;
  d.x = d.x * p.canvasAspect;
  let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  let ang = atan2(d.y, d.x);
  let dir = vec2f(cos(ang), sin(ang));
  let anim = p.t * p.flow * 0.6 + p.seed * 0.2;
  // Domain-warp field: a slow noise vector that curls the boundary samples into
  // billowing, rolling tendrils (the signature of smoke vs. a plain blobby edge).
  let wf = vec2f(
    fbm(dir * 2.0 + vec2f(0.0, anim)),
    fbm(dir * 2.0 + vec2f(anim, 4.0))
  ) - vec2f(0.5);
  let warpAmt = mix(0.25, 1.1, p.turbulence);
  let lobes = mix(2.0, 9.0, p.organic);
  // Two octaves of boundary displacement: a broad lobe shape plus a finer,
  // domain-warped octave that adds the curling roll.
  let lobeW = (fbm(dir * lobes + anim) - 0.5) * 0.4
            + (fbm(dir * lobes * 2.3 + wf * warpAmt + anim * 1.4) - 0.5) * 0.28;
  let sc = mix(1.5, 6.0, p.turbulence);
  let smoke = (fbm(uv * sc + wf * warpAmt + vec2f(anim, anim * 0.5) + p.seed * 0.11) - 0.5);  // wisps
  let smokeAmt = mix(0.08, 0.5, p.turbulence);
  let r = length(d) / diag + lobeW + smoke * smokeAmt;
  return clamp(r, 0.0, 1.0);
}

// mode 66 — fog bloom: the SAME rolling parallax-fog field as "smoke / fog" (mode
// 50, the look that reads best), but instead of drifting in from a wind direction
// it drifts RADIALLY OUTWARD from the origin and is gated by a centre-out growth
// envelope, so the exact fog you like pours out from a point over the timeline.
// Built for the ELVERKET multi-surface UV: set originX/Y per-surface to the shared
// room centre so the FLOOR + walls read as one continuous outflow.
//   originX/Y = pour centre   organic = coverage / density   maskScale = fog scale
//   flow = roll / pour speed   turbulence = billow / curl   spread = edge softness
//   edges = growth-edge feather   seed = variation
fn fogBloomField(uv: vec2f) -> f32 {
  let cen = vec2f(p.originX, p.originY);
  var q = uv; q.x = q.x * p.canvasAspect;
  var dc = uv - cen; dc.x = dc.x * p.canvasAspect;
  let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
  let r = length(dc) / diag;                                  // 0 centre .. ~1 corner
  let rdir = select(dc / max(length(dc), 1e-5), vec2f(0.0, 0.0), length(dc) < 1e-5);

  let sc = mix(1.0, 4.0, clamp(p.maskScale / 4.0, 0.0, 1.0)); // ambSize-equiv
  let churn = p.t * 6.2831853 * (0.05 + p.flow * 0.35);       // in-place morph
  // ORGANIC radial drift OUTWARD (a 360° fog machine): perturb the pure-radial
  // direction with a slow low-frequency noise vector so the fog pours out in
  // irregular meandering tongues (and at varying speeds) rather than a clean radial
  // fan — turbulence sets how much it wanders. Plus an upward RISE bias (undulate).
  // Sampling noise at coord+offset moves features OPPOSITE the offset, so outward =
  // -odir and up (y=0 is the top) = +y in the offset.
  let owarp = vec2f(fbm(q * 1.3 + churn * 0.10 + p.seed * 0.2),
                    fbm(q * 1.3 - churn * 0.08 + 9.0)) - vec2f(0.5);
  let odir = rdir + owarp * (0.5 + p.turbulence * 1.3);
  let drift = -odir * (p.t * 6.2831853) * (0.06 + p.flow * 0.6)
            + vec2f(0.0, (p.t * 6.2831853) * p.undulate * 0.6);

  var s = q * sc;
  // billow warp + 90°-rotated swirl (curl-ish eddies) — identical to ambSmoke.
  let warpAmt = 0.6 + p.turbulence * 1.6;
  let wf = vec2f(fbm(s * 0.6 + churn * 0.12 + 3.0),
                 fbm(s * 0.6 - churn * 0.09 + 8.0)) - vec2f(0.5);
  let swirl = vec2f(-wf.y, wf.x) * (0.4 + p.turbulence * 1.4);
  // parallax depth layers — the heart of the rolling-fog motion.
  var dens = 0.0; var amp = 0.6; var wsum = 0.0;
  for (var i = 0; i < 3; i = i + 1) {
    let fi = f32(i);
    let ls = s * (1.0 + fi * 0.6) + drift * (0.5 + fi * 0.6)
           + wf * warpAmt + swirl * (0.5 + fi * 0.4)
           + vec2f(fi * 4.7, fi * 2.3) + vec2f(0.0, fi * churn * 0.35);
    dens = dens + amp * fbm(ls);
    wsum = wsum + amp; amp = amp * 0.55;
  }
  dens = dens / wsum;
  // erode edges into wisps with a finer octave (ambSmoke's detail term).
  let detail = fbm(s * 3.4 + drift * 1.6 + churn * 0.25 + 17.0);
  dens = dens - (1.0 - detail) * 0.12;
  // RADIAL bank: denser at the centre, thinning outward (replaces the directional
  // "comes-from" bank), so it reads as a source pouring out.
  dens = dens + 0.45 * (0.5 - r);
  // soft, low-contrast, translucent shaping — ambSmoke's mapping.
  let cov = mix(0.52, 0.18, p.organic);
  let soft = mix(0.18, 0.5, p.spread);
  var v = smoothstep(cov - 0.5 * soft, cov + soft, dens);

  // ---- centre-out growth envelope (one-shot pour) ----
  // R starts NEGATIVE so the frame is truly empty at t=0, then grows past the
  // corners by t=1 — the fog pours out from nothing rather than starting as a blob.
  let R = clamp(p.t, 0.0, 1.0) * 1.5 - 0.06;
  let feat = mix(0.1, 0.6, clamp(p.edges * 0.5 + 0.5, 0.0, 1.0));
  // organic front: fine wisps from the density + big slow lobes from a low-frequency
  // octave, so the advancing edge is lobed + wispy, never a clean circle.
  let lobe = (fbm(q * 0.9 + churn * 0.15 + p.seed * 0.3) - 0.5) * mix(0.12, 0.4, p.turbulence);
  let jag = (dens - 0.5) * mix(0.1, 0.45, p.turbulence) + lobe;
  let env = 1.0 - smoothstep(R - feat, R + feat, r + jag);
  return clamp(v * env, 0.0, 1.0);
}

// Standalone variants of modes 48/49 are LOOPING versions of the very same
// reveal: the identical filament-burst / smoky-lobed shape, breathing in and out
// over the loop instead of sweeping once. So the standalone reads as the same
// effect, just continuous. The breathing front never fully closes (keeps a core)
// nor hard-caps, avoiding a black/white blink at the loop seam.
fn breatheFront() -> f32 {
  return mix(0.12, 1.05, 0.5 - 0.5 * cos(p.t * 6.2831853));   // small core .. full
}
fn radialBurstField(uv: vec2f) -> f32 {
  let m = radialBurstMask(uv);
  let soft = mix(0.04, 0.35, p.spread);
  let front = breatheFront();
  return clamp(smoothstep(front + soft, front - soft, m), 0.0, 1.0);
}
fn smokeRingField(uv: vec2f) -> f32 {
  let m = smokeRingMask(uv);
  let soft = mix(0.04, 0.35, p.spread);
  let front = breatheFront();
  return clamp(smoothstep(front + soft, front - soft, m), 0.0, 1.0);
}

// mode 53 — frost: crystalline ice creeping in from the edges, its growth front
// broken into feathery, branching ferns by ridged domain-warped noise. Returns a
// reveal mask (low near the edges → reveals first, high at centre → last).
// organic = crystal density, edges = sharpness/reach of the ferns, seed = variation.
fn frostMask(uv: vec2f) -> f32 {
  var q = uv; q.x = q.x * p.canvasAspect;
  // distance inward from the nearest canvas edge (0 at edge .. 1 at centre).
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * 2.0;
  let fr = mix(6.0, 22.0, p.organic);                       // crystal density
  let off = p.seed * 0.37;
  // domain warp so the spines wander and branch instead of being straight.
  let w = vec2f(fbm(q * fr * 0.4 + off), fbm(q * fr * 0.4 + 5.0 + off)) - vec2f(0.5);
  // ridged noise raised to a high power → THIN, sharp crystalline spines (ice
  // lines). max() of two scales builds a branching network of tendrils.
  let n1 = fbm(q * fr + w * 2.0);
  let spine1 = pow(1.0 - abs(2.0 * n1 - 1.0), 2.5);
  let n2 = fbm(q * fr * 2.5 + w * 1.2);
  let spine2 = pow(1.0 - abs(2.0 * n2 - 1.0), 3.0);
  let crystal = max(spine1, spine2 * 0.7);
  // Frost as a crystalline DISSOLVE: an evenly-distributed height field reveals
  // uniformly over t, with the sharp veins and the canvas edges crossing first so
  // the ice nucleates along crystal tendrils and creeps in from the borders.
  var hgt = fbm(q * fr * 0.7 + w * 1.5);                    // even base distribution
  hgt = hgt + crystal * 0.5;                                // veins reveal first
  hgt = hgt + (1.0 - edge) * mix(0.05, 0.4, clamp(p.edges * 0.5 + 0.5, 0.0, 1.0));  // edge-first
  let mask = 1.0 - clamp(hgt, 0.0, 1.0);
  return clamp(mask, 0.0, 1.0);
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  var uv = in.uv;

  // Surface padding: black out independent bands on each side (top/bottom/left/
  // right) and remap the effect to fill the remaining content rectangle — so an
  // effect can occupy just one region of a projection surface (e.g. the floor of an
  // unfolded room) while still exporting at the full surface dimensions. padMask
  // multiplies every output below (0 = black padding, 1 = content rect).
  var padMask = 1.0;
  let bandH = 1.0 - p.padTop - p.padBottom;
  let bandW = 1.0 - p.padLeft - p.padRight;
  if (in.uv.y < p.padTop || in.uv.y > 1.0 - p.padBottom
   || in.uv.x < p.padLeft || in.uv.x > 1.0 - p.padRight
   || bandH < 0.001 || bandW < 0.001) {
    padMask = 0.0;
  } else {
    uv.y = (in.uv.y - p.padTop) / bandH;
    uv.x = (in.uv.x - p.padLeft) / bandW;
  }

  // Advection family (modes 10..14): the compute pipeline writes a state
  // texture each frame; here we just sample and present it.
  if (p.mode >= 10u && p.mode <= 14u) {
    return vec4f(textureSampleLevel(advState, samp, uv, 0.0).rgb * padMask, 1.0);
  }
  // mode 67 — fog sim: the real density-advection solver gives the large-scale
  // SHAPE + organic outward GROWTH (state texture); on top we carve high-frequency
  // internal STRUCTURE — a contrasty domain-warped fbm with real dark voids — so the
  // fog reads as countless dense veins and holes, not one solid cloud. The structure
  // drifts outward with the sim so the darkness churns rather than sitting static.
  if (p.mode == 67u) {
    let dd = textureSampleLevel(advState, samp, uv, 0.0).r;          // sim density (shape + growth)
    var q = uv; q.x = q.x * p.canvasAspect;
    var dc = uv - vec2f(p.originX, p.originY); dc.x = dc.x * p.canvasAspect;
    let rdir = select(dc / max(length(dc), 1e-5), vec2f(0.0, 0.0), length(dc) < 1e-5);
    let sc = mix(3.0, 10.0, clamp(p.maskScale / 4.0, 0.0, 1.0));
    let dr = -rdir * p.t * 0.4 + p.seed * 0.2;                       // structure churns OUTWARD (offset is inward)
    let w = vec2f(fbm(q * sc * 0.5 + dr + 3.0), fbm(q * sc * 0.5 - dr + 8.0)) - vec2f(0.5);
    var structure = fbm(q * sc + w * (1.0 + p.turbulence * 1.5) + dr);
    // soft, HAZY internal variation: gentle veins, but the voids are lifted toward
    // translucent haze (not hard holes) so it reads foggy/atmospheric like fog bloom.
    let veins = smoothstep(0.28, 0.82, structure);
    let haze = mix(veins, 1.0, 0.45);
    let coverage = 1.0 - exp(-max(dd, 0.0) * mix(1.2, 3.0, p.organic));  // softer, translucent
    // centre-out growth gate so the fog POURS outward over the whole clip and starts
    // from NOTHING (R begins negative) instead of the emitter filling the frame in a
    // few seconds and sitting full. The edge is frayed by the structure so it creeps
    // organically rather than as a clean expanding ring.
    let diag = 0.5 * sqrt(p.canvasAspect * p.canvasAspect + 1.0);
    let rr = length(dc) / diag;
    let Rg = clamp(p.t, 0.0, 1.0) * 1.5 - 0.06;
    let jagg = (structure - 0.5) * 0.5;
    let reachg = 1.0 - smoothstep(Rg - 0.28, Rg + 0.28, rr + jagg);
    let v = coverage * haze * reachg;                               // hazy fog + gate the pour
    return vec4f(vec3f(clamp(v, 0.0, 1.0)) * padMask, 1.0);
  }

  // Stretch t so the per-pixel smoothstep window (mask±spread) is fully
  // traversed for t ∈ [0,1] — without this, pixels with mask near 0 or 1
  // never fully reveal at the timeline's endpoints.
  let sp = mix(0.012, 0.7, p.spread);  // floor low so edge softness 0 = near-instant pop
  let tCurve = applyCurve(p.t, p.curve);
  let t = tCurve * (1.0 + 2.0 * sp) - sp;
  let env = pow(sin(3.14159265 * clamp(p.t, 0.0, 1.0)), 0.85);

  let cA = sampleFit(texA, uv, p.scaleA, p.offsetA, p.validA, p.slotAColor);
  let cB = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  let lA = luma(cA.rgb);
  let lB = luma(cB.rgb);

  // ---- pick a mask based on mode ----
  var mask = 0.0;
  if (p.mode == 2u) {
    mask = paperMask(uv);
    let lumMask = 0.5 + 0.5 * (lB - lA);
    mask = mix(mask, lumMask, p.organic * 0.35);
  } else if (p.mode == 3u) {
    mask = bloomsMask(uv);
  } else if (p.mode == 5u) {
    mask = sedimentMask(uv, cA.rgb, cB.rgb);
  } else if (p.mode == 6u) {
    mask = saltMask(uv, cA.rgb, cB.rgb);
  } else if (p.mode == 7u) {
    mask = irisMask(uv);
  } else if (p.mode == 8u) {
    mask = wetBleedMask(uv, lA, lB);
  } else if (p.mode == 9u) {
    mask = pigmentRunMask(uv, lA);
  } else if (p.mode == 15u) {
    mask = wetEdgeMask(uv);
  } else if (p.mode == 16u) {
    mask = strokeFollowMask(uv);
  } else if (p.mode == 17u) {
    mask = tonalGlazeMask(uv);
  } else if (p.mode == 18u) {
    mask = edgeFirstMask(uv);
  } else if (p.mode == 19u) {
    // Painterly flow: simple organic mask. The character comes from the
    // gradient-warped B sample below, not the mask.
    let n = fbm(uv * 1.8 + p.seed * 0.13);
    let grain = (vnoise(uv * 120.0 + p.seed * 1.7) - 0.5) * 0.05;
    mask = clamp(n + grain, 0.0, 1.0);
  } else if (p.mode == 20u) {
    mask = dabsMask(uv);
  } else if (p.mode == 21u) {
    mask = wetDensityMask(uv);
  } else if (p.mode == 22u) {
    mask = moldTendrilMask(uv);
  } else if (p.mode == 23u) {
    mask = watercolorFormationMask(uv);
  } else if (p.mode == 24u) {
    mask = cauliflowerBloomMask(uv);
  } else if (p.mode == 25u) {
    mask = wetStageMask(uv);
  } else if (p.mode == 26u) {
    // Pigment migration uses a soft organic mask; the cB warp below does the work.
    let n = fbm(uv * 1.5 + p.seed * 0.13);
    let grain = (vnoise(uv * 120.0 + p.seed * 1.7) - 0.5) * 0.04;
    mask = clamp(n + grain, 0.0, 1.0);
  } else if (p.mode == 27u) {
    mask = burnMask(uv);
  } else if (p.mode == 28u) {
    // Video-driven mask: T slot's video luminance (after brightness/contrast/
    // saturation adjustment) drives reveal. Invert flips polarity.
    let cT = adjustedT(uv);
    let lT = luma(cT);
    mask = clamp(select(1.0 - lT, lT, p.videoMaskInvert == 1u), 0.0, 1.0);
  } else if (p.mode == 29u) {
    mask = cellsMask(uv);
  } else if (p.mode == 30u) {
    // Light bloom: A's bright pixels reveal first (the light source in the
    // painting "burns through"); darker areas reveal as the bloom expands.
    let n = (fbm(uv * 2.5 + p.seed * 0.13) - 0.5) * 0.15;
    mask = clamp((1.0 - lA) + n, 0.0, 1.0);
  } else if (p.mode == 31u) {
    // SAM sequential region reveal: each pixel's red-channel value in
    // texRegions encodes the t at which that pixel fades (built from SAM
    // segmentation results — earlier regions = smaller pixelT, background = 1).
    let reg = textureSampleLevel(texRegions, samp, uv, 0.0);
    mask = clamp(reg.r, 0.0, 1.0);
  } else if (p.mode == 32u) {
    // Texture-source reveal: the loaded texture's luminance IS the mask, so the
    // transition reveals along the texture's tones (e.g. a watercolor wash
    // dissolving in by value). Contain-fit so the texture keeps its aspect.
    mask = texFitLuma(uv);
  } else if (p.mode == 48u) {
    mask = radialBurstMask(uv);
  } else if (p.mode == 49u) {
    mask = smokeRingMask(uv);
  } else if (p.mode == 53u) {
    mask = frostMask(uv);
  } else if (p.mode == 37u) {
    // Paint: the painted field (in texTexture) drives the reveal. Bright paint =
    // reveals early; the soft brush falloff makes each stroke grow/expand. Stroke
    // brightness encodes its start time (stagger).
    mask = clamp(1.0 - texFitLuma(uv), 0.0, 1.0);
  } else if (p.mode == 63u) {
    mask = swipeMask(uv);
  } else if (p.mode == 64u) {
    mask = mirrorMask(uv);
  } else if (p.mode == 65u) {
    mask = doorMask(uv);
  } else if (p.mode == 68u) {
    mask = boxRevealMask(uv);
  } else {
    let eA = edgeMag(texA, uv, p.scaleA, p.offsetA, p.validA, p.slotAColor);
    let eB = edgeMag(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
    mask = organicMask(uv, lA, lB, max(eA, eB));
  }

  // Global mask shift: lets the user rebalance any mode's mask distribution
  // earlier (negative) or later (positive) without touching its inner logic.
  // Useful for image-driven masks whose values cluster around the source's
  // tonal distribution rather than spreading evenly across [0,1].
  // Texture-driven dissolve: a loaded grunge / watercolor-paper texture's
  // luminance perturbs the reveal threshold, so the transition breaks up and
  // wicks along the texture instead of advancing as a clean front.
  if (p.texAmount > 0.0001) {
    let texL = texFitLuma(uv);
    mask = clamp(mask + (texL - 0.5) * p.texAmount, 0.0, 1.0);
  }
  // Origin bias: blend the mode's mask toward a radial distance from an origin
  // point so the transition grows from WITHIN (inside-out) rather than sweeping
  // from the edges. Origin defaults to centre, or is derived from image A's
  // bright focal region. The mode's own texture still breaks up the front.
  // Excluded for box reveal (68): its mask IS already an inside-out geometric
  // field, and the radial blend would round the rectangle into a soft circle.
  if (p.originAmount > 0.0001 && p.mode != 29u && p.mode != 68u) {
    let diag = sqrt(p.canvasAspect * p.canvasAspect + 1.0);
    var d = 1.0;
    var dLinear = false;   // points use a linear field (no area front-load)
    if (p.originCount == 255u) {
      // paint-origin: the painted texture (texTexture) marks where it starts
      let pl = texFitLuma(uv);
      d = clamp(1.0 - pl, 0.0, 1.0);
    } else if (p.originCount > 0u) {
      // Lamps: each placed point lights a bounded soft disc that "pops" on at its
      // stagger time. pointSize caps each lamp's radius (small = tight lamps that
      // don't fill the frame); pointPop sets how fast it reaches full size after
      // igniting (1 = instant pop, 0 = gradual grow). Edge softness (spread) then
      // softens the rim spatially — so you get an instant-on lamp with a soft glow.
      let rad  = mix(0.04, 1.5, p.pointSize * p.pointSize);  // lamp radius (curved: low = tiny lamps, high = full coverage)
      let grow = mix(0.55, 0.0, p.pointPop);            // fill duration after ignition
      for (var i = 0u; i < 16u; i = i + 1u) {
        if (i >= p.originCount) { break; }
        var v: vec4f;
        if (i < 8u) { v = p.originPts[i]; } else { v = p.originPts2[i - 8u]; }
        var duv = uv - v.xy;             // xy = point, z = start time (stagger)
        duv.x = duv.x * p.canvasAspect;
        let dist  = length(duv) / (0.5 * diag);
        let local = dist / max(rad, 0.001);            // 0 at centre, 1 at lamp edge
        // reveal threshold time at this pixel for this lamp: ignites at v.z, fills
        // the disc over the grow time, then ramps slowly outside the disc (so small
        // lamps stay small, but the frame can still fully cover by raising lamp size).
        var th = v.z + min(local, 1.0) * grow + max(0.0, local - 1.0) * 2.0;
        // fill out: past the lamp's edge, keep blooming outward (v.z + dist) so the
        // frame fully covers by t=1 instead of staying as bounded lamps.
        if (p.pointFill > 0.5) { th = min(th, v.z + dist); }
        d = min(d, clamp(th, 0.0, 1.0));
      }
      dLinear = true;
    } else {
      var duv = uv - vec2f(p.originX, p.originY);
      duv.x = duv.x * p.canvasAspect;
      d = length(duv) / (0.5 * diag);
    }
    // Front-load the radial reveal a touch: a centred front advances linearly
    // but area grows with radius², so a pure distance field (exp 1) flips most
    // of the frame in the back half (feels like "nothing, then sudden"). Raising
    // d to >1 lowers the mid/outer reveal thresholds so coverage arrives more
    // evenly (exp 2 = exactly area-linear; 1.5 is a gentle middle).
    let dShaped = select(pow(clamp(d, 0.0, 1.0), 1.5), clamp(d, 0.0, 1.0), dLinear);
    mask = mix(mask, dShaped, p.originAmount);
  }
  // Turbulence: domain-warped multi-octave noise fractures the reveal front into
  // organic, ink-in-water tendrils instead of a smooth glossy edge. Higher =
  // finer, more chaotic detail.
  if (p.turbulence > 0.0001 && p.mode != 29u && p.mode != 65u && p.mode != 68u) {
    let sc = mix(3.0, 10.0, p.turbulence);
    // Aspect-correct so the ink cells stay isotropic (don't stretch) at any
    // canvas aspect ratio — e.g. the wide ELVERKET surfaces.
    let tuv = vec2f(uv.x * p.canvasAspect, uv.y);
    // flow: drift the turbulent field over time so the ink churns and rises as
    // the transition plays, instead of a static front sweeping a fixed texture.
    let dr = p.t * p.flow * 1.6;
    let w = vec2f(fbm(tuv * sc + vec2f(dr, 0.0) + p.seed * 0.11),
                  fbm(tuv * sc + vec2f(4.7, 2.3 - dr) + p.seed * 0.11)) - vec2f(0.5, 0.5);
    let n = fbm(tuv * sc * 1.8 + w * 2.5 + vec2f(0.0, -dr) + p.seed * 0.31);
    mask = clamp(mask + (n - 0.5) * p.turbulence * 0.9, 0.0, 1.0);
  }
  // Undulate: a slow, large-scale animated wave on the reveal front so any mode
  // breathes / dances over the loop (auroras in the sky), not just a one-way wipe.
  if (p.undulate > 0.0001 && p.mode != 29u && p.mode != 65u && p.mode != 68u) {
    let fp = p.t * 6.2831853;
    let u2 = vec2f(uv.x * p.canvasAspect, uv.y);
    let wave = fbm(u2 * 1.4 + vec2f(sin(fp) * 0.4, cos(fp * 0.8) * 0.4) + p.seed * 0.2);
    mask = clamp(mask + (wave - 0.5) * p.undulate, 0.0, 1.0);
  }
  // Spread the mask across the full [0,1] timeline so the reveal keeps arriving
  // as organic shapes right up to t=1, instead of the bulk crossing by ~0.7 and
  // overblowing to white early. (Masks tend to cluster mid-range otherwise.)
  // Skipped for the centre-out geometric reveals (mirror 64 / door 65 / box 68):
  // their mask IS the distance from the seed, and the -0.1 clip would collapse the
  // central band to instant-reveal — they must grow from a true centre line/rect.
  if (p.mode != 64u && p.mode != 65u && p.mode != 68u) {
    mask = clamp((mask - 0.1) / 0.78, 0.0, 1.0);
    mask = clamp(mask + p.maskShift, 0.0, 1.0);
  }
  var mixT = clamp(smoothstep(mask - sp, mask + sp, t), 0.0, 1.0);
  if (p.mode == 29u) {
    // snap: a tiny reveal window so each cell ignites near-instantly. Edge
    // softness still scales it, but with a much lower floor than the default.
    let w29 = mix(0.004, 0.25, clamp(p.spread, 0.0, 1.0));
    mixT = clamp(smoothstep(mask - w29, mask + w29, t), 0.0, 1.0);
  }
  // Burn mode: hard step at the front — no crossfade between A and B at all.
  // The char band + glow at the front provide the only visible transition.
  // Per-pixel: A while the front hasn't passed, B once it has, with the burn
  // visuals overlaid in the brief window where char/glow are active.
  if (p.mode == 27u) {
    mixT = select(0.0, 1.0, t >= mask);
  }

  // ---- wet diffusion (mode 4): anticipatory tint of B into A ----
  var colA_eff = cA.rgb;
  // ---- wet edge (mode 15): anticipatory bleed of B into A ahead of the front ----
  if (p.mode == 15u && p.weBleed > 0.001) {
    let anticipate = smoothstep(mask - 0.35, mask + 0.05, t);
    let bR = 0.02;
    var acc = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
    var wsum = 1.0;
    for (var i = 0u; i < 6u; i = i + 1u) {
      let a = f32(i) * (6.2831853 / 6.0) + p.seed * 0.017;
      let d = vec2f(cos(a), sin(a));
      acc = acc + sampleFit(texB, uv + d * bR, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
      wsum = wsum + 1.0;
    }
    let bleedB = acc / wsum;
    let dry = 1.0 - mixT;
    colA_eff = mix(cA.rgb, bleedB, anticipate * dry * p.weBleed * 0.4);
  }
  if (p.mode == 4u && p.diffStrength > 0.001) {
    let anticipate = smoothstep(mask - 0.45, mask + 0.05, t);
    let bR = 0.025 + p.diffRadius * 0.08;
    // simple 12-tap soft blur of B
    var acc = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb * 0.35;
    var wsum = 0.35;
    for (var i = 0u; i < 12u; i = i + 1u) {
      let a = f32(i) * (6.2831853 / 12.0) + p.seed * 0.013;
      let d = vec2f(cos(a), sin(a));
      let rr = select(0.55, 1.0, (i % 2u) == 0u);
      let w = 1.0 - rr * 0.45;
      acc = acc + sampleFit(texB, uv + d * rr * bR, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb * w;
      wsum = wsum + w;
    }
    let bleedB = acc / wsum;
    let dry = 1.0 - mixT;
    colA_eff = mix(cA.rgb, bleedB, anticipate * dry * p.diffStrength * 0.55);
  }

  // Mode 19 (painterly flow): sample B at a position warped along its own
  // gradient field, so paint "flows into place" as t→1.
  var cB_eff = cB.rgb;
  if (p.mode == 19u) {
    let ee = 0.005;
    let gx = luma(sampleFit(texB, uv + vec2f( ee, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, uv - vec2f( ee, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let gy = luma(sampleFit(texB, uv + vec2f(0.0,  ee), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, uv - vec2f(0.0,  ee), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let grad = vec2f(gx, gy);
    let glen = length(grad);
    if (glen > 1e-4) {
      let flowDir = vec2f(-grad.y, grad.x) / glen;
      let baseAmt = (1.0 - tCurve) * p.flowAmount * 0.18;
      // Wobble the warp amount so streaks aren't uniform — analog feel.
      let wob = (fbm(uv * 4.0 + p.seed * 0.21) - 0.5) * 0.5;
      cB_eff = sampleFit(texB, uv + flowDir * baseAmt * (1.0 + wob), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
    }
  }

  // Mode 26 (pigment migration): sample B at a position offset along (or
  // perpendicular to) B's own gradient; offset shrinks as t→1 so pigment
  // "flows into place".
  if (p.mode == 26u) {
    let ee = 0.005;
    let gx = luma(sampleFit(texB, uv + vec2f( ee, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, uv - vec2f( ee, 0.0), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let gy = luma(sampleFit(texB, uv + vec2f(0.0,  ee), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb)
           - luma(sampleFit(texB, uv - vec2f(0.0,  ee), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb);
    let grad = vec2f(gx, gy);
    let glen = length(grad);
    if (glen > 1e-4) {
      let dirAlong = select(grad / glen, vec2f(-grad.y, grad.x) / glen, p.migrationDir == 1u);
      let baseAmt = (1.0 - tCurve) * p.migrationStrength * 0.28;
      // Multi-scale turbulence on the displacement magnitude.
      let turb1 = (fbm(uv * 3.0  + p.seed * 0.21) - 0.5) * 0.6;
      let turb2 = (fbm(uv * 12.0 + p.seed * 0.47) - 0.5) * 0.3;
      let turbMul = 1.0 + (turb1 + turb2) * p.migrationTurb;
      cB_eff = sampleFit(texB, uv + dirAlong * baseAmt * turbMul, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
    }
  }

  // T-video displacement (global, applies to any mode) — use the T video's
  // luma gradient to push A and B independently. videoDisplaceB is signed:
  // negative pushes B opposite to A's direction. Safe with no video loaded —
  // placeholder texture has zero gradient.
  if (abs(p.videoDisplace) > 0.001 || abs(p.videoDisplaceB) > 0.001) {
    let e = 0.005;
    let lL = luma(adjustedT(uv - vec2f(e, 0.0)));
    let lR = luma(adjustedT(uv + vec2f(e, 0.0)));
    let lU = luma(adjustedT(uv - vec2f(0.0, e)));
    let lD = luma(adjustedT(uv + vec2f(0.0, e)));
    let dispBase = vec2f(lR - lL, lD - lU) * 0.08 * p.videoDisplaceAmount;
    colA_eff = sampleFit(texA, uv + dispBase * p.videoDisplace,  p.scaleA, p.offsetA, p.validA, p.slotAColor).rgb;
    cB_eff   = sampleFit(texB, uv + dispBase * p.videoDisplaceB, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
  }

  // Invert matte also reverses the A->B reveal direction in colour preview, so
  // the effect can REVEAL A (image appears) instead of dissolving it away.
  let mixV = select(mixT, 1.0 - mixT, p.matteInvert == 1u);
  var outc = mix(colA_eff, cB_eff, mixV);

  // Tonal glaze warm tint (mode 17): pull glaze color slightly toward warm
  // pigment as it dries — a faint chromatic "settling" you see in real paint.
  if (p.mode == 17u && p.glazeWarm > 0.001) {
    let warmTint = outc * vec3f(1.04, 1.0, 0.94);
    outc = mix(outc, warmTint, p.glazeWarm * mixT);
  }

  // ---- rim post-process (modes 1 and 3) ----
  if ((p.mode == 1u || p.mode == 3u) && env > 0.02) {
    let rimW = select(p.rimWidth * 0.4, p.bloomRim * 0.5, p.mode == 3u);
    if (rimW > 0.001) {
      let band = 1.0 - smoothstep(0.0, rimW, abs(t - mask));
      let base = mix(cA.rgb, cB.rgb, 0.65);
      let lm = luma(base);
      let chromaBoost = clamp(mix(vec3f(lm), base, 1.35), vec3f(0.0), vec3f(1.0));
      let rim = chromaBoost * 0.78;
      let darkness = select(p.rimDark, p.bloomRim, p.mode == 3u);
      let fade = env * env;
      outc = mix(outc, rim, band * darkness * fade * 0.85);
    }
  }

  // ---- wet bleed halo (mode 8) ----
  if (p.mode == 8u && p.bleedHalo > 0.001 && env > 0.02 && t > mask) {
    let haloW = 0.005 + p.bleedHalo * 0.06;
    let band = exp(-pow((t - mask) / haloW, 2.0));
    let base = mix(cA.rgb, cB.rgb, 0.75);
    let lm = luma(base);
    let saturated = clamp(mix(vec3f(lm), base, 1.5), vec3f(0.0), vec3f(1.0));
    outc = mix(outc, saturated, band * p.bleedHalo * env * 0.4);
  }

  // ---- wet edge dry-ring (mode 15): dark watercolor bead at the wet front ----
  if (p.mode == 15u && p.weDryRing > 0.001 && env > 0.02) {
    let ringW = 0.03;
    let band = exp(-pow((t - mask) / ringW, 2.0));
    let base = mix(cA.rgb, cB.rgb, 0.6);
    let lm = luma(base);
    let darker = clamp(base * 0.4 + vec3f(lm * 0.08), vec3f(0.0), vec3f(1.0));
    outc = mix(outc, darker, band * p.weDryRing * env * 0.55);
  }

  // ---- pigment run drip (mode 9) ----
  if (p.mode == 9u && p.runDrip > 0.001 && env > 0.02 && t > mask) {
    let dripBand = exp(-pow((t - mask) / 0.08, 2.0));
    let dripB = sampleFit(texB, uv + vec2f(0.0, p.runDrip * 0.05), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
    outc = mix(outc, dripB, dripBand * p.runDrip * env * 0.35);
  }

  // ---- edge underdrawing sketch overlay (mode 18) ----
  if (p.mode == 18u && p.edgeFirstInk > 0.001) {
    let eB = edgeMag(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
    // Ink ramps in fast, then fades as color floods in.
    let inUp = smoothstep(0.0, 0.18, p.t);
    let inDn = 1.0 - smoothstep(p.edgeFirstFade, p.edgeFirstFade + 0.18, p.t);
    let inkColor = vec3f(0.04, 0.03, 0.025);
    let inkAmt = clamp(eB * 3.0, 0.0, 1.0) * inUp * inDn * p.edgeFirstInk;
    outc = mix(outc, inkColor, inkAmt);
  }

  // ---- wet-density vertical smear (mode 21) ----
  if (p.mode == 21u && p.densitySmear > 0.001 && env > 0.02) {
    let anticipate = smoothstep(mask - 0.25, mask + 0.05, t) * (1.0 - mixT);
    let smearB = sampleFit(texB, uv - vec2f(0.0, 0.025), p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
    outc = mix(outc, smearB, anticipate * p.densitySmear * env * 0.5);
  }

  // ---- watercolor character (modes 23..26): dark wet rim + paper-show pop + granulation ----
  if (p.mode >= 23u && p.mode <= 26u && env > 0.02) {
    // Cauliflower-style dark rim at the wet front
    let rimW = 0.04;
    let band = exp(-pow((t - mask) / rimW, 2.0));
    let baseRim = mix(cA.rgb, cB_eff, 0.55);
    let darker = clamp(baseRim * 0.42, vec3f(0.0), vec3f(1.0));
    outc = mix(outc, darker, band * env * 0.45);
    // Paper-show-through pop: B's brightest pixels briefly flash even brighter
    // (mimics paper exposed through the wash)
    let lumB = luma(cB_eff);
    let popThresh = 0.7;
    let popPhase = smoothstep(0.2, 0.5, mixT) * (1.0 - smoothstep(0.65, 0.95, mixT));
    let popAmt = max(0.0, lumB - popThresh) / max(1e-4, 1.0 - popThresh);
    outc = mix(outc, vec3f(0.95, 0.93, 0.88), popAmt * popPhase * 0.65);
    // Granulation: high-freq + mid-freq per-pixel value variation
    let g1 = (vnoise(uv * 220.0 + p.seed * 1.7) - 0.5) * 0.08;
    let g2 = (vnoise(uv *  70.0 + p.seed * 0.7) - 0.5) * 0.04;
    outc = clamp(outc + vec3f(g1 + g2) * mixT * 0.65, vec3f(0.0), vec3f(1.0));
  }

  // ---- video mask feather (mode 28): blend the video's actual pixels at the
  // transition front so the video's visible content (like its own burnt edges,
  // smoke, ink, etc.) shows through the transition.
  if (p.mode == 28u && p.videoMaskFeather > 0.001) {
    let cT = adjustedT(uv);
    // Peak at the active front (mixT ≈ 0.5), falls off either side. 4xy(1-xy)
    // gives a 0..1 dome centred on mixT=0.5.
    let frontProx = 4.0 * mixT * (1.0 - mixT);
    outc = mix(outc, cT, frontProx * p.videoMaskFeather);
  }

  // ---- light bloom (mode 30): a light source in A intensifies, overexposes
  // the canvas, then fades to reveal B. Local glow is anchored to A's bright
  // pixels (the painting's actual light source); a universal flash gives the
  // brief moment of total overexposure at lightPeakT.
  if (p.mode == 30u) {
    let lAlocal     = luma(cA.rgb);
    let bloomEnv    = exp(-pow((p.t - p.lightPeakT) / 0.28, 2.0));
    let flashEnv    = exp(-pow((p.t - p.lightPeakT) / max(0.02, p.lightFlashWidth), 2.0));
    // lightSpread: 0 → only the brightest A pixels glow; 1 → uniform bloom
    let spreadCurve = pow(lAlocal, max(0.05, 1.0 - p.lightSpread));
    let localGlow   = spreadCurve * bloomEnv * 1.6;
    let universal   = flashEnv * 1.2;
    let totalBloom  = (localGlow + universal) * p.lightIntensity;
    // the overexposed white burns through to B: where the bloom is brightest, B
    // emerges out of the glare (gated by mixT so it reveals on the way in),
    // instead of A blowing to flat white then a separate crossfade.
    let bloomReveal = smoothstep(0.3, 1.0, totalBloom) * smoothstep(0.0, 0.5, mixT);
    let mBloom = max(mixT, bloomReveal);
    outc = mix(cA.rgb, cB.rgb, mBloom);
    outc = clamp(outc + p.lightColor * totalBloom * (1.0 - bloomReveal * 0.6), vec3f(0.0), vec3f(1.0));
  }

  // ---- film melt (mode 29): dark ink lines on cell boundaries + hot glow at front ----
  if (p.mode == 29u) {
    let scale = max(2.0, p.meltCellScale);
    let cell = cellDist(uv, scale, p.seed);
    // d2 - d1 → small near a cell boundary. Convert to a dark ink line tint
    // weighted by how revealed this region is (so lines only appear behind
    // the front, mimicking the dark veins between melted bubbles).
    let boundary = cell.y - cell.x;
    let ink = smoothstep(0.08, 0.0, boundary);
    outc = mix(outc, vec3f(0.03, 0.02, 0.015), ink * p.meltInkAmount * mixT);
    // Hot glow at the active front (where the melt is actively spreading).
    if (p.meltGlowIntensity > 0.001) {
      let pastFront = t - mask;
      let glow = exp(-pow(pastFront / 0.05, 2.0));
      outc = clamp(outc + p.meltGlowColor * glow * p.meltGlowIntensity * 0.6, vec3f(0.0), vec3f(1.0));
    }
  }

  // ---- paper scorch (mode 27): analog burn that burns a HOLE in A revealing B ----
  if (p.mode == 27u) {
    let pastFront = t - mask;
    // Burn artifacts gated only by the end-of-timeline fade. With hard-step
    // mixT, per-pixel mixT-based gating would snap effects off the instant the
    // front passes — char/glow fade naturally via their own time curves
    // (charFade, glow trail) which preserve the visible burn band.
    let burnGate = 1.0 - smoothstep(0.95, 1.0, p.t);

    // Char as an asymmetric Gaussian peaked at the front: wide on the A side
    // (paper charring before it burns through) and a narrow trailing edge on
    // the B side so B emerges clean (not held dim by lingering char).
    let charPreSigma  = max(0.005, p.burnCharWidth * 0.85);
    let charPostSigma = max(0.002, p.burnCharWidth * 0.15);
    let charBase      = select(
      exp(-pow(-pastFront / charPreSigma,  2.0)),
      exp(-pow( pastFront / charPostSigma, 2.0)),
      pastFront >= 0.0,
    );
    // Persistence keeps char on the B side beyond the narrow trailing edge.
    let charPersist = p.burnCharPersistence * select(0.0, 1.0, pastFront > 0.0);
    let charLow     = fbm(uv * 6.0 + p.seed * 0.31);
    let charHi      = vnoise(uv * 220.0 + p.seed * 1.1) - 0.5;
    let charAmt     = clamp(max(charBase, charPersist) * (1.0 + charLow * 0.3) + charHi * 0.04 * charBase, 0.0, 1.0);
    let charColor   = vec3f(0.010, 0.006, 0.004) * (1.0 + charHi * 0.25);
    outc = mix(outc, charColor, charAmt * p.burnCharIntensity * burnGate);

    // Color carry-over — A's pigment lingers briefly into the revealed area
    // past the front so B "is born from" A. Decays past the front.
    if (pastFront > 0.0 && p.burnColorBleed > 0.001) {
      let stainW   = max(0.03, p.burnCharWidth * 3.0);
      let stainAmt = exp(-pow(pastFront / stainW, 1.4));
      outc = mix(outc, cA.rgb, stainAmt * p.burnColorBleed);
    }

    // Browning halo AHEAD of the front — paper discolours from heat before
    // burning. Use select() so the falloff only applies on the ahead side;
    // otherwise exp(0) on the wrong side tints every burnt pixel forever.
    if (p.burnBrowning > 0.001) {
      let brownW    = max(0.01, p.burnBrowningWidth);
      let brownAmt  = select(0.0, exp(-pow(-pastFront / brownW, 1.5)), pastFront < 0.0);
      let brownTint = vec3f(0.42, 0.24, 0.10);
      outc = mix(outc, outc * brownTint * 1.6, brownAmt * p.burnBrowning * 0.55 * burnGate);
    }

    // Ash spatter — sparse random dark particulates clustered near the front.
    if (p.burnAshSpatter > 0.001) {
      let spotN     = vnoise(uv * 130.0 + p.seed * 0.7);
      let spotThr   = 0.90 - p.burnAshSpatter * 0.18;        // sparser dots (higher threshold)
      let spotMask  = smoothstep(spotThr, spotThr + 0.03, spotN);
      let nearFront = exp(-pow(pastFront / 0.08, 2.0));
      outc = mix(outc, vec3f(0.015, 0.01, 0.008), spotMask * nearFront * p.burnAshSpatter * 0.5 * burnGate);
    }

    // Glow: tight Gaussian ahead, longer asymmetric trail behind.
    let glowW   = max(0.005, p.burnGlowWidth * 0.06);
    let trailW  = glowW * (1.0 + p.burnEmberTrail * 6.0);
    let glowBand = select(
      exp(-pow(-pastFront / glowW,  2.0)),
      exp(-pow( pastFront / trailW, 1.4)),
      pastFront >= 0.0,
    );
    let glowVar  = fbm(uv * 14.0 + p.seed * 0.13) * 0.7 + 0.55;
    var glowColor = p.burnGlowColor;
    if (p.burnGlowFromB > 0.001) {
      let bColor = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor).rgb;
      glowColor = mix(p.burnGlowColor, bColor, p.burnGlowFromB);
    }
    outc = clamp(outc + glowColor * glowBand * glowVar * p.burnGlowIntensity * 0.7 * burnGate, vec3f(0.0), vec3f(1.0));
  }

  // ---- global transition bounds: outside the box, restore unmodified A ----
  if (p.boundsEnable == 1u) {
    let hw = p.boundsW * 0.5;
    let hh = p.boundsH * 0.5;
    let dx = abs(uv.x - p.boundsCx) - hw;
    let dy = abs(uv.y - p.boundsCy) - hh;
    let outsideDist = max(dx, dy);
    var bMul = 1.0;
    if (p.boundsSoftness > 0.0001) {
      bMul = 1.0 - smoothstep(0.0, p.boundsSoftness, outsideDist);
    } else if (outsideDist > 0.0) {
      bMul = 0.0;
    }
    outc = mix(cA.rgb, outc, bMul);
  }

  // ---- global paper grain (all modes, opt-in) ----
  if (p.paperGrain > 0.001) {
    let fib = paperFiber(uv);
    let mul = 1.0 + fib * p.paperGrain * 0.18;
    outc = clamp(outc * mul, vec3f(0.0), vec3f(1.0));
    let warmShift = outc * vec3f(1.02, 0.995, 0.96);
    outc = mix(outc, warmShift, p.paperGrain * 0.15);
  }

  // Keep A as unchanged background outside B's rect when toggled — useful when
  // B is smaller than the canvas (e.g. contained / zoomed-out).
  var effMixT = mixT;
  if (p.keepAOutsideB == 1u) {
    let q = (uv - p.offsetB) / p.scaleB;
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) {
      outc = cA.rgb;
      effMixT = 0.0;
    }
  }

  // ---- glowing front rim (modes 48 burst / 49 smoke ring) ----
  // A bright band tracks the reveal front (where t ~= mask), giving the energetic
  // glow seen in the reference clips. In colour preview it's a cool luminous rim;
  // it also lifts the matte a touch ahead of the front so the B/W reads as light.
  if ((p.mode == 48u || p.mode == 49u) && p.ambRole < 0.5) {
    let bandW = sp * 1.6 + 0.025;
    let band = exp(-pow((t - mask) / bandW, 2.0));        // gaussian around the front
    let glowVar = 0.55 + 0.55 * fbm(uv * 8.0 + p.seed * 0.2 + p.t * p.flow);
    let g = clamp(band * glowVar * env, 0.0, 1.5);
    let glowCol = vec3f(0.55, 0.7, 1.0);                  // cool blue, like the refs
    outc = clamp(outc + glowCol * g * 0.9, vec3f(0.0), vec3f(1.0));
    effMixT = clamp(effMixT + g * 0.25, 0.0, 1.0);        // soft leading glow in the matte
  }

  // Ambient/lingering modes output a looping field directly (not a 0->1 reveal).
  var ambF = -1.0;
  if (p.mode == 33u) { ambF = ambBokeh(uv); }
  else if (p.mode == 34u) { ambF = ambRipples(uv); }
  else if (p.mode == 35u) { ambF = ambGlare(uv); }
  else if (p.mode == 36u) { ambF = ambStreaks(uv); }
  else if (p.mode == 38u) { ambF = ambAurora(uv); }
  else if (p.mode == 39u) { ambF = ambGodrays(uv); }
  else if (p.mode == 40u) { ambF = ambClouds(uv); }
  else if (p.mode == 41u) { ambF = ambCaustics(uv); }
  else if (p.mode == 42u) { ambF = ambEmbers(uv); }
  else if (p.mode == 43u) { ambF = ambMist(uv); }
  else if (p.mode == 44u) { ambF = ambRain(uv); }
  else if (p.mode == 45u) { ambF = ambSnow(uv); }
  else if (p.mode == 46u) { ambF = ambMarble(uv); }
  else if (p.mode == 47u) { ambF = ambBlooms(uv); }
  else if (p.mode == 50u) { ambF = ambSmoke(uv); }
  else if (p.mode == 51u) { ambF = ambFire(uv); }
  else if (p.mode == 52u) { ambF = ambVolFog(uv); }
  else if (p.mode == 54u) { ambF = ambForestLight(uv); }
  else if (p.mode == 55u) { ambF = ambInk(uv); }
  else if (p.mode == 56u) { ambF = ambSunBokeh(uv); }
  else if (p.mode == 57u) { ambF = ambWaterShimmer(uv); }
  else if (p.mode == 58u) { ambF = ambSilk(uv); }
  else if (p.mode == 59u) { ambF = ambInkPaper(uv); }
  else if (p.mode == 60u) { ambF = ambNebula(uv); }
  else if (p.mode == 61u) { ambF = ambCaustics2(uv); }
  else if (p.mode == 62u) { ambF = ambFootageMatte(uv); }
  else if (p.mode == 66u) { ambF = fogBloomField(uv); }
  // modes 48/49 act as standalone looping fields when the role toggle is set;
  // otherwise they stay on the normal reveal path above (ambF left at -1).
  else if (p.mode == 48u && p.ambRole >= 0.5) { ambF = radialBurstField(uv); }
  else if (p.mode == 49u && p.ambRole >= 0.5) { ambF = smokeRingField(uv); }
  if (ambF >= 0.0 && p.mode != 34u && p.mode != 66u) { ambF = ambPointBias(uv, ambF); }
  if (ambF >= 0.0) {
    // ambRole 0 = REVEAL: a threshold sweeps high->low over t so the field goes
    // black (t=0) -> white (t=1), the bright parts of the pattern crossing first.
    // This is a real B/W transition matte and works WITH OR WITHOUT images (with
    // A+B it also dissolves A->B). ambRole 1 = standalone looping field.
    // Mode 66 (fog bloom) always emits its translucent grayscale field directly —
    // it bakes its own centre-out growth, so it must not go through the A/B sweep.
    if (p.ambRole < 0.5 && p.mode != 62u && p.mode != 66u) {
      let sft = mix(0.05, 0.4, p.ambSoft);
      var fld = ambF;
      // origin from placed points: subtract a distance ramp so areas near the
      // points cross the threshold (reveal B) earlier than far ones.
      if (p.originCount > 0u && p.originCount < 200u && p.mode != 34u) {
        let diag = sqrt(p.canvasAspect * p.canvasAspect + 1.0);
        var nearest = 1.0;
        for (var i = 0u; i < 8u; i = i + 1u) {
          if (i >= p.originCount) { break; }
          var duv = uv - p.originPts[i].xy; duv.x = duv.x * p.canvasAspect;
          nearest = min(nearest, length(duv) / (0.5 * diag));
        }
        fld = clamp(fld + (1.0 - nearest) * 0.6, 0.0, 1.0);
      }
      let edge = mix(1.0 + sft, -sft, p.t);
      let m = smoothstep(edge, edge + sft, fld);
      effMixT = m;
      outc = mix(cA.rgb, cB.rgb, m);
    } else {
      // standalone: the ambient field IS the matte — it doesn't transition the
      // images, so show the clean grayscale field (no base-mask image edges).
      effMixT = ambF;
      outc = vec3f(ambF);
    }
  }
  // Per-slot alpha comes straight from sampleFit: a PNG's own alpha channel for
  // image slots (valid==1u), 0 for 'transparent' fill mode (valid==3u), and 1 for
  // bg/solid (valid 0u/2u). Final alpha mixes the same way as RGB; output is
  // premultiplied for correct canvas compositing and AE imports.
  let alphaA = cA.a;
  let alphaB = cB.a;
  let alpha = mix(alphaA, alphaB, effMixT);

  // ---- matte output: emit the transition reveal as a grayscale luma matte
  // (black = still A / not transitioned, white = fully B / transitioned) so
  // the exact same organic movement can be recorded as a B/W matte video for
  // use as a luma/track matte in After Effects. Fully opaque so it records
  // cleanly. matteInvert flips polarity for "reveal A over B" style mattes.
  // ---- global vignette: darken toward the edges; optional slow pulse ----
  var vign = 1.0;
  if (p.vignAmount > 0.001) {
    // rectangular (squircle) falloff: follows the canvas edges instead of an
    // ellipse. q is per-axis distance to each edge (0 center .. 1 at the edge);
    // the 4-norm darkens all four edges proportionally with soft rounded corners.
    let q = abs(uv - vec2f(0.5, 0.5)) * 2.0;
    // shape: 0 = ellipse (2-norm) .. 1 = rectangle (high p-norm). Edge-midpoints
    // always sit at vd=1 (any p), so the falloff follows the canvas proportions
    // regardless of aspect; corners run 1.41 (ellipse) -> 1.0 (rect).
    let pn = mix(2.0, 12.0, p.vignShape);
    var vd = pow(pow(q.x, pn) + pow(q.y, pn), 1.0 / pn);  // 0 center .. 1 edge
    let anim = 1.0 - p.vignAnimate * 0.3 * (0.5 - 0.5 * cos(p.t * 6.2831853));
    // smart edge texture: a drifting fbm "dark cloud" field that makes the edge
    // ragged + organically mottled, so the vignette eats into the effect with a
    // dark textured border instead of a flat darkening. Seamless circular drift.
    var bite = 1.0;
    if (p.vignTexture > 0.001) {
      var tuv = uv; tuv.x = tuv.x * p.canvasAspect;
      let drift = vec2f(sin(p.t * 6.2831853), cos(p.t * 6.2831853)) * 0.10;
      let w = vec2f(fbm(tuv * 2.2 + drift), fbm(tuv * 2.2 + 5.0 - drift)) - vec2f(0.5, 0.5);
      let nz = fbm(tuv * 3.4 + w * 1.3 + drift);
      vd = vd + (nz - 0.5) * p.vignTexture * 0.5;          // ragged organic boundary
      bite = 0.3 + 0.7 * nz;                                // dark mottling within the band
    }
    let inner = clamp((1.0 - p.vignFeather) * anim, 0.0, 0.999);
    let band = smoothstep(inner, anim, vd);                 // 0 inside .. 1 at the edge
    vign = clamp(1.0 - band * p.vignAmount * mix(1.0, bite, p.vignTexture), 0.0, 1.0);
  }
  if (p.matteOutput == 1u) {
    var mv = clamp(effMixT, 0.0, 1.0);
    if (p.matteInvert == 1u) { mv = 1.0 - mv; }
    mv = grade1(mv);                                        // global grade (levels/bright/contrast)
    // gradient-map: texLut is a grayscale ramp by default (⇒ pure B/W matte), or
    // a colour ramp for on-screen colourising (swapped back to gray when recording).
    var col = textureSample(texLut, samp, vec2f(mv, 0.5)).rgb;
    return vec4f(col * vign * padMask, 1.0);
  }

  // Texture overlay on the composite (image/preview look only — the matte path
  // returned above, keeping the matte clean). Paper/grunge multiplied in.
  if (p.texBg > 0.0001) {
    let texL = texFitLuma(uv);
    outc = mix(outc, outc * (0.4 + 1.2 * texL), p.texBg);
  }
  let rgb = clamp(outc * vign, vec3f(0.0), vec3f(1.0));
  let graded = vec3f(grade1(rgb.r), grade1(rgb.g), grade1(rgb.b));
  return vec4f(graded * padMask, alpha * padMask);
}
`;

export const SIM_SHADER = /* wgsl */`
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

${PARAMS_STRUCT}

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var texA: texture_2d<f32>;
@group(0) @binding(2) var texB: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var stateIn: texture_2d<f32>;
@group(0) @binding(5) var texT: texture_2d<f32>;
@group(0) @binding(6) var texRegions: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) idx: u32) -> VSOut {
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  );
  var out: VSOut;
  out.pos = vec4f(positions[idx], 0.0, 1.0);
  out.uv = uvs[idx];
  return out;
}

fn hash21(q: vec2f) -> f32 {
  var x = fract(q * vec2f(123.34, 456.21));
  x += dot(x, x + 45.32);
  return fract(x.x * x.y);
}
fn vnoise(q: vec2f) -> f32 {
  let i = floor(q); let f = fract(q);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(q: vec2f) -> f32 {
  var v = 0.0; var amp = 0.5; var pp = q;
  for (var i = 0; i < 4; i = i + 1) { v += amp * vnoise(pp); pp *= 2.03; amp *= 0.5; }
  return v;
}
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.299, 0.587, 0.114)); }
fn sampleFit(tex: texture_2d<f32>, uv: vec2f, scale: vec2f, offset: vec2f, valid: u32, color: vec3f) -> vec4f {
  if (valid == 0u) { return vec4f(p.bg, 1.0); }
  if (valid == 2u) { return vec4f(color, 1.0); }
  if (valid == 3u) { return vec4f(0.0, 0.0, 0.0, 0.0); }
  let q = (uv - offset) / scale;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { return vec4f(p.bg, 1.0); }
  return textureSampleLevel(tex, samp, q, 0.0);
}

fn curlField(uv: vec2f) -> vec2f {
  let e = 0.004;
  let pos = uv * p.advCurlScale;
  let pyp = fbm(pos + vec2f(0.0, e));
  let pyn = fbm(pos - vec2f(0.0, e));
  let pxp = fbm(pos + vec2f(e, 0.0));
  let pxn = fbm(pos - vec2f(e, 0.0));
  return vec2f(pyp - pyn, pxn - pxp);
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let uv = in.uv;
  let dims = vec2f(textureDimensions(stateIn));
  let px = 1.0 / dims;

  // ---- mode 67: real semi-Lagrangian DENSITY ADVECTION (fog sim) ----
  // A density field with memory (this ping-pong texture) carried each step by a
  // DIVERGENCE-FREE velocity = radial outward + curl-noise vortices. A central
  // emitter injects density; low dissipation + outflow balance it. This is genuine
  // fluid behaviour — mass transport, accumulation, mushrooming — accumulated over
  // the many steps the driver runs, with no pressure solve (the velocity is
  // divergence-free by construction, so fog still rolls/folds like a real sim).
  //   originX/Y = emitter   organic = emit density   maskScale = vortex scale
  //   flow = pour / advection speed   turbulence = vortex strength
  //   spread = persistence (low dissipation)   edges = emitter radius   seed = variation
  if (p.mode == 67u) {
    let asp = p.canvasAspect;
    var dca = vec2f((uv.x - p.originX) * asp, uv.y - p.originY);  // aspect-correct offset from centre
    let r = length(dca);
    let rdir = select(dca / max(r, 1e-5), vec2f(0.0, 0.0), r < 1e-5);
    // curl-noise velocity (curl of an fbm potential -> divergence-free vortices)
    let cs = mix(1.5, 5.0, clamp(p.maskScale / 4.0, 0.0, 1.0));
    let an = p.t * (0.1 + p.flow * 0.4);
    let e = 0.01;
    let pos = vec2f(uv.x * asp, uv.y) * cs + an;
    let cx = fbm(pos + vec2f(0.0, e)) - fbm(pos - vec2f(0.0, e));
    let cy = fbm(pos + vec2f(e, 0.0)) - fbm(pos - vec2f(e, 0.0));
    let curl = vec2f(cx, -cy) / (2.0 * e);
    // strong OUTWARD radial push (360° fog machine); curl only adds rolling detail,
    // it must not dominate or the flow reads as swirling/sucking inward.
    var vel = rdir * (1.1 + p.flow * 1.8) + curl * (0.2 + p.turbulence * 1.0);
    vel.y = vel.y - (0.25 + p.undulate * 1.6);            // upward RISE bias (undulate); up is -y
    let velUV = vec2f(vel.x / asp, vel.y);                 // back to uv space for the trace
    let dt = 0.0022 * (0.5 + p.flow);                      // small advection per step
    let prev = textureSampleLevel(stateIn, samp, uv - velUV * dt, 0.0).r;
    let emitRad = mix(0.03, 0.18, clamp(p.edges * 0.5 + 0.5, 0.0, 1.0));
    // STRUCTURED source: modulate the emitter by noise so density is born in organic
    // clumps (not a smooth disc) — those clumps then advect/roll outward, and the
    // gaps between them carry through as the dark voids real fog has.
    let emitN = 0.35 + 0.65 * fbm(pos * 1.7 + an * 1.5);
    let emit = exp(-(r * r) / (emitRad * emitRad)) * (0.06 + p.organic * 0.12) * emitN;
    let diss = 0.004 + (1.0 - p.spread) * 0.02;            // low dissipation (spread = persistence)
    var d = prev * (1.0 - diss) + emit;
    d = clamp(d, 0.0, 1.4);
    return vec4f(vec3f(d), 1.0);
  }

  let cA = sampleFit(texA, uv, p.scaleA, p.offsetA, p.validA, p.slotAColor);
  let cB = sampleFit(texB, uv, p.scaleB, p.offsetB, p.validB, p.slotBColor);
  let lA = luma(cA.rgb); let lB = luma(cB.rgb);

  // ---- read previous state, optionally pre-advected (variant 2: curl) ----
  var cur: vec3f;
  if (p.advVariant == 2u && p.advCurlStr > 0.001) {
    let vel = curlField(uv) * p.advCurlStr * 0.06;
    cur = textureSampleLevel(stateIn, samp, uv - vel, 0.0).rgb;
  } else {
    cur = textureSampleLevel(stateIn, samp, uv, 0.0).rgb;
  }

  // ---- diffusion kernel ----
  var nb: vec3f;
  if (p.advVariant == 1u) {
    // Gravity: anisotropic kernel along the flow direction.
    let a = p.advGravAngle * 6.2831853;
    let flowDir = vec2f(sin(a), -cos(a));
    let perp = vec2f(-flowDir.y, flowDir.x);
    let streak = 1.0 + p.advGravStreak * 2.5;
    let upstep   = -flowDir * px.x * streak;
    let downstep =  flowDir * px.x * streak;
    let latstep  =  perp    * px.x;
    let wUp   = 1.0 + p.advGravity * 1.6;
    let wDown = max(0.0, 1.0 - p.advGravity * 0.85);
    let wLat  = 0.3 + p.advGravLateral * 1.4;
    let wDiagU = (wUp   + wLat) * 0.5;
    let wDiagD = (wDown + wLat) * 0.5;
    let wsum   = wUp + wDown + 2.0 * wLat + 2.0 * wDiagU + 2.0 * wDiagD;
    nb = (
      textureSampleLevel(stateIn, samp, uv + upstep, 0.0).rgb * wUp +
      textureSampleLevel(stateIn, samp, uv + downstep, 0.0).rgb * wDown +
      textureSampleLevel(stateIn, samp, uv + latstep, 0.0).rgb * wLat +
      textureSampleLevel(stateIn, samp, uv - latstep, 0.0).rgb * wLat +
      textureSampleLevel(stateIn, samp, uv + upstep * 0.7071 + latstep * 0.7071, 0.0).rgb * wDiagU +
      textureSampleLevel(stateIn, samp, uv + upstep * 0.7071 - latstep * 0.7071, 0.0).rgb * wDiagU +
      textureSampleLevel(stateIn, samp, uv + downstep * 0.7071 + latstep * 0.7071, 0.0).rgb * wDiagD +
      textureSampleLevel(stateIn, samp, uv + downstep * 0.7071 - latstep * 0.7071, 0.0).rgb * wDiagD
    ) / wsum;
  } else if (p.advVariant == 3u) {
    // Brush-channel: diffusion along A's local stroke direction.
    let e = 0.003;
    let gx = luma(sampleFit(texA, uv + vec2f(e, 0.0), p.scaleA, p.offsetA, p.validA, p.slotAColor).rgb) -
             luma(sampleFit(texA, uv - vec2f(e, 0.0), p.scaleA, p.offsetA, p.validA, p.slotAColor).rgb);
    let gy = luma(sampleFit(texA, uv + vec2f(0.0, e), p.scaleA, p.offsetA, p.validA, p.slotAColor).rgb) -
             luma(sampleFit(texA, uv - vec2f(0.0, e), p.scaleA, p.offsetA, p.validA, p.slotAColor).rgb);
    let grad = vec2f(gx, gy);
    let glen = length(grad);
    let sd = select(vec2f(1.0, 0.0), vec2f(-grad.y, grad.x) / glen, glen > 1e-4);
    let perp = vec2f(-sd.y, sd.x);
    let follow = p.advBrushFollow;
    let wAlong = 1.0 + follow * 1.5;
    let wPerp  = max(0.0, 1.0 - follow * 0.85);
    nb = (
      textureSampleLevel(stateIn, samp, uv + sd * px.x * 1.4, 0.0).rgb * wAlong +
      textureSampleLevel(stateIn, samp, uv - sd * px.x * 1.4, 0.0).rgb * wAlong +
      textureSampleLevel(stateIn, samp, uv + perp * px.x, 0.0).rgb * wPerp +
      textureSampleLevel(stateIn, samp, uv - perp * px.x, 0.0).rgb * wPerp
    ) / (2.0 * wAlong + 2.0 * wPerp + 1e-4);
  } else {
    // Isotropic 8-tap (variants 0, 2, 4)
    nb = (
      textureSampleLevel(stateIn, samp, uv + vec2f(px.x, 0.0), 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv - vec2f(px.x, 0.0), 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv + vec2f(0.0, px.y), 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv - vec2f(0.0, px.y), 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv + px * 0.7071, 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv - px * 0.7071, 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv + vec2f(px.x, -px.y) * 0.7071, 0.0).rgb +
      textureSampleLevel(stateIn, samp, uv + vec2f(-px.x, px.y) * 0.7071, 0.0).rgb
    ) * 0.125;
  }
  let diffused = mix(cur, nb, p.advVisc);

  // ---- mask (variant-dependent) ----
  var mask: f32;
  let n1 = fbm(uv * p.maskScale + p.seed * 0.13);
  let n2 = fbm(uv * p.maskScale * 2.3 + 17.0 + p.seed * 0.09);
  let noiseMask = mix(n1, n2, 0.35);
  let lumMask = 0.5 + 0.5 * (lB - lA);

  if (p.advVariant == 1u) {
    let a = p.advGravAngle * 6.2831853;
    let flowDir = vec2f(sin(a), -cos(a));
    let flowProgress = 0.5 - dot(uv - 0.5, flowDir);
    let gMask = mix(lA, flowProgress, p.advGravBias);
    mask = mix(noiseMask, gMask, p.organic);
  } else if (p.advVariant == 4u) {
    // Seed-point: random hash-based seed positions
    var minD = 9999.0;
    for (var i = 0u; i < 16u; i = i + 1u) {
      if (i >= p.advSeedCount) { break; }
      let fi = f32(i) + p.seed * 0.07 + 1.0;
      let sp = vec2f(hash21(vec2f(fi * 1.3, 13.0)), hash21(vec2f(fi * 2.7, 47.0)));
      minD = min(minD, distance(uv, sp));
    }
    mask = clamp(minD / max(p.advSeedRadius, 0.05), 0.0, 1.0);
  } else {
    mask = mix(noiseMask, lumMask, p.organic);
  }

  let sp = mix(0.1, 0.5, p.spread);
  // Stretch t so end-of-timeline pixels fully reveal — same fix as display shader.
  let tR = p.t * (1.0 + 2.0 * sp) - sp;
  let reveal = smoothstep(mask - sp, mask + sp * 0.3, tR);
  let mixed = mix(diffused, cB.rgb, reveal * p.advRate);
  return vec4f(mixed, 1.0);
}
`;

export const INIT_SHADER = /* wgsl */`
struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };
${PARAMS_STRUCT}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var texA: texture_2d<f32>;
@group(0) @binding(2) var texB: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var stateIn: texture_2d<f32>;
@group(0) @binding(5) var texT: texture_2d<f32>;
@group(0) @binding(6) var texRegions: texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) idx: u32) -> VSOut {
  let positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0), vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0, -1.0), vec2f( 1.0,  1.0),
  );
  let uvs = array<vec2f, 6>(
    vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(0.0, 0.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  );
  var out: VSOut;
  out.pos = vec4f(positions[idx], 0.0, 1.0);
  out.uv = uvs[idx];
  return out;
}
@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let uv = in.uv;
  if (p.mode == 67u) { return vec4f(0.0, 0.0, 0.0, 1.0); }  // fog sim starts empty; pours from the emitter
  if (p.validA == 0u) { return vec4f(p.bg, 1.0); }
  let q = (uv - p.offsetA) / p.scaleA;
  if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) { return vec4f(p.bg, 1.0); }
  return vec4f(textureSampleLevel(texA, samp, q, 0.0).rgb, 1.0);
}
`;

