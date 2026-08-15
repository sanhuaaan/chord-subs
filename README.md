# trasteo

Aplicación web para trastear con la armonía de una canción, enfocada a guitarra. Dada una progresión
de acordes sugiere sustituciones y acordes de paso con su explicación, propone dónde poner la cejilla
para ganar cuerdas al aire, y en el otro sentido nombra el acorde que formen las notas que marques en
un mástil. Todo con sus diagramas.

## Uso

Es una página estática sin build, pero **hay que servirla**: abrir `index.html` a pelo con `file://`
no vale, porque el navegador bloquea los módulos ES por CORS y no arranca nada. Sirve la carpeta con
cualquier servidor estático:

```bash
python3 -m http.server 8123
# o
npx serve .
```

Abre `http://localhost:8123`, escribe una progresión (p. ej. `C Am F G7`, separada por espacios, comas o `|`) y pulsa **Sugerir**. Cada sugerencia muestra por qué funciona, y al posar el ratón sobre cualquier nombre de acorde aparece un tooltip con hasta 4 posiciones del acorde en el mástil.

La pestaña **¿Qué acorde es?** va al revés: marcas las pulsaciones en un mástil de 15 trastes y te
dice qué acorde forman. Funciona sin escribir nada en el buscador.

Los nombres de acorde de las otras dos pestañas llevan a ella: al pulsar cualquiera, su primera
posición de la base de datos se carga en el mástil y se cambia de pestaña. Se carga siempre lo que
pone escrito, no la forma del tooltip — en la pestaña de cejilla el tooltip enseña la forma
transpuesta que se toca, pero el mástil no sabe de cejillas y nombrarla daría el acorde equivocado.

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

En la pestaña **¿Qué acorde es?** hay un mástil de 15 trastes donde cada cuerda suena una sola nota:
al pulsar un traste la nota se mueve ahí, al volver a pulsar donde ya estaba la cuerda se apaga, y la
columna a la izquierda de la cejuela alterna al aire y muda (×).

Cada nota lleva su nombre escrito dentro, la fundamental va en otro color para localizarla en el
mástil, y a la derecha de cada cuerda aparece el papel que juega esa nota en el acorde (`1`, `3`,
`b7`, `11`…). El nombre del acorde se actualiza arriba a cada pulsación.

Las mismas notas tienen **un nombre por cada una que tomes como fundamental**, y todos son correctos:
se ofrece una lectura por nota, ordenadas por lo probable que es que sea la que tenías en mente
(fundamental en el bajo, cifrado corriente y sin alteraciones de más). Al pulsar cualquiera de las
otras lecturas pasa a ser la principal y el mástil se reetiqueta con sus grados. La nota más grave la
pone la cuerda que suena, no la lectura, así que las que no la tienen por fundamental salen como
inversión: `Emb6/G`.

Los cifrados no salen del diccionario de tonal, que solo conoce 106 tipos y deja sin nombre casi
todo lo que no es un acorde de manual. Se componen intervalo a intervalo (`spell` en `identify.js`):
tercera, quinta, séptima y sexta se consumen primero y lo que sobra se cuelga como tensión, leída
según haya séptima o no — el mismo Ab sobre C es `b6` en una tríada y `b13` en un dominante.

| Pulsaciones | Lectura |
|-------------|---------|
| `× 3 2 0 1 0` | `C` |
| `0 3 2 0 1 0` | `C/E` (inversión) |
| `× 3 2 0 3 0` | `Cadd9` |
| `3 2 0 0 0 1` | `G7` |
| `3 3 2 4 0 0` | `Cmaj7/G`, y también `G6/11`, `Emb6/G` y `Bsus4b6b9/G` |

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
