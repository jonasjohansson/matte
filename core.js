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
export const device = await adapter.requestDevice();
device.addEventListener('uncapturederror', e => {
  console.error('[WebGPU uncaptured]', e.error?.message || e.error);
});
export const ctx = canvas.getContext('webgpu');
export const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format: presentationFormat, alphaMode: 'premultiplied' });

export const GPU_MAX_TEX = device.limits.maxTextureDimension2D;
console.log('[matte] device limits.maxTextureDimension2D =', GPU_MAX_TEX);
