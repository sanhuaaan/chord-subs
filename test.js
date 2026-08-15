import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Chord, Note } from "tonal";
import { parseProgression, suggest, detectKey } from "./rules.js";
import { capoSuggestions, shapeSymbol } from "./capo.js";
import { findShape, shapeSvg, fretboardSvg, openString, absoluteFrets, STRINGS, MAX_FRET, PC } from "./guitar.js";
import { identify, soundingNotes, degreeName, spell } from "./identify.js";

const guitarDb = createRequire(import.meta.url)("@tombatossals/chords-db/lib/guitar.json");

const sameChroma = (a, b) =>
  assert.equal(Note.chroma(Chord.get(a).tonic), Note.chroma(Chord.get(b).tonic), `${a} vs ${b}`);

const find = (text, ruleName, index = 0) => {
  const progression = parseProgression(text);
  const s = suggest(progression).find(x => x.rule === ruleName && x.index === index);
  return { progression, s };
};

test("parsea y rechaza acordes inválidos", () => {
  assert.equal(parseProgression("C | Am, F G7").length, 4);
  assert.throws(() => parseProgression("C Zx9"));
});

test("tritono: G7 → Db7", () => {
  const { s } = find("G7", "Sustitución de tritono");
  sameChroma(s.replacement[0], "Db7");
  assert.match(s.replacement[0], /7$/);
});

test("relativo: C → Am y Am → C", () => {
  assert.equal(find("C", "Relativo").s.replacement[0], "Am");
  assert.equal(find("Am", "Relativo").s.replacement[0], "C");
});

test("ii-V: G7 → Dm7 G7", () => {
  assert.deepEqual(find("G7", "Inserción ii-V").s.replacement, ["Dm7", "G7"]);
});

test("dominante secundario: → Dm inserta A7", () => {
  assert.deepEqual(find("C Dm", "Dominante secundario", 1).s.replacement, ["A7", "Dm"]);
});

test("disminuido de paso: C → Dm inserta C#dim7", () => {
  const { s } = find("C Dm", "Disminuido de paso");
  sameChroma(s.replacement[1], "C#dim7");
  assert.match(s.replacement[1], /dim7$/);
});

test("intercambio modal: F → Fm, pero no sobre menores ni dominantes", () => {
  assert.equal(find("F", "Intercambio modal").s.replacement[0], "Fm");
  assert.equal(find("Am", "Intercambio modal").s, undefined);
  assert.equal(find("G7", "Intercambio modal").s, undefined);
});

test("toda sugerencia lleva explicación con sus acordes", () => {
  const suggestions = suggest(parseProgression("C Am F G7"));
  assert.ok(suggestions.length > 0);
  for (const s of suggestions) {
    assert.ok(s.why && s.why.length > 20, `sin why: ${s.rule}`);
    assert.ok(s.why.includes(s.replacement[0]) || s.why.includes(s.replacement[1]), `why no menciona la sustitución: ${s.why}`);
  }
});

test("detectKey estima la tonalidad mayor de la progresión", () => {
  assert.equal(PC[detectKey(parseProgression("C Am F G7"))], "C");
  assert.equal(PC[detectKey(parseProgression("D Bm G A7"))], "D");
  assert.equal(PC[detectKey(parseProgression("Bb Gm Eb F7"))], "Bb");
});

test("paso diatónico: inserta el grado intermedio subiendo y bajando", () => {
  assert.deepEqual(find("C Em", "Paso diatónico").s.replacement, ["C", "Dm"]);
  assert.deepEqual(find("Am F", "Paso diatónico").s.replacement, ["Am", "G"]);
  assert.equal(find("C Dm", "Paso diatónico").s, undefined); // grados adyacentes: nada que rellenar
});

test("findShape encuentra varias posiciones y usa la enarmonía de la BD", () => {
  const dm7 = findShape(guitarDb, "Dm7");
  assert.equal(dm7.name, "Dm7");
  assert.ok(dm7.positions.length >= 2);
  assert.equal(dm7.positions[0].frets.length, 6);
  assert.ok(dm7.positions[0].midi.length >= 3);
  assert.equal(findShape(guitarDb, "Gb7").name, "F#7");
  assert.equal(findShape(guitarDb, "Zx9"), null);
});

test("las reglas generan grafías que existen en la BD de guitarra", () => {
  for (const s of suggest(parseProgression("C Am F G7 Bb Ebm7"))) {
    for (const sym of s.replacement) {
      assert.ok(findShape(guitarDb, sym), `sin posición de guitarra: ${sym}`);
    }
  }
});

test("cejilla: C sin cejilla gana 6, add9 y maj7 en cuerdas al aire", () => {
  const [best] = capoSuggestions(parseProgression("C"));
  assert.equal(best.capo, 0);
  assert.deepEqual(best.perChord[0].extensions.map(e => e.as), ["C6", "Cadd9", "Cmaj7"]);
});

test("cejilla: Am sin cejilla gana m11, m7 y madd9", () => {
  const zero = capoSuggestions(parseProgression("Am")).find(cp => cp.capo === 0);
  assert.deepEqual(zero.perChord[0].extensions.map(e => e.as), ["Am11", "Am7", "Amadd9"]);
});

test("las extensiones de cejilla tienen diagrama en la BD de guitarra", () => {
  for (const cp of capoSuggestions(parseProgression("C Am F G7 Em"))) {
    for (const pc of cp.perChord) {
      for (const e of pc.extensions) {
        assert.ok(findShape(guitarDb, e.as), `sin posición de guitarra: ${e.as}`);
      }
    }
  }
});

test("cejilla: respeta la lista blanca por calidad y no repite acordes", () => {
  for (const cp of capoSuggestions(parseProgression("C Am G7 G7"))) {
    assert.ok(cp.perChord.length <= 3, "acorde repetido no deduplicado");
    for (const pc of cp.perChord) {
      for (const e of pc.extensions) {
        if (pc.chord === "G7") assert.ok(!e.as.includes("maj7"), `maj7 sobre dominante: ${e.as}`);
        assert.ok(e.string && e.note, "extensión sin cuerda o nota");
      }
    }
  }
});

test("shapeSymbol da la forma transpuesta que se toca con cejilla", () => {
  assert.equal(shapeSymbol("D", 2), "C");
  assert.equal(shapeSymbol("G7", 5), "D7");
  assert.equal(shapeSymbol("Em", 7), "Am");
  assert.equal(shapeSymbol("C", 0), "C");
});

test("con cejilla 2, Dadd9 (E en 4ª) se dibuja sobre la forma de C", () => {
  const shape = findShape(guitarDb, shapeSymbol("D", 2));
  assert.equal(shape.name, "C");
  const opened = openString(shape.positions[0], 2);
  assert.ok(opened, "la 4ª de la forma de C se puede abrir");
  assert.equal(opened.frets[2], 0);
});

test("openString abre la cuerda pedida sobre la forma en primera posición", () => {
  const am = findShape(guitarDb, "Am").positions[0]; // x02210
  const opened = openString(am, 2);
  assert.equal(opened.frets[2], 0);
  assert.deepEqual(opened.frets.toSpliced(2, 1), am.frets.toSpliced(2, 1), "solo cambia esa cuerda");
  assert.deepEqual(openString(am, 5).frets, am.frets, "ya estaba al aire: la forma vale tal cual");
  const alta = findShape(guitarDb, "Am").positions.find(p => p.baseFret > 1);
  assert.equal(openString(alta, 2).frets[2], 0, "en formas altas la cuerda al aire es la cejilla");
});

test("shapeSvg dibuja cuerdas, trastes y puntos", () => {
  const svg = shapeSvg(findShape(guitarDb, "F#7").positions[0]);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<circle"));
  assert.ok(svg.includes("<line"));
});

test("identifica acordes abiertos corrientes por sus pulsaciones", () => {
  const casos = {
    "C": [-1, 3, 2, 0, 1, 0],
    "Am": [-1, 0, 2, 2, 1, 0],
    "E": [0, 2, 2, 1, 0, 0],
    "G7": [3, 2, 0, 0, 0, 1],
    "F": [1, 3, 3, 2, 1, 1],
    "Dm7": [-1, -1, 0, 2, 1, 1],
    "Dsus4": [-1, -1, 0, 2, 3, 3],
  };
  for (const [nombre, frets] of Object.entries(casos)) {
    assert.equal(identify(frets).candidates[0].symbol, nombre, `${nombre} = ${frets}`);
  }
});

test("el bajo distingue la inversión: C/E no es C", () => {
  const { candidates } = identify([0, 3, 2, 0, 1, 0]); // C con la 6ª al aire
  assert.equal(candidates[0].symbol, "C/E");
  assert.ok(candidates[0].inversion);
  assert.ok(!identify([-1, 3, 2, 0, 1, 0]).candidates[0].inversion, "C en fundamental no es inversión");
});

test("las notas salen ordenadas de grave a aguda, no por cuerda", () => {
  const notes = soundingNotes([-1, 0, 2, 2, 1, 0]); // Am
  assert.deepEqual(notes.map(n => n.note), ["A", "E", "A", "C", "E"]);
  assert.deepEqual(notes.map(n => n.string), ["5ª", "4ª", "3ª", "2ª", "1ª"]);
  assert.ok(notes.every((n, i) => i === 0 || n.midi >= notes[i - 1].midi), "orden por altura real");
  // La 3ª cuerda muy pisada suena por encima de la 2ª: el bajo es el de la 2ª.
  const alta = soundingNotes([-1, -1, -1, 8, 1, 3]);
  assert.deepEqual(alta.map(n => n.string), ["2ª", "3ª", "1ª"]);
  assert.equal(identify([-1, -1, -1, 8, 1, 3]).candidates[0].symbol, "Cm", "sin inversión: el bajo es C");
});

test("cada nota recibe su grado dentro del acorde elegido", () => {
  const [c] = identify([-1, 3, 2, 0, 1, 0]).candidates; // C
  assert.equal(c.root, "C");
  assert.deepEqual(c.degrees, [
    { note: "C", degree: "fundamental" },
    { note: "E", degree: "3ª mayor" },
    { note: "G", degree: "5ª justa" },
  ]);
  assert.equal(degreeName("C", "Bb"), "7ª menor");
  assert.equal(degreeName("Eb", "Eb"), "fundamental");
});

test("con menos de tres notas distintas no hay acorde que nombrar", () => {
  assert.deepEqual(identify([-1, -1, -1, -1, -1, -1]), { notes: [], pcs: [], candidates: [] });
  assert.equal(identify([-1, -1, -1, -1, 1, 0]).candidates.length, 0, "dos notas no son acorde");
  assert.equal(identify([0, -1, -1, -1, -1, 0]).candidates.length, 0, "la misma nota en dos cuerdas tampoco");
});

test("da una lectura por cada nota que se tome como fundamental", () => {
  const { pcs, candidates } = identify([3, 3, 2, 4, 0, 0]); // G C E B: el acorde de referencia
  assert.deepEqual(pcs, ["G", "C", "E", "B"]);
  assert.equal(candidates.length, 4, "una lectura por nota distinta");
  assert.deepEqual(candidates.map(c => c.root).sort(), ["B", "C", "E", "G"]);
  assert.deepEqual(candidates.map(c => c.symbol), ["Cmaj7/G", "G6/11", "Emb6/G", "Bsus4b6b9/G"]);
  assert.ok(candidates.every(c => c.degrees.length === 4), "todas explican las mismas cuatro notas");
  // El bajo lo pone la cuerda más grave, no la fundamental de cada lectura.
  assert.ok(candidates.every(c => (c.root === "G") !== c.inversion));
});

test("cualquier puñado de notas recibe nombre, por raro que sea", () => {
  for (const frets of [[1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5], [-1, -1, 5, 6, 7, 8]]) {
    const { pcs, candidates } = identify(frets);
    assert.equal(candidates.length, pcs.length, `una lectura por nota distinta en ${frets}`);
    assert.ok(candidates.every(c => c.symbol.length > 1), "ninguna se queda sin cifrar");
    assert.equal(new Set(candidates.map(c => c.symbol)).size, pcs.length, "sin lecturas repetidas");
  }
});

test("las lecturas evidentes van antes que las rebuscadas", () => {
  const { candidates } = identify([-1, 3, 2, 0, 1, 0]); // C
  assert.equal(candidates[0].symbol, "C");
  assert.equal(candidates.length, 3, "también se lee desde E y desde G");
  assert.ok(candidates[0].score > candidates[1].score, "la lectura llana puntúa más");
});

test("spell cifra los acordes corrientes como en un cancionero", () => {
  const semis = sym => new Set(Chord.get(sym).notes.map(Note.chroma));
  const esperado = {
    C: "", Cm: "m", C7: "7", Cm7: "m7", Cmaj7: "maj7", C6: "6", Cm6: "m6",
    Csus4: "sus4", Csus2: "sus2", Cdim: "dim", Cdim7: "dim7", Cm7b5: "m7b5",
    Caug: "aug", C9: "9", Cm9: "m9", Cmaj9: "maj9", C13: "13", Cadd9: "add9",
    Cmadd9: "madd9", C5: "5", C7sus4: "7sus4", C69: "6/9", Cm11: "m11", C11: "11",
  };
  for (const [sym, sufijo] of Object.entries(esperado)) {
    assert.equal(spell(semis(sym)), sufijo, `${sym} debería cifrarse "${sufijo}"`);
  }
});

test("spell lee las alteraciones según haya séptima o no", () => {
  const s = (...semis) => spell(new Set([0, ...semis]));
  assert.equal(s(3, 7, 8), "mb6", "sin séptima, el Ab sobre C es b6");
  assert.equal(s(4, 7, 10, 8), "7b13", "con séptima, ese mismo Ab es b13");
  assert.equal(s(4, 7, 9), "6", "sin séptima, el A sobre C es la 6ª");
  assert.equal(s(4, 7, 10, 9), "13", "con séptima, esa 6ª es la 13ª");
  assert.equal(s(4, 7, 10, 6), "7#11", "el Gb sobre un dominante es #11, no b5");
  assert.equal(s(4, 5, 9), "6/11", "cifras pegadas se separan con barra");
});

test("los nombres identificados existen en la BD de guitarra", () => {
  const voicings = [[-1, 3, 2, 0, 1, 0], [-1, 0, 2, 2, 1, 0], [3, 2, 0, 0, 0, 1], [-1, 3, 2, 0, 3, 0], [-1, -1, 0, 2, 1, 1]];
  for (const frets of voicings) {
    const [c] = identify(frets).candidates;
    assert.ok(findShape(guitarDb, c.symbol), `sin diagrama: ${c.symbol}`);
  }
});

test("fretboardSvg dibuja el mástil con una zona clicable por traste y cuerda", () => {
  const svg = fretboardSvg([-1, 3, 2, 0, 1, 0], { maxFret: 12 });
  assert.ok(svg.startsWith("<svg"));
  assert.match(svg, /width="\d+" height="\d+"/, "medidas explícitas: sin viewBox suelto no colapsa");
  assert.equal((svg.match(/class="cell"/g) ?? []).length, 6 * 13, "6 cuerdas × (12 trastes + al aire)");
  for (let s = 0; s < 6; s++) {
    assert.ok(svg.includes(`data-string="${s}" data-fret="0"`), `columna de al aire/muda de la cuerda ${s}`);
  }
  assert.ok(svg.includes("×"), "la 6ª muda lleva su aspa");
  assert.equal((svg.match(/class="note/g) ?? []).length, 5, "una nota por cuerda que suena");
  assert.equal((svg.match(/>C</g) ?? []).length, 2, "las dos C del acorde llevan su nombre escrito");
});

test("el mástil escribe el nombre de cada nota y resalta la fundamental", () => {
  const svg = fretboardSvg([-1, 3, 2, 0, 1, 0], { root: "C", labels: ["", "1", "3", "5", "1", "3"] });
  for (const nota of ["C", "E", "G"]) assert.ok(svg.includes(`>${nota}<`), `falta la nota ${nota}`);
  assert.equal((svg.match(/class="note root"/g) ?? []).length, 2, "las dos C pulsadas son fundamental");
  assert.equal((svg.match(/class="note open"/g) ?? []).length, 2, "3ª y 1ª al aire");
  assert.equal((svg.match(/class="degree"/g) ?? []).length, 5, "un grado por cuerda que suena");
  assert.ok(svg.includes(">5<"), "la 3ª al aire está etiquetada como quinta");
  assert.ok(!fretboardSvg([-1, -1, -1, -1, -1, -1]).includes("class=\"note"), "sin pulsaciones no hay notas");
});

test("el mástil llega al traste 15 y numera todos los trastes", () => {
  const svg = fretboardSvg([-1, -1, -1, -1, -1, -1]);
  assert.equal((svg.match(/class="cell"/g) ?? []).length, 6 * 16, "6 cuerdas × (15 trastes + al aire)");
  assert.equal((svg.match(/class="fret-no"/g) ?? []).length, 16, "del 0 al 15");
  assert.ok(svg.includes('data-fret="15"'), "se puede pulsar el traste 15");
});

test("absoluteFrets pasa los trastes de chords-db al mástil", () => {
  const abierto = findShape(guitarDb, "C").positions[0]; // x32010, baseFret 1
  assert.deepEqual(absoluteFrets(abierto), [-1, 3, 2, 0, 1, 0], "en primera posición no cambia nada");

  const alta = findShape(guitarDb, "C").positions.find(p => p.baseFret === 3);
  assert.deepEqual(absoluteFrets(alta), [3, 3, 5, 5, 5, 3], "el 1 de la forma es el baseFret");

  // El resultado tiene que sonar lo que dice la BD, que es la prueba de fuego.
  for (const sym of ["C", "Am", "G7", "F", "Dm7", "Bb", "F#7"]) {
    for (const p of findShape(guitarDb, sym).positions) {
      const midi = absoluteFrets(p)
        .map((f, i) => (f < 0 ? null : STRINGS[i][1] + f))
        .filter(m => m !== null);
      assert.deepEqual(midi.toSorted((a, b) => a - b), p.midi.toSorted((a, b) => a - b), `${sym} baseFret ${p.baseFret}`);
    }
  }
});

test("las posiciones de la BD se identifican como el acorde que dicen ser", () => {
  // Alguna posición de la BD lleva otra nota en el bajo (el primer Cmaj7 empieza
  // por G), así que vale la inversión: es el mismo acorde con otro bajo.
  for (const sym of ["C", "Am", "G7", "Dm7", "F", "Cmaj7", "Bb", "Esus4"]) {
    const p = findShape(guitarDb, sym).positions.find(q => absoluteFrets(q).every(f => f <= MAX_FRET));
    const leidos = identify(absoluteFrets(p)).candidates.map(c => c.symbol);
    assert.ok(leidos.some(s => s === sym || s.startsWith(`${sym}/`)), `${sym} no se reconoce en su propia posición: ${leidos}`);
  }
});
