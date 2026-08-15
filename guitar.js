import { Chord, Note } from "tonal";

// Grafías tal y como indexa chords-db (y como las busca un guitarrista).
export const PC = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

// Afinación estándar de 6ª a 1ª: nombre de la cuerda y su nota MIDI al aire. El
// orden es el de las posiciones de chords-db (índice 0 = 6ª), y `midi % 12` da
// el croma para quien solo necesite la altura relativa.
export const STRINGS = [["6ª", 40], ["5ª", 45], ["4ª", 50], ["3ª", 55], ["2ª", 59], ["1ª", 64]];

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
};

const DISPLAY = { major: "", minor: "m" };

// Busca las posiciones de guitarra para un símbolo de acorde. Null si no hay.
export function findShape(db, symbol) {
  const c = Chord.get(symbol);
  if (!c.tonic) return null;
  // Tipo de tonal si lo conoce; si no, el sufijo textual tal cual (add9, madd9, 7sus4, 13…).
  const suffix = SUFFIX_BY_TYPE[c.type] ?? symbol.replace(/^[A-G](#|b)?/, "");
  const key = PC[Note.chroma(c.tonic)];
  const entry = (db.chords[key.replace("#", "sharp")] || []).find(e => e.suffix === suffix);
  if (!entry) return null;
  return { name: key + (DISPLAY[suffix] ?? suffix), positions: entry.positions };
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
  const L = p.baseFret > 1 ? 14 : 8;
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
// La columna a la izquierda de la cejuela es el traste 0 (al aire / muda).
export function fretboardSvg(frets, maxFret = 12) {
  const M = 26;   // ancho de la columna de ×/○
  const FW = 34;  // ancho de traste
  const SS = 18;  // separación entre cuerdas
  const T = 12;   // margen superior
  const x = f => M + FW * f;        // f: 0 (cejuela) … maxFret
  const y = s => T + SS * (5 - s);  // s: 0 (6ª, abajo) … 5 (1ª, arriba)
  const mid = f => x(f) - FW / 2;   // centro del traste f
  const W = x(maxFret) + 6;
  const H = y(0) + 22;
  const el = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`];

  // Inlays, debajo de todo: uno en el centro del mástil salvo en el 12, que lleva dos.
  const center = T + SS * 2.5;
  for (const f of [3, 5, 7, 9, 12]) {
    const ys = f === 12 ? [center - SS, center + SS] : [center];
    for (const cy of ys) {
      el.push(`<circle cx="${mid(f)}" cy="${cy}" r="3" fill="currentColor" opacity="0.18"/>`);
    }
    el.push(`<text x="${mid(f)}" y="${H - 6}" fill="currentColor" opacity="0.45" font-size="9" text-anchor="middle">${f}</text>`);
  }
  for (let f = 0; f <= maxFret; f++) {
    el.push(`<line x1="${x(f)}" y1="${y(5)}" x2="${x(f)}" y2="${y(0)}" stroke="currentColor" stroke-width="${f === 0 ? 3 : 0.75}"/>`);
  }
  for (let s = 0; s < 6; s++) {
    el.push(`<line x1="${x(0)}" y1="${y(s)}" x2="${x(maxFret)}" y2="${y(s)}" stroke="currentColor" stroke-width="${1.3 - s * 0.15}" opacity="0.6"/>`);
  }

  frets.forEach((f, s) => {
    if (f === -1) {
      el.push(`<text x="${M / 2}" y="${y(s) + 3.5}" fill="currentColor" opacity="0.5" font-size="10" text-anchor="middle">×</text>`);
    } else if (f === 0) {
      el.push(`<circle class="dot" cx="${M / 2}" cy="${y(s)}" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/>`);
    } else if (f <= maxFret) {
      el.push(`<circle class="dot" cx="${mid(f)}" cy="${y(s)}" r="5.5" fill="currentColor"/>`);
    }
  });

  // Zonas clicables al final, para que queden por encima y reciban el puntero.
  for (let s = 0; s < 6; s++) {
    el.push(`<rect class="cell" data-string="${s}" data-fret="0" x="0" y="${y(s) - SS / 2}" width="${M}" height="${SS}" fill="transparent"/>`);
    for (let f = 1; f <= maxFret; f++) {
      el.push(`<rect class="cell" data-string="${s}" data-fret="${f}" x="${x(f - 1)}" y="${y(s) - SS / 2}" width="${FW}" height="${SS}" fill="transparent"/>`);
    }
  }
  el.push("</svg>");
  return el.join("");
}
