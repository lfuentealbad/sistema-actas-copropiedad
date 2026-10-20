// Puerta de las herramientas en vitrina (20-10-2026). Pedido del dueno:
// quien no tiene una prueba aprobada no entra a las herramientas escribiendo
// la direccion; se le lleva a su panel, donde la pide.
//
// Esto ordena la navegacion; no es el candado. El folio, la sala, la
// consulta y el acta del comite los sigue negando Postgres (pase_exigir)
// sin un mes vigente. Por eso, si algo falla al comprobar, la pagina se
// muestra igual: dejar a alguien mirando una pantalla en blanco no protege
// nada que la base no proteja ya.
//
// Se carga en el <head>, sin depender de nada, para ocultar la pagina antes
// de que se pinte. La comprobacion corre cuando cuenta.js ya esta cargado.
(function () {
  'use strict';
  var raiz = document.documentElement;
  if (!raiz.classList.contains('vitrina')) return;
  // Las demostraciones no tienen cuenta ni mes: se recorren libres.
  if (/(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname)) return;

  var estilo = document.createElement('style');
  estilo.textContent = 'html.prueba-comprobando body{visibility:hidden}';
  document.head.appendChild(estilo);
  raiz.classList.add('prueba-comprobando');

  var listo = false;
  function mostrar() { if (listo) return; listo = true; raiz.classList.remove('prueba-comprobando'); }
  function alPanel(ruta) { if (listo) return; listo = true; location.replace(ruta); }
  setTimeout(mostrar, 8000);

  function comprobar() {
    var C = window.Cuenta;
    if (!C || !C.cliente || !C.pase) return mostrar();
    var c = C.cliente();
    if (!c) return mostrar();
    C.usuario(function (u) {
      if (!u) return alPanel('/cuenta');
      var pendientes = 2, abre = false;
      function una(si) {
        if (si) abre = true;
        if (--pendientes === 0) { if (abre) mostrar(); else alPanel('/cuenta#s-mes'); }
      }
      // Tiene o tuvo un mes (sus actas siguen siendo suyas aunque venza).
      C.pase.estado(function (e) {
        if (!e) { mostrar(); return; }
        una(!!(e.condominios && e.condominios.length));
      });
      // La cuenta revisora entra siempre.
      c.rpc('revisor_estado').then(function (r) {
        una(!!(r && !r.error && r.data && r.data !== 'no'));
      }, function () { una(false); });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', comprobar);
  else comprobar();
})();
