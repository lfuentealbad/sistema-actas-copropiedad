// Worker mínimo para geolocalización aproximada (región/ciudad) por IP.
// Cloudflare sirve los assets estáticos primero; este código solo corre para
// rutas que NO son un archivo. La única que atendemos es /cf-geo; cualquier
// otra cosa se delega al servido de assets (fallback a prueba de fallos).
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/cf-geo') {
      const cf = request.cf || {};
      return new Response(JSON.stringify({
        pais: cf.country || null,
        region: cf.region || null,
        ciudad: cf.city || null
      }), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
