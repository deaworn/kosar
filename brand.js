// A brand typed into an item name moves to the brand field (Tomi 11092):
// "Dohány paramount" -> name "Dohány", brand "Paramount".
// Two sources of known brands:
//   1. the built-in list (BRANDS, offline), spelled as written there;
//   2. learned brands: what an item already carries (typed, barcode, photo recognition)
//      and the brand of a verified shop product page (offer.link.brand).
// When unsure, the name is left untouched: a learned brand must look like a brand
// (not a dictionary word, not a store/label word, 3+ letters), and the rest of the
// name must still say what the product is (not only "dual", "classic", "500 g").
// Pure: used by the app, tested in node.
import { BRANDS, DICT } from './dictionary.js';

const fold = (s) => String(s || '').toLowerCase().normalize('NFC').trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reFor = (b) => new RegExp('(^|[\\s,(])' + esc(b) + '(?=$|[\\s,)])', 'i');
const STATIC = BRANDS.map((b) => [b, reFor(b)]);
const STATIC_BY_FOLD = new Map(BRANDS.map((b) => [fold(b), b]));

// words that never count as a learned brand: dictionary products, store names, labels
const DICT_WORDS = new Set(DICT.flatMap(([hu, de]) => [fold(hu), fold(de)]));
const NOT_BRAND = new Set(['bio', 'vegan', 'frisch', 'natur', 'rewe', 'aldi', 'aldi süd', 'aldi nord', 'lidl', 'dm', 'rossmann',
  'edeka', 'penny', 'netto', 'kaufland', 'norma', 'globus', 'marktkauf', 'real', 'metro', 'spar', 'tesco', 'auchan']);
// words that only name a variant: a name left with nothing else is not cut
const VARIANT = new Set(['dual', 'duo', 'classic', 'classico', 'original', 'light', 'zero', 'max', 'maxi', 'mini', 'plus', 'extra',
  'forte', 'sensitive', 'ultra', 'pro', 'gold', 'active', 'fresh', 'new', 'neu', 'junior', 'kids', 'xl', 'xxl', 'bio', 'premium', 'nr', 'no']);
const UNIT = '(g|kg|ml|cl|l|db|st|stk|stück|x)';
const SIZE = new RegExp('^(\\d+([.,]\\d+)?' + UNIT + '?|' + UNIT + ')$', 'i');

// "elmex" / "LANDBECK" -> "Elmex" / "Landbeck"; a mixed-case spelling ("Golden Toast", "M&M's") is kept
function pretty(b) {
  const s = String(b || '').trim().replace(/\s+/g, ' ');
  const known = STATIC_BY_FOLD.get(fold(s));
  if (known) return known;
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase());
}

// A learned brand string -> its display spelling, or '' when it does not look like a brand.
export function learnable(b) {
  const s = String(b || '').trim().replace(/\s+/g, ' ');
  const f = fold(s);
  if (f.replace(/[^\p{L}]/gu, '').length < 3 || /\d/.test(f) || s.split(' ').length > 3) return '';
  if (DICT_WORDS.has(f) || NOT_BRAND.has(f) || VARIANT.has(f)) return '';
  return pretty(s);
}

// Learned brands from the items (and the history): their brand field and the verified shop brand.
export function learnBrands(lists) {
  const out = new Map();
  for (const list of lists) for (const it of Object.values(list || {})) {
    for (const b of [it?.brand, it?.offer?.link?.brand]) {
      const p = learnable(b);
      if (p && !STATIC_BY_FOLD.has(fold(p)) && !out.has(fold(p))) out.set(fold(p), p);
    }
  }
  return [...out.values()];
}

// the rest of a name still names the product: some word that is not only a variant or a size
const saysWhat = (rest) => rest.split(/[\s,()-]+/).filter(Boolean).some((w) => !VARIANT.has(fold(w)) && !SIZE.test(w));

// "Haribo tejes gumimaci" -> { brand: 'Haribo', rest: 'tejes gumimaci', sure: true }; null if no known brand.
// The longest matching brand wins. A name that is only the brand ("Nutella"), or would keep
// only a variant ("Gaviscon dual"), keeps its name: rest is the whole text and sure is false.
export function splitBrand(text, learned = []) {
  const t = String(text || '').trim();
  if (!t) return null;
  const cands = STATIC.concat(learned.map((b) => [b, reFor(b)])).sort((a, b) => b[0].length - a[0].length);
  for (const [b, re] of cands) {
    const m = t.match(re);
    if (!m) continue;
    const rest = (t.slice(0, m.index) + m[1] + t.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,-]+|[\s,-]+$/g, '');
    const sure = !!rest && saysWhat(rest);
    return { brand: b, rest: sure ? rest : t, sure };
  }
  return null;
}

// Moves a known brand out of r.hu / r.de into r.brand (mutates and returns r). With a brand
// already set, only that same brand is taken out of the names (and spelled the known way);
// a different brand in the name is left alone.
export function applyBrand(r, learned = []) {
  for (const f of ['hu', 'de']) {
    const s = splitBrand(r[f], learned);
    if (!s) continue;
    if (!r.brand) r.brand = s.brand;
    if (fold(s.brand) !== fold(r.brand)) continue;
    r.brand = s.brand;
    r[f] = s.rest;
  }
  return r;
}

// applyBrand on a stored item, keeping its bookkeeping in step: the verified offer and the
// automatic names belong to the same product, only relabelled, so they are not asked again
// and keep their labels ("auto", "✓ bolti név"). keys: { offer(it), enrich(hu, de) }.
// Returns true when the item changed.
export function moveBrand(it, learned, keys) {
  const before = { hu: it.hu || '', de: it.de || '', brand: it.brand || '' };
  const oKey = keys.offer(it), eKey = keys.enrich(it.hu, it.de);
  applyBrand(it, learned);
  if ((it.hu || '') === before.hu && (it.de || '') === before.de && (it.brand || '') === before.brand) return false;
  if (it.offer && it.offer.key === oKey) it.offer.key = keys.offer(it);
  const e = it.enrich;
  if (e?.autoVals) for (const f of ['hu', 'de']) if (before[f] && e.autoVals[f] === before[f] && it[f] !== before[f]) e.autoVals[f] = it[f];
  if (e && e.key === eKey) e.key = keys.enrich(it.hu, it.de);
  return true;
}
