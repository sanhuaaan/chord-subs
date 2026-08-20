import { normalize } from "./spelling.mjs";

// Una fila de Chordonomicon es una tira de acordes con las partes marcadas
// (<verse_1>, <chorus_1>…). Aquí se convierte en lo que jangle entiende por
// canción: partes con su progresión, con las repeticiones seguidas colapsadas
// y las partes que suenan igual fundidas en una, igual que hace parseTab con
// las transcripciones de Ultimate Guitar.
export function parts(chords) {
  if (!chords) return [];
  const sections = [];
  let current = null;
  for (const tok of chords.split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith("<")) {
      current = { name: tok.slice(1, -1), chords: [] };
      sections.push(current);
      continue;
    }
    const n = normalize(tok);
    if (!n) continue;
    const sym = n.sym + (n.bass && n.bass !== n.sym ? `/${n.bass}` : "");
    current ??= (sections.push({ name: "song", chords: [] }), sections.at(-1));
    if (current.chords.at(-1) !== sym) current.chords.push(sym);
  }
  const merged = new Map();
  for (const s of sections) {
    if (!s.chords.length) continue;
    const key = s.chords.join(" ");
    if (merged.has(key)) merged.get(key).name += `, ${s.name}`;
    else merged.set(key, s);
  }
  return [...merged.values()];
}
