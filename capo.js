import { Chord, Note } from "tonal";
import { qualityOf, transposeSymbol, intervalTo, optionsFor } from "./rules.js";
import { dbSpelling, playablePositions, MAX_FRET, STRINGS } from "./guitar.js";
import { noteName } from "./notes.js";

// Forma que se toca (relativa a la cejilla) para que suene `symbol` con cejilla
// en `capo`: el mismo acorde transpuesto hacia abajo tantos semitonos como trastes.
// El destino se nombra con la grafía de la base de datos de diagramas y no con la
// de la tonalidad, porque aquí se nombra una forma que se toca, no un acorde de
// la canción, y es esa grafía la que tiene dibujo.
export const shapeSymbol = (symbol, capo) => {
  const tonic = Chord.get(symbol).tonic;
  const down = dbSpelling(noteName(Note.chroma(tonic) - capo));
  return transposeSymbol(symbol, intervalTo(tonic, down));
};

// Lista blanca de extensiones por calidad: semitonos desde la raíz → sufijo.
// Lo que no está aquí (b9, #11, b13…) se descarta: choca más que colorea.
// Hay tabla aparte para cuando el acorde ya lleva séptima, porque la séptima
// sigue sonando y el nombre tiene que contarlo: la novena al aire sobre un maj7
// da un maj9, no un add9, y sobre un m7 un m9, no un madd9.
const EXT = {
  maj: { 2: "add9", 5: "sus4", 9: "6", 11: "maj7" },
  maj7: { 2: "maj9", 5: "sus4", 9: "maj13" },
  min: { 2: "madd9", 5: "m11", 9: "m6", 10: "m7" },
  min7: { 2: "m9", 5: "m11", 9: "m13" },
  dom: { 2: "9", 5: "7sus4", 9: "13" },
};

// Qué tabla toca: la calidad, y si ya hay séptima, su versión con séptima.
const extTable = c => {
  const kind = qualityOf(c);
  if (kind === "maj" && c.intervals.includes("7M")) return EXT.maj7;
  if (kind === "min" && c.intervals.includes("7m")) return EXT.min7;
  return EXT[kind];
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
      const ext = extTable(c);
      if (!ext) continue; // dim: sin extensiones de cuerda al aire
      const root = Note.chroma(c.tonic);
      const tones = new Set(c.notes.map(Note.chroma));
      const seen = new Set();
      const extensions = [];
      for (const [i, [string, open]] of STRINGS.entries()) {
        const sounding = (open + capo) % 12; // solo importa el croma de la cuerda pisada por la cejilla
        const suffix = ext[(sounding - root + 12) % 12];
        if (!suffix || tones.has(sounding) || seen.has(suffix)) continue;
        seen.add(suffix);
        extensions.push({ string, stringIdx: i, note: noteName(sounding), as: c.tonic + suffix });
      }
      if (extensions.length) perChord.push({ chord: c.symbol, extensions });
    }
    if (perChord.length) out.push({ capo, perChord });
  }
  const total = p => p.perChord.reduce((n, x) => n + x.extensions.length, 0);
  return out.sort((a, b) => b.perChord.length - a.perChord.length || total(b) - total(a) || a.capo - b.capo);
}

// ── Arreglo con cuerdas al aire ─────────────────────────────────────────────
//
// Lo de arriba dice qué colores pone a tu alcance cada cejilla; esto dice cómo
// se toca la progresión para aprovecharlos. Se busca la cadena de digitaciones
// que haga sonar el máximo de cuerdas al aire y deje quietas el máximo de notas
// al cambiar de acorde, que en guitarra son la misma cosa: una cuerda al aire
// común a dos acordes seguidos no es que se comparta, es que sigue sonando sola
// mientras la mano se va a otro sitio.

// Cuánto vale cada cosa. Son los números que definen el sonido que se busca, así
// que están juntos y con nombre en vez de repartidos por las fórmulas.
const VALE = {
  aire: 3,          // cada cuerda al aire del acorde
  quieta: 2,        // nota que no se mueve: misma cuerda y mismo traste que antes
  quietaAlAire: 2,  // y si esa nota quieta era al aire, cuenta doble: no se toca ni al cambiar
  comun: 0.5,       // la misma nota en otro sitio del mástil
  adorno: 1,        // peaje por no dejar el acorde como estaba
  mano: 0.4,        // por traste que salta la mano entre dos posturas
};

const alAire = frets => frets.filter(f => f === 0).length;
const pcs = frets => new Set(frets.map((f, i) => (f < 0 ? -1 : (STRINGS[i][1] + f) % 12)).filter(x => x >= 0));

// Solo adornos: add9, sus2, 6, maj7, m7… Cambian el color pero no la función, que
// es justo lo que una cuerda al aire le hace a un acorde. Sustituirlo por otro o
// meterle acordes delante ya sería rearmonizar, y para eso está su pestaña.
const esAdorno = o => !o.rule || o.kind === "color";

const costeNodo = n => -VALE.aire * n.aire + (n.rule ? VALE.adorno : 0);

const costeEnlace = (a, b) => {
  let quietas = 0;
  let quietasAlAire = 0;
  a.frets.forEach((f, i) => {
    if (f < 0 || f !== b.frets[i]) return;
    quietas++;
    if (f === 0) quietasAlAire++;
  });
  const comunes = [...a.pcs].filter(x => b.pcs.has(x)).length;
  return -VALE.quieta * quietas - VALE.quietaAlAire * quietasAlAire - VALE.comun * comunes
    + VALE.mano * Math.abs(b.baseFret - a.baseFret);
};

// Camino mínimo por capas: cada acorde ofrece sus adornos y cada adorno sus
// digitaciones, y lo que se paga por encadenar dos es lo que se pierde de
// resonancia. Sin presupuesto de cambios como en la rearmonización: aquí ningún
// adorno cambia el acorde, así que no hay nada que limitar.
function mejorCadena(layers) {
  layers.forEach((layer, i) => {
    for (const n of layer) {
      if (i === 0) {
        n.total = costeNodo(n);
        n.from = null;
        continue;
      }
      let mejor = null;
      for (const p of layers[i - 1]) {
        const total = p.total + costeEnlace(p, n);
        if (!mejor || total < mejor.total) mejor = { total, nodo: p };
      }
      n.total = mejor.total + costeNodo(n);
      n.from = mejor.nodo;
    }
  });
  const cadena = [];
  for (let n = layers.at(-1).reduce((a, b) => (b.total < a.total ? b : a)); n; n = n.from) cadena.unshift(n);
  return cadena;
}

// Para cada cejilla, el mejor arreglo que se puede tocar detrás de ella. Null si
// la BD no da digitaciones para alguno de los acordes.
function arreglo(db, progression, capo) {
  const layers = optionsFor(progression).map(options => options
    .filter(esAdorno)
    .flatMap(o => playablePositions(db, shapeSymbol(o.chords[0], capo))
      // Los trastes de la forma se cuentan desde la cejilla, así que lo que hay
      // que comprobar es dónde caen de verdad en el mástil.
      .filter(v => v.frets.every(f => capo + f <= MAX_FRET))
      .map(v => ({ ...v, pcs: pcs(v.frets), aire: alAire(v.frets), sounding: o.chords[0], rule: o.rule }))));
  if (layers.some(l => !l.length)) return null;

  const cadena = mejorCadena(layers);
  const quietas = cadena.slice(1).reduce((n, p, i) =>
    n + p.frets.filter((f, s) => f >= 0 && f === cadena[i].frets[s]).length, 0);
  return {
    capo,
    steps: cadena.map((n, i) => ({
      sounding: n.sounding,
      shape: n.symbol,
      position: n.position,
      frets: n.frets,
      aire: n.aire,
      changed: n.sounding !== progression[i].symbol,
    })),
    aire: cadena.reduce((n, x) => n + x.aire, 0),
    quietas,
  };
}

// Las cejillas ordenadas por lo que resuena el arreglo que permiten: cuerdas al
// aire primero, luego notas que se quedan quietas, y a igualdad el traste más
// bajo, que es el que menos aprieta la mano.
export function capoArrangements(db, progression, maxFret = 7) {
  const out = [];
  for (let capo = 0; capo <= maxFret; capo++) {
    const a = arreglo(db, progression, capo);
    if (a) out.push(a);
  }
  return out.sort((x, y) => y.aire - x.aire || y.quietas - x.quietas || x.capo - y.capo);
}
