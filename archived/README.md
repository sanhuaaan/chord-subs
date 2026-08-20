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

`datos/` es la tubería que fabrica ese catálogo desde Chordonomicon. Su `LEEME.md` cuenta cómo, y
todo lo que dice sigue siendo cierto: se ejecuta a mano y el repo de datos no depende de que la app
lo use.

## Por qué está fuera

La consulta inversa —la pestaña «Dónde suena»— se usó y no aportaba. Saber que tu progresión suena
en 24.190 canciones no dice nada de tu progresión, y la lista de cuarenta que se enseñaba no llevaba
a ninguna parte: eran cuarenta canciones que no habías elegido, ordenadas por una señal pobre (lo
transcrito que está cada intérprete, que no es lo mismo que conocido). La búsqueda por título del
catálogo se va con ella: Ultimate Guitar ya la cubre y con mejores transcripciones.

Lo que se hizo bien se queda escrito, que es de lo que sirve: la firma transpositiva, la traducción
de la grafía de Chordonomicon y el troceado del índice están medidos en `datos/LEEME.md` y en el
hilo 4 de [MEJORAS.md](../MEJORAS.md).

## Cómo vuelve

La versión de la app con todo conectado está en la rama **`catalogo`**, en el commit
`e8fdb57`. Ahí se ve exactamente lo que hay que volver a poner:

```bash
git diff main..catalogo -- app.js index.html
```

Son unas ciento cincuenta líneas: el import, la mitad de catálogo del diálogo de buscar, la pestaña
y su panel, y los estilos de los trozos. Los ficheros de esta carpeta habría que devolverlos a la
raíz (`catalog.js` y `datos/`), que es de donde salieron, y arreglar las dos rutas de import que
cambiaron al moverlos.
