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

  function vacia() {
    return { consultas: {} };   // codigo -> { ...campos, destinatarios[], respuestas{} }
  }

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(base)); } catch (e) {}
  }
  function recuperar() {
    try {
      var g = JSON.parse(localStorage.getItem(LLAVE));
      base = (g && g.consultas) ? g : vacia();
    } catch (e) { base = vacia(); }
    // Las llaves usadas se fueron con el paso 17: la consulta se crea con
    // el mes del condominio (js/demo-aviso.js, DEMO_MES).
    if (base.pagos) delete base.pagos;
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
    // En el mismo orden que Postgres: la sesion, el plazo, el tipo y recien
    // despues el mes.
    cc_crear: function (a) {
      recuperar();
      var fin = new Date(a.p_plazo_fin);
      if (!a.p_plazo_fin || isNaN(fin.getTime()) || fin <= new Date()) {
        return fallar('el plazo debe terminar en el futuro');
      }
      if (['ordinaria', 'ext-abs', 'ext-ref'].indexOf(a.p_tipo) < 0) {
        return fallar('tipo invalido');
      }
      // El candado del mes vive en Postgres (cc_crear -> pase_exigir): la
      // consulta se crea si la cuenta tiene un mes vigente para su
      // condominio. Aqui contesta js/demo-aviso.js con la misma regla.
      var sinMes = global.DEMO_MES ? global.DEMO_MES.exigir(a.p_condominio) : 'pase_requerido';
      if (sinMes) return fallar(sinMes);
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
      if (r.sentido !== 'ambigua') return fallar('respuesta_ya_resuelta');
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
          var f = FN[nombre] || (global.DEMO_MES && global.DEMO_MES.fn[nombre]);
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
      try { localStorage.removeItem('cc_mesa'); } catch (e) {}
    },
    // Hace las veces de un pago confirmado: un mes para ese condominio.
    pagar: function (condominio) {
      var m = global.DEMO_MES && global.DEMO_MES.activar(condominio || 'Condominio Las Araucarias');
      return m ? 'mes activo para ' + m.condominio + '. Recargue la página.' : 'escriba el condominio';
    }
  };

  // El candado del mes está en Postgres, no aquí. En la demostración lo
  // lleva js/demo-aviso.js (DEMO_MES): fuera del panel, la demostración
  // trae un mes activo para el condominio de los datos de ejemplo.

  console.info('Simulador de consulta escrita activo. Use DEMOC.* para conducirla.');

})(window);
