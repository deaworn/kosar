// Pure helpers for the AI helper key link/token parsing and iOS PWA key banners
// (Tomi 11340-11343: iOS Home Screen apps have separate storage from Safari and
// start at start_url without the #ai=... hash).

const TOKEN_RE = /^[A-Za-z0-9_-]{16,200}$/;
const URL_RE = /^https?:\/\/\S+$/i;

function parseQueryOrFragmentParams(raw) {
  const sp = new URLSearchParams(String(raw || '').replace(/^[?#]/, ''));
  let token = sp.get('ai') || '';
  if (!token) {
    for (const [k, v] of sp.entries()) {
      if (k.toLowerCase() === 'ai') { token = v; break; }
    }
  }
  if (!TOKEN_RE.test(token)) return null;
  let url = sp.get('u') || '';
  if (!url) {
    for (const [k, v] of sp.entries()) {
      if (k.toLowerCase() === 'u') { url = v; break; }
    }
  }
  const cleanUrl = URL_RE.test(url) ? url.replace(/\/+$/, '') : '';
  return { token, url: cleanUrl };
}

function parseAiFromUrl(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { return null; }
  if (u.searchParams.has('ai')) {
    const parsed = parseQueryOrFragmentParams(u.search);
    if (parsed) return parsed;
  }
  if (u.hash) {
    const parsed = parseQueryOrFragmentParams(u.hash);
    if (parsed) return parsed;
  }
  return null;
}

function stripOuterQuotes(s) {
  if (s.length >= 2) {
    const a = s[0], b = s[s.length - 1];
    if ((a === '<' && b === '>') || (a === '"' && b === '"') || (a === "'" && b === "'")) {
      return s.slice(1, -1).trim();
    }
  }
  return s;
}

// Accepts either the full link (alone or inside pasted chat text), the ?ai=...
// query string, the legacy #ai=... fragment, ai=..., or just the bare token.
// Returns { token, url } or null.
export function parseAiInput(raw) {
  const s0 = String(raw ?? '').trim();
  if (!s0) return null;
  const s = stripOuterQuotes(s0);
  if (!s) return null;

  // Single token/URL/query/fragment without whitespace
  if (!/\s/.test(s)) {
    if (/^https?:\/\//i.test(s)) return parseAiFromUrl(s);
    if (s.startsWith('?') || s.startsWith('#') || /^ai=/i.test(s)) return parseQueryOrFragmentParams(s);
    return TOKEN_RE.test(s) ? { token: s, url: '' } : null;
  }

  // Pasted message containing a full link, ?ai=... / #ai=... param, or ai=...
  for (const match of s.matchAll(/https?:\/\/[^\s"'<>]+/gi)) {
    const parsed = parseAiFromUrl(match[0].replace(/[.,;:!?)\]}]+$/, ''));
    if (parsed) return parsed;
  }
  for (const pattern of [/[?#]([^\s"'<>#]+)/g, /(?:^|[\s"'<(])(ai=[^\s"'<>]+)/gi]) {
    for (const match of s.matchAll(pattern)) {
      const parsed = parseQueryOrFragmentParams(match[1].replace(/[.,;:!?)\]}]+$/, ''));
      if (parsed) return parsed;
    }
  }
  return null;
}

// Builds the full shareable/copyable ?ai=... link from the current base URL.
export function buildAiLink(baseUrl, parsed) {
  if (!parsed || !TOKEN_RE.test(String(parsed.token || ''))) return '';
  let u;
  try { u = new URL(String(baseUrl || '')); } catch { return ''; }
  u.hash = '';
  u.searchParams.set('ai', parsed.token);
  if (parsed.url && URL_RE.test(parsed.url)) {
    u.searchParams.set('u', parsed.url.replace(/\/+$/, ''));
  }
  return u.toString();
}

// Standalone PWA detection (iOS navigator.standalone or display-mode: standalone).
export function isStandalone({ navigatorStandalone = false, displayModeStandalone = false } = {}) {
  return Boolean(navigatorStandalone || displayModeStandalone);
}

// Safari browser detection (excludes Chrome/CriOS, Firefox/FxiOS, Edge, Opera, Samsung, Android).
export function isSafari(userAgent = '') {
  const ua = String(userAgent || '');
  return /Safari/i.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS|SamsungBrowser|Android)/i.test(ua);
}

// Decides which key banner (if any) to show. At most one banner is ever shown.
// Returns 'standalone-need-key' | 'safari-copy-tip' | 'none'.
export function chooseKeyBanner({
  standalone = false,
  safari = false,
  hasKey = false,
  fromLink = false,
  standaloneDismissed = false,
  tipSeen = false,
} = {}) {
  if (standalone && !hasKey && !standaloneDismissed) return 'standalone-need-key';
  if (!standalone && safari && fromLink && hasKey && !tipSeen) return 'safari-copy-tip';
  return 'none';
}

// Human-readable key status label (never contains the token).
export function keyStatusText(hasKey) {
  return hasKey ? 'beállítva' : 'nincs beállítva';
}
