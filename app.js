import { parseProgression, suggest, detectKey } from "./rules.js";
import { capoSuggestions, shapeSymbol } from "./capo.js";
import { identify } from "./identify.js";
import { findShape, shapeSvg, fretboardSvg, openString, PC } from "./guitar.js";

const form = document.querySelector("form");
const input = document.querySelector("#progression");
const summary = document.querySelector("#summary");
const subsList = document.querySelector("#subs");
const capoList = document.querySelector("#capo");
const error = document.querySelector("#error");

let db = null;
const dbReady = fetch("https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0/lib/guitar.json")
  .then(r => r.json())
  .then(j => (db = j))
  .catch(() => null); // sin red: todo funciona salvo los diagramas

// Nombre de acorde con tooltip de diagramas (varias posiciones/inversiones) al hacer
// hover. Con cejilla, shapeSym es la forma transpuesta que realmente se toca.
function chordSpan(sym, shapeSym = sym) {
  const span = document.createElement("span");
  span.className = "chord";
  span.textContent = sym;
  const shape = db && findShape(db, shapeSym);
  if (shape) {
    const tip = document.createElement("span");
    tip.className = "tip";
    tip.innerHTML = shape.positions.slice(0, 4).map(shapeSvg).join("");
    span.append(tip);
  }
  return span;
}

// Acorde extendido de la pestaña cejilla: el diagrama es la forma del acorde BASE
// (relativa a la cejilla) con la cuerda de la extensión al aire, no las posiciones
// absolutas del acorde extendido, que ahí no significan nada.
function extChordSpan(ext, baseSym) {
  const span = document.createElement("span");
  span.className = "chord";
  span.textContent = ext.as;
  const shape = db && findShape(db, baseSym);
  const p = shape && openString(shape.positions[0], ext.stringIdx);
  if (p) {
    const tip = document.createElement("span");
    tip.className = "tip";
    tip.innerHTML = shapeSvg(p);
    span.append(tip);
  }
  return span;
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  summary.innerHTML = subsList.innerHTML = capoList.innerHTML = "";
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

  const original = document.createElement("p");
  original.className = "original";
  progression.forEach((c, i) => original.append(i ? "  " : "", chordSpan(c.symbol)));
  summary.append(original, Object.assign(document.createElement("p"), {
    className: "key",
    textContent: `Tonalidad estimada: ${PC[detectKey(progression)]} mayor`,
  }));

  for (const s of suggest(progression)) {
    const li = document.createElement("li");
    li.append(chordSpan(s.chord), " → ");
    s.replacement.forEach((sym, i) => li.append(i ? " " : "", chordSpan(sym)));
    li.append(
      " ",
      Object.assign(document.createElement("small"), { textContent: `(${s.rule})` }),
      Object.assign(document.createElement("p"), { className: "why", textContent: s.why })
    );
    subsList.append(li);
  }

  for (const cp of capoSuggestions(progression).slice(0, 3)) {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("strong"), {
      textContent: cp.capo ? `Cejilla en traste ${cp.capo}` : "Sin cejilla",
    }));
    for (const pc of cp.perChord) {
      const sh = shapeSymbol(pc.chord, cp.capo);
      const line = document.createElement("p");
      line.className = "why";
      line.append(chordSpan(pc.chord, sh), " → ");
      pc.extensions.forEach((ext, i) => {
        line.append(i ? ", " : "", extChordSpan(ext, sh), ` (${ext.note} en ${ext.string} al aire)`);
      });
      li.append(line);
    }
    capoList.append(li);
  }
});

// ── Pestaña "¿Qué acorde es?": mástil clicable → nombre del acorde ──────────

const board = document.querySelector("#board");
const readout = document.querySelector("#readout");
const voicing = document.querySelector("#voicing");
const picked = [-1, -1, -1, -1, -1, -1]; // formato chords-db: índice 0 = 6ª cuerda

function renderIdent() {
  board.innerHTML = fretboardSvg(picked);
  voicing.textContent = picked.map(f => (f < 0 ? "×" : f)).join(" ");
  readout.replaceChildren();

  const { notes, pcs, candidates } = identify(picked);
  if (!notes.length) return;

  readout.append(Object.assign(document.createElement("p"), {
    className: "why",
    textContent: `Notas de grave a aguda: ${notes.map(n => `${n.note} (${n.string})`).join(", ")}`,
  }));

  if (!candidates.length) {
    readout.append(Object.assign(document.createElement("p"), {
      className: "why",
      textContent: pcs.length < 3
        ? "Con menos de tres notas distintas no hay acorde que nombrar: añade alguna más."
        : "Esas notas juntas no forman ningún acorde con nombre propio.",
    }));
    return;
  }

  // El primero es la lectura más probable; los demás son nombres igual de
  // válidos para las mismas notas, normalmente inversiones.
  const list = document.createElement("ul");
  for (const c of candidates) {
    const li = document.createElement("li");
    // Los diagramas de la BD son posiciones fundamentales, así que solo se cuelgan
    // del nombre cuando no hay inversión: si no, enseñarían otro bajo del marcado.
    const name = c.inversion
      ? Object.assign(document.createElement("span"), { textContent: c.symbol })
      : chordSpan(c.symbol);
    name.classList.add("name");
    li.append(name);
    if (c.inversion) li.append(" ", Object.assign(document.createElement("small"), { textContent: "(inversión)" }));
    li.append(Object.assign(document.createElement("p"), {
      className: "why",
      textContent: c.degrees.map(d => `${d.note}: ${d.degree}`).join(" · "),
    }));
    list.append(li);
  }
  readout.append(list);
}

board.addEventListener("click", e => {
  const cell = e.target.closest("[data-string]");
  if (!cell) return;
  const s = Number(cell.dataset.string);
  const f = Number(cell.dataset.fret);
  picked[s] = picked[s] === f ? -1 : f; // volver a pulsar donde ya estaba apaga la cuerda
  renderIdent();
});

document.querySelector("#clear").addEventListener("click", () => {
  picked.fill(-1);
  renderIdent();
});

renderIdent();
dbReady.then(renderIdent); // repinta cuando ya hay diagramas que colgar de los nombres
