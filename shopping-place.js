export const COUNTRIES = Object.freeze({
  de: { label: 'Németország', currency: 'EUR' },
  at: { label: 'Ausztria', currency: 'EUR' },
  hu: { label: 'Magyarország', currency: 'HUF' },
});
export const DEFAULT_PLACE = Object.freeze({ country: 'de', place: 'Neunburg vorm Wald', radius: 0 });
export const RADII = [0, 5, 10, 25];

function foldPlace(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizePlace(value) {
  if (value == null) return { ...DEFAULT_PLACE };
  if (typeof value !== 'object' || !Object.hasOwn(COUNTRIES, value.country) || !RADII.includes(value.radius)) return null;
  const place = typeof value.place === 'string' ? value.place.trim().replace(/\s+/g, ' ') : '';
  if (!place || place.length > 100 || /[\u0000-\u001f]/.test(place)) return null;
  return { country: value.country, place, radius: value.radius };
}

export function isNeunburg(location) {
  return location.country === 'de' && ['92431', 'neunburg vorm wald', '92431 neunburg vorm wald'].includes(foldPlace(location.place));
}

export function placeKey(location) {
  const name = isNeunburg(location) ? '92431' : foldPlace(location.place);
  return JSON.stringify([location.country, name, location.radius]);
}

const legacyPlace = placeKey(DEFAULT_PLACE);
const regionalFields = ['offer', 'offerAsked', 'offerForce', 'myPrice', 'variantPick'];

export function useItemPlace(item, location) {
  const nextKey = placeKey(location);
  const oldKey = item.offerPlace || legacyPlace;
  if (oldKey === nextKey) return;
  const saved = item.offersByPlace ||= {};
  const previous = {};
  for (const field of regionalFields) {
    if (Object.hasOwn(item, field)) previous[field] = item[field];
    delete item[field];
    if (Object.hasOwn(saved[nextKey] || {}, field)) item[field] = saved[nextKey][field];
  }
  if (Object.keys(previous).length) saved[oldKey] = previous;
  delete saved[nextKey];
  item.offerPlace = nextKey;
}
