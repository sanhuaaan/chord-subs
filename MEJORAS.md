# Hilos abiertos

Dos ideas que salieron trabajando y que no se hicieron en su momento. No son
deuda técnica: la app funciona sin ellas. Son sitios donde ya se ve por dónde
seguiría creciendo.

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

## 3 Mejora: rearmonización mediante sistema de costes

La sección **Rearmonizar** podría evolucionar para que no busque una única
"mejor" rearmonización, sino que permita explorar distintas soluciones
según el aspecto musical que se quiera priorizar.

La idea parte de separar dos fases:

1. **Generación de posibilidades armónicas**
   - adornos
   - sustituciones
   - acordes de paso
   - intercambio modal
   - etc.

2. **Evaluación de cómo se comporta esa progresión en la guitarra**
   - conducción de voces
   - movimiento entre notas
   - notas comunes
   - voz superior
   - cuerdas al aire
   - registro
   - etc.

### Voice leading del voicing completo

Actualmente la rearmonización presta especial atención a la voz superior.
Esto permite encontrar líneas melódicas interesantes, pero un voicing de
guitarra contiene varias voces y el movimiento de todas ellas también tiene
valor musical.

La nueva versión podría calcular el coste de transformar un voicing en el
siguiente teniendo en cuenta el movimiento de sus distintas voces.

Por ejemplo:

    C
    G - C - E

    Am
    A - C - E

podría interpretarse como:

    G → A   (+2)
    C → C    (0)
    E → E    (0)

Por tanto, dos de las tres voces permanecen inmóviles.

El objetivo no debería ser simplemente minimizar el movimiento total. Una
conducción de voces con el mínimo movimiento posible no es necesariamente la
más musical o interesante. El sistema debería utilizar diferentes criterios
ponderables.

### Sistema de costes

Una posible función de coste podría tener en cuenta:

- movimiento total de las voces;
- movimiento de la voz superior;
- movimiento del bajo;
- notas comunes entre acordes;
- número de voces que permanecen inmóviles;
- aparición/desaparición de voces;
- cuerdas al aire;
- registro del voicing;
- saltos excesivamente grandes.

Conceptualmente:

    coste =
        movimiento de voces
      + movimiento de la voz superior
      + movimiento del bajo
      + coste de cambios estructurales
      - notas comunes
      - cuerdas al aire

Los pesos de estos factores deberían poder modificarse para obtener
resultados diferentes.

### No buscar una única solución óptima

La finalidad no sería que Jangle determine cuál es "la forma correcta" de
tocar una progresión.

Al contrario: una de las ideas fundamentales de Jangle es facilitar la
creatividad ofreciendo posibilidades, del mismo modo que la música no tiene
necesariamente una única respuesta correcta.

Una misma progresión podría generar, por ejemplo:

- una solución que priorice una línea descendente en la voz superior;
- una que minimice el movimiento de todas las voces;
- una que maximice las notas comunes;
- una que maximice la resonancia mediante cuerdas al aire;
- una combinación equilibrada de estos criterios.

Por ejemplo, para:

    C – Am – F – G

Jangle podría ofrecer:

    Línea superior descendente
    C → B → A → G

    Máxima continuidad
    máximo número de notas comunes

    Máxima resonancia
    máximo número de cuerdas al aire

    Movimiento mínimo
    mínimo desplazamiento entre voces

Ninguna de ellas tendría que presentarse como "la correcta". Serían
diferentes interpretaciones posibles de la misma progresión.

### Prioridad musical

Una posible interfaz sería permitir al usuario elegir qué aspecto quiere
priorizar:

    Melódico  ←────────────→  Resonante

o, de forma más explícita:

    [ Voz superior ]
    [ Continuidad ]
    [ Resonancia ]
    [ Movimiento ]

El sistema podría recalcular o reordenar las soluciones según esa
preferencia.

Esto permitiría que Jangle funcionase menos como un generador de respuestas
y más como una herramienta de exploración: no decirle al músico cómo debe
tocar una progresión, sino mostrarle qué posibilidades contiene.

### Relación con la función de cejilla

Este sistema estaría relacionado con la lógica que ya utiliza la búsqueda de
cejilla.

La función de cejilla busca:

- maximizar las cuerdas al aire;
- minimizar las notas que se mueven entre los acordes de la progresión.

Esto puede entenderse como una forma de optimizar la **continuidad de la
textura** de la progresión.

La rearmonización, en cambio, busca principalmente generar posibilidades
armónicas y de conducción melódica.

Una evolución futura podría conectar ambos sistemas para poder encontrar
rearmonizaciones que, además de ser musicalmente interesantes, mantengan una
textura coherente y guitarrística.

### Objetivo final

El objetivo no es construir un algoritmo que sepa cuál es la mejor manera de
tocar una progresión.

El objetivo es construir una herramienta que permita descubrir diferentes
formas de escuchar y tocar esa progresión.

En lugar de:

    "Esta es la solución."

Jangle debería tender hacia:

    "Estas son algunas de las posibilidades que contiene."
