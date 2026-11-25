// Account-level multi-device sync for Kosár.
// Syncs all of a signed-in user's lists and items to users/{uid}/lists/{listId}
// while keeping sharedLists/{shareId} as references ({ shareId }).
// Uses the same swappable provider pattern as provider.js, with both a
// Firebase Firestore/Auth implementation and an in-memory implementation for tests.

import { isValidShareId } from './provider.js';
import { compareVersion, mergeSharedState, normalizeSharedItem, normalizeTombstone } from './merge.js';
import { loadFirebaseSdk } from './firebase-provider.js';
import { normalizeListPlace } from '../lists.js';

const DEFAULT_LIST_NAME = 'Bevásárlás';
const VALID_REPEATS = new Set(['none', 'daily', 'weekly']);

function clone(val) {
  return JSON.parse(JSON.stringify(val));
}

function cleanStr(val, maxLen) {
  return typeof val === 'string' ? val.trim().slice(0, maxLen) : '';
}

/**
 * Normalizes list metadata for account sync.
 * @param {any} raw
 * @param {{ createdAt?: number, updatedAt?: number, updatedBy?: string }} [fallback]
 */
export function normalizeAccountListMeta(raw, fallback = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const shareId = typeof src.shareId === 'string' && isValidShareId(src.shareId.trim())
    ? src.shareId.trim()
    : '';
  const createdAt = Number.isFinite(Number(src.createdAt)) && Number(src.createdAt) > 0
    ? Number(src.createdAt)
    : (Number(fallback.createdAt) || Date.now());
  const updatedAt = Number.isFinite(Number(src.updatedAt))
    ? Number(src.updatedAt)
    : (Number(fallback.updatedAt) || createdAt);
  const updatedBy = cleanStr(src.updatedBy, 64) || cleanStr(fallback.updatedBy, 64);
  const deleted = Boolean(src.deleted);

  const out = {
    name: cleanStr(src.name, 80) || DEFAULT_LIST_NAME,
    repeat: VALID_REPEATS.has(src.repeat) ? src.repeat : 'none',
    weekday: Number.isInteger(Number(src.weekday)) && Number(src.weekday) >= 0 && Number(src.weekday) <= 6
      ? Number(src.weekday)
      : 1,
    createdAt,
    updatedAt,
    updatedBy,
    deleted,
  };
  if (typeof src.color === 'string' && /^[a-z0-9_-]{1,20}$/.test(src.color.trim())) {
    out.color = src.color.trim();
  }
  const place = normalizeListPlace(src.place);
  if (place) {
    out.place = place;
  }
  if (shareId) {
    out.shareId = shareId;
  }
  return out;
}

function listMetaToFirestoreDoc(meta) {
  const now = Date.now();
  if (meta.shareId && isValidShareId(meta.shareId)) {
    const doc = {
      shareId: meta.shareId,
      createdAt: Number(meta.createdAt) || now,
      updatedAt: Number(meta.updatedAt) || now,
    };
    if (meta.updatedBy) doc.updatedBy = String(meta.updatedBy).slice(0, 64);
    if (meta.deleted) doc.deleted = true;
    return doc;
  }
  const doc = {
    name: cleanStr(meta.name, 80) || DEFAULT_LIST_NAME,
    repeat: VALID_REPEATS.has(meta.repeat) ? meta.repeat : 'none',
    weekday: Number.isInteger(Number(meta.weekday)) && Number(meta.weekday) >= 0 && Number(meta.weekday) <= 6
      ? Number(meta.weekday)
      : 1,
    createdAt: Number(meta.createdAt) || now,
    updatedAt: Number(meta.updatedAt) || now,
  };
  if (typeof meta.color === 'string' && meta.color.trim()) {
    doc.color = meta.color.trim().slice(0, 20);
  }
  const place = normalizeListPlace(meta.place);
  if (place) {
    doc.place = place;
  }
  if (meta.updatedBy) doc.updatedBy = String(meta.updatedBy).slice(0, 64);
  if (meta.deleted) doc.deleted = true;
  return doc;
}

function itemToFirestoreDoc(item) {
  return {
    hu: item.hu || '',
    de: item.de || '',
    qty: item.qty || '',
    brand: item.brand || '',
    type: item.type || '',
    group: item.group || 'kell',
    count: item.count || 1,
    done: Boolean(item.done),
    order: Number(item.order) || 0,
    deleted: false,
    updatedAt: Number(item.updatedAt) || Date.now(),
    updatedBy: String(item.updatedBy || ''),
  };
}

function tombstoneToFirestoreDoc(del) {
  return {
    hu: '',
    de: '',
    qty: '',
    brand: '',
    type: '',
    group: 'kell',
    count: 1,
    done: false,
    order: 0,
    deleted: true,
    updatedAt: Number(del.deletedAt) || Date.now(),
    updatedBy: String(del.deletedBy || ''),
  };
}

function docToItemOrTombstone(id, data) {
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

function countListItems(itemsMap, listId) {
  let count = 0;
  for (const it of Object.values(itemsMap || {})) {
    if (it && !it.deleted && it.list === listId) count++;
  }
  return count;
}

function isDefaultListCandidate(list) {
  return Boolean(list && !list.shareId && !list.deleted && (list.name || DEFAULT_LIST_NAME) === DEFAULT_LIST_NAME);
}

/**
 * Merges local lists + items with remote account lists + items.
 * On first sign-in (`isFirstSignIn: true`), performs a union of both sides
 * and drops an empty default "Bevásárlás" list if the other side also has one.
 *
 * @param {{
 *   localLists: Array<any>,
 *   localItems: Record<string, any>,
 *   localPending?: Record<string, any>,
 *   remoteLists: Record<string, { meta: any, items?: Record<string, any>, tombstones?: Record<string, any> }>,
 *   isFirstSignIn?: boolean,
 *   deviceId?: string,
 * }} params
 */
export function mergeAccountState({
  localLists = [],
  localItems = {},
  localPending = {},
  remoteLists = {},
  isFirstSignIn = false,
  deviceId = '',
}) {
  const now = Date.now();
  const nextListsMap = new Map(); // listId -> list object
  const nextItems = {}; // itemId -> item object
  const toPush = {}; // listId -> { meta?, upserts: [], deletes: [] }

  const localById = new Map();
  for (const l of localLists) {
    if (l && l.id) localById.set(l.id, l);
  }

  // Track which local/remote default "Bevásárlás" lists should be dropped if empty
  let dropLocalDefaultId = null;
  let dropRemoteDefaultId = null;

  if (isFirstSignIn) {
    const localDefault = localLists.find((l) => isDefaultListCandidate(l));
    const remoteDefaultEntry = Object.entries(remoteLists).find(([, r]) => r?.meta && isDefaultListCandidate(r.meta));
    if (localDefault && remoteDefaultEntry) {
      const [remoteDefId, remoteDef] = remoteDefaultEntry;
      const localCount = countListItems(localItems, localDefault.id);
      const remoteCount = Object.keys(remoteDef.items || {}).length;
      if (localCount === 0 && remoteCount > 0) {
        dropLocalDefaultId = localDefault.id;
      } else if (remoteCount === 0 && localCount > 0) {
        dropRemoteDefaultId = remoteDefId;
      } else if (localCount === 0 && remoteCount === 0 && localDefault.id !== remoteDefId) {
        dropLocalDefaultId = localDefault.id;
      }
    }
  }

  // Map shareId -> remote listId to deduplicate shared lists across devices
  const remoteShareToId = new Map();
  for (const [rid, r] of Object.entries(remoteLists)) {
    if (r?.meta?.shareId && !r.meta.deleted) {
      remoteShareToId.set(r.meta.shareId, rid);
    }
  }

  // Remap local lists whose shareId already exists remotely under a different id
  const localIdRemap = new Map();
  for (const l of localLists) {
    if (l?.shareId && remoteShareToId.has(l.shareId)) {
      const rid = remoteShareToId.get(l.shareId);
      if (rid !== l.id) localIdRemap.set(l.id, rid);
    }
  }

  // 1. Process remote lists
  for (const [rid, r] of Object.entries(remoteLists)) {
    if (!r || !r.meta) continue;
    if (rid === dropRemoteDefaultId) {
      // Mark empty remote default as deleted so it doesn't linger
      toPush[rid] = {
        meta: { ...normalizeAccountListMeta(r.meta), deleted: true, updatedAt: now, updatedBy: deviceId },
        upserts: [],
        deletes: [],
      };
      continue;
    }

    const rMeta = normalizeAccountListMeta(r.meta);
    const pending = localPending[rid];

    if (rMeta.deleted) {
      // Remote tombstone: only keep local if pending has a newer create/update
      if (pending?.meta && !pending.deleteList && compareVersion(pending.meta.updatedAt, pending.meta.updatedBy, rMeta.updatedAt, rMeta.updatedBy) > 0) {
        const localL = localById.get(rid);
        if (localL) nextListsMap.set(rid, { ...localL });
      }
      continue;
    }

    if (pending?.deleteList) {
      // Local deleted this list offline; keep it deleted locally
      continue;
    }

    const localL = localById.get(rid) || localLists.find((l) => l.shareId && l.shareId === rMeta.shareId);

    if (rMeta.shareId) {
      // Shared list reference: keep local metadata if already joined, else create reference list
      nextListsMap.set(rid, {
        id: rid,
        name: localL?.name || rMeta.name || DEFAULT_LIST_NAME,
        collapsed: localL ? Boolean(localL.collapsed) : false,
        repeat: localL?.repeat || rMeta.repeat || 'none',
        weekday: localL?.weekday ?? rMeta.weekday ?? 1,
        lastReset: localL?.lastReset || 0,
        color: localL?.color ?? rMeta.color ?? null,
        place: localL?.place ?? rMeta.place ?? null,
        shareId: rMeta.shareId,
        createdAt: rMeta.createdAt,
        updatedAt: rMeta.updatedAt,
      });
      continue;
    }

    // Normal account list: LWW merge on meta + items
    let winMeta = rMeta;
    if (pending?.meta && compareVersion(pending.meta.updatedAt, pending.meta.updatedBy, rMeta.updatedAt, rMeta.updatedBy) > 0) {
      winMeta = normalizeAccountListMeta(pending.meta, rMeta);
    } else if (isFirstSignIn && localL && compareVersion(localL.updatedAt || 0, localL.updatedBy || '', rMeta.updatedAt, rMeta.updatedBy) > 0) {
      winMeta = normalizeAccountListMeta(localL, rMeta);
    }

    nextListsMap.set(rid, {
      id: rid,
      name: winMeta.name,
      collapsed: localL ? Boolean(localL.collapsed) : false,
      repeat: winMeta.repeat,
      weekday: winMeta.weekday,
      lastReset: localL?.lastReset || 0,
      color: winMeta.color || null,
      place: winMeta.place || null,
      createdAt: winMeta.createdAt,
      updatedAt: winMeta.updatedAt,
      updatedBy: winMeta.updatedBy || '',
    });

    // Merge items for this list
    const localListItems = {};
    for (const [itemId, it] of Object.entries(localItems)) {
      if (!it) continue;
      const effectiveListId = localIdRemap.get(it.list) || it.list;
      if (effectiveListId === rid) {
        const norm = normalizeSharedItem(it, {
          updatedAt: it.updatedAt || (isFirstSignIn ? now : 0),
          updatedBy: it.updatedBy || deviceId,
        });
        if (norm) localListItems[itemId] = norm;
      }
    }
    for (const [itemId, u] of Object.entries(pending?.upserts || {})) {
      localListItems[itemId] = u;
    }
    const localTombs = { ...(pending?.deletes || {}) };

    const merged = mergeSharedState(
      { items: localListItems, tombstones: localTombs },
      { items: r.items || {}, tombstones: r.tombstones || {} },
    );

    const pushUpserts = [];
    for (const [itemId, winItem] of Object.entries(merged.items)) {
      const existingLocal = localItems[itemId];
      nextItems[itemId] = {
        ...(existingLocal && (localIdRemap.get(existingLocal.list) || existingLocal.list) === rid ? existingLocal : {}),
        ...winItem,
        id: itemId,
        list: rid,
      };
      // If first sign-in and remote didn't have this version, push it
      const remItem = r.items?.[itemId];
      if (isFirstSignIn && (!remItem || compareVersion(winItem.updatedAt, winItem.updatedBy, remItem.updatedAt, remItem.updatedBy) > 0)) {
        pushUpserts.push(winItem);
      }
    }
    if (isFirstSignIn && pushUpserts.length) {
      if (!toPush[rid]) toPush[rid] = { upserts: [], deletes: [] };
      toPush[rid].upserts.push(...pushUpserts);
    }
  }

  // 2. Process local-only lists
  for (const l of localLists) {
    if (!l || !l.id) continue;
    const mappedId = localIdRemap.get(l.id) || l.id;
    if (mappedId !== l.id) continue; // merged into remote shared list
    if (l.id === dropLocalDefaultId) continue; // empty local default dropped in favor of remote
    if (nextListsMap.has(l.id)) continue; // already merged with remote

    const rEntry = remoteLists[l.id];
    if (rEntry?.meta?.deleted) continue; // deleted remotely

    const pending = localPending[l.id];
    if (pending?.deleteList) continue;

    // Keep local-only list if first sign-in OR created/edited offline in pending
    if (isFirstSignIn || pending?.meta) {
      const normMeta = normalizeAccountListMeta(l, { createdAt: l.createdAt || now, updatedAt: l.updatedAt || now, updatedBy: deviceId });
      nextListsMap.set(l.id, {
        ...l,
        createdAt: normMeta.createdAt,
        updatedAt: normMeta.updatedAt,
        updatedBy: normMeta.updatedBy,
      });

      const listUpserts = [];
      if (!l.shareId) {
        for (const [itemId, it] of Object.entries(localItems)) {
          if (it && it.list === l.id) {
            const norm = normalizeSharedItem(it, { updatedAt: it.updatedAt || now, updatedBy: it.updatedBy || deviceId });
            if (norm) {
              nextItems[itemId] = { ...it, ...norm, list: l.id };
              listUpserts.push(norm);
            }
          }
        }
      }
      if (isFirstSignIn) {
        toPush[l.id] = { meta: normMeta, upserts: listUpserts, deletes: [] };
      }
    }
  }

  // Keep shared-list items in nextItems (they are synced via sharedLists/{shareId})
  for (const [itemId, it] of Object.entries(localItems)) {
    if (!it) continue;
    const mappedListId = localIdRemap.get(it.list) || it.list;
    const targetList = nextListsMap.get(mappedListId);
    if (targetList?.shareId && !nextItems[itemId]) {
      nextItems[itemId] = { ...it, list: mappedListId };
    }
  }

  // Preserve local list order where possible, appending new remote lists
  const orderedLists = [];
  const seen = new Set();
  for (const l of localLists) {
    const id = localIdRemap.get(l?.id) || l?.id;
    if (id && nextListsMap.has(id) && !seen.has(id)) {
      orderedLists.push(nextListsMap.get(id));
      seen.add(id);
    }
  }
  for (const [id, l] of nextListsMap.entries()) {
    if (!seen.has(id)) {
      orderedLists.push(l);
      seen.add(id);
    }
  }

  return {
    lists: orderedLists,
    items: nextItems,
    toPush,
  };
}

// ---- In-memory provider (for unit tests without network) --------------------

export function createMemoryAccountStore() {
  return {
    users: new Map(), // uid -> { lists: Map<listId, { meta, items, tombstones }>, listeners: Set<fn> }
  };
}

function getOrCreateUserBucket(store, uid) {
  if (!store.users.has(uid)) {
    store.users.set(uid, { lists: new Map(), listeners: new Set() });
  }
  return store.users.get(uid);
}

/**
 * Creates an in-memory AccountSyncProvider for tests.
 * @param {ReturnType<typeof createMemoryAccountStore>} [store]
 * @param {{ defaultGoogleUser?: { uid: string, displayName?: string, email?: string } }} [opts]
 */
export function createMemoryAccountProvider(store = createMemoryAccountStore(), opts = {}) {
  let currentUser = null;
  const authListeners = new Set();
  const activeUnsubs = new Set();

  function emitAuth() {
    const snap = currentUser ? clone(currentUser) : null;
    for (const cb of [...authListeners]) cb(snap);
  }

  function snapshotUserLists(uid) {
    const bucket = store.users.get(uid);
    const out = {};
    if (!bucket) return out;
    for (const [listId, entry] of bucket.lists.entries()) {
      out[listId] = {
        meta: clone(entry.meta),
        items: clone(entry.items),
        tombstones: clone(entry.tombstones),
      };
    }
    return out;
  }

  function emitUserLists(uid) {
    const bucket = store.users.get(uid);
    if (!bucket) return;
    const snap = snapshotUserLists(uid);
    for (const cb of [...bucket.listeners]) cb(clone(snap));
  }

  return {
    async connect() {},

    getAuthState() {
      return currentUser ? clone(currentUser) : null;
    },

    onAuthChange(cb) {
      authListeners.add(cb);
      return () => authListeners.delete(cb);
    },

    async signInAnonymously(uid = 'anon-' + Math.random().toString(36).slice(2, 8)) {
      currentUser = { uid, isAnonymous: true, displayName: '', email: '' };
      emitAuth();
      return clone(currentUser);
    },

    async signInWithGoogle(userOverride) {
      const target = userOverride || opts.defaultGoogleUser || {
        uid: 'google-user-1',
        displayName: 'Teszt Elek',
        email: 'teszt@example.com',
      };
      // If currently anonymous and not overridden with a different existing uid, link preserves uid
      if (currentUser && currentUser.isAnonymous && !userOverride) {
        currentUser = {
          uid: opts.defaultGoogleUser?.uid || currentUser.uid,
          isAnonymous: false,
          displayName: target.displayName || 'Teszt Elek',
          email: target.email || 'teszt@example.com',
        };
      } else {
        currentUser = {
          uid: target.uid,
          isAnonymous: false,
          displayName: target.displayName || '',
          email: target.email || '',
        };
      }
      emitAuth();
      return clone(currentUser);
    },

    async signOut() {
      for (const unsub of [...activeUnsubs]) unsub();
      activeUnsubs.clear();
      currentUser = null;
      emitAuth();
    },

    async fetchAllLists(uid) {
      return snapshotUserLists(uid);
    },

    subscribeAllLists(uid, onChange) {
      const bucket = getOrCreateUserBucket(store, uid);
      bucket.listeners.add(onChange);
      const unsub = () => {
        bucket.listeners.delete(onChange);
        activeUnsubs.delete(unsub);
      };
      activeUnsubs.add(unsub);
      return unsub;
    },

    async pushListChanges(uid, listId, changes = {}) {
      const bucket = getOrCreateUserBucket(store, uid);
      let entry = bucket.lists.get(listId);
      if (!entry) {
        entry = {
          meta: normalizeAccountListMeta(changes.meta || { name: DEFAULT_LIST_NAME }),
          items: {},
          tombstones: {},
        };
        bucket.lists.set(listId, entry);
      }
      if (changes.meta && typeof changes.meta === 'object') {
        const incomingMeta = normalizeAccountListMeta(changes.meta, entry.meta);
        if (compareVersion(incomingMeta.updatedAt, incomingMeta.updatedBy, entry.meta.updatedAt, entry.meta.updatedBy) >= 0) {
          entry.meta = incomingMeta;
        }
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
      emitUserLists(uid);
    },
  };
}

// ---- Firebase provider ------------------------------------------------------

function toAuthUser(u) {
  if (!u) return null;
  return {
    uid: u.uid,
    isAnonymous: Boolean(u.isAnonymous),
    displayName: u.displayName || '',
    email: u.email || '',
  };
}

function isPopupFallbackError(err) {
  const code = err?.code || '';
  return code === 'auth/popup-blocked'
    || code === 'auth/operation-not-supported-in-this-environment'
    || code === 'auth/web-storage-unsupported'
    || code === 'auth/cancelled-popup-request'
    || code === 'auth/internal-error';
}

export function createFirebaseAccountProvider() {
  let sdk = null;
  let app = null;
  let auth = null;
  let db = null;
  let redirectChecked = false;

  async function ensureInit(config) {
    if (!config || typeof config !== 'object' || !config.projectId || !config.apiKey) {
      throw new Error('A szinkron még nincs beállítva.');
    }
    if (!sdk) sdk = await loadFirebaseSdk();
    if (!app) {
      const existing = sdk.appMod.getApps();
      app = existing.length ? existing[0] : sdk.appMod.initializeApp(config);
      auth = sdk.authMod.getAuth(app);
      db = sdk.fsMod.getFirestore(app);
    }
    if (typeof auth.authStateReady === 'function') {
      await auth.authStateReady();
    }
    if (!redirectChecked) {
      redirectChecked = true;
      try {
        await sdk.authMod.getRedirectResult(auth);
      } catch (err) {
        if (err?.code === 'auth/credential-already-in-use') {
          const cred = sdk.authMod.GoogleAuthProvider.credentialFromError(err);
          if (cred) await sdk.authMod.signInWithCredential(auth, cred);
        }
      }
    }
  }

  return {
    async connect(config) {
      await ensureInit(config);
    },

    getAuthState() {
      return toAuthUser(auth?.currentUser);
    },

    onAuthChange(cb) {
      if (!auth || !sdk) return () => {};
      return sdk.authMod.onAuthStateChanged(auth, (u) => cb(toAuthUser(u)));
    },

    async signInWithGoogle() {
      if (!auth || !sdk) throw new Error('A szinkron nincs csatlakoztatva.');
      const provider = new sdk.authMod.GoogleAuthProvider();
      const cur = auth.currentUser;

      const popupOrRedirect = async () => {
        try {
          const res = await sdk.authMod.signInWithPopup(auth, provider);
          return toAuthUser(res.user);
        } catch (err) {
          if (isPopupFallbackError(err)) {
            await sdk.authMod.signInWithRedirect(auth, provider);
            return null;
          }
          throw err;
        }
      };

      if (cur && cur.isAnonymous) {
        try {
          const res = await sdk.authMod.linkWithPopup(cur, provider);
          return toAuthUser(res.user);
        } catch (err) {
          if (err?.code === 'auth/credential-already-in-use') {
            const cred = sdk.authMod.GoogleAuthProvider.credentialFromError(err);
            if (cred) {
              const res = await sdk.authMod.signInWithCredential(auth, cred);
              return toAuthUser(res.user);
            }
            return popupOrRedirect();
          }
          if (isPopupFallbackError(err)) {
            await sdk.authMod.linkWithRedirect(cur, provider);
            return null;
          }
          throw err;
        }
      }
      return popupOrRedirect();
    },

    async signOut() {
      if (!auth || !sdk) return;
      await sdk.authMod.signOut(auth);
    },

    async fetchAllLists(uid) {
      const { collection, getDocs } = sdk.fsMod;
      const listsSnap = await getDocs(collection(db, 'users', uid, 'lists'));
      const result = {};
      const itemFetches = [];
      listsSnap.forEach((d) => {
        const meta = d.data();
        result[d.id] = { meta, items: {}, tombstones: {} };
        if (!meta.deleted && !meta.shareId) {
          itemFetches.push(
            getDocs(collection(db, 'users', uid, 'lists', d.id, 'items')).then((itemsSnap) => {
              itemsSnap.forEach((itemDoc) => {
                const parsed = docToItemOrTombstone(itemDoc.id, itemDoc.data());
                if (!parsed) return;
                if (parsed.tombstone) result[d.id].tombstones[itemDoc.id] = parsed.tombstone;
                else if (parsed.item) result[d.id].items[itemDoc.id] = parsed.item;
              });
            }),
          );
        }
      });
      await Promise.all(itemFetches);
      return result;
    },

    subscribeAllLists(uid, onChange) {
      const { collection, onSnapshot } = sdk.fsMod;
      const listStates = new Map(); // listId -> { meta, items, tombstones, hasItems }
      const itemUnsubs = new Map(); // listId -> unsub
      let hasLists = false;

      function emitIfReady() {
        if (!hasLists) return;
        const out = {};
        for (const [listId, st] of listStates.entries()) {
          if (!st.meta.deleted && !st.meta.shareId && !st.hasItems) continue;
          out[listId] = { meta: st.meta, items: st.items, tombstones: st.tombstones };
        }
        onChange(out);
      }

      const unsubLists = onSnapshot(collection(db, 'users', uid, 'lists'), (snap) => {
        const seen = new Set();
        snap.forEach((d) => {
          seen.add(d.id);
          const meta = d.data();
          const prev = listStates.get(d.id);
          listStates.set(d.id, {
            meta,
            items: prev?.items || {},
            tombstones: prev?.tombstones || {},
            hasItems: prev?.hasItems || false,
          });
          if (!meta.deleted && !meta.shareId && !itemUnsubs.has(d.id)) {
            const unsubItem = onSnapshot(collection(db, 'users', uid, 'lists', d.id, 'items'), (itemsSnap) => {
              const items = {};
              const tombstones = {};
              itemsSnap.forEach((itemDoc) => {
                const parsed = docToItemOrTombstone(itemDoc.id, itemDoc.data());
                if (!parsed) return;
                if (parsed.tombstone) tombstones[itemDoc.id] = parsed.tombstone;
                else if (parsed.item) items[itemDoc.id] = parsed.item;
              });
              const cur = listStates.get(d.id);
              if (cur) {
                cur.items = items;
                cur.tombstones = tombstones;
                cur.hasItems = true;
                emitIfReady();
              }
            });
            itemUnsubs.set(d.id, unsubItem);
          } else if ((meta.deleted || meta.shareId) && itemUnsubs.has(d.id)) {
            itemUnsubs.get(d.id)();
            itemUnsubs.delete(d.id);
          }
        });
        for (const id of [...listStates.keys()]) {
          if (!seen.has(id)) {
            listStates.delete(id);
            if (itemUnsubs.has(id)) {
              itemUnsubs.get(id)();
              itemUnsubs.delete(id);
            }
          }
        }
        hasLists = true;
        emitIfReady();
      });

      return () => {
        unsubLists();
        for (const unsub of itemUnsubs.values()) unsub();
        itemUnsubs.clear();
      };
    },

    async pushListChanges(uid, listId, changes = {}) {
      const { doc, writeBatch } = sdk.fsMod;
      const ops = [];

      if (changes.meta && typeof changes.meta === 'object') {
        ops.push({
          ref: doc(db, 'users', uid, 'lists', listId),
          data: listMetaToFirestoreDoc(changes.meta),
          merge: true,
        });
      }
      for (const raw of changes.upserts || []) {
        const norm = normalizeSharedItem(raw);
        if (!norm) continue;
        ops.push({
          ref: doc(db, 'users', uid, 'lists', listId, 'items', norm.id),
          data: itemToFirestoreDoc(norm),
          merge: false,
        });
      }
      for (const del of changes.deletes || []) {
        if (!del || typeof del.id !== 'string') continue;
        ops.push({
          ref: doc(db, 'users', uid, 'lists', listId, 'items', del.id),
          data: tombstoneToFirestoreDoc(del),
          merge: false,
        });
      }

      // Chunk writes to stay well under Firestore's 500-op batch limit
      for (let i = 0; i < ops.length; i += 450) {
        const batch = writeBatch(db);
        for (const op of ops.slice(i, i + 450)) {
          if (op.merge) batch.set(op.ref, op.data, { merge: true });
          else batch.set(op.ref, op.data);
        }
        await batch.commit();
      }
    },
  };
}

// ---- Sync manager (shared by app.js and tests) ------------------------------

/**
 * Coordinates Google sign-in, first-sign-in merge, live snapshot updates,
 * offline change queuing/flushing, and sign-out.
 */
export function createAccountSyncManager({
  provider,
  deviceId = 'device',
  getState,
  applyState,
  loadPending = () => ({}),
  savePending = () => {},
  isOnline = () => true,
  onAuthState = () => {},
  onSharedListAdded = () => {},
  flushDelayMs = 120,
}) {
  let pending = loadPending() || {};
  let currentUser = null;
  let unsubAuth = null;
  let unsubRemote = null;
  let flushTimer = null;
  let activeUid = null;

  function persistPending() {
    savePending(pending);
  }

  function ensureBucket(listId) {
    if (!pending[listId]) pending[listId] = { upserts: {}, deletes: {} };
    if (!pending[listId].upserts) pending[listId].upserts = {};
    if (!pending[listId].deletes) pending[listId].deletes = {};
    return pending[listId];
  }

  function isSignedInUser(user) {
    return Boolean(user && !user.isAnonymous && user.uid);
  }

  async function startUserSync(user) {
    if (!isSignedInUser(user)) return;
    if (activeUid === user.uid && unsubRemote) return;

    if (unsubRemote) {
      unsubRemote();
      unsubRemote = null;
    }
    activeUid = user.uid;

    const remoteLists = await provider.fetchAllLists(user.uid);
    if (activeUid !== user.uid) return;

    const { lists, items } = getState();
    const merged = mergeAccountState({
      localLists: lists,
      localItems: items,
      localPending: pending,
      remoteLists,
      isFirstSignIn: true,
      deviceId,
    });

    const prevShareIds = new Set(lists.filter((l) => l.shareId).map((l) => l.shareId));
    applyState({ lists: merged.lists, items: merged.items });

    for (const l of merged.lists) {
      if (l.shareId && !prevShareIds.has(l.shareId)) {
        onSharedListAdded(l);
      }
    }

    // Enqueue any local-only lists/items that need to be pushed to the cloud
    for (const [listId, push] of Object.entries(merged.toPush)) {
      const bucket = ensureBucket(listId);
      if (push.meta) bucket.meta = push.meta;
      for (const u of push.upserts || []) bucket.upserts[u.id] = u;
      for (const d of push.deletes || []) bucket.deletes[d.id] = d;
    }
    persistPending();

    unsubRemote = provider.subscribeAllLists(user.uid, (snapshotLists) => {
      if (activeUid !== user.uid) return;
      const cur = getState();
      const next = mergeAccountState({
        localLists: cur.lists,
        localItems: cur.items,
        localPending: pending,
        remoteLists: snapshotLists,
        isFirstSignIn: false,
        deviceId,
      });
      const existingShares = new Set(cur.lists.filter((l) => l.shareId).map((l) => l.shareId));
      applyState({ lists: next.lists, items: next.items });
      for (const l of next.lists) {
        if (l.shareId && !existingShares.has(l.shareId)) {
          onSharedListAdded(l);
        }
      }
    });

    await flush();
  }

  function stopUserSync() {
    activeUid = null;
    clearTimeout(flushTimer);
    flushTimer = null;
    if (unsubRemote) {
      unsubRemote();
      unsubRemote = null;
    }
  }

  async function handleAuthChange(user) {
    currentUser = user;
    onAuthState(user);
    if (isSignedInUser(user)) {
      if (isOnline()) {
        await startUserSync(user);
      }
    } else {
      stopUserSync();
    }
  }

  function scheduleFlush() {
    if (!isSignedInUser(currentUser) || !isOnline()) return;
    clearTimeout(flushTimer);
    if (flushDelayMs <= 0) {
      flush();
    } else {
      flushTimer = setTimeout(() => { flush(); }, flushDelayMs);
    }
  }

  async function flush() {
    if (!isSignedInUser(currentUser) || !isOnline()) return;
    const uid = currentUser.uid;
    const listIds = Object.keys(pending);
    for (const listId of listIds) {
      const bucket = pending[listId];
      if (!bucket) continue;
      const sentMeta = bucket.meta ? { ...bucket.meta } : null;
      const sentUpserts = Object.values(bucket.upserts || {});
      const sentDeletes = Object.values(bucket.deletes || {});
      if (!sentMeta && !sentUpserts.length && !sentDeletes.length) continue;

      await provider.pushListChanges(uid, listId, {
        ...(sentMeta ? { meta: sentMeta } : {}),
        upserts: sentUpserts,
        deletes: sentDeletes,
      });

      const cur = pending[listId];
      if (cur) {
        if (sentMeta && cur.meta?.updatedAt === sentMeta.updatedAt) {
          delete cur.meta;
          delete cur.deleteList;
        }
        for (const u of sentUpserts) {
          if (cur.upserts?.[u.id]?.updatedAt === u.updatedAt) delete cur.upserts[u.id];
        }
        for (const d of sentDeletes) {
          if (cur.deletes?.[d.id]?.deletedAt === d.deletedAt) delete cur.deletes[d.id];
        }
        if (!cur.meta && !cur.deleteList && !Object.keys(cur.upserts || {}).length && !Object.keys(cur.deletes || {}).length) {
          delete pending[listId];
        }
        persistPending();
      }
    }
  }

  return {
    async connect(config) {
      await provider.connect(config);
      if (unsubAuth) unsubAuth();
      unsubAuth = provider.onAuthChange((user) => {
        handleAuthChange(user).catch(() => {});
      });
      const initial = provider.getAuthState();
      await handleAuthChange(initial);
    },

    getUser() {
      return isSignedInUser(currentUser) ? currentUser : null;
    },

    async signIn() {
      const user = await provider.signInWithGoogle();
      if (user) await handleAuthChange(user);
      return user;
    },

    async signOut() {
      stopUserSync();
      pending = {};
      persistPending();
      await provider.signOut();
      currentUser = null;
      onAuthState(null);
    },

    queueListMeta(list) {
      if (!isSignedInUser(currentUser) || !list?.id) return;
      const now = Date.now();
      const bucket = ensureBucket(list.id);
      bucket.deleteList = false;
      bucket.meta = normalizeAccountListMeta(
        { ...list, updatedAt: now, updatedBy: deviceId, deleted: false },
        { createdAt: list.createdAt || now, updatedAt: now, updatedBy: deviceId },
      );
      persistPending();
      scheduleFlush();
    },

    queueListDelete(listId) {
      if (!isSignedInUser(currentUser) || !listId) return;
      const now = Date.now();
      const bucket = ensureBucket(listId);
      bucket.deleteList = true;
      bucket.meta = {
        name: DEFAULT_LIST_NAME,
        repeat: 'none',
        createdAt: now,
        updatedAt: now,
        updatedBy: deviceId,
        deleted: true,
      };
      bucket.upserts = {};
      bucket.deletes = {};
      persistPending();
      scheduleFlush();
    },

    queueItem(item, list) {
      if (!isSignedInUser(currentUser) || !item?.id || !item?.list) return;
      if (list?.shareId) return; // Shared list items live in sharedLists/{shareId}
      const now = Date.now();
      item.updatedAt = item.updatedAt || now;
      item.updatedBy = item.updatedBy || deviceId;
      const norm = normalizeSharedItem(item, { updatedAt: item.updatedAt, updatedBy: item.updatedBy });
      if (!norm) return;
      const bucket = ensureBucket(item.list);
      if (!bucket.meta && list) {
        bucket.meta = normalizeAccountListMeta(list, { createdAt: list.createdAt || now, updatedAt: now, updatedBy: deviceId });
      }
      bucket.upserts[item.id] = norm;
      delete bucket.deletes[item.id];
      persistPending();
      scheduleFlush();
    },

    queueItemDelete(listId, itemId, list) {
      if (!isSignedInUser(currentUser) || !listId || !itemId) return;
      if (list?.shareId) return;
      const now = Date.now();
      const bucket = ensureBucket(listId);
      bucket.deletes[itemId] = { id: itemId, deletedAt: now, deletedBy: deviceId };
      delete bucket.upserts[itemId];
      persistPending();
      scheduleFlush();
    },

    async handleOnline() {
      if (isSignedInUser(currentUser)) {
        await startUserSync(currentUser);
        await flush();
      }
    },

    flush,

    destroy() {
      stopUserSync();
      if (unsubAuth) {
        unsubAuth();
        unsubAuth = null;
      }
    },
  };
}
