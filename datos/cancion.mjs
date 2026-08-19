import { normaliza } from "./grafia.mjs";

// Una fila de Chordonomicon es una tira de acordes con las partes marcadas
// (<verse_1>, <chorus_1>…). Aquí se convierte en lo que jangle entiende por
// canción: partes con su progresión, con las repeticiones seguidas colapsadas
// y las partes que suenan igual fundidas en una, igual que hace parseTab con
// las transcripciones de Ultimate Guitar.
export function partes(chords) {
  if (!chords) return [];
  const secciones = [];
  let actual = null;
  for (const tok of chords.split(/\s+/)) {
    if (!tok) continue;
    if (tok.startsWith("<")) {
      actual = { nombre: tok.slice(1, -1), acordes: [] };
      secciones.push(actual);
      continue;
    }
    const n = normaliza(tok);
    if (!n) continue;
    const sym = n.sym + (n.bajo && n.bajo !== n.sym ? `/${n.bajo}` : "");
    actual ??= (secciones.push({ nombre: "song", acordes: [] }), secciones.at(-1));
    if (actual.acordes.at(-1) !== sym) actual.acordes.push(sym);
  }
  const fundidas = new Map();
  for (const s of secciones) {
    if (!s.acordes.length) continue;
    const clave = s.acordes.join(" ");
    if (fundidas.has(clave)) fundidas.get(clave).nombre += `, ${s.nombre}`;
    else fundidas.set(clave, s);
  }
  return [...fundidas.values()];
}
