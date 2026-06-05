# matte

A standalone **WebGPU matte-video builder**. It generates black/white animated
mattes (and optional A→B image transitions) for use as luma/track mattes in
After Effects — built for the ELVERKET "Det Mörka Ljuset" installation
(Lars Lerin watercolours).

Live: **matte.jonasjohansson.se** · Deployed as static files on GitHub Pages.

## Run locally

Plain static files using **native ES modules** — no build step, no bundler.
Serve the folder over `http://localhost` (WebGPU needs a secure context; a plain
`file://` or http-to-IP will not expose WebGPU):

```
python3 -m http.server 8123
# open http://localhost:8123/index.html  (Chrome/Edge 113+, Safari 18+)
```

Dep (`mp4-muxer`) is **vendored
locally** in `vendor/` and resolved by the importmap in `index.html` — no CDN, so
the app runs **fully offline**. A service worker (`sw.js`) precaches the whole
shell on first load. The only online-only feature is SAM segmentation, which
lazy-loads `@huggingface/transformers` (~25 MB) from a CDN and is gated when
offline. Deploy = push to `main` → GitHub Pages serves the files.

Desktop-only by design: touch devices get a "needs a desktop + WebGPU" notice
(`@media (hover:none) and (pointer:coarse)`).

## File layout

| file | role |
|---|---|
| `index.html` | entry point + importmap + `<script>` tags + service-worker registration |
| `core.js` | WebGPU bootstrap — exports the `device`/`ctx`/`canvas`/`adapter`/`presentationFormat` singletons (top-level await) |
| `state.js` | the single mutable `state` object (pure data defaults) |
| `main.js` | engine: render loop, uniform packing, sources/library, paint/points, recording/export, SAM segmentation and the `window.__engine` API |
| `shader.js` | the three WGSL shader strings (display / advection-sim / init) — pure data |
| `particles.js` | the GPU particle mode (31): compute + draw passes |
| `ui.js` | the visible custom UI — controls rail (Output · Playback · View, with **Source images inline in View**) · canvas · settings · mode rail (Origin/Vignette/Grade **globals** pinned above the gallery, far right); drives the engine via `window.__engine` |
| `style.css` / `ui.css` | engine styles / custom-UI styles + design tokens (one flat, square, gapless band system; Spline Sans Mono self-hosted) |
| `idb.js` | IndexedDB persistence (kv store + image library) — pure |
| `recorder.js` | WebCodecs codec selection — pure |
| `output.js` | File System Access "save here" folder; owns the dir handle |
| `util.js` | pure helpers (`fitInfo`, `hexToRgb`) |
| `sw.js` / `manifest.json` | offline service worker / PWA manifest |
| `vendor/` | locally-vendored, offline-precached assets (mp4-muxer ESM dep + the Spline Sans Mono variable woff2) |
| `thumbs/` | baked mode-thumbnail PNGs (`m00.png`…`m64.png`) |
| `defaults/` | bundled default images (seed the library + Reset) |
| `eval-src/` | local test images — gitignored, not deployed |

## Architecture notes (read before refactoring)

- **The shared singletons.** `device`, `ctx`, `canvas`, the `state` object, and
  `bindGroup` are referenced across the engine. As the file is split, these live
  in small foundation modules (e.g. `state.js`, `core.js`) and are imported where
  needed — that's the native-ESM way to share one live reference across files.

- **The UBO ↔ shader contract.** `shader.js` declares `struct Params {…}` and
  `main.js`'s `writeUniforms()` packs the uniform buffer by byte offset. The two
  must stay in lockstep — add/reorder a uniform → update both (and `UBO_SIZE` if
  it grows). The 3 `struct Params` copies in shader.js are NOT byte-identical
  (sim/init are reduced variants) — do not blindly "dedupe" them. To add a flag
  without growing the UBO, reuse a u32 with a sentinel (e.g. `originCount==255`
  means "paint-origin").

- **The legacy Tweakpane UI is retired.** Its `.addBinding`/`.addFolder` calls
  now run against an inert chainable stub in `main.js`, and the two Tweakpane
  deps are gone. `ui.js` is the only real UI; randomize, presets and the rest are
  self-contained there / on `window.__engine`. `updateModeFolders()` is a no-op.
  The remaining binding calls are harmless no-ops, but they're **interleaved with
  live data consts** (mode option/name maps), so pruning them is a careful
  line-level pass, not a block delete.
- **Typeface.** Spline Sans Mono (UI monospace grotesque) is **self-hosted** as a
  variable woff2 in `vendor/` and precached — a Google Fonts `<link>` would be
  cross-origin and vanish offline, since `sw.js` only caches same-origin.
- **Tests:** `npm test` runs `test/check-shaders.mjs` (no-browser WGSL/struct
  guard) + `test/smoke.mjs` (renders every mode) + `test/functional.mjs`
  (randomize/presets/mode-switch). CI runs them on push/PR.

- **`window.__engine`** is the bridge: `ui.js` only talks to the engine through
  it. Add new UI behaviour as an `__engine` method, not by reaching into globals.

- **Offline / service worker.** `sw.js` precaches the shell listed in `PRECACHE`.
  When you add or rename a precached file (a new module, vendored dep, etc.),
  add it to that list **and bump `VERSION`** so the old cache is evicted. Code
  (js/css) is network-first, so deploys show immediately online without a bump.

## Modes

64 modes (0–63): transition modes (reveal / watercolor / painterly / light&burn,
incl. **column swipe** (63) — staggered organic directional wipe) plus the
ambient looping fields (bokeh, ripples, glare, streaks, aurora, godrays, fog,
fire, caustics + **caustics 2** (61) Voronoi light-net, embers, marble, ink,
sun-through-trees, water shimmer, silk, nebula …). Three modes are **footage-
driven**: a clip loaded into the T-slot acts as a spatial mask — the foliage
canopy (54), the godray occluder (39), and **footage → matte** (62), which
stylises any clip into a clean B/W matte. Photo-edge / older modes that "looked
digital" live in a de-emphasised **Archive** group. The mode rail is a single-
open accordion; curate with the per-chip **★** Favourites.
