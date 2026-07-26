// RECESO — Sistema de Actas de Copropiedad en pausa temporal.
// El Worker intercepta TODAS las rutas (run_worker_first) y responde 503,
// de modo que el sitio no sirve contenido. El código completo se conserva
// en el repositorio (rama "respaldo-sitio-completo"). Para reactivar: revertir
// este archivo y quitar "run_worker_first" de wrangler.jsonc.
export default {
  async fetch() {
    return new Response('actascopropiedad.cl — servicio temporalmente no disponible.', {
      status: 503,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'retry-after': '86400'
      }
    });
  }
};
