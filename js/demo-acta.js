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
 *  Postgres y solo si la cuenta tiene un mes vigente para el condominio del
 *  acta (paso 17): 'pagada', 'folio' y 'orden' no están entre las columnas
 *  que el navegador tiene permiso de escribir, así que solo las mueve
 *  ac_finalizar. El mes de la demostración lo lleva js/demo-aviso.js
 *  (DEMO_MES), con la misma regla.
 *
 *  El folio que entrega este simulador es DEMO-000001, DEMO-000002... y el
 *  código de verificación, siempre DEMO-0000-0000. Hasta septiembre de 2026
 *  eran AV-2026-000001, la misma forma de un folio real: un acta bajada de
 *  la demostración, con la franja borrada, pasaba por emitida (AUTH-01).
 *  Ahora ni el folio ni el código tienen la forma de uno verdadero, y
 *  /verificar los reconoce como de demostración.
 *
 *  Del mes se reproduce lo que la base decide con él: sin mes,
 *  'pase_requerido'; con el mes de otro condominio, 'pase_de_otro_condominio'.
 *  Lo que no se reproduce es la purga de C5: en
 *  producción un cron reemplaza el contenido de un acta emitida por
 *  {"purgado": true} a los 180 días. Aquí no corre ningún cron, y ninguna
 *  respuesta del simulador trae ese contenido.
 *
 *  (Este simulador copia solo las columnas editables, que es justo lo que
 *  hacen los privilegios de columna. Ojo: por eso mismo NO puede detectar
 *  fallas del lado de Postgres —como el trigger que hasta el 27-08-2026
 *  revertía la finalización—; eso lo vigila Pruebas/prueba-sellado-actas.mjs
 *  leyendo el .sql.)
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
    console.warn('El simulador del acta solo funciona en las páginas de demostración. Ignorado.');
    return;
  }
  // Sin el aviso no hay demostración. En produccion llego a servirse
  // /acta-demo con js/demo-aviso.js en 404, y el simulador arranco igual:
  // un asistente identico al real, sin franja, que terminaba en un acta con
  // folio. Ahora el aviso tiene que haber corrido antes (el generador lo
  // pone primero); si no esta, aqui no se finge nada y la pagina queda sin
  // cliente. Eso tambien cierra la vitrina: una pagina real no carga el
  // aviso, asi que ahi el simulador ya no arranca aunque alguien lo sume.
  // En localhost se deja correr sin el, que es el escritorio de quien
  // desarrolla.
  if (!enLocal && !(global.DEMO_AVISO && global.DEMO_AVISO.activo)) {
    console.error('Falta js/demo-aviso.js antes de este archivo: sin el aviso, la demostración no arranca.');
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
  // Con su access_token: las paginas lo piden con Cuenta.tokenDeAcceso()
  // para llamar al cobro (/api/pago/*), y sin el se quedarian pidiendo que
  // la persona inicie sesion. No es un JWT ni sirve fuera de aqui: el cobro
  // de la demostracion lo contesta js/demo-aviso.js, que compara contra este
  // mismo valor, y al Worker de verdad no llega. Es el mismo que usa el
  // simulador de la consulta, porque el panel carga los dos.
  //
  // La cuenta va aparte de la sesion: "No soy yo" en el acta cierra la
  // sesion sin recargar, y volver a entrar con la clave (signInWithPassword)
  // tiene que encontrar la misma cuenta, con el nombre que se le haya puesto.
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

  // Sin sesion, PostgREST atiende como anon, y anon no tiene permiso sobre
  // actas_guardadas ni sobre las funciones de la cuenta: la base responde
  // "permission denied", no una lista vacia.
  function sinPermiso(objeto) {
    return fallar('permission denied for ' + objeto);
  }

  // El codigo de verificacion de toda acta de demostracion. Uno real son
  // doce caracteres hexadecimales; este tiene letras que no lo son.
  var CODIGO_DEMO = 'DEMO-0000-0000';

  var LLAVE = 'demo_actas_guardadas';
  var actas = [];
  var correlativo = 1;

  function guardar() {
    try {
      localStorage.setItem(LLAVE, JSON.stringify({ actas: actas, correlativo: correlativo }));
    } catch (e) {}
  }
  // Quien uso la demostracion antes de septiembre de 2026 tiene guardadas
  // actas con folio AV-2026-000001, la forma de uno real. Se rebautizan al
  // leerlas: el numero se conserva, el prefijo no.
  function sinFolioReal(a) {
    if (a && a.folio && !/^DEMO-/.test(a.folio)) {
      a.folio = 'DEMO-' + String(a.folio).replace(/\D/g, '').slice(-6).padStart(6, '0');
      a.codigo = CODIGO_DEMO;
    }
    return a;
  }
  function recuperar() {
    try {
      var g = JSON.parse(localStorage.getItem(LLAVE));
      if (g && Array.isArray(g.actas)) {
        actas = g.actas.map(sinFolioReal);
        correlativo = g.correlativo || 1;
      }
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
    // El panel solo lista las actas del comité: a la demo le basta una
    // tabla vacía, que muestra el estado inicial con su botón.
    // Los métodos de filtro y orden aceptan y devuelven el mismo objeto,
    // como el cliente real: sin .order() aquí, el panel quedaba esperando
    // una promesa que nunca resolvía.
    if (nombre === 'actas_comite') {
      var apiC = {
        select: function () { return apiC; },
        delete: function () { return apiC; },
        insert: function () { return apiC; },
        eq: function () { return apiC; },
        is: function () { return apiC; },
        order: function () { return apiC; },
        limit: function () { return apiC; },
        then: function (ok, mal) { return Promise.resolve({ data: [], error: null }).then(ok, mal); }
      };
      return apiC;
    }

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
      is: function () { return api; },
      order: function () { return api; },
      limit: function () { return api; },
      single: function () { q.unico = true; return api; },
      then: function (ok, mal) { return ejecutar(q).then(ok, mal); }
    };
    return api;
  }

  function promesaDe(f) { return { then: function (ok, mal) { return f().then(ok, mal); } }; }

  function ejecutar(q) {
    if (!SESION) return sinPermiso('table actas_guardadas');
    recuperar();
    var i, fila;

    if (q.accion === 'insert') {
      // El tope de 100 actas por cuenta es una regla de la base, no del
      // navegador. Se respeta aquí para que se vea el mismo mensaje.
      if (actas.length >= 100) return fallar('tope_de_actas');
      fila = {
        id: uuid(),
        dueno: CUENTA.id,
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
          // Un acta finalizada ya no se edita: la politica de UPDATE exige
          // folio IS NULL. Como en PostgREST, la fila simplemente no entra
          // en el filtro y la respuesta es una lista vacia, sin error.
          if (actas[i].folio) return responder([]);
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

  // El resumen publico que acompana al folio. Se rechaza lo mismo que
  // rechaza ac_resumen_limpio -ni mas ni menos- para que un asistente que
  // mande otra cosa falle tambien en la demostracion, y no recien en
  // produccion; y para que la demostracion no rechace lo que la base acepta.
  //   * un objeto;
  //   * su texto jsonb no pasa de 16 KB + 1 KB. El jsonb pone un espacio
  //     despues de cada ':' y de cada ',', que JSON.stringify no pone: se
  //     suman aparte (espaciosJsonb);
  //   * 'acuerdos', si viene, es un arreglo de a lo sumo 60. Si viene en
  //     null tambien se rechaza: alla p->'acuerdos' es el jsonb null, no un
  //     valor ausente. Lo que traiga cada acuerdo no hace fallar: la base
  //     toma de cada uno lo que sirve y descarta el resto.
  // Se revisa lo que viajaria, JSON.stringify de ida y vuelta: una llave en
  // undefined no llega a la base.
  function espaciosJsonb(v) {
    var n = 0, i, k;
    if (Array.isArray(v)) {
      for (i = 0; i < v.length; i++) n += espaciosJsonb(v[i]);
      return n + Math.max(v.length - 1, 0);
    }
    if (v && typeof v === 'object') {
      k = Object.keys(v);
      for (i = 0; i < k.length; i++) n += espaciosJsonb(v[k[i]]);
      return n + k.length + Math.max(k.length - 1, 0);
    }
    return 0;
  }
  function resumenValido(r) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
    var texto, viaja;
    try { texto = JSON.stringify(r); viaja = JSON.parse(texto); } catch (e) { return false; }
    var bytes = typeof TextEncoder === 'function'
      ? new TextEncoder().encode(texto).length
      : unescape(encodeURIComponent(texto)).length;
    if (bytes + espaciosJsonb(viaja) > 16384 + 1024) return false;
    if (Object.prototype.hasOwnProperty.call(viaja, 'acuerdos')) {
      if (!Array.isArray(viaja.acuerdos) || viaja.acuerdos.length > 60) return false;
    }
    return true;
  }

  // --- Las funciones del acta ------------------------------------------
  var FN = {
    // Aquí se cobra. En producción esta función exige un mes vigente para
    // el condominio del resumen (pase_exigir), deja la huella y el resumen
    // en actas_emitidas y recién entonces emite el folio. Misma firma que en
    // Postgres: (p_acta, p_huella, p_resumen), y las comprobaciones en el
    // mismo orden que allá: el acta, si ya estaba, la huella, el resumen y
    // recién después el mes.
    ac_finalizar: function (a) {
      // ac_finalizar se concede solo a authenticated.
      if (!SESION) return sinPermiso('function ac_finalizar');
      recuperar();
      var acta = actas.filter(function (x) { return x.id === a.p_acta; })[0];
      if (!acta) return fallar('acta_no_encontrada');
      if (acta.pagada) {
        return responder({ folio: acta.folio, codigo: acta.codigo || CODIGO_DEMO, ya_estaba: true });
      }
      // La huella se calcula en el navegador, antes de conocer el folio:
      // SHA-256 en hexadecimal. Una que no tenga esa forma es un error del
      // asistente, y el servidor la rechaza igual. Como alla, se compara
      // en minuscula y sin espacios de borde.
      var huella = String(a.p_huella || '').trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(huella)) return fallar('huella_invalida');
      if (!resumenValido(a.p_resumen)) return fallar('resumen_invalido');
      // Paso 23 (auditoria CN-006 y CN-003): se sella lo que quedo guardado,
      // y el mes es el del condominio guardado, no el que diga el resumen.
      var cont = acta.contenido || {};
      if (!cont.sello || String(cont.sello.huella || '').toLowerCase() !== huella) return fallar('version_no_guardada');
      var clave = (global.DEMO_MES && global.DEMO_MES.clave) ||
        function (s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ') || null; };
      var condoGuardado = (cont.fields || {})['condo-nombre'];
      if (!clave(condoGuardado) || clave(condoGuardado) !== clave(a.p_resumen.condominio)) return fallar('condominio_distinto');
      var sinMes = global.DEMO_MES ? global.DEMO_MES.exigir(a.p_resumen.condominio) : 'pase_requerido';
      if (sinMes) return fallar(sinMes);

      // DEMO- y seis digitos: nada que pueda pasar por un folio AV- real.
      var folio = 'DEMO-' + String(correlativo++).padStart(6, '0');
      acta.pagada = true;
      acta.folio = folio;
      acta.codigo = CODIGO_DEMO;
      acta.huella = huella;
      acta.finalizada_en = new Date().toISOString();
      return responder({ folio: folio, codigo: CODIGO_DEMO, ya_estaba: false });
    },

    ac_mis_actas: function () {
      if (!SESION) return sinPermiso('function ac_mis_actas');
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
    }
  };

  // --- Entrar ----------------------------------------------------------
  // Cambiar la clave pide la actual (AUTH-05): cuenta.js la comprueba
  // entrando de nuevo con ella, y sin esto el panel de la demostracion
  // terminaba en "No pudimos comprobar su clave actual". Vale solo para la
  // cuenta simulada y con cualquier clave de 8 o mas caracteres, el minimo
  // de cuenta.js: no hay una clave guardada contra la cual comparar, y
  // fijar una en este archivo seria publicar un secreto que no protege
  // nada. Con otro correo, o una clave mas corta, contesta lo mismo que
  // Supabase.
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
  // El resto de la entrada -codigo por correo, Google, crear cuenta,
  // recuperar la clave- en produccion sale del navegador, y aqui no hay a
  // donde. Se contesta con un error, y cuenta.js muestra su "No pudimos..."
  // en vez de reventar con una funcion que no existe. Se llega ahi despues
  // de "No soy yo", que en el acta cierra la sesion sin recargar.
  function noEnDemostracion() {
    return Promise.resolve({ data: { user: null, session: null },
                             error: { message: 'no_disponible_en_demostracion' } });
  }

  // --- El cliente falso -------------------------------------------------
  // Lo que no sea del acta se delega a la sala: así una sola pestaña puede
  // armar el acta y abrir su sala de votación, que es como se usa.
  global.supabase = {
    createClient: function () {
      return {
        rpc: function (nombre, args) {
          var f = FN[nombre] || salaFN[nombre] || consultaFN[nombre] ||
                  (global.DEMO_MES && global.DEMO_MES.fn[nombre]);
          if (!f) return fallar('funcion_no_simulada: ' + nombre);
          return f(args || {});
        },
        from: tabla,
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
          // Guardar el nombre y cambiar la clave. La clave no se guarda en
          // ninguna parte: en producción la recibe Supabase, aquí se descarta.
          // La revisión contra HaveIBeenPwned tampoco sale: desde el
          // 22-09-2026 js/demo-aviso.js contesta /api/clave/filtrada en el
          // navegador, porque la franja promete que nada sale de aquí.
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

  global.DEMOA = {
    sesion: function () { return SESION; },
    actas: function () { recuperar(); return JSON.parse(JSON.stringify(actas)); },
    // Hace las veces de un pago confirmado: un mes para ese condominio.
    pagar: function (condominio) {
      var m = global.DEMO_MES && global.DEMO_MES.activar(condominio || 'Condominio Las Araucarias');
      return m ? 'mes activo para ' + m.condominio + ' hasta ' + m.hasta + '. Recargue el panel.' : 'escriba el condominio';
    },
    reiniciar: function () {
      actas = []; correlativo = 1; guardar();
      if (global.DEMO_MES) global.DEMO_MES.reiniciar();
    }
  };

  // El candado del mes está en Postgres, no aquí. En la demostración, el
  // mes lo lleva js/demo-aviso.js: el acta entra con uno activo para el
  // condominio de los datos de ejemplo, y el panel empieza sin ninguno,
  // porque activarlo es justamente lo que ahí se muestra.

  console.info('Simulador del acta activo. Use DEMOA.* para inspeccionarlo.');

})(window);


/* El boton de datos de ejemplo salio de la cabecera del producto. Aca si
 * corresponde: esta pagina ES la demostracion, y sin datos no muestra nada.
 * Este archivo solo se carga en las paginas -demo, que son justamente
 * donde el simulador corresponde. */
(function botonEjemplo() {
  function poner() {
    var caja = document.querySelector('.app-header-inner .header-right');
    if (!caja || document.getElementById('demo-ejemplo')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.id = 'demo-ejemplo';
    b.className = 'header-action';
    /* En un telefono de 320 px, junto a «Ayuda» y la cuenta, el rotulo
     * largo empujaba la cabecera fuera de la pantalla: ahi dice «Ejemplo». */
    b.innerHTML = '<span class="demo-ej-largo">Datos de ejemplo</span><span class="demo-ej-corto">Ejemplo</span>';
    var s = document.createElement('style');
    s.textContent = '@media(min-width:401px){.demo-ej-corto{display:none}}@media(max-width:400px){.demo-ej-largo{display:none}}';
    document.head.appendChild(s);
    b.title = 'Carga un acta de muestra para recorrer la herramienta';
    b.addEventListener('click', function () {
      if (typeof cargarDatosEjemplo === 'function') cargarDatosEjemplo();
    });
    caja.insertBefore(b, caja.firstChild);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poner);
  else poner();
})();
