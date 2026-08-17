// Proxy CORS mínimo para Ultimate Guitar (bloquea los proxys públicos, pero no
// las peticiones con pinta de navegador). Desplegar en Cloudflare Workers:
//   npx wrangler deploy proxy-worker.js --name jangle-proxy --compatibility-date 2026-08-17
// y poner la URL resultante en localStorage.proxy (o en PROXY de song.js).
// Probar en local sin cuenta: npx wrangler dev proxy-worker.js

const ALLOWED = /(^|\.)ultimate-guitar\.com$/;

export default {
  async fetch(request) {
    const target = new URL(request.url).searchParams.get("url");
    if (!target || !ALLOWED.test(new URL(target).hostname)) {
      return new Response("solo ultimate-guitar.com", { status: 400 });
    }
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept": "text/html",
      },
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
    });
  },
};
