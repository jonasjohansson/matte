# Mode hover-preview clips

Short, low-res looping MP4s shown when you hover a mode thumbnail (`mNN.mp4`,
matching the mode id). Lazy-loaded and **online-only** — they are *not* in the
service-worker precache, so they don't bloat the offline shell; offline (or if a
clip is missing) the static `thumbs/mNN.png` stays.

## Bake them (once, in real Chrome)

Automated/headless baking can't capture the WebGPU canvas to video, so generate
them from your browser where recording already works:

1. Open the app in Chrome, click **Folder** and pick an output folder.
2. In the console: `await window.__engine.bakePreviews()`
   (loops every mode, records a ~2s 256×160 matte of each as `mNN.mp4`).
3. Move the resulting `mNN.mp4` files into this `previews/` folder and commit.

Options: `bakePreviews({ w:256, h:160, duration:2, fps:15 })`.
