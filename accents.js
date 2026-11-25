// Theme modes and owner-approved accent palette generated from docs/temak/valasztas.json.

export const DEFAULT_MODE = 'dark';
export const DEFAULT_ACCENT = 'naplemente';

export const ACCENTS = [
  // Solids (Sima színek)
  { id: 'narancs', name: 'Narancs', kind: 'solid', dark: '#f97316', light: '#c2410c' },
  { id: 'kek', name: 'Kék', kind: 'solid', dark: '#4f7cff', light: '#1d4ed8' },
  { id: 'zold', name: 'Zöld', kind: 'solid', dark: '#34d399', light: '#047857' },
  { id: 'piros', name: 'Piros', kind: 'solid', dark: '#e05a6a', light: '#b91c1c' },
  { id: 'lila', name: 'Lila', kind: 'solid', dark: '#8b5cf6', light: '#6d28d9' },
  { id: 'rozsaszin', name: 'Rózsaszín', kind: 'solid', dark: '#ec4899', light: '#be185d' },
  { id: 'sarga', name: 'Sárga', kind: 'solid', dark: '#facc15', light: null },
  { id: 'grafit', name: 'Grafit', kind: 'solid', dark: '#c7c9cc', light: '#374151' },
  // Gradients (Átfolyó színek)
  { id: 'naplemente', name: 'Naplemente', kind: 'gradient', dark: ['#ff6d2d', '#ff9e2c', '#ffd54f'], light: ['#c2410c', '#d97706', '#ca8a04'] },
  { id: 'alkony', name: 'Alkony', kind: 'gradient', dark: ['#ff5e62', '#ff9966'], light: ['#be123c', '#ea580c'] },
  { id: 'ocean', name: 'Óceán', kind: 'gradient', dark: ['#2dd4bf', '#60a5fa'], light: ['#1d4ed8', '#0e7490'] },
  { id: 'szeder', name: 'Szeder', kind: 'gradient', dark: ['#c084fc', '#e879f9', '#fb7185'], light: ['#7e22ce', '#a21caf', '#be123c'] },
  { id: 'ibolya', name: 'Ibolya', kind: 'gradient', dark: ['#a78bfa', '#818cf8'], light: ['#6d28d9', '#4338ca'] },
  { id: 'szilva', name: 'Szilva', kind: 'gradient', dark: ['#c084fc', '#fdba74'], light: ['#7e22ce', '#c2410c'] },
  { id: 'aurora', name: 'Aurora', kind: 'gradient', dark: ['#34d399', '#2dd4bf', '#a78bfa'], light: ['#047857', '#0f766e', '#6d28d9'] },
  { id: 'neon', name: 'Neon', kind: 'gradient', dark: ['#22d3ee', '#e879f9'], light: ['#0e7490', '#a21caf'] },
  { id: 'lime', name: 'Lime', kind: 'gradient', dark: ['#a3e635', '#22d3ee'], light: ['#4d7c0f', '#0e7490'] },
];

const ACCENT_MAP = new Map(ACCENTS.map((a) => [a.id, a]));

export function normalizeMode(mode) {
  return mode === 'light' ? 'light' : 'dark';
}

export function getAccent(id) {
  if (typeof id !== 'string') return null;
  return ACCENT_MAP.get(id.trim().toLowerCase()) || null;
}

export function isAccentAvailable(id, mode = DEFAULT_MODE) {
  const accent = getAccent(id);
  if (!accent) return false;
  return normalizeMode(mode) === 'light' ? accent.light !== null : true;
}

export function resolveAccentId(id, mode = DEFAULT_MODE) {
  return isAccentAvailable(id, mode) ? getAccent(id).id : DEFAULT_ACCENT;
}

export function accentsForMode(mode = DEFAULT_MODE) {
  const m = normalizeMode(mode);
  return ACCENTS.filter((a) => m !== 'light' || a.light !== null);
}

function buildGradient(stops) {
  if (!Array.isArray(stops)) {
    return `linear-gradient(135deg, ${stops} 0%, ${stops} 100%)`;
  }
  if (stops.length === 2) {
    return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 100%)`;
  }
  if (stops.length === 3) {
    return `linear-gradient(135deg, ${stops[0]} 0%, ${stops[1]} 52%, ${stops[2]} 100%)`;
  }
  const pct = (i) => Math.round((i / Math.max(1, stops.length - 1)) * 100);
  return `linear-gradient(135deg, ${stops.map((c, i) => `${c} ${pct(i)}%`).join(', ')})`;
}

export function accentSwatchStyle(accent, mode = DEFAULT_MODE) {
  if (!accent) return '';
  const m = normalizeMode(mode);
  const val = accent[m] ?? accent.dark;
  return Array.isArray(val) ? buildGradient(val) : val;
}

export function accentCssVars(id, mode = DEFAULT_MODE) {
  const m = normalizeMode(mode);
  const resolved = resolveAccentId(id, m);
  const accent = getAccent(resolved) || getAccent(DEFAULT_ACCENT);
  const val = accent[m] ?? accent.dark;
  const stops = Array.isArray(val) ? val : [val];
  const primary = stops[0];
  const est = m === 'dark' ? stops[stops.length - 1] : stops[0];
  return {
    '--accent': primary,
    '--accent-ink': m === 'dark' ? '#111113' : '#ffffff',
    '--grad': buildGradient(val),
    '--est': est,
  };
}
