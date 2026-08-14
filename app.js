import { parseProgression, suggest, detectKey } from "./rules.js";
import { findShape, shapeSvg, PC } from "./guitar.js";

const form = document.querySelector("form");
const input = document.querySelector("#progression");
const results = document.querySelector("#results");
const error = document.querySelector("#error");

let db = null;
const dbReady = fetch("https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0/lib/guitar.json")
  .then(r => r.json())
  .then(j => (db = j))
  .catch(() => null); // sin red: sin diagramas y audio de respaldo

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

  const original = document.createElement("p");
  original.className = "original";
  progression.forEach((c, i) => original.append(i ? "  " : "", chordSpan(c.symbol)));
  results.append(original, Object.assign(document.createElement("p"), {
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
    results.append(li);
  }
});
