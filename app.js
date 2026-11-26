// Kosár, phone-only build: a static PWA. The list lives only in this phone's
// storage (localStorage, own photos in IndexedDB); there is no server and no
// account. Online, items are enriched from free keyless sources (enrich.js);
// offline that step silently waits and everything else works.
import { enrich, enrichKey, lookupBarcode } from './enrich.js';
import { applyBrand as splitInto, moveBrand, learnBrands, learnable } from './brand.js';
import { putPhoto, getPhoto, delPhoto, allPhotos, resizeImage, blobToDataUrl, dataUrlToBlob, kvPut, kvGet } from './photos.js';
import * as scanner from './scanner.js';
import * as ai from './ai.js';
import { COUNTRIES, DEFAULT_PLACE, normalizePlace, placeKey, useItemPlace } from './shopping-place.js';
import { parseAiInput, isStandalone, isSafari, chooseKeyBanner, keyStatusText } from './ai-key.js';
import { selectMissing } from './refresh.js';
import { guessLang } from './lang.js';
import { chosenVariant, shortName } from './variants.js';
import { mergeOffer } from './offer-merge.js';
import { nameCheck } from './name-check.js';
import { unitText } from './units.js';
import { activeCandidates, addWithCandidate, candidateTitle, candidateUnitInfo, createTypingCandidates, dictionaryTips, ownItemTips, pickCandidate, sortCandidates } from './candidates.js';
import { DEFAULT_LIST_ID, DEFAULT_LIST_NAME, normalizeList, normalizeListPlace, resolveListPlace, migrateToLists, applyListResets, addIncomingList, reorderLists, encodeShareList, decodeShareList, normalizeCount, listEstimate } from './lists.js';
import { DEFAULT_MODE, DEFAULT_ACCENT, getAccent, isAccentAvailable, resolveAccentId, accentsForMode, accentCssVars, accentSwatchStyle } from './accents.js';
import { FIREBASE_CONFIG } from './sync/config.js';
import { createFirebaseProvider } from './sync/firebase-provider.js';
import { createAccountSyncManager, createFirebaseAccountProvider } from './sync/account-sync.js';
import { isValidShareId } from './sync/provider.js';
import { mergeSharedState, normalizeSharedItem } from './sync/merge.js';
import { WORD_EXCLUSIONS, candidatesToProducts, foldHu, groupProductsByBrand, matchCatalogProducts, searchBrandSheetCatalog } from './brand-chooser.js';
import { reorderOrMoveItem } from './drag-order.js';
import { parseDeepLink, buildDeepLink, stripDeepLinkFromUrl } from './deep-link.js';

const GROUP_LABEL = { kell: '', havan: 'ha van', otthon: 'ha otthon elfogyott' };
const CHECK = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.2 3L13 4.5" stroke="var(--accent-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICONS = {
  milk: '<path d="M5 10h8v11H5z"/><path d="M13 10l5-2v11l-5 2"/><path d="M5 10l3-6h7.5L13 10"/><path d="M15.5 4L18 8"/><path d="M8 3h7.5"/><path d="M9 13.5c1 1.4 1.5 2.2 1.5 2.9a1.5 1.5 0 0 1-3 0c0-.7.5-1.5 1.5-2.9z"/>',
  egg: '<path d="M12 3c3.5 0 6 5 6 9.5a6 6 0 0 1-12 0C6 8 8.5 3 12 3z"/>',
  bread: '<path d="M5 13a4 4 0 0 1 1-7h12a4 4 0 0 1 1 7v7H5z"/><path d="M9 10v2M12 10v2M15 10v2"/>',
  cheese: '<path d="M3 18L12 6l9 6v6z"/><path d="M3 18h18"/><circle cx="10" cy="14" r="1"/><circle cx="15" cy="15" r="1.2"/>',
  fruit: '<path d="M12 8c-4-2-8 1-7 6s4 8 7 6c3 2 6-1 7-6s-3-8-7-6z"/><path d="M12 8c0-2 1-4 3-5"/>',
  meat: '<path d="M14 3a6 6 0 0 1 4 10c-2 2-5 2-6 2l-3 3a2 2 0 1 1-2.5 2.5A2 2 0 1 1 4 18l3-3c0-2 0-5 2-7a6 6 0 0 1 5-5z"/>',
  potato: '<path d="M7 6c3-3 11-2 12 4s-4 10-9 9-7-4-6-7 1-4 3-6z"/><circle cx="10" cy="10" r=".6"/><circle cx="14" cy="13" r=".6"/><circle cx="10" cy="15" r=".6"/>',
  carrot: '<path d="M12.5 8a3.5 3.5 0 0 1 4.5 4.5L6 21c-1 .7-2.6-.8-1.9-1.9z"/><path d="M10 12.5l1.5 1.5M7.5 16l1.3 1.3"/><path d="M16 8c0-2 1-4 3-5M16.5 9c1.5-1.2 3.5-1.7 5-1.3"/>',
  pasta: '<path d="M12 21V9"/><path d="M12 9c-2-1-3-3-3-5 2 0 3 1.5 3 3.5 0-2 1-3.5 3-3.5 0 2-1 4-3 5z"/><path d="M8.5 12.5c1.5 0 3.5 1 3.5 3M15.5 12.5c-1.5 0-3.5 1-3.5 3"/>',
  cup: '<path d="M5.5 9h13l-1.5 11.5h-10z"/><path d="M4 6.5h16V9H4z"/><path d="M7.5 13.5h9"/>',
  bacon: '<rect x="3" y="6" width="18" height="12" rx="3"/><path d="M3 11c3-2 5 2 9 0s6 2 9 0M3 15c3-2 5 2 9 0s6 2 9 0"/>',
  bottle: '<path d="M10 3h4v4l2 3v11H8V10l2-3z"/><path d="M8 14h8"/>',
  salt: '<path d="M8 10h8l-1 11H9z"/><path d="M8 10a4 4 0 0 1 8 0"/><circle cx="11" cy="7" r=".5"/><circle cx="13" cy="7" r=".5"/>',
  bag: '<path d="M5 8h14l-1 13H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const safeUrl = (u) => (/^https:\/\//i.test(String(u || '')) ? String(u) : '');

// ---- persistence --------------------------------------------------------------
// bv.items is the v1 key and stays the same, so an update keeps the existing list.
const LS_PLACE = 'bv.shoppingPlace';
let settings = null;
try { const raw = localStorage.getItem(LS_PLACE); if (raw) settings = normalizePlace(JSON.parse(raw)); } catch { /* default */ }
let shoppingPlace = settings || DEFAULT_PLACE;
const listById = (id) => lists.find((x) => x.id === id) || lists[0] || null;
const listPlace = (list) => resolveListPlace(list, shoppingPlace);
const itemPlace = (it) => listPlace(listById(it?.list));
const activeAddPlace = () => listPlace(listById(getActiveAddListId()));
const LS_ITEMS = 'bv.items', LS_LISTS = 'bv.lists', LS_ACTIVE_LIST = 'bv.activeList', LS_SCHEMA = 'bv.schema', SCHEMA = 6;
let items = {}, lists = [], activeListId = DEFAULT_LIST_ID, savedAt = 0;
try { items = JSON.parse(localStorage.getItem(LS_ITEMS) || '{}') || {}; savedAt = Number(localStorage.getItem('bv.itemsAt')) || 0; } catch { items = {}; }
try { const rawLists = JSON.parse(localStorage.getItem(LS_LISTS) || 'null'); if (Array.isArray(rawLists)) lists = rawLists; } catch { lists = []; }
try { activeListId = localStorage.getItem(LS_ACTIVE_LIST) || DEFAULT_LIST_ID; } catch { activeListId = DEFAULT_LIST_ID; }
const LS_MODE = 'bv.mode', LS_ACCENT = 'bv.accent';
let themeMode = DEFAULT_MODE;
try {
  const savedMode = localStorage.getItem(LS_MODE);
  if (savedMode === 'dark' || savedMode === 'light') themeMode = savedMode;
  else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) themeMode = 'light';
} catch { /* default */ }
let themeAccent = DEFAULT_ACCENT;
try {
  const savedAccent = localStorage.getItem(LS_ACCENT);
  if (savedAccent) themeAccent = resolveAccentId(savedAccent, themeMode);
} catch { /* default */ }

function applyTheme() {
  themeAccent = resolveAccentId(themeAccent, themeMode);
  const root = document.documentElement;
  root.dataset.mode = themeMode;
  root.dataset.accent = themeAccent;
  const vars = accentCssVars(themeAccent, themeMode);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', themeMode === 'light' ? '#f4f6f8' : '#131314');
}
applyTheme();

function saveTheme() {
  try {
    localStorage.setItem(LS_MODE, themeMode);
    localStorage.setItem(LS_ACCENT, themeAccent);
  } catch { /* storage blocked */ }
}

function renderSwatchGroups(container, selectedId, mode, onPick) {
  const avail = accentsForMode(mode);
  const groups = [
    { label: 'Sima színek', items: avail.filter((a) => a.kind === 'solid') },
    { label: 'Átfolyó színek', items: avail.filter((a) => a.kind === 'gradient') },
  ];
  const stroke = mode === 'dark' ? '#111113' : '#ffffff';
  container.innerHTML = groups.map((g) =>
    '<div class="swatch-group">' +
    '<div class="swatch-group-title">' + esc(g.label) + '</div>' +
    '<div class="swatch-grid">' +
    g.items.map((a) => {
      const sel = a.id === selectedId;
      const bg = accentSwatchStyle(a, mode);
      return '<button type="button" class="swatch" data-accent-id="' + esc(a.id) + '" ' +
        'title="' + esc(a.name) + '" aria-label="' + esc(a.name) + '" aria-pressed="' + sel + '" ' +
        'style="background:' + esc(bg) + '">' +
        '<svg viewBox="0 0 16 16"><path d="M3 8.5l3.2 3L13 4.5" stroke="' + stroke + '"/></svg>' +
        '</button>';
    }).join('') +
    '</div></div>'
  ).join('');
  container.onclick = (ev) => {
    const btn = ev.target.closest('.swatch[data-accent-id]');
    if (!btn) return;
    onPick(btn.dataset.accentId);
  };
}

let storageOk = true, durableTimer = null;
// Two copies: localStorage (instant at start-up) and IndexedDB (durable). Every
// change goes to both; the IndexedDB write is coalesced over 300 ms.
function persist() {
  savedAt = Date.now();
  try {
    localStorage.setItem(LS_ITEMS, JSON.stringify(items));
    localStorage.setItem(LS_LISTS, JSON.stringify(lists));
    localStorage.setItem(LS_ACTIVE_LIST, activeListId);
    localStorage.setItem('bv.itemsAt', String(savedAt));
    storageOk = true;
  } catch { storageOk = false; }
  clearTimeout(durableTimer);
  durableTimer = setTimeout(() => { kvPut('items', { at: savedAt, items, lists }).catch(() => {}); }, 300);
}
// At start-up: if the durable copy is newer (localStorage lost its last writes), use it.
async function loadDurable() {
  try {
    // An older page holding the database open can block the upgrade: never let that hold up the app.
    const d = await Promise.race([kvGet('items'), new Promise((_, no) => setTimeout(() => no(new Error('idb timeout')), 3000))]);
    if (d && d.items && d.at > savedAt) {
      items = d.items;
      if (Array.isArray(d.lists)) lists = d.lists;
      savedAt = d.at;
      lists = migrateToLists(lists, items);
      applyListResets(lists, items);
      try {
        localStorage.setItem(LS_ITEMS, JSON.stringify(items));
        localStorage.setItem(LS_LISTS, JSON.stringify(lists));
        localStorage.setItem('bv.itemsAt', String(savedAt));
      } catch { /* blocked */ }
      render();
    }
    else if (!d) kvPut('items', { at: savedAt || Date.now(), items, lists }).catch(() => {}); // first run of this version: seed it
  } catch { /* IndexedDB unavailable: localStorage only */ }
}
// Flush the durable copy right away when the app goes to the background.
document.addEventListener('visibilitychange', () => { if (document.hidden && durableTimer) { clearTimeout(durableTimer); durableTimer = null; kvPut('items', { at: savedAt, items, lists }).catch(() => {}); } });
// Ask the browser not to evict the list under storage pressure (installed PWAs usually get this).
navigator.storage?.persist?.().catch(() => {});

// A brand typed into a name moves to the brand field ("Haribo tejes gumimaci"
// -> brand Haribo, name "tejes gumimaci"; Tomi 11092: "Dohány paramount" -> "Dohány",
// brand Paramount). Known brands: the built-in list plus the ones learned from the
// items (brand field, verified shop page). Unsure -> the name stays (site/brand.js).
const learned = () => learnBrands([items, hist]);
const applyBrand = (r) => splitInto(r, learned());
const BRAND_KEYS = { offer: offerKey, enrich: enrichKey };
// a stored item: the same, keeping its verified offer and automatic-name labels
// extra: brands only this item's own sources name (the AI read it from the name: Tomi 11097)
const relabel = (it, extra = []) => moveBrand(it, learned().concat(extra.map(learnable).filter(Boolean)), BRAND_KEYS);

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function ensureActiveList() {
  if (!lists.some((l) => l.id === activeListId)) {
    activeListId = lists[0]?.id || DEFAULT_LIST_ID;
  }
  return activeListId;
}

function targetListForAdd() {
  return ensureActiveList();
}

let activeAddInput = null;
function getActiveAddInput() {
  if (activeAddInput && activeAddInput.isConnected) return activeAddInput;
  return document.querySelector('#list .lcard:not(.collapsed) .lcard-add-input')
    || document.querySelector('#list .lcard-add-input')
    || null;
}

function getActiveAddListId() {
  const inp = getActiveAddInput();
  const lid = inp?.closest('.lcard-add')?.dataset.listAdd;
  return lid && lists.some((l) => l.id === lid) ? lid : targetListForAdd();
}

function focusCardInput(listId) {
  const card = listId ? document.querySelector('#list .lcard[data-list-id="' + CSS.escape(listId) + '"]') : null;
  const inp = card?.querySelector('.lcard-add-input') || getActiveAddInput();
  if (inp) {
    activeAddInput = inp;
    inp.focus();
  }
}

function positionSuggest(inp = getActiveAddInput()) {
  const box = $('suggest');
  if (!box || box.hidden || !inp || !inp.isConnected) return;
  const anchor = inp.closest('.lcard-add') || inp;
  const rect = anchor.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight || 800;
  const gap = 6;
  const spaceBelow = vh - rect.bottom - gap - 8;
  const spaceAbove = rect.top - gap - 8;
  box.style.left = Math.max(8, rect.left) + 'px';
  box.style.width = Math.max(200, rect.width) + 'px';
  if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
    box.style.top = Math.round(rect.bottom + gap) + 'px';
    box.style.bottom = 'auto';
    box.style.maxHeight = Math.max(120, Math.min(Math.round(vh * 0.52), Math.floor(spaceBelow))) + 'px';
  } else {
    box.style.bottom = Math.round(vh - rect.top + gap) + 'px';
    box.style.top = 'auto';
    box.style.maxHeight = Math.max(120, Math.min(Math.round(vh * 0.52), Math.floor(spaceAbove))) + 'px';
  }
}

function focusList(id) {
  const l = lists.find((x) => x.id === id);
  if (!l) return;
  l.collapsed = false;
  activeListId = l.id;
  persist();
  render();
}

function toggleList(id) {
  if (lists.length <= 1) return;
  const l = lists.find((x) => x.id === id);
  if (!l) return;
  l.collapsed = !l.collapsed;
  if (!l.collapsed) activeListId = l.id;
  persist();
  const card = document.querySelector('#list .lcard[data-list-id="' + CSS.escape(id) + '"]');
  if (!card) { render(); return; }
  card.classList.toggle('collapsed', l.collapsed);
  const btn = card.querySelector('.lcard-open');
  if (btn) btn.setAttribute('aria-expanded', String(!l.collapsed));
  const body = card.querySelector('.lcard-body');
  if (body) body.inert = l.collapsed;
}

function edit(id, patch) {
  const prevListId = items[id]?.list;
  const targetLid = patch.list || prevListId || targetListForAdd();
  const lp = listPlace(listById(targetLid));
  const it = items[id] || (items[id] = { id, list: targetLid, ...(lp !== 'none' ? { offerPlace: placeKey(lp) } : {}) });
  Object.assign(it, patch);
  if (prevListId && patch.list && prevListId !== patch.list) {
    queueDeleteSync(prevListId, id);
  }
  queueItemSync(it);
  persist(); render(); kickEnrich();
}
// Deleted items go to the hist ("Korábbi tételek") with all their data; their
// photo stays in IndexedDB, so one tap brings everything back.
const LS_HISTORY = 'bv.history', HISTORY_MAX = 200;
let hist = {};
try { hist = JSON.parse(localStorage.getItem(LS_HISTORY) || '{}') || {}; } catch { hist = {}; }
// Schema migration. v1 -> v2: brands are split out of names; v2 -> v3: again, with
// the longer brand list (e.g. "Golden Toast"); v3 -> v4: with brands learned from the
// verified shop pages and the tobacco brands ("Dohány paramount"); v4 -> v5: pharmacy and
// drugstore brands ("Gaviscon dual", Tomi 11097); v5 -> v6: multiple lists ("Kosár").
// Items, ids and done states are never dropped. Runs after hist is loaded (learned brands).
(function migrate() {
  let v = 1;
  try { v = Number(localStorage.getItem(LS_SCHEMA)) || 1; } catch { /* storage blocked */ }
  let changed = false;
  if (v < SCHEMA) {
    if (v < 5) for (const it of Object.values(items)) relabel(it);
    lists = migrateToLists(lists, items);
    changed = true;
    try { localStorage.setItem(LS_SCHEMA, String(SCHEMA)); } catch { /* retried next start */ }
  } else {
    lists = migrateToLists(lists, items);
  }
  if (applyListResets(lists, items).changed) changed = true;
  ensureActiveList();
  if (changed) persist();
})();

function saveHistory() {
  const keys = Object.keys(hist).sort((a, b) => (hist[b].deletedAt || 0) - (hist[a].deletedAt || 0));
  for (const k of keys.slice(HISTORY_MAX)) { if (hist[k].photo) delPhoto(k).catch(() => {}); delete hist[k]; }
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(hist)); } catch { /* storage full */ }
  kvPut('history', hist).catch(() => {});
}
function remove(id) {
  const it = items[id];
  if (it) queueDeleteSync(it.list, id);
  if (it && (it.hu || it.de)) {
    // one hist entry per name: a newer delete of the same item replaces the older one
    for (const [k, h] of Object.entries(hist)) {
      if (k !== id && (h.hu || '').toLowerCase() === (it.hu || '').toLowerCase() && (h.de || '').toLowerCase() === (it.de || '').toLowerCase()) { if (h.photo) delPhoto(k).catch(() => {}); delete hist[k]; }
    }
    hist[id] = { ...it, done: false, deletedAt: Date.now() };
    saveHistory();
  } else if (photoUrls[id]) delPhoto(id).catch(() => {});
  delete items[id]; persist(); render();
}
function restore(id) {
  const h = hist[id]; if (!h) return;
  const { deletedAt: _d, ...it } = h;
  const listId = it.list && lists.some((l) => l.id === it.list) ? it.list : targetListForAdd();
  items[id] = { ...it, list: listId, done: false, order: Date.now() };
  queueItemSync(items[id]);
  delete hist[id]; saveHistory(); persist(); render(); reveal(id);
  setStatus('Visszahívva: ' + (it.hu || it.de));
}

// ---- own photos ----------------------------------------------------------------
const photoUrls = {}; // item id -> object URL of the user's own photo
async function loadPhotos() {
  try {
    const all = await allPhotos();
    for (const [id, blob] of Object.entries(all)) photoUrls[id] = URL.createObjectURL(blob);
    render();
  } catch { /* IndexedDB unavailable: list still works */ }
}
async function setOwnPhoto(id, blob) {
  await putPhoto(id, blob);
  if (photoUrls[id]) URL.revokeObjectURL(photoUrls[id]);
  photoUrls[id] = URL.createObjectURL(blob);
  if (items[id]) { items[id].photo = true; persist(); }
  render();
}
async function clearOwnPhoto(id) {
  await delPhoto(id).catch(() => {});
  if (photoUrls[id]) { URL.revokeObjectURL(photoUrls[id]); delete photoUrls[id]; }
  if (items[id]) { delete items[id].photo; persist(); }
  render();
}
// Small and big picture for an item: own photo first, then the Open Food Facts one.
function pics(it) {
  if (photoUrls[it.id]) return { small: photoUrls[it.id], big: photoUrls[it.id], own: true };
  // an Open Food Facts picture only when it is exactly this product (barcode); a text-search
  // picture may show a different product (measured: "Bacon" showed a margarine)
  const p = it.enrich?.photo, small = /vonalkód/.test(p?.source || '') ? safeUrl(p?.url) : '';
  if (small) return { small, big: safeUrl(p.big) || small, own: false };
  if (activeCandidates(it).length) return null; // unpicked generic item: the picture comes when one is picked
  const img = safeUrl(it.offer?.link?.image); // the verified store page's product image
  return img ? { small: img, big: img, own: false } : null;
}

// ---- enrichment queue -------------------------------------------------------------
// Runs offline too: the dictionary step needs no network. A run that missed a
// network step is retried as soon as the phone is back online, or every minute.
const RETRY_MS = 60000;
let enriching = false, enrichCount = 0, onlineSince = Date.now();
// Two passes: a quick offline pass (dictionary: instant German name and icon) for
// every changed item first, then the slow network pass (translation, Open Food
// Facts) newest first, so one slow lookup never hides the instant results.
const needsQuick = (it) => (it.hu || it.de) && it.enrich?.key !== enrichKey(it.hu, it.de);
const needs = (it) => needsQuick(it) || ((it.hu || it.de) && it.enrich && navigator.onLine &&
  (it.enrich.quick || (!it.enrich.complete && (it.enrich.at < onlineSince || Date.now() - it.enrich.at > RETRY_MS))));
async function kickEnrich() {
  if (enriching) return;
  enriching = true;
  try {
    for (;;) {
      const all = Object.values(items);
      const quick = all.find(needsQuick);
      const todo = quick ? [quick] : all.filter(needs).sort((a, b) => (b.order || 0) - (a.order || 0));
      const it = todo[0];
      if (!it) break;
      enrichCount = all.filter(needs).length; setNet();
      const before = { hu: it.hu, de: it.de };
      let res = null;
      try {
        res = quick ? await enrich(it, { online: false }) : await enrich(it, { online: navigator.onLine, aiName: ai.configured() ? ai.name : null, aiNameAny: ai.configured() ? ai.nameAny : null });
        if (res && quick && !res.complete) res.patch.enrich.quick = true; // the network pass still has to run
      } catch { res = null; }
      const now = items[it.id];
      if (!now) continue; // deleted meanwhile
      if (now.hu !== before.hu || now.de !== before.de) continue; // edited meanwhile: run again on the new names
      if (!res) now.enrich = { key: enrichKey(now.hu, now.de), at: Date.now(), complete: true, autoVals: {}, sources: {} };
      else { Object.assign(now, res.patch); relabel(now, [now.enrich?.brand?.value]); } // the AI may have read a brand from the name
      persist(); render();
    }
  } finally { enriching = false; enrichCount = 0; setNet(); setTimeout(() => { kickOffers(); refreshTick(); }, 0); } // later: may run during start-up
}

function setNet() {
  const n = $('net');
  const on = navigator.onLine;
  n.className = 'net ' + (!on ? 'off' : enriching || recognizing ? 'busy' : 'ok');
  n.textContent = !on ? 'offline' : recognizing ? 'felismerés…' : enriching ? 'kiegészítés… ' + (enrichCount || '') : 'online';
  n.title = !on ? 'Nincs net: a lista működik, a kiegészítés (német név, fotó) netre vár.' : 'Kiegészítés állapota';
}

// ---- render -----------------------------------------------------------------
function visible() { return Object.values(items).filter((i) => i.hu || i.de || i.recog); }

// The picture is its own button: with a photo it zooms; without one, no thumb is shown in compact rows.
function iconHtml(it) {
  const p = pics(it);
  if (!p) return '';
  const img = '<img src="' + esc(p.small) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'ok\')" onerror="this.remove()">';
  return '<button type="button" class="icobtn" data-act="zoom" aria-label="Kép nagyítása">' +
    '<span class="ico' + (p.own ? ' own' : '') + '">' + img + '</span></button>';
}

const forint = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 });
const eur = (value, loc = shoppingPlace) => (loc && loc !== 'none' && COUNTRIES[loc.country]?.currency === 'HUF')
  ? forint.format(value) + ' Ft'
  : Number(value).toFixed(2).replace('.', ',') + ' €';
function itemPrice(it) {
  if (itemPlace(it) === 'none') return null;
  if (it?.myPrice && Number.isFinite(Number(it.myPrice.value)) && Number(it.myPrice.value) > 0) {
    return Number(it.myPrice.value);
  }
  const pv = chosenVariant(it);
  if (pv && Number.isFinite(Number(pv.value)) && Number(pv.value) > 0) {
    return Number(pv.value);
  }
  const op = it?.offer?.price;
  if (op && Number.isFinite(Number(op.value)) && Number(op.value) > 0) {
    return Number(op.value);
  }
  return null;
}
// "Aldi Süd 1,29 € / 200 g (11-18)": store, price, unit and the day it was read from the shop page.
// a shop price always says its unit, or that the shop did not show one (Tomi 11003); own prices keep theirs
// an online shop's price says so (shipping not added; Tomi 11104)
function shopScope(p) {
  return (p.inArea === false ? ' \u00b7 K\u00f6rzet n\u00e9lk\u00fcl' : '')
    + (p.onlineAvailable === false ? ' \u00b7 Online nincs k\u00e9szleten' : '');
}
function priceText(p, own = false, loc = shoppingPlace) { return (p.store ? p.store + (p.online ? ' (online)' : '') + ' ' : '') + eur(p.value, loc) + (own ? (p.unit ? ' / ' + p.unit : '') : unitText(p.unit)) + (own ? '' : shopScope(p)) + (p.date ? ' (' + String(p.date).slice(5) + ')' : ''); }
// the cheapest online pharmacy next to the main price, when it is another page (round 11)
const pharmacyNote = (of) => of?.pharmacy && of.price && of.pharmacy.url !== of.price.url ? of.pharmacy : null;
function metaHtml(it) {
  const lp = itemPlace(it);
  if (lp === 'none') {
    const brand = it.brand || '';
    return brand ? '<div class="meta">' + esc(brand) + '</div>' : '';
  }
  const cs = activeCandidates(it);
  if (cs.length) return '<div class="meta"><span class="note">' + cs.length + ' ajánlat egységár szerint – koppints a választáshoz:</span></div>';
  const parts = [];
  // a brand only when certain: typed, from the barcode/Claude, or from the verified store page
  const brand = it.brand || it.offer?.link?.brand || '';
  if (brand) parts.push(esc(brand));
  // a pack size in use (Tomi's pick or his usual band) is the price; the number of sizes is a hint to pick
  const pv = !it.myPrice && chosenVariant(it), nv = it.offer?.variants?.length || 0;
  if (it.myPrice) parts.push('<span class="price">' + esc(priceText(it.myPrice, true, lp)) + '</span> <span class="tag">saját</span>');
  else if (pv) parts.push('<span class="price">' + esc(shortName(pv.name, it.brand) + ': ' + priceText(pv, false, lp)) + '</span>');
  else if (it.offer?.price) {
    parts.push('<span class="price">' + esc(priceText(it.offer.price, false, lp)) + '</span>');
    if (it.offer.picked && it.offer.price.base) parts.push('<span class="note">' + esc(it.offer.price.base) + '</span>');
  }
  else if (it.offer?.locationUnavailable) parts.push('<span class="noprice">Ehhez a helyhez m\u00e9g nincs ellen\u0151rz\u00f6tt \u00e1rforr\u00e1s.</span>');
  else if (it.offer) parts.push('<span class="noprice">ár: nem találtam</span>');
  // Tomi's REWE price stays the main one; a cheaper verified shop is a note next to it
  if (!it.myPrice && it.offer?.price && it.offer?.alt) parts.push('<span class="note">olcsóbb: ' + esc(it.offer.alt.store + ' ' + eur(it.offer.alt.value, lp)) + '</span>');
  if (!it.myPrice && nv > 1) parts.push('<span class="note">' + nv + ' kiszerelés, koppints a választáshoz</span>');
  const ph = !it.myPrice && pharmacyNote(it.offer);
  if (ph) parts.push('<span class="note">' + (ph.value < it.offer.price.value ? 'olcsóbb online patika: ' : 'online patika: ') + esc(priceText(ph, false, lp)) + '</span>');
  // Tomi's REWE has no online price for it (the shop itself may still sell it: Tomi 11009): a note next
  // to another shop's price; with no price anywhere the row keeps "ár: nem találtam"
  if (it.offer?.price) for (const st of it.offer?.notSold || []) parts.push('<span class="note">' + esc(st) + ' online nem mutat árat</span>');
  return parts.length ? '<div class="meta">' + parts.join(' · ') + '</div>' : '';
}

function chooserHtml(it) {
  const lp = itemPlace(it);
  if (lp === 'none') return '';
  const cs = activeCandidates(it);
  if (!cs.length) return '';
  return '<div class="chooser" role="group" aria-label="Termékválasztó">' + cs.map((c, i) => {
    const img = safeUrl(c.image) ? '<img class="cpic" src="' + esc(c.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
    const st = c.store + (c.online ? ' (online)' : '') + shopScope(c);
    const sub = candidateUnitInfo(c);
    return '<button type="button" class="cand" data-act="pick" data-i="' + i + '">' + img +
      '<span class="cmain"><span class="ctop"><b class="cstore">' + esc(st) + '</b> <span class="cname">' + esc(candidateTitle(c)) + '</span></span>' +
      (sub ? '<span class="csub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="cprice">' + esc(eur(c.price, lp)) + '</span></button>';
  }).join('') + '</div>';
}

function rowHtml(it) {
  const lp = itemPlace(it);
  const av = it.enrich?.autoVals || {};
  // Dictionary translations are reliable ("auto"); machine translations are a guess ("tipp?").
  const dict = it.enrich?.sources?.translation === 'szótár';
  // an auto-filled German name is checked against the verified shop product (Tomi 10990/10993)
  const nc = lp !== 'none' && it.de && av.de === it.de && !activeCandidates(it).length ? nameCheck(it.de, it.offer) : { state: 'unchecked' };
  const autoTag = (f) => {
    if (!(it[f] && av[f] === it[f])) return '';
    if (f === 'de' && nc.state === 'ok') return '<span class="tag">✓ bolti név</span>';
    if (f === 'de' && nc.state === 'differs') return '<span class="tag est">ellenőrizd</span>';
    return '<span class="tag' + (dict ? '' : ' est') + '">' + (dict ? 'auto' : 'tipp?') + '</span>';
  };
  const g = GROUP_LABEL[it.group || 'kell'] ? '<span class="tag">' + GROUP_LABEL[it.group] + '</span>' : '';
  const count = normalizeCount(it.count);
  const qtyText = it.qty ? (count > 1 ? count + '× ' + it.qty : it.qty) : '';
  return '<div class="item' + (it.done ? ' done' : '') + '">' +
    '<button type="button" class="chk" data-act="toggle" aria-pressed="' + !!it.done + '" aria-label="' + esc(it.hu || it.de || 'fotós tétel') + ' kipipálása"><span class="box">' + CHECK + '</span></button>' +
    iconHtml(it) +
    '<button type="button" class="body" data-act="edit">' +
    // Without a Hungarian name (e.g. a scanned product) the German name is the title.
    '<span class="names"><div class="hu">' + (it.hu || it.de ? esc(it.hu || it.de) + autoTag(it.hu ? 'hu' : 'de')
      : it.recog === 'failed' ? '<span class="est">Nem ismertem fel: koppints, írd be</span>' : '<span class="est">Felismerésre vár…</span>') + g + '</div>' +
    (it.hu && it.de && lp !== 'none' && lp.country !== 'hu' ? '<div class="de">' + esc(it.de) + autoTag('de') + '</div>' : '') +
    (it.type ? '<div class="itype">' + esc(it.type) + '</div>' : '') + metaHtml(it) + '</span>' +
    (qtyText ? '<span class="qty">' + esc(qtyText) + '</span>' : '') + '</button>' +
    '<div class="stepper" role="group" aria-label="Darabszám">' +
    '<button type="button" class="step-btn" data-act="dec" aria-label="Kevesebb"' + (count <= 1 ? ' disabled' : '') + '>−</button>' +
    '<span class="step-val">' + count + '</span>' +
    '<button type="button" class="step-btn" data-act="inc" aria-label="Több"' + (count >= 99 ? ' disabled' : '') + '>+</button>' +
    '</div>' +
    '<button type="button" class="row-del" data-act="delete" aria-label="' + esc(it.hu || it.de || 'Tétel') + ' törlése"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>' +
    '</div>' + chooserHtml(it);
}

const WEEKDAY_SHORT = ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];
function repeatBadge(l) {
  if (!l.repeat || l.repeat === 'none') return '';
  if (l.repeat === 'daily') return '<span class="lrep">Naponta</span>';
  return '<span class="lrep">Hetente · ' + (WEEKDAY_SHORT[l.weekday] || 'H') + '</span>';
}
function sharedBadge(l) {
  if (!l.shareId) return '';
  const st = syncStates.get(l.shareId) || (navigator.onLine && FIREBASE_CONFIG ? 'synced' : 'offline');
  const isSynced = st === 'synced' && navigator.onLine;
  const label = isSynced ? 'szinkronban' : 'net nélkül, később küldi';
  return '<span class="lshared ' + (isSynced ? 'ok' : 'off') + '" title="' + esc(label) + '"><span class="lsdot" aria-hidden="true"></span>közös<span class="sr-only"> (' + esc(label) + ')</span></span>';
}

// Bring a just-added item into view (new items sort to the end of their section).
function reveal(id) {
  const it = items[id];
  if (it) {
    const targetId = it.list && lists.some((x) => x.id === it.list) ? it.list : (lists[0]?.id || DEFAULT_LIST_ID);
    const targetList = lists.find((x) => x.id === targetId);
    if (targetList && (targetList.collapsed || activeListId !== targetId)) {
      focusList(targetId);
    }
  }
  requestAnimationFrame(() => {
    const li = document.querySelector('#list li[data-id="' + CSS.escape(id) + '"]');
    if (!li) return;
    li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600);
  });
}

function render() {
  for (const item of Object.values(items)) {
    const lp = itemPlace(item);
    if (lp !== 'none') useItemPlace(item, lp);
  }
  ensureActiveList();
  if (lists.length === 1 && lists[0].collapsed) lists[0].collapsed = false;
  const all = visible();
  const order = { kell: 0, havan: 1, otthon: 2 };
  const by = (a, b) => (order[a.group || 'kell'] - order[b.group || 'kell']) || ((a.order || 0) - (b.order || 0));
  const listEl = $('list');
  listEl.innerHTML = '';
  const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
  const total = all.length, done = all.filter((i) => i.done).length;

  $('ringtxt').textContent = done + '/' + total;
  $('bar').style.strokeDashoffset = String(150.8 * (1 - (total ? done / total : 0)));
  if (lists.length === 1) {
    const curList = lists[0];
    $('sub').innerHTML = esc(curList.name) + (total ? (done === total ? ' · <b>Minden megvan.</b>' : ' · még <b>' + (total - done) + '</b> tétel') : ' · üres');
  } else {
    $('sub').innerHTML = lists.length + ' lista' + (total ? (done === total ? ' · <b>minden megvan</b>' : ' · még <b>' + (total - done) + '</b> tétel') : '');
  }

  const cards = document.createElement('div');
  cards.className = 'lcards';
  for (const l of lists) {
    const lItems = all.filter((i) => (i.list || fallbackId) === l.id);
    const lTotal = lItems.length, lDone = lItems.filter((i) => i.done).length;
    const pct = lTotal ? Math.round((lDone / lTotal) * 100) : 0;
    const lp = listPlace(l);
    const est = lp === 'none' ? { total: 0, pricedCount: 0, missingCount: 0, allDone: false } : listEstimate(lItems, itemPrice);
    const estHtml = lp !== 'none' && est.pricedCount > 0
      ? '<span class="lest' + (est.allDone ? ' done' : '') + '">~' + esc(eur(est.total, lp)) +
        (est.missingCount > 0 ? '<span class="lest-miss"> · ' + est.missingCount + ' tétel ár nélkül</span>' : '') +
        '</span>'
      : '';
    const sorted = [...lItems].sort((a, b) => Number(!!a.done) - Number(!!b.done) || by(a, b));
    const preview = sorted.slice(0, 3).map((i) => i.hu || i.de).filter(Boolean);
    const prevText = lTotal ? (preview.join(', ') + (lTotal > 3 ? '…' : '')) : 'Üres lista';
    const collapsed = lists.length > 1 && Boolean(l.collapsed);

    const card = document.createElement('article');
    card.className = 'lcard' + (collapsed ? ' collapsed' : '');
    card.dataset.listId = l.id;
    const listAccentId = l.color && isAccentAvailable(l.color, themeMode) ? l.color : null;
    if (listAccentId) {
      card.dataset.listAccent = listAccentId;
      const vars = accentCssVars(listAccentId, themeMode);
      for (const [k, v] of Object.entries(vars)) card.style.setProperty(k, v);
    }

    const emptyMsg = lists.length === 1 && !all.length
      ? 'Még nincs semmi a listán. Írd be lent, olvass be egy vonalkódot, vagy importáld a régi listát a ⋯ menüből.'
      : 'Ez a lista még üres.';
    const bodyHtml = lTotal
      ? '<ul class="lcard-items">' + sorted.map((it) => '<li data-id="' + esc(it.id) + '">' + rowHtml(it) + '</li>').join('') + '</ul>'
      : '<div class="lcard-empty">' + emptyMsg + '</div>';
    const addRowHtml = '<form class="lcard-add" data-list-add="' + esc(l.id) + '" autocomplete="off">' +
      '<input class="lcard-add-input" placeholder="Mit ide, a(z) ' + esc(l.name) + ' listába…" aria-label="Új tétel a(z) ' + esc(l.name) + ' listába" enterkeyhint="done">' +
      '<button type="submit" class="lcard-add-btn" aria-label="Hozzáadás">+</button>' +
      '<button type="button" class="scanbtn lcard-cam-btn" data-list-cam="' + esc(l.id) + '" aria-label="Tétel fotóról (' + esc(l.name) + ')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.6"/></svg></button>' +
      '</form>';

    const dragHandleHtml = lists.length > 1
      ? '<span class="lcard-drag" aria-label="' + esc(l.name) + ' sorrendjének áthúzása" title="Hosszan nyomva áthúzható">' +
        '<svg viewBox="0 0 12 18" aria-hidden="true">' +
        '<circle cx="3.5" cy="3.5" r="1.4"/><circle cx="8.5" cy="3.5" r="1.4"/>' +
        '<circle cx="3.5" cy="9" r="1.4"/><circle cx="8.5" cy="9" r="1.4"/>' +
        '<circle cx="3.5" cy="14.5" r="1.4"/><circle cx="8.5" cy="14.5" r="1.4"/>' +
        '</svg></span>'
      : '';
    card.innerHTML = '<div class="lcard-head">' +
      dragHandleHtml +
      '<button type="button" class="lcard-open" data-list-act="toggle" aria-expanded="' + (!collapsed) + '">' +
      '<div class="lcard-top"><span class="lcard-title">' + esc(l.name) + '</span>' +
      (lists.length > 1 ? '<span class="lcard-chev" aria-hidden="true">▾</span>' : '') + sharedBadge(l) + repeatBadge(l) + '</div>' +
      '<div class="lcard-prog"><div class="lbar" aria-hidden="true"><div class="lbar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="lprog">' + lDone + '/' + lTotal + '</span>' + estHtml + '</div>' +
      '<div class="lcard-prev">' + esc(prevText) + '</div></button>' +
      '<button type="button" class="lmenubtn" data-list-act="menu" aria-label="' + esc(l.name) + ' menü">⋯</button>' +
      '</div>' +
      '<div class="lcard-body"' + (collapsed ? ' inert' : '') + '><div class="lcard-body-inner">' + bodyHtml + addRowHtml + '</div></div>';
    cards.appendChild(card);
  }
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'lcard-new';
  newBtn.id = 'newListCard';
  newBtn.dataset.listAct = 'new';
  newBtn.textContent = '+ Új lista';
  cards.appendChild(newBtn);
  listEl.appendChild(cards);

  $('tools').hidden = done === 0;
  $('storeWarn').hidden = storageOk;
}

let justDraggedAt = 0;
$('list').addEventListener('click', (ev) => {
  if (Date.now() - justDraggedAt < 250) return;
  const camBtn = ev.target.closest('.lcard-cam-btn');
  if (camBtn) {
    const lid = camBtn.dataset.listCam || camBtn.closest('[data-list-id]')?.dataset.listId;
    openPhotoSheet(lid);
    return;
  }
  const lbtn = ev.target.closest('[data-list-act]');
  if (lbtn) {
    const act = lbtn.dataset.listAct;
    if (act === 'new') { openListDialog(null); return; }
    const lid = lbtn.closest('[data-list-id]')?.dataset.listId;
    const l = lists.find((x) => x.id === lid);
    if (!l) return;
    if (act === 'toggle') toggleList(l.id);
    else if (act === 'menu') openListMenu(l.id);
    return;
  }
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('li').dataset.id, it = items[id];
  if (!it) return;
  const lid = it.list && lists.some((x) => x.id === it.list) ? it.list : (lists[0]?.id || DEFAULT_LIST_ID);
  if (lid && activeListId !== lid) activeListId = lid;
  if (btn.dataset.act === 'toggle') edit(id, { done: !it.done });
  else if (btn.dataset.act === 'dec' || btn.dataset.act === 'inc') {
    const cur = normalizeCount(it.count);
    const next = btn.dataset.act === 'inc' ? Math.min(99, cur + 1) : Math.max(1, cur - 1);
    if (next !== cur) edit(id, { count: next });
  }
  else if (btn.dataset.act === 'delete') { remove(id); setStatus('Törölve: ' + (it.hu || it.de)); }
  else if (btn.dataset.act === 'zoom') openZoom(pics(it));
  else if (btn.dataset.act === 'pick') {
    const c = activeCandidates(it)[Number(btn.dataset.i)];
    if (c && pickCandidate(it, c, learned(), BRAND_KEYS)) {
      persist(); render();
      setStatus('Kiválasztva: ' + [it.brand, it.de || it.hu, c.store].filter(Boolean).join(' · '));
    }
  } else openBrandSheet(id);
});

// ---- long-press drag reorder & cross-list move ------------------------------
const LONG_PRESS_MS = 400;
const DRAG_MOVE_SLOP = 8;
let dragSession = null;
let dragScrollRaf = 0;

function clearDragIndicators() {
  for (const el of document.querySelectorAll('#list .drag-over-top, #list .drag-over-bot, #list .drag-target')) {
    el.classList.remove('drag-over-top', 'drag-over-bot', 'drag-target');
  }
}

function updateDragTarget(clientX, clientY) {
  if (!dragSession || !dragSession.active) return;
  clearDragIndicators();
  const el = document.elementFromPoint(clientX, clientY);
  const card = el?.closest?.('#list .lcard[data-list-id]');
  if (!card) {
    dragSession.targetListId = null;
    dragSession.targetIndex = 0;
    return;
  }
  const lid = card.dataset.listId;
  dragSession.targetListId = lid;
  if (card.classList.contains('collapsed')) {
    card.classList.add('drag-target');
    const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
    dragSession.targetIndex = visible().filter((i) => (i.list || fallbackId) === lid && i.id !== dragSession.id).length;
    return;
  }
  const lis = [...card.querySelectorAll('.lcard-items li[data-id]')].filter((x) => x.dataset.id !== dragSession.id);
  if (!lis.length) {
    card.classList.add('drag-target');
    dragSession.targetIndex = 0;
    return;
  }
  let idx = lis.length;
  for (let i = 0; i < lis.length; i++) {
    const rect = lis[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      idx = i;
      lis[i].classList.add('drag-over-top');
      break;
    }
  }
  if (idx === lis.length) lis[lis.length - 1].classList.add('drag-over-bot');
  dragSession.targetIndex = idx;
}

function stepDragAutoScroll() {
  if (!dragSession || !dragSession.active) { dragScrollRaf = 0; return; }
  const y = dragSession.lastY;
  const vh = window.innerHeight;
  const edge = 72;
  let dy = 0;
  if (y < edge) dy = -Math.ceil(((edge - y) / edge) * 14);
  else if (y > vh - edge) dy = Math.ceil(((y - (vh - edge)) / edge) * 14);
  if (dy !== 0) {
    window.scrollBy(0, dy);
    updateDragTarget(dragSession.lastX, dragSession.lastY);
  }
  dragScrollRaf = requestAnimationFrame(stepDragAutoScroll);
}

function endDragSession(commit) {
  if (!dragSession) return;
  const s = dragSession;
  dragSession = null;
  clearTimeout(s.timer);
  if (dragScrollRaf) { cancelAnimationFrame(dragScrollRaf); dragScrollRaf = 0; }
  document.body.classList.remove('dragging');
  clearDragIndicators();
  if (s.ghost) s.ghost.remove();
  if (s.li) s.li.classList.remove('drag-src');
  if (!s.active) return;

  justDraggedAt = Date.now();
  if (commit && s.targetListId) {
    const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
    const res = reorderOrMoveItem(items, s.id, s.targetListId, s.targetIndex, fallbackId);
    if (res.changedIds.length) {
      if (res.prevListId !== res.nextListId) {
        queueDeleteSync(res.prevListId, s.id);
        activeListId = res.nextListId;
      }
      for (const cid of res.changedIds) {
        if (items[cid]) queueItemSync(items[cid]);
      }
      persist();
      render();
      if (res.prevListId !== res.nextListId) {
        const targetList = lists.find((x) => x.id === res.nextListId);
        setStatus('Áthelyezve: ' + (targetList?.name || ''));
      }
    }
  }
}

$('list').addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || anyOpen() || dragSession || listDragSession) return;
  if (ev.target.closest('.chk, .stepper, .icobtn, .chooser, .lcard-head, .lcard-new')) return;
  const li = ev.target.closest('.lcard-items li[data-id]');
  if (!li || !items[li.dataset.id]) return;
  const rect = li.getBoundingClientRect();
  const s = {
    id: li.dataset.id,
    li,
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    lastX: ev.clientX,
    lastY: ev.clientY,
    offsetY: ev.clientY - rect.top,
    left: rect.left,
    width: rect.width,
    active: false,
    ghost: null,
    targetListId: null,
    targetIndex: 0,
    timer: null,
  };
  s.timer = setTimeout(() => {
    if (dragSession !== s) return;
    s.active = true;
    pullY = null; pullD = 0;
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    document.body.classList.add('dragging');
    const ghost = li.cloneNode(true);
    ghost.className = 'drag-ghost';
    ghost.style.left = s.left + 'px';
    ghost.style.width = s.width + 'px';
    ghost.style.top = (s.lastY - s.offsetY) + 'px';
    document.body.appendChild(ghost);
    s.ghost = ghost;
    li.classList.add('drag-src');
    updateDragTarget(s.lastX, s.lastY);
    dragScrollRaf = requestAnimationFrame(stepDragAutoScroll);
  }, LONG_PRESS_MS);
  dragSession = s;
});

window.addEventListener('pointermove', (ev) => {
  if (!dragSession || ev.pointerId !== dragSession.pointerId) return;
  dragSession.lastX = ev.clientX;
  dragSession.lastY = ev.clientY;
  if (!dragSession.active) {
    if (Math.hypot(ev.clientX - dragSession.startX, ev.clientY - dragSession.startY) > DRAG_MOVE_SLOP) {
      endDragSession(false);
    }
    return;
  }
  if (dragSession.ghost) {
    dragSession.ghost.style.top = (ev.clientY - dragSession.offsetY) + 'px';
  }
  updateDragTarget(ev.clientX, ev.clientY);
});

window.addEventListener('touchmove', (ev) => {
  if (dragSession?.active || listDragSession?.active) ev.preventDefault();
}, { passive: false });

window.addEventListener('pointerup', (ev) => {
  if (!dragSession || ev.pointerId !== dragSession.pointerId) return;
  endDragSession(true);
});

window.addEventListener('pointercancel', (ev) => {
  if (!dragSession || ev.pointerId !== dragSession.pointerId) return;
  endDragSession(false);
});

// ---- long-press drag reorder for lists --------------------------------------
let listDragSession = null;
let listDragScrollRaf = 0;

function clearListDragIndicators() {
  for (const el of document.querySelectorAll('#list .list-drag-over-top, #list .list-drag-over-bot')) {
    el.classList.remove('list-drag-over-top', 'list-drag-over-bot');
  }
}

function updateListDragTarget(clientX, clientY) {
  if (!listDragSession || !listDragSession.active) return;
  clearListDragIndicators();
  const others = [...document.querySelectorAll('#list .lcard[data-list-id]')]
    .filter((el) => el.dataset.listId !== listDragSession.id);
  if (!others.length) return;
  let idx = others.length;
  for (let i = 0; i < others.length; i++) {
    const rect = others[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      idx = i;
      others[i].classList.add('list-drag-over-top');
      break;
    }
  }
  if (idx === others.length) {
    others[others.length - 1].classList.add('list-drag-over-bot');
  }
  listDragSession.targetIndex = idx;
}

function stepListDragAutoScroll() {
  if (!listDragSession || !listDragSession.active) { listDragScrollRaf = 0; return; }
  const y = listDragSession.lastY;
  const vh = window.innerHeight;
  const edge = 72;
  let dy = 0;
  if (y < edge) dy = -Math.ceil(((edge - y) / edge) * 14);
  else if (y > vh - edge) dy = Math.ceil(((y - (vh - edge)) / edge) * 14);
  if (dy !== 0) {
    window.scrollBy(0, dy);
    updateListDragTarget(listDragSession.lastX, listDragSession.lastY);
  }
  listDragScrollRaf = requestAnimationFrame(stepListDragAutoScroll);
}

function endListDragSession(commit) {
  if (!listDragSession) return;
  const s = listDragSession;
  listDragSession = null;
  clearTimeout(s.timer);
  if (listDragScrollRaf) { cancelAnimationFrame(listDragScrollRaf); listDragScrollRaf = 0; }
  document.body.classList.remove('dragging');
  clearListDragIndicators();
  if (s.ghost) s.ghost.remove();
  if (s.card) s.card.classList.remove('drag-src');
  if (!s.active) return;

  justDraggedAt = Date.now();
  if (commit) {
    const next = reorderLists(lists, s.id, s.targetIndex);
    const changed = next.length === lists.length && next.some((l, i) => l.id !== lists[i].id);
    if (changed) {
      lists = next;
      persist();
      render();
    }
  }
}

$('list').addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || anyOpen() || dragSession || listDragSession || lists.length <= 1) return;
  const head = ev.target.closest('.lcard-head');
  if (!head || ev.target.closest('.lcard-open, .lmenubtn')) return;
  const card = head.closest('.lcard[data-list-id]');
  const lid = card?.dataset.listId;
  const fromIdx = lid ? lists.findIndex((l) => l.id === lid) : -1;
  if (!card || fromIdx === -1) return;
  const rect = card.getBoundingClientRect();
  const s = {
    id: lid,
    card,
    pointerId: ev.pointerId,
    startX: ev.clientX,
    startY: ev.clientY,
    lastX: ev.clientX,
    lastY: ev.clientY,
    offsetY: ev.clientY - rect.top,
    left: rect.left,
    width: rect.width,
    active: false,
    ghost: null,
    targetIndex: fromIdx,
    timer: null,
  };
  s.timer = setTimeout(() => {
    if (listDragSession !== s) return;
    s.active = true;
    pullY = null; pullD = 0;
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    document.body.classList.add('dragging');
    const ghost = card.cloneNode(true);
    ghost.removeAttribute('data-list-id');
    ghost.querySelector('.lcard-body')?.remove();
    ghost.className = 'lcard collapsed drag-ghost list-drag-ghost';
    ghost.style.left = s.left + 'px';
    ghost.style.width = s.width + 'px';
    ghost.style.top = (s.lastY - s.offsetY) + 'px';
    document.body.appendChild(ghost);
    s.ghost = ghost;
    card.classList.add('drag-src');
    updateListDragTarget(s.lastX, s.lastY);
    listDragScrollRaf = requestAnimationFrame(stepListDragAutoScroll);
  }, LONG_PRESS_MS);
  listDragSession = s;
});

window.addEventListener('pointermove', (ev) => {
  if (!listDragSession || ev.pointerId !== listDragSession.pointerId) return;
  listDragSession.lastX = ev.clientX;
  listDragSession.lastY = ev.clientY;
  if (!listDragSession.active) {
    if (Math.hypot(ev.clientX - listDragSession.startX, ev.clientY - listDragSession.startY) > DRAG_MOVE_SLOP) {
      endListDragSession(false);
    }
    return;
  }
  if (listDragSession.ghost) {
    listDragSession.ghost.style.top = (ev.clientY - listDragSession.offsetY) + 'px';
  }
  updateListDragTarget(ev.clientX, ev.clientY);
});

window.addEventListener('pointerup', (ev) => {
  if (!listDragSession || ev.pointerId !== listDragSession.pointerId) return;
  endListDragSession(true);
});

window.addEventListener('pointercancel', (ev) => {
  if (!listDragSession || ev.pointerId !== listDragSession.pointerId) return;
  endListDragSession(false);
});

// ---- brand -> type bottom sheet ---------------------------------------------
let brandSheetId = null;
let brandSheetMore = false;
let brandSheetCustom = false;
let brandSheetSearchTimer = null;
let brandSheetSearchResults = [];
const BRAND_CHIP_LIMIT = 12;
const BRAND_SEARCH_LIMIT = 30;

function getBrandSheetGroups(it) {
  const lp = itemPlace(it);
  if (lp === 'none') return [];
  if (lp.country === 'hu') {
    const products = matchCatalogProducts(huCatalog, it.hu || it.de || '', WORD_EXCLUSIONS);
    return groupProductsByBrand(products);
  }
  const products = candidatesToProducts(it, activeCandidates(it));
  return groupProductsByBrand(products);
}

function applyBrandSheetPick(it, pick) {
  const patch = {
    brand: String(pick.brand || '').slice(0, 80),
    type: String(pick.label || '').slice(0, 80),
  };
  if (pick.gtin) patch.barcode = pick.gtin;
  if (!it.qty && pick.quantity) patch.qty = String(pick.quantity).slice(0, 40);
  edit(brandSheetId, patch);
  $('brandSheet').close();
  setStatus('Kiválasztva: ' + [patch.brand, patch.type].filter(Boolean).join(' · '));
}

function renderBrandSheet() {
  const it = brandSheetId ? items[brandSheetId] : null;
  if (!it) return;
  const lp = itemPlace(it);
  const isNone = lp === 'none';
  $('bsTitle').textContent = (it.hu || it.de || 'Tétel') + (isNone ? ' – típus / megjegyzés' : ' – márka és típus');
  const searchWrap = $('bsSearch').closest('.bs-search-wrap');
  if (searchWrap) searchWrap.hidden = isNone;
  if (isNone) {
    brandSheetSearchResults = [];
    $('bsSearchResults').hidden = true;
    $('bsSearchHint').hidden = true;
    $('bsTwoStep').hidden = false;
    $('bsBrands').closest('.bs-sec').hidden = true;
    $('bsTypeSec').hidden = true;
    $('bsCustomForm').hidden = false;
    $('bsCustomInput').value = it.type || '';
    return;
  }
  $('bsBrands').closest('.bs-sec').hidden = false;

  const query = $('bsSearch').value.trim();
  if (query) {
    $('bsTwoStep').hidden = true;
    $('bsSearchResults').hidden = false;
    const pool = lp.country === 'hu'
      ? huCatalog
      : candidatesToProducts(it, activeCandidates(it));
    const matches = searchBrandSheetCatalog(pool, query, { limit: BRAND_SEARCH_LIMIT + 1 });
    const hasMore = matches.length > BRAND_SEARCH_LIMIT;
    brandSheetSearchResults = hasMore ? matches.slice(0, BRAND_SEARCH_LIMIT) : matches;
    $('bsSearchHint').hidden = !hasMore;
    if (!brandSheetSearchResults.length) {
      const msg = lp.country === 'hu' && !huCatalog.length
        ? 'Katalógus betöltése…'
        : 'Nincs találat';
      $('bsResults').innerHTML = '<div class="bs-empty">' + msg + '</div>';
      return;
    }
    $('bsResults').innerHTML = brandSheetSearchResults.map((r, i) => {
      const brandHtml = r.brand ? '<b>' + esc(r.brand) + '</b>' : '';
      const nameText = r.brand ? (r.label || r.name) : r.name;
      const qtyHtml = r.quantity ? '<small>' + esc(r.quantity) + '</small>' : '';
      return '<button type="button" class="bs-result" data-bs-res-idx="' + i + '">' + brandHtml + '<span>' + esc(nameText) + '</span>' + qtyHtml + '</button>';
    }).join('');
    return;
  }

  brandSheetSearchResults = [];
  $('bsSearchResults').hidden = true;
  $('bsSearchHint').hidden = true;
  $('bsTwoStep').hidden = false;

  const groups = getBrandSheetGroups(it);
  const visibleGroups = brandSheetMore ? groups : groups.slice(0, BRAND_CHIP_LIMIT);
  const hasMore = !brandSheetMore && groups.length > BRAND_CHIP_LIMIT;
  const curBrandFold = foldHu(it.brand || '');

  let brandHtml = '<button type="button" class="bs-chip" data-bs-brand="" aria-pressed="' + (!curBrandFold) + '">Bármelyik márka</button>';
  brandHtml += visibleGroups.map((g) => {
    const sel = curBrandFold && foldHu(g.brand) === curBrandFold;
    return '<button type="button" class="bs-chip" data-bs-brand="' + esc(g.brand) + '" aria-pressed="' + sel + '">' + esc(g.brand) + '</button>';
  }).join('');
  if (curBrandFold && !visibleGroups.some((g) => foldHu(g.brand) === curBrandFold)) {
    brandHtml += '<button type="button" class="bs-chip" data-bs-brand="' + esc(it.brand) + '" aria-pressed="true">' + esc(it.brand) + '</button>';
  }
  if (hasMore) {
    brandHtml += '<button type="button" class="bs-chip" data-bs-more="1">Több…</button>';
  }
  $('bsBrands').innerHTML = brandHtml;

  const selGroup = curBrandFold ? groups.find((g) => foldHu(g.brand) === curBrandFold) : null;
  const showTypes = Boolean(curBrandFold || brandSheetCustom);
  $('bsTypeSec').hidden = !showTypes;
  if (showTypes) {
    const types = selGroup ? selGroup.types : [];
    const curTypeFold = foldHu(it.type || '');
    let typeHtml = types.map((t, i) => {
      const sel = curTypeFold && foldHu(t.label) === curTypeFold;
      const text = t.quantity ? t.label + ' · ' + t.quantity : t.label;
      return '<button type="button" class="bs-chip" data-bs-type-idx="' + i + '" aria-pressed="' + sel + '">' + esc(text) + '</button>';
    }).join('');
    typeHtml += '<button type="button" class="bs-chip" data-bs-custom="1" aria-pressed="' + brandSheetCustom + '">Nincs a listában</button>';
    $('bsTypes').innerHTML = typeHtml;
  }
  $('bsCustomForm').hidden = !brandSheetCustom;
}

function openBrandSheet(id) {
  const it = items[id];
  if (!it) return;
  brandSheetId = id;
  brandSheetMore = false;
  brandSheetCustom = false;
  clearTimeout(brandSheetSearchTimer);
  brandSheetSearchResults = [];
  $('bsSearch').value = '';
  const lp = itemPlace(it);
  if (lp !== 'none' && lp.country === 'hu' && !huCatalog.length) {
    void loadHuCatalog().then(() => {
      if ($('brandSheet').open && brandSheetId === id) renderBrandSheet();
    });
  }
  renderBrandSheet();
  $('brandSheet').showModal();
}

$('bsSearch').addEventListener('input', () => {
  clearTimeout(brandSheetSearchTimer);
  brandSheetSearchTimer = setTimeout(() => {
    if ($('brandSheet').open) renderBrandSheet();
  }, 120);
});

$('bsSearch').addEventListener('search', () => {
  clearTimeout(brandSheetSearchTimer);
  if ($('brandSheet').open) renderBrandSheet();
});

$('bsResults').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-bs-res-idx]');
  if (!btn || !brandSheetId || !items[brandSheetId]) return;
  const hit = brandSheetSearchResults[Number(btn.dataset.bsResIdx)];
  if (!hit) return;
  applyBrandSheetPick(items[brandSheetId], hit);
});

$('bsBrands').addEventListener('click', (ev) => {
  const more = ev.target.closest('button[data-bs-more]');
  if (more) { brandSheetMore = true; renderBrandSheet(); return; }
  const btn = ev.target.closest('button[data-bs-brand]');
  if (!btn || !brandSheetId || !items[brandSheetId]) return;
  const brand = btn.dataset.bsBrand;
  brandSheetCustom = false;
  if (!brand) {
    edit(brandSheetId, { brand: '', type: '' });
  } else {
    edit(brandSheetId, { brand });
  }
  renderBrandSheet();
});

$('bsTypes').addEventListener('click', (ev) => {
  const customBtn = ev.target.closest('button[data-bs-custom]');
  if (customBtn) {
    brandSheetCustom = true;
    $('bsCustomForm').hidden = false;
    $('bsCustomInput').value = items[brandSheetId]?.type || '';
    $('bsCustomInput').focus();
    return;
  }
  const btn = ev.target.closest('button[data-bs-type-idx]');
  if (!btn || !brandSheetId || !items[brandSheetId]) return;
  const it = items[brandSheetId];
  const groups = getBrandSheetGroups(it);
  const selGroup = groups.find((g) => foldHu(g.brand) === foldHu(it.brand || ''));
  const t = selGroup?.types?.[Number(btn.dataset.bsTypeIdx)];
  if (!t) return;
  applyBrandSheetPick(it, {
    brand: selGroup.brand,
    label: t.label,
    quantity: t.quantity,
    gtin: t.gtin,
  });
});

$('bsCustomForm').addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (!brandSheetId || !items[brandSheetId]) return;
  const txt = $('bsCustomInput').value.trim().slice(0, 80);
  if (!txt) { $('bsCustomInput').focus(); return; }
  edit(brandSheetId, { type: txt });
  $('brandSheet').close();
  setStatus('Mentve: ' + txt);
});

$('bsFullEdit').addEventListener('click', () => {
  const id = brandSheetId;
  $('brandSheet').close();
  if (id) openEditor(id);
});
$('bsClose').addEventListener('click', () => $('brandSheet').close());

// ---- zoom (full screen picture; closes on tap or the back button) ----------------
function openZoom(p) {
  if (!p) return;
  const img = $('zoomImg');
  img.onerror = () => { if (img.src !== p.small) img.src = p.small; }; // the big one may not be cached offline
  img.src = p.big;
  $('zoom').hidden = false;
  history.pushState({ zoom: 1 }, '');
}
function closeZoom() { $('zoom').hidden = true; $('zoomImg').removeAttribute('src'); }
$('zoom').addEventListener('click', () => history.back());
window.addEventListener('popstate', () => {
  if (!$('zoom').hidden) closeZoom();
});

// ---- add ----------------------------------------------------------------------
// Typing suggests earlier (deleted) items and product candidates from the cache;
// one tap brings back a deleted item or adds the item with the picked product.
const typingCands = createTypingCandidates({
  fetchCandidates: (text, opts) => {
    const lp = activeAddPlace();
    return lp === 'none' ? Promise.resolve(null) : ai.candidates(text, { ...opts, location: lp });
  },
  onUpdate: () => renderSuggest(),
  isOnline: () => navigator.onLine,
  isConfigured: () => ai.configured(),
  learned,
  debounceMs: 500,
  settleMs: 1500,
  pollMs: 12000,
  maxPolls: 4,
  minChars: 3,
  maxRows: 6,
});
let huCatalog = [];
let huCatalogLoad;
async function loadHuCatalog() {
  if (huCatalogLoad) return huCatalogLoad;
  huCatalogLoad = (async () => {
    const { indexHuCatalog, searchHuCatalog } = await import('./off-hu-search.js');
    const response = await fetch(new URL('./off-hu-catalog.json', import.meta.url));
    if (!response.ok) throw new Error('Product catalog unavailable');
    huCatalog = indexHuCatalog(await response.json());
    lookupHuCatalog = searchHuCatalog;
    renderSuggest();
  })().catch(() => { huCatalogLoad = null; });
  return huCatalogLoad;
}
let lookupHuCatalog = () => [];
function renderSuggest(inp = getActiveAddInput()) {
  const q = (inp?.value || '').trim().toLowerCase();
  const box = $('suggest');
  if (!inp || !inp.isConnected || q.length < 2) { box.hidden = true; box.innerHTML = ''; return; }
  const hits = ownItemTips(q, items, hist);
  const histHtml = hits.map(({ id, item: h, inList }) => {
    const variant = chosenVariant(h)?.name;
    const label = inList && !h.done ? 'A list\u00e1n' : 'Kor\u00e1bbi';
    return '<button type="button" class="sug" data-own-id="' + esc(id) + '" data-in-list="' + inList + '">'
      + '<b>' + esc(h.hu || h.de) + '</b><span>'
      + esc([h.de && h.hu ? h.de : '', h.brand, variant && shortName(variant, h.brand)].filter(Boolean).join(' \u00b7 '))
      + '</span><i>' + label + '</i></button>';
  }).join('');
  const lp = activeAddPlace();
  if (lp === 'none') {
    box.innerHTML = histHtml;
    box.hidden = !hits.length;
    if (!box.hidden) positionSuggest(inp);
    return;
  }
  if (lp.country === 'hu' && q === 'tej') {
    const plainMilkHtml = '<button type="button" class="sug" data-plain-hu="Tej" data-plain-icon="milk"><b>Tej</b><span>márka és típus a listán választható</span></button>';
    box.innerHTML = plainMilkHtml + histHtml;
    box.hidden = false;
    positionSuggest(inp);
    return;
  }
  const tips = dictionaryTips(q, lp.country);
  const tipHtml = tips.map(([hu, de], i) => '<button type="button" class="sug" data-tip="' + i + '"><b>' + esc(hu) + '</b><span>' + esc(de) + '</span></button>').join('');
  const st = typingCands.getState();
  const match = q.length >= 3 && st.text.toLowerCase() === q;
  const cands = match ? st.candidates : [];
  const matched = match && cands.length ? (st.matched || '') : '';
  const pending = match && st.pending === true && navigator.onLine;
  const headHtml = matched ? '<div class="shead">' + esc(matched) + ':</div>' : '';
  const candHtml = cands.map((c, i) => {
    const img = safeUrl(c.image) ? '<img class="cpic" src="' + esc(c.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '';
    const store = c.store + (c.online ? ' (online)' : '') + shopScope(c);
    const sub = candidateUnitInfo(c);
    return '<button type="button" class="cand" data-cand="' + i + '">' + img +
      '<span class="cmain"><span class="ctop"><b class="cstore">' + esc(store) + '</b> <span class="cname">' + esc(candidateTitle(c)) + '</span></span>' +
      (sub ? '<span class="csub">' + esc(sub) + '</span>' : '') + '</span>' +
      '<span class="cprice">' + esc(eur(c.price, lp)) + '</span></button>';
  }).join('');
  const pendHtml = pending ? '<div class="spending" role="status">keresem...</div>' : '';
  const catalogHits = lookupHuCatalog(huCatalog, q, lp.country);
  const catalogHtml = catalogHits.length ? '<div class="shead">Konkrét termékek</div>' + catalogHits.map(({ gtin, name, brand, quantity }) => {
    const title = brand && !name.toLowerCase().startsWith(brand.toLowerCase()) ? brand + ' · ' + name : name;
    return '<button type="button" class="sug" data-off-gtin="' + esc(gtin) + '"><b>' + esc(title) + '</b><span>'
      + esc(quantity || 'Kiszerelés nincs megadva') + '</span><i>Open Food Facts</i></button>';
  }).join('') : '';
  box.innerHTML = catalogHtml + histHtml + tipHtml + headHtml + candHtml + pendHtml;
  box.hidden = !tips.length && !hits.length && !catalogHits.length && !cands.length && !pending;
  if (!box.hidden) positionSuggest(inp);
}
function suggest(inp = getActiveAddInput()) {
  if (!inp) return;
  const lp = activeAddPlace();
  if (lp !== 'none' && lp.country === 'hu' && inp.value.trim().length >= 3) void loadHuCatalog();
  typingCands.input(inp.value);
  renderSuggest(inp);
}
$('list').addEventListener('focusin', (ev) => {
  const inp = ev.target.closest('.lcard-add-input');
  if (!inp) return;
  if (activeAddInput !== inp) {
    activeAddInput = inp;
    typingCands.clear();
  }
  const lid = inp.closest('.lcard-add')?.dataset.listAdd;
  if (lid && activeListId !== lid && lists.some((l) => l.id === lid)) {
    activeListId = lid;
    persist();
  }
  renderSuggest(inp);
});
$('list').addEventListener('input', (ev) => {
  const inp = ev.target.closest('.lcard-add-input');
  if (!inp) return;
  activeAddInput = inp;
  const lid = inp.closest('.lcard-add')?.dataset.listAdd;
  if (lid && activeListId !== lid && lists.some((l) => l.id === lid)) {
    activeListId = lid;
    persist();
  }
  suggest(inp);
});
document.addEventListener('pointerdown', (ev) => {
  const box = $('suggest');
  if (!box || box.hidden) return;
  if (ev.target.closest('#suggest') || ev.target.closest('.lcard-add')) return;
  box.hidden = true;
});
window.addEventListener('scroll', () => positionSuggest(), { passive: true });
window.addEventListener('resize', () => positionSuggest());
$('suggest').addEventListener('click', (ev) => {
  const inp = getActiveAddInput();
  const lid = getActiveAddListId();
  const plain = ev.target.closest('button[data-plain-hu]');
  if (plain) {
    const id = uid();
    edit(id, { list: lid, hu: plain.dataset.plainHu, de: '', icon: plain.dataset.plainIcon || 'bag', qty: '', brand: '', group: 'kell', done: false, order: Date.now() });
    if (inp) inp.value = '';
    typingCands.clear();
    renderSuggest();
    reveal(id);
    focusCardInput(lid);
    return;
  }
  const product = ev.target.closest('button[data-off-gtin]');
  if (product) {
    const lp = listPlace(listById(lid));
    const row = lookupHuCatalog(huCatalog, inp?.value || '', lp !== 'none' ? lp.country : 'de')
      .find(({ gtin }) => gtin === product.dataset.offGtin);
    if (!row) return;
    const id = uid();
    edit(id, { list: lid, hu: row.name, de: '', brand: row.brand, barcode: row.gtin, qty: '', group: 'kell', done: false, order: Date.now() });
    if (inp) inp.value = '';
    typingCands.clear();
    renderSuggest();
    reveal(id);
    focusCardInput(lid);
    return;
  }
  const tip = ev.target.closest('button[data-tip]');
  if (tip) {
    const query = inp?.value || '';
    const lp = listPlace(listById(lid));
    const row = dictionaryTips(query, lp !== 'none' ? lp.country : 'de')[Number(tip.dataset.tip)];
    if (!row) return;
    const [hu, de, icon, cat] = row;
    const id = uid();
    edit(id, { list: lid, hu, de, icon, cat, qty: '', brand: '', group: 'kell', done: false, order: Date.now() });
    if (inp) inp.value = '';
    typingCands.clear();
    renderSuggest();
    reveal(id);
    focusCardInput(lid);
    return;
  }
  const cbtn = ev.target.closest('button[data-cand]');
  if (cbtn) {
    const st = typingCands.getState();
    const c = st.candidates[Number(cbtn.dataset.cand)];
    if (!c) return;
    const it = addWithCandidate(inp?.value || '', c, { id: uid(), learned: learned(), keys: BRAND_KEYS, candidates: st.candidates, matched: st.matched });
    it.list = lid;
    const lp = listPlace(listById(lid));
    if (lp !== 'none') it.offerPlace = placeKey(lp);
    items[it.id] = it;
    queueItemSync(it);
    persist(); render(); reveal(it.id); kickEnrich();
    if (inp) inp.value = '';
    typingCands.clear();
    renderSuggest();
    setStatus('Felírva: ' + [it.brand, it.de || it.hu, c.store].filter(Boolean).join(' · '));
    focusCardInput(lid);
    return;
  }
  const own = ev.target.closest('button[data-own-id]');
  if (!own) return;
  const id = own.dataset.ownId;
  if (own.dataset.inList === 'true') {
    const item = items[id];
    if (!item) return;
    if (item.done) edit(id, { done: false, order: Date.now() });
    reveal(id);
  } else {
    restore(id);
  }
  if (inp) inp.value = '';
  typingCands.clear();
  renderSuggest();
});
function openHistory() {
  if ($('menu').open) $('menu').close();
  const rows = Object.entries(hist).sort((a, b) => (b[1].deletedAt || 0) - (a[1].deletedAt || 0));
  $('hiList').innerHTML = rows.length ? rows.map(([id, h]) => {
    const p = pics(h);
    return '<li><button type="button" class="hrow" data-id="' + esc(id) + '"><span class="ico">' + (p ? '<img src="' + esc(p.small) + '" alt="" referrerpolicy="no-referrer">' : '<svg viewBox="0 0 24 24">' + (ICONS[h.icon] || ICONS.bag) + '</svg>') + '</span>' +
      '<span class="names"><b>' + esc(h.hu || h.de) + '</b><span>' + esc([h.de && h.hu ? h.de : '', h.brand].filter(Boolean).join(' · ')) + '</span></span><i>vissza</i></button></li>';
  }).join('') : '<li class="note">Még nincs törölt tétel.</li>';
  $('history').showModal();
}
$('hiList').addEventListener('click', (ev) => { const b = ev.target.closest('button.hrow'); if (!b) return; $('history').close(); restore(b.dataset.id); });
$('hiClose').addEventListener('click', () => $('history').close());

$('list').addEventListener('submit', (e) => {
  const form = e.target.closest('.lcard-add');
  if (!form) return;
  e.preventDefault();
  // one field, any language (Tomi 11205): the brand comes off first, then the language is told
  // apart (site/lang.js); when the phone is not sure, the home machine decides (langCheck)
  const inp = form.querySelector('.lcard-add-input');
  const lid = form.dataset.listAdd;
  const text = (inp?.value || '').trim();
  if (!text) { inp?.focus(); return; }
  const targetId = lid && lists.some((l) => l.id === lid) ? lid : targetListForAdd();
  activeListId = targetId;
  const r = applyBrand({ list: targetId, hu: text, de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now() });
  const lang = guessLang(r.hu);
  if (lang === 'de') { r.de = r.hu; r.hu = ''; }
  else {
    if (!lang) r.langCheck = true;
    r.hu = r.hu.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
  }
  const nid = uid(); edit(nid, r); reveal(nid);
  if (inp) inp.value = '';
  typingCands.clear();
  renderSuggest();
  setStatus('Felírva: ' + (r.hu || r.de) + (r.brand ? ' (márka: ' + r.brand + ')' : '') + (navigator.onLine ? '' : ' (a német név és a fotó netre vár)'));
  focusCardInput(targetId);
});

// ---- editor -----------------------------------------------------------------
// editing: an item id, or null with `draft` set for a new item from the scanner.
let editing = null, draft = null, edPhoto = undefined; // edPhoto: Blob = new own photo, null = remove, undefined = unchanged
function openEditor(id, d = null) {
  editing = id; draft = d; edPhoto = undefined;
  const it = id ? items[id] : { hu: '', de: '', qty: '', brand: '', group: 'kell', ...d };
  $('edTitle').textContent = id ? 'Tétel szerkesztése' : 'Új tétel';
  $('edHu').placeholder = id && !it.hu && !it.de ? 'írd be a nevét' : '';
  $('edHu').value = it.hu || ''; $('edDe').value = it.de || ''; $('edQty').value = it.qty || '';
  $('edBrand').value = it.brand || ''; $('edGroup').value = it.group || 'kell';
  $('edListWrap').hidden = lists.length < 2;
  const curListId = it.list && lists.some((l) => l.id === it.list) ? it.list : targetListForAdd();
  $('edList').innerHTML = lists.map((l) => '<option value="' + esc(l.id) + '"' + (l.id === curListId ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
  // pack sizes (round 12): Tomi picks one; the default (his usual band) is preselected
  const lp = id ? itemPlace(it) : listPlace(listById(curListId));
  const vs = id && lp !== 'none' ? it.offer?.variants || [] : [], cur = id && lp !== 'none' ? chosenVariant(it) : null;
  $('edVarWrap').hidden = vs.length < 2;
  $('edVariant').innerHTML = (cur ? '' : '<option value="">válassz…</option>') + vs.map((v) => '<option value="' + esc(v.name) + '"' + (cur && cur.name === v.name ? ' selected' : '') + '>' +
    esc(shortName(v.name, it.brand) + ' · ' + v.unit + ' · ' + eur(v.value, lp)) + '</option>').join('');
  $('edPrice').value = it.myPrice ? String(it.myPrice.value).replace('.', ',') : ''; $('edStore').value = it.myPrice?.store || '';
  $('edPrice').placeholder = lp !== 'none' && it.offer?.price ? eur(it.offer.price.value, lp) + ' (gép)' : 'pl. 1,29';
  $('edDelete').hidden = !id;
  const e = (id ? it.enrich : d?.enrich) || {}, lines = [];
  // old items may carry a search-page link from earlier versions: only an exact product (barcode) link is shown
  const link = /vonalkód/.test(e.link?.source || '') ? safeUrl(e.link?.url) : '';
  if (d?.barcode || it.barcode) lines.push('Vonalkód: ' + esc(d?.barcode || it.barcode) + (d?.note ? ' <span class="est">(' + esc(d.note) + ')</span>' : ''));
  if (id && it.recogSrc) lines.push('Felismerés: ' + esc(it.recogSrc) + ' <span class="est">(javaslat, javítható)</span>');
  if (id && it.alts?.length) lines.push('Más javaslat: ' + it.alts.map((c, i) => '<button type="button" class="ghost take alt" data-i="' + i + '">' + esc(c.hu || c.de) + (c.brand ? ' · ' + esc(c.brand) : '') + '</button>').join(' '));
  const of = id && lp !== 'none' ? it.offer : null;
  const edCands = of?.candidates?.length ? sortCandidates(of.candidates) : [];
  if (edCands.length) lines.push('Bolti ajánlatok (egységár szerint): ' + edCands.map((c, i) => '<button type="button" class="ghost take candpick" data-i="' + i + '">' + esc(c.store + shopScope(c) + ': ' + candidateTitle(c) + ' · ' + eur(c.price, lp) + (c.unitPriceText ? ' (' + c.unitPriceText + ')' : '')) + '</button>').join(' '));
  if (of?.price) lines.push('Ár: <b>' + esc(priceText(of.price, false, lp)) + '</b>' + (of.price.base ? ' · ' + esc(of.price.base) : '') + ' <span class="note">(a bolti oldalról, ' + esc(of.price.date) + ')</span>');
  else if (of) lines.push('Ár: nem találtam <span class="note">(ellenőrizve ' + esc(String(of.checked || '').slice(0, 10)) + ')</span>');
  for (const st of of?.notSold || []) lines.push(esc(st) + ': <span class="est">online nem mutat árat</span> <span class="note">(a boltban lehet, hogy kapható)</span>');
  if (of?.link && safeUrl(of.link.url)) lines.push('<a href="' + esc(of.link.url) + '" target="_blank" rel="noopener noreferrer">Termékoldal: ' + esc(of.link.store) + '</a> <span class="note">(ellenőrzött)</span>');
  const ph = pharmacyNote(of);
  if (ph) lines.push('Online patika (legolcsóbb, szállítás nélkül): ' + (safeUrl(ph.url) ? '<a href="' + esc(ph.url) + '" target="_blank" rel="noopener noreferrer">' + esc(priceText(ph, false, lp)) + '</a>' : esc(priceText(ph, false, lp))));
  if (of?.price && of?.alt) lines.push('Olcsóbb máshol: ' + (safeUrl(of.alt.url) ? '<a href="' + esc(of.alt.url) + '" target="_blank" rel="noopener noreferrer">' + esc(priceText(of.alt, false, lp)) + '</a>' : esc(priceText(of.alt, false, lp))) + ' <span class="note">(bolti oldal)</span>');
  const nameAuto = id && it.de && it.enrich?.autoVals?.de === it.de;
  if (nameAuto) { const nc = nameCheck(it.de, of); if (nc.state === 'ok') lines.push('Német név: egyezik a bolti termékkel <span class="note">(' + esc(nc.store) + ')</span>');
    else if (nc.state === 'differs') lines.push('Német név: <span class="est">eltér a bolti terméktől</span>, a boltban: <b>' + esc(nc.name) + '</b> <span class="note">(javítsd, ha kell)</span>'); }
  if (e.sources?.translation) lines.push('Fordítás forrása: ' + esc(e.sources.translation));
  if (link) lines.push('<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(e.link.label || 'link') + '</a> <span class="est">(' + esc(e.link.source) + ')</span>');
  $('edHint').innerHTML = lines.length ? '<div class="h">Részletek</div>' + lines.join('<br>') +
    '' : '';
  for (const b of $('edHint').querySelectorAll('button.alt')) {
    b.onclick = () => { const c = it.alts[Number(b.dataset.i)]; $('edHu').value = c.hu || ''; $('edDe').value = c.de || ''; $('edBrand').value = c.brand || ''; };
  }
  for (const b of $('edHint').querySelectorAll('button.candpick')) {
    b.onclick = () => {
      const c = edCands[Number(b.dataset.i)];
      if (id && c && pickCandidate(it, c, learned(), BRAND_KEYS)) {
        persist(); render(); $('editor').close();
        setStatus('Kiválasztva: ' + [it.brand, it.de || it.hu, c.store].filter(Boolean).join(' · '));
      }
    };
  }
  if (d?.photoBlob) edPhoto = d.photoBlob;
  showEdPhoto(id);
  $('editor').showModal();
}
function showEdPhoto(id) {
  const box = $('edPhotoBox');
  const ownUrl = edPhoto ? URL.createObjectURL(edPhoto) : edPhoto === null ? '' : (id && photoUrls[id]) || '';
  // otherwise the exact-product picture, labelled with its real source (barcode -> Open Food Facts, else the verified store)
  const src = id ? items[id] : draft || {};
  const ph = src?.enrich?.photo, barcodeUrl = /vonalkód/.test(ph?.source || '') ? safeUrl(ph?.url) : '';
  const storeUrl = safeUrl(src?.offer?.link?.image);
  const url = ownUrl || barcodeUrl || storeUrl;
  const label = ownUrl ? '' : barcodeUrl ? 'Open Food Facts' : storeUrl ? src.offer.link.store : '';
  box.innerHTML = url ? '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer">' + (label ? '<span class="est">' + esc(label) + '</span>' : '') : '<span class="note">Nincs fotó</span>';
  $('edPhotoDel').hidden = !ownUrl;
}
// Two buttons: on Android 14+ a plain image input opens the photo picker only (no camera).
$('edPhotoCam').addEventListener('click', () => $('edPhotoCamFile').click());
$('edPhotoAdd').addEventListener('click', () => $('edPhotoFile').click());
for (const fid of ['edPhotoFile', 'edPhotoCamFile']) {
  $(fid).addEventListener('change', async () => {
    const f = $(fid).files[0]; $(fid).value = '';
    if (!f) return;
    try { edPhoto = await resizeImage(f); showEdPhoto(editing); } catch { setStatus('Ezt a képet nem tudom megnyitni.'); }
  });
}
$('edPhotoDel').addEventListener('click', () => { edPhoto = null; showEdPhoto(editing); });
$('edForm').addEventListener('submit', async () => {
  const v = { hu: $('edHu').value.trim(), de: $('edDe').value.trim(), qty: $('edQty').value.trim(), brand: $('edBrand').value.trim(), group: $('edGroup').value,
    ...(!$('edListWrap').hidden ? { list: $('edList').value } : {}),
    ...(!$('edVarWrap').hidden ? { variant: $('edVariant').value } : {}) };
  // own price: always wins over the machine's ("saját"); an empty field removes it
  const targetLid = (!$('edListWrap').hidden ? $('edList').value : '') || (editing ? items[editing]?.list : targetListForAdd());
  const lp = listPlace(listById(targetLid));
  const pv = Number($('edPrice').value.replace(',', '.').replace(/[^\d.]/g, ''));
  const myPrice = pv > 0 && pv < (lp !== 'none' && lp.country === 'hu' ? 1000000 : 10000) ? { value: Math.round(pv * 100) / 100, store: $('edStore').value.trim().slice(0, 30), date: new Date().toISOString().slice(0, 10) } : null;
  let id = editing;
  if (!id) { // new item from the scanner
    if (!v.hu && !v.de) { setStatus('Név nélkül nem mentettem.'); return; }
    id = uid();
    applyBrand(v);
    edit(id, { ...v, done: false, order: Date.now(), ...(myPrice ? { myPrice } : {}), ...(draft?.barcode ? { barcode: draft.barcode } : {}), ...(draft?.enrich ? { enrich: draft.enrich } : {}) });
    setStatus('Felírva: ' + (v.hu || v.de));
  } else {
    const it = items[id]; if (!it) return;
    if (!v.brand && (v.hu !== (it.hu || '') || v.de !== (it.de || ''))) applyBrand(v); // a renamed item may carry a brand
    const patch = {};
    for (const k of Object.keys(v)) if ((it[k] || '') !== v[k]) patch[k] = v[k];
    if (it.recog && it.recog !== 'done' && (v.hu || v.de)) patch.recog = 'done'; // named by hand: recognition not needed
    const oldP = it.myPrice ? it.myPrice.value + '|' + it.myPrice.store : '', newP = myPrice ? myPrice.value + '|' + myPrice.store : '';
    if (oldP !== newP) patch.myPrice = myPrice;
    if (Object.keys(patch).length) { edit(id, patch); setStatus('Mentve: ' + (v.hu || v.de)); }
  }
  try {
    if (edPhoto) await setOwnPhoto(id, edPhoto);
    else if (edPhoto === null) await clearOwnPhoto(id);
  } catch { setStatus('A fotót nem sikerült menteni (tárhely?).'); }
});
$('edCancel').addEventListener('click', () => $('editor').close());
$('edDelete').addEventListener('click', () => {
  const it = items[editing]; $('editor').close();
  if (it) { remove(editing); setStatus('Törölve: ' + (it.hu || it.de)); }
});

// ---- add by photo: camera / gallery / paste / share -> "Tovább" -> automatic -------
// The photo becomes an item right away ("felismerésre vár"). The recognition queue
// below fills in the names when it can: a barcode read from the photo (offline,
// on the phone) + Open Food Facts, and Claude on the home machine when reachable.
let sheetBlob = null;
let photoTargetListId = null;
function openPhotoSheet(listId = null) {
  const validId = listId && lists.some((l) => l.id === listId) ? listId : targetListForAdd();
  photoTargetListId = validId;
  if (validId && activeListId !== validId) {
    activeListId = validId;
    persist();
  }
  sheetBlob = null;
  $('psPreview').hidden = true; $('psChoices').hidden = false; $('psGo').hidden = true;
  $('psPaste').hidden = !navigator.clipboard?.read;
  scanner.barcodeSupport().then((ok) => { $('psLive').hidden = !ok; });
  $('photoSheet').showModal();
}
async function takeSheetFile(file) {
  if (!file) return;
  try { sheetBlob = await resizeImage(file); } catch { setStatus('Ezt a képet nem tudom megnyitni.'); return; }
  $('psImg').src = URL.createObjectURL(sheetBlob);
  $('psPreview').hidden = false; $('psChoices').hidden = true; $('psGo').hidden = false;
  if (!$('photoSheet').open) $('photoSheet').showModal();
  $('psGo').focus();
}
$('psCamera').addEventListener('click', () => $('psCamFile').click());   // native camera app (capture)
$('psGallery').addEventListener('click', () => $('psGalFile').click());  // gallery / files
for (const id of ['psCamFile', 'psGalFile']) {
  $(id).addEventListener('change', async () => { const f = $(id).files[0]; $(id).value = ''; await takeSheetFile(f); });
}
$('psPaste').addEventListener('click', async () => {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) { await takeSheetFile(await item.getType(type)); return; }
    }
    setStatus('A vágólapon nincs kép.');
  } catch { setStatus('A vágólapot nem tudtam elolvasni (engedély?).'); }
});
document.addEventListener('paste', (e) => { // Ctrl+V / long-press paste while the sheet is open
  if (!$('photoSheet').open) return;
  const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
  if (f) { e.preventDefault(); takeSheetFile(f); }
});
$('psLive').addEventListener('click', () => { $('photoSheet').close(); openScanner(); });
$('psCancel').addEventListener('click', () => $('photoSheet').close());
$('psGo').addEventListener('click', async () => {
  const blob = sheetBlob;
  const listId = photoTargetListId;
  $('photoSheet').close();
  if (blob) await addPhotoItem(blob, {}, listId);
});

async function addPhotoItem(blob, extra = {}, listId = null) {
  const id = uid();
  const targetList = listId && lists.some((l) => l.id === listId)
    ? listId
    : (photoTargetListId && lists.some((l) => l.id === photoTargetListId) ? photoTargetListId : targetListForAdd());
  items[id] = { id, list: targetList, hu: '', de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now(), photo: true, recog: 'pending', ...extra };
  queueItemSync(items[id]);
  persist();
  try { await setOwnPhoto(id, blob); } catch { setStatus('A fotót nem sikerült menteni (tárhely?).'); }
  if (!items[id].barcode) {
    const code = await scanner.detectInImage(blob).catch(() => '');
    if (code && items[id]) { items[id].barcode = code; persist(); }
  }
  render(); reveal(id);
  setStatus(navigator.onLine ? 'Fotó felvéve, felismerés…' : 'Fotó felvéve. Felismerés, ha lesz net és elérhető a gép.');
  kickRecognize();
}

// Live barcode scanner (only offered where the browser can read barcodes).
let scan = null;
async function openScanner() {
  $('scStatus').textContent = 'Kamera indítása…';
  $('scanner').showModal();
  try {
    scan = await scanner.start($('scVideo'), onBarcode);
    $('scStatus').textContent = 'Tartsd a vonalkódot a keretbe.';
  } catch (e) {
    $('scStatus').textContent = 'A kamera nem indult el (' + (e?.name || 'hiba') + '). Használd a Fénykép gombot.';
  }
}
function closeScanner() { scan?.stop(); scan = null; if ($('scanner').open) $('scanner').close(); }
async function onBarcode(code) {
  let frame = null;
  try { frame = await resizeImage($('scVideo')); } catch { /* no frame */ }
  closeScanner();
  if (frame) await addPhotoItem(frame, { barcode: code }, photoTargetListId);
  else {
    const targetList = photoTargetListId && lists.some((l) => l.id === photoTargetListId) ? photoTargetListId : targetListForAdd();
    const id = uid();
    items[id] = { id, list: targetList, hu: '', de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now(), recog: 'pending', barcode: code };
    queueItemSync(items[id]); persist(); render(); kickRecognize();
  }
}
$('scPhoto').addEventListener('click', async () => {
  let frame = null;
  try { frame = await resizeImage($('scVideo')); } catch { /* camera gave no frame */ }
  closeScanner();
  if (frame) await addPhotoItem(frame, {}, photoTargetListId); else $('psCamFile').click();
});
$('scCancel').addEventListener('click', closeScanner);
$('scanner').addEventListener('close', () => { scan?.stop(); scan = null; });

// ---- recognition queue -------------------------------------------------------------
const RECOG_RETRY_MS = 50000;
let recognizing = false;
const needsRecog = (it) => it.recog === 'pending' && !it.hu && !it.de && navigator.onLine && Date.now() - (it.recogTry || 0) > (it.recogTry ? RECOG_RETRY_MS : 0);
async function kickRecognize() {
  if (recognizing) return;
  recognizing = true; setNet();
  try {
    for (;;) {
      const it = Object.values(items).filter(needsRecog).sort((a, b) => (b.order || 0) - (a.order || 0))[0];
      if (!it) break;
      it.recogTry = Date.now(); persist();
      const patch = {};
      // a) barcode -> Open Food Facts product (name, brand, product photo)
      if (it.barcode && !it.offDone) {
        try {
          const p = await lookupBarcode(it.barcode);
          patch.offDone = true;
          if (p) { if (p.name) patch.de = p.name; if (p.nameHu) patch.hu = p.nameHu; if (p.brand) patch.brand = p.brand; patch.recogSrc = 'Open Food Facts (vonalkód)'; }
        } catch { /* network: retried later */ }
      }
      // b) Claude on the home machine: at most ONE successful call per item (quota)
      let alts = null;
      const blob = photoUrls[it.id] && !it.aiDone ? await getPhoto(it.id).catch(() => null) : null;
      if (blob && ai.configured()) {
        const res = await ai.recognize(await blobToDataUrl(await resizeImage(blob, 1024)));
        if (res) {
          patch.aiDone = true;
          const [top, ...rest] = res.candidates || [];
          if (top) {
            if (!patch.hu && !it.hu) patch.hu = top.hu;
            if (!patch.de && !it.de) patch.de = top.de;
            if (!patch.brand && !it.brand && top.brand) patch.brand = top.brand;
            patch.recogSrc = patch.recogSrc ? patch.recogSrc + ' + Claude' : 'Claude (gép)';
            alts = rest.filter((c) => c.hu || c.de);
          }
          if (res.barcode && !it.barcode) { patch.barcode = res.barcode; patch.offDone = false; }
        }
      }
      const now = items[it.id];
      if (!now) continue; // deleted meanwhile
      if (now.hu || now.de) { delete patch.hu; delete patch.de; } // the user typed a name meanwhile: keep it
      Object.assign(now, patch);
      relabel(now); // the photo/barcode name may carry the brand
      if (alts?.length) now.alts = alts;
      if (now.hu || now.de) now.recog = 'done';
      else if (now.aiDone && (!now.barcode || now.offDone)) now.recog = 'failed'; // Claude saw it, nothing else to try
      else if (patch.barcode) now.recogTry = 0; // Claude read a barcode: look it up right away
      persist(); render(); kickEnrich(); kickOffers();
    }
  } finally { recognizing = false; setNet(); }
}

// ---- verified link + real store price (home machine) ---------------------
// The machine searches (Gemini), opens the page itself and keeps a link only if it
// is this product, a price only if the shop page shows it. A search takes minutes,
// so the machine answers "pending" first and the app asks again later.
const OFFER_TTL = 3 * 864e5, OFFER_POLL_MS = 60000;
// a function declaration: the start-up migration (above) already needs it
function offerKey(it) { return [it.hu || '', it.de || '', it.brand || '', it.barcode || ''].join('|').toLowerCase(); }
const needsOffer = (it) => itemPlace(it) !== 'none' && (it.hu || it.de) && !it.recog?.match?.(/pending/) && (it.offerForce || !it.offer || it.offer.key !== offerKey(it) ||
  // an answer from before round 11 (no pharmacy field): asked once more; the machine answers from its
  // cache, and searches the online pharmacies for pharmacy items (Tomi 11104)
  !('pharmacy' in it.offer) ||
  // ...and from before round 12 (no variants field): once more for the pack sizes (tobacco)
  !('variants' in it.offer) || Date.now() - (it.offer.at || 0) > OFFER_TTL ||
  (it.offer.link && !it.offer.link.image && !pics(it) && Date.now() - (it.offer.at || 0) > 3600e3) ||
  // no price yet: ask again after an hour (the machine may have found one since; Tomi 11000)
  (!it.offer.price && Date.now() - (it.offer.at || 0) > 3600e3) ||
  // Aldi Nord is not Tomi's shop (Neunburg has an ALDI SÜD): such older answers are asked again
  ((it.offer.price?.store === 'Aldi Nord' || it.offer.link?.store === 'Aldi Nord') && Date.now() - (it.offer.at || 0) > 3600e3)) &&
  Date.now() - (it.offerAsked || 0) > OFFER_POLL_MS;
let offering = false;
async function kickOffers() {
  if (offering || !ai.configured() || !navigator.onLine) return;
  offering = true;
  let reached = true;
  try {
    for (const it of Object.values(items).filter(needsOffer).sort((a, b) => (b.order || 0) - (a.order || 0))) {
      const lp = itemPlace(it);
      if (lp === 'none') continue;
      it.offerAsked = Date.now();
      const scope = placeKey(lp);
      const r = await ai.offer(it, { refresh: !!it.offerForce, location: lp });
      const curLp = itemPlace(it);
      if (curLp === 'none' || scope !== placeKey(curLp)) break;
      if (!r) { reached = false; if (refreshRun) refreshRun.down = true; break; } // machine not reachable: try again later
      if (r.pending) { persist(); continue; }
      const now = items[it.id]; if (!now) continue;
      now.offer = mergeOffer(now.offer, offerKey(now), r);
      delete now.offerForce;
      if (!activeCandidates(now).length) relabel(now); // the verified shop page names the brand: take it out of the name (once a single product is chosen)
      persist(); render(); refreshTick();
    }
  } finally {
    offering = false;
    // items forced meanwhile (pull-down) were not in this round's list: one more round (offerAsked throttles)
    if (reached && Object.values(items).some(needsOffer)) setTimeout(kickOffers, 1000);
  }
}

// ---- pull-down refresh (Tomi 11102, 11202) ------------------------------------------
// Pull the list down at the top: the items still missing a German name, picture or price
// are sent to the machine again. The only sign is the round spinner at the top, as the
// browser's own pull-down had it (Tomi 11202: "csak a kör felül, ahogy volt"); no text.
// It spins while the search runs. Rules (which items, cool-down): site/refresh.js.
const REFRESH_MAX_MS = 12 * 60e3; // the run is followed this long (items stay forced after)
const SPIN_MAX_MS = 3 * 60e3; // the spinner never stays longer than this
const SPIN_MIN_MS = 700; // nothing to do / offline: one short turn, so the pull is answered
let refreshRun = null, spinUntil = 0, spinEnd = null;
const ptr = () => $('ptr');
function spin(on) {
  const el = ptr(); if (!el) return;
  clearTimeout(spinEnd);
  if (on) { el.classList.add('spin'); el.classList.remove('pulling'); el.style.transform = ''; return; }
  const left = spinUntil - Date.now();
  if (left > 0) { spinEnd = setTimeout(() => spin(false), left); return; }
  el.classList.remove('spin', 'ready');
}
function refreshMissing() {
  spinUntil = Date.now() + SPIN_MIN_MS; spin(true);
  if (refreshRun) return;
  if (!navigator.onLine) { spin(false); return; } // the header dot already says offline
  const { todo } = selectMissing(items, pics);
  if (!todo.length) { spin(false); return; }
  const now = Date.now();
  for (const t of todo) {
    const it = items[t.id];
    it.refreshAt = now;
    if (t.parts.includes('ár') || t.parts.includes('kép')) { it.offerForce = true; it.offerAsked = 0; }
    if (t.parts.includes('német név') && it.enrich) { it.enrich.complete = false; it.enrich.at = 0; }
  }
  persist();
  refreshRun = { todo, start: now, down: false };
  if (!ai.configured()) refreshRun.down = true;
  kickEnrich(); kickOffers(); refreshTick();
}
function refreshPending() {
  return refreshRun.todo.filter((t) => { const it = items[t.id]; return it && (it.offerForce || (it.enrich && !it.enrich.complete)); });
}
function refreshTick() {
  if (!refreshRun) return;
  const age = Date.now() - refreshRun.start;
  const open = refreshPending().length && !refreshRun.down;
  if (open && age < SPIN_MAX_MS) return; // still searching: keep spinning
  spin(false);
  if (!open || age > REFRESH_MAX_MS) refreshRun = null;
}
setInterval(() => { if (refreshRun) refreshTick(); }, 2000);
// The gesture: at the top of the page, pull down at least PULL_PX and let go.
const PULL_PX = 80;
let pullY = null, pullD = 0;
const anyOpen = () => [...document.querySelectorAll('dialog')].some((d) => d.open);
addEventListener('touchstart', (e) => { pullY = scrollY <= 0 && !anyOpen() && e.touches.length === 1 && !e.target.closest('.lcard-add,.suggest,.keybanner,.lcard-drag') ? e.touches[0].clientY : null; pullD = 0; }, { passive: true });
addEventListener('touchmove', (e) => {
  if (pullY === null) return;
  pullD = Math.max(0, e.touches[0].clientY - pullY);
  if (scrollY > 0) { pullY = null; pullD = 0; }
  const el = ptr(); if (!el || el.classList.contains('spin')) return;
  // the circle comes down with the finger and its arc turns with it, as in the browser
  const y = Math.min(pullD * 0.75, 130); // ends below the header, not over its text
  el.classList.add('pulling'); el.classList.toggle('ready', pullD >= PULL_PX);
  el.style.transform = 'translate(-50%,' + y + 'px) rotate(' + Math.round(pullD * 2.2) + 'deg)';
  el.style.opacity = String(Math.min(1, pullD / PULL_PX));
}, { passive: true });
addEventListener('touchend', () => {
  const el = ptr();
  if (pullY !== null && pullD >= PULL_PX) refreshMissing();
  else if (el && !el.classList.contains('spin')) { el.classList.remove('pulling', 'ready'); el.style.transform = ''; el.style.opacity = ''; }
  if (el) el.style.opacity = '';
  pullY = null; pullD = 0;
});
// (no refresh on a page reload: the app reloads itself after every update, Tomi did not ask for that)

// ---- clear done ---------------------------------------------------------------
$('clearBtn').addEventListener('click', () => { $('confirmWrap').hidden = false; $('clearBtn').hidden = true; });
$('confirmNo').addEventListener('click', () => { $('confirmWrap').hidden = true; $('clearBtn').hidden = false; });
$('confirmYes').addEventListener('click', () => {
  $('confirmWrap').hidden = true; $('clearBtn').hidden = false;
  const gone = visible().filter((i) => i.done);
  for (const it of gone) remove(it.id);
  setStatus(gone.length + ' kipipált tétel törölve.');
});

// ---- import / backup ------------------------------------------------------------
// Accepts: the artifact export (JSON array of {id, hu, de, done, group, qty, order}),
// this app's backup ({app:'kosar', version:2, items, photos}), or plain text with
// one item per line.
function parseImport(text) {
  const t = String(text || '').trim();
  if (!t) return { rows: [], photos: {} };
  let data = null;
  if (/^[[{]/.test(t)) { try { data = JSON.parse(t); } catch { throw new Error('A szöveg JSON-nak látszik, de hibás.'); } }
  if (data) {
    const arr = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Object.values(data.items || {});
    const own = data.app === 'kosar';
    const rows = arr.filter((r) => r && (r.hu || r.de)).map((r) => ({
      id: r.id ? (String(r.id).startsWith('art-') || own || r.app === 'kosar' ? String(r.id) : 'art-' + r.id) : '',
      ...(r.list ? { list: String(r.list) } : {}),
      hu: String(r.hu || '').slice(0, 120), de: String(r.de || '').slice(0, 120), qty: String(r.qty || '').slice(0, 40),
      brand: String(r.brand || '').slice(0, 60), group: ['kell', 'havan', 'otthon'].includes(r.group) ? r.group : 'kell',
      done: !!r.done, order: Number(r.order) || 0, ...(r.barcode ? { barcode: String(r.barcode).replace(/\D/g, '').slice(0, 14) } : {}),
    }));
    const impLists = own && Array.isArray(data.lists) ? data.lists : [];
    return { rows, lists: impLists, photos: own && data.photos && typeof data.photos === 'object' ? data.photos : {}, hist: own && data.hist && typeof data.hist === 'object' ? data.hist : {} };
  }
  const rows = t.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
    .map((hu, i) => ({ id: '', hu: hu.slice(0, 120), de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now() + i }));
  return { rows, lists: [], photos: {} };
}
async function importData({ rows, lists: impLists = [], photos, hist: h = {} }) {
  for (const l of impLists) {
    if (l && l.id && !lists.some((x) => x.id === l.id)) {
      const nl = normalizeList(l, l.id);
      lists.push(nl);
      accountSync.queueListMeta(nl);
    }
  }
  for (const [id, e] of Object.entries(h)) if (!items[id] && !hist[id] && e && (e.hu || e.de)) hist[id] = e; // earlier items from a backup
  if (Object.keys(h).length) saveHistory();
  let added = 0, updated = 0, pics = 0;
  const fallbackList = targetListForAdd();
  for (const r0 of rows) {
    const r = applyBrand({ ...r0 });
    const id = r.id || 'imp-' + enrichKey(r.hu, r.de);
    const listId = r.list && lists.some((l) => l.id === r.list) ? r.list : fallbackList;
    const cur = items[id];
    if (cur) { Object.assign(cur, r, { id, list: cur.list || listId }); updated++; } else { items[id] = { ...r, id, list: listId }; added++; }
    queueItemSync(items[id]);
  }
  persist(); render(); kickEnrich();
  for (const [id, url] of Object.entries(photos)) {
    if (!items[id] && !hist[id]) continue;
    if (hist[id] && !items[id]) { try { await putPhoto(id, await dataUrlToBlob(url)); } catch { /* skip */ } continue; }
    try { await setOwnPhoto(id, await dataUrlToBlob(url)); pics++; } catch { /* skip a bad photo */ }
  }
  return { added, updated, pics };
}
let pendingImport = { rows: [], photos: {} }, linkMode = false;
function previewImport() {
  const rows = () => pendingImport.rows;
  try {
    pendingImport = parseImport($('imText').value);
    const np = Object.keys(pendingImport.photos).length;
    $('imInfo').innerHTML = !rows().length ? 'Nincs mit importálni.' : linkMode
      ? rows().length + ' tétel érkezett:<ul class="imlist">' + rows().map((r) => '<li' + (r.done ? ' class="d"' : '') + '>' + esc(r.hu || r.de) + '</li>').join('') + '</ul>'
      : esc(rows().length + ' tétel' + (np ? ', ' + np + ' fotó' : '') + ': ' + rows().slice(0, 4).map((r) => r.hu || r.de).join(', ') + (rows().length > 4 ? ', …' : ''));
  } catch (e) { pendingImport = { rows: [], photos: {} }; $('imInfo').textContent = e.message; }
  $('imGo').disabled = !rows().length;
}
// From an import link the raw JSON is hidden: only the item list and one button show.
function openImport(text = '', fromLink = false) {
  linkMode = fromLink;
  if ($('menu').open) $('menu').close();
  $('imPaste').hidden = $('imFileWrap').hidden = fromLink;
  $('imText').value = text; previewImport(); $('importer').showModal();
}
$('imText').addEventListener('input', previewImport);
$('imFile').addEventListener('change', async () => { const f = $('imFile').files[0]; if (f) { $('imText').value = await f.text(); previewImport(); } $('imFile').value = ''; });
$('imGo').addEventListener('click', async () => {
  $('importer').close();
  const { added, updated, pics } = await importData(pendingImport);
  setStatus('Importálva: ' + added + ' új' + (updated ? ', ' + updated + ' frissítve' : '') + (pics ? ', ' + pics + ' fotó' : '') + '.');
});
$('imCancel').addEventListener('click', () => $('importer').close());
function updateAccountMenuUi() {
  const user = accountSync?.getUser();
  const titleEl = $('mAccountTitle');
  const subEl = $('mAccountSub');
  if (!titleEl || !subEl) return;
  if (user) {
    titleEl.textContent = 'Kijelentkezés';
    const label = user.displayName && user.email
      ? user.displayName + ' (' + user.email + ')'
      : (user.email || user.displayName || 'Bejelentkezve');
    subEl.textContent = label;
  } else {
    titleEl.textContent = 'Bejelentkezés Google-lel';
    subEl.textContent = FIREBASE_CONFIG ? 'listák szinkronizálása az eszközeid között' : 'nincs beállítva';
  }
}

$('menuBtn').addEventListener('click', () => {
  updateAccountMenuUi();
  $('mPlaceSub').textContent = COUNTRIES[shoppingPlace.country].label + ' \u00b7 ' + shoppingPlace.place;
  $('mThemeSub').textContent = (themeMode === 'light' ? 'Világos' : 'Sötét') + ' · ' + (getAccent(themeAccent)?.name || '');
  $('mAiKeySub').textContent = keyStatusText(ai.configured());
  $('aiState').textContent = ai.configured() ? 'AI-segéd (gép): ellenőrzés…' : 'AI-segéd (gép): nincs beállítva';
  $('menu').showModal();
  if (ai.configured()) { const lf = ai.lastFailure(); ai.status().then((st) => { $('aiState').textContent = 'AI-segéd (gép): ' + st + (lf ? ' · utolsó hiba: ' + lf : ''); }); }
});
$('menuClose').addEventListener('click', () => $('menu').close());
$('mAccount').addEventListener('click', async () => {
  $('menu').close();
  if (!FIREBASE_CONFIG) {
    setStatus('A szinkron még nincs beállítva.');
    return;
  }
  const user = accountSync.getUser();
  if (user) {
    try {
      await accountSync.signOut();
      updateAccountMenuUi();
      setStatus('Kijelentkeztél. A listák megmaradtak ezen az eszközön.');
    } catch {
      setStatus('A kijelentkezés nem sikerült.');
    }
    return;
  }
  if (!navigator.onLine) {
    setStatus('A bejelentkezéshez internetkapcsolat kell.');
    return;
  }
  try {
    setStatus('Bejelentkezés Google-lel…');
    await ensureAccountSync();
    const signedIn = await accountSync.signIn();
    updateAccountMenuUi();
    if (signedIn) {
      setStatus('Bejelentkezve: ' + (signedIn.email || signedIn.displayName || 'Google-fiók'));
    }
  } catch (err) {
    if (err?.code !== 'auth/popup-closed-by-user') {
      setStatus('A bejelentkezés nem sikerült.');
    }
  }
});
$('mNewList').addEventListener('click', () => { $('menu').close(); openListDialog(null); });
function renderThemeDialog() {
  $('thModeDark').setAttribute('aria-pressed', String(themeMode === 'dark'));
  $('thModeLight').setAttribute('aria-pressed', String(themeMode === 'light'));
  renderSwatchGroups($('thSwatches'), themeAccent, themeMode, (id) => {
    themeAccent = resolveAccentId(id, themeMode);
    applyTheme();
    saveTheme();
    renderThemeDialog();
    render();
  });
}
$('mTheme').addEventListener('click', () => {
  $('menu').close();
  renderThemeDialog();
  $('themeDialog').showModal();
});
for (const btn of [$('thModeDark'), $('thModeLight')]) {
  btn.addEventListener('click', () => {
    themeMode = btn.dataset.modePick === 'light' ? 'light' : 'dark';
    applyTheme();
    saveTheme();
    renderThemeDialog();
    render();
  });
}
$('thClose').addEventListener('click', () => $('themeDialog').close());
$('mImport').addEventListener('click', () => openImport());
$('mHistory').addEventListener('click', openHistory);
function openShoppingPlace() {
  $('placeCountry').value = shoppingPlace.country;
  $('placeName').value = shoppingPlace.place;
  $('placeRadius').value = shoppingPlace.radius;
  $('shoppingPlace').showModal();
}
$('mPlace').addEventListener('click', () => { $('menu').close(); openShoppingPlace(); });
$('placeCountry').addEventListener('change', () => {
  $('placeName').value = $('placeCountry').value === shoppingPlace.country ? shoppingPlace.place : '';
});
$('placeCancel').addEventListener('click', () => $('shoppingPlace').close());
$('placeForm').addEventListener('submit', event => {
  event.preventDefault();
  const next = normalizePlace({ country: $('placeCountry').value, place: $('placeName').value, radius: Number($('placeRadius').value) });
  if (!next) { $('placeName').focus(); return; }
  try { localStorage.setItem(LS_PLACE, JSON.stringify(next)); }
  catch { setStatus('A v\u00e1s\u00e1rl\u00e1si helyet nem siker\u00fclt elmenteni.'); return; }
  shoppingPlace = settings = next;
  $('shoppingPlace').close();
  typingCands.clear();
  render();
  persist();
  kickOffers();
});
$('mAiKey').addEventListener('click', openAiKeyDialog);
$('mBackup').addEventListener('click', async () => {
  $('menu').close();
  const photos = {};
  try { for (const [id, blob] of Object.entries(await allPhotos())) if (items[id] || hist[id]) photos[id] = await blobToDataUrl(blob); } catch { /* no photos */ }
  const rows = Object.values(items).map(({ enrich: _e, ...r }) => r);
  const text = JSON.stringify({ app: 'kosar', version: SCHEMA, at: new Date().toISOString(), lists, items: rows, hist, photos });
  // .txt / text/plain: Android Chrome only shares allow-listed file types, and JSON is not one of them.
  const name = 'kosar-mentes-' + new Date().toISOString().slice(0, 10) + '.txt';
  const file = new File([text], name, { type: 'text/plain' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Kosár mentés' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setStatus('Mentés letöltve: ' + name + (Object.keys(photos).length ? ' (' + Object.keys(photos).length + ' fotóval)' : ''));
});

// ---- AI helper key (menu + iOS standalone banner + Safari one-time tip) --------
const LS_KEY_BANNER_DISMISSED = 'bv.keyBannerDismissed';
function readFlag(k) { try { return localStorage.getItem(k) === '1'; } catch { return false; } }
function writeFlag(k, v) { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } }

let standaloneDismissed = readFlag(LS_KEY_BANNER_DISMISSED);
let kbShowInput = false, kbHint = '';

async function copyText(text) {
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fallback below */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

function applyAiKey(parsed, { copyPending = false } = {}) {
  const saved = ai.setToken(parsed.token, parsed.url, { copyPending });
  kbShowInput = false; kbHint = '';
  setStatus('AI-segéd beállítva. Ellenőrzés…');
  ai.status().then((st) => setStatus('AI-segéd: ' + st + '.'));
  renderKeyBanners();
  kickEnrich(); kickRecognize(); kickOffers();
  return saved;
}

function openAiKeyDialog() {
  if ($('menu').open) $('menu').close();
  $('akState').textContent = 'Állapot: ' + keyStatusText(ai.configured());
  $('akInput').value = '';
  $('akHint').textContent = '';
  $('akDelete').hidden = !ai.configured();
  $('akPaste').hidden = typeof navigator.clipboard?.readText !== 'function';
  $('aiKeyDialog').showModal();
}

$('akPaste').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const parsed = parseAiInput(text);
    if (parsed) {
      $('akInput').value = '';
      $('aiKeyDialog').close();
      applyAiKey(parsed);
      return;
    }
    $('akHint').textContent = 'A vágólapon nem volt érvényes link vagy kulcs – illeszd be a mezőbe.';
  } catch {
    $('akHint').textContent = 'A vágólapot nem tudtam elolvasni – illeszd be kézzel a mezőbe.';
  }
  $('akInput').focus();
});

$('akForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const parsed = parseAiInput($('akInput').value);
  if (!parsed) {
    $('akHint').textContent = 'Nem találtam érvényes kulcsot. Illeszd be a teljes kapott linket (#ai=…) vagy magát a kulcsot.';
    $('akInput').focus();
    return;
  }
  $('akInput').value = '';
  $('aiKeyDialog').close();
  applyAiKey(parsed);
});

$('akCancel').addEventListener('click', () => { $('akInput').value = ''; $('aiKeyDialog').close(); });
$('akDelete').addEventListener('click', () => {
  ai.forget();
  $('akInput').value = '';
  $('aiKeyDialog').close();
  renderKeyBanners();
  setStatus('AI-segéd kulcs törölve.');
});

function renderKeyBanners() {
  const box = $('keyBanner');
  if (!box) return;
  const baseUrl = location.href.split('#')[0];
  const copyLink = ai.pendingKeyLink(baseUrl);
  const kind = chooseKeyBanner({
    standalone: isStandalone({
      navigatorStandalone: !!navigator.standalone,
      displayModeStandalone: !!window.matchMedia?.('(display-mode: standalone)')?.matches,
    }),
    safari: isSafari(navigator.userAgent),
    hasKey: ai.configured(),
    fromLink: !!copyLink,
    standaloneDismissed,
  });
  if (kind === 'none') { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  if (kind === 'standalone-need-key') {
    const canRead = typeof navigator.clipboard?.readText === 'function';
    const showForm = !canRead || kbShowInput;
    box.innerHTML = '<div class="kbtop"><span class="kbtxt">Az árakhoz illeszd be a kapott linket</span>' +
      '<button type="button" class="kbclose" id="kbClose" aria-label="Bezárás">×</button></div>' +
      (showForm
        ? '<form class="kbform" id="kbForm" autocomplete="off"><input id="kbInput" type="text" placeholder="Link vagy kulcs beillesztése" aria-label="Link vagy kulcs beillesztése" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><button type="submit" class="primary">Mentés</button></form>'
        : '<div class="kbacts"><button type="button" class="primary" id="kbPaste">Beillesztés</button></div>') +
      '<div class="kbmsg" id="kbMsg">' + esc(kbHint) + '</div>';
    $('kbClose').addEventListener('click', () => { standaloneDismissed = true; writeFlag(LS_KEY_BANNER_DISMISSED, '1'); renderKeyBanners(); });
    if (showForm) {
      $('kbForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const parsed = parseAiInput($('kbInput').value);
        if (!parsed) { $('kbMsg').textContent = 'Nem találtam érvényes linket vagy kulcsot.'; $('kbInput').focus(); return; }
        $('kbInput').value = '';
        applyAiKey(parsed);
      });
    } else {
      $('kbPaste').addEventListener('click', async () => {
        try {
          const text = await navigator.clipboard.readText();
          const parsed = parseAiInput(text);
          if (parsed) { applyAiKey(parsed); return; }
          kbShowInput = true; kbHint = 'A vágólapon nem a link volt – illeszd be ide:';
        } catch {
          kbShowInput = true; kbHint = 'Illeszd be ide a kapott linket vagy kulcsot:';
        }
        renderKeyBanners();
        $('kbInput')?.focus();
      });
    }
    return;
  }
  // Keep the link available across reloads until copying succeeds or the user dismisses the tip.
  box.innerHTML = '<div class="kbtop"><span class="kbtxt">iPhone-on telepítés után egyszer illeszd be újra a linket</span>' +
    '<button type="button" class="kbclose" id="kbClose" aria-label="Bezárás">×</button></div>' +
    '<div class="kbacts"><button type="button" class="primary" id="kbCopy">Link másolása</button></div>';
  const finish = () => { ai.finishKeyCopy(baseUrl, copyLink); renderKeyBanners(); };
  $('kbClose').addEventListener('click', finish);
  $('kbCopy').addEventListener('click', async () => {
    const ok = await copyText(copyLink);
    if (ok) { finish(); setStatus('Link másolva. Telepítés után illeszd be a Kosárba.'); }
    else setStatus('A másolás nem sikerült. Másold ki a kapott linket az üzenetből.');
  });
}

// ---- live shared lists (swappable SyncProvider) -----------------------------
const LS_DEVICE_ID = 'bv.deviceId', LS_SYNC_PENDING = 'bv.syncPending';
let deviceId = '';
try { deviceId = localStorage.getItem(LS_DEVICE_ID) || ''; } catch { /* blocked */ }
if (!deviceId) {
  deviceId = uid();
  try { localStorage.setItem(LS_DEVICE_ID, deviceId); } catch { /* blocked */ }
}

let pendingSync = {};
try { pendingSync = JSON.parse(localStorage.getItem(LS_SYNC_PENDING) || '{}') || {}; } catch { pendingSync = {}; }
function savePendingSync() {
  try { localStorage.setItem(LS_SYNC_PENDING, JSON.stringify(pendingSync)); } catch { /* blocked */ }
}

let syncProvider = null, syncConnectPromise = null;
const syncStates = new Map(); // shareId -> 'synced' | 'offline' | 'syncing'
const syncUnsubs = new Map(); // shareId -> () => void
const syncFlushTimers = new Map(); // shareId -> timer id

async function ensureSyncProvider() {
  if (!FIREBASE_CONFIG) return null;
  if (!syncProvider) syncProvider = createFirebaseProvider();
  if (!syncConnectPromise) {
    syncConnectPromise = syncProvider.connect(FIREBASE_CONFIG).catch((err) => {
      syncConnectPromise = null;
      throw err;
    });
  }
  await syncConnectPromise;
  return syncProvider;
}

function ensurePendingBucket(shareId) {
  if (!pendingSync[shareId]) pendingSync[shareId] = { upserts: {}, deletes: {} };
  if (!pendingSync[shareId].upserts) pendingSync[shareId].upserts = {};
  if (!pendingSync[shareId].deletes) pendingSync[shareId].deletes = {};
  return pendingSync[shareId];
}

function findSharedList(listId) {
  const l = lists.find((x) => x.id === listId);
  return l && l.shareId ? l : null;
}

const LS_ACCOUNT_PENDING = 'bv.accountSyncPending';
const accountSync = createAccountSyncManager({
  provider: createFirebaseAccountProvider(),
  deviceId,
  getState: () => ({ lists, items }),
  applyState: ({ lists: nextLists, items: nextItems }) => {
    lists = migrateToLists(nextLists, nextItems);
    items = nextItems;
    ensureActiveList();
    persist();
    render();
    kickEnrich();
  },
  loadPending: () => {
    try { return JSON.parse(localStorage.getItem(LS_ACCOUNT_PENDING) || '{}') || {}; } catch { return {}; }
  },
  savePending: (p) => {
    try { localStorage.setItem(LS_ACCOUNT_PENDING, JSON.stringify(p)); } catch { /* blocked */ }
  },
  isOnline: () => navigator.onLine && Boolean(FIREBASE_CONFIG),
  onAuthState: () => {
    updateAccountMenuUi();
  },
  onSharedListAdded: async (l) => {
    if (!l?.shareId || !FIREBASE_CONFIG || !navigator.onLine) return;
    try {
      const prov = await ensureSyncProvider();
      if (!prov) return;
      const snapshot = await prov.joinSharedList(l.shareId);
      const cur = lists.find((x) => x.id === l.id && x.shareId === l.shareId);
      if (cur) {
        applyRemoteSnapshot(cur, snapshot);
        await subscribeSharedList(cur);
      }
    } catch { /* offline or unavailable */ }
  },
});

let accountConnectPromise = null;
async function ensureAccountSync() {
  if (!FIREBASE_CONFIG) return null;
  if (!accountConnectPromise) {
    accountConnectPromise = accountSync.connect(FIREBASE_CONFIG).catch((err) => {
      accountConnectPromise = null;
      throw err;
    });
  }
  await accountConnectPromise;
  return accountSync;
}

function queueItemSync(it) {
  if (!it || !it.id) return;
  const now = Date.now();
  it.updatedAt = now;
  it.updatedBy = deviceId;
  const rawList = lists.find((x) => x.id === it.list);
  accountSync.queueItem(it, rawList);
  const l = findSharedList(it.list);
  if (!l) return;
  const norm = normalizeSharedItem(it, { updatedAt: now, updatedBy: deviceId });
  if (!norm) return;
  const bucket = ensurePendingBucket(l.shareId);
  bucket.upserts[it.id] = norm;
  delete bucket.deletes[it.id];
  savePendingSync();
  scheduleSyncFlush(l.shareId);
}

function queueDeleteSync(listId, itemId) {
  if (!itemId) return;
  const rawList = lists.find((x) => x.id === listId);
  accountSync.queueItemDelete(listId, itemId, rawList);
  const l = findSharedList(listId);
  if (!l) return;
  const bucket = ensurePendingBucket(l.shareId);
  bucket.deletes[itemId] = { id: itemId, deletedAt: Date.now(), deletedBy: deviceId };
  delete bucket.upserts[itemId];
  savePendingSync();
  scheduleSyncFlush(l.shareId);
}

function queueMetaSync(l) {
  if (!l) return;
  accountSync.queueListMeta(l);
  if (!l.shareId) return;
  const bucket = ensurePendingBucket(l.shareId);
  bucket.meta = { name: l.name, repeat: l.repeat || 'none', weekday: l.weekday ?? 1, color: l.color || '', place: normalizeListPlace(l.place), updatedAt: Date.now() };
  savePendingSync();
  scheduleSyncFlush(l.shareId);
}

function scheduleSyncFlush(shareId) {
  if (!navigator.onLine || !FIREBASE_CONFIG) {
    syncStates.set(shareId, 'offline');
    return;
  }
  clearTimeout(syncFlushTimers.get(shareId));
  syncFlushTimers.set(shareId, setTimeout(() => { flushPendingSync(shareId); }, 120));
}

async function flushPendingSync(shareId) {
  const bucket = pendingSync[shareId];
  const hasWork = bucket && (bucket.meta || Object.keys(bucket.upserts || {}).length || Object.keys(bucket.deletes || {}).length);
  if (!hasWork) {
    syncStates.set(shareId, navigator.onLine && FIREBASE_CONFIG ? 'synced' : 'offline');
    return;
  }
  if (!navigator.onLine || !FIREBASE_CONFIG) {
    syncStates.set(shareId, 'offline');
    render();
    return;
  }
  const sentMeta = bucket.meta ? { ...bucket.meta } : null;
  const sentUpserts = Object.values(bucket.upserts || {});
  const sentDeletes = Object.values(bucket.deletes || {});
  syncStates.set(shareId, 'syncing');
  try {
    const prov = await ensureSyncProvider();
    if (!prov) { syncStates.set(shareId, 'offline'); render(); return; }
    await prov.pushChanges(shareId, {
      ...(sentMeta ? { meta: sentMeta } : {}),
      upserts: sentUpserts,
      deletes: sentDeletes,
    });
    const cur = pendingSync[shareId];
    if (cur) {
      if (sentMeta && cur.meta?.updatedAt === sentMeta.updatedAt) delete cur.meta;
      for (const u of sentUpserts) {
        if (cur.upserts?.[u.id]?.updatedAt === u.updatedAt) delete cur.upserts[u.id];
      }
      for (const d of sentDeletes) {
        if (cur.deletes?.[d.id]?.deletedAt === d.deletedAt) delete cur.deletes[d.id];
      }
      if (!cur.meta && !Object.keys(cur.upserts || {}).length && !Object.keys(cur.deletes || {}).length) {
        delete pendingSync[shareId];
      }
      savePendingSync();
    }
    syncStates.set(shareId, 'synced');
  } catch {
    syncStates.set(shareId, 'offline');
  }
  render();
}

function applyRemoteSnapshot(list, snapshot) {
  if (!list || !snapshot) return;
  let changed = false;
  if (snapshot.meta && typeof snapshot.meta === 'object') {
    const nextName = typeof snapshot.meta.name === 'string' && snapshot.meta.name.trim()
      ? snapshot.meta.name.trim().slice(0, 80) : list.name;
    const nextRepeat = ['none', 'daily', 'weekly'].includes(snapshot.meta.repeat) ? snapshot.meta.repeat : list.repeat;
    const nextWeekday = Number.isInteger(snapshot.meta.weekday) ? snapshot.meta.weekday : list.weekday;
    const nextColor = typeof snapshot.meta.color === 'string' && snapshot.meta.color.trim()
      ? snapshot.meta.color.trim().slice(0, 20)
      : (snapshot.meta.color === '' ? null : (list.color || null));
    const nextPlace = 'place' in snapshot.meta ? normalizeListPlace(snapshot.meta.place) : normalizeListPlace(list.place);
    if (list.name !== nextName || list.repeat !== nextRepeat || list.weekday !== nextWeekday || (list.color || null) !== nextColor || JSON.stringify(list.place ?? null) !== JSON.stringify(nextPlace)) {
      list.name = nextName;
      list.repeat = nextRepeat;
      list.weekday = nextWeekday;
      list.color = nextColor;
      list.place = nextPlace;
      changed = true;
    }
  }

  const localItems = {};
  for (const it of Object.values(items)) {
    if (it && it.list === list.id) {
      const norm = normalizeSharedItem(it, { updatedAt: it.updatedAt || 0, updatedBy: it.updatedBy || '' });
      if (norm) localItems[norm.id] = norm;
    }
  }
  const bucket = pendingSync[list.shareId] || {};
  for (const [id, u] of Object.entries(bucket.upserts || {})) localItems[id] = u;
  const localTombs = { ...(bucket.deletes || {}) };

  const merged = mergeSharedState(
    { items: localItems, tombstones: localTombs },
    { items: snapshot.items || {}, tombstones: snapshot.tombstones || {} },
  );

  for (const [id, win] of Object.entries(merged.items)) {
    const existing = items[id];
    if (existing) {
      const same = existing.hu === win.hu && existing.de === win.de && (existing.qty || '') === win.qty &&
        (existing.brand || '') === win.brand && (existing.type || '') === win.type && (existing.group || 'kell') === win.group &&
        normalizeCount(existing.count) === win.count && Boolean(existing.done) === win.done &&
        (existing.order || 0) === win.order && (existing.updatedAt || 0) === win.updatedAt &&
        (existing.updatedBy || '') === win.updatedBy && existing.list === list.id;
      if (!same) {
        Object.assign(existing, win, { list: list.id });
        changed = true;
      }
    } else {
      const lp = listPlace(list);
      items[id] = { ...win, list: list.id, ...(lp !== 'none' ? { offerPlace: placeKey(lp) } : {}) };
      changed = true;
    }
  }
  for (const [id, it] of Object.entries(items)) {
    if (it && it.list === list.id && !merged.items[id]) {
      delete items[id];
      changed = true;
    }
  }

  syncStates.set(list.shareId, navigator.onLine ? 'synced' : 'offline');
  if (changed) {
    persist();
    render();
    kickEnrich();
  } else {
    render();
  }
}

async function subscribeSharedList(list) {
  if (!list || !list.shareId || !FIREBASE_CONFIG || !navigator.onLine) return;
  if (syncUnsubs.has(list.shareId)) return;
  try {
    const prov = await ensureSyncProvider();
    if (!prov) return;
    const unsub = await prov.subscribe(list.shareId, (snapshot) => {
      const cur = lists.find((x) => x.id === list.id && x.shareId === list.shareId);
      if (cur) applyRemoteSnapshot(cur, snapshot);
    });
    syncUnsubs.set(list.shareId, unsub);
    await flushPendingSync(list.shareId);
  } catch {
    syncStates.set(list.shareId, 'offline');
  }
}

async function initSharedLists() {
  if (!FIREBASE_CONFIG || !navigator.onLine) return;
  for (const l of lists) {
    if (l.shareId) await subscribeSharedList(l);
  }
}

async function shareLiveLink(l) {
  const link = buildDeepLink(location.href, 'join', l.shareId);
  if (navigator.share) {
    try { await navigator.share({ title: l.name + ' (közös lista)', text: l.name + ' – közös bevásárlólista', url: link }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const ok = await copyText(link);
  setStatus(ok ? 'Közös lista link másolva a vágólapra.' : 'A link másolása nem sikerült.');
}

// ---- multiple lists (create / edit / send / delete / incoming #list=) -------
let menuListId = null, editingListId = null, pendingShareList = null, pendingJoinShare = null;

function openListMenu(listId) {
  const l = lists.find((x) => x.id === listId);
  if (!l) return;
  menuListId = l.id;
  $('lmTitle').textContent = l.name;
  const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
  const hasDone = visible().some((i) => (i.list || fallbackId) === l.id && i.done);
  $('lmShareLiveSub').textContent = !FIREBASE_CONFIG
    ? 'A közös lista még nincs beállítva'
    : l.shareId
      ? 'meghívó link megosztása'
      : 'valós idejű szinkron másik telefonnal';
  $('lmLeaveLive').hidden = !l.shareId;
  $('lmClearDone').hidden = !hasDone;
  $('lmDelete').hidden = lists.length < 2;
  $('listMenu').showModal();
}
$('lmShareLive').addEventListener('click', async () => {
  const l = lists.find((x) => x.id === menuListId);
  $('listMenu').close();
  if (!l) return;
  if (!FIREBASE_CONFIG) {
    setStatus('A közös lista még nincs beállítva');
    return;
  }
  if (l.shareId) {
    await shareLiveLink(l);
    return;
  }
  if (!navigator.onLine) {
    setStatus('A közös lista létrehozásához internetkapcsolat kell.');
    return;
  }
  try {
    setStatus('Közös lista létrehozása…');
    const prov = await ensureSyncProvider();
    const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
    const now = Date.now();
    const listItems = visible().filter((i) => (i.list || fallbackId) === l.id).map((it) => {
      it.updatedAt = it.updatedAt || now;
      it.updatedBy = it.updatedBy || deviceId;
      return normalizeSharedItem(it, { updatedAt: now, updatedBy: deviceId });
    }).filter(Boolean);
    const { shareId } = await prov.createSharedList({ name: l.name, repeat: l.repeat, weekday: l.weekday, color: l.color || '', place: normalizeListPlace(l.place), createdAt: now }, listItems);
    l.shareId = shareId;
    syncStates.set(shareId, 'synced');
    accountSync.queueListMeta(l);
    persist();
    render();
    await subscribeSharedList(l);
    await shareLiveLink(l);
  } catch {
    setStatus('A közös lista létrehozása nem sikerült.');
  }
});
$('lmLeaveLive').addEventListener('click', async () => {
  const l = lists.find((x) => x.id === menuListId);
  $('listMenu').close();
  if (!l || !l.shareId) return;
  const sid = l.shareId;
  const unsub = syncUnsubs.get(sid);
  if (unsub) { unsub(); syncUnsubs.delete(sid); }
  clearTimeout(syncFlushTimers.get(sid));
  syncFlushTimers.delete(sid);
  syncStates.delete(sid);
  delete pendingSync[sid];
  savePendingSync();
  delete l.shareId;
  accountSync.queueListMeta(l);
  for (const it of Object.values(items)) {
    if (it && it.list === l.id) accountSync.queueItem(it, l);
  }
  persist();
  render();
  if (syncProvider) { try { await syncProvider.leave(sid); } catch { /* ignore */ } }
  setStatus('Kiléptél a közös listából.');
});
$('lmClose').addEventListener('click', () => $('listMenu').close());
$('lmEdit').addEventListener('click', () => { $('listMenu').close(); openListDialog(menuListId); });
$('lmClearDone').addEventListener('click', () => {
  $('listMenu').close();
  const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
  const gone = visible().filter((i) => (i.list || fallbackId) === menuListId && i.done);
  for (const it of gone) remove(it.id);
  setStatus(gone.length + ' kipipált tétel törölve.');
});
$('lmDelete').addEventListener('click', () => {
  if (lists.length < 2) return;
  const idx = lists.findIndex((x) => x.id === menuListId);
  if (idx < 0) return;
  const [removed] = lists.splice(idx, 1);
  $('listMenu').close();
  for (const it of Object.values(items)) {
    if (it.list === removed.id) remove(it.id);
  }
  accountSync.queueListDelete(removed.id);
  if (lists.length === 1) {
    lists[0].collapsed = false;
    activeListId = lists[0].id;
  } else if (activeListId === removed.id) {
    activeListId = lists[0].id;
  }
  persist(); render();
  setStatus('Lista törölve: ' + removed.name);
});
$('lmSend').addEventListener('click', async () => {
  const l = lists.find((x) => x.id === menuListId);
  $('listMenu').close();
  if (!l) return;
  const fallbackId = lists[0]?.id || DEFAULT_LIST_ID;
  const listItems = visible().filter((i) => (i.list || fallbackId) === l.id);
  const link = encodeShareList(l, listItems, location.href);
  if (navigator.share) {
    try { await navigator.share({ title: l.name, text: l.name + ' (' + listItems.length + ' tétel)', url: link }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const ok = await copyText(link);
  setStatus(ok ? 'Megosztási link másolva a vágólapra.' : 'A link másolása nem sikerült.');
});

let selectedListColor = null;
function renderListColorPicker() {
  $('ldColorDefault').setAttribute('aria-pressed', String(!selectedListColor));
  renderSwatchGroups($('ldColorSwatches'), selectedListColor, themeMode, (id) => {
    selectedListColor = id;
    renderListColorPicker();
  });
}
$('ldColorDefault').addEventListener('click', () => {
  selectedListColor = null;
  renderListColorPicker();
});

function syncRepeatDayVisibility() {
  $('ldDayWrap').hidden = $('ldRepeat').value !== 'weekly';
}
function syncListPlaceVisibility() {
  const isCustom = $('ldPlaceMode').value === 'custom';
  $('ldPlaceCustom').hidden = !isCustom;
  $('ldPlaceName').required = isCustom;
}
$('ldRepeat').addEventListener('change', syncRepeatDayVisibility);
$('ldPlaceMode').addEventListener('change', syncListPlaceVisibility);
$('ldPlaceCountry').addEventListener('change', () => {
  const l = editingListId ? lists.find((x) => x.id === editingListId) : null;
  const base = l?.place && typeof l.place === 'object' ? l.place : shoppingPlace;
  $('ldPlaceName').value = $('ldPlaceCountry').value === base.country ? base.place : '';
});
function openListDialog(listId) {
  editingListId = listId;
  const l = listId ? lists.find((x) => x.id === listId) : null;
  $('ldTitle').textContent = l ? 'Lista beállításai' : 'Új lista';
  $('ldName').value = l ? l.name : '';
  $('ldRepeat').value = l ? (l.repeat || 'none') : 'none';
  $('ldWeekday').value = String(l && Number.isInteger(l.weekday) ? l.weekday : 1);
  selectedListColor = l?.color || null;
  const lp = normalizeListPlace(l?.place);
  if (lp === 'none') {
    $('ldPlaceMode').value = 'none';
    $('ldPlaceCountry').value = shoppingPlace.country;
    $('ldPlaceName').value = shoppingPlace.place;
    $('ldPlaceRadius').value = String(shoppingPlace.radius);
  } else if (lp) {
    $('ldPlaceMode').value = 'custom';
    $('ldPlaceCountry').value = lp.country;
    $('ldPlaceName').value = lp.place;
    $('ldPlaceRadius').value = String(lp.radius);
  } else {
    $('ldPlaceMode').value = 'default';
    $('ldPlaceCountry').value = shoppingPlace.country;
    $('ldPlaceName').value = shoppingPlace.place;
    $('ldPlaceRadius').value = String(shoppingPlace.radius);
  }
  renderListColorPicker();
  syncRepeatDayVisibility();
  syncListPlaceVisibility();
  $('listDialog').showModal();
  $('ldName').focus();
}
$('ldCancel').addEventListener('click', () => $('listDialog').close());
$('ldForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('ldName').value.trim().slice(0, 80);
  if (!name) { $('ldName').focus(); return; }
  const repeat = $('ldRepeat').value;
  const weekday = Number($('ldWeekday').value);
  const placeMode = $('ldPlaceMode').value;
  let place = null;
  if (placeMode === 'none') {
    place = 'none';
  } else if (placeMode === 'custom') {
    place = normalizePlace({
      country: $('ldPlaceCountry').value,
      place: $('ldPlaceName').value,
      radius: Number($('ldPlaceRadius').value),
    });
    if (!place) { $('ldPlaceName').focus(); return; }
  }
  if (editingListId) {
    const l = lists.find((x) => x.id === editingListId);
    let placeChanged = false;
    if (l) {
      const wasNone = !l.repeat || l.repeat === 'none';
      placeChanged = JSON.stringify(l.place ?? null) !== JSON.stringify(place);
      l.name = name;
      l.repeat = repeat;
      l.weekday = weekday;
      l.color = selectedListColor || null;
      l.place = place;
      if (repeat !== 'none' && (wasNone || !l.lastReset)) l.lastReset = Date.now();
      queueMetaSync(l);
    }
    $('listDialog').close();
    if (placeChanged) typingCands.clear();
    persist(); render();
    if (placeChanged) kickOffers();
    setStatus('Lista mentve: ' + name);
  } else {
    const nl = normalizeList({
      id: uid(),
      name,
      collapsed: false,
      repeat,
      weekday,
      lastReset: repeat !== 'none' ? Date.now() : 0,
      color: selectedListColor || null,
      place,
    });
    lists.push(nl);
    accountSync.queueListMeta(nl);
    $('listDialog').close();
    focusList(nl.id);
    setStatus('Új lista létrehozva: ' + name);
  }
});

$('scShareNo').addEventListener('click', () => { pendingShareList = null; $('shareConfirm').close(); });
$('scShareYes').addEventListener('click', () => {
  const data = pendingShareList;
  pendingShareList = null;
  $('shareConfirm').close();
  if (!data) return;
  const nl = normalizeList({ id: uid(), name: data.name, collapsed: false, repeat: 'none', weekday: 1, lastReset: 0 });
  lists = addIncomingList(lists, items, nl).lists;
  accountSync.queueListMeta(nl);
  const baseOrder = Date.now();
  const lp = listPlace(nl);
  data.items.forEach((raw, idx) => {
    const id = uid();
    items[id] = applyBrand({
      id,
      list: nl.id,
      hu: raw.hu,
      de: raw.de,
      qty: raw.qty,
      count: normalizeCount(raw.count),
      brand: raw.brand,
      group: raw.group,
      done: false,
      order: baseOrder + idx,
      ...(lp !== 'none' ? { offerPlace: placeKey(lp) } : {}),
    });
    accountSync.queueItem(items[id], nl);
  });
  focusList(nl.id);
  kickEnrich();
  setStatus('Lista hozzáadva: ' + nl.name + ' (' + data.items.length + ' tétel)');
});

$('jcNo').addEventListener('click', () => { pendingJoinShare = null; $('joinConfirm').close(); });
$('jcYes').addEventListener('click', async () => {
  const pending = pendingJoinShare;
  pendingJoinShare = null;
  $('joinConfirm').close();
  if (!pending) return;
  const { shareId, snapshot } = pending;
  const existing = lists.find((x) => x.shareId === shareId);
  if (existing) {
    applyRemoteSnapshot(existing, snapshot);
    focusList(existing.id);
    await subscribeSharedList(existing);
    return;
  }
  const meta = snapshot.meta || {};
  const nl = normalizeList({
    id: uid(),
    name: meta.name || DEFAULT_LIST_NAME,
    collapsed: false,
    repeat: meta.repeat || 'none',
    weekday: Number.isInteger(meta.weekday) ? meta.weekday : 1,
    lastReset: 0,
    color: typeof meta.color === 'string' && meta.color.trim() ? meta.color.trim().slice(0, 20) : null,
    place: normalizeListPlace(meta.place),
    shareId,
  });
  lists = addIncomingList(lists, items, nl).lists;
  accountSync.queueListMeta(nl);
  applyRemoteSnapshot(nl, snapshot);
  focusList(nl.id);
  await subscribeSharedList(nl);
  setStatus('Csatlakoztál a közös listához: ' + nl.name);
});

// An import/share/join/ai link carries its payload in the query string (?join=, ?list=, ?import=, ?ai=),
// with legacy URL fragment (#...) support as a fallback for older links.
function handleDeepLink() {
  const link = parseDeepLink(location.search, location.hash);
  if (!link) return;
  const cleanUrl = stripDeepLinkFromUrl(location.pathname, location.search, location.hash, link);
  if (link.type === 'join') {
    const shareId = link.value;
    history.replaceState(null, '', cleanUrl);
    if (!isValidShareId(shareId)) {
      setStatus('A közös lista linkje hibás.');
      return;
    }
    const existing = lists.find((x) => x.shareId === shareId);
    if (existing) {
      focusList(existing.id);
      setStatus('Ez a közös lista már megvan: ' + existing.name);
      return;
    }
    if (!FIREBASE_CONFIG) {
      setStatus('A közös lista még nincs beállítva');
      return;
    }
    (async () => {
      try {
        setStatus('Közös lista betöltése…');
        const prov = await ensureSyncProvider();
        const snapshot = await prov.joinSharedList(shareId);
        pendingJoinShare = { shareId, snapshot };
        const name = snapshot.meta?.name || DEFAULT_LIST_NAME;
        $('jcMsg').textContent = name + ' közös lista. Csatlakozol?';
        $('joinConfirm').showModal();
      } catch {
        setStatus('A közös lista nem található vagy nincs net.');
      }
    })();
    return;
  }
  if (link.type === 'ai') {
    const parsed = parseAiInput(link.raw);
    if (parsed) {
      if (applyAiKey(parsed, { copyPending: true })) {
        history.replaceState(null, '', cleanUrl);
      }
      return;
    }
    return;
  }
  if (link.type === 'list') {
    const parsed = decodeShareList(link.raw);
    history.replaceState(null, '', cleanUrl);
    if (!parsed) {
      setStatus('A megosztott lista linkje hibás vagy túl nagy.');
      return;
    }
    pendingShareList = parsed;
    $('scShareMsg').textContent = parsed.name + ' lista érkezett, ' + parsed.items.length + ' tétel. Hozzáadod?';
    $('shareConfirm').showModal();
    return;
  }
  if (link.type === 'import') {
    if (!/^[A-Za-z0-9_-]+$/.test(link.value)) return;
    history.replaceState(null, '', cleanUrl);
    try {
      const b64 = link.value.replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      openImport(new TextDecoder().decode(bytes), true);
    } catch { setStatus('Az import-link hibás.'); }
  }
}

// Photos shared into the app (Android share sheet -> Kosár) are parked by the
// service worker in a cache; pick them up and add them like a new photo.
async function takeShared() {
  if (!new URLSearchParams(location.search).has('shared')) return;
  history.replaceState(null, '', location.pathname);
  try {
    const c = await caches.open('kosar-share');
    for (const req of await c.keys()) { const r = await c.match(req); await c.delete(req); if (r) await addPhotoItem(await resizeImage(await r.blob())); }
  } catch { setStatus('A megosztott képet nem tudtam átvenni.'); }
}

let statusTimer;
function setStatus(t) { $('status').textContent = t || ''; clearTimeout(statusTimer); statusTimer = setTimeout(() => ($('status').textContent = ''), 6000); }

// ---- lifecycle ------------------------------------------------------------------
window.addEventListener('online', () => { onlineSince = Date.now(); setNet(); initSharedLists(); ensureAccountSync().then((m) => m?.handleOnline()).catch(() => {}); kickEnrich(); kickRecognize(); kickOffers(); });
window.addEventListener('offline', () => { setNet(); for (const l of lists) if (l.shareId) syncStates.set(l.shareId, 'offline'); render(); });
window.addEventListener('hashchange', handleDeepLink); // import link opened while the app is already open
window.addEventListener('popstate', handleDeepLink);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    const res = applyListResets(lists, items);
    if (res.changed) {
      for (const lid of res.resetListIds) {
        const l = findSharedList(lid);
        if (l) for (const it of Object.values(items)) if (it && it.list === lid) queueItemSync(it);
      }
      persist(); render();
    }
    kickEnrich(); kickRecognize(); kickOffers();
  }
});
window.addEventListener('storage', (e) => {
  if (e.key === LS_ITEMS) { try { items = JSON.parse(e.newValue || '{}'); } catch { /* keep */ } render(); }
  if (e.key === LS_LISTS) { try { const l = JSON.parse(e.newValue || 'null'); if (Array.isArray(l)) lists = migrateToLists(l, items); } catch { /* keep */ } render(); }
});
setInterval(() => { if (!document.hidden) { kickEnrich(); kickRecognize(); kickOffers(); } }, RETRY_MS);
// Review: at every open and every hour while the app is open, whatever is missing
// (German name, brand, picture, link, price) is asked for again. A phone does not
// run a closed web app on a schedule, so this is "on open + hourly while open".
const LS_REVIEW = 'bv.reviewAt', REVIEW_MS = 3600e3;
function review(force = false) {
  let last = 0; try { last = Number(localStorage.getItem(LS_REVIEW)) || 0; } catch { /* blocked */ }
  if (!force && Date.now() - last < REVIEW_MS) return;
  for (const it of Object.values(items)) {
    if (!(it.hu || it.de)) continue;
    const missing = !it.de || !it.hu || !pics(it) || !it.offer?.link || !(it.offer?.price || it.myPrice);
    if (missing) { it.offerAsked = 0; if (it.offer && !it.offer.link) it.offer.at = 0; if (it.enrich && !it.enrich.complete) it.enrich.at = 0; }
  }
  try { localStorage.setItem(LS_REVIEW, String(Date.now())); } catch { /* blocked */ }
  persist(); kickEnrich(); kickRecognize(); kickOffers();
}
setInterval(() => { if (!document.hidden) review(); }, 5 * 60e3);
document.addEventListener('visibilitychange', () => { if (!document.hidden) review(); });
render(); setNet(); handleDeepLink(); renderKeyBanners(); initSharedLists(); if (FIREBASE_CONFIG && navigator.onLine) ensureAccountSync().catch(() => {});
if (!settings && !$("importer").open && !$('shareConfirm').open && !$('joinConfirm').open) openShoppingPlace();
// A shared list arriving on a fresh phone asks first; the place question follows once it is answered.
$('shareConfirm').addEventListener('close', () => { if (!settings) openShoppingPlace(); });
$('joinConfirm').addEventListener('close', () => { if (!settings) openShoppingPlace(); });
loadDurable().then(() => { kickEnrich(); return loadPhotos(); }).then(() => { takeShared(); kickRecognize(); review(true); });

if ('serviceWorker' in navigator) {
  // A new version takes over in the background; reload once so the whole page is
  // the new version (only when an older worker was in control, not on first install).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    if ($('editor').open || $('brandSheet').open || $('importer').open || $('scanner').open || $('photoSheet').open || $('aiKeyDialog').open || $('listDialog').open || $('listMenu').open || $('themeDialog').open || $('shareConfirm').open || $('joinConfirm').open) return; // never lose an open form
    reloaded = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
