import { parseProgression, suggest, detectKey, transposeSymbol, intervalTo, rootOf, KINDS } from "./rules.js";
import { KEYS } from "./notes.js";
import { capoSuggestions, capoArrangements, shapeSymbol } from "./capo.js";
import { identify, degreeShort } from "./identify.js";
import { reharmonizations } from "./reharm.js";
import { searchSongs, fetchSong, suggestions } from "./song.js";
import {
  readLibrary, writeLibrary, libraryJson, parseLibrary, mergeLibrary,
  saveSection, removeSection, removeSong, songKey,
} from "./library.js";
import { findShape, shapeSvg, fretboardSvg, openString, absoluteFrets, MAX_FRET } from "./guitar.js";

// Crear un nodo con sus propiedades de una vez: es el gesto más repetido del
// fichero y en su forma larga no cabe de un vistazo.
const el = (tag, props) => Object.assign(document.createElement(tag), props);
const p = (className, textContent) => el("p", { className, textContent });

const form = document.querySelector("form");
const input = document.querySelector("#progression");
const summary = document.querySelector("#summary");
const subsList = document.querySelector("#subs");
const capoList = document.querySelector("#capo");
const reharmList = document.querySelector("#reharm");
const error = document.querySelector("#error");

// De qué canción y parte salió la progresión actual (null si se tecleó a mano).
// Lleva también intérprete, tonalidad y enlace: son los datos que se guardan con
// ella en el cancionero, y así retocar una progresión traída de Ultimate Guitar y
// volver a guardarla no pierde de dónde venía.
let songContext = null;

let db = null;
const dbReady = fetch("https://cdn.jsdelivr.net/npm/@tombatossals/chords-db@0/lib/guitar.json")
  .then(r => r.json())
  .then(j => (db = j))
  .catch(() => null); // sin red: todo funciona salvo los diagramas

// Buscar la forma de un símbolo sale caro por la cantidad de veces que se repite:
// una progresión pinta cientos de nombres de acorde y entre todos no llegan a
// medio centenar de símbolos distintos.
const shapes = new Map();
const shapeOf = sym => {
  if (!shapes.has(sym)) shapes.set(sym, (db && findShape(db, sym)) || null);
  return shapes.get(sym);
};

// Primera posición de la BD que cabe entera en el mástil del analizador.
const loadablePosition = sym => {
  const shape = shapeOf(sym);
  return shape?.positions.find(p => absoluteFrets(p).every(f => f <= MAX_FRET)) ?? null;
};

// Marca un nombre de acorde como cargable en el analizador. Se carga SIEMPRE lo
// que pone escrito, no la forma del tooltip: en la pestaña de cejilla el tooltip
// enseña la forma transpuesta que se toca, pero el mástil no sabe de cejillas y
// nombrarla daría el acorde equivocado.
// Sin title: el hover ya saca los diagramas del acorde y el bocadillo del
// navegador se les pone encima. Que es pulsable lo dicen el cursor y el color.
function linkToIdent(span, sym) {
  if (!loadablePosition(sym)) return span;
  span.dataset.load = sym;
  // Las mismas notas admiten varias lecturas (un C6 es también un Am7): se abre
  // por la que has pulsado, no por la que gane el ranking del identificador.
  span.dataset.root = rootOf(sym);
  return span;
}

// El tooltip se queda vacío hasta que el ratón pasa por encima: los diagramas
// están ocultos por CSS, y dibujarlos todos por adelantado son cientos de miles
// de nodos SVG por análisis para enseñar como mucho los de un acorde.
function tipFor(span, shapeSym, stringIdx) {
  if (!shapeOf(shapeSym)) return span;
  const tip = document.createElement("span");
  tip.className = "tip";
  tip.dataset.shape = shapeSym;
  if (stringIdx !== undefined) tip.dataset.open = stringIdx;
  span.append(tip);
  return span;
}

document.addEventListener("mouseover", e => {
  const tip = e.target.closest?.(".chord")?.querySelector(":scope > .tip[data-shape]");
  if (!tip) return;
  const { positions } = shapeOf(tip.dataset.shape);
  const { open } = tip.dataset;
  tip.innerHTML = open === undefined
    ? positions.slice(0, 4).map(shapeSvg).join("")
    : shapeSvg(openString(positions[0], Number(open)));
  delete tip.dataset.shape; // ya dibujado: no hace falta volver a pasar por aquí
});

// Nombre de acorde con tooltip de diagramas (varias posiciones/inversiones) al hacer
// hover. Con cejilla, shapeSym es la forma transpuesta que realmente se toca.
function chordSpan(sym, shapeSym = sym) {
  const span = document.createElement("span");
  span.className = "chord";
  span.textContent = sym;
  return linkToIdent(tipFor(span, shapeSym), sym);
}

// Acorde extendido de la pestaña cejilla: el diagrama es la forma del acorde BASE
// (relativa a la cejilla) con la cuerda de la extensión al aire, no las posiciones
// absolutas del acorde extendido, que ahí no significan nada.
function extChordSpan(ext, baseSym) {
  const span = document.createElement("span");
  span.className = "chord";
  span.textContent = ext.as;
  return linkToIdent(tipFor(span, baseSym, ext.stringIdx), ext.as);
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  summary.innerHTML = subsList.innerHTML = capoList.innerHTML = "";
  error.textContent = "";
  transposeBox.hidden = true;
  await dbReady;

  let progression;
  try {
    progression = parseProgression(input.value);
  } catch (err) {
    error.textContent = err.message;
    return;
  }
  if (!progression.length) return;

  // La progresión vive en la URL: recargar la conserva, atrás navega entre
  // progresiones y el enlace se puede compartir.
  const h = encodeURIComponent(progression.map(c => c.symbol).join("-"));
  if (location.hash.slice(1) !== h) location.hash = h;

  if (songContext && songContext.chords !== input.value.trim()) songContext = null;
  if (songContext) {
    // La canción en negrita y la parte detrás: lo que identifica la progresión
    // es de qué canción sale; la parte matiza cuál de ellas. El intérprete va
    // pegado al título, que es con quien forma el nombre de la canción.
    const origen = el("p", { className: "origen" });
    origen.append(
      el("strong", { textContent: songContext.song ?? songContext.label }),
      songContext.song
        ? `${songContext.artist ? ` — ${songContext.artist}` : ""} · ${songContext.part}`
        : "",
    );
    summary.append(origen);
  }

  const original = document.createElement("p");
  original.className = "original";
  progression.forEach((c, i) => original.append(i ? "  " : "", chordSpan(c.symbol)));
  summary.append(original, el("p", {
    className: "key",
    textContent: `Tonalidad estimada: ${KEYS[detectKey(progression)]} mayor · pulsa cualquier acorde para verlo en el mástil`,
  }));

  renderTranspose(progression);
  renderSubs(progression);

  renderCapo(progression);

  renderReharm(progression);
});

// ── Transponer: la misma progresión sonando en otro tono ────────────────────

// Sin estado propio: reescribe el campo y relanza, que es lo que escribe el hash.
// De ahí salen gratis la persistencia al recargar, el atrás como deshacer y que
// el enlace compartido lleve ya el tono elegido.
const transposeBox = document.querySelector("#transpose");
const keySelect = document.querySelector("#t-key");
keySelect.append(...KEYS.map(k => el("option", { value: k, textContent: k })));
let currentKey = 0; // croma de la tonalidad estimada de lo que hay escrito

function renderTranspose(progression) {
  currentKey = detectKey(progression);
  keySelect.value = KEYS[currentKey];
  transposeBox.hidden = false;
}

// El tono de partida se nombra con KEYS y no con lo que haya escrito el usuario:
// el intervalo entre dos nombres es lo que decide la grafía de toda la progresión,
// así que fijar el origen es lo que hace predecible el resultado.
function transposeTo(target) {
  const interval = intervalTo(KEYS[currentKey], target);
  input.value = parseProgression(input.value).map(c => transposeSymbol(c.symbol, interval)).join(" ");
  form.requestSubmit();
}

document.querySelector("#t-down").addEventListener("click", () => transposeTo(KEYS[(currentKey + 11) % 12]));
document.querySelector("#t-up").addEventListener("click", () => transposeTo(KEYS[(currentKey + 1) % 12]));
keySelect.addEventListener("change", () => transposeTo(keySelect.value));

// ── Pestaña "Cejilla": cómo se toca detrás de cada cejilla, y qué color da ───

// Dos alturas por cejilla. Arriba la respuesta: el arreglo que más resuena
// detrás de ella, con su digitación y lo que se gana. Debajo el menú: todos los
// colores que esa cejilla pone a tu alcance, los haya elegido el arreglo o no.
// Una sola ordenación, la del arreglo, que es la que sabe si algo es tocable.
// La tarjeta de una cejilla: su arreglo (si la BD dio digitaciones) y el
// catálogo de colores que esa cejilla pone a tiro.
function capoCard(a) {
  const li = document.createElement("li");
  li.append(el("strong", { textContent: a.capo ? `Cejilla en traste ${a.capo}` : "Sin cejilla" }));
  if (a.steps) {
    li.append(" ", el("small", {
      textContent: `${plural(a.aire, "cuerda al aire", "cuerdas al aire")} · ${plural(a.quietas, "nota que no se mueve", "notas que no se mueven")}`,
    }));
    li.append(chartOf(a));
  }

  const cp = capoColores.get(a.capo);
  if (!cp) return li;
  li.append(el("p", { className: "why hint", textContent: "y además, si buscas color:" }));
  const cols = el("div", { className: "cols" });
  for (const pc of cp.perChord) {
    const sh = shapeSymbol(pc.chord, a.capo);
    const forma = shapeOf(sh)?.positions[0];
    const head = el("p", { className: "why" });
    head.append(conCejilla(chordSpan(pc.chord, sh), forma, a.capo));
    const exts = el("ul", { className: "exts" });
    for (const ext of pc.extensions) {
      const row = document.createElement("li");
      const conAire = forma && openString(forma, ext.stringIdx);
      row.append("→ ", conCejilla(extChordSpan(ext, sh), conAire, a.capo),
        ` (${ext.note} en ${ext.string} al aire)`);
      exts.append(row);
    }
    const block = document.createElement("div");
    block.append(head, exts);
    cols.append(block);
  }
  li.append(cols);
  return li;
}

let capoColores = new Map();
let capoExtra = new Map(); // cejillas que el ranking dejó fuera, por traste

function renderCapo(progression) {
  capoColores = new Map(capoSuggestions(progression).map(cp => [cp.capo, cp]));
  // Sin la base de datos no hay digitaciones que elegir, así que queda el menú.
  const arreglos = db ? capoArrangements(db, progression) : [];
  const todos = arreglos.length ? arreglos : [...capoColores.values()].map(cp => ({ capo: cp.capo }));

  for (const a of todos.slice(0, 3)) capoList.append(capoCard(a));

  // El resto de trastes, a un clic: el ranking propone, pero a lo mejor la
  // canción pide justo la cejilla que no ganó.
  capoExtra = new Map(todos.slice(3).map(a => [a.capo, a]));
  if (!capoExtra.size) return;
  const fila = el("li", { className: "otras-cejillas" });
  fila.append(el("span", { className: "why", textContent: "Otras cejillas:" }));
  for (const a of [...capoExtra.values()].sort((x, y) => x.capo - y.capo)) {
    const b = el("button", { type: "button", textContent: a.capo ? `traste ${a.capo}` : "sin cejilla" });
    b.dataset.capo = a.capo;
    if (a.aire != null) b.title = `${plural(a.aire, "cuerda al aire", "cuerdas al aire")}`;
    fila.append(b);
  }
  capoList.append(fila);
}

// Abrir una cejilla del resto: su tarjeta aparece donde estaba la fila de
// botones, y el botón se gasta. La fila desaparece con el último.
capoList.addEventListener("click", e => {
  const btn = e.target.closest("button[data-capo]");
  if (!btn) return;
  const fila = btn.closest("li");
  fila.before(capoCard(capoExtra.get(Number(btn.dataset.capo))));
  btn.remove();
  if (!fila.querySelector("button")) fila.remove();
});


// Un acorde de la pestaña de cejilla se abre en el mástil con su cejilla puesta y
// con la digitación que enseña su diagrama, no con la primera que tenga la BD:
// si no, la figura del mástil no se parece a la que acabas de ver.
function conCejilla(span, position, capo) {
  if (!position) return span;
  const frets = absoluteFrets(position).map(f => (f < 0 ? -1 : capo + f));
  if (frets.some(f => f > MAX_FRET)) return span; // no cabe en el mástil del analizador
  span.dataset.frets = frets.join(",");
  span.dataset.capo = capo;
  return span;
}

// La fila de diagramas del arreglo. Los trastes son relativos a la cejilla, que
// es como se toca; al pulsar se carga en el mástil su posición real (la cejilla
// más el traste), porque el analizador no sabe de cejillas y hay que darle lo
// que de verdad suena.
function chartOf(a) {
  const chart = el("div", { className: "chart" });
  for (const s of a.steps) {
    const step = el("div", { className: s.changed ? "step changed" : "step" });
    const name = el("span", { className: "chord", textContent: s.sounding });
    name.dataset.frets = s.frets.map(f => (f < 0 ? -1 : a.capo + f)).join(",");
    name.dataset.capo = a.capo;
    name.dataset.root = rootOf(s.sounding);
    const svg = document.createElement("span");
    svg.innerHTML = shapeSvg(s.position);
    step.append(name, svg, el("span", {
      className: "top",
      textContent: s.aire ? `${s.aire} al aire` : "sin cuerdas al aire",
    }));
    chart.append(step);
  }
  return chart;
}

// ── Pestaña "Sustituciones": todas las opciones, acorde por acorde ──────────

// Cada acorde saca más de diez opciones, así que en plano no hay quien lo lea:
// van plegadas por acorde (abierta la del primero) y dentro agrupadas por lo que
// le hacen —adornarlo, cambiarlo o añadirle acordes delante—, que es la decisión
// de verdad; la regla concreta viene después.
// El nombre del resumen no es pulsable a propósito: dentro de un <summary>, el
// clic pliega el acorde además de saltar al mástil. Para eso está la progresión
// de arriba, que sí lleva enlace.
function renderSubs(progression) {
  const suggestions = suggest(progression);
  progression.forEach((c, i) => {
    const mine = suggestions.filter(s => s.index === i);
    if (!mine.length) return;
    const li = document.createElement("li");
    const box = document.createElement("details");
    box.open = i === 0;
    box.append(el("summary", {
      innerHTML: `<strong>${c.symbol}</strong> <small>· acorde ${i + 1} de ${progression.length} · ${mine.length} opciones</small>`,
    }));

    for (const kind of KINDS) {
      const group = mine.filter(s => s.kind === kind.id);
      if (!group.length) continue;
      const card = el("div", { className: "kind" });
      card.append(
        el("h4", { textContent: kind.name }),
        el("p", { className: "why hint", textContent: kind.hint }),
      );
      const list = el("ul", { className: "options" });
      for (const s of group) {
        const opt = document.createElement("li");
        s.replacement.forEach((sym, k) => opt.append(k ? " " : "", chordSpan(sym)));
        opt.append(
          " ",
          el("small", { textContent: `(${s.rule})` }),
          el("p", { className: "why", textContent: s.why }),
        );
        list.append(opt);
      }
      card.append(list);
      box.append(card);
    }
    li.append(box);
    subsList.append(li);
  });
}

// ── Pestaña "Rearmonizar": la progresión entera, no acorde a acorde ─────────

// Cada versión aplica unas cuantas sustituciones que encajan entre sí y elige
// las digitaciones de modo que la nota más aguda dibuje una línea. Se enseña esa
// línea debajo de los diagramas, que es lo que justifica cada elección.
function renderReharm(progression) {
  reharmList.replaceChildren();
  if (!db) {
    reharmList.append(el("li", {
      className: "why",
      textContent: "Sin las posiciones de guitarra no se puede elegir digitación, así que esta pestaña necesita conexión.",
    }));
    return;
  }

  const versions = reharmonizations(db, progression);
  if (!versions.length) {
    reharmList.append(el("li", {
      className: "why",
      textContent: "Alguno de estos acordes no tiene posiciones en la base de datos, así que no se puede armar el arreglo.",
    }));
    return;
  }

  for (const v of versions) {
    const li = document.createElement("li");
    li.append(
      el("h3", { textContent: v.intention.name }),
      el("p", { className: "why", textContent: v.intention.why }),
    );

    const chart = document.createElement("div");
    chart.className = "chart";
    for (const s of v.steps) {
      const step = document.createElement("div");
      step.className = s.changed ? "step changed" : "step";
      // Sin tooltip de posiciones alternativas: aquí la digitación que importa
      // es la que hace la línea, y está dibujada justo debajo. Al pulsar se abre
      // esa misma en el analizador, no la primera que tenga la BD.
      const name = el("span", { className: "chord", textContent: s.symbol });
      name.dataset.frets = s.frets.join(",");
      const svg = document.createElement("span");
      svg.innerHTML = shapeSvg(s.position);
      step.append(name, svg, el("span", { className: "top", textContent: s.topNote }));
      chart.append(step);
    }
    li.append(chart);

    li.append(el("p", {
      className: "line",
      textContent: `Voz de arriba: ${v.line.join(" → ")}`,
    }));
    const conjunct = `${v.conjunct} de ${v.moves} movimientos por grado conjunto`;
    li.append(el("p", {
      className: "why",
      textContent: `${conjunct}, ${plural(v.held, "nota repetida", "notas repetidas")} y ${plural(v.leaps, "salto", "saltos")}.`,
    }));
    // Los mismos números en todas las tarjetas, gane quien gane: comparar la
    // resonante con la melódica es justo para lo que están.
    li.append(el("p", {
      className: "why",
      textContent: `${plural(v.aire, "cuerda al aire", "cuerdas al aire")}, ${plural(v.comunes, "nota común", "notas comunes")} y ${plural(v.movimiento, "semitono", "semitonos")} de movimiento entre voces.`,
    }));
    for (const s of v.steps.filter(x => x.rule && x.changed)) {
      li.append(el("p", {
        className: "why",
        textContent: `${s.from} → ${s.symbol} (${s.rule}). ${s.why}`,
      }));
    }
    reharmList.append(li);
  }
}

// ── Identificador de acordes: mástil clicable → nombre del acorde ───────────

const board = document.querySelector("#board");
const readout = document.querySelector("#readout");
const voicing = document.querySelector("#voicing");
const picked = [-1, -1, -1, -1, -1, -1]; // formato chords-db: índice 0 = 6ª cuerda
let chosenRoot = null; // la lectura que el usuario ha elegido; si no, manda el ranking
let capo = 0; // cejilla puesta en el mástil: la trae el arreglo de la pestaña de cejilla

function renderIdent() {
  const { notes, candidates } = identify(picked);
  // Si la fundamental elegida ya no suena, se vuelve solo a la lectura mejor valorada.
  const best = candidates.find(c => c.root === chosenRoot) ?? candidates[0];

  // Con la lectura principal, cada cuerda lleva escrito su papel junto al mástil.
  const labels = [];
  if (best) for (const n of notes) labels[n.stringIdx] = degreeShort(best.root, n.note);
  board.innerHTML = fretboardSvg(picked, { labels, root: best?.root ?? null, capo });

  voicing.textContent = picked.map(f => (f < 0 ? "×" : f)).join(" ") + (capo ? `  ·  cejilla en ${capo}` : "");
  readout.replaceChildren();

  if (!notes.length) {
    readout.append(p("why", "Marca al menos dos notas distintas para que haya acorde que nombrar."));
    return;
  }
  if (!best) {
    readout.append(
      p("why", "Con una sola nota no hay acorde que nombrar: marca al menos dos distintas."),
      p("why", `Notas de grave a aguda: ${notes.map(n => `${n.note} (${n.string})`).join(", ")}`),
    );
    return;
  }

  // Todas las lecturas siempre debajo del mástil, la activa marcada: son las
  // mismas notas con un nombre por cada fundamental posible, y pulsar otra la
  // vuelve la principal y reetiqueta los grados del mástil.
  const chips = group => {
    const list = el("ul", { className: "others" });
    for (const c of group) {
      const li = el("li", {
        textContent: c.symbol,
        className: c === best ? "active" : "",
        title: `Tomando ${c.root} como fundamental: ${c.degrees.map(d => `${d.note} ${d.degree}`).join(", ")}`,
      });
      li.dataset.root = c.root;
      list.append(li);
    }
    return list;
  };

  readout.append(chips(candidates.filter(c => !c.rootless)));

  // Las lecturas cuya fundamental no suena van aparte y avisando: el cifrado
  // nombra una nota que no está marcada, y leerlo sin saberlo lleva a engaño.
  const sinRaiz = candidates.filter(c => c.rootless);
  if (sinRaiz.length) {
    readout.append(
      el("h3", { textContent: "Sin la fundamental" }),
      p("why hint", "Estas lecturas no tienen su fundamental entre las notas marcadas: la pone el bajo. Es lo corriente cuando no tocas solo, y la guitarra se queda con las notas que definen el acorde."),
      chips(sinRaiz),
    );
  }

  readout.append(
    p("why", best.degrees.map(d => `${d.note}: ${d.degree}`).join(" · ")),
    p("why", `Notas de grave a aguda: ${notes.map(n => `${n.note} (${n.string})`).join(", ")}`),
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
  const origen = e.target.closest("[data-load], [data-frets]");
  if (!origen) return;
  // Las pestañas de rearmonización y cejilla traen su propia digitación —la que
  // hace la línea, la que deja cuerdas al aire—, así que se carga esa y no la
  // primera que tenga la BD para ese acorde. La de cejilla trae además su traste.
  const position = origen.dataset.frets ? null : loadablePosition(origen.dataset.load);
  const frets = origen.dataset.frets ? origen.dataset.frets.split(",").map(Number)
    : position ? absoluteFrets(position)
    : [];
  if (frets.length !== 6) return;
  picked.splice(0, 6, ...frets);
  capo = Number(origen.dataset.capo ?? 0);
  chosenRoot = origen.dataset.root ?? null;
  renderIdent();
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
  capo = 0;
  chosenRoot = null;
  renderIdent();
});

// ── Pestaña "Canción": título e intérprete → progresiones por partes ────────

const songQuery = document.querySelector("#song-query");
const songStatus = document.querySelector("#song-status");
const songResults = document.querySelector("#song-results");
const songSections = document.querySelector("#song-sections");

// Autocompletado con <datalist>: el desplegable, las teclas y el filtrado los
// pone el navegador; aquí solo se rellenan las opciones con un pequeño debounce.
// ponytail: sin dropdown propio; si el datalist nativo se queda corto, hacerlo a mano
const songSuggest = document.querySelector("#song-suggest");
let suggestTimer;
songQuery.addEventListener("input", () => {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(async () => {
    const typed = songQuery.value;
    const list = await suggestions(typed);
    if (songQuery.value !== typed) return; // respuesta tardía: ya se teclea otra cosa
    songSuggest.replaceChildren(...list.map(s => el("option", { value: s })));
  }, 200);
});

document.querySelector("#song-form").addEventListener("submit", async e => {
  e.preventDefault();
  songResults.replaceChildren();
  songSections.replaceChildren();
  if (!songQuery.value.trim()) return;
  songStatus.textContent = "Buscando…";
  try {
    const results = await searchSongs(songQuery.value);
    songStatus.textContent = results.length ? "" : "Sin transcripciones de acordes para esa búsqueda.";
    for (const r of results.slice(0, 10)) {
      const li = document.createElement("li");
      li.dataset.url = r.url;
      li.append(
        el("strong", { textContent: r.song }),
        ` — ${r.artist} `,
        el("small", {
          textContent: `★ ${r.rating?.toFixed(1) ?? "?"} (${r.votes} votos)`,
        }),
      );
      songResults.append(li);
    }
  } catch (err) {
    songStatus.textContent = err.message;
  }
});

songResults.addEventListener("click", async e => {
  const li = e.target.closest("[data-url]");
  if (!li) return;
  songSections.replaceChildren();
  songStatus.textContent = "Cargando acordes…";
  try {
    const s = await fetchSong(li.dataset.url);
    songStatus.textContent = "";
    songSections.append(el("h3", {
      textContent: `${s.song} — ${s.artist}${s.key ? ` · tonalidad ${s.key}` : ""}`,
    }));
    for (const sec of s.sections) {
      const box = document.createElement("div");
      box.className = "section";
      box.append(el("strong", { textContent: sec.name }));
      const chords = document.createElement("div");
      chords.className = "chords";
      for (const sym of sec.chords) chords.append(chordSpan(sym));
      const meta = { song: s.song, artist: s.artist, key: s.key, url: li.dataset.url, part: sec.name };
      const use = el("button", { type: "button", textContent: "Usar" });
      use.addEventListener("click", () => useSection(meta, sec.chords));
      // Guardar sin pasar por "Usar": al mirar una transcripción interesa quedarse
      // con dos o tres partes de golpe, no cargarlas una a una para conservarlas.
      const keep = el("button", { type: "button", textContent: "Guardar" });
      keep.addEventListener("click", () => {
        const msg = saveToLibrary(meta, sec.chords);
        if (!msg) return;
        keep.textContent = msg;
        keep.disabled = true;
      });
      chords.append(use, keep);
      box.append(chords);
      songSections.append(box);
    }
  } catch (err) {
    songStatus.textContent = err.message;
  }
});

// ── Cancionero: las progresiones que se guardan en este navegador ───────────

const songBox = document.querySelector("#song-box");
const libraryBox = document.querySelector("#library-box");
document.querySelector("#open-song").addEventListener("click", () => songBox.showModal());
document.querySelector("#open-library").addEventListener("click", () => libraryBox.showModal());
for (const b of document.querySelectorAll("dialog .cerrar")) {
  b.addEventListener("click", () => b.closest("dialog").close());
}
const libraryList = document.querySelector("#library-list");
const libraryCount = document.querySelector("#library-count");
const libraryStatus = document.querySelector("#library-status");
const librarySong = document.querySelector("#library-song");
const libraryPart = document.querySelector("#library-part");

let lib = readLibrary();

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Toda escritura pasa por aquí: si el navegador no deja guardar, la pantalla no
// puede quedarse enseñando un cancionero que en realidad no se ha almacenado.
const commit = (next, done = "") => {
  try {
    writeLibrary(next);
  } catch (err) {
    libraryStatus.textContent = err.message;
    return false;
  }
  lib = next;
  renderLibrary();
  libraryStatus.textContent = done;
  return true;
};

// Usar una parte: la progresión sube al campo de arriba y de ahí sigue el camino
// de siempre —requestSubmit escribe el hash, y el hash es lo que pinta—, así que
// el cancionero no es una segunda fuente de verdad, solo otra forma de rellenarlo.
function useSection(meta, chords) {
  input.value = chords.join(" ");
  songContext = {
    ...meta,
    label: `${meta.song}${meta.artist ? ` — ${meta.artist}` : ""} · ${meta.part}`,
    chords: input.value,
  };
  // El formulario de guardar queda apuntando a esta parte: retocar la progresión
  // y volver a guardarla actualiza la que ya está, sin teclear los nombres otra vez.
  librarySong.value = meta.song;
  libraryPart.value = meta.part;
  songBox.close(); // los diálogos se cierran: la progresión ya está en la columna
  libraryBox.close();
  form.requestSubmit();
}

// Devuelve qué contarle al usuario, o null si no se ha podido guardar (que con
// localStorage pasa de verdad: cuota llena o almacenamiento desactivado).
function saveToLibrary(meta, chords) {
  let next, added;
  try {
    ({ lib: next, added } = saveSection(lib, meta, { name: meta.part, chords }));
  } catch (err) {
    libraryStatus.textContent = err.message;
    if (!libraryBox.open) libraryBox.showModal();
    return null;
  }
  if (!commit(next)) {
    if (!libraryBox.open) libraryBox.showModal();
    return null;
  }
  return added ? "Guardada" : "Ya la tenías";
}

function renderLibrary() {
  const parts = lib.songs.reduce((n, s) => n + s.sections.length, 0);
  libraryCount.textContent = parts
    ? `(${plural(lib.songs.length, "canción", "canciones")}, ${plural(parts, "parte", "partes")})`
    : "";

  libraryList.replaceChildren();
  // Por título, que es lo primero que se lee de cada línea; el intérprete solo
  // desempata. Ordenar por intérprete pondría delante las progresiones propias,
  // que no tienen ninguno. El orden en que se guardaron se queda en el fichero,
  // donde lo que importa es que exportar dos veces dé lo mismo.
  const songs = [...lib.songs].sort((a, b) => a.song.localeCompare(b.song) || a.artist.localeCompare(b.artist));
  // Compacto: una línea por canción y las partes como chips con solo el nombre.
  // Pulsar el chip carga la parte; la progresión se ve en el tooltip, y para
  // leerla con calma ya está la cabecera tras cargarla. La × quita esa parte.
  for (const s of songs) {
    const key = songKey(s);
    const block = el("div", { className: "libsong" });
    const head = document.createElement("h3");
    head.append(s.song);
    const detail = [s.artist, s.key && `tonalidad ${s.key}`].filter(Boolean).join(" · ");
    if (detail) head.append(el("small", { textContent: `— ${detail}` }));
    const dropSong = el("button", { type: "button", textContent: "Borrar" });
    dropSong.addEventListener("click", () => commit(removeSong(lib, key), `Borrada "${s.song}".`));
    head.append(dropSong);
    block.append(head);

    const parts = el("div", { className: "parts" });
    s.sections.forEach((sec, i) => {
      const chip = el("span", { className: "part" });
      const meta = { song: s.song, artist: s.artist, key: s.key, url: s.url, part: sec.name };
      const use = el("button", { type: "button", className: "use", textContent: sec.name });
      use.addEventListener("click", () => useSection(meta, sec.chords));
      const drop = el("button", {
        type: "button", className: "x", textContent: "×", title: `Quitar "${sec.name}"`,
      });
      drop.addEventListener("click", () => commit(removeSection(lib, key, i), `Quitada la parte "${sec.name}".`));
      chip.append(use, drop, el("span", {
        className: "tip", textContent: sec.chords.join(" "),
      }));
      parts.append(chip);
    });
    block.append(parts);
    libraryList.append(block);
  }
}

// Guardar lo que hay escrito arriba, que es la vía para las progresiones propias:
// las de Ultimate Guitar ya tienen su botón junto a cada parte.
document.querySelector("#library-form").addEventListener("submit", e => {
  e.preventDefault();
  let progression;
  try {
    progression = parseProgression(input.value);
  } catch (err) {
    libraryStatus.textContent = err.message;
    return;
  }
  if (!progression.length) {
    libraryStatus.textContent = "Escribe primero una progresión ahí arriba y luego guárdala con un nombre.";
    return;
  }
  const song = librarySong.value.trim();
  if (!song) {
    librarySong.focus();
    libraryStatus.textContent = "Ponle nombre a la canción para poder encontrarla luego.";
    return;
  }
  // Si el nombre coincide con el de la canción cargada se conservan sus datos:
  // retocar una progresión traída de Ultimate Guitar y volver a guardarla no
  // debería perder el intérprete ni el enlace de la transcripción.
  const from = songContext?.song === song ? songContext : {};
  const meta = { song, artist: from.artist ?? "", key: from.key, url: from.url, part: libraryPart.value.trim() };
  const msg = saveToLibrary(meta, progression.map(c => c.symbol));
  if (msg) libraryStatus.textContent = `${msg}: ${song} · ${meta.part || "Progresión"}.`;
});

// Descargar y cargar son lo que compensa que el cancionero viva en un navegador:
// la copia de seguridad, el paso a otro dispositivo y la manera de compartirlo.
document.querySelector("#library-download").addEventListener("click", () => {
  if (!lib.songs.length) {
    libraryStatus.textContent = "El cancionero está vacío: no hay nada que descargar.";
    return;
  }
  const url = URL.createObjectURL(new Blob([libraryJson(lib)], { type: "application/json" }));
  const a = el("a", { href: url, download: "cancionero-jangle.json" });
  a.click();
  URL.revokeObjectURL(url);
  libraryStatus.textContent = "Descargado cancionero-jangle.json.";
});

document.querySelector("#library-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = ""; // sin esto, cargar dos veces el mismo fichero no vuelve a disparar el evento
  try {
    const { lib: incoming, dropped } = parseLibrary(await file.text());
    const { lib: next, songs, sections } = mergeLibrary(lib, incoming);
    const aviso = dropped ? ` Se ha descartado ${plural(dropped, "entrada por el formato", "entradas por el formato")}.` : "";
    if (!songs && !sections) {
      libraryStatus.textContent = `Ese cancionero ya lo tenías entero: no hay nada nuevo que añadir.${aviso}`;
      return;
    }
    commit(next, `Cargado: ${plural(songs, "canción nueva", "canciones nuevas")} y ${plural(sections, "parte nueva", "partes nuevas")}.${aviso}`);
  } catch (err) {
    libraryStatus.textContent = err.message;
  }
});

renderIdent();
renderLibrary();

// Al cargar o navegar por el historial, la progresión de la URL manda.
function applyHash() {
  const p = decodeURIComponent(location.hash.slice(1)).replaceAll("-", " ").trim();
  if (p && p !== input.value.trim()) {
    input.value = p;
    form.requestSubmit();
  }
}
window.addEventListener("hashchange", applyHash);
applyHash();
