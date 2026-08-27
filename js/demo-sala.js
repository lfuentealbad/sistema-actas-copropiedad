/* =====================================================================
 *  Simulador de la sala de votación  —  SOLO PARA DEMOSTRACIÓN
 *
 *  Reemplaza a Supabase por una base en memoria que implementa las mismas
 *  funciones vv_*, con las mismas formas de entrada y salida. El código de
 *  la sala (js/votacion-1.js) corre sin una sola modificación.
 *
 *  Guarda varias asambleas, no una sola: así el acta puede crear la suya
 *  con su propio padrón y el teléfono entrar a ella con su código, que es
 *  como funciona de verdad. Viene con una ya hecha, DEMO01, para poder
 *  entrar sin pasar antes por el acta.
 *
 *  Sirve para ver la sala funcionando sin crear una asamblea de verdad,
 *  que hoy exige un pago validado en Postgres.
 *
 *  Solo corre en localhost: si llegara a producción, se ignora solo.
 * ===================================================================== */
(function (global) {
  'use strict';

  // Cortafuegos: esto solo puede correr en local. Si por descuido llegara a
  // producción, no hace nada y la sala usa Supabase como corresponde.
  var enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname);
  if (!enLocal) {
    console.warn('El simulador de sala solo funciona en local. Ignorado.');
    return;
  }

  // --- La asamblea de ejemplo, con el mismo padrón del DEMO del acta ----
  var CODIGO = 'DEMO01';
  var TOKEN  = 'token-de-demostracion';

  var PADRON_DEMO = [
    { rut: '123456785',  nombre: 'María González Pérez',    unidad: '101', habil: true,  der: 5.25 },
    { rut: '112223339',  nombre: 'Juan Sepúlveda Rojas',    unidad: '102', habil: true,  der: 4.80 },
    { rut: '156789011',  nombre: 'Ana Castro Muñoz',        unidad: '201', habil: false, der: 5.10 },
    { rut: '98765433',   nombre: 'Carlos Vega Soto',        unidad: '202', habil: true,  der: 4.75 },
    { rut: '8765432k',   nombre: 'Patricia Soto López',     unidad: '301', habil: true,  der: 5.40 },
    { rut: '101112225',  nombre: 'Rodrigo Fernández Tapia', unidad: '302', habil: true,  der: 4.95 }
  ];

  function normalizarRut(r) {
    return String(r || '').toLowerCase().replace(/[.\s-]/g, '');
  }

  function salaNueva(codigo, token, titulo, padron) {
    return {
      codigo: codigo, token: token, titulo: titulo || '',
      abierta: false, punto: '',
      padron: padron || [],
      votos: {}          // punto -> { rut: 'favor' | 'contra' | 'abst' }
    };
  }

  // Se guarda entre recargas, para que la Mesa y el votante que están en dos
  // pestañas distintas vean lo mismo.
  var LLAVE = 'demo_sala_estado';
  var base = { salas: {}, ultima: CODIGO };

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(base)); } catch (e) {}
  }
  function recuperar() {
    try {
      var g = JSON.parse(localStorage.getItem(LLAVE));
      if (g && g.salas) base = g;
    } catch (e) {}
    if (!base.salas) base = { salas: {}, ultima: CODIGO };
    if (!base.salas[CODIGO]) {
      base.salas[CODIGO] = salaNueva(CODIGO, TOKEN, 'Condominio Las Araucarias',
                                     JSON.parse(JSON.stringify(PADRON_DEMO)));
    }
  }
  recuperar();
  guardar();

  // Si otra pestaña cambia el estado, esta se entera: es lo que hace que la
  // Mesa y el teléfono se vean en vivo.
  global.addEventListener('storage', function (e) {
    if (e.key === LLAVE) recuperar();
  });

  function laSala(codigo) {
    recuperar();
    return base.salas[String(codigo || '').toUpperCase()] || null;
  }
  function actual() {
    recuperar();
    return base.salas[base.ultima] || base.salas[CODIGO];
  }
  function buscar(sala, rut) {
    var n = normalizarRut(rut);
    for (var i = 0; i < sala.padron.length; i++) {
      if (sala.padron[i].rut === n) return sala.padron[i];
    }
    return null;
  }
  function codigoNuevo() {
    var A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
    for (var i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }

  var lento = 180;   // se simula la latencia de la red, para que se note real
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

  // --- Las funciones, con las mismas firmas que en Postgres -------------
  var FN = {
    vv_estado: function (a) {
      var s = laSala(a.p_codigo);
      if (!s) return responder({ existe: false });
      return responder({ existe: true, titulo: s.titulo, abierta: s.abierta, punto: s.punto });
    },

    vv_identificar: function (a) {
      var s = laSala(a.p_codigo);
      if (!s) return responder({ existe: false });
      var p = buscar(s, a.p_rut);
      if (!p) return responder({ existe: false });
      return responder({
        existe: true, rut: p.rut, nombre: p.nombre,
        unidad: p.unidad, habil: p.habil, der: p.der
      });
    },

    vv_mi_voto: function (a) {
      var s = laSala(a.p_codigo);
      if (!s) return responder({ choice: null });
      return responder({ choice: (s.votos[a.p_punto] || {})[normalizarRut(a.p_rut)] || null });
    },

    vv_emitir: function (a) {
      var s = laSala(a.p_codigo);
      if (!s) return fallar('asamblea_no_existe');
      if (!s.abierta) return fallar('votacion_cerrada');
      var p = buscar(s, a.p_rut);
      if (!p) return fallar('no_esta_en_el_padron');
      if (!p.habil) return fallar('inhabil');
      if (!s.votos[a.p_punto]) s.votos[a.p_punto] = {};
      s.votos[a.p_punto][p.rut] = a.p_choice;
      return responder({ ok: true });
    },

    vv_abrir: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      s.punto = a.p_punto; s.abierta = true;
      return responder({ ok: true });
    },

    vv_cerrar: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      s.abierta = false;
      return responder({ ok: true });
    },

    // Misma forma que en Postgres: solo { votos: [{rut, choice}] }. El
    // tablero de la Mesa cruza eso con el padrón que ya tiene en memoria.
    vv_resultados: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      var emitidos = s.votos[a.p_punto] || {};
      var votos = Object.keys(emitidos).map(function (rut) {
        return { rut: rut, choice: emitidos[rut] };
      });
      return responder({ votos: votos });
    },

    vv_reanudar: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      var puntos = Object.keys(s.votos).filter(function (k) { return k !== ''; });
      return responder({
        asamblea: {
          id: 'demo-' + s.codigo, codigo: s.codigo, titulo: s.titulo,
          punto: s.punto, abierta: s.abierta
        },
        padron: s.padron.map(function (p) {
          return {
            rut: p.rut, nombre: p.nombre, unidad: p.unidad,
            habil: p.habil, der: p.der
          };
        }),
        puntos: puntos
      });
    },

    // El candado del pago vive en Postgres y aquí no se puede reproducir:
    // esta demostración da la asamblea por pagada. En producción, sin una
    // llave válida y sin usar, vv_crear responde 'pago_requerido'.
    vv_crear: function (a) {
      if (!a.p_llave) return fallar('pago_requerido');
      recuperar();
      var cod = codigoNuevo();
      base.salas[cod] = salaNueva(cod, 'token-' + cod, a.p_titulo || '', []);
      base.ultima = cod;
      // Un pago cubre TODA la asamblea: el acta, la sala y la consulta por
      // escrito. La llave no se borra; en Postgres se marca usada y se deja
      // pasar mientras sea la misma cuenta ('pago_de_otra_cuenta' si no).
      return responder({ id: 'demo-' + cod, codigo: cod, admin_token: 'token-' + cod });
    },

    vv_set_padron: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      var vistos = {};
      s.padron = [];
      (a.p_padron || []).forEach(function (p) {
        var rut = normalizarRut(p.rut);
        if (!rut || vistos[rut]) return;
        vistos[rut] = 1;
        s.padron.push({
          rut: rut, nombre: p.nombre || '', unidad: p.unidad || '',
          habil: p.habil !== false, der: Number(p.der) || 0,
          correo: p.correo || ''
        });
      });
      return responder({ ok: true, n: s.padron.length });
    },

    vv_borrar: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      delete base.salas[s.codigo];
      if (base.ultima === s.codigo) base.ultima = CODIGO;
      return responder({ ok: true });
    },

    // La medición de uso. En la demostración no se guarda nada.
    vv_log: function () { return responder({ ok: true }); }
  };

  global.supabase = {
    createClient: function () {
      return {
        rpc: function (nombre, args) {
          var f = FN[nombre];
          if (!f) return fallar('funcion_no_simulada: ' + nombre);
          return f(args || {});
        },
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: null } }); },
          signOut: function () { return Promise.resolve({}); }
        },
        channel: function () {
          return { on: function () { return this; }, subscribe: function () { return this; } };
        },
        removeChannel: function () {}
      };
    }
  };

  // Atajos para conducir la demostración desde la consola o desde la Mesa.
  // Sin código, actúan sobre la última asamblea creada.
  global.DEMO = {
    _fn: FN,                    // lo usa el simulador del acta para delegar
    codigo: CODIGO,
    token: TOKEN,
    padron: function (cod) { var s = cod ? laSala(cod) : actual(); return s ? s.padron : []; },
    salas: function () { recuperar(); return Object.keys(base.salas); },
    abrir: function (punto, cod) {
      var s = cod ? laSala(cod) : actual(); if (!s) return 'no existe';
      s.punto = punto; s.abierta = true; guardar(); return s.codigo;
    },
    cerrar: function (cod) {
      var s = cod ? laSala(cod) : actual(); if (!s) return 'no existe';
      s.abierta = false; guardar(); return s.codigo;
    },
    votar: function (rut, punto, cual, cod) {
      var s = cod ? laSala(cod) : actual(); if (!s) return 'no existe';
      var p = buscar(s, rut); if (!p) return 'no está en el padrón';
      if (!p.habil) return p.nombre + ' es inhábil: no puede votar';
      if (!s.votos[punto]) s.votos[punto] = {};
      s.votos[punto][p.rut] = cual; guardar();
      return p.nombre + ' votó ' + cual;
    },
    estado: function (cod) {
      var s = cod ? laSala(cod) : actual();
      return s ? JSON.parse(JSON.stringify(s)) : null;
    },
    reiniciar: function () {
      base = { salas: {}, ultima: CODIGO };
      recuperar(); guardar();
    }
  };

  console.info('Simulador de sala activo. Código de ejemplo: ' + CODIGO + '. Use DEMO.* para conducirla.');

})(window);
