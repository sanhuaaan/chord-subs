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

Un acorde corriente saca del orden de doce opciones, así que la pestaña de
**Sustituciones** las pliega por acorde (abierta la del primero) y dentro las agrupa por lo que le
hacen, que es la decisión de verdad antes de mirar la regla concreta:

- **Adornar** — el mismo acorde con más notas: cambia el color, no la función (`C → Cmaj7`, `C6`, `Cadd9`, `Csus2`).
- **Cambiar** — otro acorde en su lugar, que hace el mismo papel (`C → Am`, `Em`, `Cm`).
- **Añadir** — acordes que lo preparan o lo alargan, repartiéndose su tiempo (`C → Dm7 G7 C`, `Fm C`, `Bb7 C`).

La pestaña **¿Qué acorde es?** va al revés: marcas las pulsaciones en un mástil de 15 trastes y te
dice qué acorde forman. Funciona sin escribir nada en el buscador.

Los nombres de acorde de las otras dos pestañas llevan a ella: al pulsar cualquiera, su primera
posición de la base de datos se carga en el mástil y se cambia de pestaña. Se carga siempre lo que
pone escrito, no la forma del tooltip — en la pestaña de cejilla el tooltip enseña la forma
transpuesta que se toca, pero el mástil no sabe de cejillas y nombrarla daría el acorde equivocado.

Las grafías siguen el criterio de la base de datos de guitarra: `C#` y no `Db`, `Eb` y no `D#`.

## Reglas implementadas

Adornar el acorde:

| Regla | Ejemplo |
|-------|---------|
| Séptima diatónica | `C → Cmaj7`, `Am → Am7`, y `G → G7` si es el V |
| Sexta | `C → C6`, `Am → Am6` |
| Novena | `C → Cadd9`, `Am7 → Am9`, `Cmaj7 → Cmaj9` |
| Suspensión sus2 | `C → Csus2` |
| Tensión del dominante | `G7 → G13` |
| Dominante alterado | `G7 → G7#9`, y `7b9` si resuelve a menor |

Cambiarlo por otro:

| Regla | Ejemplo |
|-------|---------|
| Sustitución de tritono | `G7 → Db7` |
| Relativo mayor/menor | `C → Am`, `Am → C` |
| Mediante | `C → Em` |
| Intercambio modal | `F → Fm` |
| Dominante sin fundamental | `G7 → Bm7b5` |
| Disminuido dominante | `G7 → Bdim7` |

Añadir acordes delante o alrededor:

| Regla | Ejemplo |
|-------|---------|
| Dominante secundario | `Dm → A7 Dm` |
| Inserción ii-V | `G7 → Dm7 G7` |
| ii-V secundario | `C → Dm7 G7 C`, `Am → Bm7b5 E7 Am` |
| Aproximación cromática | `C → C#7 C` |
| Dominante de puerta trasera | `C → Bb7 C` |
| Subdominante menor | `C → Fm C` |
| Retardo sus4 | `C → Csus4 C`, `G7 → G7sus4 G7` |
| Disminuido de paso (tono entero, arriba o abajo) | `C Dm → C C#dim7 Dm`, `Am G → Am Abdim7 G` |
| Paso diatónico (saltos de tercera) | `C Em → C Dm Em`, `Am F → Am G F` |
| Línea cromática interna | `Am → Am AmMaj7 Am7 Am6` |
| Línea hacia el IV | `C F → C Cmaj7 C7 F` |

La tonalidad mayor se estima automáticamente a partir de la progresión (se muestra en el resultado) y es
la que usan el paso diatónico y la séptima diatónica.

Todo cifrado que sale de una regla tiene posiciones en la base de datos de guitarra, así que cualquier
sugerencia se puede ver dibujada y abrir en el mástil. Hay un test que lo comprueba.

## Rearmonizar la progresión entera

La pestaña de **Sustituciones** da opciones sueltas: para cuatro acordes ya son medio centenar de
sugerencias independientes, y montar el arreglo queda de tu parte. **Rearmonizar** hace ese trabajo:
elige unas cuantas que encajen entre sí y devuelve la progresión completa, tocable de principio a fin.

El criterio para que encajen es la **voz de arriba**: la nota más aguda de cada acorde tiene que
dibujar una línea en vez de dar saltos. Cada versión la empuja hacia un lado —descendente, ascendente
o nota pedal— y debajo de los diagramas se ve la línea conseguida y cuántos de sus movimientos son
por grado conjunto.

Que la línea mande cambia qué acordes salen y con qué digitación. Para `C Am F G7` la versión
descendente propone `C Amadd9 F G7`, con la voz de arriba en `C → B → A → G`: la novena entra
precisamente porque su `B` completa la bajada. Para `D A Bm G` propone `D A7 Bm G6`, con
`A → G → F# → E`, y la ascendente `D A7 Bm7 G` con `F# → G → A → B`.

Es un camino mínimo (Viterbi) sobre un grafo por capas: cada hueco de la progresión ofrece varios
acordes, cada acorde varias digitaciones de la base de datos, y el coste de encadenar dos lo pone el
salto de la voz superior. Sobre eso mandan tres reglas de sentido común:

- El **primer acorde no se toca**, que es el que planta la tonalidad.
- No se admiten dos acordes iguales seguidos si el original tenía movimiento ahí: eso no es
  rearmonizar, es quedarse sin un acorde.
- Hay **presupuesto de cambios** (un tercio de la progresión). Sin tope, un `Fm` prestado en el sitio
  justo deja de ser un hallazgo y se convierte en otra canción. Se cuenta en medios: adornar un acorde
  gasta la mitad que cambiarlo por otro, porque no lo es.

Al pulsar cualquier acorde del arreglo se abre en el analizador **esa digitación concreta**, no la
primera de la base de datos, que es justamente la que hace la línea.

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
