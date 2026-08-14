# chord-subs

Aplicación web enfocada a guitarra que, dada una progresión de acordes, sugiere sustituciones y acordes intermedios, con su explicación, su diagrama de guitarra y la posibilidad de escucharlas rasgueadas.

## Uso

Es una página estática sin build. Sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8123
# o
npx serve .
```

Abre `http://localhost:8123`, escribe una progresión (p. ej. `C Am F G7`, separada por espacios, comas o `|`) y pulsa **Sugerir**. Cada sugerencia muestra por qué funciona, el diagrama de guitarra de los acordes nuevos, y un botón ▶ que reproduce la progresión completa (con el voicing real de guitarra, rasgueado) con la sustitución aplicada.

Las grafías siguen el criterio de la base de datos de guitarra: `C#` y no `Db`, `Eb` y no `D#`.

## Reglas implementadas

| Regla | Ejemplo |
|-------|---------|
| Sustitución de tritono | `G7 → Db7` |
| Relativo mayor/menor | `C → Am`, `Am → C` |
| Dominante secundario | `Dm → A7 Dm` |
| Inserción ii-V | `G7 → Dm7 G7` |
| Disminuido de paso (ascendente) | `C Dm → C C#dim7 Dm` |
| Intercambio modal | `F → Fm` |

## Stack

- Vanilla JS (módulos ES), sin build ni framework.
- [tonal.js](https://github.com/tonaljs/tonal) para parsing y teoría musical, cargada vía import map desde esm.sh.
- [@tombatossals/chords-db](https://github.com/tombatossals/chords-db) (JSON desde jsdelivr) para posiciones de guitarra; diagramas dibujados como SVG propio.
- Web Audio API para la reproducción: notas MIDI de la posición real, con rasgueo (30 ms entre cuerdas).

## Tests

```bash
npm install
npm test
```

Los tests (`test.js`) cubren el parser y cada regla con `node --test`.
