// Quick-add typing suggestion grouping, disambiguation, and markup helpers
// (Tomi 12263/12264/12265/12268). Pure: shared by site/app.js and Node tests.

export const SUGGEST_CATEGORY_LABELS = Object.freeze({
  dairy: 'Tejtermék',
  bakery: 'Pékáru',
  produce: 'Zöldség / gyümölcs',
  meat: 'Hús / felvágott',
  pantry: 'Kamra',
  drinks: 'Ital',
  sweets: 'Édesség',
  frozen: 'Fagyasztott',
  drugstore: 'Drogéria',
});

export const SUGGEST_GROUPS = Object.freeze({
  plain: { id: 'plain', label: 'Általános tétel' },
  own: { id: 'own', label: 'Saját / korábbi' },
  dict: { id: 'dict', label: 'Fordítás · szótár' },
  catalog: { id: 'catalog', label: 'Katalógus · konkrét termékek' },
  price: { id: 'price', label: 'Bolti árak' },
});

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function normalizeSuggestName(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function capitalizeDisplay(value) {
  const s = String(value ?? '').trim();
  return s ? s.replace(/^\p{Ll}/u, (c) => c.toUpperCase()) : '';
}

export function categoryLabel(cat) {
  return SUGGEST_CATEGORY_LABELS[cat] || '';
}

function ownRow(hit, country, { variantName = '', priceSummary = '' } = {}) {
  const { id, item: h, inList } = hit;
  const activeOnList = Boolean(inList && !h.done);
  const title = h.hu || h.de || '';
  const showDe = Boolean(h.de && h.hu && country !== 'hu');
  const parts = [
    showDe ? h.de : '',
    h.brand || '',
    h.type || '',
    variantName || '',
    h.qty || '',
    priceSummary || '',
  ].filter(Boolean);
  const fallbackSub = activeOnList ? 'Már a listádon van' : 'Korábban törölt tétel';
  return {
    kind: 'own',
    id,
    inList: Boolean(inList),
    activeOnList,
    title,
    normName: normalizeSuggestName(title),
    pill: activeOnList ? 'A listán' : 'Korábbi',
    pillKind: activeOnList ? 'list' : 'hist',
    subParts: parts.length ? parts : [fallbackSub],
    hasExtraMeta: parts.length > 0,
    action: activeOnList ? 'jump' : 'add',
    actionLabel: activeOnList ? 'Ugrás a tételre a listán' : 'Visszaállítás a listára',
  };
}

function dictRow(tip, index, country) {
  const [hu, de, _icon, cat] = tip;
  const title = capitalizeDisplay(hu);
  const catText = categoryLabel(cat);
  const deText = String(de || '').trim();
  return {
    kind: 'dict',
    index,
    hu,
    de: deText,
    cat: cat || '',
    catLabel: catText,
    title,
    normName: normalizeSuggestName(title),
    pill: 'Szótár',
    pillKind: 'dict',
    country,
    action: 'add',
    actionLabel: 'Azonnali hozzáadás a listához',
  };
}

function catalogRow(hit) {
  const { gtin, name, brand, quantity } = hit;
  const title = brand && !name.toLowerCase().startsWith(brand.toLowerCase())
    ? brand + ' · ' + name
    : name;
  return {
    kind: 'catalog',
    gtin,
    brand: brand || '',
    quantity: quantity || '',
    title,
    normName: normalizeSuggestName(title),
    pill: 'Katalógus',
    pillKind: 'cat',
    subParts: [quantity || 'Kiszerelés nincs megadva', 'Open Food Facts'],
    action: 'add',
    actionLabel: 'Termék hozzáadása a listához',
  };
}

function plainMilkRow() {
  return {
    kind: 'plain',
    hu: 'Tej',
    icon: 'milk',
    title: 'Tej',
    normName: normalizeSuggestName('Tej'),
    pill: 'Általános',
    pillKind: 'plain',
    subParts: ['Márka és típus a listán választható'],
    action: 'add',
    actionLabel: 'Általános tétel hozzáadása a listához',
  };
}

// Builds a structured, disambiguated quick-add suggestion model for `#suggest`.
export function buildSuggestModel({
  query = '',
  place = null,
  ownHits = [],
  dictTips = [],
  catalogHits = [],
  candidates = [],
  matched = '',
  pending = false,
  getOwnMeta = () => ({}),
} = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < 2) {
    return { hidden: true, hasAddAction: false, hasOnlyJump: false, duplicateNames: [], sections: [] };
  }

  const country = place && place !== 'none' ? place.country : '';
  const ownRows = (ownHits || []).map((hit) => ownRow(hit, country, getOwnMeta(hit) || {}));
  const sections = [];

  if (place === 'none') {
    if (ownRows.length) {
      sections.push({ id: 'own', label: SUGGEST_GROUPS.own.label, rows: ownRows });
    }
  } else if (country === 'hu' && q === 'tej') {
    sections.push({ id: 'plain', label: SUGGEST_GROUPS.plain.label, rows: [plainMilkRow()] });
    if (ownRows.length) {
      sections.push({ id: 'own', label: SUGGEST_GROUPS.own.label, rows: ownRows });
    }
  } else {
    if (ownRows.length) {
      sections.push({ id: 'own', label: SUGGEST_GROUPS.own.label, rows: ownRows });
    }
    const dRows = (dictTips || []).map((tip, i) => dictRow(tip, i, country));
    if (dRows.length) {
      sections.push({ id: 'dict', label: SUGGEST_GROUPS.dict.label, rows: dRows });
    }
    const cRows = (catalogHits || []).map((hit) => catalogRow(hit));
    if (cRows.length) {
      sections.push({ id: 'catalog', label: SUGGEST_GROUPS.catalog.label, rows: cRows });
    }
    const hasCands = Array.isArray(candidates) && candidates.length > 0;
    if (hasCands || pending) {
      const priceLabel = matched
        ? SUGGEST_GROUPS.price.label + ' · ' + matched
        : SUGGEST_GROUPS.price.label;
      sections.push({
        id: 'price',
        label: priceLabel,
        candidates: hasCands ? candidates : [],
        pending: Boolean(pending),
      });
    }
  }

  // Detect near-duplicate row titles (e.g. own "Tej" vs dictionary "tej" vs catalog "Tejföl").
  const nameCounts = new Map();
  for (const sec of sections) {
    for (const row of sec.rows || []) {
      if (!row.normName) continue;
      nameCounts.set(row.normName, (nameCounts.get(row.normName) || 0) + 1);
    }
  }
  const duplicateNames = [...nameCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  const dupSet = new Set(duplicateNames);
  for (const sec of sections) {
    for (const row of sec.rows || []) {
      row.isDuplicate = dupSet.has(row.normName);
    }
  }

  let hasAddAction = false;
  let hasJumpAction = false;
  for (const sec of sections) {
    if (sec.id === 'price' && sec.candidates?.length) hasAddAction = true;
    for (const row of sec.rows || []) {
      if (row.action === 'add') hasAddAction = true;
      else if (row.action === 'jump') hasJumpAction = true;
    }
  }
  const hasOnlyJump = !hasAddAction && hasJumpAction && !pending;

  return {
    hidden: sections.length === 0,
    hasAddAction,
    hasOnlyJump,
    duplicateNames,
    sections,
  };
}

function actionBadgeHtml(row) {
  if (row.action === 'jump') {
    return '<span class="sug-act sug-jump" aria-hidden="true" title="' + esc(row.actionLabel) + '">↗</span>';
  }
  return '<span class="sug-act sug-add" aria-hidden="true" title="' + esc(row.actionLabel) + '">+</span>';
}

function rowSubHtml(row) {
  if (row.kind === 'dict') {
    const parts = [];
    if (row.country === 'hu') {
      if (row.catLabel) parts.push('<span class="sug-cat-lbl">' + esc(row.catLabel) + '</span>');
      if (row.de) parts.push('<span class="sug-de">DE: ' + esc(row.de) + '</span>');
    } else {
      if (row.de) parts.push('<span class="sug-de">DE: ' + esc(row.de) + '</span>');
      if (row.catLabel) parts.push('<span class="sug-cat-lbl">' + esc(row.catLabel) + '</span>');
    }
    if (row.isDuplicate) {
      parts.push('<span class="sug-diff">új tétel szótárból</span>');
    }
    return parts.join(' <span class="sug-sep" aria-hidden="true">·</span> ');
  }
  const list = [...(row.subParts || [])];
  if (row.isDuplicate && row.kind === 'own' && row.hasExtraMeta) {
    list.unshift(row.activeOnList ? 'Már a listádon' : 'Korábbi tételed');
  }
  return esc(list.join(' · '));
}

function renderRowHtml(row) {
  const cls = 'sug sug-' + row.kind + (row.isDuplicate ? ' sug-dup' : '');
  let dataAttrs = '';
  if (row.kind === 'own') {
    dataAttrs = ' data-own-id="' + esc(row.id) + '" data-in-list="' + row.inList + '"';
  } else if (row.kind === 'dict') {
    dataAttrs = ' data-tip="' + row.index + '"';
  } else if (row.kind === 'catalog') {
    dataAttrs = ' data-off-gtin="' + esc(row.gtin) + '"';
  } else if (row.kind === 'plain') {
    dataAttrs = ' data-plain-hu="' + esc(row.hu) + '" data-plain-icon="' + esc(row.icon) + '"';
  }
  const showPill = row.kind === 'own' || row.kind === 'plain' || row.isDuplicate;
  const pillHtml = showPill && row.pill
    ? '<span class="sug-pill sug-pill-' + esc(row.pillKind) + '">' + esc(row.pill) + '</span>'
    : '';
  const sub = rowSubHtml(row);
  return '<button type="button" class="' + cls + '"' + dataAttrs + ' aria-label="' + esc(row.title + ' — ' + row.actionLabel) + '">'
    + '<span class="sug-main">'
    + '<span class="sug-top"><b class="sug-title">' + esc(row.title) + '</b>' + pillHtml + '</span>'
    + (sub ? '<span class="sug-sub">' + sub + '</span>' : '')
    + '</span>'
    + actionBadgeHtml(row)
    + '</button>';
}

// Renders the complete HTML string for `#suggest` from a model built by `buildSuggestModel()`.
export function renderSuggestHtml(model, { renderCandidate = () => '' } = {}) {
  if (!model || model.hidden || !model.sections?.length) return '';
  const leadHtml = model.hasAddAction
    ? '<div class="sug-lead"><span class="sug-lead-ico" aria-hidden="true">+</span><span>Koppintásra azonnal a listára kerül</span></div>'
    : model.hasOnlyJump
      ? '<div class="sug-lead sug-lead-jump"><span>Már a listán — koppintásra odaugrik</span></div>'
      : '';

  const groupsHtml = model.sections.map((sec) => {
    const head = '<div class="shead shead-' + esc(sec.id) + '">'
      + '<span class="shead-dot" aria-hidden="true"></span>'
      + '<span>' + esc(sec.label) + '</span>'
      + '</div>';
    let body = '';
    if (sec.id === 'price') {
      const candHtml = (sec.candidates || []).map((c, i) => renderCandidate(c, i)).join('');
      const pendHtml = sec.pending ? '<div class="spending" role="status">keresem...</div>' : '';
      body = candHtml + pendHtml;
    } else {
      body = (sec.rows || []).map(renderRowHtml).join('');
    }
    return '<div class="sug-group sug-group-' + esc(sec.id) + '" data-sug-group="' + esc(sec.id) + '">'
      + head + body + '</div>';
  }).join('');

  return leadHtml + groupsHtml;
}
