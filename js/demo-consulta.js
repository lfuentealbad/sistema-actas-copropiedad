/* =====================================================================
 *  Simulador de la consulta por escrito  —  SOLO PARA DEMOSTRACIÓN
 *
 *  Reemplaza a Supabase por una base en memoria que implementa las mismas
 *  funciones cc_*, con las mismas formas de entrada y salida. El código de
 *  la consulta (js/consulta-1.js) corre sin una sola modificación.
 *
 *  Las respuestas simuladas pasan por el intérprete DE VERDAD
 *  (js/interprete-respuestas.js, el mismo que usa el Worker con el correo
 *  entrante). Lo que aquí se ve interpretar es lo que interpretaría en
 *  producción: no hay una segunda copia de las reglas.
 *
 *  Sirve para ver el circuito completo sin pasarela de pago ni casilla de
 *  correo entrante, que hoy están cerradas a propósito.
 *
 *  Corre en las páginas -demo, con su aviso cargado antes, y en localhost.
 *  En cualquier otra página se ignora solo.
 * ===================================================================== */
(function (global) {
  'use strict';

  var enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname);
  // Las paginas de demostracion -las que genera Pruebas/regenerar-demos.mjs-
  // son las unicas que cargan este archivo a proposito, y son las unicas que
  // no cargan el cliente real de Supabase. Ahi el simulador corresponde,
  // tambien en produccion: es lo que permite recorrer la herramienta antes
  // de pagar. En cualquier otra ruta se sigue ignorando.
  var esPaginaDemo = /(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(global.location.pathname);
  // El modo vitrina lo enciende el Worker (VITRINA=1) para mostrar el sistema.
  // El simulador no habla con la base de datos, asi que ahi tambien sirve.
  var enVitrina = document.documentElement.classList.contains('vitrina');
  if (!enLocal && !enVitrina && !esPaginaDemo) {
    console.warn('El simulador de consulta solo funciona en las páginas de demostración. Ignorado.');
    return;
  }
  // Sin el aviso no hay demostración: ver la misma nota en js/demo-acta.js.
  // Fuera de localhost el aviso tiene que haber corrido antes; si no, aquí
  // no se finge nada.
  if (!enLocal && !(global.DEMO_AVISO && global.DEMO_AVISO.activo)) {
    console.error('Falta js/demo-aviso.js antes de este archivo: sin el aviso, la demostración no arranca.');
    return;
  }

  // --- La cuenta de la Mesa --------------------------------------------
  // Cuenta.usuario() solo mira la sesión, así que con esto el portero de la
  // página deja pasar. En producción la sesión la emite Supabase.
  // El access_token es el que las páginas mandan al cobro con
  // Cuenta.tokenDeAcceso(); lo contesta js/demo-aviso.js y no sale de aquí.
  // Es el mismo valor que usa el simulador del acta: el panel carga los dos.
  // La cuenta va aparte de la sesion, como en js/demo-acta.js: cerrar la
  // sesion y volver a entrar con la clave encuentra la misma cuenta.
  var CUENTA = {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'administracion@ejemplo.cl',
    user_metadata: { nombre: 'Elena Pizarro' }
  };
  function sesionNueva() {
    return {
      access_token: 'demo-sesion-sin-validez',
      token_type: 'bearer',
      refresh_token: 'demo-sesion-sin-validez',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: CUENTA
    };
  }
  var SESION = sesionNueva();

  var LLAVE = 'demo_consulta_estado';
  var base = null;

  // 'pagos': las llaves que ya abrieron su consulta. En Postgres es la fila
  // de vv_pagos_usados que cc_crear escribe (ver cc_crear).
  function vacia() {
    return { consultas: {}, pagos: {} };   // codigo -> { ...campos, destinatarios[], respuestas{} }
  }

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(base)); } catch (e) {}
  }
  function recuperar() {
    try {
      var g = JSON.parse(localStorage.getItem(LLAVE));
      base = (g && g.consultas) ? g : vacia();
    } catch (e) { base = vacia(); }
    // Lo guardado antes del 22-09-2026 no traia 'pagos'.
    if (!base.pagos || typeof base.pagos !== 'object' || Array.isArray(base.pagos)) base.pagos = {};
  }
  // La llave del pago viene de afuera: se lee con hasOwnProperty, como los
  // diccionarios de js/demo-sala.js (SAST-12).
  function usada(llave) {
    return Object.prototype.hasOwnProperty.call(base.pagos, llave) && base.pagos[llave] === true;
  }
  function marcarUsada(llave) {
    Object.defineProperty(base.pagos, llave, { value: true, enumerable: true, writable: true, configurable: true });
  }
  recuperar();
  global.addEventListener('storage', function (e) {
    if (e.key === LLAVE) recuperar();
  });

  var lento = 200;   // se simula la latencia de la red
  function responder(data) {
    guardar();
    return new Promise(function (res) {
      setTimeout(function () { res({ data: data, error: null }); }, lento);
    });
  }
  function fallar(msg) {
    return new Promise(function (res) {
      setTimeout(function () { res({ data: null, error: { message: msg } }); }, lento);
    });
  }

  function codigoNuevo() {
    var letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', c = '';
    for (var i = 0; i < 6; i++) c += letras[Math.floor(Math.random() * letras.length)];
    return c;
  }

  function laConsulta(codigo, token) {
    var c = base.consultas[String(codigo || '').toUpperCase()];
    if (!c) return null;
    if (token != null && c.admin_token !== token) return null;
    return c;
  }

  // El orden natural de las unidades: si no, la 10 aparece antes que la 2.
  function porUnidad(a, b) {
    var na = parseInt(String(a.unidad).replace(/\D/g, ''), 10);
    var nb = parseInt(String(b.unidad).replace(/\D/g, ''), 10);
    if (isNaN(na) && isNaN(nb)) return String(a.unidad).localeCompare(String(b.unidad));
    if (isNaN(na)) return 1;
    if (isNaN(nb)) return -1;
    return na - nb;
  }

  function suma(lista, filtro) {
    return lista.reduce(function (s, d) {
      return s + (filtro(d) ? (Number(d.der) || 0) : 0);
    }, 0);
  }

  // --- Las funciones, con las mismas firmas que en Postgres -------------
  var FN = {
    // En el mismo orden que Postgres: el plazo, el tipo y recien despues el
    // pago.
    cc_crear: function (a) {
      recuperar();
      var fin = new Date(a.p_plazo_fin);
      if (!a.p_plazo_fin || isNaN(fin.getTime()) || fin <= new Date()) {
        return fallar('el plazo debe terminar en el futuro');
      }
      if (['ordinaria', 'ext-abs', 'ext-ref'].indexOf(a.p_tipo) < 0) {
        return fallar('tipo invalido');
      }
      // El candado del pago vive en Postgres y aquí no se puede reproducir:
      // esta demostración lo da por pagado. En producción, sin una llave
      // válida y sin usar, cc_crear responde 'pago_requerido'.
      if (!a.p_llave) return fallar('pago_requerido');
      // Lo que sí se reproduce: a diferencia del acta, el pago de la
      // consulta NO se comparte. Una llave abre una consulta, y la segunda
      // vez Postgres responde 'pago_ya_utilizado' (consulta-1.js entonces
      // borra la llave y pide otro pago). Antes la demostracion dejaba abrir
      // consultas sin fin con un solo pago, y decia que eso era la regla.
      // 'llave_de_otro_producto' no se simula: aqui la llave del acta y la
      // de la consulta son la misma marca.
      var orden = String(a.p_llave);
      if (usada(orden)) return fallar('pago_ya_utilizado');
      marcarUsada(orden);
      var cod = codigoNuevo();
      base.consultas[cod] = {
        id: 'demo-' + cod,
        codigo: cod,
        admin_token: 'token-' + cod,
        condominio: a.p_condominio || '',
        materia: a.p_materia || '',
        tipo_quorum: a.p_tipo,
        plazo_inicio: new Date().toISOString(),
        plazo_fin: a.p_plazo_fin,
        cerrada: false,
        info_fecha: a.p_info_fecha,
        info_modalidad: a.p_info_modalidad,
        info_asistentes: a.p_info_asistentes,
        info_observacion: a.p_info_observacion || '',
        creada_en: new Date().toISOString(),
        destinatarios: [],
        respuestas: {}          // destinatario_id -> { sentido, texto, recibida, resuelta }
      };
      return responder({ id: base.consultas[cod].id, codigo: cod, admin_token: 'token-' + cod });
    },

    cc_set_padron: function (a) {
      recuperar();
      var c = laConsulta(a.p_codigo, a.p_token);
      if (!c) return fallar('no autorizado');
      if (!Array.isArray(a.p_padron) || a.p_padron.length === 0) return fallar('padron invalido');
      // Como la base desde el 28-09-2026 (CN-028): ni cerrada ni con respuestas.
      if (c.cerrada) return fallar('consulta_cerrada');
      if (Object.keys(c.respuestas || {}).length) return fallar('consulta_con_respuestas');
      c.destinatarios = [];
      c.respuestas = {};
      var vistos = {};
      a.p_padron.forEach(function (p, i) {
        var correo = String(p.correo || '').trim().toLowerCase();
        if (!correo || vistos[correo]) return;   // una unidad por casilla
        vistos[correo] = 1;
        c.destinatarios.push({
          id: c.id + '-d' + i,
          unidad: String(p.unidad || ''),
          nombre: String(p.nombre || ''),
          rut: String(p.rut || ''),
          correo: correo,
          der: Number(p.der) || 0,
          habil: p.habil !== false
        });
      });
      return responder({ ok: true, cargados: c.destinatarios.length });
    },

    cc_estado: function (a) {
      recuperar();
      var c = laConsulta(a.p_codigo, a.p_token);
      if (!c) return fallar('no autorizado');
      var d = c.destinatarios, r = c.respuestas;
      var sentidoDe = function (x) { return (r[x.id] || {}).sentido || null; };
      return responder({
        codigo: c.codigo,
        condominio: c.condominio,
        materia: c.materia,
        tipo_quorum: c.tipo_quorum,
        plazo_inicio: c.plazo_inicio,
        plazo_fin: c.plazo_fin,
        cerrada: c.cerrada,
        info_fecha: c.info_fecha,
        info_modalidad: c.info_modalidad,
        info_asistentes: c.info_asistentes,
        info_observacion: c.info_observacion,
        convocados: d.length,
        universo: suma(d, function (x) { return x.habil; }),
        aprueba: suma(d, function (x) { return x.habil && sentidoDe(x) === 'aprueba'; }),
        rechaza: suma(d, function (x) { return x.habil && sentidoDe(x) === 'rechaza'; }),
        ambiguas: d.filter(function (x) { return sentidoDe(x) === 'ambigua'; }).length,
        sin_responder: d.filter(function (x) { return !r[x.id]; }).length
      });
    },

    cc_detalle: function (a) {
      recuperar();
      var c = laConsulta(a.p_codigo, a.p_token);
      if (!c) return fallar('no autorizado');
      var filas = c.destinatarios.slice().sort(porUnidad).map(function (d) {
        var r = c.respuestas[d.id] || {};
        return {
          id: d.id, unidad: d.unidad, nombre: d.nombre, correo: d.correo,
          der: d.der, habil: d.habil,
          sentido: r.sentido || null, texto: r.texto || null,
          recibida: r.recibida || null, resuelta: !!r.resuelta
        };
      });
      return responder(filas);
    },

    cc_resolver: function (a) {
      recuperar();
      if (['aprueba', 'rechaza'].indexOf(a.p_sentido) < 0) return fallar('sentido invalido');
      var c = laConsulta(a.p_codigo, a.p_token);
      if (!c) return fallar('no autorizado');
      var r = c.respuestas[a.p_destinatario];
      if (!r) return fallar('esa persona no ha respondido');
      r.sentido = a.p_sentido;
      r.resuelta = true;
      return responder({ ok: true });
    },

    cc_cerrar: function (a) {
      recuperar();
      var c = laConsulta(a.p_codigo, a.p_token);
      if (!c) return fallar('no autorizado');
      c.cerrada = true;
      return responder({ ok: true });
    },

    cc_mis_consultas: function () {
      recuperar();
      var lista = Object.keys(base.consultas).map(function (k) {
        var c = base.consultas[k];
        return {
          codigo: c.codigo, admin_token: c.admin_token,
          condominio: c.condominio, materia: String(c.materia).slice(0, 160),
          plazo_fin: c.plazo_fin, cerrada: c.cerrada, creada_en: c.creada_en
        };
      }).sort(function (x, y) { return String(y.creada_en).localeCompare(String(x.creada_en)); });
      return responder(lista);
    }
  };

  // --- Entrar ----------------------------------------------------------
  // Lo mismo que en js/demo-acta.js, que tiene la explicacion completa:
  // cuenta.js comprueba la clave actual entrando de nuevo con ella antes de
  // cambiarla (AUTH-05). Vale la cuenta simulada con cualquier clave de 8 o
  // mas caracteres; lo demas, "Invalid login credentials", como Supabase.
  function entrarConClave(datos) {
    var correo = String((datos && datos.email) || '').trim().toLowerCase();
    var clave = datos && datos.password;
    if (correo !== CUENTA.email || typeof clave !== 'string' || clave.length < 8) {
      return Promise.resolve({ data: { user: null, session: null },
                               error: { message: 'Invalid login credentials', status: 400 } });
    }
    SESION = sesionNueva();
    return Promise.resolve({ data: { session: SESION, user: SESION.user }, error: null });
  }
  // Codigo por correo, Google, crear cuenta, recuperar la clave: aqui no
  // hay a donde mandarlos. Un error, y cuenta.js dice "No pudimos...".
  function noEnDemostracion() {
    return Promise.resolve({ data: { user: null, session: null },
                             error: { message: 'no_disponible_en_demostracion' } });
  }

  // --- El cliente falso -------------------------------------------------
  global.supabase = {
    createClient: function () {
      return {
        rpc: function (nombre, args) {
          var f = FN[nombre];
          if (!f) return fallar('funcion_no_simulada: ' + nombre);
          return f(args || {});
        },
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: SESION }, error: null }); },
          getUser: function () { return Promise.resolve({ data: { user: SESION && SESION.user }, error: null }); },
          refreshSession: function () { return Promise.resolve({ data: { session: SESION }, error: null }); },
          signOut: function () { SESION = null; return Promise.resolve({ error: null }); },
          signInWithPassword: entrarConClave,
          signInWithOtp: noEnDemostracion,
          verifyOtp: noEnDemostracion,
          signUp: noEnDemostracion,
          resend: noEnDemostracion,
          resetPasswordForEmail: noEnDemostracion,
          signInWithOAuth: noEnDemostracion,
          // La clave no se guarda en ninguna parte: en produccion la recibe
          // Supabase, aqui se descarta. El nombre si, en la cuenta simulada.
          updateUser: function (datos) {
            if (!SESION) return Promise.resolve({ data: null, error: { message: 'no autorizado' } });
            if (datos && datos.data && datos.data.nombre) {
              SESION.user.user_metadata.nombre = String(datos.data.nombre);
            }
            return Promise.resolve({ data: { user: SESION.user }, error: null });
          },
          onAuthStateChange: function () { return { data: { subscription: { unsubscribe: function () {} } } }; }
        },
        channel: function () {
          return { on: function () { return this; }, subscribe: function () { return this; } };
        },
        removeChannel: function () {}
      };
    }
  };

  // --- La casilla de correo entrante, simulada --------------------------
  // Hace lo mismo que el Worker cuando recibe un correo: lee el texto, lo
  // pasa por el intérprete de verdad y registra el sentido que salga. La
  // regla también es la misma: ante la duda no se computa.
  function unaConsulta(codigo) {
    recuperar();
    var claves = Object.keys(base.consultas);
    if (codigo) return base.consultas[String(codigo).toUpperCase()] || null;
    if (claves.length === 0) return null;
    // La más reciente, que es la que la Mesa tiene abierta en pantalla.
    return claves.map(function (k) { return base.consultas[k]; })
                 .sort(function (x, y) { return String(y.creada_en).localeCompare(String(x.creada_en)); })[0];
  }

  function responderCorreo(correo, texto, codigo) {
    return import('/js/interprete-respuestas.js').then(function (m) {
      var c = unaConsulta(codigo);
      if (!c) return { ok: false, motivo: 'consulta_no_existe' };
      if (c.cerrada) return { ok: false, motivo: 'consulta_cerrada' };
      if (new Date() > new Date(c.plazo_fin)) return { ok: false, motivo: 'plazo_vencido' };

      var dir = String(correo || '').trim().toLowerCase();
      var d = c.destinatarios.filter(function (x) { return x.correo === dir; })[0];
      if (!d) return { ok: false, motivo: 'remitente_no_esta_en_el_padron' };

      var r = m.interpretarRespuesta(texto);
      c.respuestas[d.id] = {
        sentido: r.sentido, texto: String(texto || '').slice(0, 4000),
        recibida: new Date().toISOString(), resuelta: false
      };
      guardar();
      return { ok: true, unidad: d.unidad, sentido: r.sentido, motivo: r.motivo };
    });
  }

  // Simular la vuelta de la pasarela es un pago NUEVO. La llave es siempre
  // la misma marca, asi que lo que se renueva es que no se haya usado: sin
  // esto, despues de la primera consulta la demostracion quedaba sin pago
  // posible.
  var LLAVE_PAGO = 'consulta_pago_llave';
  var MARCA = 'DEMO-PAGO-SIMULADO';
  function pagoNuevo() {
    recuperar();
    if (Object.prototype.hasOwnProperty.call(base.pagos, MARCA)) delete base.pagos[MARCA];
    guardar();
    try { localStorage.setItem(LLAVE_PAGO, MARCA); } catch (e) {}
  }

  // Atajos para conducir la demostración desde la consola.
  global.DEMOC = {
    _fn: FN,                    // lo usa el simulador del acta para delegar
    sesion: function () { return SESION; },
    // Simula un correo entrante. El sentido lo decide el intérprete real.
    responder: responderCorreo,
    // Contesta de una vez por todo el padrón, para no escribir seis correos.
    // Las respuestas se reparten en orden y se repiten si faltan.
    responderTodos: function (textos, codigo) {
      var c = unaConsulta(codigo);
      if (!c) return Promise.resolve('no hay consulta creada');
      var lista = c.destinatarios.slice().sort(porUnidad);
      return Promise.all(lista.map(function (d, i) {
        return responderCorreo(d.correo, textos[i % textos.length], c.codigo);
      }));
    },
    padron: function (codigo) {
      var c = unaConsulta(codigo);
      return c ? c.destinatarios.slice().sort(porUnidad) : [];
    },
    estado: function (codigo) {
      var c = unaConsulta(codigo);
      return c ? JSON.parse(JSON.stringify(c)) : null;
    },
    reiniciar: function () {
      base = vacia(); guardar();
      try {
        localStorage.removeItem('cc_mesa');
        localStorage.removeItem(LLAVE_PAGO);
      } catch (e) {}
    },
    // Hace las veces de una vuelta desde la pasarela con el pago confirmado.
    pagar: function () {
      pagoNuevo();
      return 'pagado. Recargue el panel.';
    }
  };

  // El candado del pago está en Postgres, no aquí.
  //
  // La consulta por escrito es un servicio aparte, con su propia llave: la del
  // acta no sirve. En el panel se empieza sin pagar, porque ahí el pago es el
  // primer paso y es lo que se prueba; entrando directo a la consulta se da
  // por pagada, porque en el producto no se llega hasta aquí sin pagar.
  //
  // Esta escritura cae en demo_consulta_pago_llave: js/demo-aviso.js aparta
  // el almacenamiento de las páginas -demo. Antes caía en la casilla de
  // verdad, y /consulta/ la tomaba por una llave pagada.
  //
  // Si la casilla ya tiene la llave, es el mismo pago de antes: recargar no
  // regala otra consulta. Queda vacía cuando consulta-1.js la borra tras un
  // 'pago_ya_utilizado', y entonces entrar de nuevo es un pago nuevo.
  try {
    if (!/\/cuenta/.test(global.location.pathname) &&
        !localStorage.getItem(LLAVE_PAGO)) {
      pagoNuevo();
    }
  } catch (e) {}

  console.info('Simulador de consulta escrita activo. Use DEMOC.* para conducirla.');

})(window);
