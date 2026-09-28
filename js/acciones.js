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

  // -------------------------------------------------------------------
  //  Lista blanca
  // -------------------------------------------------------------------
  //  Antes el despachador buscaba el nombre en window y llamaba lo que
  //  encontrara. Eso convertia a cualquier atributo data-ac que lograra
  //  colarse en la pagina -por ejemplo, desde un respaldo de las cuentas
  //  del condominio preparado por otro- en una forma de llamar a CUALQUIER
  //  funcion global con argumentos elegidos: alert, fetch, o una funcion
  //  propia que borra datos. Ahora solo se llama lo que esta aqui.
  //
  //  La lista son los nombres que el sitio usa de verdad en data-ac,
  //  data-cambio, data-tecla y data-teclabaja. Pruebas/prueba-seg-acciones.mjs
  //  recorre todo lo publicado y falla si una pagina usa un nombre que no
  //  esta, o si aqui queda uno que ya nadie usa. Al agregar un boton nuevo,
  //  su accion se agrega tambien aqui.
  //  (Hallazgo SAST-02 de la auditoria del 22-09-2026.)
  var PERMITIDAS = Object.create(null);
  [
    '_irkxl', '_kbxoTodos', 'abrirCobro', 'abrirEgreso', 'abrirImportCSV',
    'abrirIngreso', 'abrirInstrucciones', 'abrirLiquidacionDirecta',
    'abrirMantencion', 'abrirMovFondo', 'abrirUnidad',
    'acAgregarAdministrador', 'acAsistenteNuevo', 'acAsistenteQuitar',
    'acCerrarActa', 'acCerrarModal', 'acDescargar', 'acFinalizar',
    'acImprimir', 'acNuevaActa', 'acPuntoNuevo', 'acPuntoQuitar', 'acQuorum',
    'acTraerAnterior', 'actaActualizarTelefonos', 'actaCancelarPago', 'actaCerrarSala', 'actaDarCodigo',
    'actaCerrarSesion', 'actaIniciarSala', 'actaIrAPagar', 'actaLiberarTelefono', 'actaReanudarSala',
    'actaReiniciarIntentos',
    'actualizarPreviewCobros', 'actualizarSugerenciaTotal',
    'actualizarVinculos', 'addCustomMateria', 'addFirmante',
    'addPuntoYRenombrar', 'addRow', 'agregarFila', 'agregarPunto',
    'agregarTemasATabla', 'borrarTodasUnidades', 'calcularPresupuesto',
    'calcularQuorum', 'cambiarRut', 'cargarDemo', 'cerrar',
    'cerrarInstrucciones', 'cerrarModal', 'cerrarPago', 'cerrarPunto',
    'cerrarSesion', 'checkPlazo', 'confirmarCodigo', 'confirmarGenerarCobros', 'copiarLink',
    'copiarResumen', 'copiarTexto', 'copyActa', 'crear', 'crearAsamblea', 'darCodigoMesa',
    'delRow', 'descargarActaHTML', 'descargarPlantilla', 'ejemplo',
    'eliminarCobro', 'eliminarEgreso', 'eliminarIngreso',
    'eliminarMantencion', 'eliminarMovFondo', 'eliminarPuntoConfirm',
    'eliminarUnidad', 'emitir', 'exportarRespaldo', 'exportarResultados',
    'firmCambioAlternativa', 'firmCargoCambio', 'generarCobrosMes',
    'generarDocumento', 'generarTodasLiquidaciones', 'goStep', 'guardarCobro',
    'guardarConfig', 'guardarEgreso', 'guardarIngreso', 'guardarMantencion',
    'guardarMovFondo', 'guardarPadron', 'guardarUnidad', 'identificar',
    'importarExcel', 'importarPadron', 'importarRespaldo',
    'imprimirLiquidacion', 'irAPagar', 'irAlMes', 'liberarVinculo',
    'limpiarCobros', 'limpiarPadron', 'marcarTodos', 'matChkClick',
    'materiaEnter', 'mostrarMasUnidades', 'nextStep', 'padronEjemplo',
    'pagarCobro', 'pagarTodoGrupo', 'pedirCodigoCorreo', 'prevStep', 'procesarImportacion',
    'puertaRecuperar', 'quorumYVotacion', 'reanudar', 'recargarLimpio',
    'refrescar', 'reiniciarIntentos', 'renderLiquidacion', 'resetearTodo', 'resolver',
    'revisarAvisoNotario', 'savePDF', 'setDoc24', 'setGrabacion', 'setMedio',
    'setModalidad', 'setNotario', 'setRequiereAcuerdo', 'toggleGrupoCobro',
    'toggleMatCheck', 'toggleVotPanel', 'unirse',
    'updateTipoAsambleaExtended'
  ].forEach(function (n) { PERMITIDAS[n] = true; });

  function despachar(ev, atributo) {
    var origen = ev.target;
    if (!origen || !origen.closest) return;
    var el = origen.closest('[data-' + atributo + ']');
    if (!el) return;

    var nombre = el.getAttribute('data-' + atributo);
    if (!PERMITIDAS[nombre]) {
      // Un nombre fuera de la lista no se ejecuta nunca, exista o no la
      // funcion. Se avisa en consola para que el olvido se note al probar.
      if (global.console) console.warn('Acción no permitida: ' + nombre);
      return;
    }
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
