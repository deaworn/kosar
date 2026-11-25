// Pure logic for multiple shopping lists, daily/weekly repeat resets,
// migration from the single-list schema, and #list= share link encoding/decoding.

export const DEFAULT_LIST_ID = 'default';
export const DEFAULT_LIST_NAME = 'Bevásárlás';

export const MAX_LIST_NAME_LEN = 80;
export const MAX_SHARE_HASH_LEN = 32768;
export const MAX_SHARE_JSON_LEN = 49152;
export const MAX_SHARE_ITEMS = 300;
export const MIN_ITEM_COUNT = 1;
export const MAX_ITEM_COUNT = 99;

const VALID_REPEATS = new Set(['none', 'daily', 'weekly']);
const VALID_GROUPS = new Set(['kell', 'havan', 'otthon']);

/**
 * Normalizes an item quantity multiplier to an integer in 1..99 (default 1).
 */
export function normalizeCount(val) {
  const n = Math.trunc(Number(val));
  if (!Number.isFinite(n)) return MIN_ITEM_COUNT;
  return Math.min(MAX_ITEM_COUNT, Math.max(MIN_ITEM_COUNT, n));
}

/**
 * Computes the estimated total price for a list of items.
 * Counts only unticked items (`!it.done`); if all items are ticked,
 * returns the full list total with `allDone: true`.
 */
export function listEstimate(listItems, priceOf) {
  if (!Array.isArray(listItems) || !listItems.length || typeof priceOf !== 'function') {
    return { total: 0, pricedCount: 0, missingCount: 0, allDone: false };
  }
  const unticked = listItems.filter((it) => it && !it.done);
  const allDone = unticked.length === 0;
  const target = allDone ? listItems : unticked;

  let total = 0;
  let pricedCount = 0;
  let missingCount = 0;
  for (const it of target) {
    if (!it || typeof it !== 'object') continue;
    const rawPrice = priceOf(it);
    const price = rawPrice == null ? NaN : Number(rawPrice);
    if (Number.isFinite(price) && price > 0) {
      total += price * normalizeCount(it.count);
      pricedCount++;
    } else {
      missingCount++;
    }
  }
  return {
    total: Math.round(total * 100) / 100,
    pricedCount,
    missingCount,
    allDone,
  };
}

/**
 * Returns local midnight timestamp (ms) for the given timestamp.
 */
export function localDayStart(ts = Date.now()) {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Normalizes a list object, filling defaults for missing or invalid fields.
 */
export function normalizeList(raw, fallbackId = DEFAULT_LIST_ID) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const id = typeof src.id === 'string' && src.id.trim() ? src.id.trim().slice(0, 64) : fallbackId;
  const name = typeof src.name === 'string' && src.name.trim()
    ? src.name.trim().slice(0, MAX_LIST_NAME_LEN)
    : DEFAULT_LIST_NAME;
  const repeat = VALID_REPEATS.has(src.repeat) ? src.repeat : 'none';
  const wd = Number(src.weekday);
  const weekday = Number.isInteger(wd) && wd >= 0 && wd <= 6 ? wd : 1;
  const lastReset = Number.isFinite(Number(src.lastReset)) && Number(src.lastReset) > 0
    ? Number(src.lastReset)
    : 0;
  return {
    id,
    name,
    collapsed: Boolean(src.collapsed),
    repeat,
    weekday,
    lastReset,
  };
}

/**
 * Creates a default list object.
 */
export function createDefaultList() {
  return normalizeList({ id: DEFAULT_LIST_ID, name: DEFAULT_LIST_NAME }, DEFAULT_LIST_ID);
}

/**
 * Migrates legacy single-list items into a default "Kosár" list without losing data.
 * Also ensures every item has a valid `list` field pointing to an existing list.
 */
export function migrateToLists(existingLists, items) {
  const lists = Array.isArray(existingLists) && existingLists.length
    ? existingLists.map((l, i) => normalizeList(l, i === 0 ? DEFAULT_LIST_ID : `list-${i}`))
    : [createDefaultList()];

  const validIds = new Set(lists.map((l) => l.id));
  const fallbackId = lists[0].id;

  if (items && typeof items === 'object') {
    for (const it of Object.values(items)) {
      if (!it || typeof it !== 'object') continue;
      if (!it.list || !validIds.has(it.list)) {
        it.list = fallbackId;
      }
    }
  }
  return lists;
}

/**
 * Checks whether a repeating list should reset its items' `done` state at `now`.
 * - 'daily': resets on any new local calendar day after `lastReset`.
 * - 'weekly': resets when the chosen `weekday` (0=Sun..6=Sat) has been reached
 *   on a local calendar day after `lastReset`.
 */
export function shouldResetList(list, now = Date.now()) {
  if (!list || !VALID_REPEATS.has(list.repeat) || list.repeat === 'none') return false;
  const nowDay = localDayStart(now);
  const lastDay = list.lastReset ? localDayStart(list.lastReset) : 0;
  if (lastDay >= nowDay) return false;

  if (list.repeat === 'daily') return true;

  // Weekly reset: check if target weekday occurred in (lastDay, nowDay].
  const targetWeekday = Number.isInteger(list.weekday) && list.weekday >= 0 && list.weekday <= 6
    ? list.weekday
    : 1;
  if (new Date(now).getDay() === targetWeekday) return true;
  if (!lastDay) return false;

  // If more than 6 days have passed since lastDay, every weekday has occurred.
  const d = new Date(lastDay);
  for (let i = 0; i < 7; i++) {
    d.setDate(d.getDate() + 1);
    const t = d.getTime();
    if (t > nowDay) break;
    if (d.getDay() === targetWeekday) return true;
  }
  return false;
}

/**
 * Applies daily/weekly resets across all lists, setting `done = false` on items
 * belonging to lists that are due for reset and updating `list.lastReset`.
 */
export function applyListResets(lists, items, now = Date.now()) {
  if (!Array.isArray(lists) || !items || typeof items !== 'object') {
    return { changed: false, resetListIds: [] };
  }
  let changed = false;
  const resetListIds = [];
  const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;

  for (const list of lists) {
    if (!shouldResetList(list, now)) continue;
    list.lastReset = now;
    changed = true;
    resetListIds.push(list.id);
    for (const it of Object.values(items)) {
      if (!it || typeof it !== 'object') continue;
      if ((it.list || fallbackId) === list.id && it.done) {
        it.done = false;
      }
    }
  }
  return { changed, resetListIds };
}

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(token) {
  const pad = (4 - (token.length % 4)) % 4;
  const b64 = token.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Encodes a list (name + items: hu, de, qty, brand, group; no photos) into a
 * `#list=<base64url>` hash string (or full URL if `baseUrl` is provided).
 */
export function encodeShareList(list, listItems = [], baseUrl = '') {
  const name = String(list?.name || DEFAULT_LIST_NAME).trim().slice(0, MAX_LIST_NAME_LEN) || DEFAULT_LIST_NAME;
  const compactItems = [];
  for (const raw of listItems) {
    if (!raw || typeof raw !== 'object') continue;
    const hu = typeof raw.hu === 'string' ? raw.hu.trim().slice(0, 120) : '';
    const de = typeof raw.de === 'string' ? raw.de.trim().slice(0, 120) : '';
    if (!hu && !de) continue;
    const entry = {};
    if (hu) entry.hu = hu;
    if (de) entry.de = de;
    const qty = typeof raw.qty === 'string' ? raw.qty.trim().slice(0, 40) : '';
    if (qty) entry.qty = qty;
    const brand = typeof raw.brand === 'string' ? raw.brand.trim().slice(0, 60) : '';
    if (brand) entry.brand = brand;
    const group = VALID_GROUPS.has(raw.group) ? raw.group : 'kell';
    if (group !== 'kell') entry.group = group;
    const count = normalizeCount(raw.count);
    if (count > MIN_ITEM_COUNT) entry.count = count;
    compactItems.push(entry);
    if (compactItems.length >= MAX_SHARE_ITEMS) break;
  }
  const payload = { v: 1, name, items: compactItems };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const hash = '#list=' + toBase64Url(bytes);
  if (!baseUrl) return hash;
  return String(baseUrl).split('#')[0] + hash;
}

/**
 * Extracts, validates, and size-limits an incoming `#list=<base64url>` share payload.
 * Returns `{ name, items }` or `null` if malformed, oversized, or invalid.
 */
export function decodeShareList(rawInput) {
  if (typeof rawInput !== 'string') return null;
  const s = rawInput.trim();
  if (!s) return null;

  const hashIdx = s.indexOf('#');
  const frag = hashIdx >= 0 ? s.slice(hashIdx + 1) : s;
  const match = frag.match(/^list=([A-Za-z0-9_-]+)$/);
  if (!match) return null;

  const token = match[1];
  if (token.length < 4 || token.length > MAX_SHARE_HASH_LEN) return null;

  let jsonStr;
  try {
    const bytes = fromBase64Url(token);
    if (bytes.length > MAX_SHARE_JSON_LEN) return null;
    jsonStr = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }

  let data;
  try {
    data = JSON.parse(jsonStr);
  } catch {
    return null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (typeof data.name !== 'string') return null;
  const name = data.name.trim().slice(0, MAX_LIST_NAME_LEN);
  if (!name) return null;
  if (!Array.isArray(data.items) || data.items.length > MAX_SHARE_ITEMS) return null;

  const items = [];
  for (const raw of data.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const hu = typeof raw.hu === 'string' ? raw.hu.trim().slice(0, 120) : '';
    const de = typeof raw.de === 'string' ? raw.de.trim().slice(0, 120) : '';
    if (!hu && !de) return null;
    const qty = typeof raw.qty === 'string' ? raw.qty.trim().slice(0, 40) : '';
    const brand = typeof raw.brand === 'string' ? raw.brand.trim().slice(0, 60) : '';
    const group = VALID_GROUPS.has(raw.group) ? raw.group : 'kell';
    let count = MIN_ITEM_COUNT;
    if (raw.count !== undefined) {
      if (typeof raw.count !== 'number' || !Number.isInteger(raw.count) || raw.count < MIN_ITEM_COUNT || raw.count > MAX_ITEM_COUNT) {
        return null;
      }
      count = raw.count;
    }
    items.push({ hu, de, qty, brand, group, count });
  }

  return { name, items };
}
