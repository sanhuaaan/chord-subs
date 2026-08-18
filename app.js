import { parseProgression, suggest, detectKey, KINDS } from "./rules.js";
import { capoSuggestions, shapeSymbol } from "./capo.js";
import { identify, degreeShort } from "./identify.js";
import { reharmonizations } from "./reharm.js";
import { searchSongs, fetchSong, suggestions } from "./song.js";
import {
  readLibrary, writeLibrary, libraryJson, parseLibrary, mergeLibrary,
  saveSection, removeSection, removeSong, songKey,
} from "./library.js";
import { findShape, shapeSvg, fretboardSvg, openString, absoluteFrets, MAX_FRET, PC } from "./guitar.js";

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
    const cols = Object.assign(document.createElement("div"), { className: "cols" });
    for (const pc of cp.perChord) {
      const sh = shapeSymbol(pc.chord, cp.capo);
      const head = document.createElement("p");
      head.className = "why";
      head.append(chordSpan(pc.chord, sh));
      const exts = Object.assign(document.createElement("ul"), { className: "exts" });
      for (const ext of pc.extensions) {
        const row = document.createElement("li");
        row.append("→ ", extChordSpan(ext, sh), ` (${ext.note} en ${ext.string} al aire)`);
        exts.append(row);
      }
      const block = document.createElement("div");
      block.append(head, exts);
      cols.append(block);
    }
    li.append(cols);
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
      const card = Object.assign(document.createElement("div"), { className: "kind" });
      card.append(
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

// ── Identificador de acordes: mástil clicable → nombre del acorde ───────────

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
    const list = Object.assign(document.createElement("ul"), { className: "others" });
    for (const c of group) {
      const li = Object.assign(document.createElement("li"), {
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
      Object.assign(document.createElement("h3"), { textContent: "Sin la fundamental" }),
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
      const meta = { song: s.song, artist: s.artist, key: s.key, url: li.dataset.url, part: sec.name };
      const use = Object.assign(document.createElement("button"), { type: "button", textContent: "Usar" });
      use.addEventListener("click", () => useSection(meta, sec.chords));
      // Guardar sin pasar por "Usar": al mirar una transcripción interesa quedarse
      // con dos o tres partes de golpe, no cargarlas una a una para conservarlas.
      const keep = Object.assign(document.createElement("button"), { type: "button", textContent: "Guardar" });
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

const libraryBox = document.querySelector("#library-box");
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
    label: `${meta.part} · ${meta.song}${meta.artist ? ` — ${meta.artist}` : ""}`,
    chords: input.value,
  };
  // El formulario de guardar queda apuntando a esta parte: retocar la progresión
  // y volver a guardarla actualiza la que ya está, sin teclear los nombres otra vez.
  librarySong.value = meta.song;
  libraryPart.value = meta.part;
  document.querySelector("#song-box").open = false; // el buscador se pliega: la progresión ya está arriba
  libraryBox.open = false;
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
    libraryBox.open = true;
    return null;
  }
  if (!commit(next)) {
    libraryBox.open = true;
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
    const block = Object.assign(document.createElement("div"), { className: "libsong" });
    const head = document.createElement("h3");
    head.append(s.song);
    const detail = [s.artist, s.key && `tonalidad ${s.key}`].filter(Boolean).join(" · ");
    if (detail) head.append(Object.assign(document.createElement("small"), { textContent: `— ${detail}` }));
    const dropSong = Object.assign(document.createElement("button"), { type: "button", textContent: "Borrar" });
    dropSong.addEventListener("click", () => commit(removeSong(lib, key), `Borrada "${s.song}".`));
    head.append(dropSong);
    block.append(head);

    const parts = Object.assign(document.createElement("div"), { className: "parts" });
    s.sections.forEach((sec, i) => {
      const chip = Object.assign(document.createElement("span"), { className: "part" });
      const meta = { song: s.song, artist: s.artist, key: s.key, url: s.url, part: sec.name };
      const use = Object.assign(document.createElement("button"), { type: "button", className: "use", textContent: sec.name });
      use.addEventListener("click", () => useSection(meta, sec.chords));
      const drop = Object.assign(document.createElement("button"), {
        type: "button", className: "x", textContent: "×", title: `Quitar "${sec.name}"`,
      });
      drop.addEventListener("click", () => commit(removeSection(lib, key, i), `Quitada la parte "${sec.name}".`));
      chip.append(use, drop, Object.assign(document.createElement("span"), {
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
  const a = Object.assign(document.createElement("a"), { href: url, download: "cancionero-jangle.json" });
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
dbReady.then(renderIdent); // repinta cuando ya hay diagramas que colgar de los nombres
dbReady.then(renderLibrary);

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
