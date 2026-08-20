import { Chord, Note } from "tonal";
import { TUNINGS, MAX_FRET } from "./guitar.js";
import { alAire, PRESETS, mejorCadena } from "./reharm.js";

// Genera digitaciones para un acorde en una afinación cualquiera. Es lo que
// chords-db no puede hacer: sus formas suponen afinación estándar y en otra
// los mismos trastes suenan otro acorde. La salida tiene la misma forma que la
// de playablePositions —incluida la `position` relativa que dibuja shapeSvg—,
// así que el motor de costes, los diagramas y el analizador la consumen tal
// cual, sin saber de dónde salió.

const SPAN = 4;    // trastes que abarca la mano: la ventana de búsqueda
const FINGERS = 4;
const MIN_STRINGS = 4; // con menos cuerdas el acorde queda demasiado delgado

// Recorre el producto de opciones por cuerda podando la estructura de mudas:
// las mudas solo caben al principio o al final, así que en cuanto una muda
// sigue a una cuerda que suena, lo único que puede venir detrás son mudas.
function walk(options, i, frets, sounded, closed, emit) {
  if (i === options.length) return emit(frets);
  for (const f of options[i]) {
    if (f >= 0 && closed) continue;
    frets.push(f);
    walk(options, i + 1, frets, sounded || f >= 0, closed || (sounded && f === -1), emit);
    frets.pop();
  }
}

// Dedos que hacen falta: la cejilla —varias cuerdas en el traste pisado más
// bajo— cuenta como uno, salvo que por encima de ella quede una cuerda al
// aire, que entonces no hay barra que valga y cada nota es un dedo.
// ponytail: no modela cejillas parciales ni estiramientos entre dedos
function fingersNeeded(frets) {
  const fretted = frets.filter(f => f > 0);
  if (!fretted.length) return 0;
  const min = Math.min(...fretted);
  const atMin = fretted.filter(f => f === min).length;
  const openAbove = frets.some((f, i) => f === 0 && i > frets.indexOf(min));
  const barre = atMin > 1 && !openAbove;
  return (barre ? 1 : atMin) + fretted.filter(f => f > min).length;
}

// Digitaciones tocables de un acorde en una afinación (los seis midis al
// aire, de 6ª a 1ª; sin ella, la estándar). Ordenadas: fundamental en el bajo
// antes que quinta, más abajo del mástil antes, y más cuerdas sonando antes.
export function generateShapes(symbol, tuning = TUNINGS[0].midis, max = Infinity) {
  const chord = Chord.get(symbol);
  if (!chord.tonic || !chord.notes.length) return [];
  const root = Note.chroma(chord.tonic);
  const chromas = new Set(chord.notes.map(Note.chroma));
  // La quinta justa es la única nota que se puede omitir, y solo cuando hay
  // séptimas o tensiones que defender: una tríada sin quinta ya no es el acorde.
  const fifth = (root + 7) % 12;
  const required = new Set(chromas);
  if (chromas.size >= 4) required.delete(fifth);
  // El bajo: la fundamental, o la quinta si el acorde la tiene —el precio de
  // que en Open G las seis al aire sean el G que da nombre a la afinación—.
  const bassOk = new Set([root, ...(chromas.has(fifth) ? [fifth] : [])]);

  const seen = new Set();
  const out = [];
  // ponytail: producto completo por ventana (~50k hojas por acorde), sin más
  // poda que la de mudas; si algún día pesa, podar dedos durante el paseo
  for (let base = 1; base + SPAN - 1 <= MAX_FRET; base++) {
    const options = tuning.map(open => {
      const opts = [-1];
      if (chromas.has(open % 12)) opts.push(0);
      for (let f = base; f < base + SPAN; f++) {
        if (chromas.has((open + f) % 12)) opts.push(f);
      }
      return opts;
    });
    walk(options, 0, [], false, false, frets => {
      const key = frets.join(".");
      if (seen.has(key)) return;
      seen.add(key);

      const sounding = frets
        .map((f, i) => (f < 0 ? null : { midi: tuning[i] + f, stringIdx: i }))
        .filter(Boolean);
      if (sounding.length < MIN_STRINGS) return;
      const pcs = new Set(sounding.map(s => s.midi % 12));
      if (![...required].every(c => pcs.has(c))) return;
      const midis = sounding.map(s => s.midi).sort((a, b) => a - b);
      if (!bassOk.has(midis[0] % 12)) return;
      if (fingersNeeded(frets) > FINGERS) return;

      const fretted = frets.filter(f => f > 0);
      const baseFret = !fretted.length || Math.max(...fretted) <= SPAN ? 1 : Math.min(...fretted);
      const top = sounding.reduce((a, b) => (b.midi > a.midi ? b : a));
      out.push({
        symbol,
        position: { frets: frets.map(f => (f <= 0 ? f : f - baseFret + 1)), baseFret },
        frets: [...frets], midis, bass: midis[0], pcs,
        top: top.midi, topString: top.stringIdx, baseFret,
      });
    });
  }
  out.sort((a, b) =>
    (a.bass % 12 === root ? 0 : 1) - (b.bass % 12 === root ? 0 : 1)
    || a.baseFret - b.baseFret
    || b.midis.length - a.midis.length);
  return out.slice(0, max);
}

// ── Qué afinación le sienta mejor a una progresión ──────────────────────────

const RESONANTE = PRESETS.find(p => p.id === "resonancia");

// El mejor arreglo de la progresión en cada afinación candidata: digitaciones
// generadas y el mismo camino mínimo resonante de la cejilla. Mismo preset y
// misma progresión en todas, así que aquí los costes SÍ son comparables entre
// sí y el orden lo decide el coste total: la afinación que gana es la que más
// resuena tocando justo lo que has escrito.
export function tuningArrangements(progression, tunings, max = 120) {
  const out = [];
  for (const tuning of tunings) {
    const layers = progression.map(c => generateShapes(c.symbol, tuning.midis)
      .map(v => ({ ...v, aire: alAire(v.frets) }))
      // ponytail: recorte por resonancia antes del camino mínimo; si algún día
      // el preset deja de premiar el aire, recortar por lo que premie
      .sort((a, b) => b.aire - a.aire)
      .slice(0, max));
    if (layers.some(l => !l.length)) continue;
    const cadena = mejorCadena(layers, RESONANTE, n => -RESONANTE.w.aire * n.aire);
    const quietas = cadena.slice(1).reduce((n, p, i) =>
      n + p.frets.filter((f, s) => f >= 0 && f === cadena[i].frets[s]).length, 0);
    out.push({
      tuning,
      cost: cadena.at(-1).total,
      steps: cadena.map(n => ({ symbol: n.symbol, position: n.position, frets: n.frets, aire: n.aire })),
      aire: cadena.reduce((n, x) => n + x.aire, 0),
      quietas,
    });
  }
  return out.sort((a, b) => a.cost - b.cost);
}
