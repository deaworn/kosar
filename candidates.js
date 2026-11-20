// Generic item candidate list (Tomi 11199 + 11240: "kenyér" -> list options by price and store).
// When the typed item is generic (no brand, no barcode, no specific product), the machine returns
// up to 8 verified store candidates sorted by unit price (per kg / l / piece, cheapest first).
// One tap on the phone picks a candidate: the item gets that product's name, brand, price, store,
// link and image. Until picked, the item works as a plain list entry.
// Pure: shared by the phone (site/app.js), the helper (ai/offers.mjs), and Node tests.
import { DICT } from './dictionary.js';
import { splitBrand, learnable } from './brand.js';
import { shopName } from './name-check.js';
import { unitLabel } from './units.js';

const fold = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
const DICT_HU = new Set(DICT.map((e) => fold(e[0])).filter(Boolean));
const DICT_DE = new Set(DICT.map((e) => fold(e[1])).filter(Boolean));

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
export function packFromText(text) {
  const t = String(text || '').replace(/\u00a0/g, ' ').replace(/(\d)\s*(?:×|à|á|\ba\b)\s*(\d)/gi, '$1x$2');
  const per = t.match(/\b(?:je|pro|per)\s+(kg|kilo|stück|stk|st|100\s?g|liter|l)\b/i);
  if (per) return '1 ' + per[1].replace(/^kilo$/i, 'kg').replace(/^(stück|stk|st)$/i, 'Stück').replace(/^liter$/i, 'l');
  const size = t.match(/(?:^|[\s,(])((?:\d+\s?x\s?)?\d+(?:[.,]\d+)?)\s?(kg|g|ml|cl|l|stück|stk|st|db|tabs|caps|blatt|rollen)\b/i);
  if (size) return (size[1].replace(/\s+/g, '') + ' ' + size[2]).replace(/ (stück|stk|st)$/i, ' Stück');
  return '';
}

// Normalises (price, unit, basePriceText) into a unit price per kg, per l, or per piece (db):
//   calcUnitPrice(1.19, '500 g') -> { value: 2.38, unit: 'kg', text: '2,38 € / kg' }
export function calcUnitPrice(priceOrObj, unitStr = '', baseStr = '') {
  const isObj = priceOrObj && typeof priceOrObj === 'object';
  const val = Number(isObj ? (priceOrObj.value ?? priceOrObj.price) : priceOrObj);
  if (!(val > 0 && Number.isFinite(val))) return null;
  const rawU = String(isObj ? (unitStr || priceOrObj.unit || '') : (unitStr || '')).trim();
  const rawB = String(isObj ? (baseStr || priceOrObj.base || '') : (baseStr || '')).trim();
  const u = rawU.replace(/\u00a0/g, ' ').replace(/-?(stück|stk|st)(-packung)?$/i, ' Stück')
    .replace(/(\d)\s*(?:×|x|à|á|\ba\b)\s*(\d)/gi, '$1x$2').replace(',', '.').replace(/\s+/g, ' ').trim();
  const m = u.match(/^(?:(\d+)\s*x\s*)?(\d+(?:\.\d+)?)?\s*(kg|g|l|liter|ml|cl|stück|stueck|stk|st|db|tabs|caps|blatt|rollen)\.?$/i);
  if (m) {
    const mult = m[1] ? Number(m[1]) : 1;
    const num = m[2] ? Number(m[2]) : 1;
    const total = mult * num;
    const kind = m[3].toLowerCase();
    if (total > 0) {
      let amount = total, base = 'db';
      if (kind === 'kg') { amount = total; base = 'kg'; }
      else if (kind === 'g') { amount = total / 1000; base = 'kg'; }
      else if (kind === 'l' || kind === 'liter') { amount = total; base = 'l'; }
      else if (kind === 'ml') { amount = total / 1000; base = 'l'; }
      else if (kind === 'cl') { amount = total / 100; base = 'l'; }
      const value = Math.round((val / amount) * 100) / 100;
      return { value, unit: base, text: value.toFixed(2).replace('.', ',') + ' € / ' + base };
    }
  }
  if (rawB) {
    const b = rawB.replace(/\u00a0/g, ' ').replace(',', '.');
    const eq = b.match(/(?:^|\b)(100|1)\s*(kg|g|l|liter|ml|stück|stueck|stk|st|db)\s*=\s*(\d+(?:\.\d{1,2})?)/i);
    const sl = !eq && b.match(/(\d+(?:\.\d{1,2})?)\s*(?:€|eur)?\s*\/\s*(100|1)?\s*(kg|g|l|liter|ml|stück|stueck|stk|st|db)\b/i);
    const qty = eq ? Number(eq[1]) : sl ? Number(sl[2] || 1) : 0;
    const kind = (eq ? eq[2] : sl ? sl[3] : '').toLowerCase();
    const ref = eq ? Number(eq[3]) : sl ? Number(sl[1]) : 0;
    if (ref > 0 && qty > 0) {
      let factor = 1 / qty, base = 'db';
      if (kind === 'kg') { factor = 1 / qty; base = 'kg'; }
      else if (kind === 'g') { factor = 1000 / qty; base = 'kg'; }
      else if (kind === 'l' || kind === 'liter') { factor = 1 / qty; base = 'l'; }
      else if (kind === 'ml') { factor = 1000 / qty; base = 'l'; }
      const value = Math.round(ref * factor * 100) / 100;
      return { value, unit: base, text: value.toFixed(2).replace('.', ',') + ' € / ' + base };
    }
  }
  return null;
}

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
  let brand = String(link.brand || v.brand || '').trim();
  if (!brand && name) { const sb = splitBrand(name, learned); if (sb) brand = sb.brand; }
  const unit = String(p?.unit ?? v.unit ?? '').trim() || packFromText(name);
  const base = String(p?.base ?? v.base ?? '').trim();
  const up = calcUnitPrice(priceVal, unit, base) || (Number(v.unitPrice) > 0 ? {
    value: Math.round(Number(v.unitPrice) * 100) / 100,
    unit: String(v.unitBase || v.unitPriceUnit || '').trim(),
    text: String(v.unitPriceText || '').trim() || (Number(v.unitPrice).toFixed(2).replace('.', ',') + ' €' + (v.unitBase ? ' / ' + v.unitBase : '')),
  } : null);
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
    unitPriceText: up ? up.text : base,
    image,
    url,
    date,
    ...(online ? { online: true } : {}),
  };
}

// Candidates sorted by unit price ascending (cheapest per kg/l/piece first); ties broken by
// total price ascending, then store and product name. Candidates without a unit price sort after
// those with one, ordered by their total price.
export function sortCandidates(candidates, learned = []) {
  if (!Array.isArray(candidates)) return [];
  return candidates
    .map((c) => toCandidate(c, learned))
    .filter(Boolean)
    .sort((a, b) => {
      const ua = a.unitPrice != null ? a.unitPrice : Infinity;
      const ub = b.unitPrice != null ? b.unitPrice : Infinity;
      if (ua !== ub) return ua - ub;
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
  it.offer = {
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
      date: c.date || new Date().toISOString().slice(0, 10),
      url: c.url || '',
      ...(c.online ? { online: true } : {}),
    },
  };
  if (it.enrich) {
    if (hadAutoDe && it.de) it.enrich.autoVals = { ...(it.enrich.autoVals || {}), de: it.de };
    if (keys?.enrich) it.enrich.key = keys.enrich(it.hu, it.de);
  }
  if (keys?.offer) it.offer.key = keys.offer(it);
  return true;
}
