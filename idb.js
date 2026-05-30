// IndexedDB persistence for matte: a small key/value store (kv) for the
// session's images/texture, plus a library store (lib) of all uploaded images.
// Pure browser API — no app state, no GPU. Imported by main.js.

export const IDB_NAME = 'transition-tool-v3';
export const IDB_STORE = 'images';
export const IDB_LIB_STORE = 'library';

export function idbOpen() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(IDB_NAME, 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_LIB_STORE)) {
        const store = db.createObjectStore(IDB_LIB_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('addedAt', 'addedAt');
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function idbGet(key) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}
export async function idbPut(key, value) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}
export async function idbClearAll() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}

// ---- library store (persistent gallery of all uploaded images) ----
export async function libList() {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(IDB_LIB_STORE, 'readonly');
      const req = tx.objectStore(IDB_LIB_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.addedAt - a.addedAt));
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}
export async function libAdd(entry) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_LIB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_LIB_STORE).add(entry);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}
export async function libDelete(id) {
  try {
    const db = await idbOpen();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_LIB_STORE, 'readwrite');
      tx.objectStore(IDB_LIB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}
// Generate a small JPEG thumbnail (~256px wide) from any image blob/file.
export async function makeThumb(blob, maxW = 256) {
  try {
    const bmp = await createImageBitmap(blob);
    const w = Math.min(maxW, bmp.width);
    const h = Math.round(w * bmp.height / bmp.width);
    const c = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    if (c.convertToBlob) return await c.convertToBlob({ type: 'image/jpeg', quality: 0.78 });
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.78));
  } catch { return null; }
}
