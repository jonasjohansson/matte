# trans

A WebGPU tool for creating painterly / particle-driven transition effects between two images, with video recording and B/W luma-matte export for After Effects.

Forked from the `transition-v4` WebGPU build. v6 direction: particles become a
first-class layer driven by the same transition field, aiming at looks like
growing glowing reveal-rims and radial particle-streak bursts.

## Run

WebGPU needs a **secure context**. Serve over `https://` or `http://localhost`
(plain `http://` to an IP/hostname will not expose `navigator.gpu`):

```sh
# from this directory
python3 -m http.server 8000
# then open http://localhost:8000
```

Requires Chrome/Edge 113+, Firefox 141+, or Safari 18+.

## What's here

- `index.html` — shell, slots (A / T-video / B), Tweakpane host, importmap (CDN deps).
- `main.js` — WebGPU render + sim, all transition modes, recorder (mp4), matte export, particle layer.
- `style.css` — UI.
- `defaults/` — bundled default images.

## Features carried from v4

- 30+ painterly / watercolor / advection / burn transition modes.
- Image-aware paper grain (growing fibers, follow-strokes, local patches) and
  backrun blooms seeded from the source.
- Video-mask transitions (T slot) with displacement.
- PNG alpha respected; source A/B color.
- Recorder → mp4 (HEVC/H.264), up to 45s.
- **Matte output**: record the transition reveal as a B/W luma matte for AE.
