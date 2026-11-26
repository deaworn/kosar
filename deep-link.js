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
  if (/\/index\.html$/i.test(u.pathname)) {
    u.pathname = u.pathname.replace(/\/index\.html$/i, '/');
  }
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
 * Detects restricted social/messenger in-app WebViews (Messenger, Facebook, Instagram,
 * Viber, LINE, WeChat, TikTok) whose storage is isolated from Chrome/Safari and the
 * installed PWA. Returns null for normal browsers and standalone installed PWAs.
 */
export function detectInAppBrowser(userAgent = '', { standalone = false } = {}) {
  if (standalone) return null;
  const ua = String(userAgent || '');
  if (!ua) return null;
  const isAndroid = /Android/i.test(ua);
  const isIos = /iPhone|iPad|iPod/i.test(ua);

  if (/\b(Orca-Android|MessengerForiOS|MessengerLiteForiOS)\b/i.test(ua)
    || /FB(?:AN|IAB|_IAB)\/(?:Orca|Messenger)/i.test(ua)
    || /FBPN\/com\.facebook\.orca/i.test(ua)) {
    return { id: 'messenger', label: 'Messenger', isAndroid, isIos };
  }
  if (/\b(FBAN|FBAV|FB_IAB|FBIOS|FB4A)\b/i.test(ua)) {
    return { id: 'facebook', label: 'Facebook', isAndroid, isIos };
  }
  if (/\bInstagram\b/i.test(ua)) {
    return { id: 'instagram', label: 'Instagram', isAndroid, isIos };
  }
  if (/\bViber\b/i.test(ua)) {
    return { id: 'viber', label: 'Viber', isAndroid, isIos };
  }
  if (/\b(Line\/|MicroMessenger|BytedanceWebview|Musical_ly)\b/i.test(ua)) {
    return { id: 'inapp', label: 'beépített böngésző', isAndroid, isIos };
  }
  return null;
}

/**
 * Returns plain Hungarian guidance for opening an incoming deep link outside an
 * in-app WebView so it lands in Chrome/Safari or the installed Kosár PWA.
 */
export function inAppBrowserHint(env, linkType = 'join') {
  const label = env?.label || 'beépített böngésző';
  const kindWord = linkType === 'join' ? 'közös lista meghívót'
    : linkType === 'list' ? 'megosztott listát'
      : linkType === 'ai' ? 'kulcs-linket'
        : 'linket';
  const body = label === 'beépített böngésző'
    ? `A beépített böngésző külön tárolja a listákat, ezért a ${kindWord} a telefon böngészőjében érdemes megnyitni.`
    : `A ${label} beépített böngészője külön tárolja a listákat, ezért a ${kindWord} a telefon böngészőjében érdemes megnyitni.`;
  const steps = env?.isIos
    ? 'Koppints a jobb felső vagy alsó ⋯ (vagy megosztás) gombra → Megnyitás Safariban. Ha úgy egyszerűbb, másold ki a linket és illeszd be a Safariba.'
    : 'Koppints a jobb felső ⋯ menüre → Megnyitás külső böngészőben (vagy Megnyitás Chrome-ban). Ha nem látod, másold ki a linket és nyisd meg Chrome-ban.';
  return {
    title: 'Nyisd meg a böngészőben',
    body,
    steps,
    copyLabel: 'Link másolása',
    continueLabel: 'Megnyitás mégis itt',
  };
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
