import { Chord, Note } from "tonal";

// Grafías tal y como indexa chords-db (y como las busca un guitarrista).
export const PC = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

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
