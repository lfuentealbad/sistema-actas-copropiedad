/* =====================================================================
 *  Despachador de acciones
 *
 *  Reemplaza a los manejadores en linea (onclick, onchange, …) para poder
 *  quitar 'unsafe-inline' de script-src. Sin ese permiso, un atributo
 *  onclick="..." no se ejecuta, y con el, cualquier inyeccion de HTML se
 *  convierte en ejecucion de codigo. Esto es lo que cierra esa puerta.
 *
 *  La llamada original se codifica en atributos:
 *
 *      onclick="setModalidad(this,'presencial')"
 *      ->  data-ac="setModalidad" data-args="@|presencial"
 *
 *      onclick="goStep(3)"
 *      ->  data-ac="goStep" data-args="n:3"
 *
 *  Los argumentos van separados por "|" y llevan su tipo:
 *      @        el elemento que recibio el evento
 *      n:5      numero
 *      b:true   booleano
 *      resto    texto tal cual
 *
 *  El evento se agrega siempre como ultimo argumento; las funciones que no
 *  lo declaran simplemente lo ignoran.
 * ===================================================================== */
(function (global) {
  'use strict';

  function convertir(pieza, el) {
    if (pieza === '@') return el;
    if (pieza.indexOf('n:') === 0) return Number(pieza.slice(2));
    if (pieza.indexOf('b:') === 0) return pieza.slice(2) === 'true';
    return pieza;
  }

  function despachar(ev, atributo) {
    var origen = ev.target;
    if (!origen || !origen.closest) return;
    var el = origen.closest('[data-' + atributo + ']');
    if (!el) return;

    var nombre = el.getAttribute('data-' + atributo);
    var fn = global[nombre];
    if (typeof fn !== 'function') {
      // Una accion sin funcion detras es un error de programacion, no del
      // usuario: se avisa en consola y no se rompe la pagina.
      if (global.console) console.warn('Acción sin función: ' + nombre);
      return;
    }

    var crudo = el.getAttribute('data-args');
    var args = crudo ? crudo.split('|').map(function (p) { return convertir(p, el); }) : [];
    args.push(ev);

    try {
      fn.apply(null, args);
    } catch (e) {
      if (global.console) console.error('Error en la acción ' + nombre + ':', e);
    }
  }

  document.addEventListener('click',   function (e) { despachar(e, 'ac'); });

  // Accesibilidad: un div con role="button" no se activa con el teclado por
  // si solo. Enter y Espacio tienen que hacer lo mismo que el clic.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    var el = e.target;
    if (!el || !el.closest) return;
    var caja = el.closest('[data-ac][role="button"]');
    if (!caja) return;
    // los botones de verdad ya lo hacen solos
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT') return;
    e.preventDefault();
    despachar(e, 'ac');
  });

  document.addEventListener('change',  function (e) { despachar(e, 'cambio'); });
  document.addEventListener('keyup',   function (e) { despachar(e, 'tecla'); });
  document.addEventListener('keydown', function (e) { despachar(e, 'teclabaja'); });

})(window);
