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
 *  páginas de demostración, ANTES que los simuladores.
 *
 *  Hace cuatro cosas, y las cuatro apartan la demostración de lo real:
 *    1. separa el almacenamiento del navegador: lo de la demostración no
 *       se mezcla con el borrador ni con la llave de pago de verdad;
 *    2. contesta aquí mismo las llamadas al Worker (/api/*): desde una
 *       demostración no sale nada hacia la pasarela ni hacia el correo;
 *    3. pinta la franja de arriba;
 *    4. marca el documento que se descarga.
 *  Y deja una señal (DEMO_AVISO) sin la cual los simuladores del acta y de
 *  la consulta no arrancan. En producción el sitio llegó a servir
 *  /acta-demo con este archivo en 404 y la demostración funcionaba entera
 *  sin decir que lo era (AUTH-01, auditoría de septiembre de 2026): ahora,
 *  sin aviso, no hay demostración.
 *
 *  Nada de esto es un candado. Corre en el navegador de quien mira y se
 *  puede desarmar con las herramientas del navegador. Lo que un documento
 *  alterado no puede alterar es el registro del servidor, y para eso está
 *  /verificar: un folio DEMO- no existe allí y la página lo dice.
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

  var MARCA = 'DEMO-PAGO-SIMULADO';

  // -------------------------------------------------------------------
  //  1) Un almacenamiento aparte
  // -------------------------------------------------------------------
  //  localStorage es del ORIGEN, no de la página: /acta-demo y /acta
  //  comparten el mismo. Se venía parchando llave por llave -la del pago se
  //  guardaba aparte y se reponía al salir- pero el borrador del acta
  //  seguía compartido: lo escrito en la demostración, con su folio
  //  simulado, aparecía en /acta al ofrecer "restaurar la última sesión"; y
  //  al revés, el padrón de verdad, con el RUT de los vecinos, aparecía en
  //  la demostración.
  //
  //  Aquí se desvía toda llave del producto a una gemela con el prefijo
  //  demo_. Las de los simuladores ya lo traen y quedan como están: por eso
  //  la Mesa y el teléfono, en dos pestañas de demostración, se siguen
  //  viendo (el evento 'storage' trae la llave tal como se escribió).
  var PREFIJO = 'demo_';

  function aislarElAlmacen() {
    var ls = null;
    try { ls = global.localStorage; } catch (e) { return false; }
    var P = global.Storage && global.Storage.prototype;
    if (!ls || !P || typeof P.getItem !== 'function') return false;
    if (P.getItem._demo) return true;

    var leer = P.getItem, escribir = P.setItem, borrar = P.removeItem;
    limpiarLoQueDejoLaVersionAnterior(ls, leer, escribir, borrar);

    // Solo localStorage: sessionStorage muere con la pestaña y no cruza de
    // una página a otra, así que no hay nada que apartar.
    function llave(almacen, k) {
      k = String(k);
      return (almacen === ls && k.indexOf(PREFIJO) !== 0) ? PREFIJO + k : k;
    }
    P.getItem = function (k) { return leer.call(this, llave(this, k)); };
    P.setItem = function (k, v) { return escribir.call(this, llave(this, k), v); };
    P.removeItem = function (k) { return borrar.call(this, llave(this, k)); };
    P.getItem._demo = true;

    // Recorrer las llaves también tiene que quedar adentro. Cerrar sesión
    // (cuenta.js) recorre localStorage buscando 'sala-mesa-' y 'sala-voto-'
    // para limpiar el equipo: aquí tiene que ver las de la demostración, con
    // su nombre sin prefijo, y no las de verdad. Y un clear() de la
    // demostración no puede vaciar el equipo entero.
    var largo = Object.getOwnPropertyDescriptor(P, 'length');
    var claveN = P.key, vaciar = P.clear;
    if (largo && typeof largo.get === 'function' && typeof claveN === 'function') {
      var propias = function (almacen) {
        var n = largo.get.call(almacen), r, out = [];
        for (var i = 0; i < n; i++) {
          r = claveN.call(almacen, i);
          if (r != null && r.indexOf(PREFIJO) === 0) out.push(r);
        }
        return out;
      };
      P.key = function (i) {
        if (this !== ls) return claveN.call(this, i);
        var r = propias(this)[i];
        return r == null ? null : r.slice(PREFIJO.length);
      };
      Object.defineProperty(P, 'length', {
        configurable: true, enumerable: largo.enumerable,
        get: function () { return this === ls ? propias(this).length : largo.get.call(this); }
      });
      if (typeof vaciar === 'function') {
        P.clear = function () {
          if (this !== ls) return vaciar.call(this);
          propias(this).forEach(function (r) { borrar.call(ls, r); });
        };
      }
    }
    return true;
  }

  // La versión anterior escribía en las llaves de verdad. Quien pasó por
  // ella puede tener la llave de mentira todavía puesta, o la suya guardada
  // aparte sin reponer: si la pestaña se cerró de golpe no hubo 'pagehide'.
  // Se ordena una vez, con las llaves crudas, antes de apartar nada.
  //
  // La guardada vuelve solo si su casilla está vacía o tiene la de mentira.
  // Si ahí hay otra llave de verdad -la persona pagó de nuevo después, en
  // /acta, mientras la vieja seguía guardada aparte-, esa es la más nueva y
  // no se pisa: la guardada espera su turno, igual que en la recuperación de
  // pagos de cuenta.js, y vuelve en una visita posterior, cuando la casilla
  // se desocupe al finalizar el acta.
  function limpiarLoQueDejoLaVersionAnterior(ls, leer, escribir, borrar) {
    try {
      var suya = leer.call(ls, 'acta_pago_llave_real');
      var ahora = leer.call(ls, 'acta_pago_llave');
      if (suya && suya !== MARCA && (!ahora || ahora === MARCA)) {
        escribir.call(ls, 'acta_pago_llave', suya);
        borrar.call(ls, 'acta_pago_llave_real');
      } else {
        if (ahora === MARCA) borrar.call(ls, 'acta_pago_llave');
        if (suya === MARCA) borrar.call(ls, 'acta_pago_llave_real');
      }
      if (leer.call(ls, 'consulta_pago_llave') === MARCA) borrar.call(ls, 'consulta_pago_llave');
    } catch (e) { /* sin almacenamiento no hay nada que ordenar */ }
  }

  // -------------------------------------------------------------------
  //  2) El cobro se contesta aquí
  // -------------------------------------------------------------------
  //  La franja dice "nada sale de este navegador", y el botón de pagar del
  //  panel de demostración sí salía: le mandaba al Worker de verdad el
  //  correo de la sesión simulada. Desde que el Worker exige la sesión
  //  (Authorization: Bearer), además le habría mandado un token inventado.
  //
  //  Se contesta como contestaría el Worker, con la misma regla: sin la
  //  cabecera, o con un token que no es el de la sesión vigente, 401
  //  sesion_requerida. Así una página que se olvide de mandarla falla
  //  también aquí, que es donde se prueba. Con la sesión en orden, crear
  //  responde que no hay pasarela -en la demostración no se cobra: para
  //  seguir como pagado está DEMOA.pagar()- y el estado de una orden, que
  //  no existe, sin decir si es de otra cuenta.
  function tokenDe(entrada, opciones) {
    var h = (opciones && opciones.headers) ||
            (entrada && typeof entrada === 'object' && entrada.headers) || null;
    var v = null;
    if (h) {
      if (typeof h.get === 'function') v = h.get('authorization');
      else if (Array.isArray(h)) {
        h.forEach(function (par) {
          if (par && String(par[0]).toLowerCase() === 'authorization') v = par[1];
        });
      } else {
        Object.keys(h).forEach(function (k) {
          if (k.toLowerCase() === 'authorization') v = h[k];
        });
      }
    }
    var m = /^Bearer\s+(\S+)$/i.exec(String(v || '').trim());
    return m ? m[1] : null;
  }

  // El token de la sesión que la página cree tener: el del cliente simulado.
  function tokenVigente() {
    return new Promise(function (res) {
      var c = null;
      try {
        c = (global.Cuenta && typeof global.Cuenta.cliente === 'function' && global.Cuenta.cliente()) ||
            (global.supabase && global.supabase.createClient && global.supabase.createClient());
      } catch (e) { c = null; }
      if (!c || !c.auth || typeof c.auth.getSession !== 'function') { res(null); return; }
      c.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        res((s && s.access_token) || null);
      }, function () { res(null); });
    });
  }

  function respuesta(estado, cuerpo) {
    var texto = JSON.stringify(cuerpo);
    if (typeof global.Response === 'function') {
      return new global.Response(texto, {
        status: estado, headers: { 'content-type': 'application/json' }
      });
    }
    return {
      ok: estado >= 200 && estado < 300, status: estado,
      json: function () { return Promise.resolve(JSON.parse(texto)); },
      text: function () { return Promise.resolve(texto); }
    };
  }

  // La ruta dentro de este sitio, o null si la llamada va a otro origen
  // (Supabase, que en la demostración ni siquiera está: lo reemplaza el
  // simulador). Se resuelve como la resolvería el navegador, para que
  // '/x/../api/pago/crear' o la dirección completa del sitio no se escapen.
  function rutaPropia(entrada) {
    var url = typeof entrada === 'string' ? entrada
            : (entrada && typeof entrada.url === 'string') ? entrada.url : String(entrada || '');
    var loc = global.location || {};
    if (typeof global.URL === 'function' && loc.href) {
      try {
        var u = new global.URL(url, loc.href);
        return u.origin === loc.origin ? u.pathname : null;
      } catch (e) { /* se sigue con la cuenta a mano */ }
    }
    var origen = loc.origin || '';
    if (origen && url.indexOf(origen) === 0) url = url.slice(origen.length);
    return url.charAt(0) === '/' && url.charAt(1) !== '/' ? url.split(/[?#]/)[0] : null;
  }

  //  Lo demás de /api/ tampoco sale. La Mesa de la demostración, al cerrar
  //  un punto, pedía al Worker de verdad las constancias de voto por correo
  //  (/api/voto/avisos) con el código de su sala simulada y el nombre del
  //  condominio que se escribió; y la cuenta de demostración, al cambiar la
  //  clave, consultaba /api/clave/filtrada. Aquí se contestan como
  //  contestaría un Worker sin ese servicio, y lo que no se conoce, 404.
  //  /cf-geo sigue su camino: es un GET sin datos de quien escribe.
  function contestarLoDemas(ruta) {
    if (ruta === '/api/voto/avisos') return respuesta(503, { error: 'avisos_no_configurados' });
    if (ruta === '/api/clave/filtrada') return respuesta(200, { filtrada: false });
    return respuesta(404, { error: 'no_disponible_en_demostracion' });
  }

  function simularElCobro() {
    var real = global.fetch;
    if (typeof real !== 'function' || real._demo) return;

    var envuelto = function (entrada, opciones) {
      var ruta = rutaPropia(entrada);
      if (ruta === null || !/^\/api\//.test(ruta)) return real.apply(global, arguments);
      if (!/^\/api\/pago\//.test(ruta)) return Promise.resolve(contestarLoDemas(ruta));

      var metodo = String((opciones && opciones.method) ||
                          (entrada && typeof entrada === 'object' && entrada.method) || 'GET').toUpperCase();
      var enviado = tokenDe(entrada, opciones);

      return tokenVigente().then(function (vigente) {
        if (!enviado || !vigente || enviado !== vigente) {
          return respuesta(401, { error: 'sesion_requerida' });
        }
        if (ruta === '/api/pago/crear' && metodo === 'POST') {
          if (global.console) {
            console.info('Demostración: aquí no se cobra. Para seguir como si hubiera pagado, ' +
                         'DEMOA.pagar() o DEMOC.pagar() y recargue.');
          }
          return respuesta(503, { error: 'pasarela_no_configurada' });
        }
        if (ruta === '/api/pago/estado' && metodo === 'GET') {
          return respuesta(404, { error: 'orden_no_encontrada' });
        }
        return respuesta(405, { error: 'metodo_no_permitido' });
      });
    };
    envuelto._demo = true;
    global.fetch = envuelto;
  }

  var almacenAparte = aislarElAlmacen();
  simularElCobro();

  // La señal que esperan los simuladores. Se pone de inmediato, no al
  // cargar el documento: los simuladores vienen justo después y deciden
  // al evaluarse.
  global.DEMO_AVISO = { activo: true, almacenAparte: almacenAparte };

  // -------------------------------------------------------------------
  //  3) La franja
  // -------------------------------------------------------------------
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

    // Decía "y se borra al salir", y no era cierto: lo escrito se queda en
    // el navegador hasta que se reinicia la demostración. Lo que sí es
    // cierto desde que el almacenamiento va aparte es que no se mezcla con
    // la herramienta de verdad.
    var texto = document.createElement('span');
    texto.className = 'demo-aviso-txt';
    texto.innerHTML =
      '<strong>Esto es una demostración.</strong> Funciona completa, pero con datos ' +
      'de ejemplo: nada sale de este navegador<span class="demo-aviso-larga"> —no se ' +
      'envía a ninguna parte ni queda en su cuenta— y el documento que genere no ' +
      'tiene validez. Lo que escriba queda guardado solo aquí, aparte de la ' +
      'herramienta real</span>.';

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
  //  4) Lo que se descarga desde una demostración también tiene que decirlo
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
  //
  //  La franja se borra con un editor de texto, así que no es lo único: la
  //  marca de agua sale en cada hoja impresa, el título de la pestaña lo
  //  dice, y el folio y el código que pone el simulador (DEMO-000001,
  //  DEMO-0000-0000) no tienen la forma de uno real y /verificar los
  //  reconoce como de demostración.
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

      // Un elemento fijo se repite en cada hoja al imprimir.
      var agua =
        '<div aria-hidden="true" style="position:fixed;top:42%;left:-10%;right:-10%;' +
        'text-align:center;transform:rotate(-28deg);font-family:Arial,Helvetica,sans-serif;' +
        'font-size:54pt;font-weight:bold;letter-spacing:6px;color:rgba(139,0,0,.13);' +
        'pointer-events:none;z-index:9999;-webkit-print-color-adjust:exact;' +
        'print-color-adjust:exact">DEMOSTRACIÓN · SIN VALIDEZ</div>';

      var i = d.html.indexOf('<body>');
      d.html = i < 0 ? franja + agua + d.html
                     : d.html.slice(0, i + 6) + String.fromCharCode(10) + franja + agua +
                       d.html.slice(i + 6);
      d.html = d.html.replace(/<title>/i, '<title>DEMOSTRACIÓN · ');

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
