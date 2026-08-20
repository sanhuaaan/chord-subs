# Guardado

Lo que está aquí **no lo usa la app**. Nada de `index.html` ni de `app.js` importa esta carpeta, y
la página publicada no pide un solo fichero de lo que hay detrás. Está guardado, no muerto: los
tests lo siguen probando, así que si algún día vuelve, vuelve funcionando.

## Qué hay

`catalog.js` es el módulo que lee **De Chordis Mysteriis**, el catálogo de 385.664 canciones con
sus progresiones por partes que sigue publicado en
[su repo](https://github.com/sanhuaaan/de-chordis-mysteriis) y en
`sanhuaaan.github.io/de-chordis-mysteriis`. Sabe tres cosas: buscar por título, abrir una canción, y
la que no puede hacer ninguna otra fuente —la **firma** de una progresión, que no depende del tono
ni del color, con la que se pregunta en qué canciones suena lo que estás tocando—.

`data/` es la tubería que fabrica ese catálogo desde Chordonomicon. Su [`README.md`](data/README.md)
cuenta cómo, y todo lo que dice sigue siendo cierto: se ejecuta a mano y el repo de datos no depende
de que la app lo use.

## Por qué está fuera

La consulta inversa —la pestaña «Dónde suena»— se usó y no aportaba. Saber que tu progresión suena
en 24.190 canciones no dice nada de tu progresión, y la lista de cuarenta que se enseñaba no llevaba
a ninguna parte: eran cuarenta canciones que no habías elegido, ordenadas por una señal pobre (lo
transcrito que está cada intérprete, que no es lo mismo que conocido). La búsqueda por título del
catálogo se va con ella: Ultimate Guitar ya la cubre y con mejores transcripciones.

Lo que se hizo bien se queda escrito, que es de lo que sirve: la firma transpositiva, la traducción
de la grafía de Chordonomicon y el troceado del índice están medidos en
[`data/README.md`](data/README.md) y en el hilo 4 de [MEJORAS.md](../MEJORAS.md).

## Cómo vuelve

Lo que hay que volver a poner es exactamente lo que quitó el commit que guardó todo esto, así que la
forma más limpia de verlo es ese commit del revés:

```bash
git show -R 7a7cf64      # el desenchufe, al revés: lo que habría que reconectar
```

Son unas ciento cincuenta líneas en dos ficheros: el import en `app.js`, la mitad de catálogo del
diálogo de buscar, la pestaña con su panel en `index.html`, y los estilos de los trozos. Los
ficheros de esta carpeta habría que devolverlos a la raíz, que es de donde salieron, y arreglar las
rutas de import que cambiaron al moverlos (`../notes.js` en `data/spelling.mjs`, y el `./archived/`
de `test.js`).

La rama **`catalogo`** guarda la app entera con todo enchufado y funcionando, en el commit
`e8fdb57`. Sirve para verla correr, no como parche: es de antes de que el código pasara a nombres en
inglés y de que llegara la pestaña de afinaciones, así que un `git diff main..catalogo` mezcla esas
tres cosas. Para leer solo el cableado, el `git show -R` de arriba.
