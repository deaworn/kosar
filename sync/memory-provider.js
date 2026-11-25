// In-memory fake SyncProvider for tests and local demos.
// Multiple provider instances sharing the same store behave like separate phones.

import { generateShareId, isValidShareId } from './provider.js';
import { mergeSharedState, normalizeSharedItem, normalizeTombstone } from './merge.js';
import { normalizeListPlace } from '../lists.js';

function clone(val) {
  return JSON.parse(JSON.stringify(val));
}

/**
 * Creates a shared in-memory backend store.
 */
export function createMemoryStore() {
  return {
    lists: new Map(), // shareId -> { meta, items, tombstones, listeners: Set<fn> }
  };
}

/**
 * Creates a SyncProvider backed by an in-memory store.
 * @param {ReturnType<typeof createMemoryStore>} [store]
 * @returns {import('./provider.js').SyncProvider}
 */
export function createMemoryProvider(store = createMemoryStore()) {
  const activeListeners = new Map(); // shareId -> Set<() => void>
  let connected = false;

  function emit(shareId) {
    const entry = store.lists.get(shareId);
    if (!entry) return;
    const snapshot = {
      meta: clone(entry.meta),
      items: clone(entry.items),
      tombstones: clone(entry.tombstones),
    };
    for (const cb of [...entry.listeners]) {
      cb(clone(snapshot));
    }
  }

  return {
    async connect() {
      connected = true;
    },

    async createSharedList(listMeta, initialItems = []) {
      if (!connected) connected = true;
      const shareId = generateShareId();
      const now = Date.now();
      const meta = {
        name: String(listMeta?.name || 'Bevásárlás').trim().slice(0, 80) || 'Bevásárlás',
        repeat: ['none', 'daily', 'weekly'].includes(listMeta?.repeat) ? listMeta.repeat : 'none',
        weekday: Number.isInteger(listMeta?.weekday) ? listMeta.weekday : 1,
        createdAt: Number(listMeta?.createdAt) || now,
        updatedAt: Number(listMeta?.updatedAt) || now,
      };
      if (typeof listMeta?.color === 'string' && listMeta.color.trim()) {
        meta.color = listMeta.color.trim().slice(0, 20);
      }
      const place = normalizeListPlace(listMeta?.place);
      if (place) {
        meta.place = place;
      }
      const items = {};
      for (const raw of initialItems) {
        const norm = normalizeSharedItem(raw, { updatedAt: now });
        if (norm) items[norm.id] = norm;
      }
      store.lists.set(shareId, {
        meta,
        items,
        tombstones: {},
        listeners: new Set(),
      });
      return { shareId };
    },

    async joinSharedList(shareId) {
      if (!isValidShareId(shareId)) {
        throw new Error('Érvénytelen közös lista azonosító.');
      }
      const entry = store.lists.get(shareId);
      if (!entry) {
        throw new Error('A közös lista nem található.');
      }
      return {
        meta: clone(entry.meta),
        items: clone(entry.items),
        tombstones: clone(entry.tombstones),
      };
    },

    subscribe(shareId, onChange) {
      if (!isValidShareId(shareId)) {
        throw new Error('Érvénytelen közös lista azonosító.');
      }
      const entry = store.lists.get(shareId);
      if (!entry) {
        throw new Error('A közös lista nem található.');
      }
      entry.listeners.add(onChange);
      if (!activeListeners.has(shareId)) activeListeners.set(shareId, new Set());
      const unsub = () => {
        entry.listeners.delete(onChange);
        activeListeners.get(shareId)?.delete(unsub);
      };
      activeListeners.get(shareId).add(unsub);
      return unsub;
    },

    async pushChanges(shareId, changes = {}) {
      const entry = store.lists.get(shareId);
      if (!entry) {
        throw new Error('A közös lista nem található.');
      }
      if (changes.meta && typeof changes.meta === 'object') {
        if (typeof changes.meta.name === 'string' && changes.meta.name.trim()) {
          entry.meta.name = changes.meta.name.trim().slice(0, 80);
        }
        if (['none', 'daily', 'weekly'].includes(changes.meta.repeat)) {
          entry.meta.repeat = changes.meta.repeat;
        }
        if (Number.isInteger(changes.meta.weekday)) {
          entry.meta.weekday = changes.meta.weekday;
        }
        if (typeof changes.meta.color === 'string') {
          entry.meta.color = changes.meta.color.trim().slice(0, 20);
        }
        if ('place' in changes.meta) {
          const place = normalizeListPlace(changes.meta.place);
          if (place) entry.meta.place = place;
          else delete entry.meta.place;
        }
        entry.meta.updatedAt = Number(changes.meta.updatedAt) || Date.now();
      }

      const incomingItems = {};
      for (const raw of changes.upserts || []) {
        const norm = normalizeSharedItem(raw);
        if (norm) incomingItems[norm.id] = norm;
      }
      const incomingTombs = {};
      for (const raw of changes.deletes || []) {
        if (!raw || typeof raw.id !== 'string') continue;
        const tomb = normalizeTombstone(raw);
        if (tomb) incomingTombs[raw.id] = tomb;
      }

      const merged = mergeSharedState(
        { items: entry.items, tombstones: entry.tombstones },
        { items: incomingItems, tombstones: incomingTombs },
      );
      entry.items = merged.items;
      entry.tombstones = merged.tombstones;
      emit(shareId);
    },

    async leave(shareId) {
      const unsubs = activeListeners.get(shareId);
      if (unsubs) {
        for (const unsub of [...unsubs]) unsub();
        activeListeners.delete(shareId);
      }
    },
  };
}
