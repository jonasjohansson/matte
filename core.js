// WebGPU bootstrap for matte: creates the device/context once and exports the
// long-lived singletons every other module shares. Top-level await means a
// module importing from here waits until the GPU device is ready.

export const canvas = document.getElementById('canvas');

if (!navigator.gpu) {
  document.getElementById('gpu-error').classList.add('show');
  throw new Error('WebGPU not available');
}

export const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  document.getElementById('gpu-error').classList.add('show');
  throw new Error('No GPU adapter');
}
// Show the error overlay with an optional runtime message (device lost, etc.).
function showGpuError(msg) {
  const el = document.getElementById('gpu-error');
  const m = document.getElementById('gpu-error-msg');
  if (m && msg) m.innerHTML = '<b>' + msg + '</b>';
  if (el) el.classList.add('show');
}
export const device = await adapter.requestDevice().catch(e => {
  showGpuError('Could not create a GPU device — your browser/driver may have WebGPU disabled.');
  throw new Error('requestDevice failed: ' + (e?.message || e));
});
device.addEventListener('uncapturederror', e => {
  console.error('[WebGPU uncaptured]', e.error?.message || e.error);
});
// WebGPU devices are lost on tab backgrounding, sleep/wake, GPU reset, or an
// external display being unplugged — all common in installation/projector setups.
// Surface it instead of freezing on a black canvas.
device.lost.then(info => {
  console.error('[WebGPU device lost]', info.reason, info.message);
  if (info.reason !== 'destroyed') {
    showGpuError('GPU device lost' + (info.reason ? ' (' + info.reason + ')' : '') + ' — reload the page to recover.');
  }
});
export const ctx = canvas.getContext('webgpu');
export const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

export const GPU_MAX_TEX = device.limits.maxTextureDimension2D;
console.log('[matte] device limits.maxTextureDimension2D =', GPU_MAX_TEX);
