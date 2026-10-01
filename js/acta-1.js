let currentStep = 1;
const totalSteps = 6;
let puntoCount = 0;
function _jlv(n) {
if (n > currentStep) {
for (let i = currentStep; i < n; i++) {
if (!_uzw(i)) return;
}
}
document.getElementById('step-' + currentStep).classList.remove('active');
document.querySelectorAll('.step-tab')[currentStep-1].classList.remove('active');
document.querySelectorAll('.step-tab')[currentStep-1].classList.add('done');
currentStep = n;
if (window.track && n > (window.__maxPaso || 1)) { window.__maxPaso = n; window.track('wizard_paso', { paso: n }); }
document.getElementById('step-' + currentStep).classList.add('active');
const tabs = document.querySelectorAll('.step-tab');
tabs[currentStep-1].classList.remove('done');
tabs[currentStep-1].classList.add('active');
_qwpsb();
window.scrollTo({top:0, behavior:'smooth'});
if (currentStep === 6) generateActa();
}
function nextStep() {
if (!_uzw(currentStep)) return;
if (currentStep < totalSteps) _jlv(currentStep + 1);
}
function prevStep() {
if (currentStep > 1) _jlv(currentStep - 1);
}

// El rail de la izquierda repite lo que la persona ya escribio, para que no
// tenga que volver al paso 1 a recordar en que asamblea esta.
function railExpediente() {
  var v = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
  var puso = function (id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; };

  var num = v('acta-numero');
  puso('rail-acta', num ? 'Acta N\u00b0 ' + num : 'Acta nueva');

  var condo = v('condo-nombre');
  puso('rail-condo', condo || 'Sin nombre todav\u00eda');

  var TIPOS = {
    'ordinaria': 'Ordinaria',
    'extraordinaria-abs': 'Extraordinaria \u00b7 mayor\u00eda absoluta',
    'extraordinaria-ref': 'Extraordinaria \u00b7 mayor\u00eda reforzada'
  };
  var tipo = TIPOS[v('tipo-asamblea')] || '';
  var fecha = v('fecha-sesion');
  if (fecha) {
    var d = new Date(fecha + 'T12:00:00');
    if (!isNaN(d)) fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  var sub = [tipo, fecha].filter(Boolean).join(' \u00b7 ');
  puso('rail-sub', sub || 'Complete el paso 1');
}

// El quorum del rail es el mismo que ya se calcula abajo; aqui solo se muestra.
function railQuorum(pct, alcanza, nota) {
  var espera = document.getElementById('rail-espera');
  var vivo = document.getElementById('rail-vivo');
  if (!vivo) return;
  if (!(pct > 0)) {
    if (espera) espera.hidden = false;
    vivo.hidden = true;
    return;
  }
  if (espera) espera.hidden = true;
  vivo.hidden = false;

  var cifra = vivo.querySelector('.rail-cifra');
  var barra = vivo.querySelector('.rail-barra');
  var fill = document.getElementById('rail-barra-fill');
  var texto = document.getElementById('rail-nota');

  document.getElementById('rail-pct').textContent = pct.toFixed(1).replace('.', ',') + '%';
  if (fill) fill.style.width = Math.min(pct, 100) + '%';
  if (cifra) cifra.className = 'rail-cifra' + (alcanza ? '' : ' falla');
  if (barra) barra.className = 'rail-barra' + (alcanza ? '' : ' falla');
  if (texto) texto.textContent = nota;
}

function goStep(n) {
if (n === currentStep) return;
if (n < 1 || n > totalSteps) return;
_jlv(n);
}
function _qwpsb() {
document.getElementById('step-label').textContent = 'Paso ' + currentStep + ' de ' + totalSteps;
document.getElementById('btn-back').style.display = currentStep > 1 ? 'block' : 'none';
const btnNext = document.getElementById('btn-next');
if (currentStep === totalSteps) {
btnNext.textContent = 'Finalizar acta';
btnNext.setAttribute('data-ac', 'savePDF');
if (typeof renderRevision === 'function') renderRevision();
} else {
btnNext.textContent = 'Siguiente →';
btnNext.setAttribute('data-ac', 'nextStep');
}
// El manejador vive en el despachador (data-ac). Colgar ademas un onclick
// hacia que un clic contara por dos y el asistente saltara un paso.
btnNext.onclick = null;
}
function _uzw(step) {
if (step === 1) {
if (!document.getElementById('condo-nombre').value.trim()) { alert('Falta completar el nombre del condominio. Es un dato obligatorio para generar el acta.'); return false; }
if (!document.getElementById('tipo-asamblea').value) { alert('Seleccione el tipo de asamblea (Ordinaria o Extraordinaria) para continuar.'); return false; }
if (!document.getElementById('fecha-sesion').value) { alert('Falta indicar la fecha de la sesión.'); return false; }
}
if (step === 4 && puntoCount === 0) {
alert('Agregue al menos un punto al orden del día antes de continuar.');
return false;
}
return true;
}
function _ldxch(btn, hiddenId, _pvau) {
btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
document.getElementById(hiddenId).value = _pvau;
}
function setModalidad(btn, _pvau) {
_ldxch(btn, 'modalidad', _pvau);
var lugarWrap = document.getElementById('lugar').closest('.field');
var platWrap = document.getElementById('plataforma-wrap');
var lugarLabel = document.getElementById('lugar-label');
if (!lugarWrap || !platWrap) return;
if (_pvau === 'presencial') {
lugarWrap.style.display = '';
platWrap.style.display = 'none';
lugarLabel.textContent = 'Lugar de la sesión';
} else if (_pvau === 'telemática' || _pvau === 'telematica') {
lugarWrap.style.display = 'none';
platWrap.style.display = '';
} else if (_pvau === 'mixta') {
lugarWrap.style.display = '';
platWrap.style.display = '';
lugarLabel.textContent = 'Lugar físico de la sesión';
}
}
function setMedio(btn, _pvau) { _ldxch(btn, 'medio-notif', _pvau); }
function setDoc24(btn, _pvau) { _ldxch(btn, 'doc24', _pvau); }
function setGrabacion(btn, _pvau) { _ldxch(btn, 'grabacion', _pvau); }
function setNotario(btn, _pvau) {
_ldxch(btn, 'notario', _pvau);
document.getElementById('notario-field').style.display = _pvau === 'Si' ? 'block' : 'none';
}
function updateTipoAsamblea() {
var tipo = document.getElementById('tipo-asamblea').value;
var box = document.getElementById('quorum-info');
var tip = document.getElementById('quorum-tip');
if (!tipo) { box.style.display = 'none'; return; }
box.style.display = 'block';
var info = {
'ordinaria': {
titulo: 'Asamblea Ordinaria (Art. 15 Ley N° 21.442)',
qConst: '33% de los derechos del condominio.',
qAcuerdo: 'Mayoría absoluta de los derechos presentes en la sesión.',
materias: [
'Rendición de cuentas por parte del administrador y aprobación del balance presentado.',
'Designación, reelección o renuncia de los miembros del comité de administración.',
'Designación o remoción del administrador o subadministrador.',
'Reporte de las actualizaciones al plan de emergencia y programación de simulacros de evacuación y/o acciones de capacitación o prevención de riesgos.',
'Término anticipado de la póliza de seguro del condominio y/o contratación de un nuevo seguro, siempre que no implique una modificación de los riesgos cubiertos por la póliza vigente producto de la eliminación o incorporación de coberturas complementarias.',
'Cualquier otro asunto relacionado con los intereses de los copropietarios, salvo aquellos que sean materia de asamblea extraordinaria.'
]
},
'extraordinaria-abs': {
titulo: 'Asamblea Extraordinaria de Mayoría Absoluta (Art. 15 Ley N° 21.442)',
qConst: 'M\u00e1s del 50 % de los derechos del condominio.',
qAcuerdo: 'M\u00e1s del 50 % de los derechos del condominio, computado \u00fanicamente sobre copropietarios h\u00e1biles para votar.',
materias: [
'Modificación del reglamento de copropiedad, salvo aquellas materias que requieren mayoría reforzada.',
'Remoción parcial o total de los miembros del comité de administración.',
'Gastos o inversiones extraordinarias que excedan, en un período de doce meses, el equivalente a seis cuotas de gastos comunes ordinarios del total del condominio.',
'Administración conjunta de dos o más condominios y establecimiento de subadministraciones en un mismo condominio.',
'Programas de autofinanciamiento de los condominios y asociaciones con terceros para estos efectos.',
'Fijación del porcentaje de recargo sobre los gastos comunes para la formación del fondo común de reserva.',
'Utilización de los recursos del fondo común de reserva para solventar gastos comunes ordinarios de mantención o reparación.',
'Alteraciones a los bienes comunes.'
]
},
'extraordinaria-ref': {
titulo: 'Asamblea Extraordinaria de Mayoría Reforzada (Art. 15 Ley N° 21.442)',
qConst: 'Al menos el 66% de los derechos del condominio.',
qAcuerdo: 'Al menos el 66% de los derechos del condominio, computado únicamente sobre la base de copropietarios hábiles para votar.',
materias: [
'Modificación del reglamento de copropiedad, en las materias que requieren mayoría reforzada.',
'Delegación de facultades al comité de administración respecto de materias que requieren acuerdo de mayoría absoluta.',
'Enajenación, arrendamiento o cesión de tenencia de bienes de dominio común, o la constitución de gravámenes sobre ellos.',
'Reconstrucción o demolición del condominio.',
'Petición a la dirección de obras municipales para dejar sin efecto la declaración que acogió el condominio al régimen de copropiedad inmobiliaria, o su modificación.',
'Cambio de destino de las unidades del condominio.',
'Obras de ampliaciones del condominio, ampliaciones o alteraciones de sus unidades.',
'Construcciones en los bienes comunes y cambios de destino de dichos bienes, incluso de aquellos asignados en uso y goce exclusivo.',
'Constitución de derechos de uso y goce exclusivo de bienes de dominio común a favor de uno o más copropietarios, u otras formas de aprovechamiento de los bienes de dominio común.',
'Retribución a los miembros del comité de administración mediante un porcentaje de descuento en el pago de los gastos comunes.',
'Contratación de un nuevo seguro del condominio que implique una modificación de los riesgos cubiertos por la póliza vigente producto de la eliminación o incorporación de coberturas complementarias, tales como sismo o salida de mar.'
]
}
};
var d = info[tipo];
if (!d) { tip.innerHTML = ''; return; }
var letters = 'abcdefghijklmnopqrstuvwxyz';
var materiasHTML = '<ul class="materias-list" id="materias-check-list">';
d.materias.forEach(function(m, i) {
var lid = 'mat-chk-' + i;
materiasHTML += '<li data-ac="toggleMatCheck" data-args="' + lid + '">'
+ '<input type="checkbox" class="mat-chk" id="' + lid + '" data-ac="matChkClick" data-args="@" aria-label="' + String(m).replace(/"/g, '&quot;') + '">'
+ '<span class="mat-letter">' + (letters[i] || '') + '.</span>'
+ '<span class="mat-text">' + m + '</span></li>';
});
materiasHTML += '</ul>';
materiasHTML += '<div class="mat-custom-row">';
materiasHTML += '<input type="text" id="mat-custom-input" aria-label="Tema propio del condominio" placeholder="Escriba un tema propio del condominio y presione +"';
materiasHTML += ' data-teclabaja="materiaEnter" data-args="@">';
materiasHTML += '<button class="btn-add-custom" data-ac="addCustomMateria" aria-label="Agregar tema personalizado" title="Agregar tema">+</button>';
materiasHTML += '</div>';
if (tipo === 'extraordinaria-abs') {
materiasHTML += '<label class="mat-reglamento"><input type="checkbox" id="mat-reglamento" class="mat-reglamento-chk" data-cambio="revisarAvisoNotario">'
+ '<span>Esta sesi\u00f3n acuerda <strong>modificar el reglamento de copropiedad</strong></span></label>';
}
materiasHTML += '<div class="mat-actions-row">';
materiasHTML += '<span class="mat-count" id="mat-count-label">0 tema(s) seleccionado(s)</span>';
materiasHTML += '<button class="btn btn-add-temas" data-ac="agregarTemasATabla">Agregar temas seleccionados a la tabla \u2192</button>';
materiasHTML += '</div>';
tip.innerHTML =
'<strong>' + d.titulo + '</strong><br><br>' +
'<b>Qu\u00f3rum de constituci\u00f3n:</b> ' + d.qConst + '<br>' +
'<b>Qu\u00f3rum de acuerdos:</b> ' + d.qAcuerdo + '<br><br>' +
'<b>Materias propias de esta sesi\u00f3n:</b>' +
materiasHTML +
'<div class="aviso-fe" id="aviso-fe-notario" hidden></div>';
revisarAvisoNotario();
}
// Modificar el reglamento exige notario aunque la sesion sea de mayoria
// absoluta. Detectarlo por la sola palabra "reglamento" daba falsos avisos:
// un punto puede mencionarlo sin que se acuerde cambiarlo. Se pide, ademas,
// un verbo de cambio; y como ningun listado de palabras cubre todo, el
// usuario puede declararlo con la casilla del paso 2.
var _RX_REGLAMENTO = /reglamento/i;
var _RX_CAMBIO = /modificaci|modificar|modifica\b|actualizaci|actualizar|reforma|reformar|sustituci|sustituir|reemplaz|derogaci|derogar|enmienda|enmendar|nuevo reglamento|cambio de reglamento/i;
function tocaModificacionDelReglamento(texto) {
var t = String(texto || '');
return _RX_REGLAMENTO.test(t) && _RX_CAMBIO.test(t);
}
function reglamentoDeclarado() {
var c = document.getElementById('mat-reglamento');
return !!(c && c.checked);
}

// Ayuda preventiva, no un validador: avisa cuando la ley exige notario.
// Dos hipotesis (art. 15): las materias de mayoria reforzada (N\u00b0 3), y la
// modificacion del reglamento (letra a) del N\u00b0 2) aunque la sesion sea de
// mayoria absoluta. La segunda se detecta por la materia marcada; con un
// tema propio que mencione el reglamento tambien se sugiere, sin bloquear.
function revisarAvisoNotario() {
var aviso = document.getElementById('aviso-fe-notario');
if (!aviso) return;
var tipo = document.getElementById('tipo-asamblea').value;
if (tipo === 'extraordinaria-ref') {
aviso.hidden = false;
aviso.textContent = 'Esta sesi\u00f3n requiere la asistencia de un notario, quien deber\u00e1 certificar el acta (art. 15, Ley N\u00b0 21.442). Solo en condominios de viviendas sociales esa exigencia se cumple con un funcionario municipal designado o el Oficial del Registro Civil (art. 73).';
return;
}
if (tipo === 'extraordinaria-abs') {
var toca = reglamentoDeclarado();
if (!toca) {
var marcadas = document.querySelectorAll('#materias-check-list .mat-chk:checked');
for (var i = 0; i < marcadas.length; i++) {
if (tocaModificacionDelReglamento(marcadas[i].getAttribute('aria-label') || '')) { toca = true; break; }
}
}
if (toca) {
aviso.hidden = false;
aviso.textContent = 'La modificaci\u00f3n del reglamento de copropiedad requiere la asistencia de un notario, quien deber\u00e1 certificar el acta, aunque la sesi\u00f3n sea de mayor\u00eda absoluta (art. 15, letra a) del N\u00b0 2).';
return;
}
}
aviso.hidden = true;
}
function toggleMatCheck(id) {
var cb = document.getElementById(id);
if (!cb) return;
cb.checked = !cb.checked;
cb.closest('li').classList.toggle('checked', cb.checked);
updateMatCount();
}
function updateMatCount() {
var checks = document.querySelectorAll('#materias-check-list .mat-chk:checked');
var label = document.getElementById('mat-count-label');
if (label) label.textContent = checks.length + ' tema(s) seleccionado(s)';
revisarAvisoNotario();
}
function addCustomMateria() {
var input = document.getElementById('mat-custom-input');
if (!input) return;
var text = input.value.trim();
if (!text) { input.focus(); return; }
var list = document.getElementById('materias-check-list');
if (!list) return;
var idx = list.querySelectorAll('li').length;
var li = document.createElement('li');
li.className = 'checked';
li.onclick = function() { toggleMatCheck('mat-chk-' + idx); };
var chk = document.createElement('input');
chk.type = 'checkbox'; chk.className = 'mat-chk'; chk.id = 'mat-chk-' + idx; chk.checked = true;
chk.setAttribute('aria-label', text);
chk.onclick = function(e) { e.stopPropagation(); updateMatCount(); };
var spanLetter = document.createElement('span');
spanLetter.className = 'mat-letter'; spanLetter.textContent = '+';
var spanText = document.createElement('span');
spanText.className = 'mat-text'; spanText.textContent = text;
li.appendChild(chk); li.appendChild(spanLetter); li.appendChild(spanText);
list.appendChild(li);
input.value = '';
input.focus();
updateMatCount();
}
function showMatToast(msg) {
  var t = document.getElementById('mat-toast-global');
  if (!t) {
    t = document.createElement('div');
    t.id = 'mat-toast-global';
    t.className = 'mat-toast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hideTimer);
  t._hideTimer = setTimeout(function() { t.classList.remove('show'); }, 3200);
}
function agregarTemasATabla() {
var checks = document.querySelectorAll('#materias-check-list .mat-chk:checked');
if (checks.length === 0) {
var label = document.getElementById('mat-count-label');
if (label) {
label.textContent = 'Seleccione al menos un tema';
label.style.color = 'var(--c-error)';
setTimeout(function() { label.style.color = ''; updateMatCount(); }, 2000);
}
return;
}
var n = checks.length;
var primerPuntoUsado = false;
checks.forEach(function(cb) {
var li = cb.closest('li');
var texto = li.querySelector('.mat-text').textContent.trim();
if (!primerPuntoUsado) {
  var p1 = document.getElementById('p1-titulo');
  if (p1 && p1.value.trim() === '') {
    p1.value = texto;
    primerPuntoUsado = true;
  } else {
    addPunto();
    _renombrarOpcionesRegla(puntoCount);
    var tituloInput = document.getElementById('p' + puntoCount + '-titulo');
    if (tituloInput) tituloInput.value = texto;
  }
} else {
addPunto();
_renombrarOpcionesRegla(puntoCount);
var tituloInput = document.getElementById('p' + puntoCount + '-titulo');
if (tituloInput) tituloInput.value = texto;
}
cb.checked = false;
li.classList.remove('checked');
});
updateMatCount();
showMatToast('✓ ' + n + ' tema' + (n > 1 ? 's' : '') + ' incorporado' + (n > 1 ? 's' : '') + ' a la Tabla. Complete los pasos 2 y 3 antes de generar el acta.');
}
function checkPlazo() {
const fechaCit = document.getElementById('fecha-citacion').value;
const fechaSes = document.getElementById('fecha-sesion').value;
const alertDiv = document.getElementById('plazo-alerta');
if (!fechaCit || !fechaSes) { alertDiv.style.display = 'none'; return; }
const diff = Math.round((new Date(fechaSes) - new Date(fechaCit)) / 86400000);
alertDiv.style.display = 'block';
if (diff >= 5 && diff <= 15) {
alertDiv.innerHTML = '<div style="background:#d8f3dc;border-left:4px solid #2d6a4f;border-radius:0 8px 8px 0;padding:10px 14px;font-size:13px;color:#2d6a4f"><strong>Plazo válido:</strong> ' + diff + ' días de anticipación. Cumple la Ley N° 21.442.</div>';
} else {
alertDiv.innerHTML = '<div style="background:#F6E6E3;border-left:4px solid #c0392b;border-radius:0 8px 8px 0;padding:10px 14px;font-size:13px;color:#c0392b"><strong>Plazo fuera de rango:</strong> ' + diff + ' días. La ley exige entre 5 y 15 días corridos.</div>';
}
}
function addRow() {
const tbody = document.getElementById('asistentes-tbody');
const n = tbody.querySelectorAll('tr').length;
const tr = document.createElement('tr');
tr.innerHTML =
'<td><input type="text" id="asist-'+n+'-unidad" name="asist-'+n+'-unidad" aria-label="Unidad, fila '+(n+1)+'" placeholder="101" class="unidad"></td>' +
'<td><input type="text" id="asist-'+n+'-nombre" name="asist-'+n+'-nombre" aria-label="Nombre del copropietario, fila '+(n+1)+'" placeholder="Nombre completo" class="nombre-asist"></td>' +
'<td><input type="text" id="asist-'+n+'-rut" name="asist-'+n+'-rut" aria-label="RUT, fila '+(n+1)+'" placeholder="12.345.678-5" class="rut-asist"></td>' +
'<td><input type="number" id="asist-'+n+'-derechos" name="asist-'+n+'-derechos" aria-label="Porcentaje de derechos, fila '+(n+1)+'" placeholder="1.0" step="0.01" min="0" max="100" class="derechos" data-cambio="calcularQuorum" data-tecla="calcularQuorum"></td>' +
'<td><select id="asist-'+n+'-habil" name="asist-'+n+'-habil" aria-label="Hábil, fila '+(n+1)+'" class="habil" data-cambio="quorumYVotacion"><option value="si">Sí</option><option value="no">No</option></select></td>' +
'<td><select id="asist-'+n+'-asiste" name="asist-'+n+'-asiste" aria-label="Asiste, fila '+(n+1)+'" class="asiste" data-cambio="quorumYVotacion"><option value="si">Sí</option><option value="no">No</option></select></td>' +
'<td><input type="text" id="asist-'+n+'-rep" name="asist-'+n+'-rep" aria-label="Representante, fila '+(n+1)+'" placeholder="Solo si vota un representante" class="representante"></td>' +
'<td><input type="text" id="asist-'+n+'-correo" name="asist-'+n+'-correo" aria-label="Correo electrónico, fila '+(n+1)+'" placeholder="opcional" class="correo-asist" inputmode="email"></td>' +
'<td><button class="btn-del" data-ac="delRow" data-args="@" aria-label="Quitar esta fila del registro" title="Quitar fila">X</button></td>';
tbody.appendChild(tr);
}
function delRow(btn) {
const rows = document.querySelectorAll('#asistentes-tbody tr');
if (rows.length <= 1) return;
var tr = btn.closest('tr');
var nombre = '';
var nameInput = tr.querySelector('.nombre-asist');
if (nameInput && nameInput.value) nombre = nameInput.value.trim();
var msg = nombre
  ? '¿Quitar a "' + nombre + '" del registro de asistencia?'
  : '¿Quitar esta fila del registro de asistencia?';
if (!confirm(msg)) return;
tr.remove();
calcularQuorum();
if (typeof actualizarVotacion === 'function') actualizarVotacion();
if (typeof autoSave === 'function') autoSave();
}
function limpiarPadron() {
const tbody = document.getElementById('asistentes-tbody');
const rows = tbody.querySelectorAll('tr');
var conDatos = 0;
rows.forEach(function(tr){
  var llena = Array.prototype.some.call(tr.querySelectorAll('input'), function(i){ return i.value && i.value.trim() !== ''; });
  if (llena) conDatos++;
});
if (conDatos === 0 && rows.length <= 1) { alert('El padrón ya está vacío.'); return; }
var msg = '¿Borrar TODO el padrón de asistentes?\n\nSe quitarán ' + rows.length + ' fila(s) de la tabla' +
  (conDatos ? ' (' + conDatos + ' con datos)' : '') +
  '.\n\nEsto solo limpia este formulario: no borra nada del servidor ni afecta una votación en vivo ya iniciada. La acción no se puede deshacer.';
if (!confirm(msg)) return;
tbody.innerHTML = '';
addRow();
calcularQuorum();
if (typeof actualizarVotacion === 'function') actualizarVotacion();
if (typeof autoSave === 'function') autoSave();
}
function eliminarPuntoConfirm(el) {
  var card = el.closest('.punto-card');
  if (!card) return;
  var titulo = card.querySelector('input[id$="-titulo"]');
  var t = (titulo && titulo.value) ? titulo.value.trim() : '';
  var msg = t ? '¿Eliminar el punto "' + t + '"?\n\nSe perderá toda la información registrada en su votación.'
              : '¿Eliminar este punto del orden del día?\n\nSe perderá toda la información registrada en su votación.';
  if (!confirm(msg)) return;
  card.remove();
  if (typeof actualizarEstadoVacioPuntos === 'function') actualizarEstadoVacioPuntos();
  if (typeof autoSave === 'function') autoSave();
}
// Lee el padron una sola vez y le aplica el art. 14 del Reglamento: la
// habilidad es del copropietario, no de la unidad. Quien tiene dos
// departamentos y debe gastos comunes en uno no vota con ninguno.
//
// Devuelve las filas con `habil` ya corregida, la lista de las que se
// arrastraron -para poder decirlo en pantalla- y cuantas vienen sin RUT,
// que son las que no se pueden agrupar.
function _padronDelActa() {
  var filas = [];
  document.querySelectorAll('#asistentes-tbody tr').forEach(function (row) {
    if (!row.querySelector('.habil')) return;
    var g = function (sel) {
      var e = row.querySelector(sel);
      return e ? String(e.value == null ? '' : e.value) : '';
    };
    var asisteEl = row.querySelector('.asiste');
    filas.push({
      fila: row,
      unidad: g('.unidad').trim(),
      nombre: g('.nombre-asist').trim(),
      rut: g('.rut-asist').trim(),
      representante: g('.representante').trim(),
      derTexto: g('.derechos'),
      der: Derechos.desdeTexto(g('.derechos')),
      habil: g('.habil') === 'si',
      asiste: asisteEl ? g('.asiste') === 'si' : true
    });
  });
  return Derechos.habilidadPorCopropietario(filas);
}

// El aviso de lo que se arrastro, debajo del padron.
function _avisarArrastrados(arrastrados) {
  var el = document.getElementById('aviso-art14');
  if (!el) return;
  if (!arrastrados.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  var lista = arrastrados.map(function (a) {
    return escapeHtml(a.unidad || a.nombre || a.rut);
  }).join(', ');
  el.style.display = 'block';
  el.className = 'msg-warn';
  el.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>'
    + '<path d="M12 9v4M12 17h.01"/></svg> '
    + 'Se marcaron como <strong>inhábiles</strong> por pertenecer a un copropietario '
    + 'que no está al día en otra de sus unidades: <strong>' + lista + '</strong>. '
    + 'El artículo 14 del Reglamento exige estar al día respecto de la totalidad '
    + 'de las unidades para poder votar. Si no corresponde, revise el RUT o la marca '
    + 'de habilidad.';
}

function calcularQuorum() {
var tipo = document.getElementById('tipo-asamblea').value;
var totalHabil = 0; 
var countHabil = 0; 
var countTotal = 0; 
var totalPresentes = 0; 
var _padron = _padronDelActa();
_avisarArrastrados(_padron.arrastrados);
_padron.filas.forEach(function(f) {
if (!f.asiste) return;
countTotal++;
totalPresentes += f.der;
if (f.habil) {
totalHabil += f.der;
countHabil++;
}
});

var sumaPadron = Derechos.suma(_padron.filas.map(function (f) { return f.der; }));
var avisoSuma = document.getElementById('suma-derechos-aviso');
if (avisoSuma) {
  if (sumaPadron <= 0) {
    avisoSuma.style.display = 'none';
  } else if (Math.abs(sumaPadron - Derechos.CIEN) <= 0.05 * Derechos.ESCALA) {
    avisoSuma.style.display = 'block';
    avisoSuma.className = 'msg-ok';
    avisoSuma.innerHTML = '✓ La suma de derechos del padrón es <strong>100%</strong>. Los quórum se calculan sobre una base correcta.';
  } else if (sumaPadron > Derechos.CIEN) {
    avisoSuma.style.display = 'block';
    avisoSuma.className = 'msg-error';
    avisoSuma.innerHTML = '✕ La suma de derechos ingresados es <strong>' + Derechos.texto(sumaPadron) + ' %</strong> y supera el 100%. Revise los porcentajes: los quórum calculados no serán confiables.';
  } else {
    avisoSuma.style.display = 'block';
    avisoSuma.className = 'msg-warn';
    avisoSuma.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg> Suma de derechos ingresados: <strong>' + Derechos.texto(sumaPadron) + ' %</strong>. El padrón completo del condominio debe sumar 100%. Si aún no termina de ingresar copropietarios, puede continuar.';
  }
}
totalPresentes = Math.min(totalPresentes, Derechos.CIEN);
totalHabil = Math.min(totalHabil, Derechos.CIEN);
var fill = document.getElementById('quorum-fill');
var pct = document.getElementById('quorum-pct');
var status = document.getElementById('quorum-status-text');
var req = document.getElementById('quorum-req-text');
pct.textContent = Derechos.texto(totalPresentes) + ' %';
fill.style.width = Math.min(Derechos.aNumero(totalPresentes), 100) + '%';
var minReq = 33, label = 'Mínimo 33% (asamblea ordinaria)';
if (tipo === 'extraordinaria-abs') { minReq = 50; label = 'M\u00e1s del 50 % (asamblea extraordinaria)'; }
if (tipo === 'extraordinaria-ref') { minReq = 66; label = 'Mínimo 66% (mayoría reforzada)'; }
var reqTxt = (tipo === 'extraordinaria-abs') ? 'más del 50%' : (minReq + '%');
req.textContent = label;
// Tambien en enteros: 50 % son 500.000 en la escala de Derechos.
var alcanzaQuorum = (tipo === 'extraordinaria-abs')
  ? (totalPresentes > 50 * Derechos.ESCALA)
  : (totalPresentes >= minReq * Derechos.ESCALA);
railQuorum(Derechos.aNumero(totalPresentes), alcanzaQuorum, alcanzaQuorum
  ? 'Se constituye: supera el ' + reqTxt + ' que exige la ley.'
  : 'No alcanza: se requiere ' + reqTxt + ' de los derechos.');
if (alcanzaQuorum) {
fill.className = 'quorum-fill';
status.innerHTML = '<strong>Quórum de constitución OK</strong> — '
+ Derechos.texto(totalPresentes) + ' % de derechos presentes en la asamblea';
status.style.color = '#1e6e4a';
} else {
fill.className = 'quorum-fill fail';
status.innerHTML = '<strong>Quórum insuficiente:</strong> '
+ Derechos.texto(totalPresentes) + ' % — se requiere ' + reqTxt + ' para constituirse';
status.style.color = '#B23A2E';
}
var boxAcuerdos = document.getElementById('quorum-acuerdos-box');
if (!boxAcuerdos) return;
if (tipo === 'ordinaria') {
boxAcuerdos.style.display = 'flex';
var fillA = document.getElementById('quorum-acuerdos-fill');
var pctA = document.getElementById('quorum-acuerdos-pct');
var txtA = document.getElementById('quorum-acuerdos-text');
var subtO = boxAcuerdos.querySelector('div:last-of-type');
if (subtO) {
subtO.textContent = 'Mayor\u00eda absoluta de los derechos presentes \u00b7 Art. 15 Ley 21.442';
}
if (countHabil === 0 || totalHabil === 0) {
txtA.textContent = 'Ingrese copropietarios h\u00e1biles para calcular';
pctA.textContent = '--';
fillA.style.width = '0%';
} else {
// Mayoria absoluta de los DERECHOS presentes, no de las cabezas: el voto
// es proporcional a los derechos de cada unidad (art. 15).
// La mitad de una base entera puede caer en media diezmilesima. Se
// imprime exacta dividiendo dentro del formateador, no antes.
var mitad = Derechos.texto(totalHabil, 2 * Derechos.ESCALA);
fillA.style.width = '50%';
pctA.textContent = 'M\u00e1s de ' + mitad + ' %';
txtA.innerHTML =
'Base para votaci\u00f3n: <strong>' + Derechos.texto(totalHabil) + ' %</strong> de derechos h\u00e1biles presentes '
+ '(' + countHabil + ' asistente' + (countHabil === 1 ? '' : 's') + '). '
+ 'Se requiere <strong>m\u00e1s de ' + mitad + ' %</strong> a favor.';
}
} else {
boxAcuerdos.style.display = 'flex';
var fillA2 = document.getElementById('quorum-acuerdos-fill');
var pctA2 = document.getElementById('quorum-acuerdos-pct');
var txtA2 = document.getElementById('quorum-acuerdos-text');
var subtA = boxAcuerdos.querySelector('div:last-of-type');
if (subtA) {
subtA.textContent = tipo === 'extraordinaria-abs'
? 'M\u00e1s del 50 % de los derechos del condominio \u00b7 Art. 15 Ley 21.442'
: 'Al menos 66% de derechos del condominio · Art. 15 Ley 21.442';
}
if (totalHabil === 0) {
txtA2.textContent = 'Ingrese copropietarios hábiles para calcular';
pctA2.textContent = '--';
if (fillA2) fillA2.style.width = '0%';
} else {
var habOk = (tipo === 'extraordinaria-abs')
  ? (totalHabil > 50 * Derechos.ESCALA)
  : (totalHabil >= 66 * Derechos.ESCALA);
if (fillA2) {
fillA2.style.width = Math.min(Derechos.aNumero(totalHabil), 100) + '%';
fillA2.className = 'quorum-fill' + (habOk ? '' : ' fail');
}
pctA2.textContent = Derechos.texto(totalHabil) + ' %';
txtA2.innerHTML =
'Derechos h\u00e1biles para adopci\u00f3n de acuerdos: '
+ '<strong>' + Derechos.texto(totalHabil) + ' %</strong> del total del condominio. '
+ (habOk
? 'Cumple el quórum requerido (' + (tipo === 'extraordinaria-abs' ? 'más del 50%' : '66%') + ').'
: '<strong>No alcanza</strong> el quórum requerido (' + (tipo === 'extraordinaria-abs' ? 'más del 50%' : '66%') + ').');
}
}
setTimeout(function() { _hyrf(); }, 0);
}
function addPunto() {
puntoCount++;
var n = puntoCount;
var container = document.getElementById('puntos-container');
var div = document.createElement('div');
div.className = 'punto-card';
div.id = 'punto-' + n;
var sq = String.fromCharCode(39);
var tipoAsm = document.getElementById('tipo-asamblea') ? document.getElementById('tipo-asamblea').value : 'ordinaria';
var defaultRegla = (tipoAsm === 'ordinaria') ? 'abs_asistentes' : 'abs_derechos';
var h = '';
h += '<div class="punto-header">';
h += '<span class="punto-num">Punto N\u00b0 ' + n + '</span>';
h += '<button class="btn-del" data-ac="eliminarPuntoConfirm" data-args="@" aria-label="Eliminar este punto del orden del día">X Eliminar</button>';
h += '</div>';
h += '<div class="form-grid single" style="margin-bottom:14px">';
h += '<div class="field">';
h += '<label for="p' + n + '-titulo">T\u00edtulo del punto <span class="req" aria-hidden="true">*</span><span class="sr-only"> (campo obligatorio)</span></label>';
h += '<input type="text" id="p' + n + '-titulo" placeholder="Ej: Aprobaci\u00f3n del balance anual del condominio">';
h += '</div></div>';
h += '<div class="form-grid" style="margin-bottom:14px">';
h += '<div class="field span2">';
h += '<label for="p' + n + '-presentacion">Presentaci\u00f3n</label>';
h += '<textarea id="p' + n + '-presentacion" placeholder="Ej: La administradora present\u00f3 el balance al 31 de mayo, junto al detalle de gastos comunes."></textarea>';
h += '</div></div>';
h += '<div class="form-grid" style="margin-bottom:14px">';
h += '<div class="field span2">';
h += '<label for="p' + n + '-debate">Resumen del debate</label>';
h += '<textarea id="p' + n + '-debate" placeholder="Resuma los argumentos. Ej: Se debatió sobre el aumento del fondo de reserva..."></textarea>';
h += '</div></div>';
h += '<div class="form-grid" style="margin-top:14px;margin-bottom:4px">';
h += '<div class="field">';
h += '<p style="font-size:11.5px;font-weight:600;color:var(--c-navy);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px">\u00bfEste punto requiere acuerdo?</p>';
h += '<div class="toggle-group" style="margin-top:6px">';
h += '<button class="toggle-btn active" id="p' + n + '-req-si" data-ac="setRequiereAcuerdo" data-args="n:' + n + '|b:true">S\u00ed, requiere votaci\u00f3n</button>';
h += '<button class="toggle-btn" id="p' + n + '-req-no" data-ac="setRequiereAcuerdo" data-args="n:' + n + '|b:false">No, solo informativo</button>';
h += '</div>';
h += '<input type="hidden" id="p' + n + '-requiere" value="si">';
h += '</div>';
h += '</div>'; 
h += '<div class="form-grid" style="margin-top:14px">';
h += '<div class="field">';
h += '<label for="p' + n + '-responsable">Responsable</label>';
h += '<input type="text" id="p' + n + '-responsable" placeholder="Ej: Administradora del condominio">';
h += '</div>';
h += '<div class="field">';
h += '<label for="p' + n + '-plazo">Plazo</label>';
h += '<input type="text" id="p' + n + '-plazo" placeholder="Ej: 30 d\u00edas desde la asamblea">';
h += '</div></div>';
h += '<div class="punto-vot-panel" id="pvot-' + n + '" style="margin-top:16px">';
h += '<div class="punto-vot-header" data-ac="toggleVotPanel" data-args="n:' + n + '" role="button" tabindex="0" aria-expanded="false" aria-controls="pvot-body-' + n + '" aria-label="Mostrar u ocultar panel de votación del punto ' + n + '">';
h += '<span class="punto-vot-header-title">\ud83d\uddf3\ufe0f Registrar votaci\u00f3n</span>';
h += '<span class="punto-vot-header-toggle" id="pvot-toggle-' + n + '">Mostrar \u25bc</span>';
h += '</div>';
h += '<div class="punto-vot-body" id="pvot-body-' + n + '">';
h += '<div class="punto-vot-actions">';
h += '<button class="btn-vot-quick btn-vot-favor" data-ac="marcarTodos" data-args="n:' + n + '|favor">A favor</button>';
h += '<button class="btn-vot-quick btn-vot-contra" data-ac="marcarTodos" data-args="n:' + n + '|contra">En contra</button>';
h += '<button class="btn-vot-quick btn-vot-abst" data-ac="marcarTodos" data-args="n:' + n + '|abst">Abstenci\u00f3n</button>';
h += '<button class="btn-vot-quick btn-vot-limpiar" data-ac="_irkxl" data-args="n:' + n + '">Limpiar</button>';
h += '</div>';
h += '<table class="punto-vot-lista" id="pvot-lista-' + n + '">';
h += '<thead><tr>';
h += '<th style="width:28px"><input type="checkbox" id="pvot-all-' + n + '" data-cambio="_kbxoTodos" data-args="n:' + n + '|@" title="Seleccionar todos" aria-label="Seleccionar todos los copropietarios"></th>';
h += '<th>Unidad</th>';
h += '<th style="width:90px;text-align:right">% Derechos</th>';
h += '<th style="width:150px">Preferencia</th>';
h += '</tr></thead>';
h += '<tbody id="pvot-rows-' + n + '"></tbody>';
h += '</table>';
h += '<div class="punto-vot-resumen" id="pvot-resumen-' + n + '">';
h += '<div class="punto-vot-resumen-grid">';
h += '<div class="pvr-cell favor"><span class="pvr-cell-label">\u2705 A Favor</span><div class="pvr-cell-_pvau" id="pvot-rf-' + n + '">\u2014</div></div>';
h += '<div class="pvr-cell contra"><span class="pvr-cell-label">\u274c En Contra</span><div class="pvr-cell-_pvau" id="pvot-rc-' + n + '">\u2014</div></div>';
h += '<div class="pvr-cell abst"><span class="pvr-cell-label">\u2796 Abstenci\u00f3n</span><div class="pvr-cell-_pvau" id="pvot-ra-' + n + '">\u2014</div></div>';
h += '</div>';
h += '<div class="pvr-detalle" id="pvot-rdet-' + n + '">Abra el panel para registrar preferencias.</div>';
h += '<div class="pvr-conclusion pendiente" id="pvot-rconcl-' + n + '">Sin registro de votaci\u00f3n</div>';
h += '</div>'; 
h += '</div>'; 
h += '</div>'; 
div.innerHTML = h;
container.appendChild(div);
_qpese(n);
}
function _possk(str) {
if (!str) return '[FECHA]';
// El valor va directo al documento. Un <input type=date> siempre entrega
// AAAA-MM-DD, pero un borrador .json cargado puede traer cualquier cosa, y
// lo que no tenga esa forma no se imprime.
var f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str));
if (!f) return '[FECHA]';
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
var mes = meses[parseInt(f[2], 10) - 1];
if (!mes) return '[FECHA]';
return parseInt(f[3], 10) + ' de ' + mes + ' de ' + f[1];
}
// En Chile el separador decimal es la coma. Queda para los textos que no
// son derechos; los derechos los formatea Derechos.texto(), que ademas es
// exacto. Ver js/derechos.js.
function _pctCL(n) {
return (Number(n) || 0).toFixed(2).replace('.', ',');
}
function _pvau(id) {
const el = document.getElementById(id);
return el ? (el.value || '') : '';
}
function escapeHtml(s) {
if (s == null) return '';
return String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
}
function generateActa() {
const actaNum = escapeHtml(_pvau('acta-numero')) || '\u2014';
const nombreCondo = escapeHtml(_pvau('condo-nombre')) || '[NOMBRE DEL CONDOMINIO]';
const dir = escapeHtml(_pvau('condo-direccion'));
const rut = escapeHtml(_pvau('condo-rut'));
const tipo = _pvau('tipo-asamblea');
const tipoTexto = {
'ordinaria': 'ORDINARIA',
'extraordinaria-abs': 'EXTRAORDINARIA \u2014 MAYOR\u00cdA ABSOLUTA',
'extraordinaria-ref': 'EXTRAORDINARIA \u2014 MAYOR\u00cdA REFORZADA'
}[tipo] || 'ORDINARIA';
const tipoNarrativo = {
'ordinaria': 'ordinaria',
'extraordinaria-abs': 'extraordinaria de mayoría absoluta',
'extraordinaria-ref': 'extraordinaria de mayoría reforzada'
}[tipo] || 'ordinaria';
const esOrdinaria = (tipo === 'ordinaria');
const modalidad = _pvau('modalidad');
const fechaSes = _possk(_pvau('fecha-sesion'));
const horaInicio = escapeHtml(_pvau('hora-inicio')) || '--:--';
const lugar = escapeHtml(_pvau('lugar'));
const plataforma = escapeHtml(_pvau('plataforma')) || '';
const presidenteNom = escapeHtml(_pvau('nombre-presidente')) || '[PRESIDENTE]';
const quienConvoco = _pvau('quien-convoco');
const nombreConv = escapeHtml(_pvau('nombre-convocante')) || '[CONVOCANTE]';
const fechaCit = _possk(_pvau('fecha-citacion'));
// Estos dos los ponen los botones del paso 2, pero se restauran desde el
// borrador guardado o desde un .json cargado: se escapan como el resto.
const medioNotif = escapeHtml(_pvau('medio-notif'));
const doc24 = escapeHtml(_pvau('doc24'));
const grabacion = _pvau('grabacion');
const notario = _pvau('notario');
const notarioNombre = escapeHtml(_pvau('notario-nombre'));
const obs = escapeHtml(_pvau('observaciones'));
let asistentesRows = '';
let totalHabil = 0; 
let totalPresentes = 0; 
let countHabil = 0; 
let asistIdx = 0;
// El acta lee el padron por el mismo camino que el paso 2, con la
// habilidad ya arrastrada por copropietario (art. 14 del Reglamento).
_padronDelActa().filas.forEach(function(f) {
const asiste = f.asiste;
const unidad = f.unidad;
const nombre = f.nombre;
const der = f.der;
const habil = f.habil ? 'Sí' : 'No';
const rep = f.representante;

if (asiste) {
totalPresentes += der;
if (f.habil) { totalHabil += der; countHabil++; }
}
asistIdx++;
const asisteCell = asiste
? '<td style="text-align:center;color:#1a6e3c;font-weight:500">\u2713 S\u00ed</td>'
: '<td style="text-align:center;color:#999999">\u2014 No</td>';
const rowStyle = asiste ? '' : ' style="color:#aaaaaa;background:#f9f9f9;"';
asistentesRows +=
'<tr' + rowStyle + '><td>' + asistIdx + '</td><td>' + escapeHtml(unidad) + '</td><td>' + escapeHtml(nombre) +
'</td><td style="text-align:center">' + Derechos.texto(der) + ' %</td>' +
'<td style="text-align:center">' + habil + '</td>' + asisteCell +
'<td>' + escapeHtml(rep) + '</td></tr>';
});
totalPresentes = Math.min(totalPresentes, Derechos.CIEN);
totalHabil = Math.min(totalHabil, Derechos.CIEN);
let quorumMin = 33;
if (tipo === 'extraordinaria-abs') quorumMin = 50;
if (tipo === 'extraordinaria-ref') quorumMin = 66;
const quorumOk = (tipo === 'extraordinaria-abs')
  ? (totalPresentes > 50 * Derechos.ESCALA)
  : (totalPresentes >= quorumMin * Derechos.ESCALA);
let puntosHTML = '';
let resumenRows = '';
document.querySelectorAll('.punto-card').forEach(function(pc, idx) {
const n = pc.id.replace('punto-', '');
const titulo = escapeHtml(_pvau('p'+n+'-titulo'));
const presentacion = escapeHtml(_pvau('p'+n+'-presentacion'));
const debate = escapeHtml(_pvau('p'+n+'-debate'));
const resultado = escapeHtml(_pvau('p'+n+'-resultado'));
const responsable = escapeHtml(_pvau('p'+n+'-responsable'));
const plazoRaw = escapeHtml(_pvau('p'+n+'-plazo'));
const plazoText = (plazoRaw && plazoRaw.trim()) ? plazoRaw.trim() : '\u2014';
const requiere = (document.getElementById('p'+n+'-requiere') || {}).value || 'si';
// Ya vienen formateados por Derechos. El dataset guarda ademas el entero
// escalado (votFavor/votContra/votAbst), que aqui no hace falta.
const pvotFavor = pc.dataset.votFavorTxt || '';
const pvotContra= pc.dataset.votContraTxt || '';
const pvotAbst = pc.dataset.votAbstTxt || '';
const pvotBase = pc.dataset.votBase || '';
const pvotUmbral= pc.dataset.votUmbral || '';
const pvotAprob = pc.dataset.votAprobado|| 'pendiente';
const pvotUnidad= pc.dataset.votUnidad || '%';
const hasVot = (requiere === 'si' && pvotFavor !== '' && pvotBase !== '');
const esSoloInfo= (requiere === 'no');
var votText = '';
if (hasVot) {
votText += '<p><strong>Votaci\u00f3n:</strong> ';
votText += pvotBase + '. ';
votText += pvotUmbral + '. ';
{
// Siempre en derechos, en toda asamblea. Entre parentesis va cuanta
// gente hay detras de esos derechos: acompana la cifra, no la decide.
var favPer = pc.dataset.votFavorPers;
var totPer = pc.dataset.votTotalPers;
votText += 'A favor: <strong>' + pvotFavor + ' % de los derechos</strong>';
votText += (favPer !== undefined && totPer !== undefined
? ' (' + favPer + ' de ' + totPer + ' asistentes hábiles)' : '') + '. ';
votText += 'En contra: <strong>' + pvotContra + ' % de los derechos</strong>. ';
votText += 'Abstención: <strong>' + pvotAbst + ' % de los derechos</strong>.</p>';
}
const resultadoFinal = (pvotAprob === 'si') ? 'Se aprueba' : (pvotAprob === 'no') ? 'Se rechaza' : resultado;
// Sin resultado registrado salia "Acuerdo: ." — un punto suelto en un
// documento legal. Se dice que falta, que es la verdad.
votText += '<p><strong>Acuerdo: ' + (String(resultadoFinal || '').trim() || 'pendiente de registrar') + '.</strong>';
votText += (responsable ? ' Responsable: ' + responsable + '.' : '');
votText += (plazoRaw && plazoRaw.trim() ? ' Plazo: ' + plazoRaw.trim() + '.' : '') + '</p>';
} else if (esSoloInfo) {
votText += '<p><em>Punto informativo. No requiri\u00f3 acuerdo.</em>';
votText += (responsable ? ' Responsable: ' + responsable + '.' : '');
votText += (plazoRaw && plazoRaw.trim() ? ' Plazo: ' + plazoRaw.trim() + '.' : '') + '</p>';
} else {
votText += '<p><strong>Acuerdo: ' + (String(resultado || '').trim() || 'pendiente de registrar') + '.</strong>';
votText += (responsable ? ' Responsable: ' + responsable + '.' : '');
votText += (plazoRaw && plazoRaw.trim() ? ' Plazo: ' + plazoRaw.trim() + '.' : '') + '</p>';
}
puntosHTML +=
'<div class="acta-section">' +
'<div class="acta-section-title">Punto N\u00b0 ' + (idx+1) + ': ' + titulo + '</div>' +
(presentacion ? '<p><strong>Presentaci\u00f3n:</strong> ' + presentacion + '</p>' : '') +
(debate ? '<p><strong>Debate:</strong> ' + debate + '</p>' : '') +
votText + '</div>';
const resultadoResumen = (pvotAprob === 'si') ? 'Se aprueba'
: (pvotAprob === 'no') ? 'Se rechaza'
: (esSoloInfo ? 'Informativo'
: resultado);
resumenRows +=
'<tr><td>' + (idx+1) + '</td><td>' + titulo + '</td><td>' + resultadoResumen +
'</td><td>' + (responsable || '\u2014') + '</td><td>' + plazoText + '</td></tr>';
});
var firmAlt = firmAlternativa();
var firmasHTML = '<p style="margin-top:30px">' + (firmAlt === 'designados'
  ? 'Firman la presente acta los copropietarios designados al efecto por la asamblea (art. 15, Ley N\u00b0 21.442):'
  : 'Firman la presente acta los miembros del comit\u00e9 de administraci\u00f3n (art. 15, Ley N\u00b0 21.442):') + '</p>';
firmasHTML += '<div class="acta-signatures">';
firmLeer().forEach(function(fr) {
if (fr.nombre) {
firmasHTML += '<div class="sig-line"><div style="height:40px"></div>' + escapeHtml(fr.nombre);
if (fr.rut) firmasHTML += '<br><small>RUT: ' + escapeHtml(fr.rut) + '</small>';
firmasHTML += '<br><small>' + escapeHtml(fr.cargo) + '</small></div>';
}
});
var notarioRut = escapeHtml(_pvau('notario-rut'));
var notarioTipo = escapeHtml(_pvau('notario-tipo')) || 'Notario P\u00fablico';
if (notario === 'Si' && notarioNombre) {
firmasHTML += '<div class="sig-line"><div style="height:40px"></div>' + notarioNombre;
if (notarioRut) firmasHTML += '<br><small>RUT: ' + notarioRut + '</small>';
firmasHTML += '<br><small>' + notarioTipo + '</small></div>';
}
firmasHTML += '</div>';
var lugarText;
if (modalidad === 'presencial') {
lugarText = 'en <strong>' + (lugar || 'las dependencias del condominio') +
'</strong>, modalidad <strong>presencial</strong>';
} else if (modalidad === 'telem\u00e1tica' || modalidad === 'telematica') {
lugarText = 'en <strong>modalidad telem\u00e1tica</strong> mediante <strong>' +
(plataforma || '[plataforma]') + '</strong>';
} else {
lugarText = 'en <strong>modalidad mixta</strong>, presencial en <strong>' +
(lugar || '[lugar]') + '</strong>' +
(plataforma ? ' y telem\u00e1tica mediante <strong>' + plataforma + '</strong>' : '');
}
var obsTexto = (obs && obs.trim()) ? obs.trim() : '';
var acta =
'<div class="acta-header-preview">' +
'<div style="font-size:10pt;color:#666;text-align:right;margin-bottom:6px">Acta N\u00b0 ' + actaNum + '</div>' +
'<div class="acta-title">Acta de Asamblea ' + tipoTexto + ' de Copropietarios</div>' +
'<div class="acta-subtitle">' + nombreCondo + (rut ? ' \u2014 RUT ' + rut : '') + '</div>' +
'<div class="acta-subtitle">' + (dir || '') + '</div>' +
'</div>' +
'<div class="acta-section"><div class="acta-section-title">1. Datos de la sesi\u00f3n</div>' +
(function() {
var lugarPart, modalPart;
if (modalidad === 'presencial') {
lugarPart = 'En ' + (lugar || 'las dependencias del condominio');
modalPart = 'en modalidad presencial';
} else if (modalidad === 'telem\u00e1tica' || modalidad === 'telematica') {
lugarPart = 'En modalidad telem\u00e1tica';
modalPart = 'mediante <strong>' + (plataforma || '[plataforma]') + '</strong>';
} else {
lugarPart = 'En <strong>' + (lugar || '[lugar]') + '</strong>';
modalPart = 'en modalidad mixta'
+ (plataforma ? ', tambi\u00e9n mediante <strong>' + plataforma + '</strong>' : '');
}
return '<p>' + lugarPart + ', ' + modalPart + ', siendo las '
+ '<strong>' + horaInicio + ' horas</strong> del d\u00eda '
+ '<strong>' + fechaSes + '</strong>, se re\u00fanen los copropietarios del condominio '
+ '<strong>' + nombreCondo + '</strong>, en asamblea '
+ '<strong>' + tipoNarrativo + '</strong>, '
+ 'conforme al art\u00edculo 15 de la Ley N\u00b0\u00a021.442.</p></div>';
})() +
'<div class="acta-section"><div class="acta-section-title">2. Antecedentes de la Convocatoria</div>' +
'<p>' +
(quienConvoco === 'presidente'
? 'La presente asamblea fue convocada por el presidente del Comit\u00e9 de Administraci\u00f3n'
: quienConvoco === 'administrador'
? 'La presente asamblea fue convocada por el administrador o administradora'
: 'La presente asamblea fue convocada por copropietarios que representan el 10% o m\u00e1s de los derechos del condominio') +
', <strong>' + nombreConv + '</strong>, mediante ' + medioNotif +
' con fecha <strong>' + fechaCit + '</strong>.'
+ ' La documentaci\u00f3n fue remitida con 24 horas de anticipaci\u00f3n: <strong>' + doc24 + '</strong>.'
+ (grabacion === 'S\u00ed' || grabacion === 'Si' ? ' Se deja constancia de que la sesi\u00f3n fue registrada mediante grabaci\u00f3n de respaldo.' : '') +
'</p></div>' +
'<div class="acta-section"><div class="acta-section-title">3. Registro de asistencia</div>' +
'<table><thead><tr>' +
'<th>#</th><th>Unidad</th><th>Nombre</th><th>% Derechos</th><th>H\u00e1bil</th><th>Asiste</th><th>Representante</th>' +
'</tr></thead><tbody>' + asistentesRows + '</tbody></table></div>' +
'<div class="acta-section"><div class="acta-section-title">4. Qu\u00f3rum de constituci\u00f3n y adopci\u00f3n de acuerdos</div>' +
'<p>Los derechos presentes en la asamblea alcanzan el <strong>' + Derechos.texto(totalPresentes) + ' %</strong> del total del condominio. ' +
(quorumOk
? 'Con ello se cumple el qu\u00f3rum de constituci\u00f3n exigido (m\u00ednimo ' + quorumMin + '%). '
+ 'La sesi\u00f3n fue v\u00e1lidamente constituida por <strong>' + presidenteNom + '</strong> a las <strong>' + horaInicio + ' horas</strong>.'
: 'Este porcentaje <strong>no alcanza</strong> el m\u00ednimo de ' + quorumMin + '% requerido para constituir la asamblea.') +
'</p>' +
(esOrdinaria
? '<p>Para efectos de la adopci\u00f3n de acuerdos, \u00e9stos se computan sobre los '
+ '<strong>derechos</strong> de los copropietarios h\u00e1biles presentes, que alcanzan el '
+ '<strong>' + Derechos.texto(totalHabil) + ' %</strong> de los derechos del condominio '
+ '(' + countHabil + ' asistente' + (countHabil === 1 ? '' : 's') + '). '
+ 'El voto de cada copropietario es proporcional a sus derechos en los bienes de dominio '
+ 'com\u00fan, conforme al art\u00edculo 15 de la Ley N\u00b0\u00a021.442.'
+ (notario === 'Si' && notarioNombre
? ' Actu\u00f3 como ' + (escapeHtml(_pvau('notario-tipo')) || 'Ministro de Fe') + ' <strong>' + notarioNombre + '</strong>.'
: '') + '</p></div>'
: '<p>Para efectos de la adopci\u00f3n de acuerdos, se consideran \u00fanicamente los derechos '
+ 'correspondientes a copropietarios h\u00e1biles: <strong>' + Derechos.texto(totalHabil) + ' %</strong> '
+ 'de los derechos del condominio.'
+ (notario === 'Si' && notarioNombre
? ' Actu\u00f3 como ' + (escapeHtml(_pvau('notario-tipo')) || 'Ministro de Fe') + ' <strong>' + notarioNombre + '</strong>.'
: '') + '</p></div>') +
'<div class="acta-section"><div class="acta-section-title">5. Desarrollo de la tabla</div>' +
puntosHTML + '</div>' +
(obsTexto
? '<div class="acta-section"><div class="acta-section-title">6. Observaciones finales</div>'
+ '<p>' + obsTexto + '</p></div>'
: '') +
'<div class="acta-section"><div class="acta-section-title">' + (obsTexto ? 7 : 6) + '. Resumen de acuerdos</div>' +
'<table><thead><tr>' +
'<th>#</th><th>Acuerdo</th><th>Resultado</th><th>Responsable</th><th>Plazo</th>' +
'</tr></thead><tbody>' + resumenRows + '</tbody></table></div>' +
firmasHTML;
// EL CUERPO CANONICO DEL ACTA
// Es todo el documento salvo el pie: desde el encabezado ("Acta N°...")
// hasta las firmas, tal como sale de aqui despues de _ctgdc(). Es la cadena
// exacta sobre la que se calcula la huella (SHA-256 de sus bytes en UTF-8,
// en hexadecimal minuscula) ANTES de pedir el folio. El pie queda fuera
// porque lleva el folio, el codigo y la huella misma, que no se pueden
// conocer antes de sellar lo demas. En el archivo descargado el cuerpo va
// entre las marcas <!--acta:cuerpo--> y <!--/acta:cuerpo-->, de modo que
// cualquiera puede rehacer la cuenta sobre el archivo original.
// Un acta ya finalizada no se vuelve a armar desde el formulario: se usa el
// cuerpo que se sello, para que la copia que se baje despues sea la misma.
var cuerpo = _ctgdc(acta);
var sello = _selloVigente();
if (sello) cuerpo = sello.cuerpo;
var pie = _pieDelActa();
_actaGenerada = { cuerpo: cuerpo, pie: pie };
const container = document.getElementById('acta-content');
if (container) container.innerHTML = cuerpo + pie;
}

// ---------------------------------------------------------------------
//  El pie del documento
//  Dice lo que el sistema sostiene y nada mas. El folio, el codigo y la
//  huella quedan registrados en la base (ac_finalizar -> actas_emitidas);
//  la pagina /verificar los contrasta. Lo que la verificacion NO hace
//  -certificar la asamblea- se dice tambien, en el mismo lugar.
// ---------------------------------------------------------------------
var _PIE_ABRE = '<p style="font-size:11px;color:#333;text-align:center;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;line-height:1.55">';
var _PIE_TITULO = '<strong style="display:block;font-size:11.5px;color:#8B0000;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">';
// La sala se borra al cerrarla, y si nadie la cierra la barre la tarea de
// las 48 horas. "Servidor cifrado" y "al terminar la asamblea" decian mas
// de lo que se puede acreditar.
var _PIE_VOTACION = 'Si se utilizó la votación en vivo, el padrón y los votos se borran del servidor al cerrar la sala o, a más tardar, 48 horas después. ';
// El plazo de la tarea diaria de conservacion (vv_config) para el
// contenido de un acta finalizada.
var _PIE_CONSERVACION = 'La cuenta que la elaboró conserva una copia en el servidor hasta 180 días después de finalizada y puede borrarla antes. ';

function _pieDelActa() {
  if (!(typeof _actaPagada === 'function' && _actaPagada())) {
    return _PIE_ABRE + _PIE_TITULO +
      'BORRADOR — ACTA NO FINALIZADA, SIN FOLIO' +
      '</strong>' +
      '<span style="font-style:italic;color:#555">' +
      'Este documento es un <strong>borrador</strong>: todavía no ha sido finalizado, no tiene folio y no debe presentarse como acta de la asamblea. Para finalizarlo, vuelva al Paso 6 y presione <strong>Finalizar y guardar como PDF</strong>. ' +
      _PIE_VOTACION +
      'Conserve el archivo original para sus respaldos.' +
      '</span></p>';
  }
  var s = _selloVigente();
  if (!s) {
    // Finalizada, pero sin el cuerpo que se sello a mano: un acta cerrada
    // antes de que existiera la verificacion, o una copia que se rehizo en
    // otro equipo. Imprimir un codigo aqui seria afirmar que este texto es
    // el registrado, y eso no se sabe.
    return _PIE_ABRE + _PIE_TITULO +
      'ACTA № ' + escapeHtml(_actaFolio || '') + ' — COPIA REGENERADA' +
      '</strong>' +
      '<span style="font-style:italic;color:#555">' +
      'Esta copia se volvió a generar con los datos guardados y no lleva código de verificación. El documento verificable es el archivo que se descargó al finalizar el acta. ' +
      _PIE_CONSERVACION + _PIE_VOTACION +
      '</span></p>';
  }
  var demo = /^DEMO-/.test(_actaFolio || '');
  return _PIE_ABRE + _PIE_TITULO +
    'ACTA № ' + escapeHtml(_actaFolio || '') + ' — CONSERVE EL ARCHIVO ORIGINAL' +
    '</strong>' +
    '<span style="display:block;font-size:12px;color:#24282D;margin-bottom:2px">Código de verificación: <strong style="letter-spacing:1px">' + escapeHtml(s.codigo) + '</strong></span>' +
    '<span style="display:block;color:#24282D;margin-bottom:6px">Verifique este documento en actascopropiedad.cl/verificar con el folio y el código.</span>' +
    (demo
      ? '<span style="display:block;color:#8B0000;font-weight:bold;margin-bottom:6px">Documento de demostración: el folio y el código son simulados y no corresponden a ninguna acta emitida.</span>'
      : '') +
    '<span style="display:block;font-size:8.5px;color:#666;word-break:break-all;margin-bottom:6px">Huella SHA-256 del contenido: ' + escapeHtml(s.huella) + '</span>' +
    '<span style="font-style:italic;color:#555">' +
    'Al finalizar el acta quedaron registrados su folio, su código, la huella de su contenido y un resumen sin datos de personas. ' +
    'La página de verificación confirma que el folio y el código corresponden a un acta emitida y muestra ese resumen para compararlo con este documento; no certifica la validez legal de la asamblea ni la exactitud de lo que el acta declara. ' +
    _PIE_CONSERVACION + 'El registro de verificación se mantiene aunque esa copia se borre. ' +
    _PIE_VOTACION +
    'Conserve el archivo original.' +
    '</span></p>';
}
function _actaDocumento(conAviso) {
generateActa();
const container = document.getElementById('acta-content');
if (!container || container.innerHTML.trim() === '' || !_actaGenerada) {
alert('Complete los datos del acta antes de descargar el archivo.');
return;
}
const nombreRaw = _pvau('condo-nombre') || 'acta';
const nombreCondo = nombreRaw.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/ +/g, '_');
// Va al <title> y al nombre del archivo: solo si tiene forma de fecha.
const fechaRaw = _pvau('fecha-sesion');
const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaRaw) ? fechaRaw : 'sin_fecha';
const css =
'* { box-sizing:border-box; margin:0; padding:0; }' +
'body { font-family:"Helvetica Neue",Arial,sans-serif; font-size:10.5pt; line-height:1.7; color:#24282D; background:#fff; padding:16mm 14mm; }' +
'@media print { .aviso { display:none !important; } body { padding:0; } }' +
'@page { size:A4; margin:20mm 18mm; }' +
'.aviso { background:#E7EEEC; border-left:4px solid #2C313A; padding:10px 14px; margin-bottom:20px; font-size:10pt; color:#21262E; border-radius:3px; }' +
'.acta-header-preview { text-align:center; border-bottom:2px solid #2C313A; padding-bottom:14px; margin-bottom:24px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
'.acta-title { font-family:"Helvetica Neue",Arial,sans-serif; font-size:14pt; font-weight:bold; color:#2C313A; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
'.acta-subtitle { font-size:10pt; color:#5C6168; margin-top:4px; line-height:1.4; }' +
'.acta-section { margin-bottom:18px; page-break-inside:avoid; break-inside:avoid-page; }' +
'.acta-section-title { font-size:8pt; font-weight:bold; color:#2C313A; text-transform:uppercase; letter-spacing:1px; border-bottom:1.5px solid #2C313A; padding-bottom:4px; margin-bottom:8px; page-break-after:avoid; break-after:avoid-page; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
'p { margin-bottom:8px; text-align:justify; orphans:3; widows:3; }' +
'table { width:100%; border-collapse:collapse; font-size:9pt; margin:8px 0; page-break-inside:auto; }' +
'thead { display:table-header-group; }' +
'tr { page-break-inside:avoid; break-inside:avoid; }' +
'th { background:#2C313A; color:#ffffff; padding:6px 8px; text-align:left; font-size:8pt; text-transform:uppercase; letter-spacing:0.3px; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
'td { padding:5px 8px; border:1px solid #D7D6CE; vertical-align:middle; font-size:9.5pt; }' +
'tr:nth-child(even) td { background:#F4F4F0; -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
'.acta-signatures { display:grid; grid-template-columns:1fr 1fr; gap:28px; margin-top:50px; padding-top:8px; page-break-inside:avoid; break-inside:avoid-page; }' +
'.signature-block, .sig-line { border-top:1px solid #24282D; padding-top:8px; text-align:center; font-size:10pt; color:#5C6168; margin-top:46px; page-break-inside:avoid; }' +
'.signature-name, .sig-name { font-weight:bold; font-size:10.5pt; color:#24282D; }' +
'.signature-role, .sig-role { font-size:9pt; color:#5C6168; margin-top:2px; }';
const aviso = '<div class="aviso"><strong>Para guardar como PDF:</strong> Presiona Ctrl+P (Windows) o Cmd+P (Mac) y selecciona "Guardar como PDF" como destino de impresion.</div>';
// El archivo se abre desde el disco, donde no rige la politica del sitio:
// lleva la suya. No necesita ningun script, asi que no admite ninguno.
const politica = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:">';
// Se arma con las cadenas de generateActa y no con container.innerHTML: el
// navegador reescribe el HTML al serializarlo, y el cuerpo del archivo
// tiene que ser, byte a byte, el que se sello.
const doc =
'<!DOCTYPE html>\n<html lang="es">\n<head>\n' +
'<meta charset="UTF-8">\n' +
politica + '\n' +
'<title>Acta ' + nombreCondo + ' ' + fecha + '</title>\n' +
'<style>\n' + css + '\n</style>\n' +
'<!-- La huella SHA-256 que figura al pie es la del texto exacto entre las marcas acta:cuerpo, en UTF-8. El folio y el codigo se verifican en actascopropiedad.cl/verificar. -->\n' +
'</head>\n<body>\n' +
(conAviso ? aviso + '\n' : '') +
'<!--acta:cuerpo-->' + _actaGenerada.cuerpo + '<!--/acta:cuerpo-->\n' +
_actaGenerada.pie + '\n\n\n</body>\n</html>';
return { html: doc, nombre: 'acta_' + nombreCondo + '_' + fecha };
}

// El boton decia "Guardar como PDF" y bajaba un .html con un cartel pidiendole
// al usuario que apretara Ctrl+P. Ahora abre el cuadro de impresion en un
// iframe con el mismo CSS: el destino "Guardar como PDF" del navegador entrega
// un PDF de verdad, con texto seleccionable y paginado A4.
function savePDF() {
  // La puerta antes de finalizar. Sigue siendo un AVISO y no un bloqueo: un
  // acta que deja constancia de que la asamblea no se constituyo, o de un
  // padron incompleto, es un documento legitimo y bloquearlo seria peor. Lo
  // que si cambia es que deja de mezclar en una sola lista un RUT con el
  // digito verificador malo y que la asamblea no se haya constituido.
  if (typeof revisarConsistencia === 'function') {
    var _todo = revisarConsistencia().filter(function (x) { return !x.ok; });
    var _graves = _todo.filter(function (x) { return x.grave; });
    var _leves = _todo.filter(function (x) { return !x.grave; });
    if (_todo.length) {
      var _NL = String.fromCharCode(10);
      var _msg = '';
      if (_graves.length) {
        _msg += 'ATENCI\u00d3N' + _NL + _NL
             + _graves.map(function (x) { return '\u2022 ' + x.texto; }).join(_NL) + _NL + _NL;
      }
      if (_leves.length) {
        _msg += (_graves.length ? 'Adem\u00e1s, hay ' : 'La revisi\u00f3n encontr\u00f3 ')
             + _leves.length + ' cosa(s) por revisar:' + _NL
             + _leves.map(function (x) { return '\u2022 ' + x.texto; }).join(_NL) + _NL + _NL;
      }
      _msg += _graves.length
        ? 'El acta se puede emitir igual y quedar\u00e1 con estos datos. \u00bfContinuar?'
        : '\u00bfFinalizar de todos modos?';
      if (!confirm(_msg)) return;
    }
  }
  var btn = document.querySelector('.print-btn .btn-gold');
  if (btn) btn.disabled = true;
  showLoading('Finalizando el acta…', 'Estamos cerrando el documento y asignándole su folio.');

  actaFinalizar(function (err, motivo) {
    if (err) {
      if (btn) btn.disabled = false;
      hideLoading();
      if (err === 'SIN_PAGO') {
        // Por que se vuelve a pedir el pago, cuando la base lo dijo: sin
        // esto, quien ya pago veia aparecer el cobro sin explicacion.
        if (motivo && !enVitrina()) alert(motivo);
        // En vitrina no hay nada que cobrar a la vista, asi que tampoco se
        // saca el cartel del pago. Se dice lo que hay: el documento sale,
        // pero sin folio -ese lo emite Postgres y no se va a inventar aqui-.
        if (enVitrina()) {
          alert('El acta se descarga como borrador. El folio se emite al cerrarla, ' +
                'y esa parte no está habilitada en esta presentación.');
          _imprimirActa(btn);
          return;
        }
        if (window.actaMostrarPago) window.actaMostrarPago(true);
        else alert('Necesita activar esta asamblea antes de finalizar el acta.');
        return;
      }
      alert(err);
      return;
    }
    _imprimirActa(btn);
  });
}

function _imprimirActa(btn) {
  var doc = _actaDocumento(false);
  if (!doc) { if (btn) btn.disabled = false; hideLoading(); return; }
  showLoading('Preparando el documento…', 'Se abrira el cuadro de impresion. Elija «Guardar como PDF» como destino.');

  var previo = document.getElementById('acta-impresora');
  if (previo) previo.remove();

  var marco = document.createElement('iframe');
  marco.id = 'acta-impresora';
  marco.setAttribute('title', 'Documento del acta para imprimir');
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(marco);

  var cerrado = false;
  function limpiar() {
    if (cerrado) return;
    cerrado = true;
    if (btn) btn.disabled = false;
    hideLoading();
    setTimeout(function() { if (marco && marco.parentNode) marco.remove(); }, 1000);
  }

  marco.onload = function() {
    try {
      var v = marco.contentWindow;
      v.document.title = doc.nombre;   // el navegador lo propone como nombre del PDF
      v.focus();
      v.onafterprint = limpiar;
      // print() bloquea el hilo mientras el cuadro esta abierto; se cede un
      // cuadro para que alcance a pintarse el aviso antes de que aparezca
      setTimeout(function() { try { v.print(); } catch (err) { limpiar(); } }, 60);
      // Safari y varios navegadores moviles no disparan onafterprint
      setTimeout(limpiar, 1500);
      if (window.track) window.track('acta_generada', { tipo: (typeof _pvau === 'function' && _pvau('tipo-asamblea')) || '', salida: 'pdf' });
    } catch (e) {
      limpiar();
      alert('No pudimos abrir el cuadro de impresion. Use «Descargar copia editable» y abra ese archivo.\n\nDetalle tecnico: ' + e.message);
    }
  };

  var d = marco.contentWindow.document;
  d.open(); d.write(doc.html); d.close();
}

// La copia .html sigue disponible, pero ahora dice lo que es: un archivo que se
// puede volver a abrir y editar, no un PDF.
function descargarActaHTML() {
  var doc = _actaDocumento(true);
  if (!doc) return;
  try {
    var blob = new Blob([doc.html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = doc.nombre + '.html';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (window.track) window.track('acta_generada', { tipo: (typeof _pvau === 'function' && _pvau('tipo-asamblea')) || '', salida: 'html' });
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
  } catch (e) {
    alert('No pudimos generar el archivo. Intente nuevamente.\n\nDetalle tecnico: ' + e.message);
  }
}
function copyActa() {
const container = document.getElementById('acta-content');
const text = container ? container.innerText : '';
const ta = document.createElement('textarea');
ta.value = text;
ta.style.position = 'fixed';
ta.style.opacity = '0';
document.body.appendChild(ta);
ta.focus();
ta.select();
try {
document.execCommand('copy');
alert('✓ Texto copiado. Ahora puede pegarlo (Ctrl+V) donde lo necesite.');
} catch(e) {
alert('No pudimos copiar automáticamente. Seleccione el texto del acta y use Ctrl+C para copiarlo.');
}
document.body.removeChild(ta);
}
function _khftc(_pvau) {
var v = String(_pvau || '').trim().toLowerCase()
.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); 
return (v === 'si' || v === 's' || v === 'yes' || v === '1' || v === 'true') ? 'si' : 'no';
}
function _cwpu(_pvau) {
var v = String(_pvau || '').trim().toLowerCase()
.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
return (v === 'presencial' || v === 'p') ? 'Presencial' : 'Telematico';
}
function _fmtRut(v){ var raw=String(v||'').toUpperCase().replace(/[^0-9K]/g,''); if(raw.length<2) return raw; var cuerpo=raw.slice(0,-1), dv=raw.slice(-1), g=[]; while(cuerpo.length>3){ g.unshift(cuerpo.slice(-3)); cuerpo=cuerpo.slice(0,-3); } if(cuerpo) g.unshift(cuerpo); return g.join('.')+'-'+dv; }
function agregarFilaAsistente(tbody, unidad, nombre, derechos, habil, modalidad, representante, asiste, rut, correo) {
var n = tbody.rows.length;
var esHabil = _khftc(habil);
var esAsiste = _khftc(asiste !== undefined ? asiste : 'si');
var esMod = _cwpu(modalidad);
var unidadS = String(unidad || '').trim();
var nombreS = String(nombre || '').trim();
var derNum = 0;
var derRaw = derechos;
if (typeof derRaw === 'number') {
  derNum = Derechos.desdeTexto(String(derRaw));
} else {
  var derStr = String(derRaw || '').trim();
  
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(derStr)) {
    derStr = derStr.replace(/\./g, '').replace(',', '.');
  } else {
    derStr = derStr.replace(',', '.');
  }
  derNum = Derechos.desdeTexto(derStr);
}
var repS = String(representante || '').trim();
var tr = document.createElement('tr');
tr.innerHTML =
'<td><input type="text" id="asist-'+n+'-unidad" name="asist-'+n+'-unidad" aria-label="Unidad, fila '+(n+1)+'" class="unidad"></td>' +
'<td><input type="text" id="asist-'+n+'-nombre" name="asist-'+n+'-nombre" aria-label="Nombre del copropietario, fila '+(n+1)+'" class="nombre-asist"></td>' +
'<td><input type="text" id="asist-'+n+'-rut" name="asist-'+n+'-rut" aria-label="RUT, fila '+(n+1)+'" class="rut-asist"></td>' +
'<td><input type="number" id="asist-'+n+'-derechos" name="asist-'+n+'-derechos" aria-label="Porcentaje de derechos, fila '+(n+1)+'" step="0.01" min="0" max="100" class="derechos" data-cambio="calcularQuorum" data-tecla="calcularQuorum"></td>' +
'<td><select id="asist-'+n+'-habil" name="asist-'+n+'-habil" aria-label="Hábil, fila '+(n+1)+'" class="habil" data-cambio="quorumYVotacion"><option value="si">Sí</option><option value="no">No</option></select></td>' +
'<td><select id="asist-'+n+'-asiste" name="asist-'+n+'-asiste" aria-label="Asiste, fila '+(n+1)+'" class="asiste" data-cambio="quorumYVotacion"><option value="si">Sí</option><option value="no">No</option></select></td>' +
'<td><input type="text" id="asist-'+n+'-rep" name="asist-'+n+'-rep" aria-label="Representante, fila '+(n+1)+'" placeholder="Solo si vota un representante" class="representante"></td>' +
'<td><input type="text" id="asist-'+n+'-correo" name="asist-'+n+'-correo" aria-label="Correo electrónico, fila '+(n+1)+'" placeholder="opcional" class="correo-asist" inputmode="email"></td>' +
'<td><button class="btn-del" data-ac="delRow" data-args="@" aria-label="Quitar esta fila del registro" title="Quitar fila">X</button></td>';
tbody.appendChild(tr);
tr.querySelector('.unidad').value = unidadS;
tr.querySelector('.nombre-asist').value = nombreS;
var _rutEl = tr.querySelector('.rut-asist'); if (_rutEl) _rutEl.value = _fmtRut(rut);
// El campo es <input type=number>: lleva punto decimal, no coma.
tr.querySelector('.derechos').value = derNum ? String(derNum / Derechos.ESCALA) : '';
tr.querySelector('.representante').value = repS;
var _corEl = tr.querySelector('.correo-asist');
if (_corEl) _corEl.value = String(correo || '').trim().toLowerCase();
var habilSel = tr.querySelector('.habil');
if (habilSel) habilSel.value = esHabil;
var asisteSel = tr.querySelector('.asiste');
if (asisteSel) asisteSel.value = esAsiste;
}
function procesarFilas(filas) {
if (!filas || filas.length === 0) {
alert('El archivo no contiene datos. Revise que tenga al menos una fila con informaci\u00f3n de asistentes.');
return;
}
if (window.track) window.track('excel_importado', { filas: filas.length });
var tbody = document.getElementById('asistentes-tbody');
while (tbody.rows.length > 0) tbody.deleteRow(0);
var primeraFila = filas[0];
var c0 = String(primeraFila[0] || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
var c1 = String(primeraFila[1] || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
var esEncabezado = c0.includes('unidad') || c1.includes('nombre');
var inicio = esEncabezado ? 1 : 0;
var colMap = { unidad:-1, nombre:-1, rut:-1, derechos:-1, habil:-1, representante:-1, correo:-1 };
if (esEncabezado) {
primeraFila.forEach(function(cell, i) {
var c = String(cell || '').trim().toLowerCase()
.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
if (c.includes('unidad')) colMap.unidad = i;
if (c.includes('nombre')) colMap.nombre = i;
if (c.includes('derecho') || c.charAt(0) === '%') colMap.derechos = i;
if (c.includes('habil')) colMap.habil = i;
if (c.includes('representante') || c.includes('repres')) colMap.representante = i;
if (c.includes('rut') || c.includes('run')) colMap.rut = i;
if (c.includes('correo') || c.includes('mail')) colMap.correo = i;
});
} else {
colMap = { unidad:0, nombre:1, rut:2, derechos:3, habil:4, representante:5, correo:6 };
}
function celda(fila, key) {
var idx = colMap[key];
if (idx < 0 || idx === undefined) return '';
var v = fila[idx];
return (v === null || v === undefined) ? '' : String(v).trim();
}
var count = 0;
var errores = 0;
for (var i = inicio; i < filas.length; i++) {
var fila = filas[i];
if (!Array.isArray(fila)) continue;
var unidadVal = String(fila[colMap.unidad >= 0 ? colMap.unidad : 0] == null ? '' : fila[colMap.unidad >= 0 ? colMap.unidad : 0]).trim();
var nombreVal = String(fila[colMap.nombre >= 0 ? colMap.nombre : 1] == null ? '' : fila[colMap.nombre >= 0 ? colMap.nombre : 1]).trim();
if (!unidadVal && !nombreVal) continue;
try {
agregarFilaAsistente(
tbody,
celda(fila, 'unidad'),
celda(fila, 'nombre'),
celda(fila, 'derechos'),
celda(fila, 'habil'),
'',
celda(fila, 'representante'),
'si',
rutFormateado(celda(fila, 'rut')),
celda(fila, 'correo')
);
count++;
} catch(e) {
errores++;
// Solo el numero de fila y el motivo: la fila trae nombre, RUT y correo de
// una persona, y la consola de un equipo compartido no es lugar para eso.
console.warn('Error al importar fila ' + (i+1) + ':', e.message);
}
}
calcularQuorum();
alert(resumenImportacion(count, errores));
}

// El RUT llega escrito de cualquier forma: 123456789, 12345678-9, con puntos,
// sin ellos, o mutilado por Excel. Se normaliza siempre a 12.345.678-5 y se
// comprueba el digito verificador (modulo 11), que es lo que de verdad delata
// un error de tipeo.
function rutSoloDigitos(v) {
  return String(v == null ? '' : v).toUpperCase().replace(/[^0-9K]/g, '');
}
function rutFormateado(v) {
  var raw = rutSoloDigitos(v);
  if (raw.length < 2) return String(v == null ? '' : v).trim();
  var cuerpo = raw.slice(0, -1), dv = raw.slice(-1), grupos = [];
  while (cuerpo.length > 3) { grupos.unshift(cuerpo.slice(-3)); cuerpo = cuerpo.slice(0, -3); }
  if (cuerpo) grupos.unshift(cuerpo);
  return grupos.join('.') + '-' + dv;
}
function rutDvCalza(v) {
  var raw = rutSoloDigitos(v);
  if (raw.length < 2) return false;
  var cuerpo = raw.slice(0, -1), dv = raw.slice(-1);
  if (!/^[0-9]+$/.test(cuerpo)) return false;
  var suma = 0, mult = 2;
  for (var i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  var r = 11 - (suma % 11);
  var esperado = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return esperado === dv;
}

// Un "se importaron 40 registros" no dice si el padron quedo bien. Esto
// revisa lo que de verdad se equivoca: derechos que no suman 100, RUT
// repetidos, correos mal escritos y filas sin RUT (que no podran votar).
function resumenImportacion(count, errores) {
  var filas = document.querySelectorAll('#asistentes-tbody tr');
  var suma = 0, sinRut = 0, correosMalos = 0, conCorreo = 0, dvMalos = 0;
  // Sin prototipo: la clave la escribe quien armo la planilla, y un RUT
  // "constructor" no puede nacer ya visto.
  var vistos = Object.create(null), repetidos = [];
  filas.forEach(function(tr) {
    var v = function(sel){ var e = tr.querySelector(sel); return e ? String(e.value).trim() : ''; };
    suma += Derechos.desdeTexto(v('.derechos'));
    var rut = v('.rut-asist').replace(/[.\s-]/g, '').toLowerCase();
    if (!rut) sinRut++;
    else {
      if (vistos[rut]) { if (repetidos.indexOf(rut) < 0) repetidos.push(rut); }
      vistos[rut] = 1;
      if (!rutDvCalza(rut)) dvMalos++;
    }
    var c = v('.correo-asist');
    if (c) { conCorreo++; if (!/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(c)) correosMalos++; }
  });

  var m = 'Se cargaron ' + count + ' unidades.\n';
  m += '\nSuma de derechos: ' + Derechos.texto(suma) + ' %';
  m += (Math.abs(suma - Derechos.CIEN) <= 0.5 * Derechos.ESCALA)
     ? '  ✓'
     : '  ← revise: debería sumar 100 %';

  var avisos = [];
  if (errores > 0)       avisos.push(errores + ' fila(s) no se pudieron leer y se omitieron.');
  if (sinRut > 0)        avisos.push(sinRut + ' unidad(es) sin RUT: no podrán votar en la votación en vivo.');
  if (repetidos.length)  avisos.push(repetidos.length + ' RUT repetido(s). Si son unidades '
    + 'distintas del mismo copropietario, está bien: vota una vez con la suma de sus '
    + 'derechos, y si debe en alguna no vota con ninguna (art. 14 del Reglamento). '
    + 'Si son la misma unidad cargada dos veces, bórrela.');
  if (dvMalos > 0)       avisos.push(dvMalos + ' RUT con dígito verificador que no calza: revise si hay un error de tipeo. Esa persona no podrá votar.');
  if (correosMalos > 0)  avisos.push(correosMalos + ' correo(s) mal escrito(s): no recibirán la constancia de su voto.');

  if (avisos.length) m += '\n\nPara revisar:\n• ' + avisos.join('\n• ');
  if (conCorreo > 0 && correosMalos === 0) {
    m += '\n\n' + conCorreo + ' copropietario(s) recibirán por correo la constancia de su voto.';
  }
  return m;
}
function importarExcel(input) {
var file = input.files[0];
if (!file) return;
var ext = file.name.split('.').pop().toLowerCase();
var reader = new FileReader();
if (ext === 'csv') {
reader.onload = function(e) {
var text = e.target.result.replace(/^\uFEFF/, '');
var lines0 = text.split(String.fromCharCode(10));
var firstDataLine = '';
for (var li = 0; li < lines0.length; li++) {
  var l0 = lines0[li].replace(new RegExp(String.fromCharCode(13),'g'),'').trim();
  if (l0 && l0.charAt(0) !== '#') { firstDataLine = l0; break; }
}
var sep = (firstDataLine.split(';').length > firstDataLine.split(',').length) ? ';' : ',';
var lines = text.split(String.fromCharCode(10));
var filas = [];
lines.forEach(function(line) {
line = line.replace(new RegExp(String.fromCharCode(13), 'g'), '').trim();
if (!line) return;
if (line.charAt(0) === '#') return;
var cols = []; var inQuote = false; var cell = '';
for (var ci = 0; ci < line.length; ci++) {
var ch = line[ci];
if (ch === '"') { inQuote = !inQuote; continue; }
if (ch === sep && !inQuote) { cols.push(cell.trim()); cell = ''; continue; }
cell += ch;
}
cols.push(cell.trim());
filas.push(cols);
});
procesarFilas(filas);
};
reader.readAsText(file, 'UTF-8');
} else if (ext === 'xlsx' || ext === 'xls') {
if (typeof XLSX === 'undefined') {
  alert('No pudimos cargar el lector de Excel. Como alternativa, guarde el archivo como CSV (UTF-8) e impórtelo en formato .csv.');
  input.value = '';
  return;
}
reader.onload = function(e) {
  try {
    var data = new Uint8Array(e.target.result);
    var wb = XLSX.read(data, { type: 'array' });
    var wsName = wb.SheetNames.indexOf('Asistentes') >= 0 ? 'Asistentes' : wb.SheetNames[0];
    var ws = wb.Sheets[wsName];
    var filas = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    procesarFilas(filas);
  } catch(err) {
    alert('No pudimos leer el archivo Excel. Guárdelo como CSV (UTF-8) e impórtelo nuevamente en formato .csv.');
  }
};
reader.readAsArrayBuffer(file);
} else {
alert('Formato no compatible. Use archivos .csv o .xlsx, o exporte su Excel como CSV (UTF-8).');
}
input.value = '';
}
// Plantilla en Excel de verdad, no CSV. El CSV obligaba a adivinar el
// separador y dejaba el porcentaje como texto: "1,50" o "1.50" segun el
// computador. En xlsx los derechos van como numero y ese problema
// desaparece. Ademas lleva una hoja con las instrucciones.
function descargarPlantilla() {
  if (typeof XLSX === 'undefined') {
    alert('No se pudo preparar la plantilla. Recargue la página e inténtelo de nuevo.');
    return;
  }
  var filas = [
    ['Unidad','Nombre del copropietario','RUT','% Derechos','Hábil','Representante','Correo'],
    ['101', 'Juan Pérez González',    '12.345.678-5', 1.5,  'Sí', '',                             'juan.perez@correo.cl'],
    ['202', 'María López Soto',       '9.876.543-3',  0.85, 'No', 'Pedro López (poder notarial)', 'maria.lopez@correo.cl'],
    ['303', 'Carlos Ramírez Fuentes', '15.234.567-4', 2.1,  'Sí', '',                             '']
  ];
  var hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = [ {wch:10}, {wch:32}, {wch:16}, {wch:12}, {wch:8}, {wch:30}, {wch:28} ];

  // Excel es el enemigo del RUT: si la celda queda como numero, "12345678"
  // pierde el formato, "007" pierde el cero y los RUT largos salen en
  // notacion cientifica. Dejamos en TEXTO las columnas donde eso pasa, y con
  // dos decimales la de derechos. Se preformatean 200 filas vacias para que
  // quien complete la planilla herede el formato sin tener que hacer nada.
  var TEXTO = [0, 2, 6];          // Unidad, RUT, Correo
  var DECIMAL = 3;                // % Derechos
  var HASTA = 200;
  for (var r = 1; r < HASTA; r++) {
    TEXTO.forEach(function(c) {
      var a = XLSX.utils.encode_cell({ c: c, r: r });
      if (hoja[a]) { hoja[a].t = 's'; hoja[a].z = '@'; }
      else hoja[a] = { t: 'z', z: '@' };
    });
    var d = XLSX.utils.encode_cell({ c: DECIMAL, r: r });
    if (hoja[d]) hoja[d].z = '0.00';
    else hoja[d] = { t: 'z', z: '0.00' };
  }
  hoja['!ref'] = 'A1:G' + HASTA;

  var guia = [
    ['Cómo completar esta planilla'],
    [''],
    ['1. Borre las tres filas de ejemplo de la hoja «Padrón».'],
    ['2. No cambie los nombres de las columnas ni su orden.'],
    ['3. Agregue una fila por cada unidad del condominio.'],
    [''],
    ['Columna', 'Qué se escribe', '¿Obligatorio?'],
    ['Unidad', 'Número o identificación del departamento, casa o local. Ej: 101, A-3, Local 2.', 'Sí'],
    ['Nombre del copropietario', 'Nombre completo de quien figura como propietario de esa unidad.', 'Sí'],
    ['RUT', 'Con puntos o sin ellos, da lo mismo: al importar el sistema lo deja como 12.345.678-5 y avisa si el dígito verificador no calza. La columna viene como texto para que Excel no le cambie el formato.', 'Sí'],
    ['% Derechos', 'Porcentaje sobre los bienes comunes, según el reglamento de copropiedad. Escríbalo como número (1,5), no como texto. La columna ya viene con dos decimales. La suma de todas las unidades debe dar 100.', 'Sí'],
    ['Hábil', 'Escriba Sí o No. Es hábil quien está al día en sus obligaciones económicas con el condominio. También quien tiene convenio de pago, pero solo desde que paga la primera cuota y mientras cumpla los términos convenidos y sus demás obligaciones económicas (art. 9 del Reglamento). Con más de una unidad debe estar al día en todas: si debe en una, no vota con ninguna (art. 14). Solo los hábiles votan; los inhábiles asisten pero no votan. Esta calidad la acredita la administración.', 'Sí'],
    ['Representante', 'Complete solo si vota otra persona con poder. Escriba su nombre y el tipo de poder.', 'No'],
    ['Correo', 'Correo del Registro de Copropietarios. Si lo completa, esa persona recibe por correo la constancia de su voto: le sirve de respaldo y permite detectar si alguien votó en su nombre.', 'No'],
    [''],
    ['Cuando termine'],
    ['Guarde el archivo y súbalo con el botón «Importar desde Excel» del Paso 3.'],
    ['El sistema le dirá cuántas unidades cargó, cuánto suma el porcentaje de derechos y si encontró algún problema.']
  ];
  var hojaGuia = XLSX.utils.aoa_to_sheet(guia);
  hojaGuia['!cols'] = [ {wch:26}, {wch:84}, {wch:14} ];

  var libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Padrón');
  XLSX.utils.book_append_sheet(libro, hojaGuia, 'Instrucciones');
  XLSX.writeFile(libro, 'padron_asamblea.xlsx');

  if (window.track) window.track('plantilla_descargada');
}
function actualizarVotacion() {
_hyrf();
}
function updateTipoAsambleaExtended() {
updateTipoAsamblea();
var tipo = document.getElementById('tipo-asamblea').value;
if (tipo === 'ordinaria') {
} else if (tipo === 'extraordinaria-abs') {
} else if (tipo === 'extraordinaria-ref') {
}
actualizarVotacion();
}
function setRequiereAcuerdo(n, requiere) {
var hiddenEl = document.getElementById('p' + n + '-requiere');
var panelEl = document.getElementById('pvot-' + n);
var btnSi = document.getElementById('p' + n + '-req-si');
var btnNo = document.getElementById('p' + n + '-req-no');
if (hiddenEl) hiddenEl.value = requiere ? 'si' : 'no';
if (panelEl) panelEl.style.display = requiere ? '' : 'none';
if (btnSi) { btnSi.classList.toggle('active', requiere); }
if (btnNo) { btnNo.classList.toggle('active', !requiere); }
}
function toggleVotPanel(n) {
var body = document.getElementById('pvot-body-' + n);
var toggle = document.getElementById('pvot-toggle-' + n);
if (!body) return;
var header = body.previousElementSibling; 
var isOpen = body.classList.contains('open');
if (isOpen) {
body.classList.remove('open');
if (toggle) toggle.textContent = 'Mostrar ▼';
if (header && header.setAttribute) header.setAttribute('aria-expanded', 'false');
} else {
_qpese(n);
body.classList.add('open');
if (toggle) toggle.textContent = 'Ocultar ▲';
if (header && header.setAttribute) header.setAttribute('aria-expanded', 'true');
}
}
function _qpese(n) {
var tbody = document.getElementById('pvot-rows-' + n);
if (!tbody) return;
// La clave es unidad|nombre, tal como vienen del padron: sin prototipo.
var prevPrefs = Object.create(null);
tbody.querySelectorAll('tr').forEach(function(row) {
var key = row.dataset.key;
var sel = row.querySelector('.pref-select');
if (key && sel) prevPrefs[key] = sel.value;
});
tbody.innerHTML = '';
var hayHabiles = false;
_padronDelActa().filas.forEach(function(f) {
var esAsiste = f.asiste;
if (!esAsiste) return;
var esHabil = f.habil;
var nombre = f.nombre;
var unidad = f.unidad;
var rutAsist = f.rut;
// Se guarda el TEXTO tal como se escribio. Convertirlo aqui y volver a
// leerlo en _jfg era una vuelta por coma flotante que no hace falta.
var derechos = f.derTexto;
var key = unidad + '|' + nombre;
var prevPref = prevPrefs[key] || 'sin_reg';
var tr = document.createElement('tr');
tr.dataset.key = key;
tr.dataset.rut = rutAsist;
tr.dataset.derechos = derechos;
tr.dataset.habil = esHabil ? 'si' : 'no';
tr.dataset.nombre = nombre;
if (!esHabil) tr.classList.add('row-inhabit');
var tdChk = document.createElement('td');
if (esHabil) {
var chk = document.createElement('input');
chk.type = 'checkbox'; chk.className = 'pvot-chk';
chk.setAttribute('aria-label', 'Seleccionar a ' + (nombre || unidad || 'este copropietario'));
tdChk.appendChild(chk);
}
tr.appendChild(tdChk);
var tdUni = document.createElement('td');
tdUni.textContent = unidad || '—';
tr.appendChild(tdUni);
var tdDer = document.createElement('td');
tdDer.textContent = _pctCL(derechos) + ' %';
tdDer.style.textAlign = 'right';
tr.appendChild(tdDer);
var tdPref = document.createElement('td');
if (!esHabil) {
var badge = document.createElement('span');
badge.className = 'badge-inhabit';
badge.textContent = 'Inhábil · no vota';
tdPref.appendChild(badge);
} else {
hayHabiles = true;
var sel = document.createElement('select');
sel.className = 'pref-select sin_reg';
sel.setAttribute('aria-label', 'Voto de ' + (nombre || unidad || 'este copropietario'));
['sin_reg', 'favor', 'contra', 'abst'].forEach(function(v) {
var opt = document.createElement('option');
opt.value = v;
opt.textContent = v === 'sin_reg' ? 'Sin registrar'
: v === 'favor' ? 'A favor'
: v === 'contra' ? 'En contra'
: 'Abstención';
sel.appendChild(opt);
});
sel.value = prevPref;
sel.className = 'pref-select ' + sel.value;
sel.addEventListener('change', function() {
this.className = 'pref-select ' + this.value;
_jfg(n);
_vufa(n);
});
tdPref.appendChild(sel);
}
tr.appendChild(tdPref);
tbody.appendChild(tr);
});
if (!hayHabiles) {
var trEmpty = document.createElement('tr');
trEmpty.innerHTML = '<td colspan="5" style="text-align:center;color:var(--c-text-2);padding:14px">No hay asistentes hábiles registrados en el paso de asistentes.</td>';
tbody.appendChild(trEmpty);
}
_jfg(n);
}
// La regla de mayoria que corresponde a cada tipo de asamblea. Los nombres
// internos viejos ('abs_asistentes') se conservan en los borradores ya
// guardados; lo que decide es la regla de Derechos.
function _reglaDe(tipoAsm) {
if (tipoAsm === 'extraordinaria-ref') return 'reforzada';
if (tipoAsm === 'extraordinaria-abs') return 'absoluta';
return 'presentes';
}
function _jfg(n) {
var tbody = document.getElementById('pvot-rows-' + n);
if (!tbody) return;
var tipoAsm = document.getElementById('tipo-asamblea') ? document.getElementById('tipo-asamblea').value : 'ordinaria';

// Enteros escalados de punta a punta. Sumar en coma flotante hacia que el
// veredicto dependiera del ORDEN de las filas del padron.
var totalDer = 0, favorDer = 0, contraDer = 0, abstDer = 0, sinReg = 0;
var totalHab = 0, favorHab = 0, contraHab = 0, abstHab = 0;
tbody.querySelectorAll('tr').forEach(function(row) {
if (row.dataset.habil !== 'si') return;
var der = Derechos.desdeTexto(row.dataset.derechos);
var sel = row.querySelector('.pref-select');
var pref = sel ? sel.value : 'sin_reg';
totalDer += der; totalHab++;
if (pref === 'favor') { favorDer += der; favorHab++; }
else if (pref === 'contra') { contraDer += der; contraHab++; }
else if (pref === 'abst') { abstDer += der; abstHab++; }
else { sinReg++; }
});

var r = Derechos.resolver({
regla: _reglaDe(tipoAsm),
favor: favorDer, contra: contraDer, abstencion: abstDer,
presentes: totalDer, personas: totalHab, personasFavor: favorHab,
sinRegistrar: sinReg,
// En el acta la votacion se registra de una vez: no hay una sala abierta
// esperando votos. Lo que falta por registrar, falta.
cerrada: true
});

var rfEl = document.getElementById('pvot-rf-' + n);
var rcEl = document.getElementById('pvot-rc-' + n);
var raEl = document.getElementById('pvot-ra-' + n);
if (!rfEl) return;
// Siempre en derechos: es lo que la ley cuenta.
rfEl.textContent = r.favorTexto + ' %';
rcEl.textContent = r.contraTexto + ' %';
raEl.textContent = r.abstencionTexto + ' %';

var detEl = document.getElementById('pvot-rdet-' + n);
var conclEl = document.getElementById('pvot-rconcl-' + n);
if (detEl) {
var detalle = r.descripcionBase + ' · ' + r.descripcionUmbral;
if (sinReg > 0) detalle += ' · ' + sinReg + ' asistente(s) sin registrar';
detEl.textContent = detalle;
}
if (conclEl) {
if (sinReg > 0) {
conclEl.className = 'pvr-conclusion pendiente';
conclEl.textContent = 'Faltan ' + sinReg + ' preferencia(s) por registrar';
} else if (totalHab === 0) {
conclEl.className = 'pvr-conclusion pendiente';
conclEl.textContent = 'Sin asistentes hábiles';
} else if (r.estado === 'aprobado') {
conclEl.className = 'pvr-conclusion aprobado';
conclEl.textContent = 'ACUERDO APROBADO';
} else {
conclEl.className = 'pvr-conclusion rechazado';
conclEl.textContent = 'ACUERDO NO APROBADO';
}
}
var card = document.getElementById('punto-' + n);
if (card) {
// El dataset guarda el ENTERO escalado, no un decimal redondeado a dos
// cifras: el acta lee de aqui, y redondear en el traspaso perdia la
// precision que el padron si admite.
card.dataset.votFavor = String(favorDer);
card.dataset.votContra = String(contraDer);
card.dataset.votAbst = String(abstDer);
// Y el texto ya formateado, para que nadie lo vuelva a formatear con
// otro criterio mas abajo.
card.dataset.votFavorTxt = r.favorTexto;
card.dataset.votContraTxt = r.contraTexto;
card.dataset.votAbstTxt = r.abstencionTexto;
// El numero de personas acompana, no decide.
card.dataset.votFavorPers = favorHab;
card.dataset.votTotalPers = totalHab;
card.dataset.votBase = r.descripcionBase;
card.dataset.votUmbral = r.descripcionUmbral;
card.dataset.votAprobado= (r.estado === 'aprobado') ? 'si' : (r.estado === 'rechazado' ? 'no' : 'pendiente');
card.dataset.votUnidad = '%';
card.dataset.votSinReg = sinReg;
}
}
function _vufa(n) {
var card = document.getElementById('punto-' + n);
var selRes = document.getElementById('p' + n + '-resultado');
if (!card || !selRes) return;
var aprobado = card.dataset.votAprobado;
if (aprobado === 'si') selRes.value = 'Se aprueba';
if (aprobado === 'no') selRes.value = 'Se rechaza';
}
function marcarTodos(n, pref) {
var tbody = document.getElementById('pvot-rows-' + n);
if (!tbody) return;
var anyChecked = false;
tbody.querySelectorAll('tr').forEach(function(row) {
if (row.dataset.habil !== 'si') return;
var chk = row.querySelector('.pvot-chk');
if (!chk || !chk.checked) return;
anyChecked = true;
var sel = row.querySelector('.pref-select');
if (sel) { sel.value = pref; sel.className = 'pref-select ' + pref; }
});
if (!anyChecked) {
tbody.querySelectorAll('tr').forEach(function(row) {
if (row.dataset.habil !== 'si') return;
var sel = row.querySelector('.pref-select');
if (sel) { sel.value = pref; sel.className = 'pref-select ' + pref; }
});
}
_jfg(n);
_vufa(n);
}
function _irkxl(n) {
var tbody = document.getElementById('pvot-rows-' + n);
if (!tbody) return;
tbody.querySelectorAll('.pref-select').forEach(function(sel) {
sel.value = 'sin_reg'; sel.className = 'pref-select sin_reg';
});
_jfg(n);
}
function _kbxo(n, checked) {
var tbody = document.getElementById('pvot-rows-' + n);
if (!tbody) return;
tbody.querySelectorAll('.pvot-chk').forEach(function(chk) { chk.checked = checked; });
}
function _hyrf() {
document.querySelectorAll('.punto-card').forEach(function(card) {
var n = card.id.replace('punto-', '');
_qpese(n);
});
}
function _ctgdc(texto) {
if (!texto) return '';
texto = texto
.replace(/\bsesion\b/g, 'sesi\u00f3n')
.replace(/\bSesion\b/g, 'Sesi\u00f3n')
.replace(/\bsesiones\b/g, 'sesiones')
.replace(/\breunen\b/g, 're\u00fanen')
.replace(/\bReunen\b/g, 'Re\u00fanen')
.replace(/\badministracion\b/g, 'administraci\u00f3n')
.replace(/\bAdministracion\b/g, 'Administraci\u00f3n')
.replace(/\bcomite\b/g, 'comit\u00e9')
.replace(/\bComite\b/g, 'Comit\u00e9')
.replace(/\bvotacion\b/g, 'votaci\u00f3n')
.replace(/\bVotacion\b/g, 'Votaci\u00f3n')
.replace(/\bconstitucion\b/g, 'constituci\u00f3n')
.replace(/\bConstitucion\b/g, 'Constituci\u00f3n');
texto = texto
.replace(/(\d)(votos?)/g, '$1 $2') 
.replace(/(\d)(%)/g, '$1 $2'); 
texto = texto.replace(/(\d{1,2}:\d{2})-(\s)/g, '$1$2');
texto = texto.replace(/(\d{1,2}:\d{2})-$/g, '$1');
texto = texto.replace(/ +/g, ' ').trim();
// Mayuscula al empezar frase. Ojo: cada </strong> corta el texto en otro
// nodo, asi que capitalizar el inicio de CADA nodo producia "19:00 horas
// Del dia" y "no alcanza El minimo". Solo cuenta como inicio de frase
// despues de una etiqueta de bloque, no despues de una en linea.
var BLOQUE = /^<\/?(p|div|li|td|th|h[1-6]|br|tr|table|tbody|thead|ul|ol|section)\b/i;
var inicioDeFrase = true;
texto = texto.replace(
/(<[^>]*>)|([^<]+)/g,
function(match, htmlTag, textNode) {
if (htmlTag) {
  if (BLOQUE.test(htmlTag)) inicioDeFrase = true;
  return htmlTag;
}
var salida = textNode;
if (inicioDeFrase) {
  salida = salida.replace(/^(\s*)([a-z\u00e0-\u00ff])/, function(_, esp, letra) {
    return esp + letra.toUpperCase();
  });
}
// Tras punto, exclamacion o interrogacion siempre empieza frase nueva.
salida = salida.replace(/([.!?]\s+)([a-z\u00e0-\u00ff])/g, function(_, sig, letra) {
  return sig + letra.toUpperCase();
});
if (/\S/.test(textNode)) inicioDeFrase = /[.!?]\s*$/.test(textNode);
return salida;
}
);
return texto;
}


(function() {

  
  function soloNumeros(e) {
    var el = e.target;
    var val = el.value.replace(/[^\d]/g, '');
    if (el.value !== val) el.value = val;
  }

  
  // Un RUT mal tipeado no se nota hasta que esa persona no puede votar.
  // Se avisa al salir del campo, sin bloquear: puede haber casos raros.
  function marcarRut(el) {
    if (!el) return;
    var hay = String(el.value || '').trim();
    var malo = hay && typeof rutDvCalza === 'function' && !rutDvCalza(hay);
    el.classList.toggle('rut-dudoso', !!malo);
    el.title = malo ? 'El dígito verificador no calza. Revise si hay un error de tipeo.' : '';
  }

  function formatRUT(e) {
    var el  = e.target;
    var raw = el.value.toUpperCase().replace(/[^0-9K]/g, '');
    if (!raw) { el.value = ''; return; }
    var cuerpo = raw.length > 1 ? raw.slice(0, -1) : '';
    var dv     = raw.length > 1 ? raw.slice(-1) : raw;
    var grupos = [];
    while (cuerpo.length > 3) {
      grupos.unshift(cuerpo.slice(-3));
      cuerpo = cuerpo.slice(0, -3);
    }
    if (cuerpo) grupos.unshift(cuerpo);
    var formatted = raw.length > 1
      ? grupos.join('.') + '-' + dv
      : dv;
    if (el.value !== formatted) {
      el.value = formatted;
      try { el.setSelectionRange(formatted.length, formatted.length); } catch(err) {}
    }
  }

  
  function soloLetras(e) {
    var el  = e.target;
    var val = el.value.replace(/[^a-zA-Z\u00e0-\u00fc\u00c0-\u00dc\s'\-\.]/g, '');
    if (e.type === 'blur') val = val.replace(/\s{2,}/g, ' ').trim();
    if (el.value !== val) el.value = val;
  }

  
  function bind(id, fn, events) {
    var el = document.getElementById(id);
    if (!el) return;
    (events || ['input']).forEach(function(ev) { el.addEventListener(ev, fn); });
  }

  function initValidaciones() {
    
    bind('acta-numero', soloNumeros);

    
    ['condo-rut','notario-rut'].forEach(function(id) {
      bind(id, formatRUT, ['input', 'blur']);
      var el = document.getElementById(id);
      if (el) el.addEventListener('blur', function() { marcarRut(el); });
    });

    
    ['nombre-convocante','nombre-presidente','nombre-admin',
     'notario-nombre'].forEach(function(id) {
      bind(id, soloLetras, ['input', 'blur']);
    });

    
    var tbody = document.getElementById('asistentes-tbody');
    if (tbody) {
      tbody.addEventListener('input', function(e) {
        if (e.target && e.target.classList.contains('nombre-asist')) soloLetras(e);
        if (e.target && e.target.classList.contains('rut-asist')) formatRUT(e);
      });
      tbody.addEventListener('blur', function(e) {
        if (e.target && e.target.classList.contains('nombre-asist')) soloLetras(e);
        if (e.target && e.target.classList.contains('rut-asist')) { formatRUT(e); marcarRut(e.target); }
      }, true);
    }
  }

  // Las filas de firmantes se crean despues, desde fuera de este modulo;
  // este puente les presta el formateo de RUT y de nombres de aca adentro.
  window.firmBindCampos = function (rutEl, nombreEl) {
    if (rutEl) {
      ['input', 'blur'].forEach(function (ev) { rutEl.addEventListener(ev, formatRUT); });
      rutEl.addEventListener('blur', function () { marcarRut(rutEl); });
    }
    if (nombreEl) {
      ['input', 'blur'].forEach(function (ev) { nombreEl.addEventListener(ev, soloLetras); });
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initValidaciones);
// El rail se pinta una vez al abrir: si se restaura un borrador, ya trae datos.
document.addEventListener('DOMContentLoaded', railExpediente);
  } else {
    initValidaciones();
  }

})();

// Globos de ayuda. El CSS los deja en position:fixed; aqui se calculan las
// coordenadas para que no se salgan de la pantalla ni queden recortados por el
// scroll horizontal de la tabla del padron, que era lo que pasaba con la
// columna Correo.
(function() {
  var MARGEN = 12, SEPARACION = 10;
  var abierto = null;

  function colocarTip(tip) {
    var globo = tip._globo || tip.querySelector('.help-tip-content');
    if (!globo) return;
    // Las tarjetas tienen un transform de entrada, y un ancestro con transform
    // se convierte en el bloque contenedor de cualquier position:fixed interno:
    // el globo quedaba anclado a la tarjeta y se salia de la pantalla. Se
    // traslada al body mientras se muestra y despues vuelve a su lugar.
    if (globo.parentNode !== document.body) {
      tip._globo = globo;
      globo._casa = tip;
      document.body.appendChild(globo);
    }
    globo.classList.add('tip-visible');
    var icono = tip.getBoundingClientRect();
    var w = globo.offsetWidth, h = globo.offsetHeight;

    var x = icono.left + icono.width / 2 - w / 2;
    x = Math.max(MARGEN, Math.min(x, window.innerWidth - w - MARGEN));

    var cabeAbajo = window.innerHeight - icono.bottom > h + SEPARACION;
    var cabeArriba = icono.top > h + SEPARACION;
    var abajo = cabeAbajo || !cabeArriba;
    var y = abajo ? icono.bottom + SEPARACION : icono.top - h - SEPARACION;
    y = Math.max(MARGEN, Math.min(y, window.innerHeight - h - MARGEN));

    globo.style.left = Math.round(x) + 'px';
    globo.style.top = Math.round(y) + 'px';
    globo.classList.toggle('tip-abajo', abajo);
    globo.style.setProperty('--flecha', Math.round(icono.left + icono.width / 2 - x) + 'px');
    abierto = globo;
  }

  function cerrarTip() {
    if (!abierto) return;
    abierto.classList.remove('tip-visible');
    if (abierto._casa) abierto._casa.appendChild(abierto);
    abierto = null;
  }

  function esTip(el) {
    return el && el.closest ? el.closest('.help-tip') : null;
  }

  document.addEventListener('mouseover', function(e) {
    var tip = esTip(e.target);
    if (tip) colocarTip(tip);
  });
  document.addEventListener('mouseout', function(e) {
    var tip = esTip(e.target);
    if (tip && !esTip(e.relatedTarget)) cerrarTip();
  });
  document.addEventListener('focusin', function(e) {
    var tip = esTip(e.target);
    if (tip) colocarTip(tip); else cerrarTip();
  });
  document.addEventListener('focusout', function(e) {
    if (esTip(e.target)) cerrarTip();
  });
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') cerrarTip();
  });
  // si la pagina o la tabla se mueven, el globo quedaria flotando en el aire
  window.addEventListener('scroll', cerrarTip, true);
  window.addEventListener('resize', cerrarTip);
})();

function _renombrarOpcionesRegla(n) {
  var sel = document.getElementById('p' + n + '-regla');
  if (!sel) return;
  Array.from(sel.options).forEach(function(opt) {
    if (opt.value === 'abs_asistentes') opt.text = 'Asamblea Ordinaria';
    else if (opt.value === 'abs_derechos') opt.text = 'Asamblea Extraordinaria Absoluta';
    else if (opt.value === 'dos_tercios') opt.text = 'Asamblea Extraordinaria Reforzada';
  });
}
function addPuntoYRenombrar() {
  addPunto();
  _renombrarOpcionesRegla(puntoCount);
  actualizarEstadoVacioPuntos();
}


function actualizarEstadoVacioPuntos() {
  var empty = document.getElementById('puntos-empty-state');
  var container = document.getElementById('puntos-container');
  if (!empty || !container) return;
  var hayPuntos = container.querySelectorAll('.punto-card').length > 0;
  empty.style.display = hayPuntos ? 'none' : 'block';
}
window.onload = function() {
addPunto();
_renombrarOpcionesRegla(puntoCount);
_qwpsb();
actualizarEstadoVacioPuntos();
};
function abrirInstrucciones() {
  var m = document.getElementById('modal-instrucciones');
  if (m) m.style.display = 'flex';
}
function cerrarInstrucciones() {
  var m = document.getElementById('modal-instrucciones');
  if (m) m.style.display = 'none';
}


var STORAGE_KEY = 'sistema_actas_v2';
var _saveTimer = null;
var _saveIndicatorTimer = null;

// De quien es el borrador del equipo. El computador de la conserjeria es de
// todos: al cerrar sesion, cuenta.js deja elegir que el borrador se quede, y
// la cuenta que entra despues no puede encontrarselo ofrecido ni, menos,
// subirlo a su cuenta con el padron ajeno. Cada borrador lleva el uid de la
// cuenta que lo escribio y solo se ofrece a esa cuenta (ver _tryRestore).
// null mientras no se sepa quien entro: exigirSesion lo entrega al llamar
// de vuelta.
var _uidSesion = null;
// Hasta que _tryRestore decide que hacer con el borrador del equipo, el
// autoguardado no escribe. Lo primero que se teclea en esta pagina suele ser
// el correo y la clave en el cajon de entrada, y guardar en ese momento
// pisaba el borrador que se iba a ofrecer con un formulario en blanco.
var _borradorResuelto = false;
var _ID_ACTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------
//  La sesion de esta pestana (CN-001 de la revision del 30-09-2026)
// ---------------------------------------------------------------------
// La sesion de Supabase es una sola para todo el navegador. Si en otra
// pestana se cierra la sesion, o se cierra y entra otra cuenta, esta sigue
// mostrando el acta de quien la abrio, pero el cliente ya habla con el token
// nuevo. Antes, el guardado de esta pestana mandaba el UPDATE con la cuenta
// nueva, la base no le mostraba la fila (RLS), y la recuperacion de "fila
// perdida" insertaba el acta entera -padron, RUT, votos- como documento
// nuevo de la otra cuenta. Ahora:
//   1) antes de escribir -en la cuenta o en el equipo- se pregunta quien
//      tiene la sesion, y si no es quien abrio la pagina no se escribe;
//   2) la fila viaja atada a su dueno: el insert lleva dueno y el update y
//      la recuperacion filtran por dueno. Si la sesion cambia entre la
//      pregunta y el envio, la base lo rechaza (RLS: dueno = auth.uid());
//   3) al notar el cambio -aviso de supabase-js, cambio del almacenamiento
//      de otra pestana, volver a esta pestana, o una escritura-, la pestana
//      se bloquea: tapa el acta, para los temporizadores y no vuelve a
//      escribir nada, ni en la cuenta ni en el equipo. Lo que esta en
//      pantalla no se borra; se recarga solo si la persona lo pide. Lo que
//      quedo pendiente lo cubre cuenta.js al cerrar sesion (pregunta si se
//      conserva el borrador del equipo).
var _sesionAjena = false;

// Quien tiene ahora la sesion del navegador: { sabe, uid }. sabe es false
// si no se pudo averiguar (sin cuenta.js, o la sesion no se pudo leer o
// renovar por la red); en ese caso no se bloquea, pero tampoco se escribe
// en la cuenta.
function _sesionActual() {
  var c = window.Cuenta && Cuenta.cliente && Cuenta.cliente();
  if (!c || !c.auth || typeof c.auth.getSession !== 'function') return Promise.resolve({ sabe: false, uid: null });
  return Promise.resolve().then(function () { return c.auth.getSession(); }).then(function (r) {
    if (!r || r.error) return { sabe: false, uid: null };
    var s = r.data && r.data.session;
    return { sabe: true, uid: (s && s.user && s.user.id) || null };
  }, function () { return { sabe: false, uid: null }; });
}

// Pregunta y, si la sesion ya no es la de quien abrio la pagina, bloquea.
// Devuelve lo que contesto la sesion, con misma: true solo si se sabe y es
// la misma cuenta.
function _comprobarSesion() {
  return _sesionActual().then(function (s) {
    s.misma = !_sesionAjena && s.sabe && !!_uidSesion && s.uid === _uidSesion;
    if (s.sabe && _uidSesion && s.uid !== _uidSesion) _actaBloquear(s.uid ? 'otra' : 'cerrada');
    return s;
  });
}

function _actaBloquear(motivo) {
  if (_sesionAjena) return;
  _sesionAjena = true;
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (_guardarTimer) { clearTimeout(_guardarTimer); _guardarTimer = null; }
  if (typeof window.actaSalaDetener === 'function') { try { window.actaSalaDetener(); } catch (e) {} }
  try {
    var cuerpo = document.body;
    if (!cuerpo) return;
    // Lo de atras queda inerte: ni el teclado ni el lector de pantalla
    // llegan al acta tapada.
    Array.prototype.forEach.call(cuerpo.children || [], function (el) {
      try { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); } catch (e) {}
    });
    var capa = document.createElement('div');
    capa.id = 'acta-bloqueo';
    capa.setAttribute('role', 'alertdialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'acta-bloqueo-t');
    capa.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#F4F4F0;display:flex;' +
      'align-items:center;justify-content:center;padding:24px;';
    var caja = document.createElement('div');
    caja.style.cssText = 'max-width:520px;background:#fff;border:1px solid #D7D6CE;border-radius:12px;padding:28px;' +
      'font:16px/1.55 system-ui,sans-serif;color:#24282D;';
    var t = document.createElement('h2');
    t.id = 'acta-bloqueo-t';
    t.style.cssText = 'margin:0 0 10px;font-size:20px;';
    t.textContent = motivo === 'otra' ? 'En este navegador entró otra cuenta' : 'En este navegador se cerró la sesión';
    var p = document.createElement('p');
    p.style.cssText = 'margin:0 0 18px;';
    p.textContent = 'Esta pestaña era de la cuenta que abrió el acta. Para proteger sus datos, la tapamos y dejamos de ' +
      'guardar desde aquí: no se escribe nada en ninguna cuenta ni en este equipo. Lo último que se alcanzó a guardar ' +
      'sigue en la cuenta que la abrió.';
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-primary';
    b.textContent = 'Recargar la página';
    b.addEventListener('click', function () { try { location.reload(); } catch (e) {} });
    caja.appendChild(t); caja.appendChild(p); caja.appendChild(b);
    capa.appendChild(caja);
    cuerpo.appendChild(capa);
    try { b.focus(); } catch (e) {}
  } catch (e) { /* sin documento no hay nada que tapar */ }
}

// Se vigila desde que se sabe quien entro (el portero). Tres avisos, porque
// ninguno basta solo: supabase-js avisa los cambios de otras pestanas por
// BroadcastChannel, el evento storage llega aunque ese canal no exista, y
// al volver a la pestana se pregunta de nuevo por si la pestana durmio.
var _vigilando = false;
function _vigilarSesion() {
  if (_vigilando || !_uidSesion) return;
  _vigilando = true;
  var revisar = function () { if (!_sesionAjena) _comprobarSesion(); };
  try {
    var c = window.Cuenta && Cuenta.cliente && Cuenta.cliente();
    if (c && c.auth && typeof c.auth.onAuthStateChange === 'function') {
      c.auth.onAuthStateChange(function (evento, sesion) {
        if (_sesionAjena) return;
        var uid = (sesion && sesion.user && sesion.user.id) || null;
        // Lo que dice el aviso ya basta para bloquear; dentro del aviso no
        // se llama a supabase-js (se podria trabar), por eso no se pregunta.
        if (uid !== _uidSesion) setTimeout(function () { _actaBloquear(uid ? 'otra' : 'cerrada'); }, 0);
      });
    }
  } catch (e) {}
  window.addEventListener('storage', function (e) {
    if (!e || e.key === null || /^sb-.*-auth-token$/.test(String(e.key))) setTimeout(revisar, 0);
  });
  window.addEventListener('focus', revisar);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') revisar();
  });
}

// Los campos de cuenta.js (el cajon de entrada, el panel de pago: cta-correo,
// cta-clave, cta-codigo) viven en esta misma pagina y tienen id. Sin esta
// exclusion la clave que se tecleaba al entrar quedaba en el borrador del
// equipo y, con el, en la fila del acta en la cuenta.
function _campoDelActa(el) {
  if (!el || !el.id || /^cta-/.test(el.id)) return false;
  return String(el.type || '').toLowerCase() !== 'password';
}

function _captureFieldsSnapshot() {
  var snap = { fields: {}, asistentes: [], puntos: [] };
  var isDyn = function(id) {
    return /^asist-\d+-/.test(id) || /^p\d+-/.test(id) || /^pvot-/.test(id) || /^firm-\d+-/.test(id);
  };

  document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(el) {
    if (!el.id || isDyn(el.id) || !_campoDelActa(el)) return;
    snap.fields[el.id] = el.value;
  });
  
  var modAct = document.querySelector('#step-1 .toggle-btn.active');
  if (modAct) snap.modalidad = modAct.textContent.trim();

  if (typeof firmSnapshot === 'function') snap.firmantes = firmSnapshot();
  
  document.querySelectorAll('#asistentes-tbody tr').forEach(function(row) {
    var g = function(sel) { var e = row.querySelector(sel); return e ? e.value : ''; };
    // El correo va con la fila. isDyn() deja fuera de snap.fields todo lo
    // que empieza con asist-N-, y el correo no estaba en esta lista: se
    // perdia en cada guardado, y con el la constancia del voto por correo,
    // que es lo que vuelve ruidosa una suplantacion en la sala.
    snap.asistentes.push({
      unidad: g('.unidad'), nombre: g('.nombre-asist'), rut: g('.rut-asist'), derechos: g('.derechos'),
      habil: g('.habil'), asiste: g('.asiste'), rep: g('.representante'), correo: g('.correo-asist')
    });
  });

  document.querySelectorAll('.punto-card').forEach(function(card) {
    var m = (card.id || '').match(/^punto-(\d+)$/);
    var n = m ? m[1] : null;
    var byId = function(suf) { var e = n && document.getElementById('p' + n + '-' + suf); return e ? e.value : ''; };
    var votos = Object.create(null);
    if (n) {
      var tbody = document.getElementById('pvot-rows-' + n);
      if (tbody) tbody.querySelectorAll('tr').forEach(function(r) {
        var sel = r.querySelector('.pref-select');
        if (r.dataset.key && sel) votos[r.dataset.key] = sel.value;
      });
    }
    snap.puntos.push({
      titulo: byId('titulo'), presentacion: byId('presentacion'), debate: byId('debate'),
      requiere: byId('requiere') || 'si', regla: byId('regla'),
      responsable: byId('responsable'), plazo: byId('plazo'), votos: votos
    });
  });
  return snap;
}

function autoSave() {
  if (!_borradorResuelto || _sesionAjena) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    _saveTimer = null;
    var escribir = function () {
      if (_sesionAjena) return;
      try {
        railExpediente();
        _escribirBorrador();
        _showSaveIndicator();
        actaSincronizar();
      } catch (e) {
        console.warn('No se pudo auto-guardar:', e);
      }
    };
    // CN-001: con cuenta, el borrador del equipo se escribe solo si la sesion
    // sigue siendo la de quien abrio la pagina. Si cambio, el equipo puede
    // tener ya el borrador de la otra cuenta, y no se pisa. Si no se pudo
    // saber (la red no deja renovar la sesion), el borrador si se escribe:
    // es justo cuando hace falta, y la subida a la cuenta igual no sale.
    if (_uidSesion && window.Cuenta && Cuenta.cliente && Cuenta.cliente()) {
      _comprobarSesion().then(function (s) { if (s.misma || !s.sabe) escribir(); });
    } else {
      escribir();
    }
  }, 600);
}

// El borrador del equipo, entero, con lo que hay en pantalla y de quien es.
function _escribirBorrador() {
  var snap = _captureFieldsSnapshot();
  snap.savedAt = new Date().toISOString();
  snap.uid = _uidSesion;
  // Junto al borrador va el identificador de la fila que le corresponde
  // en la cuenta. Sin esto, al recargar y restaurar, el acta se guardaba
  // como una fila nueva y quedaban duplicados.
  snap.actaId = _actaId;
  snap.actaFolio = _actaFolio;
  // El cuerpo sellado viaja con el folio: sin el, la copia que se baje
  // despues de recargar ya no seria la que se registro.
  snap.sello = _sello;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
}

function _showSaveIndicator() {
  var el = document.getElementById('save-indicator');
  if (!el) return;
  el.classList.add('show');
  if (_saveIndicatorTimer) clearTimeout(_saveIndicatorTimer);
  _saveIndicatorTimer = setTimeout(function() { el.classList.remove('show'); }, 1800);
}

function _restoreSnapshot(snap) {
  // Un acta cuyo contenido ya se purgo no trae nada que reponer, y
  // reponerlo dejaria el formulario en blanco como si fuera suya.
  if (!snap || _contenidoPurgado(snap)) return false;
  try {
    var asis = snap.asistentes || [];
    var pts  = snap.puntos || [];

    
    var needRows = Math.max(asis.length, 1);
    var curRows = document.querySelectorAll('#asistentes-tbody tr').length;
    while (curRows < needRows) { addRow(); curRows++; }
    var rows = document.querySelectorAll('#asistentes-tbody tr');
    asis.forEach(function(a, i) {
      var row = rows[i]; if (!row) return;
      var set = function(sel, v) { var e = row.querySelector(sel); if (e) e.value = (v != null ? v : ''); };
      set('.unidad', a.unidad); set('.nombre-asist', a.nombre); set('.rut-asist', a.rut); set('.derechos', a.derechos);
      set('.habil', a.habil || 'si'); set('.asiste', a.asiste || 'si'); set('.representante', a.rep);
      set('.correo-asist', a.correo);
    });

    
    var f = snap.fields || {};
    Object.keys(f).forEach(function(id) {
      // Un borrador de antes puede traer los campos del cajon de entrada
      // (ver _campoDelActa): esos no se reponen.
      if (/^cta-/.test(id)) return;
      var el = document.getElementById(id);
      if (el) el.value = f[id];
    });

    if (typeof firmRestaurar === 'function') firmRestaurar(snap);

    
    if (snap.modalidad) {
      document.querySelectorAll('#step-1 .toggle-btn').forEach(function(b) {
        if (b.textContent.trim() === snap.modalidad) {
          var t = b.textContent.toLowerCase();
          var val = (t.indexOf('telem') >= 0) ? 'telemática' : ((t.indexOf('mixta') >= 0) ? 'mixta' : 'presencial');
          if (typeof setModalidad === 'function') setModalidad(b, val);
        }
      });
    }

    
    if (typeof updateTipoAsambleaExtended === 'function') updateTipoAsambleaExtended();
    if (typeof calcularQuorum === 'function') calcularQuorum();

    
    var curP = document.querySelectorAll('.punto-card').length;
    while (curP < pts.length) { addPuntoYRenombrar(); curP++; }
    var cards = document.querySelectorAll('.punto-card');
    pts.forEach(function(p, i) {
      var card = cards[i]; if (!card) return;
      var m = (card.id || '').match(/^punto-(\d+)$/); if (!m) return;
      var n = m[1];
      var setId = function(suf, v) { var e = document.getElementById('p' + n + '-' + suf); if (e) e.value = (v != null ? v : ''); };
      setId('titulo', p.titulo); setId('presentacion', p.presentacion); setId('debate', p.debate);
      setId('regla', p.regla); setId('responsable', p.responsable); setId('plazo', p.plazo);
      if (typeof setRequiereAcuerdo === 'function') setRequiereAcuerdo(n, (p.requiere || 'si') === 'si');
      if (typeof _qpese === 'function') _qpese(n);
      var tbody = document.getElementById('pvot-rows-' + n);
      if (tbody && p.votos) {
        tbody.querySelectorAll('tr').forEach(function(r) {
          var sel = r.querySelector('.pref-select');
          // Solo las claves propias: la clave es unidad|nombre del padron.
          if (sel && Object.prototype.hasOwnProperty.call(p.votos, r.dataset.key)) {
            sel.value = p.votos[r.dataset.key];
            sel.className = 'pref-select ' + sel.value;
          }
        });
      }
      if (typeof _jfg === 'function') _jfg(n);
      if (typeof _vufa === 'function') _vufa(n);
    });

    if (typeof actualizarEstadoVacioPuntos === 'function') actualizarEstadoVacioPuntos();
    return true;
  } catch (e) {
    console.warn('Error al restaurar:', e);
    return false;
  }
}

// El borrador del equipo se ofrece solo a quien lo escribio, y lo que trae
// del servidor -la fila y el folio- se le pregunta al servidor antes de
// creerlo.
//
//  - Con uid de otra cuenta: no se ofrece, no se sube y no se toca. Sigue
//    siendo de su dueno, que lo recupera al volver a entrar en este equipo,
//    a menos que esta cuenta escriba aqui primero y el autoguardado lo
//    reemplace (cuenta.js ya le advirtio que lo dejaba a la vista).
//  - Sin uid (lo escribio la version anterior): con sesion, se ofrece solo si
//    trae el id de una fila que el servidor le muestra a esta cuenta -las
//    politicas de actas_guardadas solo dejan ver las propias-, que es la
//    unica prueba de que es suyo. Si no la trae, o la fila no aparece, se
//    descarta: ninguna cuenta puede demostrar que es suyo, y dejarlo solo
//    mantendria el padron de alguien a la vista en un equipo compartido.
//    Sin cuenta.js no hay sesion ni servidor y se ofrece como antes: nada
//    sale del equipo (actaSincronizar exige la cuenta).
//  - El folio nunca sale del borrador. Un borrador heredado de la
//    demostracion antigua trae "AV-2026-00000N", con la forma de uno real,
//    y se mostraba como acta emitida. Vale el folio que la base tiene para
//    esa fila; sin respuesta del servidor, el acta se retoma sin folio, y si
//    lo tenia, actaSincronizar lo adopta en cuanto la base rechaza el
//    guardado (C6).
function _tryRestore() {
  var snap = null;
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    snap = raw ? JSON.parse(raw) : null;
  } catch (e) { snap = null; }
  if (!snap || typeof snap !== 'object' || !snap.savedAt) { _borradorResuelto = true; return; }
  // Quien llega con ?acta= desde el panel eligio esa acta, y
  // actaCargarGuardada ya la esta trayendo del servidor. Ofrecer ademas el
  // borrador del equipo mezclaba las dos: _restoreSnapshot no quita filas, y
  // el padron de una quedaba pegado a la otra y se guardaba en su fila. El
  // borrador no se ofrece; actaCargarGuardada lo reemplaza por el acta
  // abierta si es de esta cuenta.
  if (/[?&]acta=[0-9a-f-]{36}/i.test(String(location.search || ''))) { _borradorResuelto = true; return; }

  var descartar = function () {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    _borradorResuelto = true;
  };
  var ofrecer = function (id, folio, sello) {
    var when = new Date(snap.savedAt).toLocaleString('es-CL');
    if (!confirm('Encontramos datos de su última sesión (' + when + ').\n\n¿Desea restaurarlos para continuar donde quedó?')) {
      // Empieza de cero. El acta anterior queda en su cuenta, intacta.
      descartar();
      return;
    }
    try {
      _restoreSnapshot(snap);
      railExpediente();
    } catch (e) { console.warn('Restore error:', e); }
    // Se retoma la MISMA acta, no una copia: la fila que el servidor
    // confirmo para el id que traia el borrador.
    _actaId = id;
    _actaFolio = folio;
    _sello = sello;
    _borradorResuelto = true;
    if (_actaFolio) {
      _nubeEstado('Acta ' + _actaFolio + ', ya finalizada. Los cambios en el formulario ya no modifican el documento emitido.', 'ok');
      // La llave se borro al finalizar (SB-01): sin esto, quien recarga
      // para bajar otra vez su acta quedaba frente a la puerta de pago.
      abrirAsistente();
    } else if (_actaId) {
      _nubeEstado('Retomando el acta guardada en su cuenta.', 'ok');
    }
    // Reescribe el borrador con el uid de esta cuenta y lo confirmado, y
    // vuelve a guardar sobre esa fila (autoSave llama a actaSincronizar).
    autoSave();
  };

  var c = window.Cuenta && Cuenta.cliente && Cuenta.cliente();
  if (!c) {
    if (snap.uid) { _borradorResuelto = true; return; }
    ofrecer(null, null, null);
    return;
  }
  // Con cuenta.js pero sin saber quien entro (una pagina sin portero) no se
  // ofrece nada: no hay a quien atribuirselo. El borrador se deja como esta.
  if (!_uidSesion || (snap.uid && snap.uid !== _uidSesion)) { _borradorResuelto = true; return; }

  var id = (typeof snap.actaId === 'string' && _ID_ACTA.test(snap.actaId)) ? snap.actaId : null;
  if (!id) {
    if (snap.uid) ofrecer(null, null, null); else descartar();
    return;
  }
  var sinRespuesta = function () {
    // Sin uid no hay otra prueba: no se ofrece, y tampoco se borra por una
    // falla de la red.
    if (!snap.uid) { _borradorResuelto = true; return; }
    ofrecer(id, null, null);
  };
  Promise.resolve(c.from('actas_guardadas').select('id,folio').eq('id', id)).then(function (r) {
    if (!r || r.error) { sinRespuesta(); return; }
    var fila = r.data && r.data[0];
    if (!fila) {
      // La fila ya no esta: la borraron desde el panel, o nunca fue de esta
      // cuenta. Con uid es de esta cuenta y se retoma como acta nueva.
      if (snap.uid) ofrecer(null, null, null); else descartar();
      return;
    }
    var folio = fila.folio || null;
    // El sello local solo se usa para el folio que la base confirma, y con
    // la huella recalculada sobre su cuerpo, igual que el de la cuenta.
    var s = snap.sello;
    var propio = folio && s && typeof s === 'object' && (!s.folio || s.folio === folio) ? s : null;
    if (folio && !propio) {
      // El borrador de este equipo no trae el sello de ese folio (se
      // finalizo en otro equipo, o antes de que el borrador lo guardara).
      // El que vale es el que se subio a la cuenta al finalizar: sin el,
      // la copia saldria como regenerada aunque el cuerpo sellado exista.
      return Promise.resolve(c.from('actas_guardadas').select('contenido').eq('id', fila.id)).then(function (q) {
        var cont = q && !q.error && q.data && q.data[0] && q.data[0].contenido;
        return _selloDesdeLaCuenta(cont && cont.sello, folio);
      }, function () { return null; }).then(function (sello) { ofrecer(fila.id, folio, sello); });
    }
    return _selloDesdeLaCuenta(propio, folio).then(function (sello) { ofrecer(fila.id, folio, sello); });
  }, sinRespuesta).then(null, function (e) {
    // Pase lo que pase aqui, el autoguardado no puede quedar detenido.
    console.warn('Restore error:', e);
    _borradorResuelto = true;
  });
}

function limpiarFormulario() {
  if (!confirm('¿Está seguro de borrar todos los datos y reiniciar el formulario?\n\nNo podremos recuperar la información después.')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  location.reload();
}


function guardarBorrador() {
  try {
    var snap = _captureFieldsSnapshot();
    snap.savedAt = new Date().toISOString();
    snap.app = 'sistema-actas-copropiedad';
    snap.formatoBorrador = 1;
    var nombre = (document.getElementById('condo-nombre') || {}).value || '';
    nombre = nombre.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ ]/g, '').trim().replace(/ +/g, '_') || 'condominio';
    var fecha = new Date().toISOString().slice(0, 10);
    var blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'borrador_acta_' + nombre + '_' + fecha + '.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function() { URL.revokeObjectURL(url); }, 3000);
    alert('✓ Borrador guardado en su carpeta de Descargas.\n\nPara continuar después (en este u otro computador), abra la herramienta y use "Cargar borrador".');
  } catch (e) {
    alert('No pudimos guardar el borrador. Intente nuevamente.\n\nDetalle técnico: ' + e.message);
  }
}

function cargarBorrador() {
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = function() {
    var file = input.files && input.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function() {
      try {
        var snap = JSON.parse(reader.result);
        if (!snap || snap.app !== 'sistema-actas-copropiedad' || !snap.fields) {
          alert('El archivo seleccionado no parece ser un borrador de esta herramienta.\n\nBusque un archivo con nombre similar a "borrador_acta_…json".');
          return;
        }
        var when = snap.savedAt ? new Date(snap.savedAt).toLocaleString('es-CL') : 'fecha desconocida';
        if (!confirm('¿Cargar el borrador guardado el ' + when + '?\n\nSe reemplazará la información actual del formulario.')) return;
        _restoreSnapshot(snap);
        if (typeof autoSave === 'function') autoSave();
      } catch (e) {
        alert('No pudimos leer el borrador. Revise que sea el archivo .json correcto.\n\nDetalle técnico: ' + e.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };
  input.click();
}


function cargarDatosEjemplo() {
  if (!confirm('¿Cargar datos de ejemplo en el formulario?\n\nSe reemplazará la información que haya ingresado.')) return;

  
  var f = function(id, v) { var e = document.getElementById(id); if (e) e.value = v; };
  f('acta-numero', '12');
  f('condo-nombre', 'Condominio Las Araucarias');
  f('condo-direccion', 'Av. Los Aromos 1234, Santiago');
  f('condo-rut', '76.523.811-0');
  f('tipo-asamblea', 'ordinaria');
  
  if (typeof updateTipoAsambleaExtended === 'function') updateTipoAsambleaExtended();

  
  document.querySelectorAll('#step-1 .toggle-btn').forEach(function(b){ b.classList.remove('active'); });
  var pres = Array.from(document.querySelectorAll('#step-1 .toggle-btn')).find(function(b){
    return b.textContent.toLowerCase().indexOf('presencial') >= 0;
  });
  if (pres) pres.classList.add('active');
  f('modalidad', 'presencial');

  
  var fecha = new Date(); fecha.setDate(fecha.getDate() + 7);
  var iso = fecha.toISOString().slice(0,10);
  f('fecha-sesion', iso);
  f('hora-inicio', '19:00');
  f('lugar', 'Sala de reuniones del condominio (1er piso)');

  
  var hoy = new Date().toISOString().slice(0,10);
  f('quien-convoco', 'administrador');
  f('nombre-convocante', 'Patricia Soto López');
  f('fecha-citacion', hoy);
  if (typeof checkPlazo === 'function') checkPlazo();
  f('nombre-presidente', 'María González Pérez');
  f('nombre-admin', 'Patricia Soto López');

  
  var ejAsist = [
    { unidad:'101', nombre:'María González Pérez',  rut:'12.345.678-5', derechos:'5.25', habil:'si', asiste:'si', rep:'' },
    { unidad:'102', nombre:'Juan Sepúlveda Rojas',  rut:'11.222.333-9', derechos:'4.80', habil:'si', asiste:'si', rep:'' },
    { unidad:'201', nombre:'Ana Castro Muñoz',      rut:'15.678.901-1', derechos:'5.10', habil:'no', asiste:'si', rep:'' },
    { unidad:'202', nombre:'Carlos Vega Soto',      rut:'9.876.543-3', derechos:'4.75', habil:'si', asiste:'no', rep:'' },
    { unidad:'301', nombre:'Patricia Soto López',   rut:'8.765.432-K', derechos:'5.40', habil:'si', asiste:'si', rep:'Pedro Soto (poder simple)' },
    { unidad:'302', nombre:'Rodrigo Fernández Tapia',  rut:'10.111.222-5', derechos:'4.95', habil:'si', asiste:'si', rep:'' }
  ];
  
  var current = document.querySelectorAll('#asistentes-tbody tr').length;
  while (current < ejAsist.length) { addRow(); current++; }
  
  ejAsist.forEach(function(a, i) {
    f('asist-'+i+'-unidad',   a.unidad);
    f('asist-'+i+'-nombre',   a.nombre);
    f('asist-'+i+'-rut',      a.rut);
    f('asist-'+i+'-derechos', a.derechos);
    f('asist-'+i+'-habil',    a.habil);
    f('asist-'+i+'-asiste',   a.asiste);
    f('asist-'+i+'-rep',      a.rep);
  });
  if (typeof calcularQuorum === 'function') calcularQuorum();
  if (typeof actualizarVotacion === 'function') actualizarVotacion();

  
  if (typeof firmRestaurar === 'function') firmRestaurar({ firmantes: { alternativa: 'comite', lista: [
    { nombre: 'María González Pérez', rut: '12.345.678-5', cargo: 'Presidente del Comité de Administración' },
    { nombre: 'Juan Sepúlveda Rojas', rut: '11.222.333-9', cargo: 'Miembro del Comité de Administración' }
  ] } });

  
  if (typeof autoSave === 'function') autoSave();

  
  alert('✓ Listo. Cargamos datos de ejemplo en los Pasos 1, 2, 3 y 5.\n\nLos puntos del orden del día (Paso 4) se agregan manualmente para mostrar cómo funciona la votación.');
}


document.addEventListener('input', function(e) {
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) {
    autoSave();
  }
});
document.addEventListener('change', function(e) {
  var t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) {
    autoSave();
  }
});


// Lo que necesita la sesion y corre en otro modulo (la vuelta de la pasarela
// en acta-2.js) espera aqui a que el portero deje pasar. Antes pedirla por
// su cuenta no servia: cuenta.js ignoraba el segundo pedido mientras el
// primero estaba abierto y a quien llegaba tarde nadie lo llamaba de vuelta.
// Desde el 22-09-2026 cuenta.js encola los pedidos, pero se mantiene un solo
// punto de entrada: asi la pagina sabe siempre quien entro antes de guardar.
var _porteroPaso = false;
var _esperanPortero = [];
function actaTrasElPortero(fn) {
  if (typeof fn !== 'function') return;
  if (_porteroPaso) { fn(); return; }
  _esperanPortero.push(fn);
}

window.addEventListener('load', function() {
  // Nada de esto ocurre sin sesion: exigirSesion abre el cajon sin salida y
  // solo llama de vuelta cuando la persona entro.
  if (window.Cuenta && Cuenta.exigirSesion) {
    // De vuelta de la pasarela, lo que importa es entrar con la cuenta que
    // pago: solo a ella le entrega el Worker la llave (C1).
    var vuelveDePagar = /[?&]pago=AV-[A-Z0-9]+/.test(String(location.search || ''));
    Cuenta.exigirSesion(vuelveDePagar ? {
      titulo: 'Entre con la cuenta con la que pagó',
      sub: 'El pago queda asociado a esa cuenta, y solo ella puede recuperarlo.'
    } : {
      titulo: 'Entre para armar su acta',
      sub: 'Con su cuenta guardamos su avance, le enviamos el comprobante y puede volver a sus asambleas.'
    }, function (u) {
      // Quien entro: el borrador del equipo se ofrece solo si es suyo.
      _uidSesion = (u && u.id) || null;
      _porteroPaso = true;
      _vigilarSesion();
      var esperan = _esperanPortero;
      _esperanPortero = [];
      esperan.forEach(function (fn) {
        // Un error en quien espera no deja sin turno al siguiente, ni a lo
        // que sigue aqui.
        try { fn(); } catch (e) { console.warn('Tras el portero:', e); }
      });
      setTimeout(_tryRestore, 350);
      actaIniciarGuardado();
      if (window.track) window.track('acta_abierta');
    });
  } else {
    setTimeout(_tryRestore, 350);
    if (window.track) window.track('acta_abierta');
  }
});


// ---------------------------------------------------------------------
//  Guardar el acta en la cuenta
//  Opcional y apagado por omision: mientras nadie lo encienda, el acta no
//  sale del navegador, que es lo que promete el resto del sitio.
// ---------------------------------------------------------------------
var _actaId = null;
var _actaFolio = null;
var _guardarTimer = null;
// Lo que se sello al finalizar: { folio, codigo, huella, cuerpo }. Es la
// unica fuente del documento de un acta con folio (ver generateActa).
var _sello = null;
// Lo ultimo que armo generateActa, en cadenas: { cuerpo, pie }.
var _actaGenerada = null;

// El acta se guarda siempre: es el producto y es lo que permite exigir el
// pago en el servidor en vez de con un candado de navegador.
function _nubeEncendida() { return true; }

function _actaPagada() { return !!_actaFolio; }

function _nubeEstado(txt, clase) {
  var el = document.getElementById('guardar-estado');
  if (!el) return;
  el.textContent = txt || '';
  el.className = 'guardar-estado' + (txt ? ' ver ' + (clase || '') : '');
}

// Deja el identificador de la fila dentro del borrador local, en cuanto se
// conoce. Si se esperara al próximo autoguardado, una recarga en medio dejaría
// el borrador sin id y al restaurarlo nacería un acta duplicada.
function _recordarIdEnBorrador() {
  if (_sesionAjena) return;
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var snap = JSON.parse(raw);
    if (!snap) return;
    // El borrador de otra cuenta, o uno que nadie reclamo todavia, no se
    // toca: anotarle el id de esta acta lo ataria a una fila ajena.
    if ((snap.uid || null) !== (_uidSesion || null)) return;
    // Tampoco el de otra acta de esta misma cuenta: con el id de esta, al
    // recargar se ofreceria su contenido y se guardaria encima de esta fila.
    if (snap.actaId && snap.actaId !== _actaId) return;
    snap.actaId = _actaId;
    snap.actaFolio = _actaFolio;
    snap.sello = _sello;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch (e) { /* sin borrador local no hay nada que anotar */ }
}

// C5: la tarea diaria de conservacion reemplaza el contenido de un acta
// finalizada hace mas de 180 dias por {"purgado": true, ...}. La fila y su
// registro de verificacion quedan; lo escrito, no.
function _contenidoPurgado(c) {
  return !!(c && typeof c === 'object' && c.purgado === true);
}
var AVISO_PURGADA = 'El contenido de esta acta se eliminó al cumplirse el plazo de conservación; conserve el archivo que descargó.';

// ¿Hay algo escrito? Los campos vienen todos, llenos o vacíos, así que se
// miran los que de verdad indican trabajo empezado.
function _actaEnBlanco(snap) {
  var f = (snap && snap.fields) || {};
  var conTexto = Object.keys(f).some(function (k) {
    return String(f[k] || '').trim() !== '';
  });
  if (conTexto) return false;
  var hayAsistentes = (snap.asistentes || []).some(function (a) {
    return String(a.nombre || '').trim() !== '' || String(a.rut || '').trim() !== '';
  });
  if (hayAsistentes) return false;
  return !(snap.puntos || []).some(function (p) {
    return String(p.titulo || '').trim() !== '';
  });
}

function actaSincronizar() {
  if (!_nubeEncendida()) return;
  // C6: un acta con folio ya no se escribe. La base lo rechaza igual (la
  // politica de UPDATE exige folio IS NULL), pero intentarlo cada vez que
  // alguien toca el formulario solo produce avisos de error sin sentido:
  // lo emitido es lo que se sello.
  if (_actaFolio || _sesionAjena) return;
  if (!window.Cuenta || !Cuenta.cliente()) return;
  if (_guardarTimer) clearTimeout(_guardarTimer);
  _guardarTimer = setTimeout(function () {
    _guardarTimer = null;
    if (_actaFolio || _sesionAjena) return;
    // CN-001: sin saber quien abrio la pagina no se escribe en ninguna cuenta.
    var dueno = _uidSesion;
    if (!dueno) return;
    var snap;
    try { snap = _captureFieldsSnapshot(); } catch (e) { return; }
    snap.savedAt = new Date().toISOString();
    var fila = {
      titulo: (_pvau('condo-nombre') || '').slice(0, 200),
      fecha_sesion: _pvau('fecha-sesion') || null,
      contenido: snap
    };
    // Un acta en blanco no se guarda: si no hay nada escrito todavía, no
    // tiene sentido ocupar una de las 100 filas de la cuenta.
    if (!_actaId && _actaEnBlanco(snap)) return;
    var id = _actaId;

    _comprobarSesion().then(function (s) {
      if (!s.misma) {
        if (!s.sabe && !_sesionAjena) _nubeEstado('No pudimos comprobar su sesión. Su acta sigue a salvo en este equipo.', 'err');
        return;
      }
      var c = Cuenta.cliente();
      // La fila viaja atada a su dueno: si la sesion cambio despues de la
      // pregunta, el insert lo rechaza la base (dueno = auth.uid()) y el
      // update no encuentra la fila.
      var p = id
        ? c.from('actas_guardadas').update(fila).eq('id', id).eq('dueno', dueno).select('id')
        : c.from('actas_guardadas').insert({ dueno: dueno, titulo: fila.titulo, fecha_sesion: fila.fecha_sesion,
            contenido: fila.contenido }).select('id');
      return Promise.resolve(p).then(function (r) { _alGuardar(c, r, id, dueno); },
        function () { if (!_sesionAjena) _nubeEstado('No pudimos guardar en su cuenta. Su acta sigue a salvo en este equipo.', 'err'); });
    });
  }, 1200);
}

// Lo que contesto la base a un guardado. Si en el camino la pestana se
// bloqueo, la respuesta se descarta: no se anota id, ni borrador, ni aviso.
function _alGuardar(c, r, id, dueno) {
  if (_sesionAjena) return;
  var yaCerrada = r.error && /acta_finalizada|ya_finalizada|finalizada/i.test(String(r.error.message || ''));
  if (r.error && !yaCerrada) {
    var m = String(r.error.message || '');
    // Un rechazo por RLS es lo que pasa si la sesion cambio entre la
    // pregunta y el envio: se pregunta de nuevo, y eso bloquea.
    if (/row-level security|42501|permission denied/i.test(m)) _comprobarSesion();
    if (_sesionAjena) return;
    _nubeEstado(/relation|does not exist|schema cache/i.test(m)
      ? 'El guardado en la cuenta todavía no está habilitado. Su acta sigue a salvo en este equipo.'
      : /tope_de_actas/.test(m)
        ? 'Llegó al máximo de 100 actas guardadas. Borre alguna desde su panel.'
        : 'No pudimos guardar en su cuenta. Su acta sigue a salvo en este equipo.', 'err');
    return;
  }
  // Un update que no tocó ninguna fila tiene dos lecturas. Si el acta ya
  // no está -la borraron desde el panel- se vuelve a crear en vez de
  // perder lo escrito. Pero si se finalizo en otra pestaña u otro
  // equipo, la base la protege (C6) y crear otra seria duplicar un acta
  // con folio: se pregunta antes cual de las dos es.
  // CN-001: "no la veo" tambien es lo que contesta la base cuando la
  // sesion ya es de otra cuenta. Por eso se pregunta por la fila de este
  // dueno, y antes de volver a crearla se pregunta otra vez quien tiene
  // la sesion: una fila invisible por RLS no se convierte en un acta
  // nueva de otra cuenta.
  if (id && ((r.data && r.data.length === 0) || yaCerrada)) {
    var perdida = id;
    var noSeGuardo = function () {
      if (!_sesionAjena) _nubeEstado('No pudimos guardar en su cuenta. Su acta sigue a salvo en este equipo.', 'err');
    };
    Promise.resolve(c.from('actas_guardadas').select('id,folio').eq('id', perdida).eq('dueno', dueno)).then(function (q) {
      if (_sesionAjena || perdida !== _actaId) return;
      if (!q || q.error) { noSeGuardo(); return; }
      var fila = q.data && q.data[0];
      if (fila && fila.folio) {
        // Sin ruido: no es un error, es un acta cerrada.
        _actaFolio = fila.folio;
        _nubeEstado('Acta ' + fila.folio + ', ya finalizada: los cambios de este formulario ya no se guardan en su cuenta.', 'ok');
        return;
      }
      if (fila) { noSeGuardo(); return; }
      return _comprobarSesion().then(function (s) {
        if (!s.misma || perdida !== _actaId) { noSeGuardo(); return; }
        _actaId = null;
        _actaFolio = null;
        actaSincronizar();
      });
    }, noSeGuardo);
    return;
  }
  if (r.data && r.data[0]) { _actaId = r.data[0].id; _recordarIdEnBorrador(); }
  _nubeEstado('Guardada en su cuenta a las ' +
    new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) + '.', 'ok');
}

function actaCargarGuardada(id) {
  if (!window.Cuenta || !Cuenta.cliente()) return;
  Cuenta.cliente().from('actas_guardadas').select('id,contenido,folio,pagada').eq('id', id).single()
    .then(function (r) {
      if (r.error || !r.data) return;
      var contenido = r.data.contenido;
      if (_contenidoPurgado(contenido)) {
        // C5: no hay nada que abrir. No se ata la pagina a esa fila: lo que
        // se escriba desde aqui es un acta nueva, no una edicion de la que
        // ya se emitio.
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        _nubeEstado(AVISO_PURGADA, 'err');
        alert(AVISO_PURGADA);
        return;
      }
      _actaId = r.data.id;
      _actaFolio = r.data.folio || null;
      _sello = null;
      try { _restoreSnapshot(contenido); } catch (e) {}
      // El sello que se subio justo antes de finalizar trae el cuerpo y su
      // huella; el folio lo pone la fila. Se recalcula la huella antes de
      // creerle: un cuerpo que no calza no se imprime como verificable.
      _selloDesdeLaCuenta(contenido && contenido.sello, _actaFolio).then(function (s) {
        if (r.data.id !== _actaId || _sesionAjena) return;
        _sello = s;
        // El borrador del equipo pasa a ser esta acta, entera: anotarle solo
        // el id ataba a esta fila el contenido de otra que hubiera quedado en
        // el equipo. El de otra cuenta no se toca (ver _tryRestore).
        var previo = null;
        try { previo = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { previo = null; }
        if (!previo || !previo.uid || previo.uid === _uidSesion) {
          try { _escribirBorrador(); } catch (e) { /* sin almacenamiento, sin borrador */ }
        }
        _recordarIdEnBorrador();
        _nubeEstado(_actaFolio
          ? 'Acta ' + _actaFolio + ', ya finalizada. Los cambios en el formulario ya no modifican el documento emitido.'
          : 'Abierta desde su cuenta.', 'ok');
        // Quien vuelve por un acta ya emitida -para bajarla otra vez- no
        // tiene por que pagar de nuevo: el folio ya lo acredita la base.
        if (_actaFolio) abrirAsistente();
        if (typeof generateActa === 'function') generateActa();
      });
    });
}

// ---------------------------------------------------------------------
//  El sello: huella, codigo y resumen del acta que se finaliza (C2)
// ---------------------------------------------------------------------
// SHA-256 en hexadecimal minuscula de los bytes UTF-8 del texto.
function _huellaDe(texto) {
  var c = (typeof crypto !== 'undefined') ? crypto : null;
  if (!c || !c.subtle || typeof TextEncoder === 'undefined') {
    return Promise.reject(new Error('sin_criptografia'));
  }
  return Promise.resolve(c.subtle.digest('SHA-256', new TextEncoder().encode(String(texto)))).then(function (buf) {
    var b = new Uint8Array(buf), h = '';
    for (var i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
    return h;
  });
}

// Los 12 primeros caracteres de la huella, en mayuscula y de a cuatro:
// "ABCD-EF01-2345". Es lo que se teclea en /verificar.
function _codigoDe(huella) {
  var s = String(huella || '').slice(0, 12).toUpperCase();
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

// El sello vale solo para el folio vigente, con su cuerpo, una huella bien
// formada y el codigo que sale de ella. La demostracion no calcula nada en
// el servidor: su codigo es siempre DEMO-0000-0000 y su folio empieza por
// DEMO-, para que nada de ahi pueda pasar por un acta emitida.
function _selloVigente() {
  var s = _sello;
  if (!s || typeof s !== 'object' || !_actaFolio || s.folio !== _actaFolio) return null;
  if (typeof s.cuerpo !== 'string' || !s.cuerpo) return null;
  if (!/^[0-9a-f]{64}$/.test(String(s.huella || ''))) return null;
  var esperado = /^DEMO-/.test(_actaFolio) ? 'DEMO-0000-0000' : _codigoDe(s.huella);
  return s.codigo === esperado ? s : null;
}

function _selloDesdeLaCuenta(s, folio) {
  if (!folio || !s || typeof s !== 'object' || typeof s.cuerpo !== 'string' ||
      !/^[0-9a-f]{64}$/.test(String(s.huella || ''))) {
    return Promise.resolve(null);
  }
  return _huellaDe(s.cuerpo).then(function (h) {
    if (h !== s.huella) return null;
    return { folio: folio, codigo: /^DEMO-/.test(folio) ? 'DEMO-0000-0000' : _codigoDe(h), huella: h, cuerpo: s.cuerpo };
  }, function () { return null; });
}

// Nombres y RUT que no pueden salir en el resumen publico. El titulo de un
// punto lo escribe una persona y suele nombrar a otras ("Eleccion del
// comite: Juan Perez..."): se sacan los RUT con digito verificador y los
// nombres que el acta conoce -padron, apoderados, firmantes, presidente,
// convocante, administrador y ministro de fe-. Un nombre que el acta no
// conoce no se puede reconocer, y por eso el resumen se limita a materias,
// resultados y porcentajes.
// Los RUT que el acta conoce se sacan ademas en cualquier forma, con o sin
// puntos y aunque vengan sin digito verificador: "12345678" en un titulo es
// tan de una persona como "12.345.678-5".
// El nombre se busca como palabra entera: "Rosa" no puede comerse "rosado"
// y dejar una materia ilegible en la pagina de verificacion.
function _quitarPersonas(texto, nombres, ruts) {
  var t = String(texto == null ? '' : texto);
  t = t.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\s*-\s*[\dkK]\b/g, '[RUT omitido]');
  (ruts || []).forEach(function (r) {
    var s = String(r || '').replace(/[^0-9kK]/g, '');
    var cuerpo = s.slice(0, -1);
    if (!/^\d{6,8}$/.test(cuerpo)) return;
    var rx = new RegExp('(^|[^0-9])' + cuerpo.split('').join('\\.?') + '(?:\\s*-\\s*[0-9kK]|[0-9kK])?(?![0-9])', 'g');
    t = t.replace(rx, '$1[RUT omitido]');
  });
  t = t.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[correo omitido]');
  nombres.forEach(function (n) {
    var limpio = String(n || '').trim();
    if (limpio.length < 4) return;
    var patron = limpio.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    var rx;
    try {
      rx = new RegExp('(^|[^\\p{L}\\p{N}])' + patron + '(?=$|[^\\p{L}\\p{N}])', 'giu');
    } catch (e) {
      // Un navegador sin \p{...}: mejor de mas que de menos.
      rx = new RegExp('()' + patron, 'gi');
    }
    t = t.replace(rx, '$1[nombre omitido]');
  });
  return t.replace(/\s+/g, ' ').trim();
}

// Recorta por caracteres, no por unidades UTF-16: cortar un emoji por la
// mitad deja un sustituto suelto, que JSON.stringify escribe como \ud83d y
// que Postgres rechaza al leer el jsonb. Con eso fallaba la finalizacion.
function _recortar(s, n) {
  var a = Array.from(String(s == null ? '' : s));
  return a.length > n ? a.slice(0, n).join('') : a.join('');
}

// ac_resumen_limpio mide el resumen como jsonb::text, que pone un espacio
// despues de cada ":" y de cada ",". JSON.stringify no los pone, asi que
// aqui se cuentan igual que alla: un resumen que aqui cabia justo en 16 KB
// alla no cabia, y la base rechazaba el acta con 'resumen_invalido'.
function _bytesComoJsonb(v) {
  if (v === null || typeof v !== 'object') return _bytesUtf8(JSON.stringify(v));
  if (Array.isArray(v)) {
    var ba = 2;
    v.forEach(function (x, i) { ba += (i ? 2 : 0) + _bytesComoJsonb(x); });
    return ba;
  }
  var bo = 2;
  Object.keys(v).forEach(function (k, i) {
    bo += (i ? 2 : 0) + _bytesUtf8(JSON.stringify(k)) + 2 + _bytesComoJsonb(v[k]);
  });
  return bo;
}

function _bytesUtf8(s) {
  try { return new TextEncoder().encode(s).length; } catch (e) { return unescape(encodeURIComponent(s)).length; }
}

// p_resumen de ac_finalizar: lo que /verificar muestra a quien tenga el
// folio y el codigo. Sin datos de personas y a lo mas 16 KB.
function _resumenDelActa() {
  var padron = _padronDelActa();
  var presentes = 0;
  var nombres = [];
  var ruts = [_pvau('notario-rut')];
  padron.filas.forEach(function (f) {
    if (f.asiste) presentes += f.der;
    nombres.push(f.nombre, f.representante);
    ruts.push(f.rut);
  });
  presentes = Math.min(presentes, Derechos.CIEN);
  firmLeer().forEach(function (fr) { nombres.push(fr.nombre); ruts.push(fr.rut); });
  ['nombre-presidente', 'nombre-convocante', 'nombre-admin', 'notario-nombre'].forEach(function (id) {
    nombres.push(_pvau(id));
  });
  // Primero los mas largos: "Maria Gonzalez Perez" antes que "Maria Gonzalez".
  nombres = nombres.filter(function (n) { return String(n || '').trim(); })
    .sort(function (a, b) { return String(b).length - String(a).length; });

  var tipo = _pvau('tipo-asamblea');
  var fecha = _pvau('fecha-sesion');
  var puntos = [];
  document.querySelectorAll('.punto-card').forEach(function (pc) {
    if (puntos.length >= 60) return;
    var n = String(pc.id || '').replace('punto-', '');
    var requiere = (document.getElementById('p' + n + '-requiere') || {}).value || 'si';
    var aprob = pc.dataset.votAprobado || 'pendiente';
    var conVotos = requiere === 'si' && (pc.dataset.votFavorTxt || '') !== '' && (pc.dataset.votBase || '') !== '';
    puntos.push({
      materia: _quitarPersonas(_pvau('p' + n + '-titulo'), nombres, ruts),
      resultado: requiere === 'no' ? 'sin votacion'
        : aprob === 'si' ? 'aprobado'
        : aprob === 'no' ? 'rechazado'
        : 'pendiente',
      favor: conVotos ? pc.dataset.votFavorTxt + ' %' : ''
    });
  });

  var armar = function (tope) {
    return {
      condominio: _recortar(String(_pvau('condo-nombre') || '').trim(), 200),
      fecha_sesion: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
      // Sin tipo elegido no se inventa uno: "extraordinaria" por descarte
      // quedaba publicado en /verificar como si el acta lo dijera.
      tipo: tipo === 'ordinaria' ? 'ordinaria'
        : /^extraordinaria/.test(tipo) ? 'extraordinaria'
        : null,
      quorum: Derechos.texto(presentes) + ' %',
      acuerdos: puntos.map(function (p) {
        return { materia: _recortar(p.materia, tope), resultado: p.resultado, favor: p.favor };
      })
    };
  };
  // 60 materias de 300 caracteres con tildes pasan de 16 KB. Se acortan las
  // materias -nunca los resultados- hasta que quepa, medido como lo mide
  // la base.
  var topes = [300, 200, 120, 60, 30];
  var r = armar(topes[0]);
  for (var i = 1; i < topes.length && _bytesComoJsonb(r) > 16384; i++) r = armar(topes[i]);
  return r;
}

// Antes de pedir el folio se sube lo ultimo que se escribio, junto con el
// cuerpo sellado: despues del folio la base ya no deja modificar el acta
// (C6), y lo que quede guardado en la cuenta tiene que ser lo emitido. Si
// el cuerpo no cabe en el tope de tamano se sube sin el; y si no se puede
// subir, se finaliza igual: el documento que se descarga es el que vale.
function _subirAntesDeCerrar(c, sello) {
  if (_guardarTimer) { clearTimeout(_guardarTimer); _guardarTimer = null; }
  var snap;
  try { snap = _captureFieldsSnapshot(); } catch (e) { return Promise.resolve(); }
  snap.savedAt = new Date().toISOString();
  snap.sello = sello;
  var fila = {
    titulo: (_pvau('condo-nombre') || '').slice(0, 200),
    fecha_sesion: _pvau('fecha-sesion') || null,
    contenido: snap
  };
  var subir = function () {
    return Promise.resolve(c.from('actas_guardadas').update(fila).eq('id', _actaId).eq('dueno', _uidSesion).select('id'));
  };
  return subir().then(function (r) {
    if (r && r.error && /actas_tamano/.test(String(r.error.message || ''))) {
      delete snap.sello;
      return subir();
    }
  }).then(null, function () {});
}

// ---------------------------------------------------------------------
//  Finalizar el acta
//  Aqui se cobra. La comprobacion vive en Postgres (ac_finalizar valida la
//  llave del pago), no en el navegador: un candado de navegador se abre
//  mirando el codigo fuente.
// ---------------------------------------------------------------------
// CN-001: la llave de pago del equipo se quita solo si la sesion sigue
// siendo de quien abrio la pagina. Si cambio, la que hay ahora puede ser
// de la otra cuenta, y esa no se toca.
// Devuelve una promesa: quien llama responde despues de quitarla.
function _quitarLlaveDelEquipo() {
  if (_sesionAjena) return Promise.resolve();
  return _comprobarSesion().then(function (s) {
    if (s.misma) { try { localStorage.removeItem('acta_pago_llave'); } catch (e) {} }
  });
}

function actaFinalizar(alTerminar) {
  if (_actaPagada()) { alTerminar(null); return; }
  // CN-001: una pestana que quedo de otra sesion no finaliza nada.
  if (_sesionAjena) { alTerminar('Esta pestaña quedó de otra sesión. Recargue la página.'); return; }

  var c = window.Cuenta && Cuenta.cliente();
  if (!c) { alTerminar('Sin conexión con el servicio. Reintente en un momento.'); return; }
  if (!_actaId) { alTerminar('Todavía estamos guardando su acta. Espere unos segundos y reintente.'); return; }

  var llave = llaveDelActa();
  if (!llave) { alTerminar('SIN_PAGO'); return; }

  // El cuerpo se fija y se sella ANTES de conocer el folio: la huella no
  // puede depender de lo que la base conteste. Ver "EL CUERPO CANONICO".
  _sello = null;
  generateActa();
  var cuerpo = _actaGenerada && _actaGenerada.cuerpo;
  if (!cuerpo) { alTerminar('Complete los datos del acta antes de finalizarla.'); return; }

  // Se responde una sola vez. Si algo revienta despues de un cierre que
  // salio bien -al imprimir, por ejemplo-, el catch del final no puede
  // anunciar "No pudimos finalizar" de un acta que ya tiene folio.
  var _responder = alTerminar, _respondio = false;
  alTerminar = function (e, motivo) { if (_respondio) return; _respondio = true; _responder(e, motivo); };

  _comprobarSesion().then(function (s) {
    if (!s.misma) {
      alTerminar(_sesionAjena ? 'Esta pestaña quedó de otra sesión. Recargue la página.'
        : 'No pudimos comprobar su sesión. Revise su conexión y reintente.');
      return;
    }
    return _huellaDe(cuerpo).then(function (huella) {
    var resumen = _resumenDelActa();
    return _subirAntesDeCerrar(c, { huella: huella, cuerpo: cuerpo }).then(function () {
      return c.rpc('ac_finalizar', { p_acta: _actaId, p_llave: llave, p_huella: huella, p_resumen: resumen });
    }).then(function (r) {
      if (r.error) {
        var m = String(r.error.message || '');
        // Los errores del contrato C2 que no son de conexion se explican:
        // "Reintente en unos minutos" no arregla ninguno. Los dos primeros
        // saltan antes de tocar el pago, y eso tambien se dice.
        if (/huella_invalida/.test(m)) {
          alTerminar('El servidor no aceptó la huella del documento, así que el acta no se finalizó y su pago sigue disponible. Recargue la página y vuelva a finalizar; si se repite, pruebe con otro navegador.');
          return;
        }
        if (/resumen_invalido/.test(m)) {
          alTerminar('El servidor no aceptó el resumen del acta que se publica para verificarla, así que el acta no se finalizó y su pago sigue disponible. Acorte los títulos de los puntos más largos y vuelva a finalizar.');
          return;
        }
        // Una orden, un acta (SB-01): esa llave ya emitio otra y no sirve mas.
        if (/pago_ya_usado_en_otra_acta/.test(m)) {
          return _quitarLlaveDelEquipo().then(function () { alTerminar('SIN_PAGO', 'Ese pago ya se usó para finalizar otra acta: cada acta requiere su propio pago. Active esta asamblea para finalizarla.'); });
        }
        // La llave de este equipo la pago otra cuenta. Para esta no sirve,
        // pero sigue siendo de quien pago: se anota su orden y cuenta.js se
        // la devuelve cuando esa cuenta entre en este equipo.
        if (/pago_de_otra_cuenta/.test(m)) {
          _anotarOrdenDeLlave(llave);
          return _quitarLlaveDelEquipo().then(function () { alTerminar('SIN_PAGO', 'El pago guardado en este equipo es de otra cuenta y no sirve para esta acta. Si pagó con otra cuenta, entre con ella en este equipo y se lo devolveremos; si no, active esta asamblea con su propio pago.'); });
        }
        if (/pago_vencido/.test(m)) {
          return _quitarLlaveDelEquipo().then(function () { alTerminar('SIN_PAGO', 'El pago de esta asamblea venció. Para finalizar el acta debe activarla con un pago nuevo.'); });
        }
        if (/llave_invalida|llave_vencida|llave_malformada|pago_requerido|pago_ya_usado|llave_de_otro_producto/.test(m)) {
          if (/llave_de_otro_producto/.test(m)) _anotarOrdenDeLlave(llave);
          return _quitarLlaveDelEquipo().then(function () { alTerminar('SIN_PAGO'); });
        }
        if (/does not exist|schema cache|PGRST202/i.test(m)) {
          alTerminar('El cierre del acta todavía no está habilitado en el servidor.');
          return;
        }
        alTerminar('No pudimos finalizar el acta. Reintente en unos minutos.');
        return;
      }
      var d = r.data || {};
      var folio = d.folio || null;
      var demo = /^DEMO-/.test(folio || '');
      var codigo = demo ? 'DEMO-0000-0000' : _codigoDe(huella);
      _actaFolio = folio;
      // El codigo que devuelve la base es el que quedo registrado. Si no
      // coincide con el de este cuerpo -un acta que ya estaba finalizada
      // con otro texto-, este documento no se imprime como verificable.
      _sello = (folio && String(d.codigo || '').toUpperCase() === codigo)
        ? { folio: folio, codigo: codigo, huella: huella, cuerpo: cuerpo }
        : null;
      // SB-01: la llave ya cumplio. Si quedara en el equipo, el panel la
      // seguiria ofreciendo como "asamblea activada" y pareceria servir
      // para la proxima acta. Si el acta ya estaba finalizada, la llave que
      // hay ahora puede ser la de otra asamblea, y esa no se toca.
      return (d.ya_estaba ? Promise.resolve() : _quitarLlaveDelEquipo()).then(function () {
        _recordarIdEnBorrador();
        generateActa();
        alTerminar(null);
      });
    });
  }, function () {
    alTerminar('Este navegador no permite calcular la huella del acta. Actualícelo o use otro navegador para finalizarla.');
  });
  }).then(null, function () { alTerminar('No pudimos finalizar el acta. Revise su conexión.'); });
}

function actaIniciarGuardado() {
  // si viene ?acta=<id> desde el panel, se abre esa
  var m = location.search.match(/[?&]acta=([0-9a-f-]{36})/i);
  if (m) { actaCargarGuardada(m[1]); return; }
  // Sin ?acta= no se guarda nada todavía. Antes se llamaba aquí a
  // actaSincronizar() y el solo hecho de abrir la página creaba un acta
  // vacía en la cuenta; con unas cuantas visitas se llegaba al tope de 100.
  // La fila nace con el primer dato que la persona escriba (autoSave), o al
  // restaurar el borrador, que trae consigo el id de su fila.
}

function showLoading(title, desc) {
  var ov = document.getElementById('loading-overlay');
  if (!ov) return;
  if (title) {
    var t = document.getElementById('loading-title');
    if (t) t.textContent = title;
  }
  if (desc) {
    var d = document.getElementById('loading-desc');
    if (d) d.textContent = desc;
  }
  ov.classList.add('show');
}
function hideLoading() {
  var ov = document.getElementById('loading-overlay');
  if (ov) ov.classList.remove('show');
}


document.addEventListener('keydown', function(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var t = e.target;
  if (!t || !t.getAttribute) return;
  if (t.getAttribute('role') !== 'button') return;
  if (t.tagName === 'BUTTON' || t.tagName === 'A') return; 
  e.preventDefault();
  t.click();
});

// ---------------------------------------------------------------------
//  Funciones con nombre que reemplazan a las expresiones que antes vivian
//  dentro de los atributos onclick/onchange. Ver js/acciones.js.
// ---------------------------------------------------------------------
function quorumYVotacion() {
  calcularQuorum();
  actualizarVotacion();
}
function matChkClick(el, ev) {
  if (ev) ev.stopPropagation();
  updateMatCount();
}
function materiaEnter(el, ev) {
  if (!ev || ev.key !== 'Enter') return;
  ev.preventDefault();
  addCustomMateria();
}
function _kbxoTodos(n, el) {
  _kbxo(n, !!(el && el.checked));
}


/* =====================================================================
 *  Firmantes dinamicos (art. 15) y revision de consistencia
 *
 *  La ley da dos alternativas para firmar el acta: todos los miembros
 *  del comite de administracion, o los copropietarios que la asamblea
 *  designe. Antes habia tres bloques fijos -insuficientes para un
 *  comite de cinco- y un "Administrador/a" que la ley no exige. Ahora
 *  la alternativa se elige y las personas se agregan segun haga falta.
 *
 *  La revision de consistencia mira SOLO lo que la plataforma conoce:
 *  datos ingresados. No verifica citaciones, poderes ni la autenticidad
 *  del padron, y por eso jamas dice "valido": dice "revise".
 * ===================================================================== */

var _firmSeq = 0;

// La ley solo nombra un cargo -el Presidente del Comite de Administracion-;
// los demas son descripciones de quien firma. Por eso el menu ofrece las
// calidades habituales y deja "Otro" para escribir la que corresponda, en
// vez de obligar a encasillar a todo el mundo en dos etiquetas.
var CARGOS_FIRMA = [
  'Presidente del Comit\u00e9 de Administraci\u00f3n',
  'Miembro del Comit\u00e9 de Administraci\u00f3n',
  'Secretario/a del Comit\u00e9 de Administraci\u00f3n',
  'Tesorero/a del Comit\u00e9 de Administraci\u00f3n',
  'Copropietario/a designado/a por la Asamblea',
  'Administrador/a del Condominio'
];
var OTRO_CARGO = 'Otro (escribir)';

// "Otro" abre el campo libre; cualquier otra opcion lo guarda y lo oculta.
function firmCargoCambio(sel) {
  var row = sel && sel.closest ? sel.closest('.firm-row') : null;
  if (!row) return;
  var libre = row.querySelector('.firm-cargo-otro');
  if (!libre) return;
  var otro = sel.value === OTRO_CARGO;
  libre.hidden = !otro;
  if (otro) { try { libre.focus(); } catch (e) {} }
  if (typeof autoSave === 'function') autoSave();
}

function firmAlternativa() {
  var el = document.querySelector('input[name="firm-alt"]:checked');
  return el ? el.value : 'comite';
}

function firmLeer() {
  var alt = firmAlternativa();
  var out = [];
  document.querySelectorAll('#firmantes-lista .firm-row').forEach(function (row) {
    var g = function (sel) { var e = row.querySelector(sel); return e ? String(e.value || '').trim() : ''; };
    var cargo = g('.firm-cargo');
    if (cargo === OTRO_CARGO) cargo = g('.firm-cargo-otro');
    out.push({
      nombre: g('.firm-nombre'),
      rut: g('.firm-rut'),
      cargo: alt === 'designados'
        ? 'Copropietario/a designado/a por la Asamblea'
        : (cargo || CARGOS_FIRMA[1])
    });
  });
  return out;
}

function firmSnapshot() {
  return { alternativa: firmAlternativa(), lista: firmLeer() };
}

function addFirmante(datos) {
  var lista = document.getElementById('firmantes-lista');
  if (!lista) return;
  datos = datos || {};
  var n = ++_firmSeq;
  var alt = firmAlternativa();
  var row = document.createElement('div');
  row.className = 'firm-row';

  var dNom = document.createElement('div');
  dNom.className = 'field';
  dNom.innerHTML = '<label for="firm-' + n + '-nombre">Nombre</label>' +
    '<input type="text" class="firm-nombre" id="firm-' + n + '-nombre" placeholder="Nombre completo">';

  var dRut = document.createElement('div');
  dRut.className = 'field';
  dRut.innerHTML = '<label for="firm-' + n + '-rut">RUT</label>' +
    '<input type="text" class="firm-rut" id="firm-' + n + '-rut" placeholder="Ej: 12.345.678-5">';

  var dCargo = document.createElement('div');
  dCargo.className = 'field firm-cargo-wrap';
  if (alt === 'designados') {
    dCargo.innerHTML = '<label>Calidad</label><div class="firm-cargo-fijo">Copropietario/a designado/a por la Asamblea</div>';
  } else {
    var esperado = datos.cargo || (document.querySelectorAll('#firmantes-lista .firm-row').length === 0
      ? CARGOS_FIRMA[0] : CARGOS_FIRMA[1]);
    var conocido = CARGOS_FIRMA.indexOf(esperado) >= 0;
    dCargo.innerHTML = '<label for="firm-' + n + '-cargo">Cargo o calidad</label>' +
      '<select class="firm-cargo" id="firm-' + n + '-cargo" data-cambio="firmCargoCambio" data-args="@">' +
      CARGOS_FIRMA.map(function (o) { return '<option' + (o === esperado ? ' selected' : '') + '>' + o + '</option>'; }).join('') +
      '<option value="' + OTRO_CARGO + '"' + (conocido ? '' : ' selected') + '>' + OTRO_CARGO + '</option>' +
      '</select>' +
      '<input type="text" class="firm-cargo-otro" id="firm-' + n + '-cargo-otro" maxlength="70"' +
      ' placeholder="Escriba el cargo o la calidad" aria-label="Cargo o calidad del firmante"' +
      // El cargo libre puede venir de un borrador .json que armo otra
      // persona: se escapa entero, no solo las comillas.
      (conocido ? ' hidden' : ' value="' + escapeHtml(esperado) + '"') + '>';
  }

  var del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn-del-firm';
  del.title = 'Quitar firmante';
  del.setAttribute('aria-label', 'Quitar firmante');
  del.textContent = '\u2715';
  del.addEventListener('click', function () {
    var quien = (row.querySelector('.firm-nombre') || {}).value || '';
    if (quien.trim() && !confirm('\u00bfQuitar a ' + quien.trim() + ' de los firmantes?')) return;
    row.remove();
    if (typeof autoSave === 'function') autoSave();
  });

  row.appendChild(dNom); row.appendChild(dRut); row.appendChild(dCargo); row.appendChild(del);
  lista.appendChild(row);

  var iNom = row.querySelector('.firm-nombre');
  var iRut = row.querySelector('.firm-rut');
  if (iNom && datos.nombre) iNom.value = datos.nombre;
  if (iRut && datos.rut) iRut.value = datos.rut;
  if (typeof window.firmBindCampos === 'function') window.firmBindCampos(iRut, iNom);
  return row;
}

function firmCambioAlternativa() {
  // Se reconstruyen las filas conservando nombres, RUT y el cargo que ya
  // estaba elegido: lo que cambia entre alternativas es la calidad en que
  // se firma, no las personas.
  var lista = document.getElementById('firmantes-lista');
  if (!lista) return;
  var actuales = [];
  lista.querySelectorAll('.firm-row').forEach(function (row) {
    var g = function (sel) { var e = row.querySelector(sel); return e ? String(e.value || '').trim() : ''; };
    actuales.push({ nombre: g('.firm-nombre'), rut: g('.firm-rut'), cargo: g('.firm-cargo') || undefined });
  });
  lista.innerHTML = '';
  if (actuales.length === 0) actuales = [{}, {}];
  actuales.forEach(function (fr) { addFirmante(fr); });
  if (typeof autoSave === 'function') autoSave();
}

function firmRestaurar(snap) {
  var lista = document.getElementById('firmantes-lista');
  if (!lista) return;
  var fs = snap && snap.firmantes;

  // Migracion: los borradores anteriores guardaban f1/f2/f3 en fields.
  if ((!fs || !fs.lista || !fs.lista.length) && snap && snap.fields && snap.fields['f1-nombre'] !== undefined) {
    var migrada = [];
    ['f1', 'f2', 'f3'].forEach(function (fn) {
      var nom = String(snap.fields[fn + '-nombre'] || '').trim();
      if (nom) migrada.push({ nombre: nom, rut: snap.fields[fn + '-rut'] || '', cargo: snap.fields[fn + '-cargo'] || '' });
    });
    fs = { alternativa: 'comite', lista: migrada };
  }
  if (!fs) { firmInicial(); return; }

  var alt = fs.alternativa === 'designados' ? 'designados' : 'comite';
  var radio = document.querySelector('input[name="firm-alt"][value="' + alt + '"]');
  if (radio) radio.checked = true;

  lista.innerHTML = '';
  var items = (fs.lista && fs.lista.length) ? fs.lista : [{}, {}];
  items.forEach(function (fr) { addFirmante(fr); });
}

function firmInicial() {
  var lista = document.getElementById('firmantes-lista');
  if (!lista || lista.children.length) return;
  addFirmante({}); addFirmante({});
}

/* ---- Revision de consistencia (paso final) ------------------------- */

function revisarConsistencia() {
  var items = [];
  var padron = _padronDelActa();

  // Todo lo que sigue trabaja en enteros escalados. Comparar un entero
  // escalado contra 100 o contra 33 -como quedo por un descuido al pasar a
  // Derechos- da siempre lo mismo y la revision deja de servir: decia que
  // 100,00 % "debiera sumar 100" y daba por cumplido cualquier quorum.
  var E = Derechos.ESCALA;

  var suma = 0, presentes = 0, presentesHabiles = 0;
  var malos = [], negativos = [], sinUnidad = 0;
  // Diccionarios sin prototipo: las claves son unidades y apoderados que
  // escribio una persona. Con {} una unidad "constructor" salia repetida
  // desde la primera vez, y un apoderado "toString" nunca llegaba a 2.
  var unidades = Object.create(null), unidadesRepetidas = [];
  var representantes = Object.create(null), repDobles = [];

  padron.filas.forEach(function (f) {
    suma += f.der;

    // (0) Lo que no es un numero valido vale cero en la suma, y eso puede
    // esconder una fila rota detras de un total que casi cuadra.
    var bruto = String(f.derTexto == null ? '' : f.derTexto).trim();
    if (bruto === '') { /* fila en blanco: la delata la suma */ }
    else if (/^-/.test(bruto)) negativos.push(f.unidad || f.nombre || '(sin unidad)');
    else if (!Derechos.valido(bruto)) malos.push(f.unidad || f.nombre || '(sin unidad)');

    var u = f.unidad.trim().toLowerCase();
    if (!u) sinUnidad++;
    else {
      if (unidades[u]) { if (unidadesRepetidas.indexOf(f.unidad) < 0) unidadesRepetidas.push(f.unidad); }
      unidades[u] = 1;
    }

    if (f.asiste) {
      presentes += f.der;
      if (f.habil) presentesHabiles += f.der;
      var rp = f.representante.trim().toLowerCase();
      if (rp) {
        representantes[rp] = (representantes[rp] || 0) + 1;
        if (representantes[rp] === 2) repDobles.push(f.representante.trim());
      }
    }
  });

  // (a) Los derechos del padron suman 100 %.
  var sumaOk = Math.abs(suma - Derechos.CIEN) <= 0.5 * E;
  items.push({ ok: sumaOk, texto: sumaOk
    ? 'Los derechos del padrón suman ' + Derechos.texto(suma) + ' %.'
    : 'Los derechos del padrón suman ' + Derechos.texto(suma) + ' % y debieran sumar 100 %. '
      + 'Mientras no sumen 100 %, los quórum se calculan sobre una base equivocada.' });

  // (a bis) Filas que no se pueden leer. Van aparte de la suma porque una
  // fila rota puede dejar el total cuadrando por casualidad.
  if (malos.length || negativos.length) {
    var det = [];
    if (negativos.length) det.push('con derechos negativos: ' + negativos.join(', '));
    if (malos.length) det.push('con derechos que no son un número: ' + malos.join(', '));
    items.push({ ok: false, texto: 'Hay unidades ' + det.join('; ') + '. '
      + 'Esas filas cuentan como 0 % y el resultado de cualquier votación queda mal.' });
  } else {
    items.push({ ok: true, texto: 'Todos los derechos del padrón son números válidos.' });
  }

  // (a ter) Una unidad no puede aparecer dos veces: sus derechos se
  // contarian dos veces. Un RUT si puede repetirse -es un copropietario
  // con mas de una unidad- y eso lo resuelve el art. 14 aparte.
  if (unidadesRepetidas.length) {
    items.push({ ok: false, texto: 'Unidades repetidas en el padrón: '
      + unidadesRepetidas.join(', ') + '. Sus derechos se están contando dos veces.' });
  } else if (sinUnidad) {
    items.push({ ok: false, texto: sinUnidad + ' fila(s) sin número de unidad: '
      + 'no se puede comprobar si hay duplicados.' });
  } else {
    items.push({ ok: true, texto: 'No hay unidades repetidas.' });
  }

  // (a quater) Art. 14 del Reglamento: quien tiene mas de una unidad solo
  // es habil si esta al dia respecto de todas. Si el arrastre movio algo,
  // se dice aqui tambien, porque cambia la base de la votacion.
  if (padron.arrastrados.length) {
    items.push({ ok: true, texto: 'Se marcaron como inhábiles '
      + padron.arrastrados.length + ' unidad(es) por pertenecer a un copropietario que no está '
      + 'al día en otra de las suyas (art. 14 del Reglamento): '
      + padron.arrastrados.map(function (a) { return a.unidad || a.rut; }).join(', ') + '.' });
  }
  if (padron.sinRut) {
    items.push({ ok: false, texto: padron.sinRut + ' unidad(es) sin RUT. Sin RUT no se puede '
      + 'saber si son del mismo copropietario, así que la regla del artículo 14 no se '
      + 'les puede aplicar, y tampoco podrán votar desde el teléfono.' });
  }

  // (b) El quorum de constitucion del tipo elegido. Esto no es un descuido
  // de tipeo: es la asamblea constituyendose o no.
  var tipo = (document.getElementById('tipo-asamblea') || {}).value || '';
  var cumple = presentes >= 33 * E, etiqueta = '33 % (ordinaria, primera citación)';
  if (tipo === 'extraordinaria-abs') { cumple = presentes > 50 * E; etiqueta = 'más del 50 %'; }
  if (tipo === 'extraordinaria-ref') { cumple = presentes >= 66 * E; etiqueta = '66 %'; }
  items.push({ ok: cumple, grave: !cumple, texto: (cumple
    ? 'Los derechos presentes (' + Derechos.texto(presentes) + ' %) alcanzan el mínimo de '
      + etiqueta + '.'
    : 'Los derechos presentes (' + Derechos.texto(presentes) + ' %) NO alcanzan el mínimo de '
      + etiqueta + '. La asamblea no se constituyó: los acuerdos que se adopten son '
      + 'impugnables ante el Juzgado de Policía Local.') });

  // (b bis) Y sobre que se vota, que es una base distinta de la anterior:
  // constituir cuenta a todos los presentes, acordar solo a los habiles.
  if (cumple) {
    items.push({ ok: presentesHabiles > 0, texto: presentesHabiles > 0
      ? 'Los acuerdos se computan sobre ' + Derechos.texto(presentesHabiles)
        + ' % de derechos: los de los copropietarios hábiles presentes.'
      : 'No hay derechos hábiles presentes: con el padrón así, ningún acuerdo '
        + 'tiene base sobre la cual computarse.' });
  }

  // (b ter) Un apoderado con varias representaciones no es ilegal, pero es
  // lo primero que se mira cuando se impugna un acuerdo.
  if (repDobles.length) {
    items.push({ ok: true, texto: 'Hay apoderados que representan a más de una unidad: '
      + repDobles.join(', ') + '. La ley no lo prohíbe, pero revíselo contra el '
      + 'reglamento de copropiedad, que sí puede limitarlo.' });
  }

  // (c) Firmantes con nombre.
  var firmantes = firmLeer().filter(function (fr) { return fr.nombre; });
  var alt = firmAlternativa();
  if (firmantes.length === 0) {
    items.push({ ok: false, texto: 'No hay firmantes con nombre. La ley exige que firmen todos los miembros del comité o los copropietarios designados por la asamblea.' });
  } else if (alt === 'comite' && firmantes.length < 2) {
    items.push({ ok: false, texto: 'Hay un solo firmante y la alternativa elegida es "todos los miembros del comité": revise si falta alguien.' });
  } else {
    items.push({ ok: true, texto: firmantes.length + ' firmante(s) registrado(s), en calidad de ' + (alt === 'designados' ? 'copropietarios designados por la asamblea.' : 'miembros del comité de administración.') });
  }

  // (d) El notario, cuando la ley lo exige.
  var hayReglamento = (typeof reglamentoDeclarado === 'function') && reglamentoDeclarado();
  document.querySelectorAll('.punto-card').forEach(function (pc) {
    var m = (pc.id || '').match(/^punto-(\d+)$/);
    var t = m && document.getElementById('p' + m[1] + '-titulo');
    if (t && tocaModificacionDelReglamento(t.value || '')) hayReglamento = true;
  });
  var exigeNotario = tipo === 'extraordinaria-ref' || hayReglamento;
  var notarioSi = ((document.getElementById('notario') || {}).value === 'Si');
  if (!exigeNotario) {
    items.push({ ok: true, texto: 'Según el tipo de sesión y los puntos de la tabla, no se detecta exigencia de notario.' });
  } else {
    items.push({ ok: notarioSi, grave: !notarioSi, texto: notarioSi
      ? 'La sesión exige la asistencia de un notario y su intervención está registrada.'
      : 'Esta sesión exige la asistencia de un notario (art. 15) y no está registrada en el paso 5.' });
  }

  // (e) Cada punto sometido a acuerdo tiene resultado.
  var cards = document.querySelectorAll('.punto-card');
  var pendientes = 0;
  cards.forEach(function (pc) {
    if ((pc.dataset.requiere || 'si') === 'si' && (pc.dataset.votAprobado || 'pendiente') === 'pendiente') pendientes++;
  });
  if (!cards.length) {
    items.push({ ok: false, texto: 'La tabla no tiene puntos: un acta sin puntos tratados queda vacía.' });
  } else {
    items.push({ ok: pendientes === 0, texto: pendientes === 0
      ? 'Los ' + cards.length + ' punto(s) de la tabla tienen su resultado registrado.'
      : pendientes + ' punto(s) sometidos a acuerdo siguen sin resultado registrado.' });
  }

  return items;
}

function renderRevision() {
  var box = document.getElementById('lista-revision');
  if (!box) return;
  var items = revisarConsistencia();
  var advertencias = items.filter(function (x) { return !x.ok; }).length;
  box.hidden = false;
  box.classList.toggle('rev-todo-ok', advertencias === 0);
  // Lo de fondo -que la asamblea no se constituyera, que falte el notario
  // que la ley exige- no puede quedar en la misma pila que un correo mal
  // escrito.
  var graves = items.filter(function (x) { return !x.ok && x.grave; }).length;
  // Nada de esto pasa por innerHTML. Los avisos citan unidades, nombres y
  // apoderados tal como vienen del padron, y el padron suele llegar en una
  // planilla que armo otra persona: una unidad escrita como
  // 101<img src=x onerror=...> se tiene que leer asi, no volverse etiqueta.
  // Con textContent la proxima frase que alguien agregue tampoco puede
  // equivocarse, porque aqui no hay nada que interprete HTML.
  box.textContent = '';
  var titulo = document.createElement('h3');
  titulo.textContent = 'Revisi\u00f3n de consistencia'
      + (graves ? ' \u00b7 ' + graves + ' problema(s) de fondo' : '')
      + (advertencias - graves ? ' \u00b7 ' + (advertencias - graves) + ' por revisar' : '')
      + (advertencias ? '' : ' \u00b7 todo en orden');
  box.appendChild(titulo);
  var nota = document.createElement('p');
  nota.className = 'rev-nota';
  nota.textContent = 'Revisa los datos ingresados en esta acta. No verifica la citaci\u00f3n, los poderes ni la calidad de los datos del padr\u00f3n, y no certifica la validez legal de la asamblea.';
  box.appendChild(nota);
  items.forEach(function (x) {
    var clase = x.ok ? 'ok' : (x.grave ? 'grave' : 'warn');
    var icono = x.ok ? '\u2713' : (x.grave ? '\u2715' : '\u26a0');
    var fila = document.createElement('div');
    fila.className = 'rev-item ' + clase;
    var ic = document.createElement('span');
    ic.className = 'rev-ic';
    ic.textContent = icono;
    var texto = document.createElement('span');
    texto.textContent = x.texto;
    fila.appendChild(ic);
    fila.appendChild(texto);
    box.appendChild(fila);
  });
}

// Dos filas vacias para empezar; un borrador restaurado las reemplaza.
firmInicial();


/* =====================================================================
 *  Puerta de pago
 *
 *  El acta se paga antes de la asamblea. Si el cobro aparece recien al
 *  finalizar, la reunion se detiene mientras alguien saca la tarjeta y
 *  espera la confirmacion, con la sala llena esperando.
 *
 *  Esto NO es el candado: el candado vive en Postgres, que valida la
 *  firma de la llave antes de abrir la sala o de entregar el folio.
 *  Esto es el orden correcto de las cosas, y un aviso honesto.
 * ===================================================================== */

var LLAVE_ACTA = 'acta_pago_llave';
// La demostracion escribe esta llave para abrirse sola, y localStorage es
// del origen entero: al salir de /acta-demo quedaba puesta y el producto
// se comportaba como pagado. Fuera de una pagina de demostracion no vale.
var LLAVE_DE_DEMO = 'DEMO-PAGO-SIMULADO';
function enPaginaDemo() {
return /(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname);
}
function llaveDelActa() {
var v = '';
try { v = localStorage.getItem(LLAVE_ACTA) || ''; } catch (e) { return ''; }
if (v === LLAVE_DE_DEMO && !enPaginaDemo()) return '';
return v;
}

function hayPagoDelActa() {
  return !!llaveDelActa();
}

// La llave es <payload base64url>.<firma>, con la orden en payload.o
// (emitirLlave en _worker.js). Aqui solo se lee la orden -la firma la
// valida Postgres- para anotarla antes de borrar una llave que en esta
// cuenta no sirve: cuenta.js se la devuelve a quien pago cuando entre en
// este equipo (Cuenta.anotarPago y recuperarPagos).
function _anotarOrdenDeLlave(llave) {
  var p = String(llave || '').split('.');
  if (p.length !== 2) return;
  try {
    var b = p[0].replace(/-/g, '+').replace(/_/g, '/');
    while (b.length % 4) b += '=';
    var o = String((JSON.parse(atob(b)) || {}).o || '');
    if (/^AV-[A-Z0-9]{1,32}$/.test(o) && window.Cuenta && typeof Cuenta.anotarPago === 'function') Cuenta.anotarPago(o);
  } catch (e) { /* una llave ilegible no tiene orden que anotar */ }
}

function puertaMsg(texto, malo) {
  var el = document.getElementById('puerta-msg');
  if (!el) return;
  el.hidden = !texto;
  el.className = 'puerta-msg ' + (malo ? 'err' : 'ok');
  el.textContent = texto || '';
}

function puertaRecuperar(btn) {
  var campo = document.getElementById('puerta-orden');
  if (!campo) return;
  var orden = String(campo.value || '').trim().toUpperCase();
  if (!/^AV-[A-Z0-9]{1,32}$/.test(orden)) {
    puertaMsg('Revise el n\u00famero: empieza con AV- y viene en el comprobante del pago.', true);
    campo.focus();
    return;
  }
  var _t = btn.textContent;
  var listo = function () { btn.disabled = false; btn.textContent = _t; };
  // C1: el numero de orden ya no basta. El comprobante se reenvia -al
  // tesorero, al contador- y con el numero cualquiera se quedaba con la
  // llave. El Worker entrega la llave solo a la cuenta que pago, y lo sabe
  // por el token de la sesion. Sin sesion no se llama: se pide entrar.
  var consultar = function (puedePedirSesion) {
    btn.disabled = true;
    btn.textContent = 'Buscando\u2026';
    puertaMsg('');
    _tokenDeAcceso().then(function (token) {
      if (!token) {
        listo();
        puertaMsg('Para recuperar el pago, entre con la cuenta con la que pag\u00f3.', true);
        if (puedePedirSesion && window.Cuenta && Cuenta.exigirSesion) {
          Cuenta.exigirSesion({
            titulo: 'Entre con la cuenta con la que pag\u00f3',
            sub: 'El pago queda asociado a esa cuenta, y solo ella puede recuperarlo.'
          }, function (u) {
            // Si entro otra cuenta que la que abrio la pagina, lo que esta
            // en pantalla es de la anterior: se recarga, como en acta-2.js.
            if (u && _uidSesion && u.id !== _uidSesion) { location.reload(); return; }
            consultar(false);
          });
        }
        return;
      }
      return fetch('/api/pago/estado?orden=' + encodeURIComponent(orden), {
        headers: { 'Authorization': 'Bearer ' + token }
      })
        .then(function (r) {
          return r.json().catch(function () { return null; })
            .then(function (d) { return { status: r.status, d: d }; });
        })
        .then(function (x) {
          listo();
          var d = x.d;
          if (x.status === 401) {
            puertaMsg('Su sesi\u00f3n venci\u00f3. Entre de nuevo con la cuenta con la que pag\u00f3 y vuelva a intentarlo.', true);
            return;
          }
          // 404 dice lo mismo si la orden no existe o si es de otra cuenta:
          // la pagina tampoco lo distingue. El numero se anota en el equipo,
          // como en el panel: si se pago con otra cuenta, al entrar con ella
          // en este equipo Cuenta.recuperarPagos le entrega la llave. Aqui
          // no hay ?pago= que quitar: el numero lo escribio la persona.
          if (x.status === 404) {
            if (window.Cuenta && typeof Cuenta.anotarPago === 'function') Cuenta.anotarPago(orden);
            puertaMsg('No encontramos un pago con ese número en esta cuenta. Revise el número; si pagó con otra cuenta, entre con ella en este equipo y se lo entregaremos.', true);
            return;
          }
          if (!d || d.estado !== 'pagado' || !d.llave) {
            puertaMsg('No encontramos un pago confirmado con ese n\u00famero en esta cuenta. Si acaba de pagarlo, espere un momento y vuelva a intentar; si pag\u00f3 con otra cuenta, entre con ella.', true);
            return;
          }
          if ((d.producto || 'acta') !== 'acta') {
            puertaMsg('Ese pago corresponde a una consulta por escrito, no a un acta de asamblea.', true);
            return;
          }
          // CN-001: la llave la entrego el Worker a la cuenta del token. Si
          // en el camino la sesion cambio, no se deja en el equipo.
          return _comprobarSesion().then(function (s) {
            if (!s.misma) { puertaMsg('La sesi\u00f3n cambi\u00f3 mientras busc\u00e1bamos el pago. Recargue la p\u00e1gina.', true); return; }
            try { localStorage.setItem(LLAVE_ACTA, d.llave); } catch (e) {}
            puertaMsg('Pago encontrado. Abriendo su acta\u2026');
            setTimeout(function () { location.reload(); }, 900);
          });
        });
    }).then(null, function () {
      listo();
      puertaMsg('No pudimos consultar el pago. Revise su conexi\u00f3n e int\u00e9ntelo otra vez.', true);
    });
  };
  consultar(true);
}

// El token de la sesion vigente (contrato C1: Cuenta.tokenDeAcceso, en
// cuenta.js). null si no hay sesion o si cuenta.js no lo ofrece: en los dos
// casos lo que corresponde es pedir que entre, no llamar sin credencial.
function _tokenDeAcceso() {
  if (!window.Cuenta || typeof Cuenta.tokenDeAcceso !== 'function') return Promise.resolve(null);
  return Promise.resolve()
    .then(function () { return Cuenta.tokenDeAcceso(); })
    .then(function (t) { return t || null; }, function () { return null; });
}

// Quien vuelve por un acta que la base ya finalizo -para bajarla otra vez-
// no esta usando el servicio de nuevo: el folio acredita el pago. Tras
// finalizar, la llave se borra del equipo (SB-01), asi que sin esto el
// dueno quedaba frente a la puerta de pago con su acta ya pagada adentro.
var _tituloPagina = null;
function abrirAsistente() {
  document.documentElement.classList.add('acta-abierta');
  if (_tituloPagina) document.title = _tituloPagina;
}

// El modo vitrina lo pone el Worker: cuando VITRINA=1 agrega la clase al
// <html> y borra del HTML todo lo comercial, la puerta incluida. Aqui solo
// se lee. Ojo con lo que esto NO significa: la puerta es de escaparate, no
// de caja. Quien pone el folio es Postgres, y sigue exigiendo la llave del
// pago aunque el asistente este a la vista.
function enVitrina() {
  return document.documentElement.classList.contains('vitrina');
}

function revisarPuertaDePago() {
  var raiz = document.documentElement;
  raiz.classList.remove('acta-abierta');

  // La demostracion vive en localhost y trae su propio simulador de pagos:
  // ahi la puerta estorba, porque el pago es justamente lo que muestra.
  if (window.DEMOA || enVitrina() || hayPagoDelActa()) {
    raiz.classList.add('acta-abierta');
    return;
  }
  _tituloPagina = document.title;
  document.title = 'Pague su acta antes de la asamblea \u00b7 actaviva';
}

// Se llama aqui mismo, no en DOMContentLoaded: este archivo se evalua al
// final del cuerpo, con el documento ya leido y antes de pintar. Esperar
// al evento dejaba un instante con el asistente a la vista.
revisarPuertaDePago();
