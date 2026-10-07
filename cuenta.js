// Cuenta del cliente — compartida por el acta y la consulta por escrito.
//
// Principio: la cuenta NO aparece al entrar. Aparece cuando hay algo que
// resguardar, es decir al momento de pagar. Antes de eso la persona arma su
// acta sin que le pidamos nada.
//
// Dos vias, ambas sobre Supabase Auth:
//   - Google, para quien lo tenga (la mayoria de los administradores)
//   - Codigo de 6 digitos al correo, que funciona siempre y no depende de nadie.
//     Solo entra a una cuenta que ya existe: las cuentas se crean con
//     crearCuenta, que pide nombre y clave.
//
// Se carga como script clasico (el proyecto no tiene empaquetador):
//   <script src="/vendor/supabase.min.js"></script>
//   <script src="/cuenta.js"></script>

(function (global) {
  'use strict';

  var URL_SB  = 'https://rujwokagmjbqtrcvosye.supabase.co';
  var ANON_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1andva2FnbWpicXRyY3Zvc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDgzNzIsImV4cCI6MjA5NzUyNDM3Mn0.E_p3VdfHrMIHy-yq0Uxoz4wEP_pxqVqE64TBWoyVGV0';

  // Interruptor del inicio con Google. Exige que el proveedor este
  // habilitado en Supabase (Authentication > Providers > Google) con las
  // credenciales OAuth del proyecto en Google Cloud. Sin eso, Supabase
  // responde "Unsupported provider: provider is not enabled" y la persona
  // se queda mirando un error crudo: por eso el boton no se ofrece.
  var PROVEEDOR_GOOGLE = false;

  // Si este navegador ya entro alguna vez, el panel abre en "Entrar"; si
  // no, abre en "Crear cuenta", que es lo que casi todo el que llega
  // necesita. Es un "1" guardado en el equipo: no identifica a nadie ni
  // viaja a ninguna parte.
  var YA_ENTRO = 'ac_ya_entro';
  function equipoConocido() {
    try { return localStorage.getItem(YA_ENTRO) === '1'; } catch (e) { return false; }
  }
  function recordarQueEntro() {
    try { localStorage.setItem(YA_ENTRO, '1'); } catch (e) {}
  }

  var sb = null;
  function cliente() {
    if (!sb && global.supabase) sb = global.supabase.createClient(URL_SB, ANON_SB);
    return sb;
  }

  var correoValido = function (c) {
    return typeof c === 'string' && c.length <= 160 &&
           /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(c);
  };

  // -------------------------------------------------------------------
  //  Sesion
  // -------------------------------------------------------------------
  // Google entrega el nombre en full_name o name; el registro propio lo
  // guarda en nombre. Se toma el primero que exista.
  function nombreDe(u) {
    var m = (u && u.user_metadata) || {};
    var n = m.nombre || m.full_name || m.name || '';
    return String(n).trim();
  }

  function usuario(cb) {
    var c = cliente();
    if (!c) { cb(null); return; }
    c.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      cb(s && s.user
        ? { id: s.user.id, correo: s.user.email, nombre: nombreDe(s.user) }
        : null);
    }, function () { cb(null); });
  }

  function guardarNombre(nombre, cb) {
    var n = String(nombre || '').trim();
    if (n.length < 2) { cb('Escriba su nombre.'); return; }
    if (n.length > 80) { cb('El nombre es demasiado largo.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.updateUser({ data: { nombre: n } }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos guardar su nombre.')); return; }
      // La cabecera saluda con el nombre: si no se repinta, sigue mostrando
      // el anterior hasta que la persona recargue.
      refrescarNav();
      cb(null);
    }, function () { cb('No pudimos guardar su nombre.'); });
  }

  // El token de la sesion vigente, para las llamadas al Worker que cobran
  // (/api/pago/*): el Worker ata cada orden a la cuenta que la pidio y no
  // entrega la llave a nadie mas. null si no hay sesion; la pagina que lo
  // pide se encarga de hacer entrar a la persona.
  function tokenDeAcceso() {
    var c = cliente();
    if (!c) return Promise.resolve(null);
    return Promise.resolve().then(function () {
      return c.auth.getSession();
    }).then(function (r) {
      var s = r && r.data && r.data.session;
      return (s && s.access_token) || null;
    }, function () { return null; });
  }

  // -------------------------------------------------------------------
  //  Lo que queda en el equipo al cerrar sesion
  // -------------------------------------------------------------------
  // signOut() borra solo el token de Supabase. Lo demas lo dejaron las
  // paginas, y en la conserjeria el computador es de todos: el que se sienta
  // despues no tiene por que encontrar el padron de otro condominio, la
  // clave de la Mesa de una sala o una llave de pago que todavia sirve.
  var DEL_EQUIPO = ['acta_pago_llave', 'consulta_pago_llave', 'acta_pago_llave_real',
                    'acta_sala', 'cc_mesa'];
  var PREFIJOS_DEL_EQUIPO = ['sala-mesa-', 'sala-voto-'];
  // Los borradores van aparte porque pueden ser lo unico que existe de un
  // trabajo: ver borradoresPendientes().
  var BORRADOR_ACTA = 'sistema_actas_v2';
  var BORRADOR_COMITE = 'acta_comite_borrador';
  // Fuera a proposito: 'actaviva_finanzas_v1'. Las cuentas del condominio
  // viven SOLO en este navegador, sin copia en el servidor; borrarlas al
  // salir destruiria lo unico que hay. Y 'ac_ya_entro', que es un "1".

  function almacen() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }

  // Una llave de pago sin usar es plata de la persona. Borrarla sin mas la
  // obliga a pagar de nuevo; dejarla, que otro la use en este equipo. Se
  // guarda el numero de la orden, que desde que el Worker ata el pago a la
  // cuenta no sirve sin la sesion de quien pago, y al volver a entrar la
  // llave se pide otra vez con su token (recuperarPagos).
  var POR_RECUPERAR = 'pagos_por_recuperar';

  // La llave es <payload en base64url>.<hmac>, con {o: orden, e: vence, p:
  // producto} (emitirLlave en _worker.js). Solo se lee: la firma la valida
  // Postgres, no el navegador.
  function b64urlJson(txt) {
    var b = String(txt || '').replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    return JSON.parse(global.atob(b));
  }
  function ordenDeLlave(llave) {
    var partes = String(llave || '').split('.');
    if (partes.length !== 2) return null;
    try {
      var d = b64urlJson(partes[0]);
      if (!d || !/^AV-[A-Z0-9]{1,32}$/.test(String(d.o || ''))) return null;
      return { o: String(d.o), e: Number(d.e) || 0, p: d.p === 'consulta' ? 'consulta' : 'acta' };
    } catch (e) { return null; }
  }
  function leerPorRecuperar() {
    var ls = almacen();
    try {
      var l = ls && JSON.parse(ls.getItem(POR_RECUPERAR));
      // Lo que se lee del equipo se revisa: solo ordenes con su forma.
      return Array.isArray(l) ? l.filter(function (x) {
        return x && /^AV-[A-Z0-9]{1,32}$/.test(String(x.o || ''));
      }) : [];
    } catch (e) { return []; }
  }
  function escribirPorRecuperar(l) {
    var ls = almacen();
    if (!ls) return;
    // Una orden vencida ya no tiene llave que devolver.
    var ahora = Date.now() / 1000;
    var vigentes = l.filter(function (x) { return x && x.o && Number(x.e) > ahora; });
    try {
      if (vigentes.length) ls.setItem(POR_RECUPERAR, JSON.stringify(vigentes));
      else ls.removeItem(POR_RECUPERAR);
    } catch (e) {}
  }

  // La vuelta desde la pasarela con una orden que el Worker no reconoce en
  // esta cuenta: o se pago con otra cuenta en este mismo equipo, o el
  // registro de la orden todavia no se ve desde aqui. En los dos casos el
  // numero de la direccion es lo unico que queda de ese pago; se anota para
  // que recuperarPagos lo pida con la cuenta que entre despues. Plazo corto:
  // mientras siga anotada, cada pagina con portero pregunta por ella.
  var ANOTADA_SIN_VER = 7 * 86400;
  function anotarPago(orden) {
    var o = String(orden || '');
    if (!/^AV-[A-Z0-9]{1,32}$/.test(o)) return;
    var l = leerPorRecuperar();
    if (l.some(function (x) { return x.o === o; })) return;
    l.push({ o: o, e: Math.floor(Date.now() / 1000) + ANOTADA_SIN_VER, p: 'acta' });
    escribirPorRecuperar(l);
  }

  // Devuelve a su casillero las llaves de las ordenes anotadas al salir.
  // cb(n) con cuantas volvieron. Sin nada anotado responde en el acto, para
  // no demorar la carga de ninguna pagina.
  //
  // /api/pago/estado va con el limite estricto del Worker: 20 consultas por
  // minuto por IP, y en una conserjeria esa IP es la de todo el edificio.
  // Preguntar por todas las ordenes a la vez gastaba el cupo de un golpe, y
  // la vuelta de un pago recien hecho se quedaba sin respuesta. Por eso se
  // pregunta una tras otra, a lo mas POR_VISITA por carga de pagina, y ante
  // un 429 se para: las que quedan van en la proxima visita. Las que se
  // preguntaron sin exito pasan al final de la fila; si no, una orden de
  // otra cuenta, que sigue anotada hasta vencer, se llevaria siempre los
  // primeros turnos y taparia a las de atras.
  var POR_VISITA = 5;
  var cupoVisita = POR_VISITA;
  // Mismo criterio que llaveDelActa() en acta-1.js y llaveGuardada() en
  // consulta-1.js: 'DEMO-PAGO-SIMULADO' solo cuenta en una pagina -demo.
  function casilleroOcupado(v) {
    if (!v) return false;
    if (v !== 'DEMO-PAGO-SIMULADO') return true;
    return /(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(String((global.location || {}).pathname || ''));
  }
  // Si otra parte de la pagina pide lo mismo mientras se pregunta, espera
  // esa vuelta en vez de preguntar de nuevo por las mismas ordenes.
  var esperanRecuperar = null;

  function recuperarPagos(cb) {
    if (esperanRecuperar) { if (cb) esperanRecuperar.push(cb); return; }
    var lista = leerPorRecuperar();
    if (!lista.length || cupoVisita <= 0) { if (cb) cb(0); return; }
    esperanRecuperar = cb ? [cb] : [];
    var hecho = false, vueltas = 0, devueltas = [], preguntadas = [];
    var terminar = function () {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      // Se relee el equipo: mientras se preguntaba, la pagina pudo anotar
      // otra orden (anotarPago) y escribir la lista del comienzo la borraba.
      var quedan = leerPorRecuperar().filter(function (x) { return devueltas.indexOf(x.o) < 0; });
      var yaPreguntada = function (x) { return preguntadas.indexOf(x.o) >= 0; };
      escribirPorRecuperar(quedan.filter(function (x) { return !yaPreguntada(x); })
        .concat(quedan.filter(yaPreguntada)));
      var esperan = esperanRecuperar;
      esperanRecuperar = null;
      // Un error en quien espera no puede dejar sin respuesta al siguiente
      // (el portero de la pagina quedaria cerrado); se relanza aparte para
      // que igual se vea en la consola.
      esperan.forEach(function (f) {
        try { f(vueltas); } catch (e) { setTimeout(function () { throw e; }, 0); }
      });
    };
    // La red no puede dejar la pagina esperando: pasado el plazo se sigue, y
    // lo que no volvio queda anotado para la proxima.
    var reloj = setTimeout(terminar, 6000);
    tokenDeAcceso().then(function (token) {
      if (!token) { terminar(); return; }
      var turno = lista.slice(0, cupoVisita), i = 0;
      var siguiente = function () {
        if (hecho || i >= turno.length) { terminar(); return; }
        var x = turno[i++];
        cupoVisita--;
        fetch('/api/pago/estado?orden=' + encodeURIComponent(x.o), {
          headers: { authorization: 'Bearer ' + token }
        }).then(function (r) {
          // Pasado el limite, seguir solo suma rechazos y alarga la espera.
          // Y el cupo de esta pagina se da por gastado: otra llamada en la
          // misma carga (el panel pregunta despues del portero) volveria a
          // chocar con el limite y le quitaria turnos a la vuelta de Flow.
          if (r.status === 429) { cupoVisita = 0; terminar(); return; }
          preguntadas.push(x.o);
          return r.json().catch(function () { return null; }).then(function (d) {
            // Lo que llega despues del plazo ya no se usa: la lista se
            // escribio sin esta respuesta y la orden sigue anotada.
            if (hecho) return;
            if (d && d.estado === 'pagado' && d.llave) {
              var casillero = d.producto === 'consulta' ? 'consulta_pago_llave' : 'acta_pago_llave';
              var ls = almacen();
              // Si el casillero ya tiene otra llave, esta espera su turno.
              // La marca que dejaba la demostracion no es una llave: fuera
              // de una pagina -demo los lectores la descartan, y tomarla por
              // ocupado dejaba el pago de verdad esperando hasta vencer.
              if (ls && !casilleroOcupado(ls.getItem(casillero))) {
                try { ls.setItem(casillero, d.llave); devueltas.push(x.o); vueltas++; } catch (e) {}
              }
            }
            siguiente();
          });
        }).then(null, function () { terminar(); });
      };
      siguiente();
    }).then(null, terminar);
  }

  // Lo mismo que _actaEnBlanco() de acta-1.js: los campos vienen todos,
  // llenos o vacios, asi que se miran los que indican trabajo empezado.
  function actaEnBlanco(snap) {
    var f = snap.fields || {};
    for (var k in f) if (String(f[k] || '').trim() !== '') return false;
    var a = snap.asistentes || [];
    for (var i = 0; i < a.length; i++) {
      var p = a[i] || {};
      if (String(p.nombre || '').trim() !== '' || String(p.rut || '').trim() !== '') return false;
    }
    var q = snap.puntos || [];
    for (var j = 0; j < q.length; j++) if (String((q[j] || {}).titulo || '').trim() !== '') return false;
    return true;
  }

  // ¿Que borradores tienen algo que no llego a la cuenta? cb([claves]).
  //
  //  - Acta: acta-1.js escribe cada cambio en sistema_actas_v2 y, 1,2 s
  //    despues, sube a actas_guardadas una copia con un savedAt nuevo. Si esa
  //    subida fallo o no alcanzo a salir, la fila de la cuenta queda con un
  //    savedAt ANTERIOR al del borrador. Sin actaId, el borrador nunca subio.
  //    Con folio, el acta ya quedo sellada en el servidor y el servidor no
  //    acepta mas cambios: lo local no agrega nada.
  //  - Comite: acta-comite-1.js escribe acta_comite_borrador solo cuando no
  //    pudo hablar con el servidor, y lo borra en el primer guardado bueno.
  //    Si existe, es por definicion lo que no subio.
  //
  //  Ante la duda (sin red, sin respuesta) se cuenta como pendiente:
  //  preguntar de mas cuesta un clic; no preguntar puede costar el acta.
  //
  //  Lo que no se pregunta es por el borrador de OTRA cuenta. Cada borrador
  //  lleva el uid de quien lo escribio (acta-1.js lo pone en snap.uid;
  //  acta-comite-1.js, en la clave "uid" del objeto guardado). Si ese uid no
  //  es el de quien esta cerrando sesion, el borrador lo dejo aqui otra
  //  persona que eligio «Cancelar» al salir. Preguntarle a esta si lo
  //  conserva es pedirle que decida sobre el padron de un condominio ajeno,
  //  y con Cancelar lo dejaria a la vista de nuevo: se borra sin preguntar.
  //  Sin uid (lo escribio la version anterior) o sin saber quien sale, no
  //  hay como saber de quien es y vale lo de siempre.
  function borradoresPendientes(c, cb) {
    var ls = almacen();
    var pend = [];
    if (!ls) { cb(pend); return; }
    // El del comite cuenta con solo existir, aunque no se pueda leer: asi
    // era antes de mirar su uid, y un JSON roto no es razon para no avisar.
    var hayComite = false, comite = null;
    try {
      var rc = ls.getItem(BORRADOR_COMITE);
      hayComite = !!rc;
      comite = rc ? JSON.parse(rc) : null;
    } catch (e) { comite = null; }
    var snap = null;
    try { snap = JSON.parse(ls.getItem(BORRADOR_ACTA)); } catch (e) { snap = null; }
    var actaEnJuego = !!(snap && typeof snap === 'object' && !snap.actaFolio && !actaEnBlanco(snap));
    if (!hayComite && !actaEnJuego) { cb(pend); return; }

    var uid = null;
    var ajeno = function (b) {
      return !!(uid && b && typeof b === 'object' && typeof b.uid === 'string' && b.uid && b.uid !== uid);
    };
    var hecho = false;
    var fin = function (actaPendiente) {
      if (hecho) return;
      hecho = true;
      clearTimeout(reloj);
      if (hayComite && !ajeno(comite)) pend.push(BORRADOR_COMITE);
      if (actaPendiente) pend.push(BORRADOR_ACTA);
      cb(pend);
    };
    // Un solo plazo para las dos preguntas (quien sale y que tiene la
    // cuenta): getSession tambien puede quedarse esperando la red si tiene
    // que renovar el token.
    var reloj = setTimeout(function () { fin(actaEnJuego); }, 4000);
    uidDeLaSesion(c, function (u) {
      if (hecho) return;
      uid = u;
      if (!actaEnJuego || ajeno(snap)) { fin(false); return; }
      if (!snap.actaId || !c || typeof c.from !== 'function') { fin(true); return; }
      try {
        // Se pide solo la fecha que trae el contenido, no el acta entera: para
        // comparar no hace falta bajar el padron.
        c.from('actas_guardadas').select('guardada:contenido->>savedAt').eq('id', snap.actaId)
          .then(function (r) {
            var f = r && !r.error && r.data && r.data[0];
            var g = f ? (f.guardada != null ? f.guardada : (f.contenido && f.contenido.savedAt)) : null;
            fin(!(Date.parse(g) >= Date.parse(snap.savedAt)));
          }, function () { fin(true); });
      } catch (e) { fin(true); }
    });
  }

  // El uid de quien tiene la sesion abierta, o null si no se sabe (sin
  // cliente, sin sesion, o Supabase fallo). Como tokenDeAcceso: nunca lanza.
  function uidDeLaSesion(c, cb) {
    if (!c || !c.auth || typeof c.auth.getSession !== 'function') { cb(null); return; }
    var uid = null;
    Promise.resolve().then(function () {
      return c.auth.getSession();
    }).then(function (r) {
      var s = r && r.data && r.data.session;
      uid = (s && s.user && s.user.id) || null;
    }, function () { uid = null; }).then(function () { cb(uid); });
  }

  function borrarDelEquipo(conservar) {
    var ls = almacen();
    if (!ls) return;
    // Antes de soltar las llaves se anota de que orden eran.
    var pend = leerPorRecuperar();
    ['acta_pago_llave', 'consulta_pago_llave', 'acta_pago_llave_real'].forEach(function (k) {
      var d = null;
      try { d = ordenDeLlave(ls.getItem(k)); } catch (e) {}
      if (d && !pend.some(function (x) { return x.o === d.o; })) pend.push(d);
    });
    escribirPorRecuperar(pend);

    var quitar = DEL_EQUIPO.slice();
    [BORRADOR_ACTA, BORRADOR_COMITE].forEach(function (k) {
      if ((conservar || []).indexOf(k) < 0) quitar.push(k);
    });
    try {
      for (var i = 0; i < ls.length; i++) {
        var k = ls.key(i);
        if (k && PREFIJOS_DEL_EQUIPO.some(function (p) { return k.indexOf(p) === 0; })) quitar.push(k);
      }
    } catch (e) {}
    quitar.forEach(function (k) { try { ls.removeItem(k); } catch (e) {} });
  }

  // signOut() no suelta la sesion local si no alcanza al servidor: sin red
  // devuelve el error y deja el token donde estaba. Cerrar sesion no puede
  // depender de la conexion, asi que en ese caso se suelta a mano.
  var LLAVE_SESION = 'sb-' + URL_SB.replace(/^https:\/\//, '').split('.')[0] + '-auth-token';
  function soltarSesionLocal() {
    var ls = almacen();
    if (!ls) return;
    [LLAVE_SESION, LLAVE_SESION + '-code-verifier'].forEach(function (k) {
      try { ls.removeItem(k); } catch (e) {}
    });
  }

  // Aceptar es borrar, que es lo que se espera de «Cerrar sesión» y lo que
  // pasa si la persona aprieta Enter sin leer.
  var AVISO_BORRADOR =
    'En este equipo quedaron cambios de su acta que no alcanzaron a guardarse en su cuenta.\n\n' +
    'Aceptar: borrarlos de este equipo y cerrar sesión.\n' +
    'Cancelar: dejarlos en este navegador para retomarlos después. ' +
    'Cualquiera que use este equipo podrá verlos.';

  // CN-003: las cuentas del condominio no se borran al salir (son la unica
  // copia), pero sin contrasena quedan a la vista del que se siente despues.
  // Se avisa antes de cerrar, y Cancelar deja la sesion como estaba.
  var FINANZAS = 'actaviva_finanzas_v1';
  var AVISO_FINANZAS =
    'En este equipo quedan las cuentas del condominio (Finanzas) sin contraseña: ' +
    'cualquiera que lo use puede verlas.\n\n' +
    'Aceptar: cerrar sesión igual.\n' +
    'Cancelar: seguir con la sesión abierta, para protegerlas desde Finanzas → Respaldo y datos.';
  function finanzasSinProteger() {
    var ls = almacen();
    if (!ls) return false;
    var e = null;
    try { e = JSON.parse(ls.getItem(FINANZAS)); } catch (x) { e = null; }
    if (!e || typeof e !== 'object') return false;
    var listas = ['unidades', 'cobros', 'egresos', 'ingresos', 'fondo', 'mantenciones'];
    for (var i = 0; i < listas.length; i++) {
      if (Array.isArray(e[listas[i]]) && e[listas[i]].length) return true;
    }
    return !!(e.config && (e.config.condNombre || e.config.admNombre));
  }

  function salir(cb) {
    var c = cliente();
    var fin = function () { if (cb) cb(); };
    if (finanzasSinProteger()) {
      var seguir = true;
      var t1 = Date.now();
      try { seguir = global.confirm(AVISO_FINANZAS); } catch (e) { seguir = true; }
      // Igual que abajo: un dialogo que no se mostro no es un Cancelar, y un
      // aviso no puede impedir cerrar la sesion.
      if (!seguir && Date.now() - t1 < 50) seguir = true;
      if (!seguir) return;
    }
    // La comparacion con la cuenta necesita la sesion: va antes de cerrarla.
    borradoresPendientes(c, function (pend) {
      var conservar = [];
      if (pend.length) {
        var borrar = true;
        var t0 = Date.now();
        try { borrar = global.confirm(AVISO_BORRADOR); } catch (e) { borrar = true; }
        // Un navegador que no muestra el dialogo (pestana en segundo plano,
        // dialogos bloqueados) devuelve false al instante, sin que nadie
        // haya elegido Cancelar. Eso no puede convertir en "conservar" lo
        // que por omision se borra.
        if (!borrar && Date.now() - t0 < 50) borrar = true;
        if (!borrar) conservar = pend;
      }
      // Se limpia DESPUES de cerrar: si mientras viajaba el cierre el asistente
      // alcanzo a autoguardar, eso tambien se va.
      var cerrar = function () { borrarDelEquipo(conservar); fin(); };
      if (!c) { cerrar(); return; }
      try {
        c.auth.signOut().then(function (r) {
          if (r && r.error) soltarSesionLocal();
          cerrar();
        }, function () { soltarSesionLocal(); cerrar(); });
      } catch (e) { soltarSesionLocal(); cerrar(); }
    });
  }

  // -------------------------------------------------------------------
  //  Entrada
  // -------------------------------------------------------------------
  function conGoogle(destino, cb) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: destino || global.location.href }
    }).then(function (r) {
      if (r && r.error) cb('No pudimos abrir el inicio con Google. Use el código por correo.');
    }, function () {
      cb('No pudimos abrir el inicio con Google. Use el código por correo.');
    });
  }

  var CLAVE_MIN = 8;

  function claveValida(c) {
    return typeof c === 'string' && c.length >= CLAVE_MIN;
  }

  // Traduce los errores de Supabase a algo que una persona entienda.
  function motivo(e, porDefecto) {
    var m = String((e && e.message) || '').toLowerCase();
    // No se afirma que la cuenta existe. Hoy Supabase no manda este error
    // porque exige confirmar el correo; el dia que alguien active la
    // confirmacion automatica en el panel, un "ya tiene cuenta" convertiria
    // el registro en un buscador de quien es cliente.
    if (/already registered|already exists|user already/.test(m))
      return 'No pudimos crear la cuenta con ese correo. Si ya tiene una, use «Entrar» o recupere su clave.';
    if (/invalid login|invalid credentials/.test(m))
      return 'El correo o la clave no coinciden.';
    if (/email not confirmed|not confirmed/.test(m))
      return 'Falta confirmar su correo. Busque el mensaje que le enviamos.';
    if (/password should be|at least/.test(m))
      return 'La clave debe tener al menos ' + CLAVE_MIN + ' caracteres.';
    if (/rate|seconds|exceed|often|too many/.test(m))
      return 'Demasiados intentos seguidos. Espere un minuto.';
    return porDefecto;
  }

  // -------------------------------------------------------------------
  //  Claves filtradas
  //  Supabase lo trae en el plan Pro. Aqui se hace igual: se calcula el
  //  SHA-1 en el navegador y solo se mandan los 5 primeros caracteres al
  //  Worker, que consulta HaveIBeenPwned y devuelve los sufijos filtrados
  //  que empiezan asi. La comparacion se hace aqui: ni la clave ni su hash
  //  completo salen del navegador. (Hasta el 28-09-2026 se mandaba tambien
  //  el sufijo, y prefijo mas sufijo son el hash entero: CN-021.)
  // -------------------------------------------------------------------
  function sha1Hex(txt) {
    if (!global.crypto || !global.crypto.subtle) return Promise.resolve(null);
    var datos = new TextEncoder().encode(txt);
    return global.crypto.subtle.digest('SHA-1', datos).then(function (buf) {
      var b = new Uint8Array(buf), s = '';
      for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
      return s.toUpperCase();
    }).catch(function () { return null; });
  }

  // cb(filtrada) — ante cualquier duda devuelve false: nunca deja a alguien
  // sin poder registrarse porque el servicio de terceros fallo.
  function claveFiltrada(clave, cb) {
    sha1Hex(String(clave || '')).then(function (h) {
      if (!h) { cb(false); return; }
      var ctrl = new AbortController();
      var reloj = setTimeout(function () { ctrl.abort(); }, 3000);
      fetch('/api/clave/filtrada', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefijo: h.slice(0, 5) }),
        signal: ctrl.signal
      }).then(function (r) { return r.json(); })
        .then(function (d) {
          clearTimeout(reloj);
          var lista = d && Array.isArray(d.sufijos) ? d.sufijos : [];
          cb(lista.indexOf(h.slice(5)) >= 0);
        })
        .catch(function () { clearTimeout(reloj); cb(false); });
    });
  }

  function crearCuenta(correo, clave, cb, nombre) {
    var n = String(nombre || '').trim();
    if (n.length < 2) { cb('Escriba su nombre.'); return; }
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    if (!claveValida(clave)) { cb('La clave debe tener al menos ' + CLAVE_MIN + ' caracteres.'); return; }
    claveFiltrada(clave, function (mala) {
      if (mala) { cb('CLAVE_FILTRADA'); return; }
      crearCuentaYa(correo, clave, cb, n);
    });
  }

  function crearCuentaYa(correo, clave, cb, n) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signUp({
      email: correo,
      password: clave,
      options: {
        emailRedirectTo: global.location.origin + '/cuenta',
        data: { nombre: n.slice(0, 80) }
      }
    }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos crear la cuenta.')); return; }
      // Si el proyecto exige confirmar el correo, no hay sesion todavia.
      var haySesion = r && r.data && r.data.session;
      cb(null, !haySesion);
    }, function () { cb('No pudimos crear la cuenta. Revise su conexión.'); });
  }

  // El alta sin clave (07-10-2026): nombre y correo, y un código al correo
  // para entrar. Quien usa poco la tecnología no tiene que inventar ni
  // recordar una clave; es lo que la portada ya prometía («escribe su
  // correo, le llega un código y entra»).
  //
  // El alta es lo ÚNICO que pide shouldCreateUser en true. El código para
  // ENTRAR (pedirCodigo) sigue en false: escribir un correo en «Entrar» no
  // abre cuentas a nombre de terceros. Este camino exige el nombre, como
  // crearCuenta, y envía un solo correo al que se escribió, igual que
  // signUp: no abre más de lo que ya abría.
  function crearCuentaConCodigo(correo, cb, nombre) {
    var n = String(nombre || '').trim();
    if (n.length < 2) { cb('Escriba su nombre.'); return; }
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signInWithOtp({
      email: correo,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: global.location.origin + '/cuenta',
        data: { nombre: n.slice(0, 80) }
      }
    }).then(function (r) {
      if (r && r.error) {
        var m = String(r.error.message || '');
        cb(/rate|seconds|exceed|often/i.test(m)
          ? 'Demasiados envíos seguidos. Espere un minuto.'
          : 'No pudimos crear la cuenta. Intente de nuevo en un momento.');
        return;
      }
      cb(null);
    }, function () { cb('No pudimos crear la cuenta. Revise su conexión.'); });
  }

  function entrarConClave(correo, clave, cb) {
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    if (!clave) { cb('Escriba su clave.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signInWithPassword({ email: correo, password: clave }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos entrar. Intente de nuevo.')); return; }
      cb(null);
    }, function () { cb('No pudimos entrar. Revise su conexión.'); });
  }

  function recuperarClave(correo, cb) {
    if (!correoValido(correo)) { cb('Escriba su correo para enviarle el enlace.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.resetPasswordForEmail(correo, {
      redirectTo: global.location.origin + '/cuenta?recuperar=1'
    }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos enviar el enlace.')); return; }
      cb(null);
    }, function () { cb('No pudimos enviar el enlace.'); });
  }

  // Cambiar la clave pide la actual. Con la sola sesion abierta, cualquiera
  // que encontrara el computador sin bloquear se quedaba con la cuenta para
  // siempre: le bastaba poner una clave suya.
  //
  // La excepcion es quien acaba de probar que es dueno del correo: llego por
  // el enlace para recuperar la clave (la olvido) o entro con un codigo (puede
  // no haber tenido clave nunca). Ahi el correo ya hizo de segundo factor.
  // Lo dice el propio token de Supabase en 'amr': como se autentico y cuando.
  //
  // Es una puerta de la interfaz: quien tenga la sesion y la consola puede
  // llamar updateUser igual. La que no se salta es la del panel de Supabase
  // ('Secure password change'), que exige un codigo enviado al correo.
  var VENTANA_CORREO = 10 * 60;   // segundos desde que probo el correo

  function correoRecienProbado(token) {
    var partes = String(token || '').split('.');
    if (partes.length !== 3) return false;
    try {
      var amr = b64urlJson(partes[1]).amr;
      var ahora = Date.now() / 1000;
      return Array.isArray(amr) && amr.some(function (m) {
        return m && /^(recovery|otp|magiclink|email|email\/signup|invite)$/.test(String(m.method)) &&
               ahora - Number(m.timestamp) < VENTANA_CORREO;
      });
    } catch (e) { return false; }
  }

  // cb(true) si para cambiar la clave hay que escribir la actual.
  function pideClaveActual(cb) {
    var c = cliente();
    if (!c) { cb(true); return; }
    c.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      cb(!correoRecienProbado(s && s.access_token));
    }, function () { cb(true); });
  }

  // cb(err): 'FALTA_CLAVE_ACTUAL' y 'CLAVE_FILTRADA' son codigos para que la
  // pagina decida que mostrar; lo demas es un mensaje listo.
  function cambiarClave(clave, cb, actual) {
    if (!claveValida(clave)) { cb('La clave debe tener al menos ' + CLAVE_MIN + ' caracteres.'); return; }
    pideClaveActual(function (pide) {
      if (pide && !actual) { cb('FALTA_CLAVE_ACTUAL'); return; }
      claveFiltrada(clave, function (mala) {
        if (mala) { cb('CLAVE_FILTRADA'); return; }
        cambiarClaveYa(clave, cb, pide ? actual : null);
      });
    });
  }

  function cambiarClaveYa(clave, cb, actual) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    var cambiar = function () {
      c.auth.updateUser({ password: clave }).then(function (r) {
        if (r && r.error) { cb(motivo(r.error, 'No pudimos cambiar la clave.')); return; }
        cb(null);
      }, function () { cb('No pudimos cambiar la clave.'); });
    };
    if (actual == null) { cambiar(); return; }
    // La clave actual se comprueba entrando de nuevo con ella, contra el
    // correo de la sesion abierta y no contra uno que se escriba.
    c.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      var correo = s && s.user && s.user.email;
      if (!correo) { cb('Su sesión terminó. Vuelva a entrar.'); return; }
      return c.auth.signInWithPassword({ email: correo, password: actual }).then(function (r2) {
        if (r2 && r2.error) {
          var m = String(r2.error.message || '').toLowerCase();
          cb(/rate|seconds|exceed|often|too many/.test(m)
            ? 'Demasiados intentos seguidos. Espere un minuto.'
            : 'La clave actual no es correcta.');
          return;
        }
        cambiar();
      });
    }).then(null, function () { cb('No pudimos comprobar su clave actual.'); });
  }

  function pedirCodigo(correo, cb) {
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    // El codigo sirve para ENTRAR, no para abrir cuentas. Con el valor por
    // omision (true), cualquiera escribia el correo de un tercero y Supabase
    // le creaba una cuenta y le mandaba un mensaje que no pidio. El alta pasa
    // siempre por crearCuenta, que pide nombre y revisa la clave.
    c.auth.signInWithOtp({ email: correo, options: { shouldCreateUser: false } }).then(function (r) {
      if (r && r.error) {
        var m = String(r.error.message || '');
        // Sin cuenta, Supabase contesta "Signups not allowed for otp".
        // Decirlo convertiria este boton en un buscador de quien es cliente:
        // se responde igual que cuando el codigo sale, y el paso siguiente
        // lo explica ("si ese correo tiene cuenta...").
        if (/signups? not allowed|otp_disabled|user not found/i.test(m + ' ' + (r.error.code || ''))) {
          cb(null); return;
        }
        cb(/rate|seconds|exceed|often/i.test(m)
          ? 'Demasiados envíos seguidos. Espere un minuto.'
          : 'No pudimos enviar el código a ese correo.');
      } else cb(null);
    }, function () { cb('No pudimos enviar el código. Revise su conexión.'); });
  }

  // tipo: 'email' para entrar con codigo, 'signup' para confirmar una cuenta
  // recien creada. Son dos verificaciones distintas en Supabase.
  function verificarCodigo(correo, codigo, cb, tipo) {
    if (!/^[0-9]{6,8}$/.test(String(codigo || '').trim())) {
      cb('Ingrese el código que llegó a su correo.'); return;
    }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.verifyOtp({
      email: correo,
      token: String(codigo).trim(),
      type: tipo || 'email'
    }).then(function (r) {
      if (r && r.error) {
        var m = String(r.error.message || '').toLowerCase();
        cb(/expired/.test(m)
          ? 'El código venció. Pida uno nuevo.'
          : 'Código incorrecto. Revise que lo haya copiado completo.');
      } else cb(null);
    }, function () { cb('No pudimos verificar el código.'); });
  }

  // Reenvia el correo de confirmacion de una cuenta recien creada.
  function reenviarConfirmacion(correo, cb) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.resend({ type: 'signup', email: correo }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos reenviar el código.')); return; }
      cb(null);
    }, function () { cb('No pudimos reenviar el código.'); });
  }

  // -------------------------------------------------------------------
  //  Panel de entrada. Se inyecta donde se le indique y avisa por "alEntrar".
  // -------------------------------------------------------------------
  var CSS_ID = 'cuenta-css';
  var CSS =
    '.cta-box{border:1px solid #CFE1F1;border-radius:12px;padding:18px;background:#F7FAFD}' +
    '.cta-box h4{margin:0 0 4px;font-size:16px;color:#1E3A6E;font-weight:700}' +
    '.cta-box p.cta-sub{margin:0 0 14px;font-size:13.5px;color:#5C6168;line-height:1.5}' +
    '.cta-g{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;' +
      'background:#fff;border:1.5px solid #CDD5DF;border-radius:11px;padding:11px 16px;' +
      'font-family:inherit;font-size:15px;font-weight:600;color:#24282D;cursor:pointer;min-height:46px}' +
    '.cta-g:hover{background:#F2F5F9}' +
    '.cta-o{display:flex;align-items:center;gap:10px;margin:14px 0;color:#8B9094;font-size:12.5px;' +
      'text-transform:uppercase;letter-spacing:.6px;font-weight:600}' +
    '.cta-o::before,.cta-o::after{content:"";flex:1;height:1px;background:#DDE5EE}' +
    '.cta-box label{display:block;font-size:13px;font-weight:600;color:#3B4248;margin-bottom:5px}' +
    '.cta-box input{width:100%;box-sizing:border-box;font-family:inherit;font-size:15px;padding:11px 13px;' +
      'border:1.5px solid #CDCFC9;border-radius:11px;min-height:44px;background:#fff}' +
    '.cta-box input:focus{outline:none;border-color:#0B6BB5;box-shadow:0 0 0 4px rgba(11,107,181,.16)}' +
    '.cta-b{width:100%;margin-top:12px;font-family:inherit;font-size:15px;font-weight:600;color:#fff;' +
      'background:#0B6BB5;border:none;border-radius:11px;padding:12px 18px;min-height:46px;cursor:pointer}' +
    '.cta-b:hover{background:#3E93CE} .cta-b:disabled{opacity:.55;cursor:wait}' +
    '.cta-msg{display:none;margin-top:11px;font-size:13.5px;line-height:1.45}' +
    '.cta-msg.err{display:block;color:#B23A2E} .cta-msg.ok{display:block;color:#1A6B3F}' +
    '#cta-codigo{letter-spacing:9px;text-align:center;font-size:20px;font-weight:700;color:#1E3A6E}' +
    '.cta-pie{margin:12px 0 0;font-size:12.5px;color:#8B9094;line-height:1.45;text-align:center}' +
    '.cta-pie a{color:#0B6BB5;font-weight:600}' +
    /* pestanas entrar / crear */
    /* campo con icono a la izquierda */
    '.cta-campo{position:relative;display:flex;align-items:center}' +
    '.cta-campo .cta-ic{position:absolute;left:13px;width:19px;height:19px;color:#8B9BB0;pointer-events:none}' +
    '.cta-campo input{padding-left:42px}' +
    '.cta-campo .cta-ojo + input,.cta-campo input + .cta-ojo ~ input{padding-right:46px}' +
    '#cta-clave{padding-right:46px}' +
    /* enlace para alternar entre entrar y registrarse */
    '.cta-cambia{margin:16px 0 0;text-align:center;font-size:14.5px;color:#5C6168}' +
    '.cta-cambia a{color:#0B6BB5;font-weight:700;text-decoration:underline}' +
    /* proveedores externos, compactos */
    '.cta-proveedores{display:flex;gap:10px;justify-content:center}' +
    '.cta-prov{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-width:150px;' +
      'background:#fff;border:1.5px solid #CDD5DF;border-radius:999px;padding:11px 22px;min-height:48px;' +
      'font-family:inherit;font-size:15px;font-weight:600;color:#24282D;cursor:pointer}' +
    '.cta-prov:hover{background:#F2F5F9;border-color:#B6C1CF}' +
    '.cta-clave-caja{position:relative;display:flex;align-items:center}' +
    '.cta-clave-caja input{padding-right:46px}' +
    /* 44 px es el minimo tactil (Apple HIG). El icono sigue midiendo 19. */
    '.cta-ojo{position:absolute;right:2px;width:44px;height:44px;border:none;background:none;color:#8B9094;'+
      'cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center}' +
    '.cta-ojo:hover{color:#24282D;background:rgba(20,24,30,.05)}' +
    '.cta-ojo svg{width:19px;height:19px}' +
    '.cta-ojo .tacha{opacity:1} .cta-ojo.abierto .tacha{opacity:0}' +
    '.cta-req{margin:7px 0 0;font-size:12.5px;color:#647188}' +
    '.cta-instr{margin:0 0 16px;font-size:14.5px;line-height:1.55;color:#4B5C74;'+
      'background:#F7FAFD;border-left:3px solid #0B6BB5;border-radius:0 9px 9px 0;padding:12px 15px}' +
    '.cta-instr b{color:#1E3A6E;word-break:break-all}' +
    /* acceso de cuenta del encabezado */
    '.cta-nav{position:relative;display:inline-flex;align-items:center}' +
    '.cta-nav-b{display:inline-flex;align-items:center;gap:8px;font-family:inherit;font-size:14.5px;'+
      'font-weight:600;color:#1E3A6E;background:transparent;border:1.5px solid rgba(30,58,110,.22);'+
      'border-radius:11px;padding:8px 14px;min-height:44px;cursor:pointer;white-space:nowrap;'+
      'transition:background .18s,border-color .18s}' +
    '.cta-nav-b:hover{background:rgba(11,107,181,.07);border-color:rgba(30,58,110,.4)}' +
    '.cta-nav-b svg{width:17px;height:17px;flex-shrink:0}' +
    '.cta-ini{width:26px;height:26px;border-radius:50%;background:#0B6BB5;color:#fff;'+
      'display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;'+
      'font-weight:700;text-transform:uppercase;flex-shrink:0}' +
    '.cta-nav-cor{max-width:15ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '@media(max-width:620px){.cta-nav-cor{display:none}}' +
    '.cta-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:230px;background:#fff;'+
      'border:1px solid #DDE5EE;border-radius:13px;box-shadow:0 14px 40px -12px rgba(20,24,30,.28);'+
      'padding:7px;z-index:400;display:none}' +
    '.cta-menu.abierto{display:block}' +
    '.cta-menu .cab{padding:9px 11px 10px;border-bottom:1px solid #EDF3F9;margin-bottom:5px}' +
    '.cta-menu .cab b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;'+
      'color:#8B9094;font-weight:700;margin-bottom:2px}' +
    '.cta-menu .cab span{font-size:13.5px;color:#24282D;word-break:break-all;line-height:1.4}' +
    '.cta-menu a,.cta-menu button{display:flex;width:100%;box-sizing:border-box;align-items:center;'+
      'gap:9px;text-align:left;font-family:inherit;font-size:14.5px;color:#24282D;background:none;'+
      'border:none;border-radius:9px;padding:10px 11px;min-height:44px;cursor:pointer;text-decoration:none}' +
    '.cta-menu a:hover,.cta-menu button:hover{background:#F2F5F9;text-decoration:none}' +
    '.cta-menu hr{border:none;border-top:1px solid #EDF3F9;margin:5px 0}' +
    '.cta-menu .sal{color:#B23A2E}' +
    /* variante para encabezados oscuros */
    '.cta-nav.claro .cta-nav-b{color:#fff;border-color:rgba(255,255,255,.28)}' +
    '.cta-nav.claro .cta-nav-b:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.5)}' +
    '.cta-nav.claro .cta-ini{background:#fff;color:#1E3A6E}' +
    /* cajon de sesion */
    '.cta-velo{position:fixed;inset:0;background:rgba(16,24,40,.52);backdrop-filter:blur(3px);'+
      'z-index:9000;opacity:0;transition:opacity .22s ease}' +
    '.cta-velo.ver{opacity:1}' +
    '.cta-cajon{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;'+
      'z-index:9001;box-shadow:-18px 0 50px -20px rgba(16,24,40,.45);display:flex;'+
      'flex-direction:column;transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.61,.36,1)}' +
    '.cta-cajon.ver{transform:translateX(0)}' +
    '.cta-cajon-int{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 28px 32px}' +
    '.cta-x{position:absolute;top:12px;right:14px;width:44px;height:44px;border:none;background:none;'+
      'font-size:26px;line-height:1;color:#5C6168;cursor:pointer;border-radius:10px}' +
    '.cta-x:hover{background:#F2F5F9;color:#24282D}' +
    '.cta-marca{font-family:Georgia,\'Times New Roman\',serif;font-size:26px;font-weight:600;'+
      'letter-spacing:-.03em;color:#1E3A6E;margin:22px 0 26px;display:block}' +
    '.cta-marca i{font-style:normal;color:#0B6BB5} .cta-marca em{font-style:normal;color:#E5692A}' +
    '.cta-cajon .cta-box{border:none;background:none;padding:0}' +
    '.cta-cajon .cta-box h4{font-size:21px;line-height:1.3;margin-bottom:6px}' +
    '.cta-cajon .cta-box p.cta-sub{font-size:14.5px;margin-bottom:20px}' +
    '.cta-seguro{margin-top:26px;background:#FBF3E3;border:1px solid #E7D3A4;border-radius:11px;'+
      'padding:14px 16px;font-size:13.5px;line-height:1.6;color:#7A5416}' +
    '.cta-seguro b{display:block;color:#9A6B1F;margin-bottom:4px;font-size:14px}' +
    '.cta-volver{display:inline-block;margin-top:22px;font-size:14px;font-weight:600;color:#5C6168;text-decoration:none}' +
    '.cta-volver:hover{color:#1E3A6E}' +
    'body.cta-quieto{overflow:hidden}' +
    '@media (prefers-reduced-motion:reduce){.cta-velo,.cta-cajon{transition:none}}';

  var _ic = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var SVG_SOBRE_CH =
    '<svg class="cta-ic" ' + _ic + '><rect x="3" y="5" width="18" height="14" rx="2"/>' +
    '<path d="M3 7l9 6 9-6"/></svg>';

  var SVG_PERSONA_CH =
    '<svg class="cta-ic" ' + _ic + '><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="12" cy="7" r="4"/></svg>';

  var SVG_LLAVE =
    '<svg class="cta-ic" ' + _ic + '><rect x="4" y="10" width="16" height="10" rx="2"/>' +
    '<path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

  var SVG_OJO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>' +
    '<path class="tacha" d="M4 20L20 4"/></svg>';

  var SVG_SOBRE =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

  var SVG_G =
    '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.4h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.7"/>' +
    '<path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.8 5.2-.1.3C7.9 41 15.4 46 24 46"/>' +
    '<path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.9-5.3-.2.1C2.8 17.1 2 20.4 2 24s.8 6.9 2.4 9.9z"/>' +
    '<path fill="#EA4335" d="M24 10.7c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.5 29.9 2 24 2 15.4 2 7.9 7 4.4 14.1l7.1 5.5c1.8-5.3 6.7-8.9 12.5-8.9"/>' +
    '</svg>';

  function inyectarCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // opciones: { titulo, sub, alEntrar, alCancelar }
  function panel(contenedor, opciones) {
    var o = opciones || {};
    var host = typeof contenedor === 'string' ? document.getElementById(contenedor) : contenedor;
    if (!host) return;
    inyectarCss();

    host.innerHTML =
      '<div class="cta-box">' +
        '<h4 id="cta-tit">' + (o.titulo || 'Entre a su cuenta') + '</h4>' +
        '<p class="cta-sub" id="cta-subt" role="status" aria-live="polite">' + (o.sub || 'Con su cuenta guarda su avance y vuelve a sus asambleas cuando quiera.') + '</p>' +

        '<div id="cta-form">' +
          '<div id="cta-nombre-caja" style="display:none">' +
            '<label for="cta-nombre">Su nombre</label>' +
            '<div class="cta-campo">' + SVG_PERSONA_CH +
              '<input type="text" id="cta-nombre" autocomplete="name" maxlength="80" placeholder="Nombre y apellido">' +
            '</div>' +
          '</div>' +
          '<label for="cta-correo" id="cta-lbl-correo">Correo electrónico</label>' +
          '<div class="cta-campo">' + SVG_SOBRE_CH +
            '<input type="email" id="cta-correo" inputmode="email" autocomplete="email" placeholder="nombre@correo.cl">' +
          '</div>' +
          '<div id="cta-clave-caja">' +
            '<label for="cta-clave" style="margin-top:13px">Clave</label>' +
            '<div class="cta-campo">' + SVG_LLAVE +
              '<input type="password" id="cta-clave" autocomplete="current-password" placeholder="Su clave">' +
              '<button type="button" class="cta-ojo" id="cta-ojo" aria-label="Mostrar la clave">' + SVG_OJO + '</button>' +
            '</div>' +
            '<p class="cta-req" id="cta-req" style="display:none">Al menos ' + CLAVE_MIN + ' caracteres.</p>' +
            '<p class="cta-req" id="cta-sin-clave">¿No tiene clave? Déjela en blanco: le enviamos un código al correo.</p>' +
          '</div>' +
          '<button type="button" class="cta-b" id="cta-hacer">Entrar</button>' +
          '<p class="cta-pie" id="cta-olvide-caja"><a href="#" id="cta-olvide">¿Olvidó su clave?</a></p>' +
          '<p class="cta-cambia"><span id="cta-cambia-txt">¿No tiene cuenta?</span> ' +
            '<a href="#" id="cta-cambia">Regístrese</a></p>' +
        '</div>' +

        '<div id="cta-codigo-paso" style="display:none">' +
          '<p class="cta-instr" id="cta-instr">Le enviamos un código a <b id="cta-dest"></b>. ' +
            'Búsquelo en su correo y escríbalo aquí. Si no aparece, revise el spam.</p>' +
          '<label for="cta-codigo">Código de 6 a 8 dígitos</label>' +
          '<input type="text" id="cta-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="······">' +
          '<button type="button" class="cta-b" id="cta-verificar">Confirmar y entrar</button>' +
          '<p class="cta-pie"><a href="#" id="cta-reenviar">Enviar otro código</a> · ' +
            '<a href="#" id="cta-otro">Volver</a></p>' +
        '</div>' +

        '<div class="cta-msg" id="cta-msg" role="alert"></div>' +

        '<div id="cta-alt">' +
          (PROVEEDOR_GOOGLE
            ? '<div class="cta-o" id="cta-o-txt">o inicie sesión con</div>' +
              '<div class="cta-proveedores">' +
                '<button type="button" class="cta-prov" id="cta-google" aria-label="Continuar con Google">' + SVG_G + '<span>Google</span></button>' +
              '</div>'
            : '') +
          '<p class="cta-pie" id="cta-sincl-caja"><a href="#" id="cta-sincl">Entrar con un código por correo, sin clave</a></p>' +
        '</div>' +

        '<p class="cta-pie">Al continuar acepta los <a href="/terminos" target="_blank" rel="noopener">t&eacute;rminos del servicio</a> ' +
        'y el <a href="/privacidad" target="_blank" rel="noopener">aviso de privacidad</a>.</p>' +
      '</div>';

    var $ = function (id) { return document.getElementById(id); };
    var modo = 'entrar';     // entrar | crear
    var pendiente = null;    // correo esperando su codigo
    var tipoCodigo = 'email';  // 'email' al entrar, 'signup' al confirmar
    var esAlta = false;        // el codigo viene de crear la cuenta sin clave
    var tituloPropio = !!o.titulo;   // lo puso quien abrio el panel

    function aviso(t, clase) {
      var m = $('cta-msg');
      m.innerHTML = t || '';
      m.className = 'cta-msg' + (t ? ' ' + (clase || 'err') : '');
    }
    function ocupado(btn, on, txt) {
      if (!btn) return;
      if (on) { btn.dataset.t = btn.textContent; btn.disabled = true; if (txt) btn.textContent = txt; }
      else { btn.disabled = false; if (btn.dataset.t) btn.textContent = btn.dataset.t; }
    }
    function listo(u) { recordarQueEntro(); if (o.alEntrar) o.alEntrar(u); }

    // ---- pestañas
    function verModo(m) {
      modo = m;
      var entrar = m === 'entrar';
      $('cta-cambia-txt').textContent = entrar ? '¿No tiene cuenta?' : '¿Ya tiene cuenta?';
      $('cta-cambia').textContent = entrar ? 'Regístrese' : 'Inicie sesión';
      if ($('cta-o-txt')) $('cta-o-txt').textContent = entrar ? 'o inicie sesión con' : 'o regístrese con';
      $('cta-hacer').textContent = entrar ? 'Entrar' : 'Crear mi cuenta';
      // Desde el 07-10-2026 la cuenta se crea sin clave: nombre, correo y un
      // código. La clave queda para quien ya tiene una, al entrar.
      $('cta-clave-caja').style.display = entrar ? '' : 'none';
      $('cta-req').style.display = 'none';
      $('cta-olvide-caja').style.display = entrar ? 'block' : 'none';
      $('cta-nombre-caja').style.display = entrar ? 'none' : 'block';
      // El codigo por correo solo sirve para entrar (no abre cuentas): en
      // «Crear cuenta» seria un camino que no lleva a ninguna parte.
      $('cta-sincl-caja').style.display = entrar ? '' : 'none';
      $('cta-lbl-correo').style.marginTop = entrar ? '' : '13px';
      if (!tituloPropio) {
        $('cta-tit').textContent = entrar ? 'Entre a su cuenta' : 'Cree su cuenta';
        $('cta-subt').textContent = entrar
          ? 'Con su cuenta guarda su avance y vuelve a sus asambleas cuando quiera.'
          : 'Toma un minuto: su nombre y su correo. Le enviamos un código para entrar, sin claves que recordar.';
      }
      aviso('');
    }
    $('cta-cambia').addEventListener('click', function (ev) {
      ev.preventDefault();
      verModo(modo === 'entrar' ? 'crear' : 'entrar');
      var foco = modo === 'crear' ? $('cta-nombre') : $('cta-correo');
      try { foco.focus(); } catch (e) {}
    });

    // ---- ver / ocultar la clave
    $('cta-ojo').addEventListener('click', function () {
      var i = $('cta-clave');
      var oculta = i.type === 'password';
      i.type = oculta ? 'text' : 'password';
      this.setAttribute('aria-label', oculta ? 'Ocultar la clave' : 'Mostrar la clave');
      this.classList.toggle('abierto', oculta);
      i.focus();
    });

    // ---- entrar o crear
    $('cta-hacer').addEventListener('click', function () {
      var btn = this;
      var correo = $('cta-correo').value.trim().toLowerCase();
      var clave = $('cta-clave').value;
      aviso('');
      if (modo === 'entrar' && !clave) {
        // Sin clave no hay error: se le manda el código, que es como entra
        // quien creó la cuenta sin clave.
        if (!correoValido(correo)) { aviso('Revise el correo electrónico.'); $('cta-correo').focus(); return; }
        ocupado(btn, true, 'Enviando…');
        pedirCodigo(correo, function (err) {
          ocupado(btn, false);
          if (err) { aviso(err); return; }
          irAlCodigo(correo, 'email');
        });
      } else if (modo === 'entrar') {
        ocupado(btn, true, 'Entrando…');
        entrarConClave(correo, clave, function (err) {
          ocupado(btn, false);
          if (err) { aviso(err); return; }
          usuario(listo);
        });
      } else {
        ocupado(btn, true, 'Creando…');
        crearCuentaConCodigo(correo, function (err) {
          ocupado(btn, false);
          if (err) { aviso(err); return; }
          // El código llega al correo: aquí se escribe y se entra.
          irAlCodigo(correo, 'alta');
        }, $('cta-nombre').value);
      }
    });

    // ---- recuperar la clave
    $('cta-olvide').addEventListener('click', function (ev) {
      ev.preventDefault();
      var correo = $('cta-correo').value.trim().toLowerCase();
      aviso('');
      recuperarClave(correo, function (err) {
        if (err) { aviso(err); return; }
        // aviso() escribe con innerHTML: el correo va escapado, como en el
        // resto del panel.
        aviso('Le enviamos un enlace a <b>' + esc(correo) + '</b> para poner una clave nueva.', 'ok');
      });
    });

    // Muestra el paso del codigo, venga de crear la cuenta o de pedir uno
    // para entrar. La diferencia esta en tipoCodigo.
    function irAlCodigo(correo, tipo) {
      pendiente = correo;
      esAlta = tipo === 'alta';
      // Una cuenta creada con código se verifica como cualquier código de
      // entrada (tipo 'email' en Supabase).
      tipoCodigo = esAlta ? 'email' : tipo;
      $('cta-dest').textContent = correo;
      $('cta-instr').innerHTML = esAlta
        ? 'Le enviamos un código a <b>' + esc(correo) + '</b>. Búsquelo en su correo y escríbalo aquí para entrar. Si no aparece, revise el spam.'
        : tipo === 'signup'
        ? 'Su cuenta quedó creada. Para activarla, escriba el código que enviamos a <b>' + esc(correo) + '</b>. Si no aparece, revise el spam.'
        // Condicional a proposito: pedirCodigo responde igual exista o no la
        // cuenta, y este texto no puede desmentirlo.
        : 'Si <b>' + esc(correo) + '</b> tiene una cuenta, le enviamos un código. Búsquelo en su correo y escríbalo aquí. ' +
          'Si no aparece, revise el spam. Si todavía no tiene cuenta, vuelva y regístrese.';
      $('cta-tit').textContent = tipo === 'signup' ? 'Confirme su correo' : 'Escriba su código';
      if (esAlta) $('cta-tit').textContent = 'Escriba su código';
      $('cta-subt').style.display = 'none';
      $('cta-verificar').textContent = tipo === 'signup' ? 'Confirmar y entrar' : 'Entrar';
      $('cta-form').style.display = 'none';
      $('cta-alt').style.display = 'none';
      $('cta-codigo-paso').style.display = 'block';
      setTimeout(function () { try { $('cta-codigo').focus(); } catch (e) {} }, 60);
    }

    // ---- alternativa: codigo por correo
    $('cta-sincl').addEventListener('click', function () {
      var btn = this;
      var correo = $('cta-correo').value.trim().toLowerCase();
      aviso('');
      if (!correoValido(correo)) { aviso('Escriba su correo arriba y vuelva a apretar.'); $('cta-correo').focus(); return; }
      ocupado(btn, true, 'Enviando…');
      pedirCodigo(correo, function (err) {
        ocupado(btn, false);
        if (err) { aviso(err); return; }
        irAlCodigo(correo, 'email');
        aviso('');
      });
    });

    $('cta-verificar').addEventListener('click', function () {
      var btn = this;
      aviso('');
      ocupado(btn, true, 'Verificando…');
      verificarCodigo(pendiente, $('cta-codigo').value, function (err) {
        ocupado(btn, false);
        if (err) { aviso(err); return; }
        usuario(listo);
      }, tipoCodigo);
    });

    $('cta-otro').addEventListener('click', function (ev) {
      ev.preventDefault();
      pendiente = null; aviso('');
      $('cta-codigo-paso').style.display = 'none';
      $('cta-form').style.display = 'block';
      $('cta-alt').style.display = 'block';
      $('cta-subt').style.display = '';
      verModo(modo);   // repone titulo y subtitulo del modo en curso
    });

    // ---- reenviar el codigo
    $('cta-reenviar').addEventListener('click', function (ev) {
      ev.preventDefault();
      if (!pendiente) return;
      aviso('Enviando…', 'ok');
      var listoAviso = function (err) {
        if (err) { aviso(err); return; }
        aviso(tipoCodigo === 'signup'
          ? 'Le enviamos otro código a ' + esc(pendiente) + '.'
          : 'Si ' + esc(pendiente) + ' tiene una cuenta, le enviamos otro código.', 'ok');
      };
      if (esAlta) {
        crearCuentaConCodigo(pendiente, function (err) {
          if (err) { aviso(err); return; }
          aviso('Le enviamos otro código a ' + esc(pendiente) + '.', 'ok');
        }, $('cta-nombre').value);
      } else if (tipoCodigo === 'signup') reenviarConfirmacion(pendiente, listoAviso);
      else pedirCodigo(pendiente, listoAviso);
    });

    // ---- Google (solo si el proveedor esta habilitado)
    if ($('cta-google')) {
      $('cta-google').addEventListener('click', function () {
        aviso('');
        conGoogle(global.location.href, function (err) { if (err) aviso(err); });
      });
    }

    // ---- Enter avanza
    $('cta-nombre').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-correo').focus(); }
    });
    $('cta-correo').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (modo === 'crear') $('cta-hacer').click(); else $('cta-clave').focus();
    });
    $('cta-clave').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-hacer').click(); }
    });
    $('cta-codigo').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-verificar').click(); }
    });

    // Sin modo pedido, manda lo que sabemos del equipo.
    if (o.modo === 'crear' || (!o.modo && !equipoConocido())) verModo('crear');
    else verModo('entrar');
  }

  // -------------------------------------------------------------------
  //  Acceso de cuenta del encabezado
  // -------------------------------------------------------------------
  // Se monta en cualquier pagina: si no hay sesion muestra "Entrar", y si la
  // hay muestra la inicial del correo con un menu. El destino tras entrar es
  // /cuenta, que es donde vive el perfil.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var SVG_PERSONA =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  // Cada nav montada deja aquí cómo repintarse. Lo usa refrescarNav() cuando
  // cambia algo que la nav muestra: hoy, el nombre de la persona.
  var navsMontadas = [];

  function refrescarNav() {
    navsMontadas.forEach(function (r) {
      try { r.pintar(); } catch (e) { /* la nav pudo desaparecer del DOM */ }
    });
  }

  function montarNav(contenedor, opciones) {
    var o = opciones || {};
    var host = typeof contenedor === 'string' ? document.getElementById(contenedor) : contenedor;
    if (!host) return;
    inyectarCss();
    host.classList.add('cta-nav');
    if (o.claro) host.classList.add('claro');

    function sinSesion() {
      host.innerHTML =
        '<button type="button" class="cta-nav-b" id="cta-nav-entrar">' +
        SVG_PERSONA + '<span>Entrar</span></button>';
      document.getElementById('cta-nav-entrar').addEventListener('click', function () {
        // Quien entra desde la cabecera va a su panel: es lo que vino a buscar.
        // Recargar la misma pagina lo dejaba donde estaba, sin senal de que
        // algo habia pasado. En /acta y en la consulta no pasa por aqui: ahi
        // el cajon es el portero y se vuelve a lo que se estaba haciendo.
        // Si el portero llega con este cajon abierto (en /acta pregunta
        // recien con el evento load, y la cabecera ya esta pintada), manda
        // el: ir al panel sacaba a la persona de la pagina que la esperaba.
        abrirCajon({ alEntrar: function () { location.href = '/cuenta'; }, cedeAlPortero: true });
      });
    }

    function conSesion(u) {
      // Se muestra el nombre si lo tenemos; el correo queda en el menu, que es
      // donde sirve para confirmar con que cuenta esta.
      var rotulo = u.nombre || u.correo || '';
      var inicial = (rotulo || '?').charAt(0);
      host.innerHTML =
        '<button type="button" class="cta-nav-b" id="cta-nav-abre" aria-haspopup="menu" aria-expanded="false" ' +
          'aria-label="Su cuenta: ' + esc(rotulo) + '">' +
          '<span class="cta-ini" aria-hidden="true">' + esc(inicial) + '</span>' +
          '<span class="cta-nav-cor">' + esc(rotulo) + '</span>' +
        '</button>' +
        '<div class="cta-menu" id="cta-nav-menu" role="menu">' +
          '<div class="cab"><b>' + (u.nombre ? esc(u.nombre) : 'Su cuenta') + '</b>' +
            '<span>' + esc(u.correo) + '</span></div>' +
          '<a href="/cuenta" role="menuitem">Mi perfil</a>' +
          '<a href="/acta" role="menuitem">Nueva acta</a>' +
          '<a href="/consulta/" role="menuitem">Consulta por escrito</a>' +
          '<hr>' +
          '<button type="button" class="sal" id="cta-nav-salir" role="menuitem">Cerrar sesión</button>' +
        '</div>';

      var boton = document.getElementById('cta-nav-abre');
      var menu = document.getElementById('cta-nav-menu');
      boton.addEventListener('click', function (e) {
        e.stopPropagation();
        var abierto = menu.classList.toggle('abierto');
        boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      });
      document.getElementById('cta-nav-salir').addEventListener('click', function (b) {
        var el = b.target;
        el.disabled = true; el.textContent = 'Saliendo…';
        salir(function () { location.href = '/'; });
      });
    }

    // Estos van en el contenedor, no en los botones: los botones se
    // reemplazan cada vez que se repinta, y los oyentes se irían acumulando.
    function cerrarMenu() {
      var menu = host.querySelector('.cta-menu');
      var boton = host.querySelector('.cta-nav-b');
      if (menu) menu.classList.remove('abierto');
      if (boton) boton.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) cerrarMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cerrarMenu();
    });

    function pintar() {
      usuario(function (u) { if (u) conSesion(u); else sinSesion(); });
    }

    // Si esta misma nav ya estaba montada, se reemplaza su pintor en vez de
    // agregar otro.
    var yaEstaba = navsMontadas.filter(function (r) { return r.host === host; })[0];
    if (yaEstaba) yaEstaba.pintar = pintar;
    else navsMontadas.push({ host: host, pintar: pintar });

    pintar();
  }

  // -------------------------------------------------------------------
  //  Cajon de sesion
  // -------------------------------------------------------------------
  // Unica superficie de inicio de sesion del sitio. Con bloqueante:true no se
  // puede cerrar: es el portero de /acta y de la consulta por escrito.
  var abiertoCajon = null;

  function cerrarCajon() {
    if (!abiertoCajon) return;
    var c = abiertoCajon; abiertoCajon = null;
    // Lo que esperaba a que la persona entrara se descarta: cerro sin entrar.
    // (Al entrar, la fila se toma antes de llamar aqui.)
    c.alEntrar = [];
    (c.apagados || []).forEach(function (hijo) {
      hijo.removeAttribute('aria-hidden');
      hijo.inert = false;
    });
    c.cajon.classList.remove('ver');
    c.velo.classList.remove('ver');
    document.body.classList.remove('cta-quieto');
    setTimeout(function () {
      if (c.cajon.parentNode) c.cajon.remove();
      if (c.velo.parentNode) c.velo.remove();
    }, 300);
    if (c.foco && c.foco.focus) { try { c.foco.focus(); } catch (e) {} }
  }

  // Un pedido bloqueante que llega con un cajon que se puede cerrar abierto
  // (el de la cabecera, apretado justo antes de que el portero preguntara)
  // lo deja sin salida, como si lo hubiera abierto el portero. Si no, la
  // persona lo cerraba, el alEntrar del portero se descartaba con el y la
  // pagina quedaba esperando a un portero que no volvia a abrir.
  function volverBloqueante(rec) {
    if (rec.bloqueante) return;
    rec.bloqueante = true;
    // Lo que solo servia fuera de una pagina con portero (ir al panel desde
    // la cabecera) se retira de la fila: se llamaba primero, navegaba a
    // /cuenta y el portero, aunque tambien se llamaba, quedaba en una
    // pagina que se estaba yendo.
    rec.alEntrar = rec.alEntrar.filter(function (f) { return rec.cedibles.indexOf(f) < 0; });
    try { if (rec.x) rec.x.remove(); } catch (e) {}
    var interior = rec.cajon.querySelector && rec.cajon.querySelector('.cta-cajon-int');
    if (interior) {
      var volver = document.createElement('a');
      volver.className = 'cta-volver';
      volver.href = '/';
      volver.textContent = '← Volver al inicio';
      interior.appendChild(volver);
    }
  }

  // opciones: { titulo, sub, bloqueante, alEntrar, cedeAlPortero }
  // cedeAlPortero: este alEntrar se descarta si un pedido bloqueante llega
  // con el cajon abierto (ver volverBloqueante).
  function abrirCajon(opciones) {
    var o = opciones || {};
    if (abiertoCajon) {
      // El cajon es uno solo: un segundo pedido no abre otro. Pero tampoco
      // se ignora, que es lo que pasaba antes: su alEntrar nunca se llamaba
      // y la pagina que lo pidio quedaba esperando (en /acta piden la sesion
      // a la vez el portero de acta-1.js y la vuelta del pago de acta-2.js).
      // Queda en la fila y se llama, en orden, cuando la persona entra.
      if (typeof o.alEntrar === 'function') {
        abiertoCajon.alEntrar.push(o.alEntrar);
        if (o.cedeAlPortero) abiertoCajon.cedibles.push(o.alEntrar);
      }
      if (o.bloqueante) volverBloqueante(abiertoCajon);
      return;
    }
    inyectarCss();

    var foco = document.activeElement;
    var velo = document.createElement('div');
    velo.className = 'cta-velo';

    var cajon = document.createElement('div');
    cajon.className = 'cta-cajon';
    cajon.setAttribute('role', 'dialog');
    cajon.setAttribute('aria-modal', 'true');
    cajon.setAttribute('aria-label', 'Entrar a su cuenta');
    cajon.innerHTML =
      (o.bloqueante ? '' : '<button type="button" class="cta-x" id="cta-cerrar" aria-label="Cerrar">&times;</button>') +
      '<div class="cta-cajon-int">' +
        '<span class="cta-marca">acta<i>viva</i><em>.</em></span>' +
        '<div id="cta-cajon-host"></div>' +
        '<div class="cta-seguro">' +
          '<b>Cuide su cuenta</b>' +
          'Nunca le pediremos su clave por teléfono, por mensaje ni por correo. ' +
          'Los correos que le enviamos solo contienen su código de acceso, su comprobante ' +
          'o la constancia de su voto: jamás le pedimos datos de tarjetas.' +
        '</div>' +
        (o.bloqueante ? '<a class="cta-volver" href="/">← Volver al inicio</a>' : '') +
      '</div>';

    document.body.appendChild(velo);
    document.body.appendChild(cajon);
    document.body.classList.add('cta-quieto');

    var apagados = [];
    [].slice.call(document.body.children).forEach(function (hijo) {
      if (hijo === cajon || hijo === velo) return;
      if (hijo.tagName === 'SCRIPT' || hijo.tagName === 'STYLE') return;
      apagados.push(hijo);
      hijo.setAttribute('aria-hidden', 'true');
      hijo.inert = true;
    });

    // alEntrar es la fila de lo que espera a que la persona entre: el de
    // quien abrio el cajon y los de los pedidos que llegaron con el abierto.
    var este = abiertoCajon = {
      cajon: cajon, velo: velo, foco: foco, apagados: apagados, bloqueante: !!o.bloqueante,
      alEntrar: typeof o.alEntrar === 'function' ? [o.alEntrar] : [], x: null,
      cedibles: (o.cedeAlPortero && typeof o.alEntrar === 'function') ? [o.alEntrar] : []
    };

    // un cuadro para que la transicion arranque desde fuera de la pantalla
    requestAnimationFrame(function () {
      velo.classList.add('ver');
      cajon.classList.add('ver');
    });

    panel('cta-cajon-host', {
      titulo: o.titulo,
      sub: o.sub,
      alEntrar: function (u) {
        // La persona cerro el cajon antes de que terminara de entrar: lo que
        // esperaba se descarto con el. La sesion igual quedo abierta, y la
        // cabecera tiene que mostrarlo; recargar podia llevarse lo que
        // hubiera escrito en la pagina.
        if (abiertoCajon !== este) { refrescarNav(); return; }
        // La fila se toma antes de cerrar, porque cerrarCajon la descarta.
        var esperan = este.alEntrar;
        este.alEntrar = [];
        cerrarCajon();
        // Nadie pidio nada al entrar: se recarga, para que la pagina se vea
        // con la sesion. Con algo en la fila no, que la recarga lo cortaria.
        if (!esperan.length) { location.reload(); return; }
        // Un error en uno no deja sin llamar a los que siguen (el portero
        // de la pagina quedaria cerrado); se relanza aparte para que igual
        // se vea en la consola, como en recuperarPagos.
        esperan.forEach(function (f) {
          try { f(u); } catch (e) { setTimeout(function () { throw e; }, 0); }
        });
      }
    });

    var campo = document.getElementById('cta-correo');
    if (campo) setTimeout(function () { try { campo.focus(); } catch (e) {} }, 320);

    // Cerrar lo decide la persona, y solo mientras este cajon siga abierto y
    // no se haya vuelto bloqueante (volverBloqueante).
    var cerrarSiSePuede = function () {
      if (abiertoCajon === este && !este.bloqueante) cerrarCajon();
    };
    if (!o.bloqueante) {
      este.x = document.getElementById('cta-cerrar');
      este.x.addEventListener('click', cerrarSiSePuede);
      velo.addEventListener('click', cerrarSiSePuede);
      document.addEventListener('keydown', function esc(e) {
        if (e.key !== 'Escape') return;
        // Cerrado este cajon, el oyente sobra. Y no puede cerrar el que se
        // abra despues, que puede ser el portero: antes bastaba que hubiera
        // alguno abierto.
        if (abiertoCajon !== este) { document.removeEventListener('keydown', esc); return; }
        cerrarSiSePuede();
      });
    }

    // el foco no se escapa del cajon mientras esta abierto
    cajon.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = cajon.querySelectorAll('a[href],button:not([disabled]),input,select,textarea');
      if (!f.length) return;
      var primero = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });
  }

  // Portero: deja pasar si hay sesion; si no, abre el cajon sin salida.
  // Antes de dejar pasar se devuelven las llaves de pago que quedaron
  // anotadas al cerrar sesion: la pagina que viene detras las lee apenas
  // arranca. Sin nada anotado, recuperarPagos contesta en el acto.
  // Si el cajon ya esta abierto (otro pedido de sesion en la misma pagina),
  // este alEntrar espera en su fila y se llama cuando la persona entra,
  // despues de los que llegaron antes (ver abrirCajon).
  function exigirSesion(opciones, alEntrar) {
    var o = opciones || {};
    usuario(function (u) {
      if (u) { recuperarPagos(function () { if (alEntrar) alEntrar(u); }); return; }
      abrirCajon({
        titulo: o.titulo || 'Entre para continuar',
        // El codigo por correo ya no abre cuentas (AUTH-03): el texto no
        // puede prometer que basta con el.
        sub: o.sub || 'Necesita una cuenta para usar esta herramienta. Entre, o cree la suya en un minuto.',
        bloqueante: true,
        alEntrar: function (u2) {
          recuperarPagos(function () { if (alEntrar) alEntrar(u2); else location.reload(); });
        }
      });
    });
  }

  /* ============ ACEPTACION DE LOS TERMINOS ============
   *  Ley 19.496 art. 12 A. La casilla nace VACIA: premarcarla no es aceptar.
   *  La version que se acepta viaja al servidor y queda con la orden, que es
   *  lo que permite acreditar despues que hubo consentimiento y sobre que
   *  texto. Si los terminos cambian de fecha, cambia aqui y en _worker.js
   *  -hay una prueba que no deja que se desincronicen-.
   */
  var TERMINOS_VERSION = '2026-09-28';

  function terminosHtml(id) {
    return '<label for="' + id + '" style="display:flex;gap:9px;align-items:flex-start;' +
      'font-size:13.5px;line-height:1.5;margin:0 0 12px;cursor:pointer;min-height:44px">' +
      '<input type="checkbox" id="' + id + '" style="width:18px;height:18px;margin:2px 0 0;' +
      'flex:none;cursor:pointer">' +
      '<span>He leído y acepto los <a href="/terminos" target="_blank" rel="noopener">términos ' +
      'del servicio</a> y la <a href="/privacidad" target="_blank" rel="noopener">declaración ' +
      'de privacidad</a>.</span></label>';
  }

  function terminosAceptados(id) {
    var e = document.getElementById(id);
    return !!(e && e.checked);
  }

  global.Cuenta = {
    equipoConocido: equipoConocido,
    terminos: {
      VERSION: TERMINOS_VERSION,
      html: terminosHtml,
      aceptados: terminosAceptados,
      AVISO: 'Para continuar, acepte los términos del servicio.'
    },
    // Un solo cliente para toda la pagina. Si cada modulo crea el suyo, la
    // sesion que abre uno no la ve el otro y auth.uid() llega nulo a Postgres.
    cliente: cliente,
    usuario: usuario,
    tokenDeAcceso: tokenDeAcceso,
    recuperarPagos: recuperarPagos,
    anotarPago: anotarPago,
    salir: salir,
    panel: panel,
    montarNav: montarNav,
    abrirCajon: abrirCajon,
    cerrarCajon: cerrarCajon,
    exigirSesion: exigirSesion,
    conGoogle: conGoogle,
    pedirCodigo: pedirCodigo,
    verificarCodigo: verificarCodigo,
    correoValido: correoValido,
    claveValida: claveValida,
    crearCuenta: crearCuenta,
    crearCuentaConCodigo: crearCuentaConCodigo,
    entrarConClave: entrarConClave,
    recuperarClave: recuperarClave,
    cambiarClave: cambiarClave,
    pideClaveActual: pideClaveActual,
    guardarNombre: guardarNombre,
    reenviarConfirmacion: reenviarConfirmacion
  };
})(window);
