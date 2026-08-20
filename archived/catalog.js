import { Chord, Note } from "tonal";

// GUARDADO: hoy la app no importa este fichero. Sigue probado, y sigue en pie el
// catálogo que lee; el porqué de tenerlo aparte está en archived/README.md.
//
// El catálogo: 385.664 canciones con sus progresiones por partes, publicadas
// como ficheros estáticos en un repo aparte, De Chordis Mysteriis. Salen de
// Chordonomicon, un dataset académico de progresiones, con los títulos
// resueltos contra un volcado público de pistas de Spotify. Aquí no hay
// servidor ni proxy: son JSON troceados que el navegador se baja y cachea, así
// que la búsqueda por título funciona sin depender de Ultimate Guitar en vivo.
//
// Lo que da el catálogo y UG no puede dar es la pregunta al revés: en qué
// canciones aparece una progresión. Eso necesita un índice construido de
// antemano, y por eso vive en datos y no en una consulta.
//
// localStorage.catalog lo sobrescribe, que es la vía para desarrollar contra
// una copia local de los datos.
const BASE = globalThis.localStorage?.catalog || "https://sanhuaaan.github.io/de-chordis-mysteriis";

// ── Firma de una progresión ────────────────────────────────────────────────
// Para buscar una progresión hace falta una forma de ella que no dependa del
// tono ni del color: Am F C G y Bm G D A son la misma pregunta, y Am7 F C Gsus4
// también. La firma guarda dos cosas por acorde: cuántos semitonos está su
// fundamental por encima de la del primero, y a qué familia pertenece (M mayor,
// m menor, d disminuido, a aumentado, s suspendido, 5 sin tercera). El bajo no
// cuenta: C/E es C tocado de otra manera, no otro acorde.
//
// La misma función construye el índice: el generador del tomo importa
// este fichero, así que si la firma cambia, los datos hay que rehacerlos.
const readings = new Map();

// [croma, familia] del símbolo, o null si tonal no sabe leerlo.
export function reading(sym) {
  if (readings.has(sym)) return readings.get(sym);
  const c = Chord.get(sym.split("/")[0]);
  let r = null;
  if (c.tonic) {
    const iv = new Set(c.intervals);
    const family = iv.has("3m") ? (iv.has("5d") ? "d" : "m")
      : iv.has("3M") ? (iv.has("5A") && !iv.has("5P") ? "a" : "M")
      : iv.has("4P") || iv.has("2M") ? "s"
      : "5";
    r = [Note.chroma(c.tonic), family];
  }
  readings.set(sym, r);
  return r;
}

// Firma de una ventana de una progresión ya leída, sin volver a mirar los
// acordes: construir el índice recorre millones de ventanas y leerlas otra vez
// en cada una es lo que separa unos minutos de una tarde.
export function windowSignature(readings, from, length) {
  const base = readings[from];
  if (!base) return null;
  let out = "";
  for (let i = from; i < from + length; i++) {
    const l = readings[i];
    if (!l) return null;
    out += (i > from ? "." : "") + ((l[0] - base[0] + 12) % 12) + l[1];
  }
  return out;
}

export const signature = chords => windowSignature(chords.map(reading), 0, chords.length);

// El shard sale de una huella de la firma, no de su texto: las firmas no tienen
// un prefijo con el que repartirlas de forma pareja.
export const fingerprint = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1024).toString(16).padStart(3, "0");
};

// ── Palabras ───────────────────────────────────────────────────────────────
// La misma normalización con la que se indexó: minúsculas, sin tildes y solo
// letras y números. Lo que se teclea y lo que está indexado tienen que
// coincidir carácter a carácter, así que esto lo usan las dos puntas.
export const normalize = s => (s ?? "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9\s]+/g, " ")
  .trim();

export const words = s => normalize(s).split(/\s+/).filter(Boolean);

// ── Descargas ──────────────────────────────────────────────────────────────
// Un fichero que no está no es un error: significa que no hay nada indexado ahí.
const cache = new Map();

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${BASE}/${path}`)
      .then(r => (r.status === 404 ? null : r.ok ? r.json() : Promise.reject(
        new Error(`El catálogo ha respondido ${r.status}. Ver el README.`))))
      .catch(err => {
        cache.delete(path); // que un corte de red no deje el fallo cacheado
        throw err.message?.startsWith("El catálogo")
          ? err
          : new Error(`No se llega al catálogo (${BASE}). Ver el README.`);
      }));
  }
  return cache.get(path);
}

let manifest = null;
const index = () => (manifest ??= load("titulos.json"));

// Qué hay publicado: cuántas canciones, de dónde salen y con qué topes se
// construyó el índice. Lo pinta la pestaña de "dónde suena", que si no tendría
// que llevar los números copiados a mano.
export const meta = () => load("meta.json");

// ── Búsqueda por título ────────────────────────────────────────────────────
// El índice reparte las canciones por prefijo de palabra, con prefijos más
// largos donde hay más canciones (todo lo que empieza por "the" no cabe en un
// fichero). Buscar es elegir de qué palabra tirar: la que dé el trozo más
// pequeño, porque el filtrado fino se hace luego aquí con la consulta entera.
export function shardFor(word, manifest) {
  for (let n = word.length; n >= 3; n--) {
    const p = word.slice(0, n);
    if (manifest[p] != null) return p;
  }
  // Palabra más corta que los prefijos con que se indexó: valen todos los que
  // empiecen por ella, pero solo si son pocos; si no, hay que teclear más.
  const children = Object.keys(manifest).filter(p => p.startsWith(word));
  return children.length && children.length <= 4 ? children : null;
}

// Un shard es { a: [intérpretes], f: [[id, título, índice del intérprete]] }: el
// mismo intérprete sale muchas veces en un fichero y guardarlo una sola vez es
// un tercio menos de índice.
const rows = chunk => (chunk?.f ?? []).map(([id, title, ia]) => [id, title, chunk.a[ia] ?? ""]);

const matches = (row, ws) => {
  const own = [...words(row[1]), ...words(row[2])];
  return ws.every(w => own.some(s => s.startsWith(w)));
};

// Lo que se teclea suele ser el título, a veces con el intérprete detrás. Puntúa
// mejor lo que empieza por lo tecleado y lo que lo tiene entero en el título;
// a igualdad, el título más corto, que es el que menos añade por su cuenta.
//
// Y cuenta por dónde viene entre las que casan, que no es un dato cualquiera: las
// filas del fichero están ordenadas de intérprete más transcrito a menos, así que
// el orden en que sobreviven al filtro es la única señal de "esto lo conoce
// alguien" que hay. Pesa lo justo para que el original le gane a una versión
// oscura que se llame exactamente igual.
// Los títulos vienen de Spotify y arrastran la coletilla de la edición: "Let It
// Be - Remastered 2009", "Hotel California - Live; 1999 Remaster". Sin quitarla,
// cualquier versión de instituto que se llame exactamente igual le gana al
// original, que es justo al revés de lo que quiere quien busca.
const EDITION = /\s*[-–—(\[]\s*[^-–—([]*\b(remaster\w*|live|mono|stereo|version|edit|radio|single|deluxe|bonus|anniversary|demo|cover|karaoke|instrumental)\b[^-–—([]*[)\]]?\s*$/i;
export const withoutEdition = t => {
  const clean = t.replace(EDITION, "").trim();
  return clean || t;
};

export function score(row, ws, rank = 1) {
  const title = normalize(withoutEdition(row[1]));
  const inTitle = words(row[1]);
  const query = ws.join(" ");
  // Una versión en directo o una de fiesta no es la primera opción de nadie.
  const dressed = row[1].length - title.length;
  let p = 30 * (1 - rank);
  if (title === query) p += 70;
  else if (title.startsWith(query)) p += 55;
  p += 10 * ws.filter(w => inTitle.some(s => s.startsWith(w))).length;
  p -= Math.min(title.length, 40) / 10;
  p -= dressed ? 3 : 0;
  return p;
}

export async function search(text, limit = 25) {
  const ws = words(text);
  if (!ws.length) return [];
  const man = await index();
  if (!man) return [];
  // De qué palabra tirar: la del shard más pequeño.
  let best = null;
  for (const w of ws) {
    const s = shardFor(w, man);
    if (!s) continue;
    const names = Array.isArray(s) ? s : [s];
    const size = names.reduce((a, n) => a + man[n], 0);
    if (!best || size < best.size) best = { names, size };
  }
  if (!best) return [];
  const chunks = await Promise.all(best.names.map(n => load(`titulos/${n}.json`)));
  const seen = new Set();
  const candidates = [];
  for (const t of chunks) {
    for (const row of rows(t)) {
      if (seen.has(row[0]) || !matches(row, ws)) continue;
      seen.add(row[0]);
      candidates.push(row);
    }
  }
  return candidates
    .map((f, i) => ({ row: f, p: score(f, ws, i / candidates.length) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, limit)
    .map(({ row: [id, song, artist] }) => ({ id, song, artist }));
}

// ── Una canción ────────────────────────────────────────────────────────────
// Las partes vienen como [nombre, "C Am F G"], con las repeticiones seguidas ya
// colapsadas y las partes que suenan igual fundidas, que es lo mismo que hace
// la app al leer una transcripción de Ultimate Guitar.
const PER_SHARD = 250;

// Chordonomicon marca las partes en inglés y con número (verse_1, chorus_2), y
// funde varias en una cuando suenan igual. Aquí se leen en castellano.
const PART_NAMES = {
  intro: "Intro", verse: "Estrofa", chorus: "Estribillo", bridge: "Puente",
  outro: "Coda", solo: "Solo", instrumental: "Instrumental", interlude: "Interludio",
  prechorus: "Pre-estribillo", "pre-chorus": "Pre-estribillo", refrain: "Estribillo",
  breakdown: "Ruptura", hook: "Gancho", song: "Progresión",
};

export function partName(raw) {
  const parts = raw.split(",").map(t => {
    const m = t.trim().match(/^(.*?)(?:_(\d+))?$/);
    const base = PART_NAMES[m[1]] ?? (m[1].charAt(0).toUpperCase() + m[1].slice(1));
    return m[2] && m[2] !== "1" ? `${base} ${m[2]}` : base;
  });
  return [...new Set(parts)].join(", ");
}

export async function song(id) {
  const shard = await load(`canciones/${Math.floor(id / PER_SHARD)}.json`);
  const parts = shard?.[id];
  if (!parts) return null;
  return parts.map(([name, chords]) => ({
    name: partName(name),
    chords: chords.split(" "),
  }));
}

// ── Dónde suena una progresión ─────────────────────────────────────────────
// El índice guarda ventanas de tres y cuatro acordes, no progresiones enteras:
// preguntar por una progresión larga es preguntar por sus trozos, y así una
// canción que la lleva a medias también aparece. De cada firma se guarda cuántas
// canciones la tienen y una muestra de hasta cuarenta con nombre, dos por
// intérprete como mucho, que es lo que cabe leer.
export const LENGTHS = [4, 3];

// Todas las ventanas por las que se puede preguntar, de la más larga a la más
// corta. Las de cuatro dicen más que las de tres, así que van primero.
//
// Sin repetir: una progresión que da la vuelta —C G Am F C G Am F— vuelve a
// pasar por las mismas ventanas, y preguntar dos veces lo mismo daría dos veces
// la misma respuesta. Manda la primera vez que aparece cada firma.
export function windows(chords) {
  const readings = chords.map(reading);
  const seen = new Set();
  const out = [];
  for (const n of LENGTHS) {
    if (chords.length < n) continue;
    if (chords.length === n && n !== LENGTHS[0] && out.length) break;
    for (let i = 0; i + n <= readings.length; i++) {
      const f = windowSignature(readings, i, n);
      if (!f || seen.has(f)) continue;
      seen.add(f);
      out.push({ signature: f, from: i, length: n, chords: chords.slice(i, i + n) });
    }
  }
  return out;
}

// { total, songs: [{ id, song, artist }] } o null si esa ventana no está en
// ninguna canción del catálogo.
export async function whereSounds(window) {
  const bucket = await load(`progresiones/${window.length}/${fingerprint(window.signature)}.json`);
  const e = bucket?.[window.signature];
  if (!e) return null;
  const [total, sample] = e;
  return { total, songs: sample.map(([id, song, artist]) => ({ id, song, artist: artist ?? "" })) };
}
