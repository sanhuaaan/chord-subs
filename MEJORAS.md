# Hilos abiertos

Ideas que salieron trabajando y no se hicieron en su momento. No son deuda
técnica: la app funciona sin ellas. Son sitios donde ya se ve por dónde
seguiría creciendo. Las hechas se quedan, con su fecha, como registro de por
qué se hicieron así.

## 1. Los nombres de la pestaña de cejilla

**Dónde está hoy.** Las extensiones que aparecen al poner cejilla se nombran con
una tabla por calidad de acorde (`EXT` en `capo.js`), con una variante para
cuando el acorde ya lleva séptima. Eso resolvió la mentira que había antes —un
`Cmaj7` con la novena al aire se llamaba `Cadd9` cuando lo que suena es un
`Cmaj9`— y mantiene todos los cifrados dentro del vocabulario que la base de
datos de diagramas sabe dibujar.

**Lo que queda cojo.** Un `m7` con la sexta al aire es un `m13`, que es el nombre
correcto y tonal lo entiende, pero **chords-db no lo indexa**. Son el 3,8% de las
propuestas (40 de 1040 en un barrido de doce fundamentales por ocho calidades) y
la única familia afectada. Se proponen igual y su tooltip se dibuja bien —esa
imagen sale de la forma base con la cuerda al aire, no del nombre—, pero no se
pueden abrir en el mástil, porque para eso hace falta que el cifrado exista en la
base de datos. Hay un test que lo documenta y que fallará si aparece otra familia
en la misma situación.

**El camino que se descartó.** `identify.js` ya tiene un cifrador de verdad
(`spell`): convierte un conjunto de notas en el nombre correcto sin tablas. Usarlo
aquí da nombres exactos siempre, pero produce cifrados literales que nadie más
entiende (`G7/11` en vez de `G7sus4`, `C6/11`, `Dm7/11`): medido, el **42%** de
las propuestas dejaba de poder abrirse en el mástil y **360 de 1040** nombres ni
siquiera los sabía leer tonal. Por eso se eligió la tabla.

**Por dónde seguiría.** El problema de fondo es que el vocabulario de `spell`
—pensado para el identificador, donde el nombre es la respuesta final y nadie más
lo consume— no es el mismo que el de la base de datos de diagramas. Una traducción
entre ambos (`7/11` → `11`, `m7/11` → `m11`…) permitiría usar `spell` sin perder
la posibilidad de dibujar. Antes de hacerlo conviene ver cuántos casos son de
verdad, porque puede que la tabla actual ya cubra el 96% con menos código.

## 2. Afinaciones abiertas

**La idea.** El buscador de arreglos de la pestaña de cejilla premia cuerdas al
aire y notas que no se mueven. En afinación estándar eso tiene un techo: las seis
cuerdas al aire dan `E A D G B E` y punto. En una afinación abierta —DADGAD, Open
G, Open D— las cuerdas al aire ya forman un acorde, y el mismo criterio daría
resultados mucho más jugosos. Es literalmente el sonido que da nombre a la app.

**Por qué encaja.** El motor no cambia: es el mismo camino mínimo sobre adornos ×
digitaciones con la misma función de coste. Lo que cambia es de dónde salen las
notas: `STRINGS` en `guitar.js` es la afinación, y de ella cuelgan el nombre de
cada nota del mástil, la identificación de acordes, qué cuerda al aire extiende
qué acorde y la voz superior de la rearmonización. Todo eso ya lee de ahí, así
que buena parte sería pasar la afinación como parámetro en vez de darla por
supuesta.

**El bloqueo real.** Las digitaciones vienen de `chords-db`, y **sus posiciones
suponen afinación estándar**. En otra afinación esos diagramas son sencillamente
falsos: los mismos trastes suenan otras notas. Así que no basta con cambiar
`STRINGS`; hace falta **generar** las digitaciones en vez de buscarlas: dado un
acorde y una afinación, encontrar las combinaciones de trastes que suenan solo sus
notas, que caben en una mano y que dejan cuerdas al aire.

**Lo que se ganaría de paso.** Ese generador serviría también en afinación
estándar, donde hoy la base de datos ofrece solo cuatro posiciones por acorde —y
esas cuatro son el techo de lo que el buscador de arreglos puede elegir. Con
digitaciones generadas, el mismo motor tendría mucho más de donde escoger sin
tocar una línea de su lógica.

**Tamaño.** Es la más grande de las dos con diferencia: un generador de
digitaciones es un proyecto en sí mismo, con sus propias reglas de tocabilidad
(apertura de la mano, cuerdas mudas por el medio, cejillas parciales). Merece la
pena solo si de verdad quieres explorar afinaciones abiertas; para pulir la
estándar hay caminos más baratos.

## 3. Rearmonización mediante sistema de costes — hecho (2026-08-19)

Implementado tal como se describía: `reharm.js` tiene una única función de
coste con factores con nombre (movimiento de voces, voz superior, notas
quietas, notas comunes, voces que aparecen o desaparecen, saltos grandes,
cuerdas al aire, desplazamiento de la mano) y cada **preset** es un vector de
pesos sobre ella. A los tres de línea de siempre (descendente, ascendente,
pedal) se suman **Movimiento mínimo**, **Máxima continuidad** y **Máxima
resonancia**; cada tarjeta enseña los mismos números —cuerdas al aire, notas
comunes, semitonos de movimiento— para poder compararlas, que es la gracia:
ninguna se presenta como la correcta.

El movimiento entre dos voicings se mide con **emparejamiento óptimo de
voces**: con las notas ordenadas de grave a agudo, el emparejamiento de
movimiento mínimo nunca cruza voces, así que basta un alineamiento por
programación dinámica donde una voz sin pareja (aparece o desaparece) paga un
peaje fijo. El movimiento del bajo no se mide aparte: el emparejamiento
ordenado ya casa bajo con bajo.

**Conectar con la cejilla — hecho también (2026-08-19).** El motor de
`capo.js` ya no tiene tabla de valores propia: su arreglo paga los enlaces con
el mismo `linkCost` y el preset resonante, y solo añade la cejilla como
dimensión de búsqueda y el filtro de solo-adornos. El factor que solo conocía
la cejilla —la nota quieta que además es al aire cuenta doble— entró al
vocabulario común como `quietasAlAire`. Queda para más adelante el paso
siguiente: buscar rearmonización y cejilla a la vez.

**Lo que queda abierto de aquí:**

- **Pesos ajustables por el usuario.** Se descartó el slider
  Melódico↔Resonante porque los seis presets ya cubren los extremos y el
  centro. Si algún día se quiere, la maquinaria está: es exponer el vector de
  pesos en la interfaz.

## 4. Fuente de canciones propia a partir de Chordonomicon

**La idea.** [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon)
es un dataset académico (CC BY-NC 4.0) con las progresiones de **679.807
canciones, con las secciones marcadas** (`<verse_1>`, `<chorus_1>`…) — el mismo
modelo de partes que usa Jangle. Descargarlo (un parquet de 92 MB), resolver los
títulos que le faltan y publicarlo troceado en estático daría dos cosas a la
vez: **búsqueda por título sin depender de Ultimate Guitar en vivo** y la
**consulta inversa** —¿en qué canciones aparece esta progresión?—, que es la
dirección más jangle posible: de tu progresión hacia afuera, descubrimiento en
vez de consulta.

**Lo verificado (2026-08-20):**

- El dataset no trae título ni artista: solo `spotify_song_id` (~88% de las
  filas) y un `artist_id` anonimizado. La identidad se recupera con la API
  oficial de Spotify (`/v1/tracks`, 50 IDs por petición → ~12.000 peticiones,
  horas de script reanudable) o, para casos sueltos, con su oEmbed público
  (CORS `*`, sin claves, devuelve título y carátula).
- La grafía es propia pero trivial de traducir: `Amin` → `Am`, `Fs7` → `F#7`,
  `A/Cs` → `A/C#`.
- El datasets-server de HF permite consultar desde el navegador (CORS abierto,
  `/search` y `/filter` con DuckDB), pero **su índice se corrompió en directo
  durante las pruebas**: vale para prototipar la consulta inversa, no como
  única vía en producción.

**La tubería (offline, una vez):** descargar el parquet → resolver títulos →
normalizar grafía → publicar en un repo estático aparte (`jangle-data`): un
índice de títulos partido por prefijo (la misma lógica del `suggestionSlug` del
autocompletado), las progresiones en shards por id, y un índice
progresión→canciones precalculado para que la consulta inversa también sea una
petición estática. Sin servidor, cacheable, funciona offline.

**Papeles.** El dataset permite derivados con atribución (BY) y uso no
comercial (NC), que es el caso. De Spotify solo se guarda el resultado factual
—título y artista, que existen con independencia de Spotify— y como mucho el ID
para enlazar; ninguno de sus campos propios (popularidad, audio features), que
es lo que su política de desarrollador protege.

**Los límites, sabidos de antemano:** es una foto de 2024 (canciones nuevas,
no), las transcripciones vienen del mismo crowdsourcing que UG pero sin el
filtro de "la mejor votada", y el ~12% sin ID de Spotify se queda sin título
(sigue sirviendo para la consulta inversa). UG quedaría para lo que la foto no
cubre.

**Tamaño.** La tubería es un día de trabajo más las horas de API; el cambio en
Jangle después es moderado (una fuente de búsqueda junto a la de UG, y la
pestaña o sección de consulta inversa). Es el hilo más grande de este archivo
después del generador de digitaciones.
