// Merges a fresh /offer answer into the item's stored offer. A picture the item
// already had is never lost on a re-check: a later answer without a picture (shop
// page down, cache reset, a search that found nothing) keeps the earlier one, as
// long as the item itself did not change (same key). The old picture is only put
// next to the SAME product page; a different page without a picture does not
// replace the earlier page that had one (a picture must belong to its link).
export function mergeOffer(prev, key, r, now = Date.now()) {
  const next = { key, at: now, checked: r.checked, link: r.link || null, price: r.price || null };
  const old = prev && prev.key === key && prev.link?.image ? prev.link : null;
  if (old && !next.link?.image) next.link = next.link && next.link.url === old.url ? { ...next.link, image: old.image } : { ...old };
  return next;
}
