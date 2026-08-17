# Pendiente: activar la búsqueda de canciones en producción

La pestaña «Canción» (buscar título+intérprete en Ultimate Guitar y sacar las
progresiones por partes) está implementada y probada, pero en la web publicada
no funcionará hasta desplegar el proxy. Esto es lo que falta y por qué.

## Por qué hace falta un proxy propio

- Trasteo es estático (GitHub Pages): todo corre en el navegador, y CORS impide
  leer respuestas de `ultimate-guitar.com`, que no manda `Access-Control-Allow-Origin`.
- Los proxys CORS públicos no valen: UG tiene fichadas sus IPs de datacenter
  (allorigins y codetabs devuelven 522, corsproxy.io 403). Comprobado 2026-08-17.
- En cambio, UG acepta peticiones con user-agent de navegador desde IPs normales:
  un worker propio de bajo tráfico pasa sin problema.
- El **autocompletado no necesita proxy**: el endpoint de sugerencias
  (`/static/article/suggestions/v5/…`) sí sirve `Access-Control-Allow-Origin: *`.
  Solo la búsqueda final y la descarga del tab pasan por el worker.

## Qué hay ya en el repo

- `proxy-worker.js`: Cloudflare Worker de ~20 líneas. Solo acepta URLs de
  `ultimate-guitar.com` y reenvía con UA de navegador añadiendo la cabecera CORS.
- `song.js`: usa `PROXY = localStorage.proxy || "http://localhost:8787"`
  (el puerto de `wrangler dev`).

## Pasos para retomar

1. Crear cuenta gratuita en Cloudflare (https://dash.cloudflare.com/sign-up,
   sin tarjeta; el plan free da 100.000 peticiones/día, de sobra).
2. Desplegar el worker (pide login en el navegador la primera vez):

   ```bash
   cd trasteo
   npx wrangler deploy proxy-worker.js --name trasteo-proxy --compatibility-date 2026-08-17
   ```

3. Apuntar la app a la URL que devuelve el deploy
   (`https://trasteo-proxy.<subdominio>.workers.dev`): cambiar la constante
   `PROXY` en `song.js` y pushear (Pages redespliega solo).
4. Probar en https://sanhuaaan.github.io/trasteo/ → pestaña «Canción».

Para probar en local sin cuenta: `npx wrangler dev proxy-worker.js` (sirve el
proxy en `http://localhost:8787`, que es el valor por defecto de la app).

## Riesgo conocido

Los datos salen del JSON incrustado en `div.js-store[data-content]` de las
páginas de UG (sin API oficial). Si UG rediseña la web, `song.js` dejará de
parsear y habrá que ajustarlo; los tests con fixture (`test.js`) marcan el punto
exacto de la rotura.
