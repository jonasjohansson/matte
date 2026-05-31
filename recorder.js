// Video codec selection for matte's MP4 recorder. Pure WebCodecs probing —
// no app state/GPU. Imported by main.js's startRecording().
//
// We DON'T trust isConfigSupported() alone: on several GPUs/browsers it reports
// a codec as supported but the encoder then emits no usable output (notably
// HEVC *encode* via WebCodecs on Chrome/Windows). So main.js uses this cheap
// gate to skip the obviously-unsupported, then actually encode+mux a couple of
// test frames to confirm a real file comes out before committing to a codec.

// Ordered so that ≤4K exports use the codecs After Effects imports reliably
// (HEVC / H.264) and only the >4K stretch reaches AV1 / HEVC-L6 — those get
// skipped at ≤4K sizes because `max` gates them. `max` is the nominal long-edge
// cap; the real limit is whatever the hardware encoder accepts at probe time.
export const ENCODER_CANDIDATES = [
  { codec: 'hev1.1.6.L153.B0', muxer: 'hevc', max: 4096, label: 'HEVC L5.1 (4K)' },        // HW on most, AE-friendly
  { codec: 'avc1.640033',      muxer: 'avc',  max: 4096, label: 'H.264 High L5.1 (4K)' },  // universal
  { codec: 'avc1.640028',      muxer: 'avc',  max: 4096, label: 'H.264 High L4 (4K)' },
  { codec: 'av01.0.16M.08',    muxer: 'av1',  max: 8192, label: 'AV1 (8K)' },              // >4K: NVENC AV1 (RTX 40-series)
  { codec: 'hev1.1.6.L186.B0', muxer: 'hevc', max: 8192, label: 'HEVC L6.1 (8K)' },        // >4K
  { codec: 'avc1.42E01E',      muxer: 'avc',  max: 4096, label: 'H.264 Baseline' },        // last-resort
];

// Cheap pre-gate so we only run the expensive real probe on plausible configs.
export async function encoderConfigSupported(codec, width, height, framerate, bitrate) {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const r = await VideoEncoder.isConfigSupported({
      codec, width, height, framerate, bitrate, hardwareAcceleration: 'prefer-hardware',
    });
    return !!(r && r.supported);
  } catch { return false; }
}
