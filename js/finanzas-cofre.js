/* =====================================================================
 *  Cofre de las cuentas del condominio  (CN-003, revision del 30-09-2026)
 *
 *  Las cuentas viven solo en este navegador, y en un equipo compartido -la
 *  conserjeria- las ve cualquiera que abra /finanzas. Si la persona las
 *  protege con una contrasena, la copia del equipo queda cifrada:
 *
 *    * AES-GCM de 256 bits, con una clave que se deriva de la contrasena
 *      (PBKDF2-SHA-256, 600.000 vueltas, sal al azar de 16 bytes) y un IV
 *      al azar de 12 bytes en cada guardado. El nombre de la copia va como
 *      dato autenticado: un texto cifrado para otra cosa no se acepta.
 *    * La clave vive solo en la memoria de esta pestana, como CryptoKey no
 *      exportable. Ni ella ni la contrasena se escriben en ninguna parte. Al
 *      cerrar la pestana, recargarla, bloquear o cerrar sesion, se pierde,
 *      y para volver a ver las cuentas hay que escribir la contrasena.
 *    * Sin la contrasena no hay forma de abrir la copia, tampoco para
 *      nosotros: por eso la pagina obliga a bajar un respaldo antes de
 *      protegerla.
 *
 *  No protege de quien usa el equipo MIENTRAS la pestana esta abierta y
 *  desbloqueada, ni de un programa malicioso instalado en el equipo, ni el
 *  archivo de respaldo, que la persona guarda donde quiere.
 *
 *  No sabe nada de la pagina: recibe y devuelve texto. La pagina
 *  (js/finanzas-1.js) decide que se guarda y cuando.
 * ===================================================================== */
(function (global) {
  'use strict';

  var CLAVE = 'actaviva_finanzas_cifrado_v1';
  var CONTEXTO = 'actaviva_finanzas_v1';
  var VUELTAS = 600000;
  var MINIMO = 10;

  var llave = null;    // CryptoKey de esta pestana, o null
  var sal = null;      // la de la copia abierta: un guardado no la cambia
  var vueltas = VUELTAS;
  var cola = Promise.resolve();

  function cripto() {
    var c = global.crypto;
    return c && c.subtle && typeof c.getRandomValues === 'function' ? c : null;
  }
  function almacen() {
    try { return global.localStorage || null; } catch (e) { return null; }
  }
  function bytes(texto) { return new global.TextEncoder().encode(texto); }
  function aB64(u8) {
    var s = '';
    for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return global.btoa(s);
  }
  function deB64(b) {
    var s = global.atob(String(b || ''));
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  // La copia cifrada, o null si no hay; { danada: true } si hay algo que no
  // se puede leer. Las vueltas se leen de la copia (una version futura puede
  // subirlas), dentro de un rango: menos no protegeria, mas colgaria la pagina.
  function leer() {
    var ls = almacen();
    if (!ls) return null;
    var raw = null;
    try { raw = ls.getItem(CLAVE); } catch (e) { return null; }
    if (raw == null) return null;
    try {
      var d = JSON.parse(raw);
      var it = Number(d && d.it);
      if (!d || d.v !== 1 || !(it >= 100000 && it <= 10000000)) return { danada: true };
      var r = { sal: deB64(d.sal), iv: deB64(d.iv), ct: deB64(d.ct), it: it };
      if (r.sal.length !== 16 || r.iv.length !== 12 || r.ct.length < 16) return { danada: true };
      return r;
    } catch (e) { return { danada: true }; }
  }

  function derivar(contrasena, s, it) {
    var c = cripto();
    return c.subtle.importKey('raw', bytes(contrasena), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return c.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: s, iterations: it },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }
  function cifrar(k, texto) {
    var c = cripto();
    var iv = c.getRandomValues(new Uint8Array(12));
    return c.subtle.encrypt({ name: 'AES-GCM', iv: iv, additionalData: bytes(CONTEXTO) }, k, bytes(texto))
      .then(function (ct) { return { iv: iv, ct: new Uint8Array(ct) }; });
  }
  function descifrar(k, d) {
    return cripto().subtle.decrypt({ name: 'AES-GCM', iv: d.iv, additionalData: bytes(CONTEXTO) }, k, d.ct)
      .then(function (b) { return new global.TextDecoder().decode(b); });
  }
  function escribir(s, it, c) {
    var ls = almacen();
    if (!ls) throw new Error('sin_almacen');
    ls.setItem(CLAVE, JSON.stringify({
      v: 1, alg: 'AES-GCM-256', kdf: 'PBKDF2-SHA-256', it: it,
      sal: aB64(s), iv: aB64(c.iv), ct: aB64(c.ct)
    }));
  }

  global.CofreFinanzas = {
    CLAVE: CLAVE,
    MINIMO: MINIMO,

    // El navegador sabe cifrar (WebCrypto solo existe en https y localhost).
    disponible: function () { return !!cripto(); },
    // Hay una copia protegida en este equipo (abierta o no).
    protegido: function () { return leer() !== null; },
    // Esta pestana tiene la clave.
    abierto: function () { return !!llave; },

    // Devuelve el texto guardado. Rechaza con 'contrasena_incorrecta' (que
    // tambien es lo que dice una copia alterada: AES-GCM no distingue) o
    // 'copia_danada'.
    abrir: function (contrasena) {
      var d = leer();
      if (!d) return Promise.reject(new Error('sin_copia_protegida'));
      if (d.danada) return Promise.reject(new Error('copia_danada'));
      if (!cripto()) return Promise.reject(new Error('sin_cifrado'));
      return derivar(String(contrasena == null ? '' : contrasena), d.sal, d.it).then(function (k) {
        return descifrar(k, d).then(function (texto) {
          llave = k; sal = d.sal; vueltas = d.it;
          return texto;
        }, function () { throw new Error('contrasena_incorrecta'); });
      });
    },

    // Cifra el texto con una contrasena nueva y lo deja escrito. No da nada
    // por protegido sin leer lo escrito y descifrarlo de vuelta.
    proteger: function (texto, contrasena) {
      contrasena = String(contrasena == null ? '' : contrasena);
      if (contrasena.length < MINIMO) return Promise.reject(new Error('contrasena_corta'));
      if (!cripto()) return Promise.reject(new Error('sin_cifrado'));
      var s = cripto().getRandomValues(new Uint8Array(16));
      return derivar(contrasena, s, VUELTAS).then(function (k) {
        return cifrar(k, texto).then(function (c) {
          escribir(s, VUELTAS, c);
          var d = leer();
          if (!d || d.danada) throw new Error('verificacion_fallida');
          return descifrar(k, d).then(function (t) {
            if (t !== texto) throw new Error('verificacion_fallida');
            llave = k; sal = s; vueltas = VUELTAS;
          });
        });
      });
    },

    // Guarda con la clave abierta. En fila: dos guardados seguidos se
    // escriben en el orden en que se pidieron.
    guardar: function (texto) {
      var k = llave, s = sal, it = vueltas;
      if (!k) return Promise.reject(new Error('cofre_cerrado'));
      cola = cola.catch(function () {}).then(function () {
        return cifrar(k, texto).then(function (c) { escribir(s, it, c); });
      });
      return cola;
    },

    // Cuando terminen los guardados pendientes (antes de bloquear o recargar).
    esperar: function () { return cola.catch(function () {}); },

    // Suelta la clave. La copia queda cifrada en el equipo.
    cerrar: function () { llave = null; sal = null; },

    // Borra la copia cifrada. La pagina lo hace al quitar la proteccion
    // (despues de escribir la copia en claro) o cuando la persona decide
    // empezar de cero sin la contrasena.
    olvidar: function () {
      llave = null; sal = null;
      var ls = almacen();
      if (ls) { try { ls.removeItem(CLAVE); } catch (e) {} }
    }
  };
})(typeof window !== 'undefined' ? window : this);
