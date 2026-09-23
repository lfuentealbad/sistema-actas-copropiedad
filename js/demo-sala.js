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
 *  Sigue los contratos de la base: cada RUT atado al telefono que primero
 *  se identifica (C3: "ocupado", vv_liberar, "vinculado" en vv_reanudar),
 *  el padron canonico (C4: una unidad una vez, "descartadas" siempre) y
 *  el tope de tres salas por pago. Si la demostracion no se comportara
 *  como la base, ensenaria una sala que no existe. Lo vigila
 *  Pruebas/prueba-seg-sala.mjs.
 *
 *  Corre en las páginas -demo, con su aviso cargado antes, y en localhost.
 *  En cualquier otra página se ignora solo.
 * ===================================================================== */
(function (global) {
  'use strict';

  // Cortafuegos: esto solo puede correr en local. Si por descuido llegara a
  // producción, no hace nada y la sala usa Supabase como corresponde.
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
    console.warn('El simulador de sala solo funciona en las páginas de demostración. Ignorado.');
    return;
  }
  // Sin el aviso no hay demostracion, igual que en los simuladores del acta
  // y de la consulta (AUTH-01): en produccion llego a servirse una pagina
  // -demo con js/demo-aviso.js en 404 y el simulador corria igual, sin
  // franja. El generador pone el aviso antes que este archivo; si no corrio,
  // aqui no se finge nada. Tambien cierra la vitrina, porque una pagina real
  // no carga el aviso. En localhost se deja correr, que es el escritorio de
  // quien desarrolla.
  if (!enLocal && !(global.DEMO_AVISO && global.DEMO_AVISO.activo)) {
    console.error('Falta js/demo-aviso.js antes de este archivo: sin el aviso, la demostración no arranca.');
    return;
  }

  // --- La asamblea de ejemplo, con el mismo padrón del DEMO del acta ----
  var CODIGO = 'DEMO01';
  var TOKEN  = 'token-de-demostracion';

  var PADRON_DEMO = [
    { rut: '123456785',  nombre: 'María González Pérez',    unidad: '101', habil: true,  asiste: true, der: 5.25 },
    { rut: '112223339',  nombre: 'Juan Sepúlveda Rojas',    unidad: '102', habil: true,  asiste: true, der: 4.80 },
    { rut: '156789011',  nombre: 'Ana Castro Muñoz',        unidad: '201', habil: false, asiste: true, der: 5.10 },
    { rut: '98765433',   nombre: 'Carlos Vega Soto',        unidad: '202', habil: true,  asiste: true, der: 4.75 },
    { rut: '8765432k',   nombre: 'Patricia Soto López',     unidad: '301', habil: true,  asiste: true, der: 5.40 },
    { rut: '101112225',  nombre: 'Rodrigo Fernández Tapia', unidad: '302', habil: true,  asiste: true, der: 4.95 }
  ];

  // Con el mismo tope de 20 que Postgres: si no, un RUT largo que la base
  // recorta aqui no se encontraria.
  function normalizarRut(r) {
    return String(r || '').toLowerCase().replace(/[.\s-]/g, '').slice(0, 20);
  }

  // --- Las reglas de vv_set_padron (contrato C4) ------------------------
  // Lo que no se puede interpretar no se da por habil: suponerlo agrega
  // derechos a la base y baja el umbral de hecho. La asistencia, al
  // reves, se supone.
  function bandera(v) {
    if (v === true || v === false) return v;
    var t = String(v == null ? '' : v).trim().toLowerCase();
    if (/^(si|sí|true|1|verdadero)$/.test(t)) return true;
    if (/^(no|false|0|falso)$/.test(t)) return false;
    return null;
  }
  // Lo mismo que acepta vv_set_padron: la coma decimal del Excel chileno
  // se lee, y "1e3" o "Infinity" -que Number si traga- entran como 0.
  function derechos(v) {
    var t = String(v == null ? '' : v).trim().replace(',', '.');
    if (t.length < 1 || t.length > 30 || !/^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)$/.test(t)) return 0;
    var n = Number(t);
    return n > 0 ? n : 0;
  }
  // Uno de mas de 254 no se recorta hasta que parezca valido: se descarta,
  // como en la base.
  function correoLimpio(v) {
    var c = String(v == null ? '' : v).trim().toLowerCase();
    return (c.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) ? c : null;
  }

  // --- El vinculo RUT-telefono (contrato C3) -----------------------------
  // En Postgres se guarda solo el sha256 del identificador. Aqui se guarda
  // tal cual: todo vive en el localStorage de este mismo navegador, que es
  // de donde sale el identificador, y hashearlo no protegeria nada.
  var DISPOSITIVO = /^[0-9a-f]{32}$/;

  // Diccionarios con claves que escribe la Mesa o el votante: se leen con
  // hasOwnProperty para que un punto o un RUT llamado "constructor" no
  // encuentre lo que hereda todo objeto (SAST-12).
  function propio(o, k) {
    return (o && Object.prototype.hasOwnProperty.call(o, k)) ? o[k] : undefined;
  }
  // Y se escriben como propiedad propia: con "=" un punto o un RUT llamado
  // "__proto__" cambiaria el prototipo en vez de guardar el voto.
  function poner(o, k, v) {
    Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
    return v;
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
  // 'pagos' lleva cuantas salas abrio cada llave: es el contador que en
  // Postgres vive en vv_pagos_usados.salas (ver vv_crear).
  var LLAVE = 'demo_sala_estado';
  var base = { salas: {}, ultima: CODIGO, pagos: {} };

  function guardar() {
    try { localStorage.setItem(LLAVE, JSON.stringify(base)); } catch (e) {}
  }
  function recuperar() {
    try {
      var g = JSON.parse(localStorage.getItem(LLAVE));
      if (g && g.salas) base = g;
    } catch (e) {}
    if (!base.salas) base = { salas: {}, ultima: CODIGO, pagos: {} };
    // Lo guardado antes del 22-09-2026 no traia el contador.
    if (!base.pagos || typeof base.pagos !== 'object' || Array.isArray(base.pagos)) base.pagos = {};
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
  // Todas las filas del RUT: una persona puede tener varias unidades.
  function filasDe(sala, rut) {
    var n = normalizarRut(rut);
    return sala.padron.filter(function (p) { return p.rut === n; });
  }
  // Lo que ve el votante de si mismo, como lo arma vv_identificar: las
  // unidades juntas, los derechos sumados, y habil solo si lo es en todas
  // (art. 14 del Reglamento).
  function resumen(filas) {
    var der = 0, habil = true;
    filas.forEach(function (p) { der += Number(p.der) || 0; habil = habil && p.habil === true; });
    return {
      existe: true, rut: filas[0].rut, nombre: filas[0].nombre,
      unidad: filas.map(function (p) { return p.unidad; }).join(', '),
      der: Math.round(der * 10000) / 10000, habil: habil
    };
  }
  function vinculoDe(filas) {
    for (var i = 0; i < filas.length; i++) if (filas[i].dispositivo) return filas[i].dispositivo;
    return null;
  }
  function votosDe(sala, punto) {
    return propio(sala.votos, punto) || null;
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

    // El primer telefono que se identifica con un RUT se lo queda. A los
    // demas se les dice "ocupado" y nada mas: ni nombre, ni unidad, ni si
    // esta al dia.
    // El limite de intentos por conexion ('demasiados_intentos') no se
    // simula: aqui todo corre en este navegador y no hay a quien frenar.
    vv_identificar: function (a) {
      if (!DISPOSITIVO.test(String(a.p_dispositivo || ''))) return fallar('dispositivo_invalido');
      var s = laSala(a.p_codigo);
      if (!s) return responder({ existe: false, motivo: 'asamblea' });
      var filas = filasDe(s, a.p_rut);
      if (!filas.length) return responder({ existe: false, motivo: 'rut' });
      var d = vinculoDe(filas);
      if (d && d !== a.p_dispositivo) return responder({ existe: true, ocupado: true });
      filas.forEach(function (p) { p.dispositivo = a.p_dispositivo; });
      return responder(resumen(filas));
    },

    // Como voto alguien solo se le dice al telefono que tiene su RUT.
    // Sin un identificador bien formado la respuesta es la de quien no voto,
    // como en Postgres: si no, un RUT recien liberado -sin telefono- le
    // contaba su voto a quien mandara p_dispositivo null, porque su vinculo
    // (null) y el identificador (null) "coincidian".
    vv_mi_voto: function (a) {
      if (!DISPOSITIVO.test(String(a.p_dispositivo || ''))) return responder({ choice: null });
      var s = laSala(a.p_codigo);
      if (!s) return responder({ choice: null });
      var filas = filasDe(s, a.p_rut);
      if (!filas.length || vinculoDe(filas) !== a.p_dispositivo) return responder({ choice: null });
      return responder({ choice: propio(votosDe(s, a.p_punto), filas[0].rut) || null });
    },

    // Mismo orden y mismos mensajes que en Postgres.
    vv_emitir: function (a) {
      if (['favor', 'contra', 'abst'].indexOf(a.p_choice) < 0) return fallar('opcion invalida');
      if (!DISPOSITIVO.test(String(a.p_dispositivo || ''))) return fallar('dispositivo_invalido');
      var s = laSala(a.p_codigo);
      if (!s) return fallar('asamblea no existe');
      if (!s.abierta) return fallar('votacion cerrada');
      if (s.punto !== a.p_punto) return fallar('el punto cambio');
      var filas = filasDe(s, a.p_rut);
      if (!filas.length) return fallar('no esta en el padron');
      var d = vinculoDe(filas);
      if (!d) return fallar('identifiquese_primero');
      if (d !== a.p_dispositivo) return fallar('rut_en_otro_dispositivo');
      if (!resumen(filas).habil) return fallar('inhabil');
      var votos = votosDe(s, a.p_punto);
      if (!votos) votos = poner(s.votos, a.p_punto, {});
      poner(votos, filas[0].rut, a.p_choice);
      return responder({ ok: true });
    },

    // La Mesa desata un RUT de su telefono para que pueda identificarse
    // desde otro. Los votos ya emitidos se quedan donde estan.
    vv_liberar: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      filasDe(s, a.p_rut).forEach(function (p) { p.dispositivo = null; });
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
      var emitidos = votosDe(s, a.p_punto) || {};
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
        // A la Mesa, que tiene la llave, se le devuelve el padron con lo que
        // ella misma cargo -asistencia y correo incluidos, para que al volver
        // a guardarlo no se pierdan- y si cada RUT ya tiene telefono. El
        // telefono en si no sale nunca.
        padron: s.padron.map(function (p) {
          return {
            rut: p.rut, nombre: p.nombre, unidad: p.unidad,
            habil: p.habil, asiste: p.asiste !== false, der: p.der,
            correo: p.correo || null, vinculado: !!p.dispositivo
          };
        }),
        puntos: puntos
      });
    },

    // El candado del pago vive en Postgres y aquí no se puede reproducir:
    // esta demostración da la asamblea por pagada. En producción, sin una
    // llave válida y sin usar, vv_crear responde 'pago_requerido'.
    //
    // Lo que sí se reproduce es el tope (paso 12 de la base): una orden
    // abre a lo sumo tres salas -para repetir una sesion que se corto o
    // seguirla otro dia- y cerrar una no devuelve el cupo. Sin el tope, la
    // demostracion ensenaba salas sin fin con un solo pago. Aqui la orden
    // es la llave misma; la de la demostracion es siempre la misma marca,
    // y su cupo vuelve a cero cuando se simula un pago nuevo (DEMOA.pagar()
    // o entrar al acta sin pago puesto: ver _pagoNuevo mas abajo).
    // 'pago_de_otra_cuenta' no se simula: la demostracion tiene una sola
    // cuenta.
    vv_crear: function (a) {
      if (!a.p_llave) return fallar('pago_requerido');
      recuperar();
      var orden = String(a.p_llave);
      var abiertas = Number(propio(base.pagos, orden)) || 0;
      if (abiertas >= 3) return fallar('demasiadas_salas_con_este_pago');
      var cod = codigoNuevo();
      base.salas[cod] = salaNueva(cod, 'token-' + cod, a.p_titulo || '', []);
      base.ultima = cod;
      poner(base.pagos, orden, abiertas + 1);
      // El pago del acta cubre el acta y sus salas; la consulta por escrito
      // es un servicio aparte, con su propio pago. La llave no se borra: en
      // Postgres la orden se reusa mientras sea la misma cuenta
      // ('pago_de_otra_cuenta' si no) y no pase del tope.
      return responder({ id: 'demo-' + cod, codigo: cod, admin_token: 'token-' + cod });
    },

    // La version canonica (contrato C4): una unidad una vez, un RUT las que
    // tenga. La unidad repetida no revienta: se queda la primera y se le
    // dice a la Mesa cuales no entraron.
    vv_set_padron: function (a) {
      var s = laSala(a.p_codigo);
      if (!s || a.p_token !== s.token) return fallar('no autorizado');
      if (!Array.isArray(a.p_padron)) return fallar('padron invalido');
      if (a.p_padron.length > 5000) return fallar('padron demasiado grande (max 5000)');
      // Volver a guardar el padron no desata a nadie de su telefono: si no,
      // cada correccion de la Mesa desconectaria a toda la sala.
      var vinculos = Object.create(null);
      s.padron.forEach(function (p) { if (p.dispositivo) vinculos[p.rut] = p.dispositivo; });
      var unidades = Object.create(null), descartadas = [], nuevo = [];
      a.p_padron.forEach(function (e, i) {
        e = (e && typeof e === 'object') ? e : {};
        var rut = normalizarRut(e.rut).slice(0, 20);
        if (!rut) return;
        var unidad = String(e.unidad == null ? '' : e.unidad).trim().slice(0, 40) || ('sin-unidad-' + (i + 1));
        var k = unidad.toLowerCase();
        if (unidades[k]) { descartadas.push(unidad); return; }
        unidades[k] = true;
        nuevo.push({
          rut: rut, nombre: String(e.nombre == null ? '' : e.nombre).slice(0, 120), unidad: unidad,
          habil: bandera(e.habil) === true, asiste: bandera(e.asiste) !== false,
          der: derechos(e.der), correo: correoLimpio(e.correo),
          dispositivo: vinculos[rut] || null
        });
      });
      s.padron = nuevo;
      return responder({ ok: true, n: nuevo.length, descartadas: descartadas });
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
    // Un pago nuevo trae su cupo de tres salas. Lo llama el simulador del
    // acta cuando simula la vuelta de la pasarela; la llave es la misma
    // marca de siempre, asi que lo que se reinicia es su contador.
    _pagoNuevo: function (llave) {
      recuperar();
      if (propio(base.pagos, String(llave)) !== undefined) delete base.pagos[String(llave)];
      guardar();
    },
    // Cuantas salas lleva abiertas una llave, para mirarlo desde la consola.
    salasDelPago: function (llave) { recuperar(); return Number(propio(base.pagos, String(llave))) || 0; },
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
    // Atajo de consola: vota como si lo hiciera el telefono vinculado, sin
    // pedir el identificador. Sirve para poblar la demostracion, no es un
    // camino que exista en Postgres.
    votar: function (rut, punto, cual, cod) {
      var s = cod ? laSala(cod) : actual(); if (!s) return 'no existe';
      var filas = filasDe(s, rut); if (!filas.length) return 'no está en el padrón';
      if (!resumen(filas).habil) return filas[0].nombre + ' es inhábil: no puede votar';
      var votos = votosDe(s, punto);
      if (!votos) votos = poner(s.votos, punto, {});
      poner(votos, filas[0].rut, cual); guardar();
      return filas[0].nombre + ' votó ' + cual;
    },
    liberar: function (rut, cod) {
      var s = cod ? laSala(cod) : actual(); if (!s) return 'no existe';
      filasDe(s, rut).forEach(function (p) { p.dispositivo = null; }); guardar();
      return s.codigo;
    },
    estado: function (cod) {
      var s = cod ? laSala(cod) : actual();
      return s ? JSON.parse(JSON.stringify(s)) : null;
    },
    reiniciar: function () {
      base = { salas: {}, ultima: CODIGO, pagos: {} };
      recuperar(); guardar();
    }
  };

  console.info('Simulador de sala activo. Código de ejemplo: ' + CODIGO + '. Use DEMO.* para conducirla.');

})(window);
