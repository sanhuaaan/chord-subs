import { Chord, Midi, Note } from "tonal";
import { parseProgression, suggest, applySuggestion } from "./rules.js";
import { findShape, shapeSvg } from "./guitar.js";

const form = document.querySelector("form");
const input = document.querySelector("#progression");
const results = document.querySelector("#results");
const error = document.querySelector("#error");

let db = null;
const dbReady = fetch("https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0/lib/guitar.json")
  .then(r => r.json())
  .then(j => (db = j))
  .catch(() => null); // sin red: sin diagramas y audio de respaldo

let audioCtx;

// Respaldo si un acorde no está en la BD: notas apiladas desde la octava 3.
function chordFreqs(symbol) {
  let oct = 3;
  let prev = -1;
  return Chord.get(symbol).notes.map(n => {
    const chroma = Note.chroma(n);
    if (chroma <= prev) oct++;
    prev = chroma;
    return Note.freq(n + oct);
  });
}

function playChord(symbol, when, dur = 0.9) {
  const shape = db && findShape(db, symbol);
  const freqs = shape ? shape.positions[0].midi.map(Midi.midiToFreq) : chordFreqs(symbol);
  freqs.forEach((freq, i) => {
    const t = when + i * 0.03; // rasgueo: cada cuerda 30 ms después de la anterior
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  });
}

function playProgression(symbols) {
  audioCtx = audioCtx || new AudioContext();
  // La política de autoplay puede dejar el contexto suspendido incluso tras un click.
  if (audioCtx.state === "suspended") audioCtx.resume();
  const t0 = audioCtx.currentTime + 0.05;
  symbols.forEach((s, i) => playChord(s, t0 + i));
}

function playButton(symbols) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "▶";
  btn.title = symbols.join(" ");
  btn.addEventListener("click", () => playProgression(symbols));
  return btn;
}

// Nombre de acorde con tooltip de diagramas (varias posiciones/inversiones) al hacer hover.
function chordSpan(sym) {
  const span = document.createElement("span");
  span.className = "chord";
  span.textContent = sym;
  const shape = db && findShape(db, sym);
  if (shape) {
    const tip = document.createElement("span");
    tip.className = "tip";
    tip.innerHTML = shape.positions.slice(0, 4).map(shapeSvg).join("");
    span.append(tip);
  }
  return span;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  results.innerHTML = "";
  error.textContent = "";
  await dbReady;

  let progression;
  try {
    progression = parseProgression(input.value);
  } catch (err) {
    error.textContent = err.message;
    return;
  }
  if (!progression.length) return;

  const symbols = progression.map(c => c.symbol);
  const original = document.createElement("p");
  original.className = "original";
  original.append(playButton(symbols));
  symbols.forEach(sym => original.append("  ", chordSpan(sym)));
  results.append(original);

  for (const s of suggest(progression)) {
    const applied = applySuggestion(progression, s);
    const li = document.createElement("li");
    li.append(playButton(applied), " ", chordSpan(s.chord), " → ");
    s.replacement.forEach((sym, i) => li.append(i ? " " : "", chordSpan(sym)));
    li.append(
      " ",
      Object.assign(document.createElement("small"), { textContent: `(${s.rule})` }),
      Object.assign(document.createElement("p"), { className: "why", textContent: s.why })
    );
    results.append(li);
  }
});
