// Camera scanner: reads a barcode with the browser's built-in BarcodeDetector
// (Chrome on Android), and can grab the current frame as the item's photo when
// there is no barcode. No library, no network: works offline (the product
// lookup afterwards is the caller's business).
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export const hasCamera = () => !!navigator.mediaDevices?.getUserMedia;

export async function barcodeSupport() {
  if (!('BarcodeDetector' in window)) return false;
  try {
    const f = await window.BarcodeDetector.getSupportedFormats();
    return FORMATS.some((x) => f.includes(x));
  } catch { return false; }
}

// start(video, onCode) -> { stop(), frame() }. onCode(code) fires once.
export async function start(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();
  let stopped = false, timer = null;
  const stop = () => { stopped = true; clearTimeout(timer); stream.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  if (await barcodeSupport()) {
    const det = new window.BarcodeDetector({ formats: FORMATS });
    const tick = async () => {
      if (stopped) return;
      try {
        const found = video.readyState >= 2 ? await det.detect(video) : [];
        const code = found.map((b) => String(b.rawValue || '').replace(/\D/g, '')).find((c) => c.length >= 8);
        if (code && !stopped) { onCode(code); return; }
      } catch { /* a bad frame: try the next one */ }
      timer = setTimeout(tick, 250);
    };
    tick();
  }
  return { stop };
}

// Barcode in a still photo (offline, on the phone). Returns the digits or ''.
export async function detectInImage(blob) {
  if (!(await barcodeSupport())) return '';
  const bmp = await createImageBitmap(blob);
  try {
    const found = await new window.BarcodeDetector({ formats: FORMATS }).detect(bmp);
    return found.map((b) => String(b.rawValue || '').replace(/\D/g, '')).find((c) => c.length >= 8) || '';
  } finally { bmp.close?.(); }
}
