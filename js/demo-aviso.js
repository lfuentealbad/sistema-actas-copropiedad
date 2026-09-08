/* =====================================================================
 *  El aviso de las páginas de demostración
 *
 *  Las páginas -demo son copias exactas de las de verdad: mismo HTML,
 *  mismo CSS, mismos pasos. Lo único que cambia es que el cliente de
 *  Supabase lo reemplaza un simulador. Esa fidelidad es justamente el
 *  problema: sin un aviso, quien llega no sabe si está probando o si ya
 *  está trabajando en el acta de su asamblea.
 *
 *  Por eso el aviso no se escribe en el HTML de la copia —eso obligaría a
 *  que la copia dejara de ser una copia— sino que se agrega aquí, y el
 *  generador (Pruebas/regenerar-demos.mjs) suma este archivo a las cuatro
 *  páginas de demostración.
 *
 *  Regla de la casa: nada de JavaScript en línea. La CSP real es
 *  script-src 'self', así que todo va en este archivo.
 * ===================================================================== */
(function (global) {
  'use strict';

  // Misma condición que usan los simuladores: esto pertenece a las páginas
  // -demo y a ninguna otra.
  // Con o sin barra final, y con o sin extension: el Worker sirve la misma
  // pagina para /consulta/demo y /consulta/demo/.
  if (!/(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(global.location.pathname)) return;

  // A dónde lleva "esto en serio". El destino real de cada demostración.
  var VUELTA = [
    [/(^|\/)acta-demo/,     '/acta',      'Ir al asistente del acta'],
    [/(^|\/)cuenta-demo/,   '/cuenta',    'Ir a mi cuenta'],
    [/\/consulta\/demo/,    '/consulta/', 'Ir a la consulta por escrito'],
    [/\/votacion\/demo/,    '/votacion/', 'Ir a la sala de votación']
  ];

  function destino() {
    for (var i = 0; i < VUELTA.length; i++) {
      if (VUELTA[i][0].test(global.location.pathname)) return VUELTA[i];
    }
    return null;
  }

  function poner() {
    if (document.getElementById('demo-aviso')) return;
    var d = destino();
    if (!d) return;

    // En modo vitrina no se habla de plata en ninguna parte del sitio.
    // Este aviso se agrega después de que el Worker transformó el HTML,
    // así que le toca respetarlo por su cuenta.
    var vitrina = document.documentElement.classList.contains('vitrina');

    var barra = document.createElement('div');
    barra.id = 'demo-aviso';
    barra.setAttribute('role', 'note');

    var texto = document.createElement('span');
    texto.className = 'demo-aviso-txt';
    texto.innerHTML =
      '<strong>Esto es una demostración.</strong> Funciona completa, pero con datos ' +
      'de ejemplo: nada sale de este navegador<span class="demo-aviso-larga"> —no se ' +
      'envía a ninguna parte ni queda en su cuenta— y el documento que genere no ' +
      'tiene validez. Lo que escriba queda guardado solo aquí, y se borra al salir' +
      '</span>.';

    var ir = document.createElement('a');
    ir.className = 'demo-aviso-btn';
    ir.href = d[1];
    ir.textContent = d[2];

    barra.appendChild(texto);
    barra.appendChild(ir);

    if (!vitrina) {
      var nota = document.createElement('span');
      nota.className = 'demo-aviso-nota';
      nota.textContent = 'Recorrerla no cuesta nada y no pide cuenta.';
      barra.insertBefore(nota, ir);
    }

    var css = document.createElement('style');
    css.textContent =
      '#demo-aviso{position:sticky;top:0;z-index:200;display:flex;flex-wrap:wrap;' +
      'align-items:center;gap:10px 16px;padding:10px 18px;background:#1E3A6E;color:#fff;' +
      'font-family:inherit;font-size:14px;line-height:1.5}' +
      '#demo-aviso .demo-aviso-txt{flex:1 1 320px}' +
      '#demo-aviso .demo-aviso-nota{color:rgba(255,255,255,.72);font-size:13px}' +
      '#demo-aviso .demo-aviso-btn{display:inline-flex;align-items:center;min-height:38px;' +
      'padding:0 16px;border-radius:8px;background:#fff;color:#1E3A6E;font-weight:700;' +
      'text-decoration:none;white-space:nowrap}' +
      '#demo-aviso .demo-aviso-btn:hover{background:#E7EEEC}' +
      '#demo-aviso .demo-aviso-btn:focus-visible{outline:3px solid #8CC3E8;outline-offset:2px}' +
      // En el teléfono el aviso se comía un tercio de la pantalla. Ahí queda
      // la frase que importa —esto no es real— y el resto se abrevia.
      '@media (max-width:620px){' +
      '#demo-aviso{gap:8px 12px;padding:8px 14px;font-size:13px}' +
      '#demo-aviso .demo-aviso-txt{flex:1 1 auto;min-width:0}' +
      '#demo-aviso .demo-aviso-larga{display:none}' +
      '#demo-aviso .demo-aviso-nota{display:none}' +
      '#demo-aviso .demo-aviso-btn{min-height:34px;padding:0 12px;font-size:13px}}' +
      '@media print{#demo-aviso{display:none}}';

    document.head.appendChild(css);
    document.body.insertBefore(barra, document.body.firstChild);

    acomodar(barra);
    // El aviso cambia de alto al reacomodarse en pantallas angostas.
    global.addEventListener('resize', function () { acomodar(barra); });
  }

  // El rail de pasos se pega debajo de lo que quede fijo arriba, y esa
  // medida es --h-cab. Con el aviso encima hay que recalcularla, y depende
  // de si la cabecera del producto queda fija o se va con el scroll: hoy en
  // el acta se va (header.app-header trae position:relative y le gana en
  // especificidad a la regla sticky), asi que lo unico fijo es el aviso.
  //
  // Ojo con tocar el `top` de la cabecera: en un elemento relative eso no
  // la despega, la corre hacia abajo y abre un hueco blanco.
  function acomodar(barra) {
    var alto = barra.offsetHeight;
    var raiz = document.documentElement;

    var cab = document.querySelector('.app-header');
    var fija = cab && /sticky|fixed/.test(global.getComputedStyle(cab).position);
    if (fija) cab.style.top = alto + 'px';

    if (raiz.dataset.hCabBase === undefined) {
      var base = parseFloat(global.getComputedStyle(raiz).getPropertyValue('--h-cab'));
      if (!base) return;              // esta página no usa el rail
      raiz.dataset.hCabBase = base;
    }
    raiz.style.setProperty('--h-cab',
      (fija ? parseFloat(raiz.dataset.hCabBase) + alto : alto) + 'px');
  }

  // -------------------------------------------------------------------
  //  Lo que se descarga desde una demostración también tiene que decirlo
  // -------------------------------------------------------------------
  //  El aviso de arriba vive en la página. El documento que el asistente
  //  genera se arma aparte, con su propio <html>, así que salía sin nada:
  //  un acta bajada desde la demostración decía "BORRADOR" —porque no
  //  tiene folio— y nada más. Y si en la demostración se finaliza, el
  //  simulador entrega un folio de mentira y el documento queda
  //  indistinguible de uno real.
  //
  //  Se envuelve el generador del documento, que para entonces ya existe.
  //  Lo señaló la revisión externa del 08-09-2026.
  function marcarLoQueSeDescarga() {
    if (typeof global._actaDocumento !== 'function') return;
    if (global._actaDocumento._marcado) return;

    var original = global._actaDocumento;
    var envuelto = function () {
      var d = original.apply(this, arguments);
      if (!d || typeof d.html !== 'string') return d;

      var franja =
        '<div style="background:#8B0000;color:#fff;padding:14px 18px;margin:0 0 22px;' +
        'border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:12pt;' +
        'line-height:1.5;-webkit-print-color-adjust:exact;print-color-adjust:exact">' +
        '<strong style="display:block;font-size:13pt;letter-spacing:.5px;' +
        'text-transform:uppercase;margin-bottom:5px">Documento de demostración</strong>' +
        'Generado en la demostración de actascopropiedad.cl con datos de ejemplo. ' +
        '<strong>No tiene validez</strong> y su folio, si aparece, es simulado. ' +
        'Un acta de verdad se levanta en actascopropiedad.cl/acta.</div>';

      var i = d.html.indexOf('<body>');
      d.html = i < 0 ? franja + d.html
                     : d.html.slice(0, i + 6) + String.fromCharCode(10) + franja + d.html.slice(i + 6);

      // Y el nombre del archivo, para que no se confunda en una carpeta.
      d.nombre = 'DEMOSTRACION_' + (d.nombre || 'acta');
      return d;
    };
    envuelto._marcado = true;
    global._actaDocumento = envuelto;
  }

  function arrancar() {
    poner();
    marcarLoQueSeDescarga();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arrancar);
  else arrancar();

})(window);
