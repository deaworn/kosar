// Built-in HU <-> DE grocery dictionary (rung 0 of enrichment: free, offline). Shared by the static site and the Node tests.
// Each entry: [hu, de, icon, category]. Category drives the store tip and price band.
export const DICT = [
  ['tej', 'Milch', 'milk', 'dairy'], ['szójatej', 'Sojadrink', 'milk', 'dairy'], ['zabtej', 'Haferdrink', 'milk', 'dairy'],
  ['tejföl', 'Schmand', 'cup', 'dairy'], ['tejszín', 'Sahne', 'cup', 'dairy'], ['habtejszín', 'Schlagsahne', 'cup', 'dairy'],
  ['túró', 'Quark', 'cup', 'dairy'], ['joghurt', 'Joghurt', 'cup', 'dairy'], ['vaj', 'Butter', 'cup', 'dairy'],
  ['sajt', 'Käse', 'cheese', 'dairy'], ['trappista sajt', 'Gouda', 'cheese', 'dairy'], ['mozzarella', 'Mozzarella', 'cheese', 'dairy'],
  ['tojás', 'Eier', 'egg', 'dairy'], ['kefir', 'Kefir', 'milk', 'dairy'],
  ['kenyér', 'Brot', 'bread', 'bakery'], ['zsemle', 'Brötchen', 'bread', 'bakery'], ['kifli', 'Hörnchen', 'bread', 'bakery'],
  ['toast kenyér', 'Toastbrot', 'bread', 'bakery'], ['kalács', 'Hefezopf', 'bread', 'bakery'],
  ['alma', 'Äpfel', 'fruit', 'produce'], ['banán', 'Bananen', 'fruit', 'produce'], ['narancs', 'Orangen', 'fruit', 'produce'],
  ['citrom', 'Zitronen', 'fruit', 'produce'], ['szőlő', 'Weintrauben', 'fruit', 'produce'], ['körte', 'Birnen', 'fruit', 'produce'],
  ['eper', 'Erdbeeren', 'fruit', 'produce'], ['málna', 'Himbeeren', 'fruit', 'produce'], ['meggy', 'Sauerkirschen', 'fruit', 'produce'],
  ['mandarin', 'Mandarinen', 'fruit', 'produce'], ['kiwi', 'Kiwi', 'fruit', 'produce'],
  ['uborka', 'Gurke', 'carrot', 'produce'], ['paradicsom', 'Tomaten', 'fruit', 'produce'], ['paprika', 'Paprika', 'carrot', 'produce'],
  ['hagyma', 'Zwiebeln', 'potato', 'produce'], ['vöröshagyma', 'Zwiebeln', 'potato', 'produce'], ['fokhagyma', 'Knoblauch', 'potato', 'produce'],
  ['krumpli', 'Kartoffeln', 'potato', 'produce'], ['burgonya', 'Kartoffeln', 'potato', 'produce'], ['répa', 'Karotten', 'carrot', 'produce'],
  ['sárgarépa', 'Karotten', 'carrot', 'produce'], ['saláta', 'Salat', 'carrot', 'produce'], ['brokkoli', 'Brokkoli', 'carrot', 'produce'],
  ['cukkini', 'Zucchini', 'carrot', 'produce'], ['gomba', 'Champignons', 'potato', 'produce'], ['káposzta', 'Kohl', 'carrot', 'produce'],
  ['csirkemell', 'Hähnchenbrust', 'meat', 'meat'], ['csirke', 'Hähnchen', 'meat', 'meat'], ['darált hús', 'Hackfleisch', 'meat', 'meat'],
  ['sertéshús', 'Schweinefleisch', 'meat', 'meat'], ['marhahús', 'Rindfleisch', 'meat', 'meat'], ['virsli', 'Wiener Würstchen', 'meat', 'meat'],
  ['kolbász', 'Wurst', 'meat', 'meat'], ['sonka', 'Schinken', 'meat', 'meat'], ['szalámi', 'Salami', 'meat', 'meat'],
  ['bacon', 'Speck', 'bacon', 'meat'], ['hal', 'Fisch', 'meat', 'meat'], ['tonhal', 'Thunfisch', 'meat', 'pantry'],
  ['tészta', 'Nudeln', 'pasta', 'pantry'], ['spagetti', 'Spaghetti', 'pasta', 'pantry'], ['rizs', 'Reis', 'pasta', 'pantry'],
  ['liszt', 'Mehl', 'bag', 'pantry'], ['cukor', 'Zucker', 'bag', 'pantry'], ['só', 'Salz', 'salt', 'pantry'], ['bors', 'Pfeffer', 'salt', 'pantry'],
  ['olaj', 'Öl', 'bottle', 'pantry'], ['olívaolaj', 'Olivenöl', 'bottle', 'pantry'], ['ecet', 'Essig', 'bottle', 'pantry'],
  ['méz', 'Honig', 'cup', 'pantry'], ['lekvár', 'Marmelade', 'cup', 'pantry'], ['müzli', 'Müsli', 'bag', 'pantry'],
  ['zabpehely', 'Haferflocken', 'bag', 'pantry'], ['kávé', 'Kaffee', 'bag', 'pantry'], ['tea', 'Tee', 'bottle', 'pantry'],
  ['ketchup', 'Ketchup', 'bottle', 'pantry'], ['mustár', 'Senf', 'bottle', 'pantry'], ['majonéz', 'Mayonnaise', 'bottle', 'pantry'],
  ['paradicsomszósz', 'Tomatensoße', 'bottle', 'pantry'], ['konzerv kukorica', 'Mais (Dose)', 'bag', 'pantry'],
  ['víz', 'Wasser', 'bottle', 'drinks'], ['ásványvíz', 'Mineralwasser', 'bottle', 'drinks'], ['szódavíz', 'Sprudelwasser', 'bottle', 'drinks'],
  ['narancslé', 'Orangensaft', 'bottle', 'drinks'], ['almalé', 'Apfelsaft', 'bottle', 'drinks'], ['üdítő', 'Limonade', 'bottle', 'drinks'],
  ['sör', 'Bier', 'bottle', 'drinks'], ['bor', 'Wein', 'bottle', 'drinks'], ['szörp', 'Sirup', 'bottle', 'drinks'],
  ['csoki', 'Schokolade', 'bag', 'sweets'], ['csokoládé', 'Schokolade', 'bag', 'sweets'], ['keksz', 'Kekse', 'bag', 'sweets'],
  ['gumicukor', 'Fruchtgummi', 'bag', 'sweets'], ['chips', 'Chips', 'bag', 'sweets'],
  ['jégkrém', 'Eis', 'cup', 'frozen'], ['fagyasztott pizza', 'Tiefkühlpizza', 'bag', 'frozen'], ['pizza', 'Pizza', 'bag', 'frozen'],
  ['wc papír', 'Toilettenpapier', 'bag', 'drugstore'], ['papírzsebkendő', 'Taschentücher', 'bag', 'drugstore'],
  ['fogkrém', 'Zahnpasta', 'bag', 'drugstore'], ['sampon', 'Shampoo', 'bottle', 'drugstore'], ['tusfürdő', 'Duschgel', 'bottle', 'drugstore'],
  ['szappan', 'Seife', 'bag', 'drugstore'], ['mosópor', 'Waschpulver', 'bag', 'drugstore'], ['mosogatószer', 'Spülmittel', 'bottle', 'drugstore'],
  ['pelenka', 'Windeln', 'bag', 'drugstore'], ['popsitörlő', 'Feuchttücher', 'bag', 'drugstore'], ['dezodor', 'Deo', 'bottle', 'drugstore'],
  ['szemeteszsák', 'Müllbeutel', 'bag', 'drugstore'], ['ablakmosó folyadék', 'Glasreiniger', 'bottle', 'drugstore'],
  ['ablakmosó', 'Glasreiniger', 'bottle', 'drugstore'], ['mosogatógép tabletta', 'Spülmaschinentabs', 'bag', 'drugstore'],
  ['babapiskóta', 'Löffelbiskuits', 'bag', 'sweets'], ['gumimaci', 'Gummibärchen', 'bag', 'sweets'], ['alufólia', 'Alufolie', 'bag', 'drugstore'],
];

// Rough German discounter price bands per category, in EUR. These are
// deliberately coarse ESTIMATES, always shown with "kb." and the label
// "becslés (kategória)", never as a fact.
export const PRICE_BAND = {
  dairy: [0.8, 2.5], bakery: [0.5, 2.5], produce: [0.8, 3], meat: [2.5, 7], pantry: [0.8, 3.5],
  drinks: [0.5, 3], sweets: [0.9, 2.5], frozen: [1.5, 4], drugstore: [1, 5],
};

export const STORE_TIP = {
  dairy: 'Lidl / Aldi', bakery: 'pékség vagy Lidl', produce: 'Lidl / Aldi', meat: 'Rewe / Edeka',
  pantry: 'Lidl / Aldi', drinks: 'Getränkemarkt vagy Lidl', sweets: 'Lidl / Aldi', frozen: 'Lidl / Aldi',
  drugstore: 'dm / Rossmann',
};

const norm = (s) => String(s || '').toLowerCase().normalize('NFC').trim();

// Longest-match lookup in either language; returns the entry or null.
export function lookup(text, lang) {
  const s = ' ' + norm(text) + ' ';
  let best = null;
  for (const e of DICT) {
    const key = norm(lang === 'de' ? e[1] : e[0]);
    if (!key) continue;
    if (s.includes(' ' + key + ' ') || s.trim() === key || s.includes(key)) {
      if (!best || key.length > norm(lang === 'de' ? best[1] : best[0]).length) best = e;
    }
  }
  return best;
}

// Brands sold in German supermarkets (plus a few Hungarian ones), used offline to
// move a brand typed into the item name over to the brand field.
export const BRANDS = [
  'Haribo', 'Milka', 'Ritter Sport', 'Lindt', 'Kinder', 'Ferrero', 'Nutella', 'Raffaello', 'Duplo', 'Hanuta', 'Toffifee', 'Merci',
  'Twix', 'Mars', 'Snickers', 'Bounty', 'KitKat', "M&M's", 'Oreo', 'Leibniz', 'Bahlsen', 'Balisto', 'Trolli', 'Katjes', 'Storck',
  'Mentos', 'Tic Tac', 'Pringles', 'Lorenz', 'funny-frisch', 'Chio', 'Barilla', 'Buitoni', 'Knorr', 'Maggi', 'Dr. Oetker', 'Iglo',
  "Ben's Original", "Uncle Ben's", 'Kölln', "Kellogg's", 'Nestlé', 'Nesquik', 'Seitenbacher', 'Heinz', "Hellmann's", 'Kühne',
  'Bonne Maman', 'Zentis', 'Nutri', 'Alpro', 'Danone', 'Activia', 'Müller', 'Ehrmann', 'Zott', 'Weihenstephan', 'Landliebe',
  'Bärenmarke', 'Arla', 'Kerrygold', 'Président', 'Philadelphia', 'Exquisa', 'Rama', 'Milbona', 'Milsani', 'Coca-Cola', 'Coca Cola',
  'Pepsi', 'Fanta', 'Sprite', 'Red Bull', 'Volvic', 'Gerolsteiner', 'Vittel', 'Hohes C', 'Capri-Sun', 'Jacobs', 'Tchibo',
  'Dallmayr', 'Lavazza', 'Teekanne', 'Meßmer', 'Hipp', 'Alete', 'Milupa', 'Aptamil', 'Bebivita', 'Pampers', 'Penaten', 'Nivea',
  'Dove', 'Colgate', 'Signal', 'Elmex', 'Oral-B', 'Gillette', 'Head & Shoulders', 'Schwarzkopf', 'Balea', 'Tempo', 'Zewa',
  'Finish', 'Somat', 'Persil', 'Ariel', 'Lenor', 'Frosch', 'Pril', 'Fairy', 'Sagrotan', 'Domestos', 'Meister Proper', 'Calgon',
  'Vanish', 'WC-Ente', 'Wagner', 'Rewe Beste Wahl', 'ja!', 'gut&günstig', 'K-Classic', 'Pöttyös', 'Túró Rudi', 'Sió', 'Pick',
  'Univer', 'Győri', 'Boci', 'Túrórudi', 'Golden Toast', 'Lieken', 'Harry', 'Mestemacher', 'Alnatura', 'Bio Company', 'Lorenz Snack-World',
  'Leerdammer', 'Bresso', 'Almette', 'Mövenpick', 'Valensina', 'Granini', 'Lipton', 'Ritter', 'Wasa', 'Ültje', 'Bauer', 'Exquisa', 'Weight Watchers',
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BRAND_RE = BRANDS.slice().sort((a, b) => b.length - a.length)
  .map((b) => [b, new RegExp('(^|[\\s,(])' + esc(b) + '(?=$|[\\s,)])', 'i')]);

// "Haribo tejes gumimaci" -> { brand: 'Haribo', rest: 'tejes gumimaci' }; null if no known brand.
// A name that is only the brand ("Nutella") keeps its name and also gets the brand.
export function splitBrand(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const [b, re] of BRAND_RE) {
    const m = t.match(re);
    if (!m) continue;
    const rest = (t.slice(0, m.index) + m[1] + t.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').replace(/^[\s,-]+|[\s,-]+$/g, '');
    return { brand: b, rest: rest || t };
  }
  return null;
}
