import { parseProgression, suggest, detectKey } from "./rules.js";
import { capoSuggestions, shapeSymbol } from "./capo.js";
import { findShape, shapeSvg, openString, PC } from "./guitar.js";

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
  .catch(() => null); // sin red: sin diagramas y audio de respaldo

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
