import { parseProgression, suggest, detectKey } from "./rules.js";
import { capoSuggestions, shapeSymbol } from "./capo.js";
import { identify, degreeShort } from "./identify.js";
import { findShape, shapeSvg, fretboardSvg, openString, absoluteFrets, MAX_FRET, PC } from "./guitar.js";

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

// Primera posición de la BD que cabe entera en el mástil del analizador.
const loadablePosition = sym => {
  const shape = db && findShape(db, sym);
  return shape?.positions.find(p => absoluteFrets(p).every(f => f <= MAX_FRET)) ?? null;
};

// Marca un nombre de acorde como cargable en el analizador. Se carga SIEMPRE lo
// que pone escrito, no la forma del tooltip: en la pestaña de cejilla el tooltip
// enseña la forma transpuesta que se toca, pero el mástil no sabe de cejillas y
// nombrarla daría el acorde equivocado.
function linkToIdent(span, sym) {
  if (!loadablePosition(sym)) return span;
  span.dataset.load = sym;
  span.title = `Ver ${sym} en el mástil`;
  return span;
}

// Nombre de acorde con tooltip de diagramas (varias posiciones/inversiones) al hacer
// hover. Con cejilla, shapeSym es la forma transpuesta que realmente se toca.
function chordSpan(sym, shapeSym = sym, link = true) {
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
  return link ? linkToIdent(span, sym) : span;
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
  return linkToIdent(span, ext.as);
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
    textContent: `Tonalidad estimada: ${PC[detectKey(progression)]} mayor · pulsa cualquier acorde para verlo en el mástil`,
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
const chordName = document.querySelector("#chord-name");
const picked = [-1, -1, -1, -1, -1, -1]; // formato chords-db: índice 0 = 6ª cuerda
let chosenRoot = null; // la lectura que el usuario ha elegido; si no, manda el ranking

const p = (className, textContent) => Object.assign(document.createElement("p"), { className, textContent });

function renderIdent() {
  const { notes, pcs, candidates } = identify(picked);
  // Si la fundamental elegida ya no suena, se vuelve solo a la lectura mejor valorada.
  const best = candidates.find(c => c.root === chosenRoot) ?? candidates[0];

  // Con la lectura principal, cada cuerda lleva escrito su papel junto al mástil.
  const labels = [];
  if (best) for (const n of notes) labels[n.stringIdx] = degreeShort(best.root, n.note);
  board.innerHTML = fretboardSvg(picked, { labels, root: best?.root ?? null });

  voicing.textContent = picked.map(f => (f < 0 ? "×" : f)).join(" ");
  chordName.replaceChildren();
  readout.replaceChildren();

  if (!notes.length) {
    readout.append(p("why", "Marca al menos tres notas distintas para que haya acorde que nombrar."));
    return;
  }

  // Los diagramas de la BD son posiciones fundamentales, así que el nombre solo
  // lleva tooltip cuando no hay inversión: si no, enseñaría otro bajo del marcado.
  // Sin enlace: aquí cargar el acorde borraría justo lo que se está marcando.
  if (best) chordName.append(best.inversion ? document.createTextNode(best.symbol) : chordSpan(best.symbol, best.symbol, false));

  readout.append(p("why", `Notas de grave a aguda: ${notes.map(n => `${n.note} (${n.string})`).join(", ")}`));

  if (!best) {
    readout.append(p("why", `Con ${pcs.length === 1 ? "una sola nota" : "dos notas"} no hay acorde que nombrar: marca al menos tres distintas.`));
    return;
  }

  readout.append(p("why", best.degrees.map(d => `${d.note}: ${d.degree}`).join(" · ")));

  // Una lectura por cada nota del acorde, según cuál se tome por fundamental.
  // Todas describen las mismas notas; al pulsar una, el mástil se reetiqueta
  // con sus grados y esa pasa a ser la lectura principal.
  const others = candidates.filter(c => c !== best);
  if (!others.length) return;
  const list = Object.assign(document.createElement("ul"), { id: "others" });
  for (const c of others) {
    const li = Object.assign(document.createElement("li"), {
      textContent: c.symbol,
      title: `Tomando ${c.root} como fundamental: ${c.degrees.map(d => `${d.note} ${d.degree}`).join(", ")}`,
    });
    li.dataset.root = c.root;
    list.append(li);
  }
  readout.append(
    Object.assign(document.createElement("h2"), { textContent: "Otras lecturas, según qué nota tomes por fundamental" }),
    list,
  );
}

board.addEventListener("click", e => {
  const cell = e.target.closest("[data-string]");
  if (!cell) return;
  const s = Number(cell.dataset.string);
  const f = Number(cell.dataset.fret);
  picked[s] = picked[s] === f ? -1 : f; // volver a pulsar donde ya estaba apaga la cuerda
  renderIdent();
});

// Cualquier acorde escrito en las otras pestañas lleva al analizador con su
// primera posición ya marcada en el mástil.
document.addEventListener("click", e => {
  const el = e.target.closest("[data-load]");
  if (!el) return;
  const position = loadablePosition(el.dataset.load);
  if (!position) return;
  picked.splice(0, 6, ...absoluteFrets(position));
  chosenRoot = null;
  document.querySelector("#tab-ident").checked = true;
  renderIdent();
  document.querySelector("#ident").scrollIntoView({ behavior: "smooth", block: "start" });
});

// Elegir otra lectura reetiqueta el mástil con los grados desde esa fundamental.
readout.addEventListener("click", e => {
  const chip = e.target.closest("[data-root]");
  if (!chip) return;
  chosenRoot = chip.dataset.root;
  renderIdent();
});

document.querySelector("#clear").addEventListener("click", () => {
  picked.fill(-1);
  chosenRoot = null;
  renderIdent();
});

renderIdent();
dbReady.then(renderIdent); // repinta cuando ya hay diagramas que colgar de los nombres
