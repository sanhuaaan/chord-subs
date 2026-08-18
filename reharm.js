import { optionsFor, detectKey } from "./rules.js";
import { playablePositions, STRINGS } from "./guitar.js";
import { noteName } from "./notes.js";

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
const INTENTIONS = [
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
// progresión, así que eso sí se cobra aparte. Adornar (un maj7, una 9ª) no
// cambia de acorde, así que cuesta menos que cambiarlo por otro.
// El primer acorde es el que planta la tonalidad: cambiarlo desdibuja la canción
// de entrada, así que se cobra aparte y solo cae si compensa de sobra.
const optionCost = (option, slot) =>
  (option.rule ? (option.kind === "color" ? 0.4 : 0.8) : 0)
  + (option.chords.length - 1) * 1.5
  + (option.rule && slot === 0 ? 6 : 0);

// Cuánto presupuesto gasta cada opción. Se cuenta en medios para que un adorno
// valga la mitad que una sustitución de verdad: con dos docenas de reglas, si
// todas costasen lo mismo el arreglo se iría en maj7 y se quedaría sin cambiar
// un solo acorde.
const budgetCost = option => (!option.rule ? 0 : option.kind === "color" ? 1 : 2);

// Cuántas digitaciones se prueban por acorde. Las opciones que meten varios
// acordes multiplican combinaciones (tres acordes a cinco digitaciones son 125
// caminos por hueco), así que ahí se recorta: con dos por acorde ya hay de sobra
// para que la línea encuentre por dónde ir.
const voicingsFor = (option, max) => (option.chords.length > 2 ? 2 : option.chords.length > 1 ? 3 : max);

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
function reharmonize(db, progression, intention, maxVoicings = 5) {
  const key = detectKey(progression);
  const dir = intention.dir;
  const cache = new Map();
  const voi = (sym, max) => {
    if (!cache.has(sym)) cache.set(sym, playablePositions(db, sym, maxVoicings));
    return cache.get(sym).slice(0, max);
  };

  // Cada capa son los caminos posibles dentro de un hueco: una opción de acorde
  // con una digitación elegida para cada uno de sus acordes.
  const layers = optionsFor(progression, key).map((options, slot) => {
    const nodes = [];
    for (const option of options) {
      const per = voicingsFor(option, maxVoicings);
      const chains = option.chords.reduce(
        (acc, sym) => acc.flatMap(chain => voi(sym, per).map(v => [...chain, v])),
        [[]],
      );
      for (const chain of chains) {
        let internal = optionCost(option, slot);
        for (let k = 1; k < chain.length; k++) internal += linkCost(chain[k - 1], chain[k], dir);
        nodes.push({ option, chain, internal });
      }
    }
    return nodes;
  });
  if (layers.some(l => !l.length)) return null; // algún acorde sin digitación en la BD

  // Viterbi con el presupuesto de sustituciones dentro del estado: para cada
  // hueco se guarda el mejor camino que llega habiendo gastado b cambios.
  const budget = budgetFor(progression) * 2; // en medios: adornar cuesta 1, cambiar 2
  layers.forEach((layer, i) => {
    for (const node of layer) {
      node.costs = new Array(budget + 1).fill(Infinity);
      node.froms = new Array(budget + 1).fill(null);
      const used = budgetCost(node.option);
      if (i === 0) {
        if (used <= budget) node.costs[used] = node.internal;
        continue;
      }
      for (const p of layers[i - 1]) {
        const link = linkCost(p.chain.at(-1), node.chain[0], dir)
          + repeatCost(p.chain.at(-1).symbol, node.chain[0].symbol, progression[i - 1].symbol, progression[i].symbol);
        for (let b = 0; b <= budget; b++) {
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
    for (let b = 0; b <= budget; b++) {
      if (node.costs[b] < (best?.cost ?? Infinity)) best = { node, budget: b, cost: node.costs[b] };
    }
  }
  if (!best) return null;
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
        topNote: noteName(v.top),
        topString: STRINGS[v.topString][0],
      });
    });
  });

  return { intention, key, steps, line: steps.map(s => s.topNote), cost: best.cost, ...lineStats(steps) };
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
