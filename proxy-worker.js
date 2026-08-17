// Proxy CORS mínimo para Ultimate Guitar (bloquea los proxys públicos, pero no
// las peticiones con pinta de navegador). Desplegar en Cloudflare Workers:
//   npx wrangler deploy proxy-worker.js --name jangle-proxy --compatibility-date 2026-08-17
// y poner la URL resultante en PROXY de song.js (o en localStorage.proxy).
// Probar en local sin cuenta: npx wrangler dev proxy-worker.js

const ALLOWED_TARGET = /(^|\.)ultimate-guitar\.com$/;

// Solo lo usa la página de Jangle: GitHub Pages y, para desarrollar, cualquier
// puerto de localhost. Origin es un dominio y no una ruta, así que esto no acota
// al repo sino a la cuenta: cualquier otra página publicada en sanhuaaan.github.io
// pasaría igual. Y no es una barrera de seguridad —la cabecera se falsifica con
// curl en un segundo—, sino el filtro que evita lo que de verdad gastaría la cuota:
// que el worker acabe siendo el proxy CORS gratuito de terceros, o que baste pegar
// su URL en la barra del navegador (una navegación no manda Origin, así que cae).
const ALLOWED_ORIGIN = [
  /^https:\/\/sanhuaaan\.github\.io$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

// ponytail: sin rama para OPTIONS. song.js hace un GET pelado sin cabeceras propias,
// que es una petición simple y no dispara preflight; si algún día lleva cabeceras, hay
// que responder al OPTIONS con Allow-Methods/Allow-Headers o el navegador la cortará.
export default {
  async fetch(request) {
    const origin = request.headers.get("Origin");
    if (!origin || !ALLOWED_ORIGIN.some(re => re.test(origin))) {
      return new Response("solo desde Jangle", { status: 403 });
    }
    // Cabeceras de CORS comunes a las tres salidas: al responder distinto según el
    // Origin, Vary es lo que impide que una caché sirva la respuesta de otro.
    const cors = { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };

    const target = new URL(request.url).searchParams.get("url");
    if (!target || !ALLOWED_TARGET.test(new URL(target).hostname)) {
      return new Response("solo ultimate-guitar.com", { status: 400, headers: cors });
    }
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html",
      },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "text/html; charset=utf-8", ...cors },
    });
  },
};
