import { createReadStream, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { createInterface } from "node:readline";
import { partes } from "./cancion.mjs";
import { lectura, firmaVentana, huella, palabras } from "../catalogo.js";

// Convierte el volcado de Chordonomicon (una línea de JSON por canción, con el
// título ya resuelto: ver LEEME.md) en los ficheros estáticos que se publican
// en De Chordis Mysteriis. Todo lo que decide qué se puede buscar y cómo se
// puntúa está aquí; quien lea el catálogo solo lee.
//
//   node guardado/datos/construir.mjs canciones.jsonl ../de-chordis-mysteriis
//
// La firma de una progresión y la partición en palabras salen de catalogo.js,
// que es lo que usa el navegador: si cambian ahí, hay que rehacer los datos.

const ENTRADA = process.argv[2] ?? "canciones.jsonl";
const SALIDA = process.argv[3] ?? "datos-generados";
const POR_SHARD = 250;        // canciones por fichero de progresiones
const TOPE_PALABRA = 4000;    // entradas por shard de títulos antes de partirlo
const TOPE_SHARD = 6000;      // …y tope duro, para palabras que no se pueden partir
const TOPE_FIRMA = 40;        // canciones que se listan por progresión
const POR_ARTISTA = 2;        // …y cuántas de ellas puede poner el mismo intérprete
const NGRAMAS = [4, 3];

const lineas = () => createInterface({ input: createReadStream(ENTRADA), crlfDelay: Infinity });

// ── Primera pasada: cuántas canciones tiene cada intérprete ────────────────
// Es la única señal de "esto lo conoce alguien" que sale del propio dataset, y
// hace falta para dos cosas: ordenar los resultados de una búsqueda y elegir
// qué cuarenta canciones enseñar de las veinticuatro mil que llevan C Am F G.
// No es popularidad —eso es de Spotify y no se toca—: es cuánto se ha
// transcrito a ese intérprete, que para esto sirve igual.
const peso = new Map();
for await (const linea of lineas()) {
  const r = JSON.parse(linea);
  if (r.title && r.artist) peso.set(r.artist, (peso.get(r.artist) ?? 0) + 1);
}
console.error(`intérpretes: ${peso.size}`);

// ── Segunda pasada: partes, índice de títulos e índice inverso ─────────────
const canciones = [];   // [id, titulo, artista, peso, nº de partes]
const seccionesPorId = new Map();
// firma -> { total, muestra: [[id, titulo, artista]], pesos: [], porArtista: Map }
const firmas = NGRAMAS.map(() => new Map());

// La muestra se queda con las mejores: más peso del intérprete y más partes
// marcadas, que es lo que separa una canción que alguien reconoce de una
// transcripción suelta. Y como mucho dos por intérprete, para que una lista de
// cuarenta no sea el mismo grupo cuarenta veces.
function aMuestra(e, fila, valor, artista) {
  if (e.muestra.length < TOPE_FIRMA) {
    const n = e.porArtista.get(artista) ?? 0;
    if (artista && n >= POR_ARTISTA) return;
    e.porArtista.set(artista, n + 1);
    e.muestra.push(fila);
    e.pesos.push(valor);
    return;
  }
  let peor = 0;
  for (let i = 1; i < e.pesos.length; i++) if (e.pesos[i] < e.pesos[peor]) peor = i;
  if (e.pesos[peor] >= valor) return;
  const suyo = e.muestra[peor][2] ?? "";
  const n = e.porArtista.get(artista) ?? 0;
  if (artista && artista !== suyo && n >= POR_ARTISTA) return;
  e.porArtista.set(suyo, (e.porArtista.get(suyo) ?? 1) - 1);
  e.porArtista.set(artista, (e.porArtista.get(artista) ?? 0) + 1);
  e.muestra[peor] = fila;
  e.pesos[peor] = valor;
}

let leidas = 0;
for await (const linea of lineas()) {
  const r = JSON.parse(linea);
  leidas++;
  // Sin título no hay nada que enseñar ni por lo que buscar: esas filas solo
  // engordarían un recuento de canciones que no se pueden abrir.
  if (!r.title) continue;
  const ps = partes(r.chords);
  if (!ps.length) continue;
  const titulo = r.title, artista = r.artist ?? "";
  const cuantas = peso.get(artista) ?? 0;
  canciones.push([r.id, titulo, artista, cuantas * 10 + Math.min(ps.length, 9)]);
  // Para la muestra el peso pesa menos —logarítmico, que si no los seis
  // intérpretes con quinientas transcripciones salen en todas las progresiones—
  // y lleva un dado sacado del propio id: determinista, así que dos generaciones
  // dan lo mismo, pero distinto de una progresión a otra.
  const dado = 0.6 + ((Math.imul(r.id, 2654435761) >>> 0) % 1000) / 1250;
  const valor = (Math.log2(1 + cuantas) * 10 + Math.min(ps.length, 9)) * dado;
  seccionesPorId.set(r.id, ps.map(p => [p.nombre, p.acordes.join(" ")]));

  const leidasPorParte = ps.map(p => p.acordes.map(lectura));
  const fila = artista ? [r.id, titulo, artista] : [r.id, titulo];
  for (let k = 0; k < NGRAMAS.length; k++) {
    const N = NGRAMAS[k], vistas = new Set();
    for (const l of leidasPorParte) {
      for (let i = 0; i + N <= l.length; i++) {
        const f = firmaVentana(l, i, N);
        if (f) vistas.add(f);
      }
    }
    for (const f of vistas) {
      let e = firmas[k].get(f);
      if (!e) firmas[k].set(f, e = { total: 0, muestra: [], pesos: [], porArtista: new Map() });
      e.total++;
      aMuestra(e, fila, valor, artista);
    }
  }
  if (leidas % 100000 === 0) console.error("…", leidas);
}
console.error(`leídas ${leidas}, publicadas ${canciones.length}`);

// ── Canciones, por tramos de id ────────────────────────────────────────────
rmSync(`${SALIDA}/canciones`, { recursive: true, force: true });
rmSync(`${SALIDA}/titulos`, { recursive: true, force: true });
rmSync(`${SALIDA}/progresiones`, { recursive: true, force: true });
mkdirSync(`${SALIDA}/canciones`, { recursive: true });
const porTramo = new Map();
for (const [id] of canciones) {
  const t = Math.floor(id / POR_SHARD);
  if (!porTramo.has(t)) porTramo.set(t, []);
  porTramo.get(t).push(id);
}
for (const [t, ids] of porTramo) {
  const obj = {};
  for (const id of ids) obj[id] = seccionesPorId.get(id);
  writeFileSync(`${SALIDA}/canciones/${t}.json`, JSON.stringify(obj));
}
console.error("shards de canciones:", porTramo.size);

// ── Índice de títulos: prefijos adaptativos ────────────────────────────────
// Cada canción se indexa por cada palabra de su título y de su intérprete. Los
// prefijos de tres letras bastan casi siempre; los que se pasan de tamaño (todo
// lo que empieza por "the") se parten en prefijos más largos hasta que caben.
const entradaPorId = new Map(canciones.map(c => [c[0], c]));
const porPalabra = new Map();
for (const [id, titulo, artista] of canciones) {
  for (const w of new Set([...palabras(titulo), ...palabras(artista)])) {
    if (!porPalabra.has(w)) porPalabra.set(w, []);
    porPalabra.get(w).push(id);
  }
}
const shards = new Map();
function reparte(prefijo, grupo, profundidad) {
  const ids = new Set();
  for (const w of grupo) for (const id of porPalabra.get(w)) ids.add(id);
  const exactas = grupo.filter(w => w.length <= profundidad);
  if (ids.size <= TOPE_PALABRA || grupo.length === exactas.length || profundidad > 8) {
    shards.set(prefijo, [...ids]);
    return;
  }
  // se quedan aquí las palabras que no dan para más letras; el resto baja un nivel
  const quedan = new Set();
  for (const w of exactas) for (const id of porPalabra.get(w)) quedan.add(id);
  const grupos = new Map();
  for (const w of grupo) {
    if (w.length <= profundidad) continue;
    const p = w.slice(0, profundidad + 1);
    if (!grupos.has(p)) grupos.set(p, []);
    grupos.get(p).push(w);
  }
  if (quedan.size) shards.set(prefijo, [...quedan]);
  for (const [p, ws] of grupos) reparte(p, ws, profundidad + 1);
}
const raiz = new Map();
for (const w of porPalabra.keys()) {
  const p = w.slice(0, 3);
  if (!raiz.has(p)) raiz.set(p, []);
  raiz.get(p).push(w);
}
for (const [p, ws] of raiz) reparte(p, ws, 3);

// Dentro de un shard las filas van de más peso a menos y el mismo intérprete
// sale una sola vez en una tabla: lo primero le ahorra al navegador guardar un
// número por fila —su orden de sort es estable, así que a igualdad de acierto
// manda el del fichero— y lo segundo es un tercio menos de índice.
mkdirSync(`${SALIDA}/titulos`, { recursive: true });
const manifiesto = {};
for (const [p, ids] of shards) {
  const artistas = new Map();
  const filas = ids
    .map(id => entradaPorId.get(id))
    .sort((a, b) => b[3] - a[3])
    .slice(0, TOPE_SHARD)
    .map(([id, titulo, artista]) => {
      if (!artistas.has(artista)) artistas.set(artista, artistas.size);
      return [id, titulo, artistas.get(artista)];
    });
  writeFileSync(`${SALIDA}/titulos/${p}.json`,
    JSON.stringify({ a: [...artistas.keys()], f: filas }));
  manifiesto[p] = filas.length;
}
writeFileSync(`${SALIDA}/titulos.json`, JSON.stringify(manifiesto));
console.error("shards de títulos:", shards.size);

// ── Índice inverso: progresión → canciones ─────────────────────────────────
for (let k = 0; k < NGRAMAS.length; k++) {
  const dir = `${SALIDA}/progresiones/${NGRAMAS[k]}`;
  mkdirSync(dir, { recursive: true });
  const cubos = new Map();
  for (const [f, e] of firmas[k]) {
    const orden = e.muestra
      .map((fila, i) => [fila, e.pesos[i]])
      .sort((a, b) => b[1] - a[1])
      .map(([fila]) => fila);
    const h = huella(f);
    if (!cubos.has(h)) cubos.set(h, {});
    cubos.get(h)[f] = [e.total, orden];
  }
  for (const [h, obj] of cubos) writeFileSync(`${dir}/${h}.json`, JSON.stringify(obj));
  console.error(`firmas de ${NGRAMAS[k]}: ${firmas[k].size} en ${cubos.size} ficheros`);
}

writeFileSync(`${SALIDA}/meta.json`, JSON.stringify({
  version: 1,
  fuente: "ailsntua/Chordonomicon (CC BY-NC 4.0)",
  titulos: "GildasLeDrogoff/spotify-huge-track-analysis-dataset (CC BY-NC 4.0)",
  canciones: canciones.length,
  porShard: POR_SHARD,
  topeShard: TOPE_SHARD,
  ngramas: NGRAMAS,
  topeFirma: TOPE_FIRMA,
  porArtista: POR_ARTISTA,
}, null, 2));
console.error("hecho");
