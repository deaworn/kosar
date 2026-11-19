// Price unit shown in Hungarian (Tomi 11003): "/ db", "/ kg", "/ 160 g", "/ 44 db". No unit from
// the shop -> null, and the caller writes "egység: nem látszik" (never a guess).
export function unitLabel(unit) {
  const u = String(unit || '').trim().replace(/-?(stück|stk|st)(-packung)?$/i, ' Stück').replace(/\s+/g, ' ').trim();
  if (!u) return null;
  const m = u.match(/^(\d+(?:[.,]\d+)?(?:x\d+)?)?\s*(.*)$/i);
  const n = m[1] || '', w = m[2].toLowerCase();
  const word = /^(stück|stk|st|stueck)\.?$/.test(w) ? 'db' : /^(tabs|caps)$/.test(w) ? 'db' : w;
  return (n === '1' || n === '') && /^(db|kg|l|g|ml)$/.test(word) ? word : (n + ' ' + word).trim();
}
export const unitText = (unit) => { const l = unitLabel(unit); return l ? ' / ' + l : ' · egység: nem látszik'; };
