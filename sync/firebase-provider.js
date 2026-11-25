// Firebase Firestore implementation of SyncProvider.
// Loads the official Firebase modular JS SDK lazily from gstatic CDN so the
// app stays zero-build and completely offline-capable when sync is not used.

import { generateShareId, isValidShareId } from './provider.js';
import { normalizeSharedItem } from './merge.js';

const FIREBASE_VERSION = '13.2.0';
const CDN_BASE = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;

let sdkPromise = null;

export async function loadFirebaseSdk() {
  if (!sdkPromise) {
    sdkPromise = Promise.all([
      import(`${CDN_BASE}/firebase-app.js`),
      import(`${CDN_BASE}/firebase-auth.js`),
      import(`${CDN_BASE}/firebase-firestore.js`),
    ]).then(([appMod, authMod, fsMod]) => ({ appMod, authMod, fsMod }));
  }
  return sdkPromise;
}

function docToSharedItem(id, data) {
  if (!data || typeof data !== 'object') return null;
  if (data.deleted) {
    return {
      tombstone: {
        deletedAt: Number(data.updatedAt) || 0,
        deletedBy: typeof data.updatedBy === 'string' ? data.updatedBy : '',
      },
    };
  }
  const item = normalizeSharedItem({ ...data, id });
  return item ? { item } : null;
}

function sharedItemToDoc(item) {
  return {
    hu: item.hu || '',
    de: item.de || '',
    qty: item.qty || '',
    brand: item.brand || '',
    group: item.group || 'kell',
    count: item.count || 1,
    done: Boolean(item.done),
    order: Number(item.order) || 0,
    deleted: false,
    updatedAt: Number(item.updatedAt) || Date.now(),
    updatedBy: String(item.updatedBy || ''),
  };
}

/**
 * Creates a Firestore-backed SyncProvider.
 * @returns {import('./provider.js').SyncProvider}
 */
export function createFirebaseProvider() {
  let sdk = null;
  let app = null;
  let auth = null;
  let db = null;
  let authReady = null;
  const activeUnsubs = new Map(); // shareId -> Set<() => void>

  async function ensureReady() {
    if (!db) {
      throw new Error('A Firebase szinkron nincs csatlakoztatva.');
    }
    if (!authReady) {
      authReady = (async () => {
        if (typeof auth.authStateReady === 'function') {
          await auth.authStateReady();
        }
        if (!auth.currentUser) {
          await sdk.authMod.signInAnonymously(auth);
        }
      })().catch((err) => {
        authReady = null;
        throw err;
      });
    }
    await authReady;
  }

  return {
    async connect(config) {
      if (!config || typeof config !== 'object' || !config.projectId || !config.apiKey) {
        throw new Error('A közös lista még nincs beállítva.');
      }
      sdk = await loadFirebaseSdk();
      const existing = sdk.appMod.getApps();
      app = existing.length ? existing[0] : sdk.appMod.initializeApp(config);
      auth = sdk.authMod.getAuth(app);
      db = sdk.fsMod.getFirestore(app);
      await ensureReady();
    },

    async createSharedList(listMeta, initialItems = []) {
      await ensureReady();
      const { doc, writeBatch } = sdk.fsMod;
      const shareId = generateShareId();
      const now = Date.now();
      const meta = {
        name: String(listMeta?.name || 'Bevásárlás').trim().slice(0, 80) || 'Bevásárlás',
        repeat: ['none', 'daily', 'weekly'].includes(listMeta?.repeat) ? listMeta.repeat : 'none',
        weekday: Number.isInteger(listMeta?.weekday) ? listMeta.weekday : 1,
        createdAt: Number(listMeta?.createdAt) || now,
        updatedAt: now,
      };
      if (typeof listMeta?.color === 'string' && listMeta.color.trim()) {
        meta.color = listMeta.color.trim().slice(0, 20);
      }

      const batch = writeBatch(db);
      batch.set(doc(db, 'sharedLists', shareId), meta);
      for (const raw of initialItems) {
        const norm = normalizeSharedItem(raw, { updatedAt: now });
        if (!norm) continue;
        batch.set(doc(db, 'sharedLists', shareId, 'items', norm.id), sharedItemToDoc(norm));
      }
      await batch.commit();
      return { shareId };
    },

    async joinSharedList(shareId) {
      if (!isValidShareId(shareId)) {
        throw new Error('Érvénytelen közös lista azonosító.');
      }
      await ensureReady();
      const { doc, collection, getDoc, getDocs } = sdk.fsMod;
      const listSnap = await getDoc(doc(db, 'sharedLists', shareId));
      if (!listSnap.exists()) {
        throw new Error('A közös lista nem található.');
      }
      const itemsSnap = await getDocs(collection(db, 'sharedLists', shareId, 'items'));
      const items = {};
      const tombstones = {};
      itemsSnap.forEach((d) => {
        const parsed = docToSharedItem(d.id, d.data());
        if (!parsed) return;
        if (parsed.tombstone) tombstones[d.id] = parsed.tombstone;
        else if (parsed.item) items[d.id] = parsed.item;
      });
      return {
        meta: listSnap.data(),
        items,
        tombstones,
      };
    },

    subscribe(shareId, onChange) {
      if (!isValidShareId(shareId)) {
        throw new Error('Érvénytelen közös lista azonosító.');
      }
      if (!db || !sdk) {
        throw new Error('A Firebase szinkron nincs csatlakoztatva.');
      }
      const { doc, collection, onSnapshot } = sdk.fsMod;

      let latestMeta = null;
      let latestItems = {};
      let latestTombs = {};
      let hasMeta = false;
      let hasItems = false;

      const emitIfReady = () => {
        if (!hasMeta || !hasItems) return;
        onChange({
          meta: latestMeta,
          items: latestItems,
          tombstones: latestTombs,
        });
      };

      const unsubMeta = onSnapshot(doc(db, 'sharedLists', shareId), (snap) => {
        if (!snap.exists()) return;
        latestMeta = snap.data();
        hasMeta = true;
        emitIfReady();
      });

      const unsubItems = onSnapshot(collection(db, 'sharedLists', shareId, 'items'), (snap) => {
        const nextItems = {};
        const nextTombs = {};
        snap.forEach((d) => {
          const parsed = docToSharedItem(d.id, d.data());
          if (!parsed) return;
          if (parsed.tombstone) nextTombs[d.id] = parsed.tombstone;
          else if (parsed.item) nextItems[d.id] = parsed.item;
        });
        latestItems = nextItems;
        latestTombs = nextTombs;
        hasItems = true;
        emitIfReady();
      });

      const unsubAll = () => {
        unsubMeta();
        unsubItems();
        activeUnsubs.get(shareId)?.delete(unsubAll);
      };
      if (!activeUnsubs.has(shareId)) activeUnsubs.set(shareId, new Set());
      activeUnsubs.get(shareId).add(unsubAll);
      return unsubAll;
    },

    async pushChanges(shareId, changes = {}) {
      if (!isValidShareId(shareId)) return;
      await ensureReady();
      const { doc, writeBatch } = sdk.fsMod;
      const batch = writeBatch(db);
      let ops = 0;

      if (changes.meta && typeof changes.meta === 'object') {
        const metaPatch = {};
        if (typeof changes.meta.name === 'string' && changes.meta.name.trim()) {
          metaPatch.name = changes.meta.name.trim().slice(0, 80);
        }
        if (['none', 'daily', 'weekly'].includes(changes.meta.repeat)) {
          metaPatch.repeat = changes.meta.repeat;
        }
        if (Number.isInteger(changes.meta.weekday)) {
          metaPatch.weekday = changes.meta.weekday;
        }
        if (typeof changes.meta.color === 'string') {
          metaPatch.color = changes.meta.color.trim().slice(0, 20);
        }
        metaPatch.updatedAt = Number(changes.meta.updatedAt) || Date.now();
        batch.set(doc(db, 'sharedLists', shareId), metaPatch, { merge: true });
        ops++;
      }

      for (const raw of changes.upserts || []) {
        const norm = normalizeSharedItem(raw);
        if (!norm) continue;
        batch.set(doc(db, 'sharedLists', shareId, 'items', norm.id), sharedItemToDoc(norm));
        ops++;
      }

      for (const del of changes.deletes || []) {
        if (!del || typeof del.id !== 'string') continue;
        batch.set(doc(db, 'sharedLists', shareId, 'items', del.id), {
          hu: '',
          de: '',
          qty: '',
          brand: '',
          group: 'kell',
          count: 1,
          done: false,
          order: 0,
          deleted: true,
          updatedAt: Number(del.deletedAt) || Date.now(),
          updatedBy: String(del.deletedBy || ''),
        });
        ops++;
      }

      if (ops > 0) {
        await batch.commit();
      }
    },

    async leave(shareId) {
      const unsubs = activeUnsubs.get(shareId);
      if (unsubs) {
        for (const unsub of [...unsubs]) unsub();
        activeUnsubs.delete(shareId);
      }
    },
  };
}
