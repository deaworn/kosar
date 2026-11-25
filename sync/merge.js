// Pure deterministic merge logic for shared shopping lists.
// Uses per-item Last-Writer-Wins (LWW) ordered by (updatedAt, updatedBy)
// and tombstones for deletes so offline edits on two phones always converge.

const VALID_GROUPS = new Set(['kell', 'havan', 'otthon']);

function clampCount(val) {
  const n = Math.trunc(Number(val));
  if (!Number.isFinite(n)) return 1;
  return Math.min(99, Math.max(1, n));
}

function cleanStr(val, maxLen) {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

/**
 * Compares two LWW version stamps `(timeA, byA)` and `(timeB, byB)`.
 * Returns > 0 if A is newer, < 0 if B is newer, 0 if identical.
 * @param {number} timeA
 * @param {string} byA
 * @param {number} timeB
 * @param {string} byB
 * @returns {number}
 */
export function compareVersion(timeA, byA, timeB, byB) {
  const tA = Number.isFinite(Number(timeA)) ? Number(timeA) : 0;
  const tB = Number.isFinite(Number(timeB)) ? Number(timeB) : 0;
  if (tA !== tB) return tA - tB;
  const sA = String(byA || '');
  const sB = String(byB || '');
  if (sA === sB) return 0;
  return sA > sB ? 1 : -1;
}

/**
 * Normalizes an item into the canonical sync shape.
 * @param {any} raw
 * @param {{ updatedAt?: number, updatedBy?: string }} [fallback]
 * @returns {import('./provider.js').SharedItem | null}
 */
export function normalizeSharedItem(raw, fallback = {}) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id.trim()) {
    return null;
  }
  const updatedAt = Number.isFinite(Number(raw.updatedAt))
    ? Number(raw.updatedAt)
    : (Number.isFinite(Number(fallback.updatedAt)) ? Number(fallback.updatedAt) : 0);
  const updatedBy = cleanStr(raw.updatedBy, 64) || cleanStr(fallback.updatedBy, 64);

  return {
    id: raw.id.trim().slice(0, 64),
    hu: cleanStr(raw.hu, 120),
    de: cleanStr(raw.de, 120),
    qty: cleanStr(raw.qty, 40),
    brand: cleanStr(raw.brand, 60),
    type: cleanStr(raw.type, 80),
    group: VALID_GROUPS.has(raw.group) ? raw.group : 'kell',
    count: clampCount(raw.count),
    done: Boolean(raw.done),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
    updatedAt,
    updatedBy,
  };
}

/**
 * Normalizes a tombstone record.
 * @param {any} raw
 * @returns {import('./provider.js').Tombstone | null}
 */
export function normalizeTombstone(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const deletedAt = Number(raw.deletedAt);
  if (!Number.isFinite(deletedAt) || deletedAt < 0) return null;
  return {
    deletedAt,
    deletedBy: cleanStr(raw.deletedBy, 64),
  };
}

/**
 * Picks the winning item between two versions of the same item.
 * @param {any} localItem
 * @param {any} remoteItem
 * @returns {import('./provider.js').SharedItem | null}
 */
export function mergeItem(localItem, remoteItem) {
  const a = normalizeSharedItem(localItem);
  const b = normalizeSharedItem(remoteItem);
  if (!a) return b;
  if (!b) return a;
  return compareVersion(b.updatedAt, b.updatedBy, a.updatedAt, a.updatedBy) > 0 ? b : a;
}

/**
 * Picks the winning tombstone between two tombstones for the same item.
 * @param {any} localTomb
 * @param {any} remoteTomb
 * @returns {import('./provider.js').Tombstone | null}
 */
export function mergeTombstone(localTomb, remoteTomb) {
  const a = normalizeTombstone(localTomb);
  const b = normalizeTombstone(remoteTomb);
  if (!a) return b;
  if (!b) return a;
  return compareVersion(b.deletedAt, b.deletedBy, a.deletedAt, a.deletedBy) > 0 ? b : a;
}

/**
 * Deterministically merges local and remote shared list states (items + tombstones).
 * A tombstone wins over an item with an older (or equal) version; a newer item
 * (e.g., restored or re-added later) wins over an older tombstone.
 *
 * @param {{ items?: Record<string, any>, tombstones?: Record<string, any> }} localState
 * @param {{ items?: Record<string, any>, tombstones?: Record<string, any> }} remoteState
 * @returns {{ items: Record<string, import('./provider.js').SharedItem>, tombstones: Record<string, import('./provider.js').Tombstone> }}
 */
export function mergeSharedState(localState = {}, remoteState = {}) {
  const localItems = localState.items || {};
  const remoteItems = remoteState.items || {};
  const localTombs = localState.tombstones || {};
  const remoteTombs = remoteState.tombstones || {};

  const allIds = new Set([
    ...Object.keys(localItems),
    ...Object.keys(remoteItems),
    ...Object.keys(localTombs),
    ...Object.keys(remoteTombs),
  ]);

  /** @type {Record<string, import('./provider.js').SharedItem>} */
  const items = {};
  /** @type {Record<string, import('./provider.js').Tombstone>} */
  const tombstones = {};

  for (const id of allIds) {
    const winItem = mergeItem(localItems[id], remoteItems[id]);
    const winTomb = mergeTombstone(localTombs[id], remoteTombs[id]);

    if (winTomb && (!winItem || compareVersion(winTomb.deletedAt, winTomb.deletedBy, winItem.updatedAt, winItem.updatedBy) >= 0)) {
      tombstones[id] = winTomb;
    } else if (winItem) {
      items[id] = winItem;
    }
  }

  return { items, tombstones };
}
