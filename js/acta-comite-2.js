/* =====================================================================
 *  actaviva · Acta de reunion del comite — arranque
 *
 *  Va aparte por lo mismo que en el acta de asamblea: este archivo es el
 *  unico que toca la sesion y el ciclo de vida de la pagina.
 * ===================================================================== */

document.addEventListener('DOMContentLoaded', function () {

  if (window.Cuenta && Cuenta.montarNav) Cuenta.montarNav('nav-cuenta');

  /* Cualquier tecla en cualquier campo redibuja el acta y agenda el
     guardado. Se escucha en el documento porque las filas de asistentes
     y los temas nacen y mueren en caliente. */
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.tagName) return;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') return;
    if (t.closest && t.closest('.fondo-modal')) return;   // el modal de pago no es el acta
    acRefrescar();
    acGuardar();
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.tagName) return;
    if (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && t.tagName !== 'SELECT') return;
    if (t.closest && t.closest('.fondo-modal')) return;
    acQuorum();
    acRefrescar();
    acGuardar();
  });

  /* Escape cierra la ventana abierta */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var abiertas = document.querySelectorAll('.fondo-modal.ver');
    for (var i = 0; i < abiertas.length; i++) abiertas[i].classList.remove('ver');
  });

  /* Clic en el fondo oscuro tambien cierra */
  var fondos = document.querySelectorAll('.fondo-modal');
  for (var j = 0; j < fondos.length; j++) {
    fondos[j].addEventListener('mousedown', function (e) {
      if (e.target === this) this.classList.remove('ver');
    });
  }
});

window.addEventListener('load', function () {
  // Sin sesion no hay donde guardar el acta ni a quien cobrarle.
  if (window.Cuenta && Cuenta.exigirSesion) {
    Cuenta.exigirSesion({
      titulo: 'Entre para escribir el acta',
      sub: 'Con su cuenta guardamos su avance y puede retomarla desde otro equipo.'
    }, function () {
      acCargar(function () {
        acIniciar();
      });
    });
  } else {
    acIniciar();
  }
});
