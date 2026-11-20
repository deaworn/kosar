// Merges a fresh /offer answer into the item's stored offer. A picture the item
// already had is never lost on a re-check: a later answer without a picture (shop
// page down, cache reset, a search that found nothing) keeps the earlier one, as
// long as the item itself did not change (same key). The old picture is only put
// next to the SAME product page; a different page without a picture does not
// replace the earlier page that had one (a picture must belong to its link).
export function mergeOffer(prev, key, r, now = Date.now()) {
  const picked = !!(r.picked || (prev && prev.key === key && prev.picked));
  const next = { key, at: now, checked: r.checked, link: r.link || null, price: r.price || null, alt: r.alt || null, pharmacy: r.pharmacy || null, variants: Array.isArray(r.variants) ? r.variants.slice(0, 12) : null, candidates: Array.isArray(r.candidates) && r.candidates.length ? r.candidates.slice(0, 8) : null, ...(picked ? { picked: true } : {}), notSold: Array.isArray(r.notSold) ? r.notSold.slice(0, 3) : [] };
  const old = prev && prev.key === key && prev.link?.image ? prev.link : null;
  if (old && !next.link?.image) next.link = next.link && next.link.url === old.url ? { ...next.link, image: old.image } : { ...old };
  return next;
}
