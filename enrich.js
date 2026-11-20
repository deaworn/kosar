// Client-side enrichment, phone only (no server). Every source is free and
// needs no key. Without network every step silently skips; the list itself
// never depends on this module.
//   0. built-in dictionary (offline): exact match = reliable translation ("auto")
//   1. MyMemory machine translation (online): only for a missing language, shown as "tipp?"
//   2. Open Food Facts (online), by barcode only: the exact product's photo, brand, page
//   3. category table: price band and store tip, always labelled as estimates
import { lookup } from './dictionary.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFC').trim();
const fold = (s) => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
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
let offCache = null;
function offLoad() { if (!offCache) { try { offCache = JSON.parse(localStorage.getItem(OFF_KEY) || '{}'); } catch { offCache = {}; } } return offCache; }
function offSave() { try { localStorage.setItem(OFF_KEY, JSON.stringify(offCache)); } catch { /* cache is optional */ } }
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


// A name equal to the previous auto value counts as "not typed by the user":
// a renamed item gets a fresh translation, while a name the user typed is never
// overwritten. When a translation cannot run (offline), the old auto value stays.
// Returns { patch, complete }; complete=false means a network step failed and
// the item should be retried later.
export async function enrich(it, { online = navigator.onLine, aiName = null, aiNameAny = null } = {}) {
  const prevAuto = it.enrich?.autoVals || {};
  const cur = { hu: (it.hu || '').trim(), de: (it.de || '').trim() };
  const user = { hu: cur.hu !== prevAuto.hu ? cur.hu : '', de: cur.de !== prevAuto.de ? cur.de : '' };
  if (!user.hu && !user.de) return null;
  const info = { at: Date.now(), autoVals: {}, sources: {} };
  const patch = {};
  let complete = true;

  // One input field (Tomi 11205): the typed language was not clear on the phone (site/lang.js),
  // so it sits in the Hungarian field with langCheck. Claude tells the language and both names.
  if (it.langCheck && user.hu && !user.de && online && aiNameAny) {
    try {
      const a = await aiNameAny(user.hu);
      if (a?.lang) {
        patch.langCheck = false;
        if (a.brand && !it.brand) info.brand = { value: String(a.brand).slice(0, 40), estimate: true, source: 'Claude (gép)' };
        const typed = user.hu, ah = String(a.hu || '').trim().slice(0, 80), ad = String(a.de || '').trim().slice(0, 80);
        if (a.lang === 'de') {
          patch.de = typed; user.de = typed; user.hu = ''; // it was German: it moves to the German field
          patch.hu = ah && norm(ah) !== norm(typed) ? ah : '';
          if (patch.hu) { info.autoVals.hu = patch.hu; info.sources.translation = 'Claude (gép)'; } else delete patch.hu;
        } else {
          // Hungarian typed without accents ("kenyer"): Claude's spelling, the same word
          if (ah && ah !== typed && fold(ah) === fold(typed)) { patch.hu = ah; user.hu = ah; }
          if (ad && norm(ad) !== norm(typed)) { patch.de = ad; info.autoVals.de = ad; info.sources.translation = 'Claude (gép)'; }
        }
      }
    } catch { /* not reachable: the item stays Hungarian for now and is asked again later */ }
    if (patch.langCheck !== false) complete = false;
  }

  for (const [f, from, other] of [['de', 'hu', 'de'], ['hu', 'de', 'hu']]) {
    if (user[f] || !user[from] || patch[f]) continue; // this language was typed (or just filled), or there is nothing to translate from
    // 0. dictionary, exact match only
    const hit = lookup(user[from], from);
    let val = hit && norm(hit[from === 'hu' ? 0 : 1]) === norm(user[from]) ? hit[f === 'de' ? 1 : 0] : '';
    let src = val ? 'szótár' : '';
    // 1. machine translation
    if (!val) {
      if (!online) complete = false;
      else {
        // 1a. the home machine's Claude, when reachable (silently skipped otherwise)
        if (aiName) {
          try {
            const a = await aiName(from === 'hu' ? user.hu : '', from === 'de' ? user.de : '');
            const v = String(a?.[f] || '').trim();
            // the brand Claude read from the name, also when the name stays the same in both
            // languages ("Gaviscon dual"; Tomi 11097). The app uses it only if the name carries it.
            if (a?.brand && !it.brand) info.brand = { value: String(a.brand).slice(0, 40), estimate: true, source: 'Claude (gép)' };
            if (v && norm(v) !== norm(user[from])) { val = v.slice(0, 80); src = 'Claude (gép)'; }
          } catch { /* fall through to MyMemory */ }
        }
        // 1b. MyMemory
        if (!val) { try { val = await translate(user[from], from, other); src = val ? 'MyMemory gépi fordítás' : ''; } catch { complete = false; } }
      }
    }
    if (val) { patch[f] = val; info.autoVals[f] = val; info.sources.translation = src; }
    else if (prevAuto[f] && cur[f] === prevAuto[f]) { info.autoVals[f] = prevAuto[f]; info.sources.translation = it.enrich?.sources?.translation; }
  }

  const hu = patch.hu ?? cur.hu, de = patch.de ?? cur.de;
  const hit = lookup(hu, 'hu') || lookup(de, 'de');
  const category = hit ? hit[3] : '';
  if (hit && (!it.icon || it.icon === it.enrich?.icon)) { patch.icon = hit[2]; info.icon = hit[2]; }
  info.category = category;

  // No price or store estimates any more : a price only comes from a
  // verified store page (the home machine's /offer), otherwise "ár: nem találtam".

  // 2. Open Food Facts: by barcode when the item has one (exact product), else a
  // text search (packaged goods only; fresh produce has no product page).
  const q = [it.brand, de || hu].filter(Boolean).join(' ');
  if (it.barcode || category !== 'produce') {
    if (!online) complete = false;
    else {
      try {
        // exact product only: by barcode. (A text search may return a similar product;
        // pictures and links of the verified store page come from the home machine instead.)
        const off = it.barcode ? await lookupBarcode(it.barcode) : null;
        const src = it.barcode ? 'Open Food Facts (vonalkód)' : 'Open Food Facts';
        if (off?.photo) info.photo = { url: off.photo, big: off.big || '', source: src };
        // a link only when it is exactly this product: the barcode lookup (a text search may hit a similar product)
        if (off?.link && it.barcode) info.link = { url: off.link, label: off.name || 'termékoldal', source: src };
        if (off?.brand && (it.barcode || !info.brand)) info.brand = { value: off.brand.slice(0, 40), estimate: !it.barcode, source: src };
      } catch { complete = false; }
    }
  }

  info.key = enrichKey(hu, de);
  info.complete = complete;
  patch.enrich = info;
  return { patch, complete };
}
