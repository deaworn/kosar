// Kosár, phone-only build: a static PWA. The list lives only in this
// phone's storage (localStorage); there is no server and no account. Online,
// items are enriched from free keyless sources (enrich.js); offline that step
// silently waits and everything else works.
import { enrich, enrichKey } from './enrich.js';

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
const LS_ITEMS = 'bv.items';
let items = {};
try { items = JSON.parse(localStorage.getItem(LS_ITEMS) || '{}') || {}; } catch { items = {}; }
let storageOk = true;
function persist() {
  try { localStorage.setItem(LS_ITEMS, JSON.stringify(items)); storageOk = true; } catch { storageOk = false; }
}
// Ask the browser not to evict the list under storage pressure (installed PWAs usually get this).
navigator.storage?.persist?.().catch(() => {});

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function edit(id, patch) {
  const it = items[id] || (items[id] = { id });
  Object.assign(it, patch);
  persist(); render(); kickEnrich();
}
function remove(id) { delete items[id]; persist(); render(); }

// ---- enrichment queue -------------------------------------------------------------
// Runs offline too: the dictionary step needs no network. A run that missed a
// network step is retried as soon as the phone is back online, or every minute.
const RETRY_MS = 60000;
let enriching = false, enrichCount = 0, onlineSince = Date.now();
const needs = (it) => (it.hu || it.de) && (it.enrich?.key !== enrichKey(it.hu, it.de) ||
  (it.enrich && !it.enrich.complete && navigator.onLine && (it.enrich.at < onlineSince || Date.now() - it.enrich.at > RETRY_MS)));
async function kickEnrich() {
  if (enriching) return;
  enriching = true;
  try {
    for (;;) {
      const it = Object.values(items).find(needs);
      if (!it) break;
      enrichCount = Object.values(items).filter(needs).length; setNet();
      const before = { hu: it.hu, de: it.de };
      let res = null;
      try { res = await enrich(it, { online: navigator.onLine }); } catch { res = null; }
      const now = items[it.id];
      if (!now) continue; // deleted meanwhile
      if (now.hu !== before.hu || now.de !== before.de) continue; // edited meanwhile: run again on the new names
      if (!res) now.enrich = { key: enrichKey(now.hu, now.de), at: Date.now(), complete: true, autoVals: {}, sources: {} };
      else Object.assign(now, res.patch);
      persist(); render();
    }
  } finally { enriching = false; enrichCount = 0; setNet(); }
}

function setNet() {
  const n = $('net');
  const on = navigator.onLine;
  n.className = 'net ' + (!on ? 'off' : enriching ? 'busy' : 'ok');
  n.textContent = !on ? 'offline' : enriching ? 'kiegészítés… ' + (enrichCount || '') : 'online';
  n.title = !on ? 'Nincs net: a lista működik, a kiegészítés (német név, fotó) netre vár.' : 'Kiegészítés állapota';
}

// ---- render -----------------------------------------------------------------
function visible() { return Object.values(items).filter((i) => i.hu || i.de); }

function iconHtml(it) {
  const photo = safeUrl(it.enrich?.photo?.url);
  const svg = '<svg viewBox="0 0 24 24">' + (ICONS[it.icon] || ICONS.bag) + '</svg>';
  const img = photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onload="this.classList.add(\'ok\')" onerror="this.remove()">' : '';
  return '<span class="ico" aria-hidden="true">' + svg + img + '</span>';
}

function metaHtml(it) {
  const e = it.enrich || {}, parts = [];
  if (it.brand) parts.push(esc(it.brand));
  else if (e.brand?.value) parts.push('<span class="est">márka? ' + esc(e.brand.value) + '</span>');
  if (e.price?.text) parts.push('<span class="est">' + esc(e.price.text) + '</span>');
  if (e.store?.value) parts.push('<span class="est">' + esc(e.store.value) + '</span>');
  return parts.length ? '<div class="meta">' + parts.join(' · ') + '</div>' : '';
}

function rowHtml(it) {
  const av = it.enrich?.autoVals || {};
  // Dictionary translations are reliable ("auto"); machine translations are a guess ("tipp?").
  const dict = it.enrich?.sources?.translation === 'szótár';
  const autoTag = (f) => (it[f] && av[f] === it[f] ? '<span class="tag' + (dict ? '' : ' est') + '">' + (dict ? 'auto' : 'tipp?') + '</span>' : '');
  const g = GROUP_LABEL[it.group || 'kell'] ? '<span class="tag">' + GROUP_LABEL[it.group] + '</span>' : '';
  return '<div class="item' + (it.done ? ' done' : '') + '">' +
    '<button type="button" class="chk" data-act="toggle" aria-pressed="' + !!it.done + '" aria-label="' + esc(it.hu || it.de) + ' kipipálása"><span class="box">' + CHECK + '</span></button>' +
    '<button type="button" class="body" data-act="edit">' + iconHtml(it) +
    '<span class="names"><div class="hu">' + esc(it.hu || '?') + autoTag('hu') + g + '</div>' +
    (it.de ? '<div class="de">' + esc(it.de) + autoTag('de') + '</div>' : '') + metaHtml(it) + '</span>' +
    (it.qty ? '<span class="qty">' + esc(it.qty) + '</span>' : '') + '</button></div>';
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
  list.innerHTML = total ? '' : '<div class="empty">Még nincs semmi a listán. Írd be lent, vagy importáld a régi listát a ⋯ menüből.</div>';
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
  else openEditor(id);
});

// ---- add ----------------------------------------------------------------------
$('addForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const hu = $('inHu').value.trim(), de = $('inDe').value.trim();
  if (!hu && !de) { $('inHu').focus(); return; }
  edit(uid(), { hu, de, qty: '', brand: '', group: 'kell', done: false, order: Date.now() });
  $('inHu').value = ''; $('inDe').value = '';
  setStatus('Felírva: ' + (hu || de) + (navigator.onLine ? '' : ' (a német név és a fotó netre vár)'));
  $('inHu').focus();
});

// ---- editor -----------------------------------------------------------------
let editing = null;
function openEditor(id) {
  const it = items[id]; editing = id;
  $('edHu').value = it.hu || ''; $('edDe').value = it.de || ''; $('edQty').value = it.qty || '';
  $('edBrand').value = it.brand || ''; $('edGroup').value = it.group || 'kell';
  const e = it.enrich || {}, lines = [];
  const photo = safeUrl(e.photo?.url), link = safeUrl(e.link?.url);
  if (photo) lines.push('<img src="' + esc(photo) + '" alt="" referrerpolicy="no-referrer">');
  if (e.brand?.value) lines.push('Márka-javaslat: <b>' + esc(e.brand.value) + '</b> <span class="est">(' + esc(e.brand.source) + ')</span>');
  if (e.price?.text) lines.push('Ár: <span class="est">' + esc(e.price.text) + '</span> <span class="est">(' + esc(e.price.source) + ')</span>');
  if (e.store?.value) lines.push('Bolt: <span class="est">' + esc(e.store.value) + '</span> <span class="est">(' + esc(e.store.source) + ')</span>');
  if (e.sources?.translation) lines.push('Fordítás forrása: ' + esc(e.sources.translation));
  if (link) lines.push('<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + esc(e.link.label || 'link') + '</a> <span class="est">(' + esc(e.link.source) + ')</span>');
  $('edHint').innerHTML = lines.length ? '<div class="h">Javaslat, becslés</div>' + lines.join('<br>') +
    (e.brand?.value && !it.brand ? '<br><button type="button" class="ghost take" id="takeBrand">Márka átvétele</button>' : '') : '';
  const tb = $('takeBrand'); if (tb) tb.onclick = () => { $('edBrand').value = e.brand.value; };
  $('editor').showModal();
}
$('edForm').addEventListener('submit', () => {
  const it = items[editing]; if (!it) return;
  const patch = {};
  const v = { hu: $('edHu').value.trim(), de: $('edDe').value.trim(), qty: $('edQty').value.trim(), brand: $('edBrand').value.trim(), group: $('edGroup').value };
  for (const k of Object.keys(v)) if ((it[k] || '') !== v[k]) patch[k] = v[k];
  if (Object.keys(patch).length) { edit(editing, patch); setStatus('Mentve: ' + (v.hu || v.de)); }
});
$('edCancel').addEventListener('click', () => $('editor').close());
$('edDelete').addEventListener('click', () => {
  const it = items[editing]; $('editor').close();
  if (it) { remove(editing); setStatus('Törölve: ' + (it.hu || it.de)); }
});

// ---- clear done ---------------------------------------------------------------
$('clearBtn').addEventListener('click', () => { $('confirmWrap').hidden = false; $('clearBtn').hidden = true; });
$('confirmNo').addEventListener('click', () => { $('confirmWrap').hidden = true; $('clearBtn').hidden = false; });
$('confirmYes').addEventListener('click', () => {
  $('confirmWrap').hidden = true; $('clearBtn').hidden = false;
  const gone = visible().filter((i) => i.done);
  for (const it of gone) delete items[it.id];
  persist(); render();
  setStatus(gone.length + ' kipipált tétel törölve.');
});

// ---- import / backup ------------------------------------------------------------
// Accepts: the artifact export (JSON array of {id, hu, de, done, group, qty, order}),
// {items: [...]}, this app's own backup, or plain text with one item per line.
function parseImport(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  let data = null;
  if (/^[[{]/.test(t)) { try { data = JSON.parse(t); } catch { throw new Error('A szöveg JSON-nak látszik, de hibás.'); } }
  if (data) {
    const arr = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Object.values(data.items || {});
    return arr.filter((r) => r && (r.hu || r.de)).map((r) => ({
      id: r.id ? (String(r.id).startsWith('art-') || r.app === 'kosar' ? String(r.id) : 'art-' + r.id) : '',
      hu: String(r.hu || '').slice(0, 120), de: String(r.de || '').slice(0, 120), qty: String(r.qty || '').slice(0, 40),
      brand: String(r.brand || '').slice(0, 60), group: ['kell', 'havan', 'otthon'].includes(r.group) ? r.group : 'kell',
      done: !!r.done, order: Number(r.order) || 0,
    }));
  }
  return t.split(/\r?\n/).map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean)
    .map((hu, i) => ({ id: '', hu: hu.slice(0, 120), de: '', qty: '', brand: '', group: 'kell', done: false, order: Date.now() + i }));
}
function importRows(rows) {
  let added = 0, updated = 0;
  for (const r of rows) {
    const id = r.id || 'imp-' + enrichKey(r.hu, r.de);
    const cur = items[id];
    if (cur) { Object.assign(cur, r, { id }); updated++; } else { items[id] = { ...r, id }; added++; }
  }
  persist(); render(); kickEnrich();
  return { added, updated };
}
let pendingImport = [], linkMode = false;
function previewImport() {
  try {
    pendingImport = parseImport($('imText').value);
    $('imInfo').innerHTML = !pendingImport.length ? 'Nincs mit importálni.' : linkMode
      ? pendingImport.length + ' tétel érkezett:<ul class="imlist">' + pendingImport.map((r) => '<li' + (r.done ? ' class="d"' : '') + '>' + esc(r.hu || r.de) + '</li>').join('') + '</ul>'
      : esc(pendingImport.length + ' tétel: ' + pendingImport.slice(0, 4).map((r) => r.hu || r.de).join(', ') + (pendingImport.length > 4 ? ', …' : ''));
  } catch (e) { pendingImport = []; $('imInfo').textContent = e.message; }
  $('imGo').disabled = !pendingImport.length;
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
$('imGo').addEventListener('click', () => {
  const { added, updated } = importRows(pendingImport);
  $('importer').close();
  setStatus('Importálva: ' + added + ' új' + (updated ? ', ' + updated + ' frissítve' : '') + '.');
});
$('imCancel').addEventListener('click', () => $('importer').close());
$('menuBtn').addEventListener('click', () => $('menu').showModal());
$('menuClose').addEventListener('click', () => $('menu').close());
$('mImport').addEventListener('click', () => openImport());
$('mBackup').addEventListener('click', async () => {
  const rows = Object.values(items).map(({ enrich: _e, ...r }) => ({ ...r, app: 'kosar' }));
  const text = JSON.stringify(rows, null, 1);
  const name = 'kosar-mentes-' + new Date().toISOString().slice(0, 10) + '.json';
  const file = new File([text], name, { type: 'application/json' });
  $('menu').close();
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Kosár mentés' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  setStatus('Mentés letöltve: ' + name);
});

// An import link carries the list in the URL fragment (#import=<base64url JSON>).
// The fragment never leaves the phone: browsers do not send it to the web host.
function hashImport() {
  const m = location.hash.match(/^#import=([A-Za-z0-9_-]+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    openImport(new TextDecoder().decode(bytes), true);
  } catch { setStatus('Az import-link hibás.'); }
}

let statusTimer;
function setStatus(t) { $('status').textContent = t || ''; clearTimeout(statusTimer); statusTimer = setTimeout(() => ($('status').textContent = ''), 6000); }

// ---- lifecycle ------------------------------------------------------------------
window.addEventListener('online', () => { onlineSince = Date.now(); setNet(); kickEnrich(); });
window.addEventListener('offline', setNet);
window.addEventListener('hashchange', hashImport); // import link opened while the app is already open
document.addEventListener('visibilitychange', () => { if (!document.hidden) kickEnrich(); });
window.addEventListener('storage', (e) => { if (e.key === LS_ITEMS) { try { items = JSON.parse(e.newValue || '{}'); } catch { /* keep */ } render(); } });
setInterval(() => { if (!document.hidden) kickEnrich(); }, RETRY_MS);
render(); setNet(); hashImport(); kickEnrich();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
