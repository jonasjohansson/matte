// The single mutable app-state object for matte. Pure data — every field is a
// literal default. Imported (as a live binding) by main.js and any module that
// reads/writes engine state. Persistence (PERSIST_KEYS, save/loadSession)
// stays in main.js.

export const state = {
  imgA: null, imgB: null,
  videoT: null,  // HTMLVideoElement holding the transition-mask video (slot T)
  t: 0,
  playing: false,
  loop: true,
  startTime: 0,
  reverse: false,
  duration: 15.0,
  projectName: '',   // optional export-filename prefix, e.g. "DML" → "DML_…"
  // Lamp Grid (mode 29) — dedicated controls (don't bleed from other modes)
  cellCols: 5, cellRows: 10, cellJitter: 0.3, cellGlow: 0.12, cellOrder: 0.6, cellCascade: 0.3, cellSnap: 0.0, cellSpill: 0.0, cellIgniteBy: 0, cellAnalyseBy: 0, cellCoarseness: 0.5,
  // texture input (grunge / watercolor paper) — modulates the reveal + bg tint
  texImg: null, texAmount: 0.0, texBg: 0.0, texAspect: 1.0, texFit: 2,  // fit: 0 stretch,1 contain,2 cover (default cover = fill)
  // origin: transitions grow from within (inside-out). Default centre; auto-set
  // from image A's bright focal region when an image is loaded.
  originAmount: 0.4, originX: 0.5, originY: 0.5, originFromImage: true,
  originPoints: [], placePoints: false,  // click-placed emission points
  pointStagger: 0.5, pointRandom: 0.7,   // stagger point start times + randomness
  pointSize: 0.3, pointPop: 0.6,         // lamp radius cap + ignition snap (0 grow .. 1 instant pop)
  pointFill: false,                      // bloom past lamp edge to full-frame coverage by t=1
  paintBrush: 0.12,                      // paint-mode brush radius (fraction of width)
  turbulence: 0.12,  // subtle by default so each mode keeps its own character; dial up for ink
  flow: 0.3,         // animate the turbulence over time (churning/rising)
  undulate: 0.0,     // slow large-scale wave/dance of the reveal (aurora-like)
  animate: 0.0,      // evolve each mode's own pattern over the loop (per-mode movement)
  auroraDensity: 0.5, auroraHeight: 0.5, auroraSpeed: 0.4, auroraDark: 0.3, auroraWave: 0.5,  // aurora settings
  driftAngle: 0.25, driftAmount: 0.3,  // wind direction + strength for ambient drift
  gdIntensity: 0.5, gdBeams: 0.5, gdCloud: 0.5, gdPulse: 0.4,  // godray settings
  ambCount: 0.5, ambSize: 0.5, ambSoft: 0.5, ambSpeed: 0.25, ambDetail: 0.5, sunX: 0.5, sunY: 0.3, streakMove: 0.25, vignAmount: 0.0, vignFeather: 0.5, vignAnimate: 0.0, vignTexture: 0.0, vignShape: 0.5, ambRole: 0,  // shared bokeh/ripples/glare/streaks
  // custom transition dimensions (independent of source footage size).
  // Default ON: trans is primarily a matte-video builder, so it boots to a
  // fixed canvas showing the B/W matte without requiring any footage.
  customSize: true, matchInput: false, lockAspect: false, outW: 1920, outH: 1080, previewScale: '1440',  // on-screen preview longer-edge cap (px) or 'full'; recording always full-res
  padTopPx: 0,  // floor padding in full output pixels: >0 blacks the TOP band, <0 the BOTTOM; effect fills the rest (panorama floor/ceiling projection)
  // output mode — matte-first (B/W luma for AE) by default; bound in Setup,
  // so these must exist before the pane is built.
  matteOutput: true, matteInvert: false, useSources: true,
  // particle layer (GPU compute overlay) — see particle module above
  partEnable: false,
  partCount: 120000,
  partBurst: 0.5,     // 0 = glowing curl drift, 1 = hard radial burst
  partSpeed: 1.6,     // overall velocity scale
  partCurl: 0.12,     // curl-noise force (organic drift)
  partDrag: 1.2,      // velocity damping per t
  partGravity: 0.0,   // constant downward (+) / upward (-) accel
  partLife: 0.7,      // lifespan in t-units
  partSize: 0.006,    // sprite radius (clip units)
  partTrail: 0.0,     // streak elongation along velocity (motion blur)
  partSpread: 0.6,    // how strongly birth time follows radius (front growth)
  partGlow: 0.9,      // additive intensity
  partColorMix: 1.0,  // 0 = flat glow colour, 1 = sampled from source A
  partFade: 0.5,      // life-fade curve (higher = fades sooner)
  partCenterX: 0.5, partCenterY: 0.5,
  partGlowColor: '#bcd4ff',
  organic: 0.65,
  edges: 0.25,
  spread: 0.2,
  maskScale: 0.9,
  curve: 0,        // 0 linear
  seed: 42,
  mode: 2,   // default to paper-grain: image-free, this reads as a clear B/W matte
  // mode-specific defaults (mirrors v1)
  rimWidth: 0.12, rimDark: 0.6,
  paperAngle: 0, paperAniso: 4, paperGranulation: 0.5,
  // mode 2 organic/animated extensions: fibers grow along the grain, bend
  // along B's strokes, and reveal ignites in local patches (0 = old static look)
  paperGrowth: 0.5, paperFollow: 0.35, paperPatches: 0.45,
  bloomCount: 8, bloomRim: 0.6, bloomRate: 0.55,
  bloomImageBias: 0.6,  // mode 3: bias bloom seeds toward B's bright pools
  diffStrength: 0.55, diffRadius: 0.45,
  sedBands: 6, sedSoftness: 0.35, sedDirection: 0, sedSource: 0,
  saltDensity: 0.0, saltContrast: 0.55,
  saltSource: 1, saltBias: 0.6, saltImage: 2,
  irisFocusX: 0.5, irisFocusY: 0.5, irisJitter: 0.35, irisUniform: true,
  bleedFinger: 0.5, bleedAmount: 0.45, bleedHalo: 0.5,
  runGravity: 0.5, runDrip: 0.35,
  // advection family
  advecVisc: 0.55, advecRate: 0.18, advecSteps: 3,
  advecGravity: 0.6, advecGravBias: 0.5,
  advecGravAngle: 0, advecGravStreak: 0.4, advecGravLateral: 0.3,
  advecCurlStr: 0.5, advecCurlScale: 2.5,
  advecBrushFollow: 0.7,
  advecSeedCount: 5, advecSeedRadius: 0.45,
  // wet edge (mode 15)
  weEdgeScale: 6.0, weEdgeWobble: 0.55,
  weDryRing: 0.45, weBleed: 0.5,
  weTendrilCount: 6, weTendrilReach: 0.4, weTendrilWidth: 0.5, weTendrilStrength: 0.55,
  weDetailBias: 0.35,
  weReverse: false, weBDetailBias: 0.0, weBLumaBias: 0.0,
  // stroke follow (mode 16)
  strokeScale: 6.0, strokeAniso: 4.0,
  // tonal glaze (mode 17)
  glazeBands: 3.0, glazeSoftness: 0.55, glazeDirection: 0, glazeWarm: 0.35,
  // edge underdrawing (mode 18)
  edgeFirstInk: 0.55, edgeFirstFade: 0.35, edgeFirstScale: 3.0,
  // painterly flow (mode 19)
  flowAmount: 0.55,
  // color-pool dabs (mode 20)
  dabsCount: 28, dabsReach: 0.32, dabsWobble: 0.6,
  // wet-density gravity (mode 21)
  densityGravity: 0.45, densitySmear: 0.45,
  // global paper grain (Style folder)
  paperGrain: 0.25,
  // mold tendrils (mode 22) — direct fbm-warped tendril paths from seeds
  moldSeedCount: 5, moldTendrilsPerSeed: 4,
  moldReach: 0.5, moldWidth: 0.35, moldWobble: 0.6,
  // mode 23 watercolor formation
  formStrokeCount: 32, formStrokeSize: 0.05, formStrokeWobble: 0.5,
  // mode 24 cauliflower bloom storm
  bloomLightBias: 0.85, bloomWobble: 0.5, bloomPaperShow: 0.6,
  // mode 25 wet-stage layering
  stageBands: 4, stageOverlap: 0.5,
  // mode 26 pigment migration
  migrationStrength: 0.6, migrationDir: 0, migrationTurb: 0.5,
  // global transition bounds (Style folder)
  boundsEnable: false, boundsCx: 0.5, boundsCy: 0.5, boundsW: 0.6, boundsH: 0.6, boundsSoftness: 0.03,
  // global mask timing shift (Dissolve folder)
  maskShift: 0,
  // per-slot fill modes: 'image' | 'solid' | 'transparent' (alpha output)
  slotAFillMode: 'image', slotAColor: '#000000',
  slotBFillMode: 'image', slotBColor: '#000000',
  // When on, anything outside B's rect stays as unmodified A — useful when B
  // is smaller than the canvas and you want A as a persistent background.
  keepAOutsideB: false,
  // burn (mode 27): paper-scorch — clean defaults
  burnEdgeWobble: 1.0, burnCharIntensity: 1.0, burnCharWidth: 0.07,
  burnCharPersistence: 0.0,
  burnGlowIntensity: 0.35, burnGlowWidth: 0.3, burnEmberTrail: 0.5,
  burnSeedCount: 0,
  burnBrowning: 0.5, burnBrowningWidth: 0.1,
  burnAshSpatter: 0,
  burnGlowColor: '#b04514',
  burnBIgnite: 0, burnGlowFromB: 0,
  burnColorBleed: 0,
  // mode 28 — video mask
  videoMaskInvert: false, videoMaskFeather: 0, videoDisplace: 0.2, videoDisplaceB: 0.2,
  videoDisplaceAmount: 1.0,  // master multiplier on T-video displacement (0..4)
  videoBrightness: 0, videoContrast: 1, videoSaturate: 1,
  // mode 29 — film melt
  meltCellScale: 7, meltCenterX: 0.5, meltCenterY: 0.5, meltCellJitter: 0.7,
  meltInkAmount: 0.8, meltGlowIntensity: 0.5, meltGlowColor: '#c46a18',
  // mode 30 — light bloom / overexposure
  lightIntensity: 1.0, lightSpread: 0.4, lightPeakT: 0.5, lightFlashWidth: 0.1,
  lightColor: '#fff7e6',
  // style / framing
  fit: 'cover',
  bg: '#000000',
  zoomA: 1.0, panAx: 0.0, panAy: 0.0,
  zoomB: 1.0, panBx: 0.0, panBy: 0.0,
};
