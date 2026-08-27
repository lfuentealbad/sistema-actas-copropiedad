/* =====================================================================
 *  Simulador del acta de asamblea  —  SOLO PARA DEMOSTRACIÓN
 *
 *  Se apoya en js/demo-sala.js, que tiene que cargarse antes: de ahí toma
 *  las funciones vv_* y les agrega lo que el acta necesita y la sala no:
 *  la sesión de la cuenta, la tabla actas_guardadas y ac_finalizar.
 *
 *  Así la demostración recorre el circuito completo — armar el acta,
 *  abrir la sala con su padrón, votar desde el teléfono y cerrar el acta
 *  con folio — sin pasarela de pago, que hoy está cerrada a propósito.
 *
 *  Lo único que aquí se finge es el cobro. En producción el folio lo pone
 *  Postgres y solo si la llave del pago es válida y no se ha usado: dos
 *  triggers reponen 'pagada' y 'folio' si alguien los escribe a mano.
 *
 *  Solo corre en localhost: si llegara a producción, se ignora solo.
 * ===================================================================== */
(function (global) {
  'use strict';

  var enLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(global.location.hostname);
  if (!enLocal) {
    console.warn('El simulador del acta solo funciona en local. Ignorado.');
    return;
  }

  var salaFN = (global.DEMO && global.DEMO._fn) || null;
  if (!salaFN) {
    console.error('Falta js/demo-sala.js: cárguelo antes que este archivo.');
    return;
  }
  // La consulta por escrito es opcional: solo la carga el panel de la cuenta,
  // que muestra las tres cosas juntas.
  var consultaFN = (global.DEMOC && global.DEMOC._fn) || {};

  // --- La cuenta de la Mesa --------------------------------------------
  var SESION = {
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'administracion@ejemplo.cl',
      user_metadata: { nombre: 'Elena Pizarro' }
    }
  };

  var LLAVE = 'demo_actas_guardadas';
  var actas = [];
  var correlativo = 1;

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify({ actas: actas, correlativo: correlativo })); } catch (e) {}
  }
  function recuperar() {
    try {
      var g = JSON.parse(localStorage.getItem(LLAVE));
      if (g && Array.isArray(g.actas)) { actas = g.actas; correlativo = g.correlativo || 1; }
    } catch (e) {}
  }
  recuperar();

  var lento = 200;
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

  function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, function () {
      return Math.floor(Math.random() * 16).toString(16);
    });
  }

  // --- La tabla actas_guardadas ----------------------------------------
  // Un constructor de consultas mínimo: solo las cadenas que usa el acta.
  //   insert(fila).select('id')
  //   update(fila).eq('id', id).select('id')
  //   select(campos).eq('id', id).single()
  // No pretende ser PostgREST; pretende que acta-1.js corra sin tocarlo.
  function tabla(nombre) {
    if (nombre !== 'actas_guardadas') {
      return promesaDe(function () { return fallar('tabla_no_simulada: ' + nombre); });
    }

    var q = { accion: null, fila: null, id: null, unico: false };

    var api = {
      insert: function (fila) { q.accion = 'insert'; q.fila = fila; return api; },
      update: function (fila) { q.accion = 'update'; q.fila = fila; return api; },
      select: function () { if (!q.accion) q.accion = 'select'; return api; },
      delete: function () { q.accion = 'delete'; return api; },
      eq: function (col, val) { if (col === 'id') q.id = val; return api; },
      single: function () { q.unico = true; return api; },
      then: function (ok, mal) { return ejecutar(q).then(ok, mal); }
    };
    return api;
  }

  function promesaDe(f) { return { then: function (ok, mal) { return f().then(ok, mal); } }; }

  function ejecutar(q) {
    recuperar();
    var i, fila;

    if (q.accion === 'insert') {
      // El tope de 100 actas por cuenta es una regla de la base, no del
      // navegador. Se respeta aquí para que se vea el mismo mensaje.
      if (actas.length >= 100) return fallar('tope_de_actas');
      fila = {
        id: uuid(),
        dueno: SESION.user.id,
        titulo: q.fila.titulo || '',
        fecha_sesion: q.fila.fecha_sesion || null,
        contenido: q.fila.contenido,
        pagada: false,        // los triggers de Postgres imponen esto
        folio: null,
        actualizada: new Date().toISOString()
      };
      actas.push(fila);
      return responder([{ id: fila.id }]);
    }

    if (q.accion === 'update') {
      for (i = 0; i < actas.length; i++) {
        if (actas[i].id === q.id) {
          // Se copia solo lo que el navegador puede tocar: 'pagada' y
          // 'folio' no están en esta lista, igual que en la base.
          if (q.fila.titulo != null) actas[i].titulo = q.fila.titulo;
          if (q.fila.fecha_sesion !== undefined) actas[i].fecha_sesion = q.fila.fecha_sesion;
          if (q.fila.contenido != null) actas[i].contenido = q.fila.contenido;
          actas[i].actualizada = new Date().toISOString();
          return responder([{ id: actas[i].id }]);
        }
      }
      return responder([]);
    }

    if (q.accion === 'select') {
      var halladas = actas.filter(function (a) { return !q.id || a.id === q.id; });
      if (q.unico) {
        return halladas.length
          ? responder(halladas[0])
          : fallar('JSON object requested, multiple (or no) rows returned');
      }
      return responder(halladas);
    }

    if (q.accion === 'delete') {
      actas = actas.filter(function (a) { return a.id !== q.id; });
      return responder([]);
    }

    return fallar('consulta_no_simulada');
  }

  // --- Las funciones del acta ------------------------------------------
  var FN = {
    // Aquí se cobra. En producción esta función valida la firma de la llave
    // del pago, la marca como usada y recién entonces emite el folio.
    ac_finalizar: function (a) {
      recuperar();
      var acta = actas.filter(function (x) { return x.id === a.p_acta; })[0];
      if (!acta) return fallar('acta_no_encontrada');
      if (acta.pagada) return responder({ folio: acta.folio, ya_estaba: true });
      if (!a.p_llave) return fallar('pago_requerido');

      var folio = 'AV-' + new Date().getFullYear() + '-' +
                  String(correlativo++).padStart(6, '0');
      acta.pagada = true;
      acta.folio = folio;
      acta.finalizada_en = new Date().toISOString();
      // Un pago cubre TODA la asamblea: el acta, la sala y la consulta por
      // escrito. La llave no se borra; en Postgres se marca usada y se deja
      // pasar mientras sea la misma cuenta ('pago_de_otra_cuenta' si no).
      return responder({ folio: folio, ya_estaba: false });
    },

    ac_mis_actas: function () {
      recuperar();
      return responder(actas.slice().sort(function (x, y) {
        return String(y.actualizada).localeCompare(String(x.actualizada));
      }).map(function (a) {
        return {
          id: a.id, titulo: a.titulo, fecha_sesion: a.fecha_sesion,
          actualizada: a.actualizada, pagada: a.pagada, folio: a.folio
        };
      }));
    },

    ac_borrar: function (a) {
      recuperar();
      actas = actas.filter(function (x) { return x.id !== a.p_acta; });
      return responder({ ok: true });
    },

    // El historial de pagos del panel. Cada acta finalizada dejó su rastro;
    // 'activa' dice si la sala de esa asamblea todavía existe, y pasa a false
    // cuando el barrido de 48 horas la borra.
    vv_mis_pagos: function () {
      recuperar();
      // La sala se crea con el nombre del condominio, que es el mismo titulo
      // que lleva el acta: por ahi se sabe cual sigue abierta.
      var abiertas = {};
      ((global.DEMO && global.DEMO.salas && global.DEMO.salas()) || []).forEach(function (cod) {
        var s = global.DEMO.estado(cod);
        if (s && s.titulo) abiertas[s.titulo] = true;
      });
      return responder(actas.filter(function (a) { return a.pagada; })
        .map(function (a) {
          return {
            titulo: a.titulo || 'Asamblea sin nombre',
            creado: a.finalizada_en || a.actualizada,
            activa: !!abiertas[a.titulo]
          };
        }));
    }
  };

  // --- El cliente falso -------------------------------------------------
  // Lo que no sea del acta se delega a la sala: así una sola pestaña puede
  // armar el acta y abrir su sala de votación, que es como se usa.
  global.supabase = {
    createClient: function () {
      return {
        rpc: function (nombre, args) {
          var f = FN[nombre] || salaFN[nombre] || consultaFN[nombre];
          if (!f) return fallar('funcion_no_simulada: ' + nombre);
          return f(args || {});
        },
        from: tabla,
        auth: {
          getSession: function () { return Promise.resolve({ data: { session: SESION }, error: null }); },
          getUser: function () { return Promise.resolve({ data: { user: SESION.user }, error: null }); },
          signOut: function () { SESION = null; return Promise.resolve({ error: null }); },
          // Guardar el nombre y cambiar la clave. La clave no se guarda en
          // ninguna parte: en producción la recibe Supabase, aquí se descarta.
          // Lo que sí es de verdad es la revisión contra HaveIBeenPwned, que
          // hace el Worker antes de llegar hasta acá.
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

  function darPorPagado() {
    try { localStorage.setItem('acta_pago_llave', 'DEMO-PAGO-SIMULADO'); } catch (e) {}
  }

  global.DEMOA = {
    sesion: function () { return SESION; },
    actas: function () { recuperar(); return JSON.parse(JSON.stringify(actas)); },
    // Hace las veces de una vuelta desde la pasarela con el pago confirmado.
    pagar: function () { darPorPagado(); return 'pagado. Recargue el panel.'; },
    reiniciar: function () {
      actas = []; correlativo = 1; guardar();
      try { localStorage.removeItem('acta_pago_llave'); } catch (e) {}
    }
  };

  // El candado del pago está en Postgres, no aquí.
  //
  // En el panel se empieza SIN pagar, porque el pago es justamente lo que ahí
  // se prueba: el botón dirá que la pasarela no está habilitada, que es la
  // verdad hoy. Para seguir adelante, DEMOA.pagar() y recargar.
  //
  // En el acta, en cambio, se entra ya pagada: en el producto no se llega al
  // asistente sin haber pasado por el pago.
  if (!/\/cuenta/.test(global.location.pathname)) darPorPagado();

  console.info('Simulador del acta activo. Use DEMOA.* para inspeccionarlo.');

})(window);
