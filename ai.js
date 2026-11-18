// Optional AI helper on the home machine (Claude via the family's subscription),
// reached through a Cloudflare quick tunnel. The tunnel address changes on every
// machine start, so it is looked up in a public gist that holds only that
// address. The access token comes once via a link (#ai=...) and stays on the
// phone. Every failure is silent: the caller falls back to the free path.
const GIST = 'https://api.github.com/gists/645f862b3318ab9fbfc259c14c1eee6a';
const LS = 'bv.ai';
const DOWN_MS = 45000; // after a failure, do not try again for 45 s
let cfg = load(), downUntil = 0, discovering = null;

function load() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch { return {}; } }
function save() { try { localStorage.setItem(LS, JSON.stringify(cfg)); } catch { /* storage blocked */ } }

export const configured = () => !!cfg.token;
export function setToken(token, url = '') {
  cfg = { token: String(token).slice(0, 200), url: url && /^https?:\/\//.test(url) ? url.replace(/\/$/, '') : '', fixed: !!url };
  downUntil = 0; save();
}
export function forget() { cfg = {}; save(); }

async function discover() {
  if (cfg.fixed) return cfg.url;
  if (!discovering) {
    discovering = (async () => {
      const r = await fetch(GIST, { cache: 'no-store', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('gist ' + r.status);
      const j = await r.json();
      const url = JSON.parse(j.files?.['kosar-ai.json']?.content || '{}').url || '';
      if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(url)) throw new Error('no helper address');
      cfg.url = url; save();
      return url;
    })().finally(() => { discovering = null; });
  }
  return discovering;
}

async function call(path, body, timeoutMs) {
  const once = async (url) => {
    const r = await fetch(url + path, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: 'Bearer ' + cfg.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401 || r.status === 429 || r.status === 400 || r.status === 413) throw Object.assign(new Error('http ' + r.status), { final: true });
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  };
  let url = cfg.url || await discover();
  try { return await once(url); } catch (e) {
    if (e.final || cfg.fixed) throw e;
    const fresh = await discover(); // the machine may have restarted with a new address
    if (fresh === url) throw e;
    return once(fresh);
  }
}

// Returns the result, or null when the helper is not configured, offline, or unreachable.
async function safe(path, body, timeoutMs) {
  if (!cfg.token || !navigator.onLine || Date.now() < downUntil) return null;
  try { return await call(path, body, timeoutMs); } catch { downUntil = Date.now() + DOWN_MS; return null; }
}
export const recognize = (dataUrl) => safe('/recognize', { image: dataUrl }, 50000);
export const name = (hu, de) => safe('/name', { hu, de }, 35000);
export async function status() {
  if (!cfg.token) return 'nincs beállítva';
  if (!navigator.onLine) return 'net nélkül nem elérhető';
  downUntil = 0;
  return (await safe('/health', null, 12000))?.ok ? 'elérhető' : 'a gép most nem érhető el';
}
