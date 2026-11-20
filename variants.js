// Pack sizes (round 12, Tomi 11108): an item sold in several sizes carries them in
// offer.variants (from the machine); Tomi picks one in the editor and that is the item's price.
// Until he picks, the default is the size in his usual price band, if one is known.
// Pure: used by the app, tested in node.

// Tomi's usual price band per brand (Tomi 11111: Paramount "40-50 euró körül"). Data, not logic.
export const BANDS = { paramount: [40, 50] };

const fold = (s) => String(s || '').toLowerCase().trim();

// the default size: inside the band; a tie (same price and weight) -> the plainest name
export function defaultVariant(variants, brand) {
  const band = BANDS[fold(brand)];
  if (!band || !Array.isArray(variants)) return null;
  const inBand = variants.filter((v) => v.value >= band[0] && v.value <= band[1]);
  return inBand.sort((a, b) => a.value - b.value || a.grams - b.grams || a.name.length - b.name.length)[0] || null;
}

// the size in use: Tomi's pick (by name), else the default; null when the item has no sizes
export function chosenVariant(it) {
  const vs = it?.offer?.variants;
  if (!Array.isArray(vs) || !vs.length) return null;
  if (it.variant) return vs.find((v) => v.name === it.variant) || defaultVariant(vs, it.brand);
  return defaultVariant(vs, it.brand);
}

// "Paramount Volumentabak Titan Box" -> "Titan Box" (brand and product-kind words left out)
export function shortName(name, brand) {
  const b = fold(brand);
  const s = String(name || '').split(/\s+/).filter((w) => fold(w) !== b && !/^(tabak|volumentabak|drehtabak|volume|tobacco|vorratsbeutel)$/i.test(w)).join(' ');
  return s || String(name || '');
}
