// Open Food Facts product metadata, separate from verified shop offers.
const fold = (value) => String(value ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function indexHuCatalog(catalog) {
  if (catalog?.country !== 'HU' || !Array.isArray(catalog.products)) return [];
  return catalog.products.flatMap((row) => {
    if (!Array.isArray(row) || row.length !== 4 || !row.every((value) => typeof value === 'string')) return [];
    const [gtin, name, brand, quantity] = row;
    if (!/^\d{14}$/.test(gtin) || !name.trim()) return [];
    return [{ gtin, name, brand, quantity, normalizedName: fold(name), tokens: fold([name, brand, quantity].join(' ')).split(' ') }];
  });
}

export function searchHuCatalog(index, query, country) {
  if (country !== 'hu') return [];
  const raw = String(query ?? '').trim();
  const normalized = fold(raw);
  if (normalized.length < 3) return [];
  const words = normalized.split(' ');
  const barcode = /^\d{8,14}$/.test(raw) ? raw.padStart(14, '0') : '';
  const matches = [];
  for (const row of index) {
    const rank = barcode ? (row.gtin === barcode ? 0 : -1)
      : row.normalizedName === normalized ? 0
        : row.normalizedName.startsWith(normalized) ? 1
          : words.every((word) => row.tokens.some((token) => token.startsWith(word))) ? 2 : -1;
    if (rank >= 0) matches.push({ row, rank });
  }
  return matches.sort((a, b) => a.rank - b.rank || a.row.name.length - b.row.name.length)
    .slice(0, 6).map(({ row: { gtin, name, brand, quantity } }) => ({ gtin, name, brand, quantity }));
}
