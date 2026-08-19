import { Chord, Note } from "tonal";

// GUARDADO: hoy la app no importa este fichero. Sigue probado, y sigue en pie el
// catálogo que lee; el porqué de tenerlo aparte está en guardado/LEEME.md.
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
// localStorage.catalogo lo sobrescribe, que es la vía para desarrollar contra
// una copia local de los datos.
const BASE = globalThis.localStorage?.catalogo || "https://sanhuaaan.github.io/de-chordis-mysteriis";

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
const leidas = new Map();

// [croma, familia] del símbolo, o null si tonal no sabe leerlo.
export function lectura(sym) {
  if (leidas.has(sym)) return leidas.get(sym);
  const c = Chord.get(sym.split("/")[0]);
  let r = null;
  if (c.tonic) {
    const iv = new Set(c.intervals);
    const familia = iv.has("3m") ? (iv.has("5d") ? "d" : "m")
      : iv.has("3M") ? (iv.has("5A") && !iv.has("5P") ? "a" : "M")
      : iv.has("4P") || iv.has("2M") ? "s"
      : "5";
    r = [Note.chroma(c.tonic), familia];
  }
  leidas.set(sym, r);
  return r;
}

// Firma de una ventana de una progresión ya leída, sin volver a mirar los
// acordes: construir el índice recorre millones de ventanas y leerlas otra vez
// en cada una es lo que separa unos minutos de una tarde.
export function firmaVentana(leidas, desde, largo) {
  const base = leidas[desde];
  if (!base) return null;
  let out = "";
  for (let i = desde; i < desde + largo; i++) {
    const l = leidas[i];
    if (!l) return null;
    out += (i > desde ? "." : "") + ((l[0] - base[0] + 12) % 12) + l[1];
  }
  return out;
}

export const firma = acordes => firmaVentana(acordes.map(lectura), 0, acordes.length);

// El shard sale de una huella de la firma, no de su texto: las firmas no tienen
// un prefijo con el que repartirlas de forma pareja.
export const huella = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1024).toString(16).padStart(3, "0");
};

// ── Palabras ───────────────────────────────────────────────────────────────
// La misma normalización con la que se indexó: minúsculas, sin tildes y solo
// letras y números. Lo que se teclea y lo que está indexado tienen que
// coincidir carácter a carácter, así que esto lo usan las dos puntas.
export const normalizar = s => (s ?? "").toLowerCase().normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9\s]+/g, " ")
  .trim();

export const palabras = s => normalizar(s).split(/\s+/).filter(Boolean);

// ── Descargas ──────────────────────────────────────────────────────────────
// Un fichero que no está no es un error: significa que no hay nada indexado ahí.
const cache = new Map();

function traer(ruta) {
  if (!cache.has(ruta)) {
    cache.set(ruta, fetch(`${BASE}/${ruta}`)
      .then(r => (r.status === 404 ? null : r.ok ? r.json() : Promise.reject(
        new Error(`El catálogo ha respondido ${r.status}. Ver el README.`))))
      .catch(err => {
        cache.delete(ruta); // que un corte de red no deje el fallo cacheado
        throw err.message?.startsWith("El catálogo")
          ? err
          : new Error(`No se llega al catálogo (${BASE}). Ver el README.`);
      }));
  }
  return cache.get(ruta);
}

let manifiesto = null;
const indice = () => (manifiesto ??= traer("titulos.json"));

// Qué hay publicado: cuántas canciones, de dónde salen y con qué topes se
// construyó el índice. Lo pinta la pestaña de "dónde suena", que si no tendría
// que llevar los números copiados a mano.
export const meta = () => traer("meta.json");

// ── Búsqueda por título ────────────────────────────────────────────────────
// El índice reparte las canciones por prefijo de palabra, con prefijos más
// largos donde hay más canciones (todo lo que empieza por "the" no cabe en un
// fichero). Buscar es elegir de qué palabra tirar: la que dé el trozo más
// pequeño, porque el filtrado fino se hace luego aquí con la consulta entera.
export function shardDe(palabra, manifiesto) {
  for (let n = palabra.length; n >= 3; n--) {
    const p = palabra.slice(0, n);
    if (manifiesto[p] != null) return p;
  }
  // Palabra más corta que los prefijos con que se indexó: valen todos los que
  // empiecen por ella, pero solo si son pocos; si no, hay que teclear más.
  const hijos = Object.keys(manifiesto).filter(p => p.startsWith(palabra));
  return hijos.length && hijos.length <= 4 ? hijos : null;
}

// Un shard es { a: [intérpretes], f: [[id, título, índice del intérprete]] }: el
// mismo intérprete sale muchas veces en un fichero y guardarlo una sola vez es
// un tercio menos de índice.
const filas = trozo => (trozo?.f ?? []).map(([id, titulo, ia]) => [id, titulo, trozo.a[ia] ?? ""]);

const casa = (fila, ws) => {
  const suyas = [...palabras(fila[1]), ...palabras(fila[2])];
  return ws.every(w => suyas.some(s => s.startsWith(w)));
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
const EDICION = /\s*[-–—(\[]\s*[^-–—([]*\b(remaster\w*|live|mono|stereo|version|edit|radio|single|deluxe|bonus|anniversary|demo|cover|karaoke|instrumental)\b[^-–—([]*[)\]]?\s*$/i;
export const sinEdicion = t => {
  const limpio = t.replace(EDICION, "").trim();
  return limpio || t;
};

export function puntua(fila, ws, rango = 1) {
  const titulo = normalizar(sinEdicion(fila[1]));
  const enTitulo = palabras(fila[1]);
  const query = ws.join(" ");
  // Una versión en directo o una de fiesta no es la primera opción de nadie.
  const vestida = fila[1].length - titulo.length;
  let p = 30 * (1 - rango);
  if (titulo === query) p += 70;
  else if (titulo.startsWith(query)) p += 55;
  p += 10 * ws.filter(w => enTitulo.some(s => s.startsWith(w))).length;
  p -= Math.min(titulo.length, 40) / 10;
  p -= vestida ? 3 : 0;
  return p;
}

export async function buscar(texto, tope = 25) {
  const ws = palabras(texto);
  if (!ws.length) return [];
  const man = await indice();
  if (!man) return [];
  // De qué palabra tirar: la del shard más pequeño.
  let mejor = null;
  for (const w of ws) {
    const s = shardDe(w, man);
    if (!s) continue;
    const nombres = Array.isArray(s) ? s : [s];
    const tam = nombres.reduce((a, n) => a + man[n], 0);
    if (!mejor || tam < mejor.tam) mejor = { nombres, tam };
  }
  if (!mejor) return [];
  const trozos = await Promise.all(mejor.nombres.map(n => traer(`titulos/${n}.json`)));
  const vistas = new Set();
  const candidatas = [];
  for (const t of trozos) {
    for (const fila of filas(t)) {
      if (vistas.has(fila[0]) || !casa(fila, ws)) continue;
      vistas.add(fila[0]);
      candidatas.push(fila);
    }
  }
  return candidatas
    .map((f, i) => ({ fila: f, p: puntua(f, ws, i / candidatas.length) }))
    .sort((a, b) => b.p - a.p)
    .slice(0, tope)
    .map(({ fila: [id, song, artist] }) => ({ id, song, artist }));
}

// ── Una canción ────────────────────────────────────────────────────────────
// Las partes vienen como [nombre, "C Am F G"], con las repeticiones seguidas ya
// colapsadas y las partes que suenan igual fundidas, que es lo mismo que hace
// la app al leer una transcripción de Ultimate Guitar.
const POR_SHARD = 250;

// Chordonomicon marca las partes en inglés y con número (verse_1, chorus_2), y
// funde varias en una cuando suenan igual. Aquí se leen en castellano.
const PARTES = {
  intro: "Intro", verse: "Estrofa", chorus: "Estribillo", bridge: "Puente",
  outro: "Coda", solo: "Solo", instrumental: "Instrumental", interlude: "Interludio",
  prechorus: "Pre-estribillo", "pre-chorus": "Pre-estribillo", refrain: "Estribillo",
  breakdown: "Ruptura", hook: "Gancho", song: "Progresión",
};

export function nombreParte(bruto) {
  const partes = bruto.split(",").map(t => {
    const m = t.trim().match(/^(.*?)(?:_(\d+))?$/);
    const base = PARTES[m[1]] ?? (m[1].charAt(0).toUpperCase() + m[1].slice(1));
    return m[2] && m[2] !== "1" ? `${base} ${m[2]}` : base;
  });
  return [...new Set(partes)].join(", ");
}

export async function cancion(id) {
  const shard = await traer(`canciones/${Math.floor(id / POR_SHARD)}.json`);
  const partes = shard?.[id];
  if (!partes) return null;
  return partes.map(([nombre, acordes]) => ({
    name: nombreParte(nombre),
    chords: acordes.split(" "),
  }));
}

// ── Dónde suena una progresión ─────────────────────────────────────────────
// El índice guarda ventanas de tres y cuatro acordes, no progresiones enteras:
// preguntar por una progresión larga es preguntar por sus trozos, y así una
// canción que la lleva a medias también aparece. De cada firma se guarda cuántas
// canciones la tienen y una muestra de hasta cuarenta con nombre, dos por
// intérprete como mucho, que es lo que cabe leer.
export const LARGOS = [4, 3];

// Todas las ventanas por las que se puede preguntar, de la más larga a la más
// corta. Las de cuatro dicen más que las de tres, así que van primero.
//
// Sin repetir: una progresión que da la vuelta —C G Am F C G Am F— vuelve a
// pasar por las mismas ventanas, y preguntar dos veces lo mismo daría dos veces
// la misma respuesta. Manda la primera vez que aparece cada firma.
export function ventanas(acordes) {
  const leidas = acordes.map(lectura);
  const vistas = new Set();
  const out = [];
  for (const n of LARGOS) {
    if (acordes.length < n) continue;
    if (acordes.length === n && n !== LARGOS[0] && out.length) break;
    for (let i = 0; i + n <= leidas.length; i++) {
      const f = firmaVentana(leidas, i, n);
      if (!f || vistas.has(f)) continue;
      vistas.add(f);
      out.push({ firma: f, desde: i, largo: n, acordes: acordes.slice(i, i + n) });
    }
  }
  return out;
}

// { total, canciones: [{ id, song, artist }] } o null si esa ventana no está en
// ninguna canción del catálogo.
export async function dondeSuena(ventana) {
  const cubo = await traer(`progresiones/${ventana.largo}/${huella(ventana.firma)}.json`);
  const e = cubo?.[ventana.firma];
  if (!e) return null;
  const [total, muestra] = e;
  return { total, canciones: muestra.map(([id, song, artist]) => ({ id, song, artist: artist ?? "" })) };
}
