import { Chord, Note } from "tonal";
import { PC } from "./guitar.js";

export function parseProgression(text) {
  return text.split(/[\s|,]+/).filter(Boolean).map(sym => {
    const c = Chord.get(sym);
    if (!c.tonic) throw new Error(`Acorde no reconocido: ${sym}`);
    return c;
  });
}

// Transposición por cromas usando las grafías de la BD de guitarra (C# y no Db, Eb y no D#…).
const up = (note, semis) => PC[(Note.chroma(note) + semis) % 12];

const isDominant = c => c.intervals.includes("3M") && c.intervals.includes("7m");
const isMajorish = c => c.intervals.includes("3M") && !c.intervals.includes("7m");
const isMinorish = c => c.intervals.includes("3m") && !c.intervals.includes("5d");

// Cada regla devuelve {chords, why}: los símbolos que sustituyen al acorde en su
// posición y de dónde sale la sustitución. Null si no aplica.
export const RULES = [
  {
    id: "tritone",
    name: "Sustitución de tritono",
    apply: c => {
      if (!isDominant(c)) return null;
      const sub = up(c.tonic, 6) + "7";
      return {
        chords: [sub],
        why: `${sub} comparte con ${c.symbol} el tritono ${up(c.tonic, 4)}–${up(c.tonic, 10)} (3ª y 7ª), que es lo que pide resolver: ambos dominantes resuelven en el mismo sitio.`,
      };
    },
  },
  {
    id: "relative",
    name: "Relativo",
    apply: c => {
      if (isMajorish(c)) {
        const sub = up(c.tonic, 9) + "m";
        return {
          chords: [sub],
          why: `${sub} es el relativo menor de ${c.symbol}: comparten ${c.tonic} y ${up(c.tonic, 4)}, así que cumple la misma función con color menor.`,
        };
      }
      if (isMinorish(c)) {
        const sub = up(c.tonic, 3);
        return {
          chords: [sub],
          why: `${sub} es el relativo mayor de ${c.symbol}: comparten ${up(c.tonic, 3)} y ${up(c.tonic, 7)}, así que cumple la misma función con color mayor.`,
        };
      }
      return null;
    },
  },
  {
    id: "secondaryDominant",
    name: "Dominante secundario",
    apply: c => {
      const v7 = up(c.tonic, 7) + "7";
      return {
        chords: [v7, c.symbol],
        why: `${v7} es el V7 de ${c.symbol}: un dominante prestado que crea tensión y resuelve directamente sobre él.`,
      };
    },
  },
  {
    id: "iiV",
    name: "Inserción ii-V",
    apply: c => {
      if (!isDominant(c)) return null;
      const ii = up(c.tonic, 7) + "m7";
      return {
        chords: [ii, c.symbol],
        why: `${ii} es el ii asociado a ${c.symbol}: convierte el dominante suelto en una cadencia ii–V completa, el giro más común del jazz.`,
      };
    },
  },
  {
    id: "dimPassing",
    name: "Disminuido de paso",
    // ponytail: solo ascenso por tono entero; descendente/cromático cuando haga falta
    apply: (c, next) => {
      if (!next) return null;
      const gap = (Note.chroma(next.tonic) - Note.chroma(c.tonic) + 12) % 12;
      if (gap !== 2) return null;
      const dim = up(c.tonic, 1) + "dim7";
      return {
        chords: [c.symbol, dim],
        why: `${dim} rellena cromáticamente el paso entre ${c.symbol} y ${next.symbol}: el bajo sube por semitonos y la sonoridad disminuida empuja hacia ${next.symbol}.`,
      };
    },
  },
  {
    id: "modalInterchange",
    name: "Intercambio modal",
    apply: c => {
      if (!isMajorish(c)) return null;
      return {
        chords: [c.tonic + "m"],
        why: `${c.tonic}m está prestado del modo menor paralelo: mismo centro tonal (${c.tonic}) con la tercera menor, que oscurece el color sin romper la progresión.`,
      };
    },
  },
];

// Devuelve [{index, chord, rule, replacement, why}] para toda la progresión.
export function suggest(progression) {
  const out = [];
  progression.forEach((c, i) => {
    for (const rule of RULES) {
      const r = rule.apply(c, progression[i + 1]);
      if (r && r.chords.join(" ") !== c.symbol) {
        out.push({ index: i, chord: c.symbol, rule: rule.name, replacement: r.chords, why: r.why });
      }
    }
  });
  return out;
}

// Progresión completa con la sugerencia aplicada.
export function applySuggestion(progression, suggestion) {
  const symbols = progression.map(c => c.symbol);
  symbols.splice(suggestion.index, 1, ...suggestion.replacement);
  return symbols;
}
