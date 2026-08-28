/* =====================================================================
 *  BANCO DE PRUEBAS — no forma parte del producto
 *
 *  Sustituye dos cosas para poder recorrer el flujo completo sin
 *  Supabase y sin cuenta:
 *
 *    1. el cliente de Postgres, por uno que guarda en localStorage;
 *    2. la sesion, por una que siempre esta abierta.
 *
 *  Ya no hay pasarela que simular: el servicio es gratis.
 *
 *  Lo que NO sustituye: la aplicacion. acta-comite-1.js corre entero y
 *  sin saber que esta en pruebas, incluido el cierre del acta y la
 *  emision del numero. Por eso sirve para ver como se comporta de verdad.
 *
 *  ─────────────────────────────────────────────────────────────────
 *  ESTE ARCHIVO NO SE COPIA AL SITIO. Vive aparte a proposito: en
 *  produccion nadie deberia poder reemplazar la base por localStorage.
 *  ───────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  var BANCO = 'prueba_actas_comite';   // las filas
  var SERIE = 'prueba_folio_serie';    // el correlativo del folio

  function filas() {
    try { return JSON.parse(localStorage.getItem(BANCO)) || []; } catch (e) { return []; }
  }
  function guardar(f) {
    localStorage.setItem(BANCO, JSON.stringify(f));
  }
  function uuid() {
    return 'pru-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }
  function ahora() { return new Date().toISOString(); }

  function log(que, dato) {
    if (global.console) console.log('%c[banco de pruebas]', 'color:#0B6BB5;font-weight:bold', que, dato || '');
  }

  /* ───────── consulta encadenable ─────────
   * Imita lo justo de supabase-js que usa la aplicacion:
   *   .from(t).insert(x).select(cols)
   *   .from(t).update(x).eq(c,v).select(cols)
   *   .from(t).select(cols).is(c,v).order(c,o).limit(n)
   * y se resuelve al hacer .then(), como una promesa.
   */
  function Consulta(tabla) {
    this.tabla = tabla;
    this.op = 'select';
    this.datos = null;
    this.filtros = [];
    this.orden = null;
    this.tope = null;
  }
  Consulta.prototype.insert = function (x) { this.op = 'insert'; this.datos = x; return this; };
  Consulta.prototype.update = function (x) { this.op = 'update'; this.datos = x; return this; };
  Consulta.prototype.delete = function ()  { this.op = 'delete'; return this; };
  Consulta.prototype.select = function ()  { return this; };
  Consulta.prototype.eq  = function (c, v) { this.filtros.push({ c: c, v: v, modo: 'eq' }); return this; };
  Consulta.prototype.is  = function (c, v) { this.filtros.push({ c: c, v: v, modo: 'is' }); return this; };
  Consulta.prototype.order = function (c, o) { this.orden = { c: c, asc: !(o && o.ascending === false) }; return this; };
  Consulta.prototype.limit = function (n) { this.tope = n; return this; };
  Consulta.prototype.single = function () { this.tope = 1; this.uno = true; return this; };

  Consulta.prototype.correr = function () {
    var todas = filas();
    var fila, i;

    if (this.op === 'insert') {
      fila = {
        id: uuid(),
        // Los triggers de Postgres reponen esto pase lo que pase; aqui
        // se hace igual, para que la prueba no sea mas permisiva que
        // la realidad.
        folio: null, finalizada_en: null,
        creada: ahora(), actualizada: ahora()
      };
      for (var k in this.datos) if (k !== 'folio' && k !== 'finalizada_en') fila[k] = this.datos[k];
      todas.push(fila);
      guardar(todas);
      log('acta creada', fila.id);
      return { data: [fila], error: null };
    }

    if (this.op === 'update') {
      var id = null;
      for (i = 0; i < this.filtros.length; i++) if (this.filtros[i].c === 'id') id = this.filtros[i].v;
      for (i = 0; i < todas.length; i++) {
        if (todas[i].id === id) {
          // Un acta cerrada no se edita mas: en Postgres lo impide la
          // politica de UPDATE, que exige folio is null.
          if (todas[i].folio) return { data: [todas[i]], error: null };

          for (var j in this.datos) {
            // El navegador tampoco puede escribir el folio: alla es un
            // privilegio de columna, aqui se imita igual.
            if (j === 'folio' || j === 'finalizada_en') continue;
            todas[i][j] = this.datos[j];
          }
          todas[i].actualizada = ahora();
          guardar(todas);
          return { data: [todas[i]], error: null };
        }
      }
      return { data: [], error: null };
    }

    if (this.op === 'delete') {
      var quedan = todas.filter(function (f) {
        for (var m = 0; m < this.filtros.length; m++) {
          if (this.filtros[m].c === 'id' && f.id === this.filtros[m].v) return false;
        }
        return true;
      }, this);
      guardar(quedan);
      return { data: [], error: null };
    }

    /* select */
    var res = todas.slice();
    for (i = 0; i < this.filtros.length; i++) {
      var f = this.filtros[i];
      res = res.filter(function (x) {
        return f.modo === 'is' ? (x[f.c] === f.v || (f.v === null && !x[f.c])) : x[f.c] === f.v;
      });
    }
    if (this.orden) {
      var o = this.orden;
      res.sort(function (a, b) {
        var A = a[o.c] || '', B = b[o.c] || '';
        return o.asc ? String(A).localeCompare(String(B)) : String(B).localeCompare(String(A));
      });
    }
    if (this.tope) res = res.slice(0, this.tope);
    return { data: this.uno ? (res[0] || null) : res, error: null };
  };

  Consulta.prototype.then = function (ok, mal) {
    var r;
    try { r = this.correr(); } catch (e) { r = { data: null, error: { message: String(e) } }; }
    return Promise.resolve(r).then(ok, mal);
  };

  /* ───────── el cliente ───────── */
  var clienteFalso = {
    from: function (t) { return new Consulta(t); },

    rpc: function (nombre, args) {
      if (nombre !== 'ac_comite_finalizar') {
        return Promise.resolve({ data: null, error: { message: 'funcion desconocida: ' + nombre } });
      }
      var todas = filas(), i;
      for (i = 0; i < todas.length; i++) {
        if (todas[i].id === args.p_acta) {
          if (todas[i].folio) {
            return Promise.resolve({ data: { folio: todas[i].folio, ya_estaba: true }, error: null });
          }
          // Las mismas exigencias que la funcion de verdad: un acta sin
          // condominio ni fecha no recibe numero.
          if (!todas[i].condominio || !todas[i].fecha_reunion) {
            return Promise.resolve({ data: null, error: { message: 'acta_incompleta' } });
          }
          var n = parseInt(localStorage.getItem(SERIE) || '0', 10) + 1;
          localStorage.setItem(SERIE, String(n));
          var folio = 'AC-' + new Date().getFullYear() + '-' + String(n).padStart(6, '0');
          todas[i].folio = folio;
          todas[i].finalizada_en = ahora();
          guardar(todas);
          log('acta cerrada con el numero', folio);
          return Promise.resolve({ data: { folio: folio, ya_estaba: false }, error: null });
        }
      }
      return Promise.resolve({ data: null, error: { message: 'acta_no_encontrada' } });
    }
  };

  /* ───────── la sesion ───────── */
  var usuarioFalso = { id: 'usuario-de-prueba', email: 'prueba@actascopropiedad.cl' };

  global.Cuenta = global.Cuenta || {};
  global.Cuenta.cliente      = function () { return clienteFalso; };
  global.Cuenta.usuario      = function (cb) { if (cb) cb(usuarioFalso); };
  global.Cuenta.exigirSesion = function (o, cb) { if (cb) cb(usuarioFalso); };
  global.Cuenta.montarNav    = function (id) {
    var e = document.getElementById(id);
    if (e) e.innerHTML = '<span style="color:rgba(255,255,255,.85);font-size:12px">prueba@actascopropiedad.cl</span>';
  };
  global.Cuenta.abrirCajon   = function () {};
  global.Cuenta.cerrarCajon  = function () {};

  /* ───────── el ejemplo ─────────
   * Vivia en la aplicacion, con un boton DEMO en la cabecera. Se sacó de
   * ahi: en produccion ese boton no tiene para que existir y su codigo
   * quedaba sin uso. Aqui si sirve, para llenar la pantalla de un golpe.
   */
  function ejemplo() {
    if (typeof acta === 'undefined') return;
    if (acta.condominio || acta.asistentes.length) {
      if (!confirm('El ejemplo reemplaza lo que hay en pantalla. ¿Continuar?')) return;
    }
    var hoy = new Date();
    var iso = hoy.getFullYear() + '-' + String(hoy.getMonth()+1).padStart(2,'0') +
              '-' + String(hoy.getDate()).padStart(2,'0');

    acta.condominio = 'Condominio Las Araucarias';
    acta.direccion  = 'Av. Los Aromos 1234, Concepción';
    acta.fecha      = iso;
    acta.hora       = '19:30';
    acta.modalidad  = 'presencial';
    acta.lugar      = 'la sala de reuniones del condominio';
    acta.total      = 3;
    acta.asistentes = [
      { nombre: 'María González Pérez', cargo: '',             preside: true  },
      { nombre: 'Juan Sepúlveda Rojas', cargo: 'Secretario/a', preside: false },
      { nombre: 'Ana Castro Muñoz',     cargo: 'Integrante',   preside: false },
      { nombre: 'Patricia Soto López',  cargo: 'Administradora (invitada)', preside: false }
    ];
    acta.puntos = [
      { materia: 'Filtración en la unidad 302',
        tratado: 'El propietario reclamó una filtración desde el departamento superior. El administrador informó que ya solicitó una visita técnica.',
        acuerdo: 'Se instruye al administrador contratar la visita técnica dentro de 48 horas y presentar el informe en la próxima reunión.' },
      { materia: 'Presupuesto para pintar la fachada',
        tratado: 'Se revisaron tres presupuestos. El más bajo no incluye andamios.',
        acuerdo: 'Se acuerda pedir un cuarto presupuesto que incluya andamios y resolver en la próxima reunión.' }
    ];
    acta.cierre = 'Se levanta la sesión a las 21:00 horas. La próxima reunión queda fijada para el primer martes del mes siguiente.';

    acPintarFormulario();
    acRefrescar();
    acGuardar();
    log('ejemplo cargado');
  }

  /* ───────── cinta de la casa ───────── */
  document.addEventListener('DOMContentLoaded', function () {
    var cinta = document.createElement('div');
    cinta.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:400;background:#B23A2E;color:#fff;' +
      'font:600 12.5px/1.5 system-ui,sans-serif;padding:7px 16px;text-align:center;' +
      'box-shadow:0 -2px 10px rgba(0,0,0,.2)';
    cinta.innerHTML =
      'MODO DE PRUEBA · nada se guarda en Supabase y no se cobra nada · ' +
      '<button id="pru-ejemplo" style="background:#fff;color:#B23A2E;border:none;border-radius:6px;' +
      'padding:3px 10px;font:inherit;cursor:pointer;margin-left:8px">Llenar con un ejemplo</button>' +
      '<button id="pru-limpiar" style="background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6);' +
      'border-radius:6px;padding:3px 10px;font:inherit;cursor:pointer;margin-left:6px">Borrar las actas de prueba</button>';
    document.body.appendChild(cinta);

    document.getElementById('pru-ejemplo').addEventListener('click', ejemplo);

    // La barra de la aplicacion vive abajo: se le hace lugar.
    var barra = document.getElementById('barra');
    if (barra) barra.style.bottom = '34px';
    document.body.style.paddingBottom = '34px';

    document.getElementById('pru-limpiar').addEventListener('click', function () {
      localStorage.removeItem(BANCO);
      localStorage.removeItem(SERIE);
      localStorage.removeItem('acta_comite_borrador');
      location.href = location.pathname;
    });

    log('listo. ' + filas().length + ' acta(s) de prueba guardada(s).');
  });

})(window);
