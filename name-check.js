// An automatically filled German name (dictionary "auto" or machine "tipp?") is checked against
// the name of the verified shop product (Tomi 10990/10993): every word of the German name must
// appear in the shop's product name (a compound may be split there: "Spülmaschinen-Tabs").
// Pure: used by the list row and the editor, tested in node.
const fold = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, ' ').trim();
// shop page titles carry shop boilerplate: "... bei REWE online bestellen", "... | dm.de"
export const shopName = (s) => String(s || '').replace(/\s+(bei rewe online bestellen|online kaufen|dauerhaft günstig online kaufen|günstig bei aldi[^|]*|jetzt bei lidl[^|]*)\b.*$/i, '').replace(/\s+[-–]\s+(shop apotheke|docmorris|aldi süd|lidl|rossmann|dm|rewe)\b.*$/i, '').replace(/\s*\|.*$/, '').trim();

export function nameCheck(de, offer) {
  const want = fold(de).split(' ').filter((w) => w.length >= 3);
  const name = shopName(offer?.link?.name);
  if (!want.length || !name || !offer?.link?.url) return { state: 'unchecked' };
  const shop = fold(name), joined = shop.replace(/ /g, '');
  const hit = (w) => shop.includes(w) || joined.includes(w) || (w.length > 4 && joined.includes(w.replace(/(en|n|e|s)$/, '')));
  return { state: want.every(hit) ? 'ok' : 'differs', store: offer.link.store || '', name };
}
