// Video codec selection for matte's MP4 recorder. Pure WebCodecs probing —
// no app state/GPU. Imported by main.js's startRecording().

// Max frame long-edge a given codec/level can encode (nominal — the real limit
// is whatever VideoEncoder.isConfigSupported() accepts on this GPU's hardware
// encoder, which often caps H.264/HEVC ≤L5.1 at 4096 regardless of level).
export function codecMaxDim(codecString) {
  if (codecString.includes('L186') || codecString.includes('L180')) return 8192; // HEVC L6.x — 8K
  if (codecString.startsWith('av01')) return 8192;                                // AV1 — 8K
  if (codecString.includes('L153') || codecString.includes('L156')) return 4096;  // HEVC L5.x — 4K
  if (codecString.includes('L120')) return 4096;                                  // HEVC L4 — 4K
  if (codecString.includes('640033') || codecString.includes('640034')) return 4096; // AVC High L5.x
  if (codecString.includes('640028')) return 4096;                                // AVC High L4
  return 3840;
}

// Try a series of VideoEncoder configs in descending order of profile/level so
// we pick the highest-headroom one this machine actually supports. The HEVC L6
// and AV1 entries unlock >4K on GPUs whose encoder supports them; everything
// falls back to 4K H.264/HEVC otherwise.
export async function pickEncoderConfig(width, height, framerate, bitrate) {
  if (typeof VideoEncoder === 'undefined') return null;
  const candidates = [
    { codec: 'hev1.1.6.L186.B0', muxer: 'hevc' }, // HEVC Main L6.1 — up to 8K
    { codec: 'hev1.1.6.L180.B0', muxer: 'hevc' }, // HEVC Main L6.0 — up to 8K
    { codec: 'av01.0.16M.08',    muxer: 'av1'  }, // AV1 Main L6.0  — up to 8K
    { codec: 'hev1.1.6.L153.B0', muxer: 'hevc' }, // HEVC Main L5.1 — 4K
    { codec: 'avc1.640033',      muxer: 'avc'  }, // H.264 High L5.1 — 4K
    { codec: 'avc1.640028',      muxer: 'avc'  }, // H.264 High L4   — 4K
    { codec: 'avc1.42E01E',      muxer: 'avc'  }, // H.264 Baseline L3
  ];
  for (const c of candidates) {
    try {
      const cfg = {
        codec: c.codec, width, height, framerate, bitrate,
        hardwareAcceleration: 'prefer-hardware',
      };
      const r = await VideoEncoder.isConfigSupported(cfg);
      if (r && r.supported) return { config: cfg, muxerCodec: c.muxer };
    } catch {}
  }
  return null;
}
