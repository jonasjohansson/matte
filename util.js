// Pure helpers for matte (no app state / GPU). Imported by main.js.

export function fitInfo(img, cw, ch, mode) {
  if (!img) return { sx: 1, sy: 1, ox: 0, oy: 0 };
  const ia = img.naturalWidth / img.naturalHeight;
  const ca = cw / ch;
  if (mode === 'stretch') return { sx: 1, sy: 1, ox: 0, oy: 0 };
  if (mode === 'cover') {
    // True cover: scale image so the smaller-relative axis matches the canvas,
    // the larger axis extends past the canvas and gets cropped. Aspect preserved.
    if (ia > ca) {
      // Image wider than canvas → match canvas height, image overhangs left/right.
      const sx = ia / ca;
      return { sx, sy: 1, ox: (1 - sx) * 0.5, oy: 0 };
    }
    // Image more square / taller than canvas → match canvas width, overhangs top/bottom.
    const sy = ca / ia;
    return { sx: 1, sy, ox: 0, oy: (1 - sy) * 0.5 };
  }
  // contain
  if (ia > ca) { const sy = ca / ia; return { sx: 1, sy, ox: 0, oy: (1 - sy) * 0.5 }; }
  const sx = ia / ca; return { sx, sy: 1, ox: (1 - sx) * 0.5, oy: 0 };
}

export function hexToRgb(hex) {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
