// Client-side enrichment, phone only (no server). Every source is free and
// needs no key. Without network every step silently skips; the list itself
// never depends on this module.
//   0. built-in dictionary (offline): exact match = reliable translation ("auto")
//   1. MyMemory machine translation (online): only for a missing language, shown as "tipp?"
//   2. Open Food Facts (online): product photo, brand, product page; slow and
//      rate limited, so calls are serialized, spaced, and cached per query
//   3. category table: price band and store tip, always labelled as estimates
import { lookup, PRICE_BAND, STORE_TIP } from './dictionary.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFC').trim();
export const enrichKey = (hu, de) => norm(hu) + '|' + norm(de);

async function getJson(url, ms) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}

// ---- MyMemory --------------------------------------------------------------
async function translate(text, from, to) {
  const j = await getJson('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) + '&langpair=' + from + '|' + to, 10000);
  if (j.quotaFinished) throw new Error('translation quota finished');
  const out = String(j.responseData?.translatedText || '').trim();
  // An echo of the input, or an all-caps service message, is not a translation.
  if (!out || norm(out) === norm(text) || /MYMEMORY|QUERY LENGTH|INVALID/i.test(out)) return '';
  return out.slice(0, 80);
}

// ---- Open Food Facts --------------------------------------------------------
const OFF_KEY = 'bv.off';
const OFF_MISS_TTL = 7 * 24 * 3600e3;
const OFF_GAP_MS = 7000; // the search endpoint allows about 10 requests a minute
let offCache = null, offLast = 0, offChain = Promise.resolve();
function offLoad() { if (!offCache) { try { offCache = JSON.parse(localStorage.getItem(OFF_KEY) || '{}'); } catch { offCache = {}; } } return offCache; }
function offSave() { try { localStorage.setItem(OFF_KEY, JSON.stringify(offCache)); } catch { /* cache is optional */ } }

// Returns the product, null for "no product", throws on a network error (not cached, retried later).
function openFoodFacts(q) {
  const key = norm(q), c = offLoad()[key];
  if (c && (c.hit || Date.now() - c.at < OFF_MISS_TTL)) return Promise.resolve(c.hit || null);
  const run = async () => {
    const wait = offLast + OFF_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    offLast = Date.now();
    const j = await getJson('https://world.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=5' +
      '&fields=product_name,brands,image_front_small_url,image_front_url,code&search_terms=' + encodeURIComponent(q), 25000);
    const list = j.products || [];
    const p = list.find((x) => x.image_front_small_url) || list[0];
    const hit = p ? {
      photo: p.image_front_small_url || '', big: p.image_front_url || '',
      brand: String(p.brands || '').split(',')[0].trim(),
      link: p.code ? 'https://de.openfoodfacts.org/produkt/' + encodeURIComponent(p.code) : '',
      name: p.product_name || '',
    } : null;
    offLoad()[key] = { at: Date.now(), hit }; offSave();
    return hit;
  };
  const next = offChain.then(run, run);
  offChain = next.catch(() => {});
  return next;
}

// Exact product by barcode (EAN/UPC). Fast and precise compared to the text
// search. Returns the product, null if OFF does not know the code, throws on a
// network error. Cached like the search (misses expire).
export async function lookupBarcode(code) {
  code = String(code || '').replace(/\D/g, '');
  if (!code) return null;
  const key = 'ean:' + code, c = offLoad()[key];
  if (c && (c.hit || Date.now() - c.at < OFF_MISS_TTL)) return c.hit || null;
  const j = await getJson('https://world.openfoodfacts.org/api/v2/product/' + code + '.json' +
    '?fields=product_name,product_name_de,product_name_hu,brands,image_front_small_url,image_front_url,code', 15000);
  const p = j.status === 1 ? j.product || {} : null;
  const hit = p ? {
    name: p.product_name_de || p.product_name || '', nameHu: p.product_name_hu || '',
    brand: String(p.brands || '').split(',')[0].trim(),
    photo: p.image_front_small_url || '', big: p.image_front_url || '',
    link: 'https://de.openfoodfacts.org/produkt/' + code,
  } : null;
  offLoad()[key] = { at: Date.now(), hit }; offSave();
  return hit;
}

const searchLink = (q) => 'https://www.google.com/search?tbm=shop&q=' + encodeURIComponent(q);

// A name equal to the previous auto value counts as "not typed by the user":
// a renamed item gets a fresh translation, while a name the user typed is never
// overwritten. When a translation cannot run (offline), the old auto value stays.
// Returns { patch, complete }; complete=false means a network step failed and
// the item should be retried later.
export async function enrich(it, { online = navigator.onLine } = {}) {
  const prevAuto = it.enrich?.autoVals || {};
  const cur = { hu: (it.hu || '').trim(), de: (it.de || '').trim() };
  const user = { hu: cur.hu !== prevAuto.hu ? cur.hu : '', de: cur.de !== prevAuto.de ? cur.de : '' };
  if (!user.hu && !user.de) return null;
  const info = { at: Date.now(), autoVals: {}, sources: {} };
  const patch = {};
  let complete = true;

  for (const [f, from, other] of [['de', 'hu', 'de'], ['hu', 'de', 'hu']]) {
    if (user[f] || !user[from]) continue; // this language was typed, or there is nothing to translate from
    // 0. dictionary, exact match only
    const hit = lookup(user[from], from);
    let val = hit && norm(hit[from === 'hu' ? 0 : 1]) === norm(user[from]) ? hit[f === 'de' ? 1 : 0] : '';
    let src = val ? 'szótár' : '';
    // 1. machine translation
    if (!val) {
      if (!online) complete = false;
      else { try { val = await translate(user[from], from, other); src = val ? 'MyMemory gépi fordítás' : ''; } catch { complete = false; } }
    }
    if (val) { patch[f] = val; info.autoVals[f] = val; info.sources.translation = src; }
    else if (prevAuto[f] && cur[f] === prevAuto[f]) { info.autoVals[f] = prevAuto[f]; info.sources.translation = it.enrich?.sources?.translation; }
  }

  const hu = patch.hu ?? cur.hu, de = patch.de ?? cur.de;
  const hit = lookup(hu, 'hu') || lookup(de, 'de');
  const category = hit ? hit[3] : '';
  if (hit && (!it.icon || it.icon === it.enrich?.icon)) { patch.icon = hit[2]; info.icon = hit[2]; }
  info.category = category;

  // 3. category estimates
  if (category) {
    const [lo, hi] = PRICE_BAND[category];
    const eur = (n) => n.toFixed(2).replace('.', ',');
    info.price = { text: 'kb. ' + eur(lo) + '-' + eur(hi) + ' €', estimate: true, source: 'becslés (kategória)' };
    info.store = { value: STORE_TIP[category], estimate: true, source: 'becslés (kategória)' };
  }

  // 2. Open Food Facts: by barcode when the item has one (exact product), else a
  // text search (packaged goods only; fresh produce has no product page).
  const q = [it.brand, de || hu].filter(Boolean).join(' ');
  if (it.barcode || category !== 'produce') {
    if (!online) complete = false;
    else {
      try {
        const off = it.barcode ? await lookupBarcode(it.barcode) : await openFoodFacts(q);
        const src = it.barcode ? 'Open Food Facts (vonalkód)' : 'Open Food Facts';
        if (off?.photo) info.photo = { url: off.photo, big: off.big || '', source: src };
        if (off?.link) info.link = { url: off.link, label: off.name || 'termékoldal', source: src };
        if (off?.brand) info.brand = { value: off.brand.slice(0, 40), estimate: !it.barcode, source: src };
      } catch { complete = false; }
    }
  }
  if (!info.link) info.link = { url: searchLink(q), label: 'keresés: ' + q, source: 'Google Shopping keresés' };

  info.key = enrichKey(hu, de);
  info.complete = complete;
  patch.enrich = info;
  return { patch, complete };
}
