// Pure helpers for the Brand -> Type bottom sheet chooser.
// Works with the Hungarian Open Food Facts catalog (HU) and existing
// item candidates/variants (DE/AT), with no network or DOM dependencies.

export const foldHu = (value) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Per-word exclusion list (folded tokens) to filter obvious non-matches
// when matching a generic Hungarian item name against catalog product names.
export const WORD_EXCLUSIONS = {
  tej: [
    'izu', 'izesitett',
    'csoki', 'csokolade', 'csokolades', 'tejcsokolade',
    'kakao', 'kakaos',
    'kave', 'kaves', 'latte',
    'protein', 'pumpkin', 'narancs',
    'vanilia', 'vanilias',
    'eper', 'epres',
    'banan', 'bananos',
    'karamell', 'karamellas',
    'shake', 'ital',
    'tejfol', 'tejszin', 'tejpor', 'por', 'suritett',
    'gumicukor', 'gumimaci',
    'kokusz', 'szoja', 'zab', 'mandula', 'rizs', 'novenyi',
    'jegkrem', 'puding',
  ],
};

function normalizeNumberAndUnit(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/(\d),\s+(\d)/g, '$1,$2')
    .replace(/(\d+(?:,\d+)?)\s*(?:liter|l)(?![a-zA-Z\p{L}])/giu, '$1 l')
    .replace(/(\d+(?:,\d+)?)\s*(ml|dl|cl|kg|dkg|g)(?![a-zA-Z\p{L}])/giu, (_, n, u) => n + ' ' + u.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalises a type label for display and deduplication:
 * decimal points -> commas, "1, 5" -> "1,5", unit case/spacing ("1L"/"1 liter" -> "1 l"),
 * collapsed whitespace, and capitalised first letter.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeTypeLabel(raw) {
  const s = normalizeNumberAndUnit(raw);
  if (!s) return '';
  return s.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

/**
 * Normalises a quantity string for display and deduplication.
 * @param {string} raw
 * @returns {string}
 */
export function normalizeQuantity(raw) {
  return normalizeNumberAndUnit(raw);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function prettyBrand(raw) {
  const s = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (m, a, c) => a + c.toUpperCase());
}

/**
 * Extracts the primary brand name from a potentially comma-separated brand string.
 * @param {string} rawBrand
 * @returns {string}
 */
export function extractPrimaryBrand(rawBrand) {
  const parts = String(rawBrand ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? prettyBrand(parts[0]) : '';
}

/**
 * Strips a leading brand prefix (and separator punctuation) from a product name
 * to produce a clean type label. Falls back to the original name if nothing remains.
 * @param {string} productName
 * @param {string} brand
 * @returns {string}
 */
export function stripBrandPrefix(productName, brand) {
  const name = String(productName ?? '').trim();
  const b = String(brand ?? '').trim();
  if (!name || !b) return name;

  const foldedName = foldHu(name);
  const foldedBrand = foldHu(b);
  if (!foldedBrand) return name;

  // Try exact case-insensitive prefix first so original accents/punctuation stay intact.
  const exactRe = new RegExp('^' + escapeRegex(b) + '(?:[\\s,:;·–—-]+|$)', 'i');
  const exactMatch = name.match(exactRe);
  if (exactMatch) {
    const rest = name.slice(exactMatch[0].length).replace(/^[\s,:;·–—-]+/, '').trim();
    if (rest) return rest;
  }

  // Fallback: accent-folded prefix match (e.g. "Pilos" vs "PILÓS")
  if (foldedName === foldedBrand) return name;
  if (foldedName.startsWith(foldedBrand + ' ')) {
    const wordsToDrop = foldedBrand.split(' ').length;
    const tokens = name.split(/\s+/);
    const rest = tokens.slice(wordsToDrop).join(' ').replace(/^[\s,:;·–—-]+/, '').trim();
    if (rest) return rest;
  }

  return name;
}

/**
 * Filters catalog rows matching `itemName` as whole words, excluding obvious
 * non-matches defined in `exclusionsMap`.
 * @param {Array<{ gtin: string, name: string, brand: string, quantity: string, normalizedName?: string }>} catalog
 * @param {string} itemName
 * @param {Record<string, string[]>} [exclusionsMap]
 */
export function matchCatalogProducts(catalog, itemName, exclusionsMap = WORD_EXCLUSIONS) {
  if (!Array.isArray(catalog) || !catalog.length) return [];
  const query = foldHu(itemName);
  if (!query) return [];
  const qWords = query.split(' ').filter(Boolean);
  if (!qWords.length) return [];

  const wordRegexes = qWords.map((w) => new RegExp('(?:^| )' + escapeRegex(w) + '(?: |$)'));
  const exclusions = [];
  if (exclusionsMap && typeof exclusionsMap === 'object') {
    for (const [k, list] of Object.entries(exclusionsMap)) {
      if (!Array.isArray(list)) continue;
      if (qWords.includes(foldHu(k))) {
        for (const ex of list) {
          const folded = foldHu(ex);
          if (folded) exclusions.push(folded);
        }
      }
    }
  }

  const out = [];
  for (const row of catalog) {
    if (!row || !row.name) continue;
    const norm = row.normalizedName || foldHu(row.name);
    if (!wordRegexes.every((re) => re.test(norm))) continue;
    if (exclusions.length) {
      const tokens = norm.split(' ');
      const excluded = exclusions.some((ex) =>
        tokens.some((t) => t === ex || (ex.length >= 4 && t.includes(ex))),
      );
      if (excluded) continue;
    }
    out.push(row);
  }
  return out;
}

/**
 * Collects product-like entries from an item's existing candidates/variants (for DE/AT).
 * @param {any} it
 * @param {any[]} [candidates]
 */
export function candidatesToProducts(it, candidates = []) {
  const raw = [];
  for (const c of candidates || []) {
    if (c && c.name) raw.push({ gtin: '', name: c.name, brand: c.brand || '', quantity: c.unit || '', source: c });
  }
  for (const v of it?.offer?.variants || []) {
    if (v && v.name) raw.push({ gtin: '', name: v.name, brand: it.brand || '', quantity: v.unit || '', source: v });
  }
  const seen = new Set();
  const out = [];
  for (const p of raw) {
    const key = [foldHu(p.brand), foldHu(p.name), foldHu(p.quantity)].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

const PLAIN_MILK_TOKENS = new Set(['tej', 'uht', 'esl', 'l', 'liter']);

function typeSortRank(label) {
  const f = foldHu(label);
  if (!f) return 2;
  const tokens = f.split(' ').filter(Boolean);
  const hasMilkOrProcess = tokens.some((t) => t === 'tej' || t === 'uht' || t === 'esl');
  if (hasMilkOrProcess && tokens.every((t) => PLAIN_MILK_TOKENS.has(t) || /^\d+$/.test(t))) {
    return 0;
  }
  if (tokens.some((t) => t.includes('laktozmentes') || t.includes('laktosefrei') || t.includes('lactose'))) {
    return 1;
  }
  return 2;
}

/**
 * Groups matched products by brand, ordered most-frequent first (tie-break: A-Z),
 * with each brand's deduplicated, normalised, and sorted type labels (brand prefix stripped).
 * @param {Array<{ gtin?: string, name: string, brand: string, quantity?: string, source?: any }>} products
 * @returns {Array<{ brand: string, count: number, types: Array<{ label: string, quantity: string, gtin: string, fullName: string, source: any }> }>}
 */
export function groupProductsByBrand(products) {
  if (!Array.isArray(products) || !products.length) return [];
  const groups = new Map();

  for (const p of products) {
    const brand = extractPrimaryBrand(p?.brand);
    if (!brand) continue;
    const key = foldHu(brand);
    if (!key) continue;
    let g = groups.get(key);
    if (!g) {
      g = { brand, count: 0, rawProducts: [], seenTypes: new Map(), types: [] };
      groups.set(key, g);
    }
    g.count++;
    // Prefer mixed-case spelling if we encounter one
    if (p.brand && p.brand !== p.brand.toLowerCase() && p.brand !== p.brand.toUpperCase()) {
      const candidate = extractPrimaryBrand(p.brand);
      if (candidate) g.brand = candidate;
    }
    const label = normalizeTypeLabel(stripBrandPrefix(p.name, g.brand));
    const qty = normalizeQuantity(p.quantity);
    const gtin = String(p.gtin ?? '').trim();
    const typeKey = foldHu(label) + '|' + foldHu(qty);
    const entry = {
      label,
      quantity: qty,
      gtin,
      fullName: p.name,
      source: p.source || null,
    };
    const existing = g.seenTypes.get(typeKey);
    if (!existing) {
      g.seenTypes.set(typeKey, entry);
      g.types.push(entry);
    } else if (!existing.gtin && gtin) {
      Object.assign(existing, entry);
    }
  }

  return [...groups.values()]
    .map(({ brand, count, types }) => ({
      brand,
      count,
      types: types.sort((a, b) =>
        typeSortRank(a.label) - typeSortRank(b.label)
        || a.label.localeCompare(b.label, 'hu')
        || a.quantity.localeCompare(b.quantity, 'hu')
      ),
    }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, 'hu'));
}

/**
 * Searches a product catalog (HU Open Food Facts index or DE/AT candidate products)
 * by accent-insensitive, whole-word/prefix and mid-string matching.
 * Ranking order: exact (0) > prefix (1) > word-prefix (2) > contains (3).
 *
 * @param {Array<{ gtin?: string, name: string, brand?: string, quantity?: string, normalizedName?: string, tokens?: string[], source?: any }>} catalog
 * @param {string} query
 * @param {{ limit?: number }} [options]
 * @returns {Array<{ gtin: string, name: string, brand: string, quantity: string, label: string, source: any }>}
 */
export function searchBrandSheetCatalog(catalog, query, { limit = 30 } = {}) {
  if (!Array.isArray(catalog) || !catalog.length) return [];
  const raw = String(query ?? '').trim();
  const normalized = foldHu(raw);
  if (!normalized) return [];

  const qWords = normalized.split(' ').filter(Boolean);
  if (!qWords.length) return [];

  const cap = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;
  const barcode = /^\d{8,14}$/.test(raw) ? raw.padStart(14, '0') : '';
  const matches = [];

  for (const row of catalog) {
    if (!row || !row.name) continue;
    const gtin = String(row.gtin ?? '').trim();
    const normName = row.normalizedName || foldHu(row.name);
    const normBrand = foldHu(row.brand || '');
    const normQty = foldHu(row.quantity || '');
    const haystack = [normName, normBrand, normQty].filter(Boolean).join(' ');
    const tokens = Array.isArray(row.tokens) && row.tokens.length
      ? row.tokens
      : haystack.split(' ').filter(Boolean);
    const combined = normBrand && !normName.startsWith(normBrand)
      ? normBrand + ' ' + normName
      : normName;

    let rank = -1;
    if (barcode && gtin === barcode) {
      rank = 0;
    } else if (normName === normalized || combined === normalized || normBrand === normalized) {
      rank = 0;
    } else if (normName.startsWith(normalized) || combined.startsWith(normalized) || normBrand.startsWith(normalized)) {
      rank = 1;
    } else if (qWords.every((w) => tokens.some((t) => t.startsWith(w)))) {
      rank = 2;
    } else if (qWords.every((w) => haystack.includes(w))) {
      rank = 3;
    }

    if (rank >= 0) matches.push({ row, rank });
  }

  matches.sort((a, b) =>
    a.rank - b.rank
    || a.row.name.length - b.row.name.length
    || a.row.name.localeCompare(b.row.name, 'hu')
  );

  return matches.slice(0, cap).map(({ row }) => {
    const brand = extractPrimaryBrand(row.brand);
    return {
      gtin: String(row.gtin ?? '').trim(),
      name: row.name,
      brand,
      quantity: normalizeQuantity(row.quantity),
      label: normalizeTypeLabel(stripBrandPrefix(row.name, brand)),
      source: row.source || null,
    };
  });
}
