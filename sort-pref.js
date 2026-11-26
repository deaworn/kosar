// Global price/store sort preference (modeled on site/shopping-place.js, Tomi 12225/12236).
// Pure: shared by the phone UI (site/app.js), candidate/brand sorting, and Node tests.

export const SORT_MODES = Object.freeze(['price', 'store']);
export const DEFAULT_SORT_PREF = Object.freeze({ mode: 'price', store: '' });

export const KNOWN_STORES_BY_COUNTRY = Object.freeze({
  hu: Object.freeze(['Tesco', 'SPAR', 'Auchan', 'Lidl', 'Rossmann']),
  de: Object.freeze(['REWE Neunburg', 'Lidl', 'Aldi Süd', 'Rossmann', 'dm']),
  at: Object.freeze(['BIPA']),
});

export function foldStore(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSortPref(value) {
  if (value == null) return { ...DEFAULT_SORT_PREF };
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const mode = SORT_MODES.includes(value.mode) ? value.mode : null;
  if (!mode) return null;
  if (typeof value.store === 'string' && /[\u0000-\u001f]/.test(value.store)) return null;
  const store = typeof value.store === 'string'
    ? value.store.trim().replace(/\s+/g, ' ')
    : '';
  if (store.length > 60) return null;
  return { mode, store };
}

export function storeMatchesPref(storeName, favStore) {
  const a = foldStore(storeName);
  const b = foldStore(favStore);
  if (!a || !b) return false;
  return a === b || a.startsWith(b + ' ') || b.startsWith(a + ' ');
}

export function storesForPreference(country, candidates = []) {
  const seen = new Set();
  const out = [];
  const push = (name) => {
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    const key = foldStore(clean);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };
  for (const name of KNOWN_STORES_BY_COUNTRY[country] || []) push(name);
  for (const c of candidates || []) {
    if (!c || typeof c !== 'object') continue;
    if (Array.isArray(c.stores) && c.stores.length) {
      for (const s of c.stores) push(s?.store);
    }
    push(c.store);
  }
  return out;
}

export function sortPrefLabel(pref) {
  const norm = normalizeSortPref(pref) || DEFAULT_SORT_PREF;
  if (norm.mode === 'store' && norm.store) {
    return 'Bolt szerint · ' + norm.store;
  }
  return 'Ár szerint (legolcsóbb felül)';
}
