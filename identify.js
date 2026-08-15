import { Chord, Note } from "tonal";
import { PC, STRINGS } from "./guitar.js";

// Cómo llama un guitarrista a cada distancia en semitonos desde la fundamental.
// Va por cromas y no por grafía, así que da igual que la nota esté escrita Eb o
// D#; a cambio, los grados que suenan igual pero se leen distinto van juntos.
const DEGREE = [
  "fundamental", "b9", "9ª", "3ª menor", "3ª mayor", "4ª / 11ª",
  "5ª disminuida / #11", "5ª justa", "5ª aumentada / b13", "6ª / 13ª", "7ª menor", "7ª mayor",
];

export const degreeName = (root, note) => DEGREE[(Note.chroma(note) - Note.chroma(root) + 12) % 12];

// Cifrados que un guitarrista lee de un vistazo (alias canónico de tonal: el
// mismo repertorio que manejan guitar.js y capo.js). Sirven para que la lectura
// evidente gane a la rebuscada: C mayor es "C", no "Em#5/C".
const COMMON = new Set([
  "M", "m", "5", "7", "m7", "maj7", "mmaj7", "6", "m6", "sus2", "sus4", "7sus4",
  "dim", "dim7", "aug", "m7b5", "Madd9", "madd9", "9", "m9", "maj9", "11", "m11", "13", "6add9",
]);

// Notas que suenan, de grave a aguda. La primera es el bajo, que es lo que
// distingue C de C/E. Ojo: con formas altas la 3ª cuerda puede sonar por encima
// de la 2ª, por eso se ordena por altura real y no por número de cuerda.
export function soundingNotes(frets) {
  return frets
    .map((f, i) => (f < 0 ? null : { string: STRINGS[i][0], fret: f, midi: STRINGS[i][1] + f }))
    .filter(Boolean)
    .map(n => ({ ...n, note: PC[n.midi % 12] }))
    .sort((a, b) => a.midi - b.midi);
}

// tonal cifra la tríada mayor como "CM" y el add9 como "CMadd9"; aquí se escribe
// como en un cancionero.
function pretty(symbol) {
  const c = Chord.get(symbol);
  const alias = c.aliases[0] ?? "";
  const suffix = alias === "M" ? "" : alias.replace(/^M(?=[a-z])/, "").replace(/^M(?=\d)/, "maj");
  return c.tonic + suffix + (c.bass ? `/${c.bass}` : "");
}

// Primero las lecturas que un guitarrista daría por buenas: fundamental en el
// bajo, cifrado corriente y sin alteraciones de más.
function score(symbol) {
  const alias = Chord.get(symbol).aliases[0] ?? "";
  return (Chord.get(symbol).bass ? 0 : 3) + (COMMON.has(alias) ? 4 : 0) - (alias.match(/[#b]/g) ?? []).length;
}

// Qué acorde forman las pulsaciones marcadas. Devuelve las notas que suenan y
// hasta `max` lecturas posibles, cada una con el papel que juega cada nota.
// El mismo puñado de notas admite varios nombres y todos son correctos: se
// ordenan por lo probable que es que sea el que el guitarrista tenía en mente.
// ponytail: sin acordes de una o dos notas (tonal solo nombra la quinta)
export function identify(frets, max = 3) {
  const notes = soundingNotes(frets);
  const pcs = [...new Set(notes.map(n => n.note))]; // Set conserva el orden: pcs[0] es el bajo
  const candidates = Chord.detect(pcs, { assumePerfectFifth: true })
    .sort((a, b) => score(b) - score(a))
    .slice(0, max)
    .map(sym => {
      const c = Chord.get(sym);
      return {
        symbol: pretty(sym),
        root: c.tonic,
        inversion: Boolean(c.bass),
        degrees: pcs.map(note => ({ note, degree: degreeName(c.tonic, note) })),
      };
    });
  return { notes, pcs, candidates };
}
