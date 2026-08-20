import { createReadStream, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { parts } from "./song.mjs";
import { reading, windowSignature, fingerprint, words } from "../catalog.js";

// Convierte el volcado de Chordonomicon (una línea de JSON por canción, con el
// título ya resuelto: ver README.md) en los ficheros estáticos que se publican
// en De Chordis Mysteriis. Todo lo que decide qué se puede buscar y cómo se
// puntúa está aquí; quien lea el catálogo solo lee.
//
//   node archived/data/build.mjs songs.jsonl ../de-chordis-mysteriis
//
// La firma de una progresión y la partición en palabras salen de catalog.js,
// que es lo que usa el navegador: si cambian ahí, hay que rehacer los datos.

const INPUT = process.argv[2] ?? "songs.jsonl";
const OUTPUT = process.argv[3] ?? "generated-data";
const PER_SHARD = 250;        // songs por fichero de progresiones
const WORD_CAP = 4000;    // entradas por shard de títulos antes de partirlo
const SHARD_CAP = 6000;      // …y tope duro, para words que no se pueden partir
const SIGNATURE_CAP = 40;        // songs que se listan por progresión
const PER_ARTIST = 2;        // …y cuántas de ellas puede poner el mismo intérprete
const NGRAMS = [4, 3];

const lines = () => createInterface({ input: createReadStream(INPUT), crlfDelay: Infinity });

// ── Primera pasada: cuántas canciones tiene cada intérprete ────────────────
// Es la única señal de "esto lo conoce alguien" que sale del propio dataset, y
// hace falta para dos cosas: ordenar los resultados de una búsqueda y elegir
// qué cuarenta canciones enseñar de las veinticuatro mil que llevan C Am F G.
// No es popularidad —eso es de Spotify y no se toca—: es cuánto se ha
// transcrito a ese intérprete, que para esto sirve igual.
const weight = new Map();
for await (const line of lines()) {
  const r = JSON.parse(line);
  if (r.title && r.artist) weight.set(r.artist, (weight.get(r.artist) ?? 0) + 1);
}
console.error(`intérpretes: ${weight.size}`);

// ── Segunda pasada: partes, índice de títulos e índice inverso ─────────────
const songs = [];   // [id, title, artist, weight, nº de parts]
const sectionsById = new Map();
// firma -> { total, muestra: [[id, titulo, artista]], pesos: [], porArtista: Map }
const signatures = NGRAMS.map(() => new Map());

// La muestra se queda con las mejores: más peso del intérprete y más partes
// marcadas, que es lo que separa una canción que alguien reconoce de una
// transcripción suelta. Y como mucho dos por intérprete, para que una lista de
// cuarenta no sea el mismo grupo cuarenta veces.
function toSample(e, row, value, artist) {
  if (e.sample.length < SIGNATURE_CAP) {
    const n = e.byArtist.get(artist) ?? 0;
    if (artist && n >= PER_ARTIST) return;
    e.byArtist.set(artist, n + 1);
    e.sample.push(row);
    e.weights.push(value);
    return;
  }
  let worst = 0;
  for (let i = 1; i < e.weights.length; i++) if (e.weights[i] < e.weights[worst]) worst = i;
  if (e.weights[worst] >= value) return;
  const theirs = e.sample[worst][2] ?? "";
  const n = e.byArtist.get(artist) ?? 0;
  if (artist && artist !== theirs && n >= PER_ARTIST) return;
  e.byArtist.set(theirs, (e.byArtist.get(theirs) ?? 1) - 1);
  e.byArtist.set(artist, (e.byArtist.get(artist) ?? 0) + 1);
  e.sample[worst] = row;
  e.weights[worst] = value;
}

let readCount = 0;
for await (const line of lines()) {
  const r = JSON.parse(line);
  readCount++;
  // Sin título no hay nada que enseñar ni por lo que buscar: esas filas solo
  // engordarían un recuento de canciones que no se pueden abrir.
  if (!r.title) continue;
  const ps = parts(r.chords);
  if (!ps.length) continue;
  const title = r.title, artist = r.artist ?? "";
  const howMany = weight.get(artist) ?? 0;
  songs.push([r.id, title, artist, howMany * 10 + Math.min(ps.length, 9)]);
  // Para la muestra el peso pesa menos —logarítmico, que si no los seis
  // intérpretes con quinientas transcripciones salen en todas las progresiones—
  // y lleva un dado sacado del propio id: determinista, así que dos generaciones
  // dan lo mismo, pero distinto de una progresión a otra.
  const dice = 0.6 + ((Math.imul(r.id, 2654435761) >>> 0) % 1000) / 1250;
  const value = (Math.log2(1 + howMany) * 10 + Math.min(ps.length, 9)) * dice;
  sectionsById.set(r.id, ps.map(p => [p.nombre, p.acordes.join(" ")]));

  const readingsByPart = ps.map(p => p.acordes.map(reading));
  const row = artist ? [r.id, title, artist] : [r.id, title];
  for (let k = 0; k < NGRAMS.length; k++) {
    const N = NGRAMS[k], seen = new Set();
    for (const l of readingsByPart) {
      for (let i = 0; i + N <= l.length; i++) {
        const f = windowSignature(l, i, N);
        if (f) seen.add(f);
      }
    }
    for (const f of seen) {
      let e = signatures[k].get(f);
      if (!e) signatures[k].set(f, e = { total: 0, sample: [], weights: [], byArtist: new Map() });
      e.total++;
      toSample(e, row, value, artist);
    }
  }
  if (readCount % 100000 === 0) console.error("…", readCount);
}
console.error(`leídas ${readCount}, publicadas ${songs.length}`);

// ── Canciones, por tramos de id ────────────────────────────────────────────
rmSync(`${OUTPUT}/canciones`, { recursive: true, force: true });
rmSync(`${OUTPUT}/titulos`, { recursive: true, force: true });
rmSync(`${OUTPUT}/progresiones`, { recursive: true, force: true });
mkdirSync(`${OUTPUT}/canciones`, { recursive: true });
const byRange = new Map();
for (const [id] of songs) {
  const t = Math.floor(id / PER_SHARD);
  if (!byRange.has(t)) byRange.set(t, []);
  byRange.get(t).push(id);
}
for (const [t, ids] of byRange) {
  const obj = {};
  for (const id of ids) obj[id] = sectionsById.get(id);
  writeFileSync(`${OUTPUT}/canciones/${t}.json`, JSON.stringify(obj));
}
console.error("shards de canciones:", byRange.size);

// ── Índice de títulos: prefijos adaptativos ────────────────────────────────
// Cada canción se indexa por cada palabra de su título y de su intérprete. Los
// prefijos de tres letras bastan casi siempre; los que se pasan de tamaño (todo
// lo que empieza por "the") se parten en prefijos más largos hasta que caben.
const entryById = new Map(songs.map(c => [c[0], c]));
const byWord = new Map();
for (const [id, title, artist] of songs) {
  for (const w of new Set([...words(title), ...words(artist)])) {
    if (!byWord.has(w)) byWord.set(w, []);
    byWord.get(w).push(id);
  }
}
const shards = new Map();
function distribute(prefix, group, depth) {
  const ids = new Set();
  for (const w of group) for (const id of byWord.get(w)) ids.add(id);
  const exactOnes = group.filter(w => w.length <= depth);
  if (ids.size <= WORD_CAP || group.length === exactOnes.length || depth > 8) {
    shards.set(prefix, [...ids]);
    return;
  }
  // se quedan aquí las palabras que no dan para más letras; el resto baja un nivel
  const remaining = new Set();
  for (const w of exactOnes) for (const id of byWord.get(w)) remaining.add(id);
  const groups = new Map();
  for (const w of group) {
    if (w.length <= depth) continue;
    const p = w.slice(0, depth + 1);
    if (!groups.has(p)) groups.set(p, []);
    groups.get(p).push(w);
  }
  if (remaining.size) shards.set(prefix, [...remaining]);
  for (const [p, ws] of groups) distribute(p, ws, depth + 1);
}
const root = new Map();
for (const w of byWord.keys()) {
  const p = w.slice(0, 3);
  if (!root.has(p)) root.set(p, []);
  root.get(p).push(w);
}
for (const [p, ws] of root) distribute(p, ws, 3);

// Dentro de un shard las filas van de más peso a menos y el mismo intérprete
// sale una sola vez en una tabla: lo primero le ahorra al navegador guardar un
// número por fila —su orden de sort es estable, así que a igualdad de acierto
// manda el del fichero— y lo segundo es un tercio menos de índice.
mkdirSync(`${OUTPUT}/titulos`, { recursive: true });
const manifest = {};
for (const [p, ids] of shards) {
  const artists = new Map();
  const rows = ids
    .map(id => entryById.get(id))
    .sort((a, b) => b[3] - a[3])
    .slice(0, SHARD_CAP)
    .map(([id, title, artist]) => {
      if (!artists.has(artist)) artists.set(artist, artists.size);
      return [id, title, artists.get(artist)];
    });
  writeFileSync(`${OUTPUT}/titulos/${p}.json`,
    JSON.stringify({ a: [...artists.keys()], f: rows }));
  manifest[p] = rows.length;
}
writeFileSync(`${OUTPUT}/titulos.json`, JSON.stringify(manifest));
console.error("shards de títulos:", shards.size);

// ── Índice inverso: progresión → canciones ─────────────────────────────────
for (let k = 0; k < NGRAMS.length; k++) {
  const dir = `${OUTPUT}/progresiones/${NGRAMS[k]}`;
  mkdirSync(dir, { recursive: true });
  const buckets = new Map();
  for (const [f, e] of signatures[k]) {
    const ordered = e.sample
      .map((row, i) => [row, e.weights[i]])
      .sort((a, b) => b[1] - a[1])
      .map(([row]) => row);
    const h = fingerprint(f);
    if (!buckets.has(h)) buckets.set(h, {});
    buckets.get(h)[f] = [e.total, ordered];
  }
  for (const [h, obj] of buckets) writeFileSync(`${dir}/${h}.json`, JSON.stringify(obj));
  console.error(`firmas de ${NGRAMS[k]}: ${signatures[k].size} en ${buckets.size} ficheros`);
}

writeFileSync(`${OUTPUT}/meta.json`, JSON.stringify({
  version: 1,
  source: "ailsntua/Chordonomicon (CC BY-NC 4.0)",
  titles: "GildasLeDrogoff/spotify-huge-track-analysis-dataset (CC BY-NC 4.0)",
  songs: songs.length,
  perShard: PER_SHARD,
  shardCap: SHARD_CAP,
  ngrams: NGRAMS,
  signatureCap: SIGNATURE_CAP,
  byArtist: PER_ARTIST,
}, null, 2));
console.error("hecho");
