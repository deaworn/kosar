// Swappable sync provider interface and shared ID helpers.
// Any backend (Firebase Firestore, custom WebSocket/REST server, in-memory fake)
// implements this contract so the UI never depends on a specific vendor.

/**
 * @typedef {Object} SharedListMeta
 * @property {string} name
 * @property {'none'|'daily'|'weekly'} [repeat]
 * @property {number} [weekday]
 * @property {number} [createdAt]
 * @property {number} [updatedAt]
 */

/**
 * @typedef {Object} SharedItem
 * @property {string} id
 * @property {string} [hu]
 * @property {string} [de]
 * @property {string} [qty]
 * @property {string} [brand]
 * @property {string} [type]
 * @property {'kell'|'havan'|'otthon'} [group]
 * @property {number} [count]
 * @property {boolean} [done]
 * @property {number} [order]
 * @property {boolean} [deleted]
 * @property {number} updatedAt
 * @property {string} updatedBy
 */

/**
 * @typedef {Object} Tombstone
 * @property {number} deletedAt
 * @property {string} deletedBy
 */

/**
 * @typedef {Object} SharedListSnapshot
 * @property {SharedListMeta} meta
 * @property {Record<string, SharedItem>} items
 * @property {Record<string, Tombstone>} tombstones
 */

/**
 * @typedef {Object} SyncChanges
 * @property {Partial<SharedListMeta>} [meta]
 * @property {SharedItem[]} [upserts]
 * @property {Array<{ id: string, deletedAt: number, deletedBy: string }>} [deletes]
 */

/**
 * @typedef {Object} SyncProvider
 * @property {(config: unknown) => Promise<void>} connect
 * @property {(listMeta: SharedListMeta, items: SharedItem[]) => Promise<{ shareId: string }>} createSharedList
 * @property {(shareId: string) => Promise<SharedListSnapshot>} joinSharedList
 * @property {(shareId: string, onChange: (snapshot: SharedListSnapshot) => void) => (() => void) | Promise<() => void>} subscribe
 * @property {(shareId: string, changes: SyncChanges) => Promise<void>} pushChanges
 * @property {(shareId: string) => Promise<void>} leave
 */

const SHARE_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
export const MIN_SHARE_ID_LEN = 20;
export const DEFAULT_SHARE_ID_LEN = 24;

/**
 * Generates a cryptographically random capability secret for a shared list.
 * @param {number} [length]
 * @returns {string}
 */
export function generateShareId(length = DEFAULT_SHARE_ID_LEN) {
  const len = Math.max(MIN_SHARE_ID_LEN, Math.trunc(length));
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i++) {
    out += SHARE_ID_ALPHABET[bytes[i] % SHARE_ID_ALPHABET.length];
  }
  return out;
}

/**
 * Validates that a shareId is a safe, high-entropy capability token.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isValidShareId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{20,64}$/.test(id);
}
