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
const isDim = c => c.intervals.includes("5d");

// Escala mayor: semitonos, calidad de la tríada de cada grado y su cifrado.
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_QUALITY = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const DEGREE_SUFFIX = { maj: "", min: "m", dim: "dim" };
const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

const qualityOf = c => (isDominant(c) ? "dom" : isDim(c) ? "dim" : c.intervals.includes("3m") ? "min" : "maj");
const degreeIn = (key, tonic) => MAJOR_STEPS.indexOf((Note.chroma(tonic) - key + 12) % 12);
const diatonicChord = (key, deg) => PC[(key + MAJOR_STEPS[deg]) % 12] + DEGREE_SUFFIX[DEGREE_QUALITY[deg]];

// Tonalidad mayor que mejor encaja con la progresión (croma de la tónica).
// ponytail: solo tonalidades mayores; el modo menor cuando haga falta
export function detectKey(progression) {
  let best = 0;
  let bestScore = -1;
  for (let k = 0; k < 12; k++) {
    let score = 0;
    for (const c of progression) {
      const deg = degreeIn(k, c.tonic);
      if (deg === -1) continue;
      const q = qualityOf(c);
      score += q === DEGREE_QUALITY[deg] || (q === "dom" && deg === 4) ? 2 : 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = k;
    }
  }
  return best;
}

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
    id: "diatonicPassing",
    name: "Paso diatónico",
    // ponytail: solo saltos de tercera (dos grados); saltos mayores requieren elegir camino
    apply: (c, next, key) => {
      if (!next) return null;
      const degC = degreeIn(key, c.tonic);
      const degN = degreeIn(key, next.tonic);
      if (degC === -1 || degN === -1) return null;
      const diff = (degN - degC + 7) % 7;
      if (diff !== 2 && diff !== 5) return null;
      const mid = (degC + (diff === 2 ? 1 : -1) + 7) % 7;
      const midChord = diatonicChord(key, mid);
      return {
        chords: [c.symbol, midChord],
        why: `${midChord} es el ${ROMAN[mid]} de ${PC[key]} mayor: une ${c.symbol} y ${next.symbol} ${diff === 2 ? "subiendo" : "bajando"} grado a grado por la escala, sin salir de la tonalidad.`,
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
  const key = detectKey(progression);
  const out = [];
  progression.forEach((c, i) => {
    for (const rule of RULES) {
      const r = rule.apply(c, progression[i + 1], key);
      if (r && r.chords.join(" ") !== c.symbol) {
        out.push({ index: i, chord: c.symbol, rule: rule.name, replacement: r.chords, why: r.why });
      }
    }
  });
  return out;
}
