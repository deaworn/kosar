// Kosár, phone-only build: a static PWA. The list lives only in this phone's
// storage (localStorage, own photos in IndexedDB); there is no server and no
// account. Online, items are enriched from free keyless sources (enrich.js);
// offline that step silently waits and everything else works.
import { enrich, enrichKey, lookupBarcode } from './enrich.js';
import { applyBrand as splitInto, moveBrand, learnBrands, learnable } from './brand.js';
import { putPhoto, getPhoto, delPhoto, allPhotos, resizeImage, blobToDataUrl, dataUrlToBlob, kvPut, kvGet } from './photos.js';
import * as scanner from './scanner.js';
import * as ai from './ai.js';
import { mergeOffer } from './offer-merge.js';
import { nameCheck } from './name-check.js';
import { unitText } from './units.js';

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
const LS_ITEMS = 'bv.items', LS_SCHEMA = 'bv.schema', SCHEMA = 5;
let items = {}, savedAt = 0;
try { items = JSON.parse(localStorage.getItem(LS_ITEMS) || '{}') || {}; savedAt = Number(localStorage.getItem('bv.itemsAt')) || 0; } catch { items = {}; }
let storageOk = true, durableTimer = null;
// Two copies: localStorage (instant at start-up) and IndexedDB (durable). Every
// change goes to both; the IndexedDB write is coalesced over 300 ms.
function persist() {
  savedAt = Date.now();
  try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); localStorage.setItem('bv.itemsAt', String(savedAt)); storageOk = true; } catch { storageOk = false; }
  clearTimeout(durableTimer);
  durableTimer = setTimeout(() => { kvPut('items', { at: savedAt, items }).catch(() => {}); }, 300);
}
// At start-up: if the durable copy is newer (localStorage lost its last writes), use it.
async function loadDurable() {
  try {
    // An older page holding the database open can block the upgrade: never let that hold up the app.
    const d = await Promise.race([kvGet('items'), new Promise((_, no) => setTimeout(() => no(new Error('idb timeout')), 3000))]);
    if (d && d.items && d.at > savedAt) { items = d.items; savedAt = d.at; try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); localStorage.setItem('bv.itemsAt', String(savedAt)); } catch { /* blocked */ } render(); }
    else if (!d) kvPut('items', { at: savedAt || Date.now(), items }).catch(() => {}); // first run of this version: seed it
  } catch { /* IndexedDB unavailable: localStorage only */ }
}
// Flush the durable copy right away when the app goes to the background.
document.addEventListener('visibilitychange', () => { if (document.hidden && durableTimer) { clearTimeout(durableTimer); durableTimer = null; kvPut('items', { at: savedAt, items }).catch(() => {}); } });
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

function edit(id, patch) {
  const it = items[id] || (items[id] = { id });
  Object.assign(it, patch);
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
// drugstore brands ("Gaviscon dual", Tomi 11097).
// Items, ids and done states are never dropped. Runs after hist is loaded (learned brands).
(function migrate() {
  let v = 1;
  try { v = Number(localStorage.getItem(LS_SCHEMA)) || 1; } catch { /* storage blocked */ }
  if (v >= SCHEMA) return;
  for (const it of Object.values(items)) relabel(it);
  persist();
  try { localStorage.setItem(LS_SCHEMA, String(SCHEMA)); } catch { /* retried next start */ }
})();

function saveHistory() {
  const keys = Object.keys(hist).sort((a, b) => (hist[b].deletedAt || 0) - (hist[a].deletedAt || 0));
  for (const k of keys.slice(HISTORY_MAX)) { if (hist[k].photo) delPhoto(k).catch(() => {}); delete hist[k]; }
  try { localStorage.setItem(LS_HISTORY, JSON.stringify(hist)); } catch { /* storage full */ }
  kvPut('history', hist).catch(() => {});
}
function remove(id) {
  const it = items[id];
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
  items[id] = { ...it, done: false, order: Date.now() };
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
        res = quick ? await enrich(it, { online: false }) : await enrich(it, { online: navigator.onLine, aiName: ai.configured() ? ai.name : null });
        if (res && quick && !res.complete) res.patch.enrich.quick = true; // the network pass still has to run
      } catch { res = null; }
      const now = items[it.id];
      if (!now) continue; // deleted meanwhile
      if (now.hu !== before.hu || now.de !== before.de) continue; // edited meanwhile: run again on the new names
      if (!res) now.enrich = { key: enrichKey(now.hu, now.de), at: Date.now(), complete: true, autoVals: {}, sources: {} };
      else { Object.assign(now, res.patch); relabel(now, [now.enrich?.brand?.value]); } // the AI may have read a brand from the name
      persist(); render();
    }
  } finally { enriching = false; enrichCount = 0; setNet(); }
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

// The picture is its own button: with a photo it zooms, without one it opens the editor.
function iconHtml(it) {
  const p = pics(it);
  const svg = '<svg viewBox="0 0 24 24">' + (ICONS[it.icon] || ICONS.bag) + '</svg>';
  const img = p ? '<img src="' + esc(p.small) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'ok\')" onerror="this.remove()">' : '';
  return '<button type="button" class="icobtn" data-act="' + (p ? 'zoom' : 'edit') + '" aria-label="' + (p ? 'Kép nagyítása' : 'Szerkesztés') + '">' +
    '<span class="ico' + (p?.own ? ' own' : '') + '">' + svg + img + '</span></button>';
}

const eur = (v) => Number(v).toFixed(2).replace('.', ',') + ' €';
// "Aldi Süd 1,29 € / 200 g (11-18)": store, price, unit and the day it was read from the shop page.
// a shop price always says its unit, or that the shop did not show one (Tomi 11003); own prices keep theirs
function priceText(p, own = false) { return (p.store ? p.store + ' ' : '') + eur(p.value) + (own ? (p.unit ? ' / ' + p.unit : '') : unitText(p.unit)) + (p.date ? ' (' + String(p.date).slice(5) + ')' : ''); }
function metaHtml(it) {
  const e = it.enrich || {}, parts = [];
  // a brand only when certain: typed, from the barcode/Claude, or from the verified store page
  const brand = it.brand || it.offer?.link?.brand || '';
  if (brand) parts.push(esc(brand));
  if (it.myPrice) parts.push('<span class="price">' + esc(priceText(it.myPrice, true)) + '</span> <span class="tag">saját</span>');
  else if (it.offer?.price) parts.push('<span class="price">' + esc(priceText(it.offer.price)) + '</span>');
  else if (it.offer) parts.push('<span class="noprice">ár: nem találtam</span>');
  // Tomi's REWE price stays the main one; a cheaper verified shop is a note next to it
  if (!it.myPrice && it.offer?.price && it.offer?.alt) parts.push('<span class="note">olcsóbb: ' + esc(it.offer.alt.store + ' ' + eur(it.offer.alt.value)) + '</span>');
  // Tomi's REWE has no online price for it (the shop itself may still sell it: Tomi 11009): a note next
  // to another shop's price; with no price anywhere the row keeps "ár: nem találtam"
  if (it.offer?.price) for (const st of it.offer?.notSold || []) parts.push('<span class="note">' + esc(st) + ' online nem mutat árat</span>');
  return parts.length ? '<div class="meta">' + parts.join(' · ') + '</div>' : '';
}

function rowHtml(it) {
  const av = it.enrich?.autoVals || {};
  // Dictionary translations are reliable ("auto"); machine translations are a guess ("tipp?").
  const dict = it.enrich?.sources?.translation === 'szótár';
  // an auto-filled German name is checked against the verified shop product (Tomi 10990/10993)
  const nc = it.de && av.de === it.de ? nameCheck(it.de, it.offer) : { state: 'unchecked' };
  const autoTag = (f) => {
    if (!(it[f] && av[f] === it[f])) return '';
    if (f === 'de' && nc.state === 'ok') return '<span class="tag">✓ bolti név</span>';
    if (f === 'de' && nc.state === 'differs') return '<span class="tag est">ellenőrizd</span>';
    return '<span class="tag' + (dict ? '' : ' est') + '">' + (dict ? 'auto' : 'tipp?') + '</span>';
  };
  const g = GROUP_LABEL[it.group || 'kell'] ? '<span class="tag">' + GROUP_LABEL[it.group] + '</span>' : '';
  return '<div class="item' + (it.done ? ' done' : '') + '">' +
    '<button type="button" class="chk" data-act="toggle" aria-pressed="' + !!it.done + '" aria-label="' + esc(it.hu || it.de || 'fotós tétel') + ' kipipálása"><span class="box">' + CHECK + '</span></button>' +
    iconHtml(it) +
    '<button type="button" class="body" data-act="edit">' +
    // Without a Hungarian name (e.g. a scanned product) the German name is the title.
    '<span class="names"><div class="hu">' + (it.hu || it.de ? esc(it.hu || it.de) + autoTag(it.hu ? 'hu' : 'de')
      : it.recog === 'failed' ? '<span class="est">Nem ismertem fel: koppints, írd be</span>' : '<span class="est">Felismerésre vár…</span>') + g + '</div>' +
    (it.hu && it.de ? '<div class="de">' + esc(it.de) + autoTag('de') + '</div>' : '') + metaHtml(it) + '</span>' +
    (it.qty ? '<span class="qty">' + esc(it.qty) + '</span>' : '') + '</button></div>';
}

// Bring a just-added item into view (new items sort to the end of their section).
function reveal(id) {
  requestAnimationFrame(() => {
    const li = document.querySelector('#list li[data-id="' + CSS.escape(id) + '"]');
    if (!li) return;
    li.scrollIntoView({ block: 'center', behavior: 'smooth' });
    li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 1600);
  });
}

function render() {
  const all = visible(), total = all.length, done = all.filter((i) => i.done).length;
  $('ringtxt').textContent = done + '/' + total;
  $('bar').style.strokeDashoffset = String(150.8 * (1 - (total ? done / total : 0)));
  $('sub').innerHTML = total ? (done === total ? '<b>Minden megvan.</b> Mehetsz a kasszához.' : 'Még <b>' + (total - done) + '</b> tétel hiányzik') : 'A lista üres';
  const order = { kell: 0, havan: 1, otthon: 2 };
  const by = (a, b) => (order[a.group || 'kell'] - order[b.group || 'kell']) || ((a.order || 0) - (b.order || 0));
  const sections = [['Kell', all.filter((i) => !i.done).sort(by)], ['Megvan', all.filter((i) => i.done).sort(by)]];
  const list = $('list');
  list.innerHTML = total ? '' : '<div class="empty">Még nincs semmi a listán. Írd be lent, olvass be egy vonalkódot, vagy importáld a régi listát a ⋯ menüből.</div>';
  for (const [label, rows] of sections) {
    if (!rows.length) continue;
    const sec = document.createElement('section');
    sec.className = 'group';
    sec.innerHTML = '<h2 class="glabel">' + label + ' · ' + rows.length + '</h2><ul>' + rows.map((it) => '<li data-id="' + esc(it.id) + '">' + rowHtml(it) + '</li>').join('') + '</ul>';
    list.appendChild(sec);
  }
  $('tools').hidden = done === 0;
  $('storeWarn').hidden = storageOk;
}

$('list').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.closest('li').dataset.id, it = items[id];
  if (!it) return;
  if (btn.dataset.act === 'toggle') edit(id, { done: !it.done });
  else if (btn.dataset.act === 'zoom') openZoom(pics(it));
  else openEditor(id);
});

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
window.addEventListener('popstate', () => { if (!$('zoom').hidden) closeZoom(); });

// ---- add ----------------------------------------------------------------------
// Typing suggests earlier (deleted) items; one tap brings one back with everything.
function suggest() {
  const q = ($('inHu').value || $('inDe').value).trim().toLowerCase();
  const box = $('suggest');
  if (q.length < 2) { box.hidden = true; return; }
  const hits = Object.entries(hist).filter(([, h]) => ((h.hu || '') + ' ' + (h.de || '') + ' ' + (h.brand || '')).toLowerCase().includes(q))
    .sort((a, b) => (b[1].deletedAt || 0) - (a[1].deletedAt || 0)).slice(0, 4);
  box.innerHTML = hits.map(([id, h]) => '<button type="button" class="sug" data-id="' + esc(id) + '"><b>' + esc(h.hu || h.de) + '</b><span>' + esc([h.de && h.hu ? h.de : '', h.brand].filter(Boolean).join(' · ')) + '</span><i>korábbi</i></button>').join('');
  box.hidden = !hits.length;
}
$('inHu').addEventListener('input', suggest); $('inDe').addEventListener('input', suggest);
$('suggest').addEventListener('click', (ev) => {
  const b = ev.target.closest('button.sug'); if (!b) return;
  restore(b.dataset.id); $('inHu').value = ''; $('inDe').value = ''; $('suggest').hidden = true;
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

$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const hu = $('inHu').value.trim(), de = $('inDe').value.trim();
  if (!hu && !de) { $('inHu').focus(); return; }
  const r = applyBrand({ hu, de, qty: '', brand: '', group: 'kell', done: false, order: Date.now() });
  const nid = uid(); edit(nid, r); reveal(nid);
  $('inHu').value = ''; $('inDe').value = ''; $('suggest').hidden = true;
  setStatus('Felírva: ' + (r.hu || r.de) + (r.brand ? ' (márka: ' + r.brand + ')' : '') + (navigator.onLine ? '' : ' (a német név és a fotó netre vár)'));
  $('inHu').focus();
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
  $('edPrice').value = it.myPrice ? String(it.myPrice.value).replace('.', ',') : ''; $('edStore').value = it.myPrice?.store || '';
  $('edPrice').placeholder = it.offer?.price ? eur(it.offer.price.value) + ' (gép)' : 'pl. 1,29';
  $('edDelete').hidden = !id;
  const e = (id ? it.enrich : d?.enrich) || {}, lines = [];
  // old items may carry a search-page link from earlier versions: only an exact product (barcode) link is shown
  const link = /vonalkód/.test(e.link?.source || '') ? safeUrl(e.link?.url) : '';
  if (d?.barcode || it.barcode) lines.push('Vonalkód: ' + esc(d?.barcode || it.barcode) + (d?.note ? ' <span class="est">(' + esc(d.note) + ')</span>' : ''));
  if (id && it.recogSrc) lines.push('Felismerés: ' + esc(it.recogSrc) + ' <span class="est">(javaslat, javítható)</span>');
  if (id && it.alts?.length) lines.push('Más javaslat: ' + it.alts.map((c, i) => '<button type="button" class="ghost take alt" data-i="' + i + '">' + esc(c.hu || c.de) + (c.brand ? ' · ' + esc(c.brand) : '') + '</button>').join(' '));
  const of = id ? it.offer : null;
  if (of?.price) lines.push('Ár: <b>' + esc(priceText(of.price)) + '</b>' + (of.price.base ? ' · ' + esc(of.price.base) : '') + ' <span class="note">(a bolti oldalról, ' + esc(of.price.date) + ')</span>');
  else if (of) lines.push('Ár: nem találtam <span class="note">(ellenőrizve ' + esc(String(of.checked || '').slice(0, 10)) + ')</span>');
  for (const st of of?.notSold || []) lines.push(esc(st) + ': <span class="est">online nem mutat árat</span> <span class="note">(a boltban lehet, hogy kapható)</span>');
  if (of?.link && safeUrl(of.link.url)) lines.push('<a href="' + esc(of.link.url) + '" target="_blank" rel="noopener noreferrer">Termékoldal: ' + esc(of.link.store) + '</a> <span class="note">(ellenőrzött)</span>');
  if (of?.price && of?.alt) lines.push('Olcsóbb máshol: ' + (safeUrl(of.alt.url) ? '<a href="' + esc(of.alt.url) + '" target="_blank" rel="noopener noreferrer">' + esc(priceText(of.alt)) + '</a>' : esc(priceText(of.alt))) + ' <span class="note">(bolti oldal)</span>');
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
  const v = { hu: $('edHu').value.trim(), de: $('edDe').value.trim(), qty: $('edQty').value.trim(), brand: $('edBrand').value.trim(), group: $('edGroup').value };
  // own price: always wins over the machine's ("saját"); an empty field removes it
  const pv = Number($('edPrice').value.replace(',', '.').replace(/[^\d.]/g, ''));
  const myPrice = pv > 0 && pv < 10000 ? { value: Math.round(pv * 100) / 100, store: $('edStore').value.trim().slice(0, 30), date: new Date().toISOString().slice(0, 10) } : null;
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
function openPhotoSheet() {
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
$('camBtn').addEventListener('click', openPhotoSheet);
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
  const blob = sheetBlob; $('photoSheet').close();
  if (blob) await addPhotoItem(blob);
});

async function addPhotoItem(blob, extra = {}) {
  const id = uid();
  items[id] = { id, hu: '', de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now(), photo: true, recog: 'pending', ...extra };
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
  if (frame) await addPhotoItem(frame, { barcode: code });
  else { const id = uid(); items[id] = { id, hu: '', de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now(), recog: 'pending', barcode: code }; persist(); render(); kickRecognize(); }
}
$('scPhoto').addEventListener('click', async () => {
  let frame = null;
  try { frame = await resizeImage($('scVideo')); } catch { /* camera gave no frame */ }
  closeScanner();
  if (frame) await addPhotoItem(frame); else $('psCamFile').click();
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
const needsOffer = (it) => (it.hu || it.de) && !it.recog?.match?.(/pending/) && (!it.offer || it.offer.key !== offerKey(it) || Date.now() - (it.offer.at || 0) > OFFER_TTL ||
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
  try {
    for (const it of Object.values(items).filter(needsOffer).sort((a, b) => (b.order || 0) - (a.order || 0))) {
      it.offerAsked = Date.now();
      const r = await ai.offer(it);
      if (!r) break; // machine not reachable: try again later
      if (r.pending) { persist(); continue; }
      const now = items[it.id]; if (!now) continue;
      now.offer = mergeOffer(now.offer, offerKey(now), r);
      relabel(now); // the verified shop page names the brand: take it out of the name
      persist(); render();
    }
  } finally { offering = false; }
}

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
      hu: String(r.hu || '').slice(0, 120), de: String(r.de || '').slice(0, 120), qty: String(r.qty || '').slice(0, 40),
      brand: String(r.brand || '').slice(0, 60), group: ['kell', 'havan', 'otthon'].includes(r.group) ? r.group : 'kell',
      done: !!r.done, order: Number(r.order) || 0, ...(r.barcode ? { barcode: String(r.barcode).replace(/\D/g, '').slice(0, 14) } : {}),
    }));
    return { rows, photos: own && data.photos && typeof data.photos === 'object' ? data.photos : {}, hist: own && data.hist && typeof data.hist === 'object' ? data.hist : {} };
  }
  const rows = t.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
    .map((hu, i) => ({ id: '', hu: hu.slice(0, 120), de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now() + i }));
  return { rows, photos: {} };
}
async function importData({ rows, photos, hist: h = {} }) {
  for (const [id, e] of Object.entries(h)) if (!items[id] && !hist[id] && e && (e.hu || e.de)) hist[id] = e; // earlier items from a backup
  if (Object.keys(h).length) saveHistory();
  let added = 0, updated = 0, pics = 0;
  for (const r0 of rows) {
    const r = applyBrand({ ...r0 });
    const id = r.id || 'imp-' + enrichKey(r.hu, r.de);
    const cur = items[id];
    if (cur) { Object.assign(cur, r, { id }); updated++; } else { items[id] = { ...r, id }; added++; }
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
$('menuBtn').addEventListener('click', () => {
  $('aiState').textContent = ai.configured() ? 'AI-segéd (gép): ellenőrzés…' : 'AI-segéd (gép): nincs beállítva';
  $('menu').showModal();
  if (ai.configured()) { const lf = ai.lastFailure(); ai.status().then((st) => { $('aiState').textContent = 'AI-segéd (gép): ' + st + (lf ? ' · utolsó hiba: ' + lf : ''); }); }
});
$('menuClose').addEventListener('click', () => $('menu').close());
$('mImport').addEventListener('click', () => openImport());
$('mHistory').addEventListener('click', openHistory);
$('mBackup').addEventListener('click', async () => {
  $('menu').close();
  const photos = {};
  try { for (const [id, blob] of Object.entries(await allPhotos())) if (items[id] || hist[id]) photos[id] = await blobToDataUrl(blob); } catch { /* no photos */ }
  const rows = Object.values(items).map(({ enrich: _e, ...r }) => r);
  const text = JSON.stringify({ app: 'kosar', version: SCHEMA, at: new Date().toISOString(), items: rows, hist, photos });
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

// An import link carries the list in the URL fragment (#import=<base64url JSON>).
// The fragment never leaves the phone: browsers do not send it to the web host.
function hashImport() {
  const a = location.hash.match(/^#ai=([A-Za-z0-9_-]{16,200})(?:&u=([^&]+))?$/);
  if (a) {
    history.replaceState(null, '', location.pathname + location.search);
    ai.setToken(a[1], a[2] ? decodeURIComponent(a[2]) : '');
    setStatus('AI-segéd beállítva. Ellenőrzés…');
    ai.status().then((st) => setStatus('AI-segéd: ' + st + '.'));
    return;
  }
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    openImport(new TextDecoder().decode(bytes), true);
  } catch { setStatus('Az import-link hibás.'); }
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
window.addEventListener('online', () => { onlineSince = Date.now(); setNet(); kickEnrich(); kickRecognize(); kickOffers(); });
window.addEventListener('offline', setNet);
window.addEventListener('hashchange', hashImport); // import link opened while the app is already open
document.addEventListener('visibilitychange', () => { if (!document.hidden) { kickEnrich(); kickRecognize(); kickOffers(); } });
window.addEventListener('storage', (e) => { if (e.key === LS_ITEMS) { try { items = JSON.parse(e.newValue || '{}'); } catch { /* keep */ } render(); } });
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
render(); setNet(); hashImport();
loadDurable().then(() => { kickEnrich(); return loadPhotos(); }).then(() => { takeShared(); kickRecognize(); review(true); });

if ('serviceWorker' in navigator) {
  // A new version takes over in the background; reload once so the whole page is
  // the new version (only when an older worker was in control, not on first install).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    if ($('editor').open || $('importer').open || $('scanner').open || $('photoSheet').open) return; // never lose an open form
    reloaded = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
