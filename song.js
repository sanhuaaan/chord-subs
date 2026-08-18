import { Chord } from "tonal";

// Ultimate Guitar bloquea los proxys CORS públicos, así que hace falta uno propio:
// proxy-worker.js desplegado en Cloudflare. localStorage.proxy lo sobrescribe, que
// es la vía para desarrollar contra `npx wrangler dev` (http://localhost:8787).
const PROXY = globalThis.localStorage?.proxy || "https://jangle-proxy.jangle.workers.dev";

const fetchUG = url =>
  fetch(`${PROXY}/?url=${encodeURIComponent(url)}`).catch(() => {
    throw new Error(`No se llega al proxy (${PROXY}), y sin él no hay búsqueda. Si estás trabajando en local, arráncalo con npx wrangler dev proxy-worker.js. Ver el README.`);
  }).then(r => {
    if (!r.ok) {
      throw new Error(r.status === 403
        ? `El proxy ha respondido 403: solo atiende a la propia app. Añade este origen a ALLOWED_ORIGIN en proxy-worker.js.`
        : `El proxy ha respondido ${r.status}. Ver el README.`);
    }
    return r.text();
  });

// UG guarda los nombres con entidades HTML dentro de su propio JSON —el intérprete
// de "Hentai" viene como "Rosal&iacute;a"—, así que no basta con desescapar el
// atributo: hay que deshacerlas otra vez sobre el texto ya parseado. Las nombradas
// de letra acentuada se resuelven componiendo la letra con su marca combinante, que
// sale más corto que una tabla de doscientas entradas y las cubre todas.
// ponytail: lo que no case (&hellip;, &mdash;…) se queda literal, que es feo pero no roto.
const MARK = {
  acute: "́", grave: "̀", circ: "̂", tilde: "̃",
  uml: "̈", ring: "̊", cedil: "̧",
};
const NAMED = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };

// Deja pasar lo que no sea texto: en las páginas de UG los metadatos del tab
// faltan a veces, y aquí no es sitio para decidir qué hacer con eso.
export const decodeEntities = s => (typeof s !== "string" ? s : s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (whole, name) => {
    if (NAMED[name.toLowerCase()]) return NAMED[name.toLowerCase()];
    const mark = MARK[name.slice(1).toLowerCase()];
    return mark ? (name[0] + mark).normalize("NFC") : whole;
  }));

// Las páginas de UG llevan todos sus datos en un atributo HTML-escapado.
function jsStore(html) {
  const m = html.match(/class="js-store" data-content="([^"]+)"/);
  if (!m) throw new Error("Ultimate Guitar no ha devuelto datos (¿bloqueo del proxy?)");
  const unescaped = m[1]
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  return JSON.parse(unescaped).store.page.data;
}

// Solo transcripciones de acordes, la mejor votada de cada canción.
export function parseSearch(html) {
  const best = new Map();
  for (const r of jsStore(html).results ?? []) {
    if (r.type !== "Chords") continue;
    const key = `${r.artist_name}|${r.song_name}`.toLowerCase();
    if ((best.get(key)?.votes ?? -1) < (r.votes ?? 0)) {
      best.set(key, {
        artist: decodeEntities(r.artist_name),
        song: decodeEntities(r.song_name),
        rating: r.rating,
        votes: r.votes ?? 0,
        url: r.tab_url,
      });
    }
  }
  return [...best.values()].sort((a, b) => b.votes - a.votes);
}

// Acorde tal y como lo quiere el resto de la app: sin bajo (C/E → C, la cejilla y
// las reglas trabajan sobre la fundamental) y descartando lo que no parsea (N.C.).
const clean = sym => {
  const s = sym.trim().replace(/\/[A-G](#|b)?$/, "");
  return Chord.get(s).tonic ? s : null;
};

// Secciones de la transcripción: cabeceras [Verse 1]… y sus acordes [ch]X[/ch],
// colapsando repeticiones seguidas. Secciones con la misma progresión se funden
// en una (Verse 1, Verse 2…): lo que interesa es la progresión, no la letra.
export function parseTab(html) {
  const data = jsStore(html);
  // También el cuerpo: de ahí salen los nombres de las partes ([Estribillo]).
  const content = decodeEntities(data.tab_view.wiki_tab.content.replace(/\[\/?tab\]/g, ""));
  const sections = [];
  let current = null;
  for (const line of content.split("\n")) {
    const header = line.trim().match(/^\[([^\]]+)\]$/);
    if (header) {
      current = { name: header[1], chords: [] };
      sections.push(current);
      continue;
    }
    for (const [, sym] of line.matchAll(/\[ch\]([^[]+)\[\/ch\]/g)) {
      const c = clean(sym);
      if (!c) continue;
      current ??= (sections.push({ name: "Canción", chords: [] }), sections.at(-1));
      if (current.chords.at(-1) !== c) current.chords.push(c);
    }
  }
  const merged = new Map();
  for (const s of sections.filter(x => x.chords.length)) {
    const key = s.chords.join(" ");
    if (merged.has(key)) merged.get(key).name += `, ${s.name}`;
    else merged.set(key, s);
  }
  return {
    song: decodeEntities(data.tab.song_name),
    artist: decodeEntities(data.tab.artist_name),
    key: data.tab.tonality_name || null,
    sections: [...merged.values()],
  };
}

// Autocompletado: el endpoint de sugerencias de UG es estático y sirve CORS
// abierto, así que va directo, sin proxy. Indexa prefijos de hasta 5 caracteres
// (minúsculas, sin tildes, espacios como _); el afinado se hace aquí filtrando.
const norm = q => q.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
export const suggestionSlug = q => norm(q).replace(/[^a-z0-9]+/g, "_").slice(0, 5);

export async function suggestions(query) {
  const slug = suggestionSlug(query);
  if (!slug) return [];
  try {
    const r = await fetch(`https://www.ultimate-guitar.com/static/article/suggestions/v5/${slug[0]}/${slug}.js`);
    if (!r.ok) return []; // prefijo sin fichero: sin sugerencias
    return ((await r.json()).suggestions ?? []).filter(s => s.startsWith(norm(query))).slice(0, 8);
  } catch {
    return []; // sin red no hay autocompletado, pero la búsqueda manual sigue
  }
}

export const searchSongs = query =>
  fetchUG(`https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`)
    .then(parseSearch);

export const fetchSong = url => fetchUG(url).then(parseTab);
