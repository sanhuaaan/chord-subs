import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Chord, Note } from "tonal";
import { parseProgression, suggest, applySuggestion } from "./rules.js";
import { findShape, shapeSvg } from "./guitar.js";

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

test("findShape encuentra posiciones y usa la enarmonía de la BD", () => {
  const dm7 = findShape(guitarDb, "Dm7");
  assert.equal(dm7.name, "Dm7");
  assert.equal(dm7.position.frets.length, 6);
  assert.ok(dm7.position.midi.length >= 3);
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

test("shapeSvg dibuja cuerdas, trastes y puntos", () => {
  const svg = shapeSvg(findShape(guitarDb, "F#7").position);
  assert.ok(svg.startsWith("<svg"));
  assert.ok(svg.includes("<circle"));
  assert.ok(svg.includes("<line"));
});

test("applySuggestion reconstruye la progresión completa", () => {
  const { progression, s } = find("C Am F G7 C", "Inserción ii-V", 3);
  assert.deepEqual(applySuggestion(progression, s), ["C", "Am", "F", "Dm7", "G7", "C"]);
});
