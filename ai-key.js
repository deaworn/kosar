// Pure helpers for the AI helper key link/token parsing and iOS PWA key banners
// (Tomi 11340-11343: iOS Home Screen apps have separate storage from Safari and
// start at start_url without the #ai=... hash).

const TOKEN_RE = /^[A-Za-z0-9_-]{16,200}$/;
const URL_RE = /^https?:\/\/\S+$/i;

function parseFragmentParams(frag) {
  let token = '';
  let url = '';
  for (const part of String(frag || '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).toLowerCase();
    const v = part.slice(eq + 1);
    if (k === 'ai') token = v;
    else if (k === 'u') {
      try { url = decodeURIComponent(v); } catch { url = ''; }
    }
  }
  if (!TOKEN_RE.test(token)) return null;
  const cleanUrl = URL_RE.test(url) ? url.replace(/\/+$/, '') : '';
  return { token, url: cleanUrl };
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

// Accepts either the full link (alone or inside pasted chat text), the #ai=...
// fragment, ai=..., or just the bare token. Returns { token, url } or null.
export function parseAiInput(raw) {
  const s0 = String(raw ?? '').trim();
  if (!s0) return null;
  const s = stripOuterQuotes(s0);
  if (!s) return null;

  // Single token/URL/fragment without whitespace
  if (!/\s/.test(s)) {
    const hashIdx = s.indexOf('#');
    if (hashIdx >= 0) return parseFragmentParams(s.slice(hashIdx + 1));
    if (/^ai=/i.test(s)) return parseFragmentParams(s);
    if (/^https?:\/\//i.test(s)) return null;
    return TOKEN_RE.test(s) ? { token: s, url: '' } : null;
  }

  // Pasted message containing a link or #ai=... fragment
  for (const pattern of [/#([^\s"'<>#]+)/g, /(?:^|[\s"'<(])(ai=[^\s"'<>]+)/gi]) {
    for (const match of s.matchAll(pattern)) {
      const parsed = parseFragmentParams(match[1].replace(/[.,;:!?)\]}]+$/, ''));
      if (parsed) return parsed;
    }
  }
  return null;
}

// Builds the full shareable/copyable #ai=... link from the current base URL.
export function buildAiLink(baseUrl, parsed) {
  if (!parsed || !TOKEN_RE.test(String(parsed.token || ''))) return '';
  const base = String(baseUrl || '').split('#')[0];
  if (!base) return '';
  const tail = parsed.url && URL_RE.test(parsed.url) ? '&u=' + encodeURIComponent(parsed.url.replace(/\/+$/, '')) : '';
  return base + '#ai=' + parsed.token + tail;
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
