import { parseProgression, suggest, detectKey, KINDS } from "./rules.js";
import { capoSuggestions, shapeSymbol } from "./capo.js";
import { identify, degreeShort } from "./identify.js";
import { reharmonizations } from "./reharm.js";
import { searchSongs, fetchSong, suggestions } from "./song.js";
import { findShape, shapeSvg, fretboardSvg, openString, absoluteFrets, MAX_FRET, PC } from "./guitar.js";

const form = document.querySelector("form");
const input = document.querySelector("#progression");
const summary = document.querySelector("#summary");
const subsList = document.querySelector("#subs");
const capoList = document.querySelector("#capo");
const reharmList = document.querySelector("#reharm");
const error = document.querySelector("#error");

// De qué canción y parte salió la progresión actual (null si se tecleó a mano).
let songContext = null;

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
// Sin title: el hover ya saca los diagramas del acorde y el bocadillo del
// navegador se les pone encima. Que es pulsable lo dicen el cursor y el color.
function linkToIdent(span, sym) {
  if (!loadablePosition(sym)) return span;
  span.dataset.load = sym;
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

  // La progresión vive en la URL: recargar la conserva, atrás navega entre
  // progresiones y el enlace se puede compartir.
  const h = encodeURIComponent(progression.map(c => c.symbol).join("-"));
  if (location.hash.slice(1) !== h) location.hash = h;

  if (songContext && songContext.chords !== input.value.trim()) songContext = null;
  if (songContext) {
    summary.append(Object.assign(document.createElement("p"), { className: "key", textContent: songContext.label }));
  }

  const original = document.createElement("p");
  original.className = "original";
  progression.forEach((c, i) => original.append(i ? "  " : "", chordSpan(c.symbol)));
  summary.append(original, Object.assign(document.createElement("p"), {
    className: "key",
    textContent: `Tonalidad estimada: ${PC[detectKey(progression)]} mayor · pulsa cualquier acorde para verlo en el mástil`,
  }));

  renderSubs(progression);

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

  renderReharm(progression);
});

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
    box.append(Object.assign(document.createElement("summary"), {
      innerHTML: `<strong>${c.symbol}</strong> <small>· acorde ${i + 1} de ${progression.length} · ${mine.length} opciones</small>`,
    }));

    for (const kind of KINDS) {
      const group = mine.filter(s => s.kind === kind.id);
      if (!group.length) continue;
      box.append(
        Object.assign(document.createElement("h4"), { textContent: kind.name }),
        Object.assign(document.createElement("p"), { className: "why hint", textContent: kind.hint }),
      );
      const list = Object.assign(document.createElement("ul"), { className: "options" });
      for (const s of group) {
        const opt = document.createElement("li");
        s.replacement.forEach((sym, k) => opt.append(k ? " " : "", chordSpan(sym)));
        opt.append(
          " ",
          Object.assign(document.createElement("small"), { textContent: `(${s.rule})` }),
          Object.assign(document.createElement("p"), { className: "why", textContent: s.why }),
        );
        list.append(opt);
      }
      box.append(list);
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
    reharmList.append(Object.assign(document.createElement("li"), {
      className: "why",
      textContent: "Sin las posiciones de guitarra no se puede elegir digitación, así que esta pestaña necesita conexión.",
    }));
    return;
  }

  const versions = reharmonizations(db, progression);
  if (!versions.length) {
    reharmList.append(Object.assign(document.createElement("li"), {
      className: "why",
      textContent: "Alguno de estos acordes no tiene posiciones en la base de datos, así que no se puede armar el arreglo.",
    }));
    return;
  }

  for (const v of versions) {
    const li = document.createElement("li");
    li.append(
      Object.assign(document.createElement("h3"), { textContent: v.intention.name }),
      Object.assign(document.createElement("p"), { className: "why", textContent: v.intention.why }),
    );

    const chart = document.createElement("div");
    chart.className = "chart";
    for (const s of v.steps) {
      const step = document.createElement("div");
      step.className = s.changed ? "step changed" : "step";
      // Sin tooltip de posiciones alternativas: aquí la digitación que importa
      // es la que hace la línea, y está dibujada justo debajo. Al pulsar se abre
      // esa misma en el analizador, no la primera que tenga la BD.
      const name = Object.assign(document.createElement("span"), { className: "chord", textContent: s.symbol });
      name.dataset.frets = s.frets.join(",");
      const svg = document.createElement("span");
      svg.innerHTML = shapeSvg(s.position);
      step.append(name, svg, Object.assign(document.createElement("span"), { className: "top", textContent: s.topNote }));
      chart.append(step);
    }
    li.append(chart);

    li.append(Object.assign(document.createElement("p"), {
      className: "line",
      textContent: `Voz de arriba: ${v.line.join(" → ")}`,
    }));
    const conjunct = `${v.conjunct} de ${v.moves} movimientos por grado conjunto`;
    li.append(Object.assign(document.createElement("p"), {
      className: "why",
      textContent: `${conjunct}, ${v.held} nota${v.held === 1 ? "" : "s"} repetida${v.held === 1 ? "" : "s"} y ${v.leaps} salto${v.leaps === 1 ? "" : "s"}.`,
    }));
    for (const s of v.steps.filter(x => x.rule && x.changed)) {
      li.append(Object.assign(document.createElement("p"), {
        className: "why",
        textContent: `${s.from} → ${s.symbol} (${s.rule}). ${s.why}`,
      }));
    }
    reharmList.append(li);
  }
}

// ── Pestaña "¿Qué acorde es?": mástil clicable → nombre del acorde ──────────

const board = document.querySelector("#board");
const readout = document.querySelector("#readout");
const voicing = document.querySelector("#voicing");
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
  readout.replaceChildren();

  if (!notes.length) {
    readout.append(p("why", "Marca al menos tres notas distintas para que haya acorde que nombrar."));
    return;
  }
  if (!best) {
    readout.append(
      p("why", `Con ${pcs.length === 1 ? "una sola nota" : "dos notas"} no hay acorde que nombrar: marca al menos tres distintas.`),
      p("why", `Notas de grave a aguda: ${notes.map(n => `${n.note} (${n.string})`).join(", ")}`),
    );
    return;
  }

  // Todas las lecturas siempre debajo del mástil, la activa marcada: son las
  // mismas notas con un nombre por cada fundamental posible, y pulsar otra la
  // vuelve la principal y reetiqueta los grados del mástil.
  const list = Object.assign(document.createElement("ul"), { id: "others" });
  for (const c of candidates) {
    const li = Object.assign(document.createElement("li"), {
      textContent: c.symbol,
      className: c === best ? "active" : "",
      title: `Tomando ${c.root} como fundamental: ${c.degrees.map(d => `${d.note} ${d.degree}`).join(", ")}`,
    });
    li.dataset.root = c.root;
    list.append(li);
  }
  readout.append(
    list,
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
  const el = e.target.closest("[data-load], [data-frets]");
  if (!el) return;
  // La pestaña de rearmonización trae su propia digitación: es la que hace la
  // línea, así que carga esa y no la primera que tenga la BD para ese acorde.
  const position = el.dataset.frets ? null : loadablePosition(el.dataset.load);
  const frets = el.dataset.frets ? el.dataset.frets.split(",").map(Number)
    : position ? absoluteFrets(position)
    : [];
  if (frets.length !== 6) return;
  picked.splice(0, 6, ...frets);
  chosenRoot = null;
  document.querySelector("#toggle-ident").checked = true;
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
    songSuggest.replaceChildren(...list.map(s => Object.assign(document.createElement("option"), { value: s })));
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
        Object.assign(document.createElement("strong"), { textContent: r.song }),
        ` — ${r.artist} `,
        Object.assign(document.createElement("small"), {
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
    songSections.append(Object.assign(document.createElement("h3"), {
      textContent: `${s.song} — ${s.artist}${s.key ? ` · tonalidad ${s.key}` : ""}`,
    }));
    for (const sec of s.sections) {
      const box = document.createElement("div");
      box.className = "section";
      box.append(Object.assign(document.createElement("strong"), { textContent: sec.name }));
      const chords = document.createElement("div");
      chords.className = "chords";
      for (const sym of sec.chords) chords.append(chordSpan(sym));
      const use = Object.assign(document.createElement("button"), { type: "button", textContent: "Usar" });
      use.addEventListener("click", () => {
        input.value = sec.chords.join(" ");
        songContext = { label: `${sec.name} · ${s.song} — ${s.artist}`, chords: input.value };
        document.querySelector("#song-box").open = false; // el buscador se pliega: la progresión ya está arriba
        form.requestSubmit();
      });
      chords.append(use);
      box.append(chords);
      songSections.append(box);
    }
  } catch (err) {
    songStatus.textContent = err.message;
  }
});

renderIdent();
dbReady.then(renderIdent); // repinta cuando ya hay diagramas que colgar de los nombres

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
