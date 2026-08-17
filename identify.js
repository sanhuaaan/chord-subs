import { Note } from "tonal";
import { PC, STRINGS } from "./guitar.js";

// Cómo llama un guitarrista a cada distancia en semitonos desde la fundamental.
// Va por cromas y no por grafía, así que da igual que la nota esté escrita Eb o
// D#; a cambio, los grados que suenan igual pero se leen distinto van juntos.
const DEGREE = [
  "fundamental", "b9", "9ª", "3ª menor", "3ª mayor", "4ª / 11ª",
  "5ª disminuida / #11", "5ª justa", "5ª aumentada / b13", "6ª / 13ª", "7ª menor", "7ª mayor",
];

// Lo mismo cifrado, para escribirlo junto a la cuerda en el mástil.
const DEGREE_SHORT = ["1", "b9", "9", "b3", "3", "11", "b5", "5", "#5", "13", "b7", "7"];

const step = (root, note) => (Note.chroma(note) - Note.chroma(root) + 12) % 12;
export const degreeName = (root, note) => DEGREE[step(root, note)];
export const degreeShort = (root, note) => DEGREE_SHORT[step(root, note)];

// Tensiones que sobran una vez colocados tercera, quinta y séptima. Se leen
// distinto según haya séptima o no: el mismo Ab sobre C es b13 en un dominante
// y b6 a secas en una tríada. El número ordena el cifrado (b6 antes que b9).
const TENSION = {
  1: [9, "b9"],
  2: [9, "9"],
  3: [9, "#9"],
  5: [11, "11"],
  6: [11, "#11"],
  8: [6, "b6", 13, "b13"],
  9: [6, "6", 13, "13"],
  11: [7, "maj7"],
};

// Sufijos que un guitarrista lee de un vistazo. Son el repertorio que manejan
// guitar.js y capo.js, y sirven para que la lectura evidente gane a la
// rebuscada: tres notas C-E-G son "C" antes que "Em#5" con C en el bajo.
const COMMON = new Set([
  "", "m", "5", "7", "m7", "maj7", "mmaj7", "6", "m6", "sus2", "sus4", "7sus4",
  "dim", "dim7", "aug", "m7b5", "add9", "madd9", "9", "m9", "maj9", "11", "m11", "13", "6/9",
]);

// Dos notas no hacen tríada, pero el intervalo ya dice bastante: la 5ª justa es
// el acorde de quinta de toda la vida, y la 3ª decide el carácter. Las sextas son
// esas mismas terceras vistas desde la otra nota, y salen solas al leer desde
// ella (C-A es C6 desde C y Am desde A). Se cifran diciendo lo que NO suena, para
// no prometer una quinta que no está; el desglose de grados de debajo es lo que
// de verdad informa cuando el intervalo no es ninguno de los tres corrientes.
const DYAD = [
  null, "(b9,no3,no5)", "sus2(no5)", "m(no5)", "(no5)", "sus4(no5)",
  "(b5,no3)", "5", "(#5,no3)", "6(no3,no5)", "7(no3,no5)", "maj7(no3,no5)",
];

// Cifra un conjunto de semitonos desde la fundamental como se escribiría en un
// cancionero. Va consumiendo intervalos —tercera, quinta, séptima, sexta— y lo
// que sobra se cuelga como tensión, así que siempre sale un nombre aunque el
// conjunto sea raro: es lo que permite ofrecer una lectura por cada nota.
export function spell(steps) {
  // Dos notas contando la fundamental: no hay tríada que consumir, el intervalo es
  // todo lo que hay. Ojo, dos notas SIN la fundamental siguen el camino normal: no
  // son un intervalo pelado sino notas guía, y B-F sobre G es un G7 en condiciones.
  if (steps.size === 2 && steps.has(0)) return DYAD[[...steps].find(n => n !== 0)];

  const rest = new Set(steps);
  rest.delete(0);
  const take = n => { const hit = rest.has(n); rest.delete(n); return hit; };

  const third = take(4) ? "M" : take(3) ? "m" : null;
  // La quinta solo se lee alterada si hay tercera que la sostenga: sin ella, un
  // Ab sobre C es una b6 y no una #5, y un Gb es una #11 y no una b5.
  const fifth = take(7) ? "P" : third === "m" && take(6) ? "d" : third === "M" && take(8) ? "A" : null;
  const seventh = take(10) ? "m" : take(11) ? "M" : null;
  const sixth = !seventh && take(9);

  const tensions = () => [...rest]
    .map(n => TENSION[n] ?? [99, DEGREE_SHORT[n]])
    .map(t => (seventh && t.length > 2 ? [t[2], t[3]] : [t[0], t[1]]))
    .sort((a, b) => a[0] - b[0])
    .map(t => t[1])
    .join("");

  // Atajos consagrados: nadie escribe "mb5bb7" pudiendo escribir "dim7".
  if (third === "m" && fifth === "d") {
    if (sixth) return "dim7" + tensions();
    if (seventh === "m") return "m7b5" + tensions();
    if (!seventh) return "dim" + tensions();
  }
  if (third === "M" && fifth === "A" && !seventh && !sixth) return "aug" + tensions();

  // La séptima absorbe las extensiones que tenga debajo: 7 → 9 → 11 → 13. La 11ª
  // solo sube al cifrado si viene con la 9ª; sola sobre un dominante sin tercera
  // es la cuarta suspendida de un 7sus4.
  let stack = 0;
  let body = "";
  if (seventh) {
    stack = rest.has(9) ? 13 : rest.has(5) && rest.has(2) ? 11 : rest.has(2) ? 9 : 7;
    if (stack >= 9) rest.delete(2);
    if (stack >= 13) rest.delete(9);
    body = seventh === "M" ? (stack === 7 ? "maj7" : `maj${stack}`) : String(stack);
  } else if (sixth) {
    body = take(2) ? "6/9" : "6";
  } else if (third && take(2)) {
    body = "add9";
  }
  const stacked4 = stack >= 11 && rest.delete(5); // la 4ª ya la nombra el cifrado

  // Sin tercera el acorde está suspendido; sin cuarta ni segunda es una quinta.
  const head = third === "m" ? "m" : third === "M" ? ""
    : stacked4 ? (stack === 11 ? "" : "sus4")
    : take(5) ? "sus4" : take(2) ? "sus2" : "5";

  // La séptima se escribe antes de la suspensión: 7sus4, no sus47.
  const sus = head.startsWith("sus");
  const core = (sus ? body + head : (head === "5" && body ? "" : head) + body)
    + (fifth === "A" ? "#5" : fifth === "d" ? "b5" : "");

  // Separador cuando dos cifras quedarían pegadas: G6 con 11ª es G6/11, no G611.
  const t = tensions();
  return core + (/\d$/.test(core) && /^\d/.test(t) ? "/" : "") + t;
}

// Notas que suenan, de grave a aguda. La primera es el bajo, que es lo que
// distingue C de C/E. Ojo: con formas altas la 3ª cuerda puede sonar por encima
// de la 2ª, por eso se ordena por altura real y no por número de cuerda.
export function soundingNotes(frets) {
  return frets
    .map((f, i) => (f < 0 ? null : { string: STRINGS[i][0], stringIdx: i, fret: f, midi: STRINGS[i][1] + f }))
    .filter(Boolean)
    .map(n => ({ ...n, note: PC[n.midi % 12] }))
    .sort((a, b) => a.midi - b.midi);
}

// Primero las lecturas que un guitarrista daría por buenas: fundamental en el
// bajo, cifrado corriente y sin alteraciones de más.
const score = (suffix, isBass) =>
  (isBass ? 3 : 0) + (COMMON.has(suffix) ? 4 : 0) - (suffix.match(/[#b]/g) ?? []).length - (suffix.includes("add") ? 1 : 0);

// Qué acorde forman las pulsaciones marcadas. Las mismas notas admiten tantos
// nombres como notas tengan, según cuál se tome por fundamental, y todos son
// correctos: se devuelve uno por cada una, ordenados por lo probable que es que
// sea el que el guitarrista tenía en mente. La más grave manda en el cifrado,
// así que las que no la tienen por fundamental salen como inversión (X/bajo).
// ponytail: con una sola nota no hay nada que nombrar; desde dos sí
export function identify(frets) {
  const notes = soundingNotes(frets);
  const pcs = [...new Set(notes.map(n => n.note))]; // Set conserva el orden: pcs[0] es el bajo
  if (pcs.length < 2) return { notes, pcs, candidates: [] };

  const bass = pcs[0];
  const read = (root, rootless) => {
    const suffix = spell(new Set(pcs.map(n => step(root, n))));
    const inversion = root !== bass;
    return {
      symbol: root + suffix + (inversion ? `/${bass}` : ""),
      root,
      suffix,
      inversion,
      rootless,
      score: score(suffix, !inversion),
      degrees: pcs.map(note => ({ note, degree: degreeName(root, note) })),
    };
  };

  // Notas guía: la 3ª da el carácter y la 7ª es la que hace echar de menos una
  // fundamental. Sin las dos, una fundamental ausente no se sostiene.
  const guide = root => {
    const s = pcs.map(n => step(root, n));
    return (s.includes(3) || s.includes(4)) && (s.includes(10) || s.includes(11));
  };

  // Con dos notas la fundamental ausente sería una de las dos que faltan de cuatro:
  // demasiada suposición, y el intervalo ya se nombra solo. Salvo el tritono, que
  // no puede ser otra cosa que la 3ª y la 7ª de un dominante: ahí la lectura sin
  // fundamental dice mucho más que el intervalo pelado.
  const enough = pcs.length > 2 || step(pcs[0], pcs[1]) === 6;

  // Acordes sin fundamental: en un voicing de jazz la fundamental se le deja al
  // bajo y la guitarra toca solo lo que define el acorde, así que B-D-F no es un
  // Bdim cualquiera, es el G7 al que le falta el G. Se prueban como fundamental
  // las notas que no suenan, y solo pasan las que dejan un cifrado corriente con
  // notas guía; sin ese filtro cada acorde arrastraría una docena de lecturas
  // rebuscadas, que es lo que hace inútil una lista de lecturas.
  const rootless = (enough ? PC : [])
    .filter(root => !pcs.includes(root))
    .map(root => read(root, true))
    .filter(c => COMMON.has(c.suffix) && guide(c.root));

  // Las lecturas cuya fundamental suena van siempre delante: son las notas que el
  // guitarrista tiene pisadas, y lo que falta es siempre más discutible.
  const candidates = [...pcs.map(root => read(root, false)), ...rootless]
    .sort((a, b) => (a.rootless ? 1 : 0) - (b.rootless ? 1 : 0) || b.score - a.score);
  return { notes, pcs, candidates };
}
