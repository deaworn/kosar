// The user's own item photos: resized JPEG blobs in IndexedDB, keyed by item id.
// They never leave the phone, except inside a backup file the user shares.
// Also the durable copy of the list ('kv' store): localStorage writes are batched
// by Chrome and can be lost when Android kills the browser (measured on the
// emulator), an IndexedDB transaction is on disk when it completes.
const DB = 'kosar', STORE = 'photos', KV = 'kv', MAX_SIDE = 1280, QUALITY = 0.8;
let dbp = null;
function db() {
  if (!dbp) {
    dbp = new Promise((ok, fail) => {
      const r = indexedDB.open(DB, 2);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
        if (!r.result.objectStoreNames.contains(KV)) r.result.createObjectStore(KV);
      };
      r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; ok(r.result); }; // let a newer version upgrade
      r.onerror = () => fail(r.error);
    });
    dbp.catch(() => { dbp = null; });
  }
  return dbp;
}
function tx(mode, fn, store = STORE) {
  return db().then((d) => new Promise((ok, fail) => {
    const t = d.transaction(store, mode), s = t.objectStore(store);
    const req = fn(s);
    t.oncomplete = () => ok(req?.result);
    t.onerror = t.onabort = () => fail(t.error);
  }));
}
export const putPhoto = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const kvPut = (key, value) => tx('readwrite', (s) => s.put(value, key), KV);
export const kvGet = (key) => tx('readonly', (s) => s.get(key), KV);
export const getPhoto = (id) => tx('readonly', (s) => s.get(id));
export const delPhoto = (id) => tx('readwrite', (s) => s.delete(id));
export async function allPhotos() {
  const keys = await tx('readonly', (s) => s.getAllKeys());
  const vals = await tx('readonly', (s) => s.getAll());
  return Object.fromEntries((keys || []).map((k, i) => [k, vals[i]]));
}

// Downscale any image (camera photo, gallery file, video frame) to a JPEG blob.
export async function resizeImage(src, maxSide = MAX_SIDE) {
  const bmp = src instanceof Blob ? await createImageBitmap(src) : src; // src: Blob, or a video/canvas element
  const w0 = bmp.videoWidth || bmp.width, h0 = bmp.videoHeight || bmp.height;
  if (!w0 || !h0) throw new Error('empty image');
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error('encode failed'))), 'image/jpeg', QUALITY));
}

export const blobToDataUrl = (b) => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fail(r.error); r.readAsDataURL(b); });
export async function dataUrlToBlob(u) {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(u)) throw new Error('not an image data url');
  return (await fetch(u)).blob();
}
