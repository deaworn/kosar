// Pull-down refresh (Tomi 11102): the items still missing something are sent to the
// machine again, and the phone says what it is doing and what came of it.
// Missing: German name (not for a brand-named product), picture, price (an own price counts). The brand is not
// counted: many products have none (produce); it comes with the verified shop page.
// Not touched: checked-off items, complete items, items still being recognised, and
// items refreshed less than COOLDOWN ago (no spinning on the same miss).
// Pure: used by the app, tested in node.
export const COOLDOWN = 5 * 60e3;

import { chosenVariant } from './variants.js';

const label = (it) => it.hu || it.de || 'fotós tétel';

// A product named by its brand ("Gaviscon dual") is called the same in a German shop: no
// German name is missing (measured round 10: otherwise it stays "missing" after every pull).
const brandNamed = (it) => !!it.brand && String(it.hu || '').toLowerCase().includes(String(it.brand).toLowerCase());

// it, hasPic(it) -> ['német név', 'kép', 'ár'] (what is still missing)
export function missingParts(it, hasPic) {
  const out = [];
  if (!it.de && !brandNamed(it)) out.push('német név');
  const candPic = Array.isArray(it.offer?.candidates) && it.offer.candidates.some((c) => c?.image);
  const candPrice = Array.isArray(it.offer?.candidates) && it.offer.candidates.some((c) => c?.price > 0);
  if (!hasPic(it) && !candPic) out.push('kép');
  if (!(it.offer?.price || it.myPrice || chosenVariant(it) || candPrice)) out.push('ár'); // a chosen pack size or candidate list is a price
  return out;
}

// -> { todo: [{ id, name, parts }], waiting: [{ id, name }] }; waiting = refreshed within COOLDOWN
export function selectMissing(items, hasPic, now = Date.now()) {
  const todo = [], waiting = [];
  for (const it of Object.values(items)) {
    if (it.done || !(it.hu || it.de) || /pending/.test(it.recog || '')) continue;
    const parts = missingParts(it, hasPic);
    if (!parts.length) continue;
    if (now - (it.refreshAt || 0) < COOLDOWN) { waiting.push({ id: it.id, name: label(it) }); continue; }
    todo.push({ id: it.id, name: label(it), parts });
  }
  return { todo, waiting };
}

// What a refresh run brought: per item, the parts found since and the parts still missing.
// run.todo: the selection at the start. -> { found: [{ name, parts }], left: [{ name, parts }] }
export function summarize(run, items, hasPic) {
  const found = [], left = [];
  for (const t of run.todo) {
    const it = items[t.id];
    if (!it) continue; // deleted meanwhile
    const now = missingParts(it, hasPic);
    const got = t.parts.filter((p) => !now.includes(p));
    if (got.length) found.push({ name: label(it), parts: got });
    if (now.length) left.push({ name: label(it), parts: now });
  }
  return { found, left };
}

// "Megvan: Gaviscon dual (ár). Hiányos maradt: Soft cake (ár)."
export function summaryText({ found, left }) {
  const list = (xs) => xs.map((x) => x.name + ' (' + x.parts.join(', ') + ')').join('; ');
  const a = found.length ? 'Megvan: ' + list(found) + '.' : 'Új adat most nem jött.';
  const b = left.length ? ' Hiányos maradt: ' + list(left) + '.' : ' Minden tétel rendben.';
  return a + b;
}
