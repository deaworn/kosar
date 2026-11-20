// One input field (Tomi 11205: "Csak 1 beviteli mező legyen ... ha valaki valamit beír, azt
// úgy ismerje fel a rendszer"): which language was typed, Hungarian or German.
// Offline and instant: the built-in dictionary first (whole words), then spelling that only
// one of the two languages uses. When neither wins, the answer is '' (not sure): the item is
// kept as Hungarian and the home machine's Claude decides (enrich.js, item.langCheck).
// Pure: used by the app, tested in node.
import { DICT } from './dictionary.js';

const norm = (s) => String(s || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();
const HU = new Map(), DE = new Map();
for (const e of DICT) { if (e[0]) HU.set(norm(e[0]), 1); if (e[1]) DE.set(norm(e[1]), 1); }
const HU_PARTS = [...HU.keys()].filter((k) => k.length >= 4 && !DE.has(k) && !k.includes(' '));
const DE_PARTS = [...DE.keys()].filter((k) => k.length >= 4 && !HU.has(k) && !k.includes(' '));

// spelling: letters and letter groups that the other language does not use in food names
const HU_SPELL = [/[áéíóőúű]/, /(gy|ny|ly|zs|cs|sz)/, /(ás|és|os|ös|ok|ek|ák|ék)$/];
const DE_SPELL = [/[äß]/, /sch|ch|ck|tz|pf|ph|qu|w/, /(ei|ie|eu|äu)/, /(ung|chen|keit|lein|en|er)$/];

// text -> 'hu' | 'de' | '' (not sure)
export function guessLang(text) {
  const s = norm(text);
  if (!s) return '';
  // 1. the dictionary, the whole text and then its words
  const huWhole = HU.has(s), deWhole = DE.has(s);
  if (huWhole !== deWhole) return huWhole ? 'hu' : 'de';
  let hu = 0, de = 0;
  for (const w of s.split(' ')) {
    const h = HU.has(w), d = DE.has(w);
    if (h && !d) hu += 2; else if (d && !h) de += 2;
    else if (!h && !d && w.length >= 6) {
      if (HU_PARTS.some((p) => w.startsWith(p) || w.endsWith(p))) hu += 1;
      if (DE_PARTS.some((p) => w.startsWith(p) || w.endsWith(p))) de += 1;
    }
    // 2. spelling, per word
    hu += HU_SPELL.filter((re) => re.test(w)).length;
    de += DE_SPELL.filter((re) => re.test(w)).length;
  }
  if (hu - de >= 1 && hu > de) return 'hu';
  if (de - hu >= 1 && de > hu) return 'de';
  return '';
}
