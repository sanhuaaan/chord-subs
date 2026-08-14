import { Note } from "tonal";
import { qualityOf } from "./rules.js";
import { PC } from "./guitar.js";

// Cuerdas al aire de 6ª a 1ª como croma (E A D G B E).
const STRINGS = [["6ª", 4], ["5ª", 9], ["4ª", 2], ["3ª", 7], ["2ª", 11], ["1ª", 4]];

// Lista blanca de extensiones por calidad: semitonos desde la raíz → sufijo.
// Lo que no está aquí (b9, #11, b13…) se descarta: choca más que colorea.
const EXT = {
  maj: { 2: "add9", 5: "sus4", 9: "6", 11: "maj7" },
  min: { 2: "madd9", 5: "m11", 9: "m6", 10: "m7" },
  dom: { 2: "9", 5: "7sus4", 9: "13" },
};

// Para cada cejilla 0..maxFret, qué cuerdas al aire extienden cada acorde de la
// progresión (sin digitaciones: eso lo pone el guitarrista). Ordenado de más a
// menos color ganado: acordes cubiertos, luego extensiones totales, luego traste.
// ponytail: nombre naive sobre la raíz; Cmaj7 + 9 al aire sale como Cadd9, no Cmaj9
export function capoSuggestions(progression, maxFret = 7) {
  const chords = [...new Map(progression.map(c => [c.symbol, c])).values()];
  const out = [];
  for (let capo = 0; capo <= maxFret; capo++) {
    const perChord = [];
    for (const c of chords) {
      const ext = EXT[qualityOf(c)];
      if (!ext) continue; // dim: sin extensiones de cuerda al aire
      const root = Note.chroma(c.tonic);
      const tones = new Set(c.notes.map(Note.chroma));
      const seen = new Set();
      const extensions = [];
      for (const [string, base] of STRINGS) {
        const sounding = (base + capo) % 12;
        const suffix = ext[(sounding - root + 12) % 12];
        if (!suffix || tones.has(sounding) || seen.has(suffix)) continue;
        seen.add(suffix);
        extensions.push({ string, note: PC[sounding], as: c.tonic + suffix });
      }
      if (extensions.length) perChord.push({ chord: c.symbol, extensions });
    }
    if (perChord.length) out.push({ capo, perChord });
  }
  const total = p => p.perChord.reduce((n, x) => n + x.extensions.length, 0);
  return out.sort((a, b) => b.perChord.length - a.perChord.length || total(b) - total(a) || a.capo - b.capo);
}
