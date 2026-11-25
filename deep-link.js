// Pure helpers for building, parsing, and clearing deep links (?join=, ?list=, ?import=, ?ai=).
// Query parameters survive Android's "Open in browser" / PWA intent hand-off, whereas
// URL fragments (#...) are often stripped. Hash fragments remain supported as a fallback
// for older links.

const DEEP_LINK_KEYS = ['join', 'ai', 'list', 'import'];

/**
 * Parses an incoming deep link from `location.search` (primary) or `location.hash` (fallback).
 * Returns `{ source: 'query' | 'hash', type: 'join' | 'ai' | 'list' | 'import', value, raw }` or `null`.
 */
export function parseDeepLink(search = '', hash = '') {
  const s = String(search || '');
  const sp = new URLSearchParams(s);
  for (const type of DEEP_LINK_KEYS) {
    if (sp.has(type)) {
      const val = sp.get(type) ?? '';
      return {
        source: 'query',
        type,
        value: type === 'join' ? val.trim() : val,
        raw: s,
      };
    }
  }

  const h = String(hash || '');
  if (/^#join=/i.test(h)) {
    return { source: 'hash', type: 'join', value: h.slice(6).trim(), raw: h };
  }
  if (/^#ai=/i.test(h)) {
    return { source: 'hash', type: 'ai', value: h, raw: h };
  }
  if (/^#list=/i.test(h)) {
    return { source: 'hash', type: 'list', value: h, raw: h };
  }
  if (/^#import=/i.test(h)) {
    return { source: 'hash', type: 'import', value: h.slice(8), raw: h };
  }

  return null;
}

/**
 * Builds a query-based deep link URL using URL and URLSearchParams.
 */
export function buildDeepLink(baseUrl, key, value, extraParams = null) {
  const u = new URL(String(baseUrl));
  u.hash = '';
  u.search = '';
  u.searchParams.set(key, String(value ?? ''));
  if (extraParams && typeof extraParams === 'object') {
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
    }
  }
  return u.toString();
}

/**
 * Computes the cleaned URL (for history.replaceState) after consuming a deep link,
 * removing only the consumed query param(s) (or clearing the hash) while preserving
 * unrelated query params such as ?v=1 or ?shared=1.
 */
export function stripDeepLinkFromUrl(pathname, search, hash, consumed) {
  const path = String(pathname || '/');
  const s = String(search || '');
  const h = String(hash || '');
  if (!consumed) return path + s + h;
  if (consumed.source === 'hash') return path + s;
  const sp = new URLSearchParams(s);
  sp.delete(consumed.type);
  if (consumed.type === 'ai') sp.delete('u');
  const qs = sp.toString();
  return path + (qs ? '?' + qs : '') + h;
}
