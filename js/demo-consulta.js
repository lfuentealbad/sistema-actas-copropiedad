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
 *  Solo corre en localhost: si llegara a producción, se ignora solo.
 * ===================================================================== */
(function (global) {
  'use strict';

  var enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname);
  if (!enLocal) {
    console.warn('El simulador de consulta solo funciona en local. Ignorado.');
    return;
  }

  // --- La cuenta de la Mesa --------------------------------------------
  // Cuenta.usuario() solo mira la sesión, así que con esto el portero de la
  // página deja pasar. En producción la sesión la emite Supabase.
  var SESION = {
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'administracion@ejemplo.cl',
      user_metadata: { nombre: 'Elena Pizarro' }
    }
  };

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
    cc_crear: function (a) {
      recuperar();
      // El candado del pago vive en Postgres y aquí no se puede reproducir:
      // esta demostración lo da por pagado. En producción, sin una llave
      // válida y sin usar, cc_crear responde 'pago_requerido'.
      if (!a.p_llave) return fallar('pago_requerido');
      if (new Date(a.p_plazo_fin) <= new Date()) {
        return fallar('el plazo debe terminar en el futuro');
      }
      if (['ordinaria', 'ext-abs', 'ext-ref'].indexOf(a.p_tipo) < 0) {
        return fallar('tipo invalido');
      }
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
      // Un pago cubre TODA la asamblea: el acta, la sala y la consulta por
      // escrito. La llave no se borra; en Postgres se marca usada y se deja
      // pasar mientras sea la misma cuenta ('pago_de_otra_cuenta' si no).
      return responder({ id: base.consultas[cod].id, codigo: cod, admin_token: 'token-' + cod });
    },

    cc_set_padron: function (a) {
      recuperar();
      var c = laConsulta(a.p_codigo, a.p_token);
      if (!c) return fallar('no autorizado');
      if (!Array.isArray(a.p_padron) || a.p_padron.length === 0) return fallar('padron invalido');
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
          getUser: function () { return Promise.resolve({ data: { user: SESION.user }, error: null }); },
          signOut: function () { SESION = null; return Promise.resolve({ error: null }); },
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
      try {
        localStorage.removeItem('cc_mesa');
        localStorage.removeItem('consulta_pago_llave');
      } catch (e) {}
    },
    // Hace las veces de una vuelta desde la pasarela con el pago confirmado.
    pagar: function () {
      try { localStorage.setItem('consulta_pago_llave', 'DEMO-PAGO-SIMULADO'); } catch (e) {}
      return 'pagado. Recargue el panel.';
    }
  };

  // El candado del pago está en Postgres, no aquí.
  //
  // La consulta por escrito es un servicio aparte, con su propia llave: la del
  // acta no sirve. En el panel se empieza sin pagar, porque ahí el pago es el
  // primer paso y es lo que se prueba; entrando directo a la consulta se da
  // por pagada, porque en el producto no se llega hasta aquí sin pagar.
  try {
    if (!/\/cuenta/.test(global.location.pathname) &&
        !localStorage.getItem('consulta_pago_llave')) {
      localStorage.setItem('consulta_pago_llave', 'DEMO-PAGO-SIMULADO');
    }
  } catch (e) {}

  console.info('Simulador de consulta escrita activo. Use DEMOC.* para conducirla.');

})(window);
