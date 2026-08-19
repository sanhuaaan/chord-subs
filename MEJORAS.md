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

## 4. Fuente de canciones propia a partir de Chordonomicon — hecho (2026-08-19)

Está publicado: **385.664 canciones con sus progresiones por partes** en un repo estático aparte
(`jangle-data`), y en la app una segunda fuente de búsqueda junto a Ultimate Guitar más la
pestaña **Dónde suena**, que es la consulta inversa. La tubería entera está en `datos/`, con su
`LEEME.md`; el README cuenta lo que hace y lo que no.

Lo que se confirmó al hacerlo:

- El join contra el volcado de 56M de pistas cubre **376.400 de los 430.323 ids** (87,5%),
  medido, y tarda **37 segundos** leyendo solo tres columnas por HTTP: no hay que bajarse los 4
  GB. Propagando el nombre del intérprete por su id de Spotify se recuperan 80.000 filas más, que
  al final no se publican porque sin título no se pueden ni buscar ni enseñar.
- La grafía traduce **exacta en el 99,93%** de los 52 millones de acordes. El resto baja por una
  escalera de simplificaciones hasta algo que tonal sepa leer; un solo token de 4.314 no da ni
  para eso.
- La firma transpositiva sale barata: con familias en vez de cifrados completos, las ventanas de
  cuatro acordes de todo el catálogo son **112.071 firmas distintas**, y las de tres, 13.046. Eso
  es lo que hace que el índice inverso quepa en 47 MB en vez de en varios cientos.
- El total publicado son **211 MB** en 12.500 ficheros. Una búsqueda se lleva un trozo del índice
  (20-100 KB comprimidos), abrir una canción otro de 40 KB.

**Lo que queda abierto de aquí:**

- **Los títulos que faltan.** 294.000 filas se quedan fuera por no tener título: unas porque no
  traen id de Spotify (el 35%) y otras porque su id no está en el volcado (~54.000). Estas
  segundas se pueden resolver a goteo con el oEmbed público de Spotify, sin claves. Cada una que
  se resuelva es una canción más que se puede buscar y una más en los recuentos.
- **Cómo se ordena lo que sale.** No hay señal de popularidad y de Spotify no se coge: se usa
  cuántas canciones tiene cada intérprete en el propio dataset, que confunde "muy transcrito" con
  "conocido" —Johnny Cash tiene 571 y los Beatles 136—. Se nota buscando cualquier clásico:
  versiones oscuras que se llaman exactamente igual le ganan al original. Se mitigó quitando las
  coletillas de edición ("- Remastered 2009") antes de comparar, pero el fondo sigue ahí. Una
  fuente libre de popularidad (MusicBrainz, ListenBrainz) lo arreglaría de verdad.
- **Buscar la progresión entera, no por ventanas.** Hoy una progresión de seis acordes se
  pregunta como tres ventanas de cuatro. Encontrar canciones que llevan las seis seguidas pediría
  cruzar las listas, y las listas están recortadas a 40 por firma, así que haría falta guardar más
  o verificar canción a canción.

