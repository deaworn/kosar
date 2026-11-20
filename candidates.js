// Generic item candidate list (Tomi 11199 + 11240: "kenyér" -> list options by price and store).
// When the typed item is generic (no brand, no barcode, no specific product), the machine returns
// up to 8 verified store candidates sorted by unit price (per kg / l / piece, cheapest first).
// One tap on the phone picks a candidate: the item gets that product's name, brand, price, store,
// link and image. Until picked, the item works as a plain list entry.
// Pure: shared by the phone (site/app.js), the helper (ai/offers.mjs), and Node tests.
import { DICT, ALIASES, TIP_DICT, TIP_ALIASES, lookup, resolveAlias } from './dictionary.js';
import { applyBrand, splitBrand, learnable } from './brand.js';
import { guessLang } from './lang.js';
import { shopName } from './name-check.js';
import { unitLabel } from './units.js';

const fold = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
const asciiFold = (s) => fold(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss');
const cleanWord = (s) => fold(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const cleanAscii = (s) => asciiFold(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const DICT_HU = new Set(DICT.map((e) => fold(e[0])).filter(Boolean));
const DICT_DE = new Set(DICT.map((e) => fold(e[1])).filter(Boolean));

// Number of letters in a text (ignores spaces, digits and punctuation).
export const letterCount = (s) => String(s ?? '').replace(/[^\p{L}]/gu, '').length;

// Explicit complete German singular nouns whose canonical DICT entry is plural.
// Never guess via prefix/suffix heuristics (+n/+s), which falsely turn prefixes like "Lach" or "Chip" into complete words.
const DE_SINGULAR_MAP = new Map([
  ['apfel', 'Äpfel'],
  ['banane', 'Bananen'],
  ['orange', 'Orangen'],
  ['zitrone', 'Zitronen'],
  ['weintraube', 'Weintrauben'],
  ['birne', 'Birnen'],
  ['erdbeere', 'Erdbeeren'],
  ['himbeere', 'Himbeeren'],
  ['sauerkirsche', 'Sauerkirschen'],
  ['mandarine', 'Mandarinen'],
  ['tomate', 'Tomaten'],
  ['zwiebel', 'Zwiebeln'],
  ['kartoffel', 'Kartoffeln'],
  ['karotte', 'Karotten'],
  ['champignon', 'Champignons'],
  ['nudel', 'Nudeln'],
  ['keks', 'Kekse'],
  ['windel', 'Windeln'],
  ['haferflocke', 'Haferflocken'],
  ['löffelbiskuit', 'Löffelbiskuits'],
  ['loeffelbiskuit', 'Löffelbiskuits'],
  ['taschentuch', 'Taschentücher'],
  ['feuchttuch', 'Feuchttücher'],
]);

// Standard Levenshtein edit distance between two normalised strings.
export function editDistance(a, b) {
  const s = String(a || ''), t = String(b || '');
  const m = s.length, n = t.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[n];
}

const TIP_NAMES = new Map(TIP_DICT.map(([hu, de]) => [hu, {
  hu: cleanAscii(hu), de: cleanAscii(de), aliases: new Set(),
}]));
for (const [alias, target] of Object.entries(TIP_ALIASES)) TIP_NAMES.get(target)?.aliases.add(cleanAscii(alias));

const TIP_INDEX_BY_COUNTRY = new Map(['de', 'at', 'hu'].map(country => [country, new Map(
  [...TIP_NAMES].map(([name, terms]) => [country + '|' + name, terms]))]));

export function dictionaryTips(text, country = 'de') {
  const query = cleanAscii(text);
  const index = TIP_INDEX_BY_COUNTRY.get(country);
  if (query.length < 2 || !index) return [];

  const prefixes = [];
  for (const entry of TIP_DICT) {
    const { hu, aliases, de } = index.get(country + '|' + entry[0]);
    for (const [priority, names] of [[0, [hu]], [1, aliases], [2, [de]]]) {
      const length = Math.min(...Array.from(names, name => name.startsWith(query) ? name.length : Infinity));
      if (!Number.isFinite(length)) continue;
      prefixes.push({ entry, priority, length });
      break;
    }
  }
  prefixes.sort((a, b) => a.priority - b.priority || a.length - b.length);
  const exact = prefixes.slice(0, 3).map(({ entry }) => entry);

  const letters = letterCount(query);
  if (letters < 3 || exact.length === 3) return exact;
  const tolerance = letters >= 5 ? 2 : 1;
  const exactNames = new Set(exact.map(([hu]) => hu));
  const fuzzy = [];
  for (const entry of TIP_DICT) {
    if (exactNames.has(entry[0])) continue;
    const { hu, aliases } = index.get(country + '|' + entry[0]);
    let score = Infinity;
    for (const name of [hu, ...aliases]) {
      for (let len = query.length - tolerance; len <= Math.min(name.length, query.length + tolerance); len++) {
        const distance = editDistance(query, name.slice(0, len));
        if (distance <= tolerance) score = Math.min(score, distance + Math.abs(len - query.length) / 10);
      }
    }
    if (Number.isFinite(score)) fuzzy.push({ entry, score });
  }
  return exact.concat(fuzzy.sort((a, b) => a.score - b.score).slice(0, 3 - exact.length).map(({ entry }) => entry));
}

export function ownItemTips(text, items, history) {
  const query = cleanAscii(text);
  if (query.length < 2) return [];
  const rows = [
    ...Object.entries(items).map(([id, item]) => ({ id, item, inList: true })),
    ...Object.entries(history).map(([id, item]) => ({ id, item, inList: false })),
  ];
  return rows.filter(({ item }) => [item.hu, item.de, item.brand].some(value => cleanAscii(value).startsWith(query)))
    .sort((a, b) => (b.item.deletedAt || b.item.order || 0) - (a.item.deletedAt || a.item.order || 0))
    .slice(0, 4);
}

const KNOWN_ASCII_WORDS = (() => {
  const set = new Set();
  for (const e of DICT) {
    if (e[0]) set.add(cleanAscii(e[0]));
    if (e[1]) set.add(cleanAscii(e[1]));
  }
  for (const k of DE_SINGULAR_MAP.keys()) set.add(cleanAscii(k));
  for (const k of Object.keys(ALIASES)) set.add(cleanAscii(k));
  return [...set].filter(Boolean);
})();

// True when `aq` is a strict prefix of any known dictionary/singular/alias word
// (meaning the user is likely still typing that word, so fuzzy matching must wait).
function isStrictDictPrefix(aq) {
  if (!aq) return false;
  return KNOWN_ASCII_WORDS.some((w) => w.length > aq.length && w.startsWith(aq));
}

// Exact or alias match against DICT (accent-insensitive).
function exactOrAliasDictEntry(q) {
  const fq = cleanWord(q), aq = cleanAscii(q);
  if (!aq) return null;
  // 1. Alias check first for explicit canonical remapping (e.g. "kecsap" -> "ketchup", "csoki" -> "csokoládé")
  const aliased = resolveAlias(q);
  if (aliased) {
    const hit = DICT.find((e) => cleanWord(e[0]) === cleanWord(aliased));
    if (hit) return hit;
  }
  // 2. Exact DICT match (HU or DE)
  const exactHu = DICT.find((e) => cleanWord(e[0]) === fq);
  if (exactHu) return exactHu;
  const exactDe = DICT.find((e) => cleanWord(e[1]) === fq);
  if (exactDe) return exactDe;
  // 3. Accent-folded DICT match ("tejfol" -> "tejföl", "kenyer" -> "kenyér")
  const foldedHit = DICT.find((e) => cleanAscii(e[0]) === aq || cleanAscii(e[1]) === aq);
  if (foldedHit) return foldedHit;
  // 4. Explicit complete German singular noun ("Banane" -> "Bananen", "Kartoffel" -> "Kartoffeln")
  const pluralDe = DE_SINGULAR_MAP.get(fq) || DE_SINGULAR_MAP.get(aq);
  if (pluralDe) return DICT.find((e) => e[1] === pluralDe) || null;
  return null;
}

// Fuzzy fallback: for words of 5+ letters with no exact/alias hit (and not a strict prefix
// of a longer dictionary word), accept the closest dictionary word within edit distance 1
// (6+ letters: edit distance 2 when target is also >= 6 letters).
export function fuzzyDictEntry(q) {
  const aq = cleanAscii(q);
  const letters = letterCount(q);
  if (letters < 5 || !aq) return null;
  if (isStrictDictPrefix(aq)) return null;
  const maxDist = letters >= 6 ? 2 : 1;
  let best = null;
  let bestDist = Infinity;
  let bestLenDiff = Infinity;
  let bestSameStart = false;
  for (const e of DICT) {
    for (const side of [e[0], e[1]]) {
      const target = cleanAscii(side);
      if (!target || target.length < 4) continue;
      if (Math.abs(target.length - aq.length) > maxDist) continue;
      const dist = editDistance(aq, target);
      if (dist === 0 || dist > maxDist) continue;
      if (dist === 2 && (letters < 6 || target.length < 6)) continue;
      const lenDiff = Math.abs(target.length - aq.length);
      const sameStart = aq[0] === target[0];
      if (
        !best ||
        dist < bestDist ||
        (dist === bestDist && sameStart && !bestSameStart) ||
        (dist === bestDist && sameStart === bestSameStart && lenDiff < bestLenDiff)
      ) {
        best = e;
        bestDist = dist;
        bestLenDiff = lenDiff;
        bestSameStart = sameStart;
      }
    }
  }
  return best;
}

function resolveDictEntry(q) {
  return exactOrAliasDictEntry(q) || fuzzyDictEntry(q);
}

// True when the typed text resolves to a complete known dictionary word
// (exact HU/DE, accent-folded, explicit German singular, spelling alias, or fuzzy fallback for 5+ letters).
export function isDictionaryWord(text, learned = []) {
  const clean = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!clean) return false;
  const r = applyBrand({ hu: clean, de: '', brand: '' }, learned);
  const q = r.hu.trim();
  if (!q || r.brand) return false;
  return Boolean(resolveDictEntry(q));
}

// Resolves typed text (Hungarian or German, with or without accents, aliases, or fuzzy typos) into { hu, de, brand }
// so that typing "Kenyér", "kenyer", "Brot", "Kecsap", or "ketchap" all hit the same cache key.
export function candidateItem(text, learned = []) {
  const clean = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!clean) return { hu: '', de: '', brand: '' };
  const r = applyBrand({ hu: clean, de: '', brand: '' }, learned);
  const q = r.hu.trim();
  if (!q) return { hu: '', de: '', brand: r.brand || '' };
  const hit = resolveDictEntry(q);
  if (hit) return { hu: hit[0], de: hit[1], brand: r.brand || '' };
  // Non-dictionary phrase: detect language offline
  const lang = guessLang(q);
  if (lang === 'de') return { hu: '', de: q, brand: r.brand || '' };
  return { hu: q, de: '', brand: r.brand || '' };
}

// Known product-line names that name a specific product even without the brand word next to them.
const SPECIFIC_LINES = /\b(soft cake|american sandwich|alpenmilch|goldbären|goldbaeren|milchbären|milchbaeren|jaffa-schnitten|traube-nuss)\b/i;

// True when the item is a generic product category ("kenyér", "tej", "Brot", "Vollkornbrot"),
// false when it carries a brand, barcode, pack size/number, specific product line, or was already picked.
export function isGeneric(item, learned = []) {
  if (!item || typeof item !== 'object') return false;
  if (item.picked || item.offer?.picked) return false;
  if (String(item.brand || '').trim() || String(item.barcode || '').trim()) return false;
  const hu = String(item.hu || '').trim(), de = String(item.de || '').trim();
  if (!hu && !de) return false;
  if (splitBrand(hu, learned) || splitBrand(de, learned)) return false;
  const both = (hu + ' ' + de).trim();
  if (/\d/.test(both) || /[+&®™"„”]/.test(both) || SPECIFIC_LINES.test(both)) return false;
  const fh = fold(hu), fd = fold(de);
  if ((fh && DICT_HU.has(fh)) || (fd && DICT_DE.has(fd))) return true;
  const huWords = fh ? fh.split(/[\s,()-]+/).filter(Boolean).length : 0;
  const deWords = fd ? fd.split(/[\s,()-]+/).filter(Boolean).length : 0;
  return huWords <= 3 && deWords <= 2;
}
export const genericItem = isGeneric;

// Pack size from a product title when not given separately ("Bauernbrot 500g" -> "500 g").
// Weight or volume always wins over a piece count when both appear ("Vitaminbrot (5 Stück), 250 g" -> "250 g").
export function packFromText(text) {
  const t = String(text || '').replace(/\u00a0/g, ' ').replace(/(\d)\s*(?:×|à|á|\ba\b)\s*(\d)/gi, '$1x$2');
  const perWv = t.match(/\b(?:je|pro|per)\s+(kg|kilo|100\s?g|liter|l)\b/i);
  if (perWv) return '1 ' + perWv[1].replace(/^kilo$/i, 'kg').replace(/^liter$/i, 'l');
  const wv = t.match(/(?:^|[\s,(])((?:\d+\s?x\s?)?\d+(?:[.,]\d+)?)\s?(kg|g|ml|cl|l)(?!\s*=)\b/i);
  if (wv) return wv[1].replace(/\s+/g, '') + ' ' + wv[2];
  const perPc = t.match(/\b(?:je|pro|per)\s+(stück|stk|st)\b/i);
  if (perPc) return '1 Stück';
  const pc = t.match(/(?:^|[\s,(])((?:\d+\s?x\s?)?\d+(?:[.,]\d+)?)\s?(stück|stk|st|db|tabs|caps|blatt|rollen)\b/i);
  if (pc) return (pc[1].replace(/\s+/g, '') + ' ' + pc[2]).replace(/ (stück|stk|st)$/i, ' Stück');
  return '';
}

const WV_UNITS = 'kg|g|l|liter|ml|cl';
const PC_UNITS = 'stück|stueck|stk|st|db|tabs|caps|blatt|rollen';
const hasWeightOrVol = (s) => /(?:^|[\s,(\d])(kg|g|l|liter|ml|cl)\b/i.test(String(s || ''));

function unitPriceFromPack(val, raw, unitsPattern) {
  const u = String(raw || '').replace(/\u00a0/g, ' ').replace(/-?(stück|stk|st)(-packung)?\b/gi, ' Stück')
    .replace(/(\d)\s*(?:×|x|à|á|\ba\b)\s*(\d)/gi, '$1x$2').replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  if (!u) return null;
  const exact = u.match(new RegExp('^(?:(\\d+)\\s*x\\s*)?(\\d+(?:\\.\\d+)?)?\\s*(' + unitsPattern + ')\\.?$', 'i'));
  const embed = !exact && u.match(new RegExp('(?:^|[\\s,(])(?:(\\d+)\\s*x\\s*)?(\\d+(?:\\.\\d+)?)\\s*(' + unitsPattern + ')(?!\\s*=)\\b', 'i'));
  const m = exact || embed;
  if (!m) return null;
  const mult = m[1] ? Number(m[1]) : 1;
  const num = m[2] ? Number(m[2]) : 1;
  const total = mult * num;
  const kind = m[3].toLowerCase();
  if (!(total > 0)) return null;
  let amount = total, base = 'db';
  if (kind === 'kg') { amount = total; base = 'kg'; }
  else if (kind === 'g') { amount = total / 1000; base = 'kg'; }
  else if (kind === 'l' || kind === 'liter') { amount = total; base = 'l'; }
  else if (kind === 'ml') { amount = total / 1000; base = 'l'; }
  else if (kind === 'cl') { amount = total / 100; base = 'l'; }
  const value = Math.round((val / amount) * 100) / 100;
  return { value, unit: base, text: value.toFixed(2).replace('.', ',') + ' € / ' + base };
}

function unitPriceFromBase(rawB, unitsPattern) {
  if (!rawB) return null;
  const b = String(rawB).replace(/\u00a0/g, ' ').replace(/,/g, '.');
  const eq = b.match(new RegExp('(?:^|\\b)(100|1)\\s*(' + unitsPattern + ')\\s*=\\s*(\\d+(?:\\.\\d{1,2})?)', 'i'));
  const sl = !eq && b.match(new RegExp('(\\d+(?:\\.\\d{1,2})?)\\s*(?:€|eur)?\\s*\\/\\s*(100|1)?\\s*(' + unitsPattern + ')\\b', 'i'));
  const qty = eq ? Number(eq[1]) : sl ? Number(sl[2] || 1) : 0;
  const kind = (eq ? eq[2] : sl ? sl[3] : '').toLowerCase();
  const ref = eq ? Number(eq[3]) : sl ? Number(sl[1]) : 0;
  if (!(ref > 0 && qty > 0)) return null;
  let factor = 1 / qty, base = 'db';
  if (kind === 'kg') { factor = 1 / qty; base = 'kg'; }
  else if (kind === 'g') { factor = 1000 / qty; base = 'kg'; }
  else if (kind === 'l' || kind === 'liter') { factor = 1 / qty; base = 'l'; }
  else if (kind === 'ml') { factor = 1000 / qty; base = 'l'; }
  else if (kind === 'cl') { factor = 100 / qty; base = 'l'; }
  const value = Math.round(ref * factor * 100) / 100;
  return { value, unit: base, text: value.toFixed(2).replace('.', ',') + ' € / ' + base };
}

// Normalises (price, unit, basePriceText) into a unit price per kg, per l, or per piece (db):
//   calcUnitPrice(1.19, '500 g') -> { value: 2.38, unit: 'kg', text: '2,38 € / kg' }
// When a weight or volume is present (g/kg/ml/cl/l), ALWAYS uses €/kg or €/l even if a piece count is also present.
export function calcUnitPrice(priceOrObj, unitStr = '', baseStr = '') {
  const isObj = priceOrObj && typeof priceOrObj === 'object';
  const val = Number(isObj ? (priceOrObj.value ?? priceOrObj.price) : priceOrObj);
  if (!(val > 0 && Number.isFinite(val))) return null;
  const rawU = String(isObj ? ([unitStr, priceOrObj.unit, priceOrObj.name].filter(Boolean).join(' ')) : (unitStr || '')).trim();
  const rawB = String(isObj ? (baseStr || priceOrObj.base || '') : (baseStr || '')).trim();
  return unitPriceFromPack(val, rawU, WV_UNITS)
    || unitPriceFromBase(rawB, WV_UNITS)
    || unitPriceFromPack(val, rawB, WV_UNITS)
    || unitPriceFromPack(val, rawU, PC_UNITS)
    || unitPriceFromBase(rawB, PC_UNITS)
    || null;
}

// Clearly not the product itself, but a baking mix, dough, spice, flavouring, mould or container/accessory for it.
const NON_PRODUCT = /(?<![a-zäöüß])([a-zäöüß]*backmischung|fertigmischung|mischung\s+zum\s+backen|[a-zäöüß]*teig|[a-zäöüß]*gew(?:ü|ue)rz(?:mischung|zubereitung)?|[a-zäöüß]*aroma|[a-zäöüß]*form(?:en)?|[a-zäöüß]*dose(?:n)?|brot(?:kasten|box|korb|beutel|topf|messer|schneider|backautomat)|back(?:pulver|hefe|mittel|zutat))(?![a-zäöüß])/i;
export const isNonProduct = (name) => NON_PRODUCT.test(String(name || '').normalize('NFC'));

// Turns a verified page result ({ link, price }) or a candidate object into a normalised candidate.
export function toCandidate(v, learned = []) {
  if (!v || typeof v !== 'object') return null;
  const link = v.link && typeof v.link === 'object' ? v.link : {};
  const p = v.price && typeof v.price === 'object' ? v.price : null;
  const priceVal = Number(p ? p.value : (v.price ?? v.value));
  if (!(priceVal > 0 && Number.isFinite(priceVal))) return null;
  const store = String(p?.store || link.store || v.store || '').trim();
  if (!store) return null;
  const url = String(p?.url || link.url || v.url || '').trim();
  const rawName = String(link.name || v.name || '').trim();
  const name = shopName(rawName) || rawName;
  if (isNonProduct(rawName) || isNonProduct(name)) return null;
  let brand = String(link.brand || v.brand || '').trim();
  if (!brand && name) { const sb = splitBrand(name, learned); if (sb) brand = sb.brand; }
  const rawUnit = String(p?.unit ?? v.unit ?? '').trim();
  const nameUnit = packFromText(name);
  const unit = (!hasWeightOrVol(rawUnit) && hasWeightOrVol(nameUnit)) ? nameUnit : (packFromText(rawUnit) || rawUnit || nameUnit);
  const base = String(p?.base ?? v.base ?? '').trim();
  const up = calcUnitPrice(priceVal, unit + (name ? ' ' + name : ''), base) || (Number(v.unitPrice) > 0 ? {
    value: Math.round(Number(v.unitPrice) * 100) / 100,
    unit: String(v.unitBase || v.unitPriceUnit || '').trim(),
    text: String(v.unitPriceText || '').trim() || (Number(v.unitPrice).toFixed(2).replace('.', ',') + ' €' + (v.unitBase ? ' / ' + v.unitBase : '')),
  } : null);
  const currency = p?.currency || v.currency;
  const image = String(link.image ?? v.image ?? '').trim();
  const date = String(p?.date || v.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const online = !!(p?.online || v.online);
  return {
    name,
    brand,
    store,
    price: Math.round(priceVal * 100) / 100,
    unit,
    unitPrice: up ? up.value : null,
    unitBase: up ? up.unit : '',
    unitPriceText: up && currency === 'HUF'
      ? new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 }).format(up.value) + ' Ft / ' + up.unit
      : up ? up.text : base,
    image,
    url,
    date,
    ...(online ? { online: true } : {}),
    ...((p?.inArea ?? v.inArea) === false ? { inArea: false } : {}),
    ...((p?.onlineAvailable ?? v.onlineAvailable) === false ? { onlineAvailable: false } : {}),
    ...(currency ? { currency } : {}),
  };
}

// Candidates sorted by the unit-price base most candidates share (usually €/kg), cheapest first;
// never compares different bases. Candidates with another base or no unit price sort after them
// by package price ascending, then store and product name.
export function sortCandidates(candidates, learned = []) {
  if (!Array.isArray(candidates)) return [];
  const list = candidates.map((c) => toCandidate(c, learned)).filter(Boolean);
  const counts = new Map();
  for (const c of list) {
    if (c.unitPrice != null && c.unitBase) counts.set(c.unitBase, (counts.get(c.unitBase) || 0) + 1);
  }
  const order = { kg: 3, l: 2, db: 1 };
  let mainBase = '', bestCount = 0;
  for (const [b, n] of counts) {
    if (n > bestCount || (n === bestCount && (order[b] || 0) > (order[mainBase] || 0))) {
      mainBase = b;
      bestCount = n;
    }
  }
  return list.sort((a, b) => {
    const aMain = Boolean(mainBase && a.unitPrice != null && a.unitBase === mainBase);
    const bMain = Boolean(mainBase && b.unitPrice != null && b.unitBase === mainBase);
    if (aMain !== bMain) return aMain ? -1 : 1;
    if (aMain && bMain && a.unitPrice !== b.unitPrice) return a.unitPrice - b.unitPrice;
    if (a.price !== b.price) return a.price - b.price;
    return a.store.localeCompare(b.store, 'de') || a.name.localeCompare(b.name, 'de');
  });
}

// Deduplicates verified results and returns at most `max` (default 8) sorted by unit price.
export function buildCandidates(verifiedList, { max = 8, learned = [] } = {}) {
  const seen = new Set(), list = [];
  for (const raw of verifiedList || []) {
    const c = toCandidate(raw, learned);
    if (!c) continue;
    const key = (c.url || (c.store + '|' + c.name + '|' + c.unit)).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(c);
  }
  return sortCandidates(list, learned).slice(0, max);
}

// Active candidates for an item's chooser on the phone: empty once picked, checked off, or overridden by own price.
export function activeCandidates(it) {
  if (!it || it.done || it.myPrice || it.offer?.picked) return [];
  const cs = it.offer?.candidates;
  return Array.isArray(cs) && cs.length > 0 ? sortCandidates(cs) : [];
}

// Display title for a candidate row in the chooser (includes brand if not already in the name).
export function candidateTitle(c) {
  const name = shopName(c?.name || '').trim();
  const brand = String(c?.brand || '').trim();
  if (!brand) return name;
  if (fold(name).includes(fold(brand))) return name;
  return (brand + ' ' + name).trim();
}

// Compact pack + unit-price subtitle for a candidate row ("500 g · 2,38 € / kg" or "1,79 € / kg").
export function candidateUnitInfo(c) {
  const ul = unitLabel(c?.unit || '');
  const ut = String(c?.unitPriceText || '').trim();
  if (ul && ut) {
    if (ul === c.unitBase) return ut;
    return ul + ' · ' + ut;
  }
  return ut || (ul ? '/ ' + ul : '');
}

// One-tap pick on the phone: applies the candidate's product name, brand, price, store, link and image
// to the item, marks the offer as picked, and keeps offer.key / enrich.key in step so no new search runs.
export function pickCandidate(it, cand, learned = [], keys = null) {
  const c = toCandidate(cand, learned);
  if (!it || !c) return false;
  const fullName = shopName(c.name || '').trim() || c.name || '';
  let brand = c.brand || '';
  const extraLearned = brand ? [learnable(brand) || brand, ...learned] : learned;
  const sb = splitBrand(fullName, extraLearned);
  if (!brand && sb) brand = sb.brand;
  if (brand) brand = learnable(brand) || brand;
  const prodDe = sb && sb.sure && (!brand || fold(sb.brand) === fold(brand)) ? sb.rest : fullName;
  const hadAutoDe = !!(it.de && it.enrich?.autoVals?.de === it.de);
  if (prodDe) it.de = prodDe;
  if (brand) it.brand = brand;
  const prevOffer = it.offer || {};
  const now = Date.now();
  it.offer = {
    at: prevOffer.at || now,
    checked: prevOffer.checked || new Date(now).toISOString(),
    pharmacy: prevOffer.pharmacy ?? null,
    variants: prevOffer.variants ?? null,
    candidates: prevOffer.candidates ?? null,
    ...prevOffer,
    picked: true,
    alt: null,
    notSold: [],
    link: {
      url: c.url || '',
      store: c.store || '',
      name: fullName,
      brand: brand || c.brand || '',
      image: c.image || '',
    },
    price: {
      value: c.price,
      store: c.store || '',
      unit: c.unit || '',
      base: c.unitPriceText || '',
      date: c.date || new Date(now).toISOString().slice(0, 10),
      url: c.url || '',
      ...(c.online ? { online: true } : {}),
      ...(c.inArea === false ? { inArea: false } : {}),
      ...(c.onlineAvailable === false ? { onlineAvailable: false } : {}),
      ...(c.currency ? { currency: c.currency } : {}),
    },
  };
  if (it.enrich) {
    if (hadAutoDe && it.de) it.enrich.autoVals = { ...(it.enrich.autoVals || {}), de: it.de };
    if (keys?.enrich) it.enrich.key = keys.enrich(it.hu, it.de);
  }
  if (keys?.offer) it.offer.key = keys.offer(it);
  return true;
}

// Builds a new shopping-list item directly from typed text and a picked candidate from the
// while-typing dropdown (Tomi 11244: one tap adds the item with name, brand, price, store, unit price, image).
export function addWithCandidate(text, cand, { id = '', now = Date.now(), learned = [], keys = null, candidates = null, matched = '' } = {}) {
  const base = candidateItem(matched || text, learned);
  const hit = lookup(base.hu, 'hu') || lookup(base.de, 'de');
  const it = {
    ...(id ? { id } : {}),
    hu: base.hu || (hit ? hit[0] : ''),
    de: base.de || (hit ? hit[1] : ''),
    qty: '',
    brand: base.brand || '',
    group: 'kell',
    done: false,
    order: now,
    ...(hit?.[2] ? { icon: hit[2] } : {}),
  };
  if (it.hu) {
    it.enrich = {
      key: keys?.enrich ? keys.enrich(it.hu, it.de) : '',
      at: now,
      complete: true,
      autoVals: it.de ? { de: it.de } : {},
      sources: { translation: hit ? 'szótár' : 'bolti termék' },
      ...(hit ? { icon: hit[2], category: hit[3] } : {}),
    };
  }
  if (Array.isArray(candidates) && candidates.length) {
    it.offer = {
      at: now,
      checked: new Date(now).toISOString(),
      pharmacy: null,
      variants: null,
      candidates: sortCandidates(candidates, learned).slice(0, 8),
    };
  }
  pickCandidate(it, cand, learned, keys);
  return it;
}

function scoreNameMatch(name, fq, aq) {
  const fn = fold(name), an = asciiFold(name);
  if (!fn || !an) return null;
  const fnSp = fn.replace(/-/g, ' '), anSp = an.replace(/-/g, ' ');
  const fqSp = fq.replace(/-/g, ' '), aqSp = aq.replace(/-/g, ' ');
  const hasTypedAccent = fq !== aq;
  let tier = -1;
  if (fn === fq || fnSp === fqSp) tier = 0;
  else if (!hasTypedAccent && (an === aq || anSp === aqSp)) tier = 1;
  else if (fn.startsWith(fq) || fnSp.startsWith(fqSp)) tier = 2;
  else if (an === aq || anSp === aqSp) tier = 3;
  else if (!hasTypedAccent && (an.startsWith(aq) || anSp.startsWith(aqSp))) tier = 4;
  else if (an.startsWith(aq) || anSp.startsWith(aqSp)) tier = 5;
  if (tier < 0) return null;
  const exact = tier <= 1;
  return { name: fn, tier, exact, len: fn.length, accentExact: fn === fq || fn.startsWith(fq) || fnSp === fqSp || fnSp.startsWith(fqSp) };
}

function entryNamesFromKey(key) {
  const parts = String(key || '').split('|');
  if (parts.length < 4) return null;
  const [kb, kbr, rawDe, rawHu] = parts;
  if (kb || kbr) return null;
  let khu = fold(rawHu), kde = fold(rawDe);
  if (khu && !kde) {
    const d = DICT.find((e) => fold(e[0]) === khu || asciiFold(e[0]) === asciiFold(khu));
    if (d) kde = fold(d[1]);
  } else if (kde && !khu) {
    const d = DICT.find((e) => fold(e[1]) === kde || asciiFold(e[1]) === asciiFold(kde));
    if (d) khu = fold(d[0]);
  }
  if (!khu && !kde) return null;
  return { khu, kde };
}

// Looks for cached generic entries in `db` whose hu or de name STARTS WITH the typed text
// (accent-insensitive: "keny" -> "kenyér", "brot" -> "brot", "tej" -> "tej", "tejf" -> "tejföl").
// Prefers exact match first, then shortest matched name. Returns { matched, candidates, key } or null.
export function matchCachedEntry(db, text, { now = Date.now(), ttl = 3 * 864e5, max = 6, learned = [], _fallback = true } = {}) {
  if (!db || typeof db !== 'object') return null;
  const clean = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!clean) return null;
  if (splitBrand(clean, learned)) return null;
  const fq = fold(clean), aq = asciiFold(clean);
  if (!aq) return null;

  const hasTypedAccent = fq !== aq;
  let best = null;

  for (const [key, entry] of Object.entries(db)) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.at && ttl > 0 && now - entry.at >= ttl) continue;
    const names = entryNamesFromKey(key);
    if (!names || !isGeneric({ hu: names.khu, de: names.kde }, learned)) continue;
    const raw = Array.isArray(entry.candidates) && entry.candidates.length
      ? entry.candidates
      : (entry.price && entry.link ? [{ link: entry.link, price: entry.price }] : []);
    if (!raw.length) continue;

    const mHu = names.khu ? scoreNameMatch(names.khu, fq, aq) : null;
    const mDe = names.kde ? scoreNameMatch(names.kde, fq, aq) : null;
    if (!mHu && !mDe) continue;

    let m = mHu || mDe;
    if (mHu && mDe) {
      if (mHu.exact !== mDe.exact) m = mHu.exact ? mHu : mDe;
      else if (mHu.accentExact !== mDe.accentExact) m = mHu.accentExact ? mHu : mDe;
      else m = mHu;
    }

    const cands = sortCandidates(raw, learned).slice(0, max);
    if (!cands.length) continue;

    if (!best) {
      best = { match: m, candidates: cands, key, entry };
      continue;
    }
    const bm = best.match;
    let take = false;
    if (m.exact !== bm.exact) take = m.exact;
    else if (hasTypedAccent && m.accentExact !== bm.accentExact) take = m.accentExact;
    else if (m.len !== bm.len) take = m.len < bm.len;
    else if (m.tier !== bm.tier) take = m.tier < bm.tier;
    else take = m.name.localeCompare(bm.name, 'hu') < 0;
    if (take) best = { match: m, candidates: cands, key, entry };
  }

  if (best) return { matched: best.match.name, candidates: best.candidates, key: best.key, entry: best.entry };

  // Alias / fuzzy dictionary fallback on cached entries (e.g. "Kecsap" or "ketchap" -> cached "ketchup")
  if (_fallback) {
    const dictHit = resolveDictEntry(clean);
    const aliasMatches = Object.entries(ALIASES)
      .filter(([alias]) => asciiFold(alias).startsWith(aq))
      .sort(([a], [b]) => a.length - b.length || a.localeCompare(b, 'hu'));
    const canonical = new Set([dictHit?.[0], dictHit?.[1], ...aliasMatches.map(([, target]) => target)]);
    for (const name of canonical) {
      if (!name || asciiFold(name) === aq) continue;
      const canonRes = matchCachedEntry(db, name, { now, ttl, max, learned, _fallback: false });
      if (canonRes) return canonRes;
    }
  }
  return null;
}

// True when `text` matches an exact cached key in `db` (Hungarian or German, accent-insensitive).
export function hasExactCachedKey(db, text, learned = []) {
  if (!db || typeof db !== 'object') return false;
  const clean = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!clean) return false;
  const aq = asciiFold(clean);
  if (!aq) return false;
  const it = candidateItem(clean, learned);
  const directKey = [it.barcode || '', fold(it.brand), fold(it.de), fold(it.hu)].join('|');
  if (db[directKey]) return true;
  for (const key of Object.keys(db)) {
    const names = entryNamesFromKey(key);
    if (!names) continue;
    if ((names.khu && asciiFold(names.khu) === aq) || (names.kde && asciiFold(names.kde) === aq)) return true;
  }
  return false;
}

// Only start a background search when the text is a complete known word/phrase (dictionary.js hit,
// alias, fuzzy dictionary hit, or an exact cached key) or the user presses + / stops typing for 1.5 s
// with at least 4 letters (settled: true / search: true).
export function shouldSearchCandidates(text, { db = null, search = false, settled = false, learned = [], minSearchChars = 4 } = {}) {
  const clean = String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (!clean) return false;
  if (isDictionaryWord(clean, learned)) return true;
  if (db && hasExactCachedKey(db, clean, learned)) return true;
  if ((search === true || settled === true) && letterCount(clean) >= minSearchChars) return true;
  return false;
}

// Debounced while-typing candidate lookup controller (~500 ms debounce, 1.5 s settle search for 4+ letters,
// min 3 chars, max 6 rows, polls a few times on pending, silent offline fallback, never blocks typing).
export function createTypingCandidates({
  fetchCandidates,
  onUpdate = () => {},
  isOnline = () => true,
  isConfigured = () => true,
  learned = () => [],
  debounceMs = 500,
  settleMs = 1500,
  pollMs = 12000,
  maxPolls = 4,
  minChars = 3,
  minSearchChars = 4,
  maxRows = 6,
} = {}) {
  let seq = 0, debounceTimer = null, settleTimer = null, pollTimer = null;
  let state = { text: '', candidates: [], pending: false };
  const stopTimers = () => {
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null; }
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  };
  const setState = (next) => { state = next; onUpdate(state); };

  async function run(text, mySeq, pollIndex, settled = false) {
    if (mySeq !== seq || !isOnline() || !isConfigured()) return;
    let res = null;
    try { res = await fetchCandidates(text, { settled: Boolean(settled), search: Boolean(settled) }); } catch { res = null; }
    if (mySeq !== seq) return;
    if (!res) {
      setState({ text, candidates: [], pending: false });
      return;
    }
    if (res.pending === true) {
      const list = Array.isArray(res.candidates) ? sortCandidates(res.candidates, learned()).slice(0, maxRows) : [];
      const matched = list.length && res.matched ? String(res.matched).trim() : '';
      if (pollIndex < maxPolls) {
        setState({ text, candidates: list, pending: true, ...(matched ? { matched } : {}) });
        pollTimer = setTimeout(() => { pollTimer = null; run(text, mySeq, pollIndex + 1, false); }, pollMs);
        pollTimer.unref?.();
        return;
      }
      setState({ text, candidates: list, pending: false, ...(matched ? { matched } : {}) });
      return;
    }
    if (Array.isArray(res.candidates)) {
      const list = sortCandidates(res.candidates, learned()).slice(0, maxRows);
      const matched = list.length && res.matched ? String(res.matched).trim() : '';
      setState({ text, candidates: list, pending: false, ...(matched ? { matched } : {}) });
      if (!list.length && !settled && settleMs > 0 && letterCount(text) >= minSearchChars && !isDictionaryWord(text, learned())) {
        const waitMs = Math.max(10, settleMs - debounceMs);
        settleTimer = setTimeout(() => { settleTimer = null; run(text, mySeq, 0, true); }, waitMs);
        settleTimer.unref?.();
      }
      return;
    }
    setState({ text, candidates: [], pending: false });
  }

  return {
    input(rawText) {
      seq++;
      stopTimers();
      const text = String(rawText ?? '').trim();
      if (text.length < minChars || !isOnline() || !isConfigured()) {
        setState({ text, candidates: [], pending: false });
        return;
      }
      const mySeq = seq;
      debounceTimer = setTimeout(() => { debounceTimer = null; run(text, mySeq, 0, false); }, debounceMs);
      debounceTimer.unref?.();
    },
    submit(rawText) {
      seq++;
      stopTimers();
      const text = String((rawText ?? state.text) || '').trim();
      if (!text || !isOnline() || !isConfigured()) {
        setState({ text, candidates: [], pending: false });
        return;
      }
      const mySeq = seq;
      run(text, mySeq, 0, true);
    },
    clear() {
      seq++;
      stopTimers();
      setState({ text: '', candidates: [], pending: false });
    },
    getState: () => state,
  };
}
