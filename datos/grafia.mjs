import { Chord, Note } from "tonal";
import { noteName } from "../notes.js";

// Chordonomicon escribe los acordes con su propia grafía: la 's' es sostenido
// (Fs = F#), 'min' es menor y 'no3d' es un acorde sin tercera. Traducirla es casi
// todo el trabajo; lo que queda son cifrados que tonal no sabe leer, y para esos
// hay una escalera de simplificaciones que va quitando color hasta que algo parsea.

// La 's' de sostenido nunca es la de 'sus': ni al empezar el acorde (Ds es D#,
// Dsus4 no) ni dentro de la calidad (s9 es #9, pero la de 7sus4 no lo es).
const sostenido = (letra, marca) => letra + (marca === "s" ? "#" : marca === "b" ? "b" : "");
const ROOT = /^([A-G])(s(?!us)|b)?/;
const BASS = /^([A-G])(s|b)?$/;

// Reescrituras directas: mismo sonido, nombre que tonal entiende.
const REESCRITO = [
  [/^no3d$/, "5"],          // sin tercera: acorde de quinta
  [/minmaj/g, "mMaj"],      // menor con séptima mayor
  [/min/g, "m"],
  [/add13/g, "6"],          // la 13ª sin séptima es la 6ª
  [/madd11/g, "m"],         // tonal no lee add11; se queda la tríada
  [/add11/g, ""],
];

export function traducir(token) {
  const m = token.match(ROOT);
  if (!m) return null;
  const root = sostenido(m[1], m[2]);
  let resto = token.slice(m[0].length), bajo = null;
  const barra = resto.indexOf("/");
  if (barra >= 0) {
    const bm = resto.slice(barra + 1).match(BASS);
    if (bm) bajo = sostenido(bm[1], bm[2]);
    resto = resto.slice(0, barra);
  }
  let q = resto;
  for (const [re, a] of REESCRITO) q = q.replace(re, a);
  q = q.replace(/(?<!su)s(\d)/g, "#$1").replace(/(\d)s(?!us)/g, "#$1");
  return { root, q, bajo };
}

// Escalera: primero se quitan alteraciones (b9, #11…), luego se baja la extensión
// (13 → 11 → 9 → 7) y al final se deja la tríada. Cada peldaño pierde color pero
// conserva la función, que es lo que hace falta para leer una progresión.
const PELDANOS = [
  q => q.replace(/(#|b)\d+/g, ""),
  q => q.replace(/13/, "11"),
  q => q.replace(/11/, "9"),
  q => q.replace(/9/, "7"),
  q => q.replace(/(maj|Maj)?7/g, ""),
  q => (q.match(/^(mMaj|m|dim|aug|sus2|sus4|5)/) || [""])[0],
];

// La calidad nunca puede cambiar la fundamental: sin esta comprobación, un
// A13b al que la escalera le ha quitado el 13 se leería como Ab, que es otro acorde.
const lee = (root, q) => {
  const c = Chord.get(root + q);
  return c.tonic === root ? root + q : null;
};

// Chordonomicon mezcla grafías (Ds y Eb son el mismo traste y aparecen los dos).
// Al entrar en jangle se escribe todo con la tabla de la app, que es la que usa
// el resto de la interfaz: así una progresión del catálogo se lee igual que una
// tecleada a mano.
const comoJangle = nota => noteName(Note.chroma(nota));

// { sym, bajo, exacto }, o null si ni la tríada sale.
export function normaliza(token) {
  const t = traducir(token);
  if (!t) return null;
  const bajo = t.bajo && comoJangle(t.bajo);
  const root = comoJangle(t.root);
  const directo = lee(root, t.q);
  if (directo) return { sym: directo, bajo, exacto: true };
  let q = t.q;
  for (const peldano of PELDANOS) {
    const siguiente = peldano(q);
    if (siguiente === q) continue;
    q = siguiente;
    const sym = lee(root, q);
    if (sym) return { sym, bajo, exacto: false };
  }
  return lee(root, "") ? { sym: root, bajo, exacto: false } : null;
}
