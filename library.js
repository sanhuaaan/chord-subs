import { Chord } from "tonal";

// El cancionero de cada uno, en su propio navegador. La app es estática y el
// único servicio que hay detrás es un proxy sin estado, así que localStorage es
// el único sitio que acepta escrituras sin montar cuentas ni base de datos. A
// cambio no viaja de un dispositivo a otro y se lo lleva un borrado de datos del
// sitio: de eso se encargan descargar y cargar, que son a la vez la copia de
// seguridad y la manera de pasarle el cancionero a alguien.
export const KEY = "jangle.songs";
export const VERSION = 1;

export const emptyLibrary = () => ({ version: VERSION, songs: [] });

// Identidad de una canción: intérprete y título, sin ids generados. El par ya
// distingue, así que guardar dos veces lo mismo no duplica; y el JSON exportado
// se puede recortar y editar a mano sin tener que inventarse identificadores,
// que es media razón de que exista el fichero.
export const songKey = s => `${(s.artist ?? "").trim()}|${(s.song ?? "").trim()}`.toLowerCase();

const text = v => (typeof v === "string" ? v.trim() : "");

// Un acorde vale si tonal sabe leerlo. Es la misma criba que se aplica a las
// transcripciones de Ultimate Guitar, y aquí evita que un fichero traído de
// fuera cuele progresiones que reventarían al usarlas, ya lejos de la carga.
const isChord = sym => !!Chord.get(text(sym)).tonic;

const validSection = s => {
  const chords = Array.isArray(s?.chords) ? s.chords.map(text) : [];
  if (!chords.length || !chords.every(isChord)) return null;
  return { name: text(s?.name) || "Progresión", chords };
};

// Dos partes con la misma progresión son la misma parte: lo que se guarda es la
// progresión y no la letra, igual que al leer una transcripción se funden Verse
// 1 y Verse 2. Gana el nombre que ya estuviera guardado.
const dedupe = sections => {
  const seen = new Map();
  for (const s of sections) seen.set(s.chords.join(" "), seen.get(s.chords.join(" ")) ?? s);
  return [...seen.values()];
};

// El orden de las claves es el del fichero exportado, que se lee a mano.
const validSong = s => {
  const song = text(s?.song);
  const sections = dedupe((Array.isArray(s?.sections) ? s.sections : []).map(validSection).filter(Boolean));
  if (!song || !sections.length) return null;
  const out = { song, artist: text(s?.artist) };
  if (text(s?.key)) out.key = text(s.key);
  if (text(s?.url)) out.url = text(s.url);
  out.sections = sections;
  return out;
};

// Al fundir manda lo que ya había: los datos sueltos (tonalidad, enlace) solo se
// rellenan si faltaban, para que cargar un fichero no reescriba lo de casa.
const mergeSong = (a, b) => validSong({
  song: a.song,
  artist: a.artist || b.artist,
  key: a.key || b.key,
  url: a.url || b.url,
  sections: [...a.sections, ...b.sections],
});

// Sangrado y sin fechas ni contadores: el fichero se lee y se edita a mano, y
// exportar dos veces el mismo cancionero da el mismo fichero. Eso es lo que
// permite llevarlo en git y que el diff diga algo.
export const libraryJson = lib => JSON.stringify({ version: VERSION, songs: lib.songs }, null, 2);

// Deja pasar lo que se entienda y cuenta lo que no, porque una carga que
// descarta en silencio no se distingue de una que ha ido bien.
export function parseLibrary(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Eso no es un fichero JSON válido.");
  }
  // Un array pelado también vale: es lo que queda al recortar el fichero a mano,
  // y no hay razón para exigir el envoltorio si lo de dentro se entiende igual.
  if (Array.isArray(data)) data = { songs: data };
  if (!data || typeof data !== "object" || !Array.isArray(data.songs)) {
    throw new Error("El fichero no parece un cancionero de Jangle: no trae una lista de canciones.");
  }
  if (data.version != null && data.version !== VERSION) {
    throw new Error(`Ese cancionero es de la versión ${data.version} y esta Jangle entiende la ${VERSION}.`);
  }

  const songs = [];
  let dropped = 0;
  for (const entry of data.songs) {
    const s = validSong(entry);
    if (!s) {
      dropped++;
      continue;
    }
    const at = songs.findIndex(x => songKey(x) === songKey(s));
    if (at < 0) songs.push(s);
    else songs[at] = mergeSong(songs[at], s);
  }
  return { lib: { version: VERSION, songs }, dropped };
}

// Leer nunca falla: sin la clave, con el contenido corrompido o con el
// almacenamiento desactivado sale un cancionero vacío en vez de romper el
// arranque. Ojo, tampoco borra lo que hubiera: si el fallo es nuestro, los datos
// siguen ahí para cuando se arregle.
export function readLibrary(storage) {
  try {
    const raw = (storage ?? globalThis.localStorage)?.getItem(KEY);
    return raw ? parseLibrary(raw).lib : emptyLibrary();
  } catch {
    return emptyLibrary();
  }
}

// Escribir sí puede fallar de verdad —la cuota son unos 5 MB y en navegación
// privada puede no haber almacenamiento—, así que se avisa en vez de dar por
// guardado lo que no se ha guardado.
export function writeLibrary(lib, storage) {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, libraryJson(lib));
  } catch {
    throw new Error("El navegador no ha dejado guardar. Puede estar lleno o tener el almacenamiento desactivado; descarga el cancionero para no perderlo.");
  }
}

// Guardar una parte. Si la canción ya está se le añade, y si esa progresión ya
// estaba no se duplica: `added` es lo que la interfaz necesita para distinguir
// "guardada" de "ya la tenías", que sin avisar parecen lo mismo.
export function saveSection(lib, song, section) {
  const entry = validSong({ ...song, sections: [section] });
  if (!entry) throw new Error("Para guardar hacen falta un nombre y una progresión con acordes.");

  const songs = [...lib.songs];
  const at = songs.findIndex(x => songKey(x) === songKey(entry));
  if (at < 0) return { lib: { ...lib, songs: [...songs, entry] }, added: true };
  songs[at] = mergeSong(songs[at], entry);
  return { lib: { ...lib, songs }, added: songs[at].sections.length > lib.songs[at].sections.length };
}

// Quitar la última parte se lleva la canción por delante: una canción sin
// progresiones no es nada que se pueda enseñar ni usar.
export const removeSection = (lib, key, index) => ({
  ...lib,
  songs: lib.songs
    .map(s => (songKey(s) !== key ? s : { ...s, sections: s.sections.filter((_, i) => i !== index) }))
    .filter(s => s.sections.length),
});

export const removeSong = (lib, key) => ({ ...lib, songs: lib.songs.filter(s => songKey(s) !== key) });

// Cargar un cancionero funde, no reemplaza: así se pueden juntar varios ficheros
// y cargar el propio dos veces no cambia nada. Se cuenta lo que ha entrado por
// lo mismo que en saveSection: sin cifras, una carga inútil parece un fallo.
export function mergeLibrary(lib, incoming) {
  let out = lib;
  let songs = 0;
  let sections = 0;
  for (const s of incoming.songs) {
    const before = out.songs.find(x => songKey(x) === songKey(s));
    if (!before) songs++;
    const had = before?.sections.length ?? 0;
    for (const sec of s.sections) out = saveSection(out, s, sec).lib;
    sections += out.songs.find(x => songKey(x) === songKey(s)).sections.length - had;
  }
  return { lib: out, songs, sections };
}
