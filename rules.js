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
// Tríada pelada: las reglas de adorno solo entran donde hay sitio libre, para no
// proponer un maj7 sobre algo que ya lleva séptima ni una 9ª sobre un 9.
const isTriad = c => c.intervals.length === 3;
const isSeventh = c => c.intervals.length === 4;

// Escala mayor: semitonos, calidad de la tríada de cada grado y su cifrado.
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const DEGREE_QUALITY = ["maj", "min", "min", "maj", "maj", "min", "dim"];
const DEGREE_SUFFIX = { maj: "", min: "m", dim: "dim" };
const ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];

export const qualityOf = c => (isDominant(c) ? "dom" : isDim(c) ? "dim" : c.intervals.includes("3m") ? "min" : "maj");
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

// Qué le hace al acorde cada tipo de regla. Con dos docenas de reglas la lista
// se vuelve inmanejable si no se agrupa: no es lo mismo colorear el acorde que
// cambiarlo por otro o meter acordes nuevos que se comen su tiempo.
export const KINDS = [
  { id: "color", name: "Adornar", hint: "el mismo acorde con más notas: cambia el color, no la función" },
  { id: "sub", name: "Cambiar", hint: "otro acorde en su lugar, que hace el mismo papel" },
  { id: "approach", name: "Añadir", hint: "acordes que lo preparan o lo alargan, repartiéndose su tiempo" },
];

// Cada regla devuelve {chords, why}: los símbolos que sustituyen al acorde en su
// posición y de dónde sale la sustitución. Null si no aplica.
export const RULES = [
  {
    id: "tritone",
    name: "Sustitución de tritono",
    kind: "sub",
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
    kind: "sub",
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
    kind: "approach",
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
    kind: "approach",
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
    kind: "approach",
    // ponytail: solo el tono entero (arriba o abajo); otros huecos piden elegir camino
    apply: (c, next) => {
      if (!next) return null;
      const gap = (Note.chroma(next.tonic) - Note.chroma(c.tonic) + 12) % 12;
      if (gap !== 2 && gap !== 10) return null;
      const dim = up(c.tonic, gap === 2 ? 1 : 11) + "dim7";
      const dir = gap === 2 ? "sube" : "baja";
      return {
        chords: [c.symbol, dim],
        why: `${dim} rellena cromáticamente el paso entre ${c.symbol} y ${next.symbol}: el bajo ${dir} por semitonos y la sonoridad disminuida empuja hacia ${next.symbol}.`,
      };
    },
  },
  {
    id: "diatonicPassing",
    name: "Paso diatónico",
    kind: "approach",
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
    kind: "sub",
    apply: c => {
      if (!isMajorish(c)) return null;
      return {
        chords: [c.tonic + "m"],
        why: `${c.tonic}m está prestado del modo menor paralelo: mismo centro tonal (${c.tonic}) con la tercera menor, que oscurece el color sin romper la progresión.`,
      };
    },
  },
  {
    id: "mediant",
    name: "Mediante",
    kind: "sub",
    apply: c => {
      if (!isMajorish(c) || !isTriad(c)) return null;
      const sub = up(c.tonic, 4) + "m";
      return {
        chords: [sub],
        why: `${sub} comparte dos de las tres notas de ${c.symbol} (${up(c.tonic, 4)} y ${up(c.tonic, 7)}) y deja fuera la fundamental: hace el mismo papel con el suelo quitado, así que suena a lo mismo pero sin cerrar.`,
      };
    },
  },
  {
    id: "rootlessDominant",
    name: "Dominante sin fundamental",
    kind: "sub",
    apply: c => {
      if (!isDominant(c)) return null;
      const sub = up(c.tonic, 4) + "m7b5";
      return {
        chords: [sub],
        why: `${sub} (${up(c.tonic, 4)} ${up(c.tonic, 7)} ${up(c.tonic, 10)} ${up(c.tonic, 2)}) es ${c.tonic}9 quitándole el ${c.tonic}: mismo tritono, misma resolución, pero el bajo queda libre para hacer otra cosa.`,
      };
    },
  },
  {
    id: "dimDominant",
    name: "Disminuido dominante",
    kind: "sub",
    apply: c => {
      if (!isDominant(c)) return null;
      const sub = up(c.tonic, 4) + "dim7";
      return {
        chords: [sub],
        why: `${sub} es ${c.tonic}7b9 sin la fundamental: conserva el tritono ${up(c.tonic, 4)}–${up(c.tonic, 10)} y le añade la novena menor (${up(c.tonic, 8)}), que aprieta la resolución. Tira más que ${c.symbol}, sobre todo hacia un menor.`,
      };
    },
  },
  {
    id: "seventh",
    name: "Séptima diatónica",
    kind: "color",
    apply: (c, next, key) => {
      if (!isTriad(c)) return null;
      if (isMinorish(c)) {
        return {
          chords: [c.tonic + "m7"],
          why: `${c.tonic}m7 le añade la 7ª menor (${up(c.tonic, 10)}): mismo sitio y misma función, con una nota más que rellena el acorde sin ensuciarlo.`,
        };
      }
      if (!isMajorish(c)) return null;
      const dom = degreeIn(key, c.tonic) === 4; // el V pide séptima menor, no mayor
      const sub = c.tonic + (dom ? "7" : "maj7");
      return {
        chords: [sub],
        why: dom
          ? `${sub} le añade la 7ª menor (${up(c.tonic, 10)}): como V de ${PC[key]} mayor, esa nota forma con la tercera el tritono que pide resolver a la tónica.`
          : `${sub} le añade la 7ª mayor (${up(c.tonic, 11)}): el acorde se queda flotando en vez de cerrar, que es de donde sale el color de balada.`,
      };
    },
  },
  {
    id: "sixth",
    name: "Sexta",
    kind: "color",
    apply: c => {
      if (!isTriad(c) && !isSeventh(c)) return null;
      if (isMajorish(c)) {
        return {
          chords: [c.tonic + "6"],
          why: `${c.tonic}6 pone la 6ª (${up(c.tonic, 9)}) donde iría la séptima: rellena igual que un maj7 pero sin sonar a jazz, y cierra bien porque no deja tensión pendiente.`,
        };
      }
      if (isMinorish(c)) {
        return {
          chords: [c.tonic + "m6"],
          why: `${c.tonic}m6 sube la 6ª mayor (${up(c.tonic, 9)}) sobre el menor: es el color dórico, menor pero sin la caída del m7. Ojo, esa nota puede salirse de la tonalidad.`,
        };
      }
      return null;
    },
  },
  {
    id: "ninth",
    name: "Novena",
    kind: "color",
    apply: c => {
      const nine = up(c.tonic, 2);
      const add = (suffix, texto) => ({ chords: [c.tonic + suffix], why: texto });
      if (isTriad(c) && isMajorish(c)) {
        return add("add9", `${c.tonic}add9 añade la 9ª (${nine}) sin tocar la séptima: es la nota que hace que un acorde abierto de guitarra suene a disco y no a manual de acordes.`);
      }
      if (isTriad(c) && isMinorish(c)) {
        return add("madd9", `${c.tonic}madd9 añade la 9ª (${nine}) al menor sin séptima: queda transparente, con menos peso que un ${c.tonic}m9 pero con el mismo aire.`);
      }
      if (!isSeventh(c)) return null;
      if (isMinorish(c)) return add("m9", `${c.tonic}m9 apila la 9ª (${nine}) sobre ${c.symbol}: el menor con séptima gana altura sin cambiar de función.`);
      if (isMajorish(c) && c.intervals.includes("7M")) {
        return add("maj9", `${c.tonic}maj9 apila la 9ª (${nine}) sobre ${c.symbol}: la extensión más suave que admite un maj7, y en guitarra suele salir sola al soltar un dedo.`);
      }
      return null;
    },
  },
  {
    id: "dominantColor",
    name: "Tensión del dominante",
    kind: "color",
    apply: c => {
      if (!isDominant(c) || !isSeventh(c)) return null;
      return {
        chords: [c.tonic + "13"],
        why: `${c.tonic}13 le pone la 13ª (${up(c.tonic, 9)}) a ${c.symbol}: la tensión más dulce del dominante, la que se usa cuando se quiere color pero no que suene alterado.`,
      };
    },
  },
  {
    id: "alteredDominant",
    name: "Dominante alterado",
    kind: "color",
    apply: (c, next) => {
      if (!isDominant(c) || !isSeventh(c)) return null;
      if (next && isMinorish(next)) {
        return {
          chords: [c.tonic + "7b9"],
          why: `${c.tonic}7b9 añade la 9ª menor (${up(c.tonic, 1)}): pertenece a la escala del menor al que resuelve, así que aprieta la caída hacia ${next.symbol} en vez de suavizarla.`,
        };
      }
      return {
        chords: [c.tonic + "7#9"],
        why: `${c.tonic}7#9 hace sonar a la vez la tercera mayor (${up(c.tonic, 4)}) y la menor (${up(c.tonic, 3)}): el acorde de Hendrix, tensión de blues sin salirse del dominante.`,
      };
    },
  },
  {
    id: "sus4",
    name: "Retardo sus4",
    kind: "approach",
    apply: c => {
      const suspended = isDominant(c) && isSeventh(c) ? c.tonic + "7sus4"
        : (isTriad(c) || isSeventh(c)) && (isMajorish(c) || isMinorish(c)) ? c.tonic + "sus4"
        : null;
      if (!suspended) return null;
      return {
        chords: [suspended, c.symbol],
        why: `${suspended} retrasa la tercera: en su lugar suena la 4ª (${up(c.tonic, 5)}), que cae a ella al llegar ${c.symbol}. El acorde llega dos veces, primero pendiente y luego resuelto.`,
      };
    },
  },
  {
    id: "sus2",
    name: "Suspensión sus2",
    kind: "color",
    apply: c => {
      if (!isTriad(c) || !(isMajorish(c) || isMinorish(c))) return null;
      return {
        chords: [c.tonic + "sus2"],
        why: `${c.tonic}sus2 quita la tercera y pone la 2ª (${up(c.tonic, 2)}): el acorde se queda sin género, ni mayor ni menor, y deja que sea la melodía la que diga cuál de los dos es.`,
      };
    },
  },
  {
    id: "backdoor",
    name: "Dominante de puerta trasera",
    kind: "approach",
    apply: c => {
      if (!isMajorish(c)) return null;
      const sub = up(c.tonic, 10) + "7";
      return {
        chords: [sub, c.symbol],
        why: `${sub} es el bVII7 prestado del modo menor: no es el V de ${c.symbol}, pero resuelve igual porque su ${up(c.tonic, 8)} baja al ${up(c.tonic, 7)} y su ${up(c.tonic, 5)} al ${up(c.tonic, 4)}. Es la puerta de atrás del soul.`,
      };
    },
  },
  {
    id: "chromaticApproach",
    name: "Aproximación cromática",
    kind: "approach",
    apply: c => {
      const sub = up(c.tonic, 1) + "7";
      return {
        chords: [sub, c.symbol],
        why: `${sub} es el dominante que está justo un semitono por encima de ${c.symbol}, o sea el sustituto de tritono de su V: entra deslizándose desde arriba en vez de saltar desde la quinta.`,
      };
    },
  },
  {
    id: "plagalMinor",
    name: "Subdominante menor",
    kind: "approach",
    apply: c => {
      if (!isMajorish(c)) return null;
      const sub = up(c.tonic, 5) + "m";
      return {
        chords: [sub, c.symbol],
        why: `${sub} es el IV menor prestado del modo menor: su ${up(c.tonic, 8)} baja medio tono al ${up(c.tonic, 7)} de ${c.symbol}. Ese medio tono es el giro agridulce que cierra media discografía de los sesenta.`,
      };
    },
  },
  {
    id: "secondaryIIV",
    name: "ii-V secundario",
    kind: "approach",
    apply: c => {
      const ii = up(c.tonic, 2) + (isMinorish(c) ? "m7b5" : "m7");
      const v = up(c.tonic, 7) + "7";
      return {
        chords: [ii, v, c.symbol],
        why: `${ii} y ${v} son el ii–V propio de ${c.symbol}: en vez de llegar de golpe, el acorde se prepara con su cadencia prestada. Sirve para convertir un compás quieto en tres acordes.`,
      };
    },
  },
  {
    id: "minorLine",
    name: "Línea cromática interna",
    kind: "approach",
    apply: c => {
      if (!isMinorish(c) || !(isTriad(c) || isSeventh(c))) return null;
      const line = [c.tonic + "m", c.tonic + "mMaj7", c.tonic + "m7", c.tonic + "m6"];
      return {
        chords: line,
        why: `El acorde no cambia: baja una voz por dentro, ${c.tonic} → ${up(c.tonic, 11)} → ${up(c.tonic, 10)} → ${up(c.tonic, 9)}. El paso raro es ${c.tonic}mMaj7, y es justo el que hace la gracia.`,
      };
    },
  },
  {
    id: "majorLine",
    name: "Línea hacia el IV",
    kind: "approach",
    apply: (c, next) => {
      if (!next || !isMajorish(c) || !isTriad(c)) return null;
      if ((Note.chroma(next.tonic) - Note.chroma(c.tonic) + 12) % 12 !== 5) return null;
      return {
        chords: [c.symbol, c.tonic + "maj7", c.tonic + "7"],
        why: `Camino a ${next.symbol}: mientras el acorde se queda quieto, una voz baja ${c.tonic} → ${up(c.tonic, 11)} → ${up(c.tonic, 10)}, y al llegar a ${c.tonic}7 ya es el V de ${next.symbol}, así que la resolución cae sola.`,
      };
    },
  },
];

// Devuelve [{index, chord, kind, rule, replacement, why}] para toda la progresión.
// Dos reglas distintas pueden acabar proponiendo lo mismo para el mismo acorde
// (el V de la tonalidad ya es dominante, etc.): se queda la primera, que va antes
// en RULES y es la explicación más directa.
export function suggest(progression) {
  const key = detectKey(progression);
  const out = [];
  const seen = new Set();
  progression.forEach((c, i) => {
    for (const rule of RULES) {
      const r = rule.apply(c, progression[i + 1], key);
      if (!r) continue;
      const replacement = r.chords.join(" ");
      if (replacement === c.symbol || seen.has(`${i}|${replacement}`)) continue;
      seen.add(`${i}|${replacement}`);
      out.push({ index: i, chord: c.symbol, kind: rule.kind, rule: rule.name, replacement: r.chords, why: r.why });
    }
  });
  return out;
}
