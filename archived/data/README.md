# De dónde sale el catálogo

Aquí está la tubería que fabrica **De Chordis Mysteriis**, el repo de ficheros estáticos con las
progresiones de 385.664 canciones. Se ejecuta una vez, a mano, en una máquina con red y unos gigas
libres.

> La app no usa hoy este catálogo: está guardado, con el porqué en [el README de al
> lado](../README.md). El repo de datos sigue publicado y esta tubería sigue valiendo tal cual.

## La fuente

[Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) (CC BY-NC 4.0) son
679.807 canciones representadas como progresiones de acordes **con las partes marcadas**
(`<verse_1>`, `<chorus_1>`…), que es el mismo modelo que usa jangle. No trae título ni intérprete:
solo un id de Spotify, y en dos de cada tres filas.

Los títulos salen de un join contra el volcado público
[spotify-huge-track-analysis-dataset](https://huggingface.co/datasets/GildasLeDrogoff/spotify-huge-track-analysis-dataset)
(CC BY-NC 4.0), 56 millones de pistas de las que duckdb lee **solo tres columnas por HTTP**, sin
descargar los 4 GB. Cubre el 87,5% de los ids. De ahí se toma únicamente el hecho —título e
intérprete, que existen con independencia de Spotify—: nada de popularidad ni de audio features,
que es lo que protege su política de desarrollador. Del intérprete se aprovecha además que su id
aparece en filas que no casaron, así que su nombre se propaga a otras 80.000 canciones.

Se publican las **385.664** que acaban con título. Las demás no se pueden ni buscar ni enseñar, así
que tampoco cuentan en los totales.

## Los pasos

```bash
python3 -m venv venv && venv/bin/pip install duckdb
venv/bin/python archived/data/prepare.py songs.jsonl   # ~5 min, 92 MB de descarga
node --max-old-space-size=8000 archived/data/build.mjs songs.jsonl ../de-chordis-mysteriis
```

`prepare.py` deja una línea de JSON por canción con los títulos ya resueltos. `build.mjs`
hace el resto: traducir la grafía, partir en partes, y escribir los tres índices.

Publicar es hacer commit en el tomo y empujar: GitHub Pages sirve la carpeta tal cual, con
`Access-Control-Allow-Origin: *`, que es lo que deja que la app se lo baje desde otro dominio.

```bash
cd ../de-chordis-mysteriis && git add -A && git commit -m "data: …" && git push
```

Para trabajar contra una copia local no hace falta tocar el código: `localStorage.catalogo` manda
sobre la constante de `catalog.js`, igual que `localStorage.proxy` con el worker.

```js
localStorage.catalogo = "http://127.0.0.1:8124"
```

## La grafía

Chordonomicon escribe los acordes a su manera: `Amin`, `Fs7`, `A/Cs`, `Dno3d`. `spelling.mjs` la
traduce a la que lee tonal y con la tabla de notas de la app (`Ds` sale como `Eb`, que es como lo
escribe el resto de jangle). El **99,93%** de los 52 millones de acordes traduce exacto; el resto
son cifrados que tonal no sabe leer (`Fmaj911s`, `Aaugmaj7`) y bajan por una escalera de
simplificaciones —primero las alteraciones, luego la extensión, al final la tríada— hasta algo que
sí se lee. Pierden color, no función. Un solo token de los 4.314 distintos no da ni para eso.

## Lo que se publica

```
meta.json                 qué hay dentro y con qué topes se construyó
titulos.json              el manifiesto: qué prefijos existen y cuántas canciones tiene cada uno
titulos/<prefijo>.json    { a: [intérpretes], f: [[id, título, índice del intérprete]] }
canciones/<tramo>.json    { id: [[nombre de la parte, "C Am F G"], …] }, 250 canciones por fichero
progresiones/4/<hh>.json  { firma: [cuántas canciones, [[id, título, intérprete], …]] }
progresiones/3/<hh>.json  lo mismo con ventanas de tres acordes
```

**Títulos.** Cada canción se indexa por cada palabra de su título y de su intérprete, con prefijos
de tres letras que se alargan donde no caben (todo lo que empieza por «the» no cabe en un fichero).
Buscar es bajarse **un solo trozo** —el de la palabra más rara de lo tecleado— y filtrar en el
navegador con la consulta entera. Dentro de cada fichero las filas van ordenadas de más peso a
menos, y como el `sort` del navegador es estable, a igualdad de acierto manda ese orden sin
guardar un número por fila.

**Progresiones.** La firma de una ventana no depende del tono ni del color: `Am F C G` y `Bm G D A`
son la misma, y `Am7 F C Gsus4` también (ver `catalog.js`, que es de donde sale la función: si
cambia, hay que rehacer los datos). Se indexan ventanas de cuatro y de tres acordes, no
progresiones enteras, para que una canción que lleva un trozo de la tuya también aparezca. De cada
firma se guarda **cuántas canciones la tienen** y una **muestra de hasta 40**, dos por intérprete
como mucho.

## El peso, y lo que no hay

No hay señal de popularidad y no se va a coger de Spotify. Lo que se usa en su lugar es **cuántas
canciones tiene cada intérprete en el propio dataset**: quien está muy transcrito suele ser quien
alguien reconoce. Con eso se ordenan los resultados de una búsqueda y se elige qué 40 canciones
enseñar de las 43.000 que llevan `Am F C G`.

Para la muestra el peso va en logaritmo y lleva un dado sacado del propio id de la canción
—determinista, así que dos generaciones dan lo mismo—. Sin las dos cosas, los seis intérpretes con
quinientas transcripciones saldrían en todas las progresiones y la respuesta sería siempre la misma.

Es una aproximación pobre y se nota. Confunde «muy transcrito» con «conocido»: Johnny Cash tiene
571 canciones en el dataset y los Beatles 136, así que en las listas hay más country del que le
toca. Y en las búsquedas, una versión de instituto que se llame exactamente igual que el original
le ganaba; se arregló a medias quitando la coletilla de la edición («- Remastered 2009», «- Live»)
antes de comparar, que es lo que hace que los Eagles salgan los segundos en «hotel california» en
vez de los últimos. La lista enseña siempre el intérprete, que es lo que deja elegir de un vistazo.

Los otros límites, sabidos de antemano: el dataset es una foto de 2024 (canciones nuevas, no), las
transcripciones vienen del mismo crowdsourcing que Ultimate Guitar pero sin el filtro de «la mejor
votada», y el 41% de las filas no trae las partes marcadas, así que se publican como una sola
progresión larga.
