import { Chord, Note } from "tonal";
import { noteName } from "./notes.js";

// Con qué grafía indexa chords-db sus acordes. No es una decisión nuestra sino
// suya, así que no sale de este módulo: para nombrar notas está notes.js, que
// hoy coincide pero responde a otra pregunta.
const DB_SPELLING = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// El nombre con el que hay que buscar una nota en la base de datos de diagramas.
export const dbSpelling = note => DB_SPELLING[Note.chroma(note)];

// Afinación estándar de 6ª a 1ª: nombre de la cuerda y su nota MIDI al aire. El
// orden es el de las posiciones de chords-db (índice 0 = 6ª), y `midi % 12` da
// el croma para quien solo necesite la altura relativa.
export const STRINGS = [["6ª", 40], ["5ª", 45], ["4ª", 50], ["3ª", 55], ["2ª", 59], ["1ª", 64]];

// Hasta dónde llega el mástil del analizador.
export const MAX_FRET = 15;

// chords-db numera los trastes dentro de la ventana del diagrama: su 1 es
// `baseFret`, y el 0 es la cuerda al aire aunque la forma esté arriba del
// mástil. Esto los pasa a trastes absolutos, que es como los pide fretboardSvg.
export const absoluteFrets = p => p.frets.map(f => (f <= 0 ? f : f + p.baseFret - 1));

const SUFFIX_BY_TYPE = {
  "major": "major",
  "minor": "minor",
  "dominant seventh": "7",
  "minor seventh": "m7",
  "major seventh": "maj7",
  "diminished seventh": "dim7",
  "diminished": "dim",
  "augmented": "aug",
  "suspended fourth": "sus4",
  "suspended second": "sus2",
  "half-diminished": "m7b5",
  "sixth": "6",
  "minor sixth": "m6",
  "dominant ninth": "9",
  "major ninth": "maj9",
  "minor ninth": "m9",
  "minor eleventh": "m11",
  "major eleventh": "maj11",
  "dominant thirteenth": "13",
  "dominant flat ninth": "7b9",
  "dominant sharp ninth": "7#9",
  "sixth added ninth": "69",
  // tonal solo lo escribe "AmMaj7"; la BD lo indexa en minúsculas.
  "minor/major seventh": "mmaj7",
};

const DISPLAY = { major: "", minor: "m" };

// Busca las posiciones de guitarra para un símbolo de acorde. Null si no hay.
export function findShape(db, symbol) {
  const c = Chord.get(symbol);
  if (!c.tonic) return null;
  // Tipo de tonal si lo conoce; si no, el sufijo textual tal cual (add9, madd9, 7sus4, 13…).
  const suffix = SUFFIX_BY_TYPE[c.type] ?? symbol.replace(/^[A-G](#|b)?/, "");
  const key = dbSpelling(c.tonic);
  const entry = (db.chords[key.replace("#", "sharp")] || []).find(e => e.suffix === suffix);
  if (!entry) return null;
  return { name: key + (DISPLAY[suffix] ?? suffix), positions: entry.positions };
}

// Digitaciones de la BD que caben en el mástil, cada una con lo que hace falta
// para encadenarlas: los trastes absolutos, la voz superior (la nota que más
// suena) y dónde cae la mano. Es de lo que parten tanto la rearmonización como
// la búsqueda de cuerdas al aire, así que el criterio de "esto es tocable" vive
// aquí, junto a MAX_FRET, y no en cada una por su cuenta.
export function playablePositions(db, symbol, max = Infinity) {
  const shape = db && findShape(db, symbol);
  if (!shape) return [];
  const out = [];
  for (const position of shape.positions) {
    const frets = absoluteFrets(position);
    if (!frets.every(f => f <= MAX_FRET)) continue;
    const sounding = frets
      .map((f, i) => (f < 0 ? null : { midi: STRINGS[i][1] + f, stringIdx: i }))
      .filter(Boolean);
    if (sounding.length < 3) continue;
    const top = sounding.reduce((a, b) => (b.midi > a.midi ? b : a));
    const midis = sounding.map(s => s.midi).sort((a, b) => a - b);
    out.push({
      symbol, position, frets, midis, bass: midis[0],
      pcs: new Set(midis.map(m => m % 12)),
      top: top.midi, topString: top.stringIdx, baseFret: position.baseFret,
    });
    if (out.length === max) break;
  }
  return out;
}

// La misma posición con una cuerda al aire (para extensiones con cejilla: el 0 es
// la cejilla, aunque la forma esté en trastes altos). Si la cuerda ya estaba al
// aire, la forma ya suena la extensión y vale tal cual.
// ponytail: no valida que el dedo sea levantable (cejillas medias, etc.)
export function openString(p, stringIdx) {
  return p.frets[stringIdx] === 0 ? p : { ...p, frets: p.frets.with(stringIdx, 0) };
}

// Diagrama de acorde como SVG autocontenido (hereda color vía currentColor).
export function shapeSvg(p) {
  const T = 16;   // margen superior (para × y ○)
  const SW = 10;  // separación entre cuerdas
  const FH = 15;  // alto de traste
  // Margen fijo aunque no haya número de traste: si varía, varía el ancho del
  // viewBox y con él la altura renderizada, y los diagramas de una progresión
  // dejan de estar a la misma altura.
  const L = 14;
  const x = s => L + SW * s; // s: 0 (6ª cuerda) … 5 (1ª)
  const W = x(5) + 8;
  const H = T + FH * 4 + 4;
  const el = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`];
  for (let f = 0; f <= 4; f++) {
    const nut = f === 0 && p.baseFret === 1;
    el.push(`<line x1="${x(0)}" y1="${T + FH * f}" x2="${x(5)}" y2="${T + FH * f}" stroke="currentColor" stroke-width="${nut ? 2.5 : 0.75}"/>`);
  }
  for (let s = 0; s < 6; s++) {
    el.push(`<line x1="${x(s)}" y1="${T}" x2="${x(s)}" y2="${T + FH * 4}" stroke="currentColor" stroke-width="0.75"/>`);
  }
  if (p.baseFret > 1) {
    el.push(`<text x="0" y="${T + FH - 4}" fill="currentColor" font-size="9">${p.baseFret}</text>`);
  }
  p.frets.forEach((f, s) => {
    if (f === -1) {
      el.push(`<text x="${x(s)}" y="${T - 4}" fill="currentColor" font-size="9" text-anchor="middle">×</text>`);
    } else if (f === 0) {
      el.push(`<circle cx="${x(s)}" cy="${T - 7}" r="3" fill="none" stroke="currentColor"/>`);
    } else {
      el.push(`<circle cx="${x(s)}" cy="${T + FH * f - FH / 2}" r="3.8" fill="currentColor"/>`);
    }
  });
  el.push("</svg>");
  return el.join("");
}

// Mástil completo y clicable para marcar pulsaciones a mano. `frets` va en el
// mismo formato que las posiciones de chords-db (índice 0 = 6ª cuerda; -1 muda,
// 0 al aire, n traste pulsado), así que lo que se marca aquí sirve tal cual para
// identify(). Cada zona sensible es un <rect class="cell"> con data-string y
// data-fret: quien lo monte delega un único listener en el contenedor.
//
// Cada nota pulsada lleva su nombre dentro, las cuerdas al aire y mudas se
// marcan a la izquierda de la cejuela, y `labels[cuerda]` escribe a la derecha
// el papel de esa nota (1, 3, b7…), que es quien lo llame sabrá calcularlo.
// `root` resalta la fundamental para ver de un vistazo dónde cae en el mástil.
export function fretboardSvg(frets, { maxFret = MAX_FRET, labels = [], root = null, capo = 0 } = {}) {
  const G = 26;   // ancho de la columna de ×/○ a la izquierda de la cejuela
  const FW = 30;  // ancho de traste
  const SS = 22;  // separación entre cuerdas
  const T = 15;   // margen superior
  const R = 8.5;  // radio de las notas
  const x = f => G + FW * f;        // f: 0 (cejuela) … maxFret
  const y = s => T + SS * (5 - s);  // s: 0 (6ª, abajo) … 5 (1ª, arriba)
  const mid = f => x(f) - FW / 2;   // centro del traste f
  const W = x(maxFret) + 26;        // hueco a la derecha para los grados
  const H = y(0) + 20;              // hueco abajo para los números de traste
  const el = [`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`];

  // Nota con su nombre dentro. La fundamental va en otro color para localizarla.
  const noteCircle = (cx, cy, note, open) => {
    const cls = `note${note === root ? " root" : ""}${open ? " open" : ""}`;
    return `<g class="${cls}"><circle cx="${cx}" cy="${cy}" r="${R}"/>`
      + `<text x="${cx}" y="${cy + 3}" text-anchor="middle" font-size="${note.length > 1 ? 7.5 : 9}">${note}</text></g>`;
  };

  // Inlays y numeración, debajo de todo: uno en el centro salvo el 12, con dos.
  const center = T + SS * 2.5;
  for (let f = 1; f <= maxFret; f++) {
    if ([3, 5, 7, 9, 15, 17, 19, 21].includes(f)) {
      el.push(`<circle cx="${mid(f)}" cy="${center}" r="3" fill="currentColor" opacity="0.2"/>`);
    } else if (f % 12 === 0) {
      for (const cy of [center - SS, center + SS]) {
        el.push(`<circle cx="${mid(f)}" cy="${cy}" r="3" fill="currentColor" opacity="0.2"/>`);
      }
    }
    el.push(`<text class="fret-no" x="${mid(f)}" y="${H - 6}" text-anchor="middle" font-size="8">${f}</text>`);
  }
  el.push(`<text class="fret-no" x="${G / 2}" y="${H - 6}" text-anchor="middle" font-size="8">0</text>`);

  for (let f = 0; f <= maxFret; f++) {
    el.push(`<line x1="${x(f)}" y1="${y(5)}" x2="${x(f)}" y2="${y(0)}" stroke="currentColor" stroke-width="${f === 0 ? 3 : 0.75}"/>`);
  }
  for (let s = 0; s < 6; s++) {
    el.push(`<line x1="${x(0)}" y1="${y(s)}" x2="${x(maxFret)}" y2="${y(s)}" stroke="currentColor" stroke-width="${1.3 - s * 0.15}" opacity="0.55"/>`);
    if (labels[s]) {
      el.push(`<text class="degree" x="${x(maxFret) + 6}" y="${y(s) + 3}" font-size="8.5">${labels[s]}</text>`);
    }
  }

  // La cejilla, antes que las notas para que estas queden por encima.
  if (capo) {
    el.push(`<rect class="capo" x="${mid(capo) - 7}" y="${y(5) - 10}" width="14" height="${y(0) - y(5) + 20}" rx="6"/>`);
  }

  frets.forEach((f, s) => {
    const note = noteName(STRINGS[s][1] + f);
    if (f === -1) {
      el.push(`<text class="muted" x="${G / 2}" y="${y(s) + 3.5}" text-anchor="middle" font-size="11">×</text>`);
    } else if (f === 0) {
      el.push(noteCircle(G / 2, y(s), note, true));
    } else if (f <= maxFret) {
      // Con cejilla puesta, la cuerda que solo pisa ella suena como si estuviera
      // al aire, y se dibuja igual: es lo que hace que la forma se reconozca.
      el.push(noteCircle(mid(f), y(s), note, f === capo));
    }
  });

  // Zonas clicables al final, para que queden por encima y reciban el puntero.
  for (let s = 0; s < 6; s++) {
    el.push(`<rect class="cell" data-string="${s}" data-fret="${capo}" x="0" y="${y(s) - SS / 2}" width="${G}" height="${SS}" fill="transparent"/>`);
    for (let f = capo + 1; f <= maxFret; f++) {
      el.push(`<rect class="cell" data-string="${s}" data-fret="${f}" x="${x(f - 1)}" y="${y(s) - SS / 2}" width="${FW}" height="${SS}" fill="transparent"/>`);
    }
  }
  el.push("</svg>");
  return el.join("");
}
