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

## 2. Afinaciones abiertas — hecho (2026-08-20)

Implementado el mismo día en el orden que se planeó por la mañana: el selector
de afinación en el analizador fijó la representación (los seis midis al aire,
de 6ª a 1ª), el generador de digitaciones puso lo que chords-db no tiene, y la
pestaña **Afinaciones** enchufó el motor. El punto de partida era que tras el
hilo 3 el motor ya era agnóstico a la afinación: `linkCost`, el emparejamiento
de voces y los presets operan sobre midis y trastes, nada ahí supone estándar.

**El analizador sabe de afinaciones.** `TUNINGS` en guitar.js (estándar, Drop
D, DADGAD, Open G, Open D) más una **personalizada** que se edita cuerda a
cuerda, hereda la afinación puesta al elegirla —elegir Open G y retocar es como
se inventa una afinación— y sobrevive en localStorage. Cambiar de afinación
renombra lo que suena, no lo que está marcado. Cargar un acorde desde otra
pestaña vuelve a estándar, salvo que la tarjeta traiga la suya.

**El generador (`generate.js`).** Dado un acorde y una afinación, busca por
ventanas de cuatro trastes digitaciones tocables: al menos cuatro cuerdas, solo
notas del acorde, la fundamental siempre (la quinta justa es omisible cuando
hay séptimas o tensiones que defender), el bajo fundamental o quinta, mudas
solo en los extremos y cuatro dedos con la cejilla contando como uno —salvo que
quede una cuerda al aire por encima, que entonces no hay barra que valga—. La
salida calca el contrato de `playablePositions`, con su `position` relativa
para los diagramas, así que motor, diagramas y analizador la consumen sin saber
de dónde salió. El arnés que lo mantiene honesto: las formas curadas de
chords-db deben aparecer entre lo generado, y las seis-al-aire de Open G y
Open D también.

**La pestaña compite setups, no afinaciones.** Un setup es afinación + cejilla
opcional; la cejilla es solo una afinación virtual (midis + traste), así que no
hay formas con nombre que transponer y las notas salen bien solas. Cada capa
son los adornos del acorde (el mismo filtro `esAdorno` de la cejilla, ahora en
rules.js) por sus digitaciones generadas, encadenados con el mismo camino
mínimo resonante (`mejorCadena`, movida a reharm.js y parametrizada por preset
y coste de nodo). Mismo preset y misma progresión en todos los setups: los
costes por fin SON comparables y las tarjetas se ordenan por coste total. La
estándar compite como una más —perder contra ella ahorra reafinar—. Las
cejillas van bajo demanda (desplegable por tarjeta, trastes 1–5, las tres
mejores), que el producto completo serían segundos de cálculo.

**El solape asumido.** «Estándar + cejilla N» aquí y la pestaña Cejilla pueden
responder distinto, porque beben de fuentes distintas: digitaciones generadas
contra formas curadas. Son dos preguntas —qué es posible si preparas el
instrumento, contra cómo se toca con las formas que ya conoces— y está contado
así en el README.

**Lo que quedó fuera, a posta** (marcado `ponytail:` en el código): cejillas
parciales, mudas interiores y ergonomía fina de la mano. Y **lo que se ganaría
de paso** sigue pendiente: usar el generador también en la pestaña Cejilla, en
estándar, donde la base de datos da solo cuatro posiciones por acorde y eso es
el techo de su buscador de arreglos.

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

## 4. Fuente de canciones propia a partir de Chordonomicon — hecho y guardado (2026-08-19)

Se hizo entero y se retiró el mismo día, después de usarlo. Lo que se construyó sigue en pie:
**385.664 canciones con sus progresiones por partes** publicadas en un repo estático aparte
—**De Chordis Mysteriis**—, el módulo que las lee y la tubería que las fabrica, todo en `guardado/`
y todo probado. Lo que no está es enchufado a la app: ni la segunda fuente del buscador ni la
pestaña «Dónde suena». La versión conectada vive en la rama `catalogo`.

**Por qué se guardó.** La consulta inversa era la razón de hacerlo —de tu progresión hacia afuera,
descubrimiento en vez de consulta— y en uso resultó no aportar: saber que `C Am F G` suena en 24.190
canciones no dice nada de `C Am F G`, y una lista de cuarenta que no has elegido, ordenada por una
señal pobre, no lleva a ninguna parte. La búsqueda por título se fue con ella, porque Ultimate
Guitar ya la cubre y con transcripciones mejores.

**Lo que se aprendió, que es lo que queda:**

- El join contra el volcado de 56M de pistas cubre **376.400 de los 430.323 ids** (87,5%), medido, y
  tarda **37 segundos** leyendo solo tres columnas por HTTP: no hay que bajarse los 4 GB.
  Propagando el nombre del intérprete por su id de Spotify se recuperan 80.000 filas más.
- La grafía de Chordonomicon traduce **exacta en el 99,93%** de los 52 millones de acordes. El resto
  baja por una escalera de simplificaciones hasta algo que tonal sepa leer; un solo token de 4.314
  no da ni para eso.
- La firma transpositiva sale barata: con familias en vez de cifrados completos, las ventanas de
  cuatro acordes de todo el catálogo son **112.071 firmas distintas**, y las de tres, 13.046. Eso es
  lo que hace que el índice inverso quepa en 47 MB en vez de en varios cientos.
- El total publicado son **211 MB** en 12.500 ficheros. Una búsqueda se lleva un trozo del índice
  (20-100 KB comprimidos), abrir una canción otro de 40 KB.
- **Sin señal de popularidad no hay orden bueno.** Se usó cuántas canciones tiene cada intérprete en
  el propio dataset, que confunde "muy transcrito" con "conocido" —Johnny Cash tiene 571 y los
  Beatles 136—. Se mitigó quitando las coletillas de edición ("- Remastered 2009") antes de
  comparar, pero es medio arreglo, y es medio arreglo de lo que más se notaba al usarlo.

**Si algún día vuelve**, además de reconectarlo (`guardado/LEEME.md` dice cómo), estas dos quedaron
sin hacer y siguen valiendo: rellenar los ~54.000 títulos que faltan con el oEmbed público de
Spotify, y traer popularidad de una fuente libre (MusicBrainz, ListenBrainz) para que el orden deje
de ser el punto flojo.

