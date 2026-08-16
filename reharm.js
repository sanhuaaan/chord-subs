import { RULES, detectKey } from "./rules.js";
import { findShape, absoluteFrets, STRINGS, MAX_FRET, PC } from "./guitar.js";

// Rearmonizar la progresión entera en vez de acorde a acorde. La pestaña de
// sustituciones da opciones sueltas; aquí se eligen unas cuantas que encajen
// entre sí, y el criterio para encajar es qué hace la voz de arriba: la nota más
// aguda de cada acorde tiene que dibujar una línea, no dar saltos.
//
// Es un camino mínimo sobre un grafo por capas: cada hueco de la progresión
// ofrece varios acordes, cada acorde varias digitaciones, y el coste de encadenar
// dos digitaciones lo pone el salto de esa voz superior. Viterbi encuentra la
// cadena entera de una pasada.

// Hacia dónde se quiere que vaya la línea. No es una imposición: es lo que sale
// barato, así que si la progresión no da para ello se cede en vez de fallar.
export const INTENTIONS = [
  {
    id: "descendente",
    dir: -1,
    name: "Línea descendente",
    why: "La voz de arriba cae por grados conjuntos. Es el recurso más socorrido para que una progresión estática tire hacia delante.",
  },
  {
    id: "ascendente",
    dir: 1,
    name: "Línea ascendente",
    why: "La voz de arriba sube paso a paso, que empuja y abre. Funciona bien en un puente o subiendo a un estribillo.",
  },
  {
    id: "pedal",
    dir: 0,
    name: "Nota pedal arriba",
    why: "La misma nota aguda se mantiene mientras los acordes cambian por debajo. Da unidad y hace que los cambios suenen a color, no a movimiento.",
  },
];

// Acordes que pueden ocupar cada hueco: el original y lo que propongan las
// reglas. Una opción puede meter más de un acorde en el mismo hueco (el ii-V,
// los acordes de paso), y entonces se reparten su tiempo.
function slotOptions(progression, key) {
  return progression.map((c, i) => {
    const options = [{ chords: [c.symbol], rule: null, why: "" }];
    for (const rule of RULES) {
      const r = rule.apply(c, progression[i + 1], key);
      if (r && r.chords.join(" ") !== c.symbol) {
        options.push({ chords: r.chords, rule: rule.name, why: r.why });
      }
    }
    return options;
  });
}

// Digitaciones de la BD que caben en el mástil, cada una con su voz superior:
// la nota que más suena, que es la que dibuja la línea.
function voicings(db, symbol, max) {
  const shape = db && findShape(db, symbol);
  if (!shape) return [];
  const out = [];
  for (const position of shape.positions) {
    const frets = absoluteFrets(position);
    if (!frets.every(f => f <= MAX_FRET)) continue;
    const sounding = frets
      .map((f, i) => (f < 0 ? null : { midi: STRINGS[i][1] + f, stringIdx: i }))
      .filter(Boolean);
    if (sounding.length < 3) continue;
    const top = sounding.reduce((a, b) => (b.midi > a.midi ? b : a));
    out.push({ symbol, position, frets, top: top.midi, topString: top.stringIdx, baseFret: position.baseFret });
    if (out.length === max) break;
  }
  return out;
}

// Lo que cuesta encadenar dos digitaciones. Manda el salto de la voz superior:
// el grado conjunto sale gratis porque es lo que hace línea, repetir nota cuesta
// poco, y el salto se paga caro. `dir` inclina la línea: -1 baja, +1 sube, 0 la
// quiere quieta. Lo demás son penalizaciones de tocabilidad.
function linkCost(prev, next, dir) {
  const delta = next.top - prev.top;
  const step = Math.abs(delta);
  let cost = step === 0 ? (dir === 0 ? 0 : 3)
    : step <= 2 ? (dir === 0 ? 5 : 0)
    : step <= 4 ? 6
    : 12 + step;
  if (dir !== 0 && Math.sign(delta) === -dir) cost += 7; // se va en contra de la línea
  cost += Math.abs(next.baseFret - prev.baseFret) * 0.4; // saltos de mano por el mástil
  if (next.topString !== 5) cost += 1.5; // mejor que la línea caiga en la 1ª cuerda
  return cost;
}

// Sustituir tiene que ganarse el sitio, pero barato: quien de verdad limita los
// cambios es el presupuesto de abajo. Meter acordes de más densifica la
// progresión, así que eso sí se cobra aparte.
// El primer acorde es el que planta la tonalidad: cambiarlo desdibuja la canción
// de entrada, así que se cobra aparte y solo cae si compensa de sobra.
const optionCost = (option, slot) =>
  (option.rule ? 0.8 : 0) + (option.chords.length - 1) * 1.5 + (option.rule && slot === 0 ? 6 : 0);

// Un cambio que deja el mismo acorde dos veces seguidas donde el original tenía
// movimiento no es rearmonizar: es quedarse sin un acorde. Si la repetición ya
// venía en el original se respeta, que para eso la escribió quien la escribió.
const repeatCost = (prevSym, nextSym, prevOrig, nextOrig) =>
  prevSym === nextSym && prevOrig !== nextOrig ? 30 : 0;

// Cuántos acordes como mucho se permite tocar. Con peaje y sin tope, o no
// sustituye nunca o sustituye en todas partes: un Fm prestado en el sitio justo
// es un hallazgo, y en cada compás es otra canción. Un tercio de la progresión.
const budgetFor = progression => Math.max(1, Math.round(progression.length / 3));

// Devuelve la progresión rearmonizada según `intention`, o null si la BD no da
// digitaciones para alguno de los acordes originales.
export function reharmonize(db, progression, intention, maxVoicings = 5) {
  const key = detectKey(progression);
  const dir = intention.dir;
  const cache = new Map();
  const voi = sym => {
    if (!cache.has(sym)) cache.set(sym, voicings(db, sym, maxVoicings));
    return cache.get(sym);
  };

  // Cada capa son los caminos posibles dentro de un hueco: una opción de acorde
  // con una digitación elegida para cada uno de sus acordes.
  const layers = slotOptions(progression, key).map((options, slot) => {
    const nodes = [];
    for (const option of options) {
      const chains = option.chords.reduce(
        (acc, sym) => acc.flatMap(chain => voi(sym).map(v => [...chain, v])),
        [[]],
      );
      for (const chain of chains) {
        let internal = optionCost(option, slot);
        for (let k = 1; k < chain.length; k++) internal += linkCost(chain[k - 1], chain[k], dir);
        nodes.push({ option, chain, internal, cost: 0, from: null });
      }
    }
    return nodes;
  });
  if (layers.some(l => !l.length)) return null; // algún acorde sin digitación en la BD

  // Viterbi con el presupuesto de sustituciones dentro del estado: para cada
  // hueco se guarda el mejor camino que llega habiendo gastado b cambios.
  const budget = budgetFor(progression);
  const slots = Array.from({ length: budget + 1 }, (_, i) => i);
  layers.forEach((layer, i) => {
    for (const node of layer) {
      node.costs = new Array(budget + 1).fill(Infinity);
      node.froms = new Array(budget + 1).fill(null);
      const used = node.option.rule ? 1 : 0;
      if (i === 0) {
        if (used <= budget) node.costs[used] = node.internal;
        continue;
      }
      for (const p of layers[i - 1]) {
        const link = linkCost(p.chain.at(-1), node.chain[0], dir)
          + repeatCost(p.chain.at(-1).symbol, node.chain[0].symbol, progression[i - 1].symbol, progression[i].symbol);
        for (const b of slots) {
          if (p.costs[b] === Infinity || b + used > budget) continue;
          const c = p.costs[b] + link + node.internal;
          if (c < node.costs[b + used]) {
            node.costs[b + used] = c;
            node.froms[b + used] = { node: p, budget: b };
          }
        }
      }
    }
  });

  // El mejor final entre todos los presupuestos, y vuelta atrás por los punteros.
  let best = null;
  for (const node of layers.at(-1)) {
    for (const b of slots) {
      if (node.costs[b] < (best?.cost ?? Infinity)) best = { node, budget: b, cost: node.costs[b] };
    }
  }
  if (!best) return null;
  const total = best.cost;
  const path = [];
  for (let cur = best; cur; cur = cur.node.froms[cur.budget]) path.unshift(cur.node);

  // Aplanar a la lista de acordes que se tocan, con de dónde sale cada uno.
  const steps = [];
  path.forEach((n, slot) => {
    n.chain.forEach((v, k) => {
      steps.push({
        slot,
        symbol: v.symbol,
        from: progression[slot].symbol,
        changed: v.symbol !== progression[slot].symbol, // el ii-V deja el dominante como estaba
        rule: k === 0 ? n.option.rule : null,
        why: k === 0 ? n.option.why : "",
        position: v.position,
        frets: v.frets,
        top: v.top,
        topNote: PC[v.top % 12],
        topString: STRINGS[v.topString][0],
      });
    });
  });

  return { intention, key, steps, line: steps.map(s => s.topNote), cost: total, ...lineStats(steps) };
}

// Qué tal ha salido la línea, para poder decirlo en pantalla en vez de que el
// usuario lo deduzca de los nombres de nota.
function lineStats(steps) {
  const moves = steps.slice(1).map((s, i) => s.top - steps[i].top);
  return {
    moves: moves.length,
    conjunct: moves.filter(d => Math.abs(d) > 0 && Math.abs(d) <= 2).length,
    held: moves.filter(d => d === 0).length,
    leaps: moves.filter(d => Math.abs(d) > 4).length,
    range: steps.length ? Math.max(...steps.map(s => s.top)) - Math.min(...steps.map(s => s.top)) : 0,
  };
}

// Las versiones, de mejor a peor línea conseguida. Dos intenciones distintas
// pueden acabar en el mismo arreglo (una progresión no siempre da para subir y
// bajar); en ese caso se enseña una sola vez, con la etiqueta que mejor salió.
export function reharmonizations(db, progression) {
  const seen = new Set();
  return INTENTIONS
    .map(i => reharmonize(db, progression, i))
    .filter(Boolean)
    .sort((a, b) => a.cost - b.cost)
    .filter(v => {
      const key = v.steps.map(s => `${s.symbol}:${s.top}`).join(" ");
      return !seen.has(key) && seen.add(key);
    });
}
