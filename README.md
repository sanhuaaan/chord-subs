# chord-subs

Aplicación web enfocada a guitarra que, dada una progresión de acordes, sugiere sustituciones y acordes intermedios, con su explicación y sus diagramas de guitarra.

## Uso

Es una página estática sin build. Sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8123
# o
npx serve .
```

Abre `http://localhost:8123`, escribe una progresión (p. ej. `C Am F G7`, separada por espacios, comas o `|`) y pulsa **Sugerir**. Cada sugerencia muestra por qué funciona, y al posar el ratón sobre cualquier nombre de acorde aparece un tooltip con hasta 4 posiciones del acorde en el mástil.

La pestaña **¿Qué acorde es?** va al revés: marcas las pulsaciones en un mástil de 12 trastes y te dice qué acorde forman. Funciona sin escribir nada en el buscador.

Las grafías siguen el criterio de la base de datos de guitarra: `C#` y no `Db`, `Eb` y no `D#`.

## Reglas implementadas

| Regla | Ejemplo |
|-------|---------|
| Sustitución de tritono | `G7 → Db7` |
| Relativo mayor/menor | `C → Am`, `Am → C` |
| Dominante secundario | `Dm → A7 Dm` |
| Inserción ii-V | `G7 → Dm7 G7` |
| Disminuido de paso (ascendente) | `C Dm → C C#dim7 Dm` |
| Paso diatónico (saltos de tercera) | `C Em → C Dm Em`, `Am F → Am G F` |
| Intercambio modal | `F → Fm` |

La tonalidad mayor se estima automáticamente a partir de la progresión (se muestra en el resultado) y es la que usa el paso diatónico.

## Identificar un acorde desde el mástil

En la pestaña **¿Qué acorde es?** cada cuerda suena una sola nota: al pulsar un traste la nota se
mueve ahí, al volver a pulsar donde ya estaba la cuerda se apaga, y la columna a la izquierda de la
cejuela alterna al aire (○) y muda (×).

Debajo aparecen las notas ordenadas de grave a aguda y hasta tres lecturas del acorde, con el papel
que juega cada nota en cada una. La primera es la que un guitarrista daría por buena (fundamental en
el bajo, cifrado corriente, sin alteraciones de más); las demás son nombres igual de válidos para las
mismas notas, normalmente inversiones. La nota más grave es la que decide entre `C` y `C/E`.

| Pulsaciones | Lectura |
|-------------|---------|
| `× 3 2 0 1 0` | `C` |
| `0 3 2 0 1 0` | `C/E` (inversión) |
| `× 3 2 0 3 0` | `Cadd9` |
| `3 2 0 0 0 1` | `G7` |

## Stack

- Vanilla JS (módulos ES), sin build ni framework.
- [tonal.js](https://github.com/tonaljs/tonal) para parsing y teoría musical, cargada vía import map desde esm.sh.
- [@tombatossals/chords-db](https://github.com/tombatossals/chords-db) (JSON desde jsdelivr) para posiciones de guitarra; diagramas dibujados como SVG propio.

## Tests

```bash
npm install
npm test
```

Los tests (`test.js`) cubren el parser y cada regla con `node --test`.
