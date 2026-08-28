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
qAcuerdo: 'Mayoría absoluta de los asistentes.',
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
qConst: 'Mayor\u00eda absoluta de los derechos del condominio (50+1%).',
qAcuerdo: 'Mayor\u00eda absoluta de los derechos del condominio (50+1%), computada \u00fanicamente sobre la base de copropietarios h\u00e1biles para votar.',
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
function calcularQuorum() {
var tipo = document.getElementById('tipo-asamblea').value;
var totalHabil = 0; 
var countHabil = 0; 
var countTotal = 0; 
var totalPresentes = 0; 
document.querySelectorAll('#asistentes-tbody tr').forEach(function(row) {
var habEl = row.querySelector('.habil');
var derEl = row.querySelector('.derechos');
var asisteEl = row.querySelector('.asiste');
if (!habEl) return;
var asiste = asisteEl ? asisteEl.value === 'si' : true;
if (!asiste) return; 
var der = parseFloat(derEl ? derEl.value : 0) || 0;
countTotal++;
totalPresentes += der;
if (habEl.value === 'si') {
totalHabil += der;
countHabil++;
}
});

var sumaPadron = 0;
document.querySelectorAll('#asistentes-tbody tr .derechos').forEach(function(el) {
  sumaPadron += parseFloat(el.value) || 0;
});
var avisoSuma = document.getElementById('suma-derechos-aviso');
if (avisoSuma) {
  if (sumaPadron <= 0) {
    avisoSuma.style.display = 'none';
  } else if (Math.abs(sumaPadron - 100) <= 0.05) {
    avisoSuma.style.display = 'block';
    avisoSuma.className = 'msg-ok';
    avisoSuma.innerHTML = '✓ La suma de derechos del padrón es <strong>100%</strong>. Los quórum se calculan sobre una base correcta.';
  } else if (sumaPadron > 100) {
    avisoSuma.style.display = 'block';
    avisoSuma.className = 'msg-error';
    avisoSuma.innerHTML = '✕ La suma de derechos ingresados es <strong>' + sumaPadron.toFixed(2) + '%</strong> y supera el 100%. Revise los porcentajes: los quórum calculados no serán confiables.';
  } else {
    avisoSuma.style.display = 'block';
    avisoSuma.className = 'msg-warn';
    avisoSuma.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg> Suma de derechos ingresados: <strong>' + sumaPadron.toFixed(2) + '%</strong>. El padrón completo del condominio debe sumar 100%. Si aún no termina de ingresar copropietarios, puede continuar.';
  }
}
totalPresentes = Math.min(totalPresentes, 100);
totalHabil = Math.min(totalHabil, 100);
var fill = document.getElementById('quorum-fill');
var pct = document.getElementById('quorum-pct');
var status = document.getElementById('quorum-status-text');
var req = document.getElementById('quorum-req-text');
pct.textContent = totalPresentes.toFixed(1) + '%';
fill.style.width = Math.min(totalPresentes, 100) + '%';
var minReq = 33, label = 'Mínimo 33% (asamblea ordinaria)';
if (tipo === 'extraordinaria-abs') { minReq = 50; label = 'M\u00ednimo 50+1% (asamblea extraordinaria)'; }
if (tipo === 'extraordinaria-ref') { minReq = 66; label = 'Mínimo 66% (mayoría reforzada)'; }
var reqTxt = (tipo === 'extraordinaria-abs') ? 'más del 50%' : (minReq + '%');
req.textContent = label;
var alcanzaQuorum = (tipo === 'extraordinaria-abs') ? (totalPresentes > 50) : (totalPresentes >= minReq);
railQuorum(totalPresentes, alcanzaQuorum, alcanzaQuorum
  ? 'Se constituye: supera el ' + reqTxt + ' que exige la ley.'
  : 'No alcanza: se requiere ' + reqTxt + ' de los derechos.');
if (alcanzaQuorum) {
fill.className = 'quorum-fill';
status.innerHTML = '<strong>Quórum de constitución OK</strong> — '
+ totalPresentes.toFixed(1) + '% de derechos presentes en la asamblea';
status.style.color = '#1e6e4a';
} else {
fill.className = 'quorum-fill fail';
status.innerHTML = '<strong>Quórum insuficiente:</strong> '
+ totalPresentes.toFixed(1) + '% — se requiere ' + reqTxt + ' para constituirse';
status.style.color = '#B23A2E';
}
var boxAcuerdos = document.getElementById('quorum-acuerdos-box');
if (!boxAcuerdos) return;
if (tipo === 'ordinaria') {
boxAcuerdos.style.display = 'flex';
var fillA = document.getElementById('quorum-acuerdos-fill');
var pctA = document.getElementById('quorum-acuerdos-pct');
var txtA = document.getElementById('quorum-acuerdos-text');
if (countHabil === 0) {
txtA.textContent = 'Ingrese copropietarios habiles para calcular';
pctA.textContent = '--';
fillA.style.width = '0%';
} else {
var votosMinimos = Math.floor(countHabil / 2) + 1;
fillA.style.width = '50%';
pctA.textContent = votosMinimos + ' votos';
txtA.innerHTML =
'Base para votación: <strong>' + countHabil + '</strong> asistente' + (countHabil === 1 ? '' : 's') + ' h\u00e1bile' + (countHabil === 1 ? '' : 's') + ' presente' + (countHabil === 1 ? '' : 's') + '. '
+ 'Se requieren al menos <strong>' + votosMinimos + ' voto' + (votosMinimos === 1 ? '' : 's') + '</strong> a favor.';
}
} else {
boxAcuerdos.style.display = 'flex';
var fillA2 = document.getElementById('quorum-acuerdos-fill');
var pctA2 = document.getElementById('quorum-acuerdos-pct');
var txtA2 = document.getElementById('quorum-acuerdos-text');
var subtA = boxAcuerdos.querySelector('div:last-of-type');
if (subtA) {
subtA.textContent = tipo === 'extraordinaria-abs'
? '50+1% de derechos del condominio \u00b7 Art. 15 Ley 21.442'
: 'Al menos 66% de derechos del condominio · Art. 15 Ley 21.442';
}
if (totalHabil === 0) {
txtA2.textContent = 'Ingrese copropietarios hábiles para calcular';
pctA2.textContent = '--';
if (fillA2) fillA2.style.width = '0%';
} else {
var minExtPct = (tipo === 'extraordinaria-abs') ? 50 : 66;
var habOk = (tipo === 'extraordinaria-abs') ? (totalHabil > 50) : (totalHabil >= minExtPct);
if (fillA2) {
fillA2.style.width = Math.min(totalHabil, 100) + '%';
fillA2.className = 'quorum-fill' + (habOk ? '' : ' fail');
}
pctA2.textContent = totalHabil.toFixed(1) + '%';
txtA2.innerHTML =
'Derechos h\u00e1biles para adopci\u00f3n de acuerdos: '
+ '<strong>' + totalHabil.toFixed(1) + '%</strong> del total del condominio. '
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
const [y,m,d] = str.split('-');
const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
return parseInt(d) + ' de ' + meses[parseInt(m)-1] + ' de ' + y;
}
// En Chile el separador decimal es la coma. Se usa solo para texto que se
// muestra o se imprime: los valores que luego se releen con parseFloat
// (dataset de las tarjetas de votacion) siguen con punto.
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
const medioNotif = _pvau('medio-notif');
const doc24 = _pvau('doc24');
const grabacion = _pvau('grabacion');
const notario = _pvau('notario');
const notarioNombre = escapeHtml(_pvau('notario-nombre'));
const obs = escapeHtml(_pvau('observaciones'));
let asistentesRows = '';
let totalHabil = 0; 
let totalPresentes = 0; 
let countHabil = 0; 
let asistIdx = 0;
document.querySelectorAll('#asistentes-tbody tr').forEach(function(row) {
const asisteEl = row.querySelector('.asiste');
const asiste = asisteEl ? asisteEl.value === 'si' : true;
const unidad = row.querySelector('.unidad') ? row.querySelector('.unidad').value : '';
const nombre = row.querySelector('.nombre-asist')? row.querySelector('.nombre-asist').value: '';
const der = parseFloat(row.querySelector('.derechos')
? row.querySelector('.derechos').value : 0) || 0;
const habil = row.querySelector('.habil') && row.querySelector('.habil').value === 'si'
? 'S\u00ed' : 'No';
const rep = row.querySelector('.representante')
? row.querySelector('.representante').value : '';

if (asiste) {
totalPresentes += der;
if (habil === 'S\u00ed') { totalHabil += der; countHabil++; }
}
asistIdx++;
const asisteCell = asiste
? '<td style="text-align:center;color:#1a6e3c;font-weight:500">\u2713 S\u00ed</td>'
: '<td style="text-align:center;color:#999999">\u2014 No</td>';
const rowStyle = asiste ? '' : ' style="color:#aaaaaa;background:#f9f9f9;"';
asistentesRows +=
'<tr' + rowStyle + '><td>' + asistIdx + '</td><td>' + escapeHtml(unidad) + '</td><td>' + escapeHtml(nombre) +
'</td><td style="text-align:center">' + _pctCL(der) + ' %</td>' +
'<td style="text-align:center">' + habil + '</td>' + asisteCell +
'<td>' + escapeHtml(rep) + '</td></tr>';
});
totalPresentes = Math.min(totalPresentes, 100);
totalHabil = Math.min(totalHabil, 100);
let quorumMin = 33;
if (tipo === 'extraordinaria-abs') quorumMin = 50;
if (tipo === 'extraordinaria-ref') quorumMin = 66;
const quorumOk = (tipo === 'extraordinaria-abs') ? (totalPresentes > 50) : (totalPresentes >= quorumMin);
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
const pvotFavor = pc.dataset.votFavor || '';
const pvotContra= pc.dataset.votContra || '';
const pvotAbst = pc.dataset.votAbst || '';
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
if (esOrdinaria) {
var favNum = parseInt(pvotFavor, 10) || 0;
var conNum = parseInt(pvotContra, 10) || 0;
var absNum = parseInt(pvotAbst, 10) || 0;
votText += 'A favor: <strong>' + _xckaf(favNum) + '</strong>. ';
votText += 'En contra: <strong>' + _xckaf(conNum) + '</strong>. ';
votText += 'Abstenci\u00f3n: <strong>' + _xckaf(absNum) + '</strong>.</p>';
} else {
var favPct = parseFloat(pvotFavor) || 0;
var conPct = parseFloat(pvotContra) || 0;
var absPct = parseFloat(pvotAbst) || 0;
votText += 'A favor: <strong>' + _pctCL(favPct) + ' % de los derechos</strong>. ';
votText += 'En contra: <strong>' + _pctCL(conPct) + ' % de los derechos</strong>. ';
votText += 'Abstenci\u00f3n: <strong>' + _pctCL(absPct) + ' % de los derechos</strong>.</p>';
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
var notarioTipo = _pvau('notario-tipo') || 'Notario P\u00fablico';
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
'<p>Los derechos presentes en la asamblea alcanzan el <strong>' + _pctCL(totalPresentes) + ' %</strong> del total del condominio. ' +
(quorumOk
? 'Con ello se cumple el qu\u00f3rum de constituci\u00f3n exigido (m\u00ednimo ' + quorumMin + '%). '
+ 'La sesi\u00f3n fue v\u00e1lidamente constituida por <strong>' + presidenteNom + '</strong> a las <strong>' + horaInicio + ' horas</strong>.'
: 'Este porcentaje <strong>no alcanza</strong> el m\u00ednimo de ' + quorumMin + '% requerido para constituir la asamblea.') +
'</p>' +
(esOrdinaria
? '<p>Para efectos de la adopci\u00f3n de acuerdos, éstos se computan sobre la base de los '
+ '<strong>' + countHabil + '</strong> asistentes h\u00e1biles, '
+ 'conforme al art\u00edculo 15 de la Ley N\u00b0\u00a021.442.'
+ (notario === 'Si' && notarioNombre
? ' Actu\u00f3 como ' + (_pvau('notario-tipo') || 'Ministro de Fe') + ' <strong>' + notarioNombre + '</strong>.'
: '') + '</p></div>'
: '<p>Para efectos de la adopci\u00f3n de acuerdos, se consideran \u00fanicamente los derechos '
+ 'correspondientes a copropietarios h\u00e1biles: <strong>' + _pctCL(totalHabil) + ' %</strong> '
+ 'de los derechos del condominio.'
+ (notario === 'Si' && notarioNombre
? ' Actu\u00f3 como ' + (_pvau('notario-tipo') || 'Ministro de Fe') + ' <strong>' + notarioNombre + '</strong>.'
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
firmasHTML +
(typeof _actaPagada === 'function' && _actaPagada()
  ? '<p style="font-size:11px;color:#333;text-align:center;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;line-height:1.55">' +
    '<strong style="display:block;font-size:11.5px;color:#8B0000;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">' +
    'ACTA \u2116 ' + (_actaFolio || '') + ' \u2014 CONSERVE EL ARCHIVO ORIGINAL' +
    '</strong>' +
    '<span style="font-style:italic;color:#555">' +
    'Este documento fue finalizado en actascopropiedad.cl y quedó registrado bajo el folio indicado. Se conserva una copia en el servidor del proveedor, accesible únicamente por la cuenta que lo elaboró y eliminable por ella en cualquier momento. ' +
    'Si se utilizó la votación en vivo, el padrón y los votos se procesan de forma temporal en un servidor cifrado y se eliminan al terminar la asamblea. ' +
    'Conserve el archivo original para sus respaldos.' +
    '</span></p>'
  : '<p style="font-size:11px;color:#333;text-align:center;margin-top:24px;border-top:1px solid #ddd;padding-top:12px;line-height:1.55">' +
    '<strong style="display:block;font-size:11.5px;color:#8B0000;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">' +
    'BORRADOR — ACTA NO FINALIZADA, SIN FOLIO' +
    '</strong>' +
    '<span style="font-style:italic;color:#555">' +
    'Este documento es un <strong>borrador</strong>: todavía no ha sido finalizado, no tiene folio y no debe presentarse como acta de la asamblea. Para finalizarlo, vuelva al Paso 6 y presione <strong>Finalizar y guardar como PDF</strong>. ' +
    'Si se utilizó la votación en vivo, el padrón y los votos se procesan de forma temporal en un servidor cifrado y se eliminan al terminar la asamblea. ' +
    'Conserve el archivo original para sus respaldos.' +
    '</span></p>');
acta = _ctgdc(acta);
const container = document.getElementById('acta-content');
if (container) container.innerHTML = acta;
}
function _actaDocumento(conAviso) {
generateActa();
const container = document.getElementById('acta-content');
if (!container || container.innerHTML.trim() === '') {
alert('Complete los datos del acta antes de descargar el archivo.');
return;
}
const nombreRaw = _pvau('condo-nombre') || 'acta';
const nombreCondo = nombreRaw.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/ +/g, '_');
const fecha = _pvau('fecha-sesion') || 'sin_fecha';
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
const doc =
'<!DOCTYPE html>\n<html lang="es">\n<head>\n' +
'<meta charset="UTF-8">\n' +
'<title>Acta ' + nombreCondo + ' ' + fecha + '</title>\n' +
'<style>\n' + css + '\n</style>\n' +
'</head>\n<body>\n' +
(conAviso ? aviso + '\n' : '') +
container.innerHTML + '\n\n\n</body>\n</html>';
return { html: doc, nombre: 'acta_' + nombreCondo + '_' + fecha };
}

// El boton decia "Guardar como PDF" y bajaba un .html con un cartel pidiendole
// al usuario que apretara Ctrl+P. Ahora abre el cuadro de impresion en un
// iframe con el mismo CSS: el destino "Guardar como PDF" del navegador entrega
// un PDF de verdad, con texto seleccionable y paginado A4.
function savePDF() {
  if (typeof revisarConsistencia === 'function') {
    var _adv = revisarConsistencia().filter(function (x) { return !x.ok; });
    if (_adv.length && !confirm('La revisi\u00f3n de consistencia encontr\u00f3 ' + _adv.length + ' advertencia(s):\n\n\u2022 ' + _adv.map(function (x) { return x.texto; }).join('\n\u2022 ') + '\n\n\u00bfFinalizar de todos modos?')) return;
  }
  var btn = document.querySelector('.print-btn .btn-gold');
  if (btn) btn.disabled = true;
  showLoading('Finalizando el acta…', 'Estamos cerrando el documento y asignándole su folio.');

  actaFinalizar(function (err) {
    if (err) {
      if (btn) btn.disabled = false;
      hideLoading();
      if (err === 'SIN_PAGO') {
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
  derNum = derRaw;
} else {
  var derStr = String(derRaw || '').trim();
  
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(derStr)) {
    derStr = derStr.replace(/\./g, '').replace(',', '.');
  } else {
    derStr = derStr.replace(',', '.');
  }
  derNum = parseFloat(derStr) || 0;
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
tr.querySelector('.derechos').value = derNum || '';
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
console.warn('Error al importar fila ' + (i+1) + ':', e.message, fila);
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
  var vistos = {}, repetidos = [];
  filas.forEach(function(tr) {
    var v = function(sel){ var e = tr.querySelector(sel); return e ? String(e.value).trim() : ''; };
    suma += parseFloat(v('.derechos')) || 0;
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
  m += '\nSuma de derechos: ' + suma.toFixed(2).replace('.', ',') + '%';
  m += (Math.abs(suma - 100) <= 0.5)
     ? '  ✓'
     : '  ← revise: debería sumar 100%';

  var avisos = [];
  if (errores > 0)       avisos.push(errores + ' fila(s) no se pudieron leer y se omitieron.');
  if (sinRut > 0)        avisos.push(sinRut + ' unidad(es) sin RUT: no podrán votar en la votación en vivo.');
  if (repetidos.length)  avisos.push(repetidos.length + ' RUT repetido(s): revise que no haya unidades duplicadas.');
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
    ['Hábil', 'Escriba Sí o No. Es hábil quien está al día en sus obligaciones económicas con el condominio, o quien mantiene vigente y al día un convenio de pago (recupera la habilidad desde la primera cuota pagada). Solo los hábiles votan (art. 21, Ley N° 21.442); los inhábiles asisten pero no votan. Esta calidad la acredita la administración.', 'Sí'],
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
function obtenerAsistentesHabiles() {
var result = [];
document.querySelectorAll('#asistentes-tbody tr').forEach(function(row) {
var habEl = row.querySelector('.habil');
var derEl = row.querySelector('.derechos');
var nomEl = row.querySelector('.nombre-asist');
var uniEl = row.querySelector('.unidad');
if (!habEl || habEl.value !== 'si') return;
result.push({
unidad: uniEl ? uniEl.value.trim() : '',
nombre: nomEl ? nomEl.value.trim() : '',
derechos: parseFloat(derEl ? derEl.value : 0) || 0
});
});
return result;
}
function calcularResultadoVotacion(cfg) {
var habiles = obtenerAsistentesHabiles();
var sistema = cfg.sistemaComputo || 'asistentes';
var mayoria = cfg.tipoMayoria || 'abs_asistentes';
var totalPersonas = habiles.length;
var totalDerechos = habiles.reduce(function(s, a) { return s + a.derechos; }, 0);
var favorPersonas = 0, contraPersonas = 0, abstPersonas = 0, sinVotarPersonas = 0;
var favorDerechos = 0, contraDerechos = 0, abstDerechos = 0;
habiles.forEach(function(a) {
switch (a.voto) {
case 'favor':
favorPersonas++; favorDerechos += a.derechos; break;
case 'contra':
contraPersonas++; contraDerechos += a.derechos; break;
case 'abstencion':
abstPersonas++; abstDerechos += a.derechos; break;
default:
sinVotarPersonas++;
}
});
var baseValor, aFavor, enContra, abstenciones;
if (sistema === 'asistentes') {
baseValor = totalPersonas;
aFavor = favorPersonas;
enContra = contraPersonas;
abstenciones = abstPersonas;
} else {
baseValor = totalDerechos;
aFavor = favorDerechos;
enContra = contraDerechos;
abstenciones = abstDerechos;
}
var umbral, comparador, descripcionMayoria;
switch (mayoria) {
case 'abs_asistentes':
umbral = totalPersonas / 2;
comparador = '>';
descripcionMayoria = 'Mayor\u00eda absoluta de asistentes h\u00e1biles (' + totalPersonas + ' presentes \u2192 m\u00ednimo ' + (Math.floor(totalPersonas / 2) + 1) + ' votos)';
break;
case 'abs_derechos':
umbral = 51;
comparador = '>=';
descripcionMayoria = 'Mayor\u00eda absoluta de derechos del condominio (50+1% de 100% \u2192 m\u00ednimo 51%)';
break;
case 'dos_tercios':
umbral = 66;
comparador = '>=';
descripcionMayoria = '66% de los derechos del condominio (66% de 100% → umbral 66%)';
break;
default:
umbral = baseValor / 2;
comparador = '>';
descripcionMayoria = 'Mayoría absoluta';
}
var aprobado = false;
if (comparador === '>') {
aprobado = (aFavor > umbral);
} else {
aprobado = (aFavor >= umbral);
}
var unidad = (sistema === 'asistentes') ? ' asistentes' : '%';
var NL = String.fromCharCode(10);
var detalle =
'Base de c\u00e1lculo: ' + (sistema === 'asistentes'
? totalPersonas + ' asistentes h\u00e1biles'
: totalDerechos.toFixed(2) + '% derechos h\u00e1biles') + NL +
'Mayor\u00eda requerida: ' + descripcionMayoria + NL +
'Resultado: ' +
aFavor + (sistema === 'derechos' ? '%' : '') + ' a favor - ' +
enContra + (sistema === 'derechos' ? '%' : '') + ' en contra - ' +
abstenciones + (sistema === 'derechos' ? '%' : '') + ' abstenci\u00f3n' +
(sinVotarPersonas > 0 ? ' (' + sinVotarPersonas + ' sin votar)' : '') + NL +
'Conclusi\u00f3n: ' + (aprobado ? 'SE APRUEBA' : 'NO SE APRUEBA');
return {
baseTipo: sistema,
baseValor: baseValor,
aFavor: aFavor,
enContra: enContra,
abstenciones: abstenciones,
sinVotar: sinVotarPersonas,
umbral: umbral,
comparador: comparador,
aprobado: aprobado,
detalle: detalle,
descripcionMayoria: descripcionMayoria,
totalPersonas: totalPersonas,
totalDerechos: totalDerechos,
unidad: (sistema === 'asistentes') ? '' : '%'
};
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
var prevPrefs = {};
tbody.querySelectorAll('tr').forEach(function(row) {
var key = row.dataset.key;
var sel = row.querySelector('.pref-select');
if (key && sel) prevPrefs[key] = sel.value;
});
tbody.innerHTML = '';
var hayHabiles = false;
document.querySelectorAll('#asistentes-tbody tr').forEach(function(row) {
var habEl = row.querySelector('.habil');
var derEl = row.querySelector('.derechos');
var nomEl = row.querySelector('.nombre-asist');
var uniEl = row.querySelector('.unidad');
var asisteEl = row.querySelector('.asiste');
if (!habEl) return;
var esAsiste = asisteEl ? asisteEl.value === 'si' : true;
if (!esAsiste) return; 
var esHabil = habEl.value === 'si';
var nombre = nomEl ? nomEl.value.trim() : '';
var unidad = uniEl ? uniEl.value.trim() : '';
var rutEl = row.querySelector('.rut-asist');
var rutAsist = rutEl ? rutEl.value.trim() : '';
var derechos = parseFloat(derEl ? derEl.value : 0) || 0;
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
function _jfg(n) {
var tbody = document.getElementById('pvot-rows-' + n);
if (!tbody) return;
var tipoAsm = document.getElementById('tipo-asamblea') ? document.getElementById('tipo-asamblea').value : 'ordinaria';
var mayoria = (tipoAsm === 'extraordinaria-ref') ? 'dos_tercios' : ((tipoAsm === 'extraordinaria-abs') ? 'abs_derechos' : 'abs_asistentes');
var totalDer = 0, favorDer = 0, contraDer = 0, abstDer = 0, sinReg = 0;
var totalHab = 0, favorHab = 0, contraHab = 0, abstHab = 0;
tbody.querySelectorAll('tr').forEach(function(row) {
if (row.dataset.habil !== 'si') return;
var der = parseFloat(row.dataset.derechos) || 0;
var sel = row.querySelector('.pref-select');
var pref = sel ? sel.value : 'sin_reg';
totalDer += der; totalHab++;
if (pref === 'favor') { favorDer += der; favorHab++; }
else if (pref === 'contra') { contraDer += der; contraHab++; }
else if (pref === 'abst') { abstDer += der; abstHab++; }
else { sinReg++; }
});
var rfEl = document.getElementById('pvot-rf-' + n);
var rcEl = document.getElementById('pvot-rc-' + n);
var raEl = document.getElementById('pvot-ra-' + n);
if (!rfEl) return;
var sistema = (mayoria === 'abs_asistentes') ? 'asistentes' : 'derechos';
if (sistema === 'asistentes') {
rfEl.textContent = favorHab;
rcEl.textContent = contraHab;
raEl.textContent = abstHab;
} else {
rfEl.textContent = _pctCL(favorDer) + ' %';
rcEl.textContent = _pctCL(contraDer) + ' %';
raEl.textContent = _pctCL(abstDer) + ' %';
}
var umbral, aprobado, umbralDesc, baseDesc;
if (sistema === 'asistentes') {
var base = totalHab;
umbral = Math.floor(base / 2) + 1;
aprobado = (favorHab >= umbral);
baseDesc = 'Base: ' + base + ' asistentes hábiles';
umbralDesc = 'Mínimo requerido: ' + umbral + ' votos a favor';
} else {
if (mayoria === 'abs_asistentes' || mayoria === 'abs_derechos') {
if (mayoria === 'abs_asistentes') {
umbral = totalDer / 2;
aprobado = (favorDer > umbral);
baseDesc = 'Base: ' + totalDer.toFixed(2) + '% derechos h\u00e1biles';
umbralDesc = 'Mayor\u00eda absoluta: m\u00e1s de ' + umbral.toFixed(2) + '% a favor';
} else {
umbral = 51;
aprobado = (favorDer >= umbral);
baseDesc = 'Base: 100% derechos del condominio';
umbralDesc = '50+1% de derechos del condominio: al menos 51% a favor';
}
} else {
umbral = 66;
aprobado = (favorDer >= umbral);
baseDesc = 'Base: 100% derechos del condominio';
umbralDesc = '66% de derechos del condominio: al menos 66% a favor';
}
}
var detEl = document.getElementById('pvot-rdet-' + n);
var conclEl = document.getElementById('pvot-rconcl-' + n);
var haySinReg = (sinReg > 0);
if (detEl) {
var detalle = baseDesc + ' · ' + umbralDesc;
if (haySinReg) detalle += ' · ' + sinReg + ' asistente(s) sin registrar';
detEl.textContent = detalle;
}
if (conclEl) {
if (haySinReg) {
conclEl.className = 'pvr-conclusion pendiente';
conclEl.textContent = 'Faltan ' + sinReg + ' preferencia(s) por registrar';
} else if (totalHab === 0) {
conclEl.className = 'pvr-conclusion pendiente';
conclEl.textContent = 'Sin asistentes hábiles';
} else if (aprobado) {
conclEl.className = 'pvr-conclusion aprobado';
conclEl.textContent = 'ACUERDO APROBADO';
} else {
conclEl.className = 'pvr-conclusion rechazado';
conclEl.textContent = 'ACUERDO NO APROBADO';
}
}
var card = document.getElementById('punto-' + n);
if (card) {
card.dataset.votFavor = sistema === 'asistentes' ? favorHab : favorDer.toFixed(2);
card.dataset.votContra = sistema === 'asistentes' ? contraHab : contraDer.toFixed(2);
card.dataset.votAbst = sistema === 'asistentes' ? abstHab : abstDer.toFixed(2);
card.dataset.votBase = baseDesc;
card.dataset.votUmbral = umbralDesc;
card.dataset.votAprobado= (totalHab > 0 && !haySinReg) ? (aprobado ? 'si' : 'no') : 'pendiente';
card.dataset.votUnidad = sistema === 'asistentes' ? 'votos' : '%';
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
function _xckaf(n) {
var num = parseInt(n, 10);
return isNaN(num) ? (n + ' votos') : (num === 1 ? '1 voto' : num + ' votos');
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

function _captureFieldsSnapshot() {
  var snap = { fields: {}, asistentes: [], puntos: [] };
  var isDyn = function(id) {
    return /^asist-\d+-/.test(id) || /^p\d+-/.test(id) || /^pvot-/.test(id) || /^firm-\d+-/.test(id);
  };
  
  document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function(el) {
    if (!el.id || isDyn(el.id)) return;
    snap.fields[el.id] = el.value;
  });
  
  var modAct = document.querySelector('#step-1 .toggle-btn.active');
  if (modAct) snap.modalidad = modAct.textContent.trim();

  if (typeof firmSnapshot === 'function') snap.firmantes = firmSnapshot();
  
  document.querySelectorAll('#asistentes-tbody tr').forEach(function(row) {
    var g = function(sel) { var e = row.querySelector(sel); return e ? e.value : ''; };
    snap.asistentes.push({
      unidad: g('.unidad'), nombre: g('.nombre-asist'), rut: g('.rut-asist'), derechos: g('.derechos'),
      habil: g('.habil'), asiste: g('.asiste'), rep: g('.representante')
    });
  });
  
  document.querySelectorAll('.punto-card').forEach(function(card) {
    var m = (card.id || '').match(/^punto-(\d+)$/);
    var n = m ? m[1] : null;
    var byId = function(suf) { var e = n && document.getElementById('p' + n + '-' + suf); return e ? e.value : ''; };
    var votos = {};
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
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function() {
    try {
      railExpediente();
      var snap = _captureFieldsSnapshot();
      snap.savedAt = new Date().toISOString();
      // Junto al borrador va el identificador de la fila que le corresponde
      // en la cuenta. Sin esto, al recargar y restaurar, el acta se guardaba
      // como una fila nueva y quedaban duplicados.
      snap.actaId = _actaId;
      snap.actaFolio = _actaFolio;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
      _showSaveIndicator();
      actaSincronizar();
    } catch (e) {
      console.warn('No se pudo auto-guardar:', e);
    }
  }, 600);
}

function _showSaveIndicator() {
  var el = document.getElementById('save-indicator');
  if (!el) return;
  el.classList.add('show');
  if (_saveIndicatorTimer) clearTimeout(_saveIndicatorTimer);
  _saveIndicatorTimer = setTimeout(function() { el.classList.remove('show'); }, 1800);
}

function _restoreSnapshot(snap) {
  if (!snap) return false;
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
    });

    
    var f = snap.fields || {};
    Object.keys(f).forEach(function(id) {
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
          if (sel && p.votos[r.dataset.key] !== undefined) {
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

function _tryRestore() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var snap = JSON.parse(raw);
    if (!snap || !snap.savedAt) return;
    var when = new Date(snap.savedAt).toLocaleString('es-CL');
    if (confirm('Encontramos datos de su última sesión (' + when + ').\n\n¿Desea restaurarlos para continuar donde quedó?')) {
      _restoreSnapshot(snap);
      railExpediente();
      // Se retoma la MISMA acta, no una copia: el borrador local trae el
      // identificador de su fila en la cuenta.
      _actaId = snap.actaId || null;
      _actaFolio = snap.actaFolio || null;
      if (_actaFolio) {
        _nubeEstado('Acta ' + _actaFolio + ', ya finalizada.', 'ok');
      } else if (_actaId) {
        _nubeEstado('Retomando el acta guardada en su cuenta.', 'ok');
      }
      actaSincronizar();
    } else {
      // Empieza de cero. El acta anterior queda en su cuenta, intacta.
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) { console.warn('Restore error:', e); }
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


window.addEventListener('load', function() {
  // Nada de esto ocurre sin sesion: exigirSesion abre el cajon sin salida y
  // solo llama de vuelta cuando la persona entro.
  if (window.Cuenta && Cuenta.exigirSesion) {
    Cuenta.exigirSesion({
      titulo: 'Entre para armar su acta',
      sub: 'Con su cuenta guardamos su avance, le enviamos el comprobante y puede volver a sus asambleas.'
    }, function () {
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
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    var snap = JSON.parse(raw);
    if (!snap) return;
    snap.actaId = _actaId;
    snap.actaFolio = _actaFolio;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch (e) { /* sin borrador local no hay nada que anotar */ }
}

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
  if (!window.Cuenta || !Cuenta.cliente()) return;
  if (_guardarTimer) clearTimeout(_guardarTimer);
  _guardarTimer = setTimeout(function () {
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

    var c = Cuenta.cliente();
    var p = _actaId
      ? c.from('actas_guardadas').update(fila).eq('id', _actaId).select('id')
      : c.from('actas_guardadas').insert(fila).select('id');
    p.then(function (r) {
      if (r.error) {
        var m = String(r.error.message || '');
        _nubeEstado(/relation|does not exist|schema cache/i.test(m)
          ? 'El guardado en la cuenta todavía no está habilitado. Su acta sigue a salvo en este equipo.'
          : /tope_de_actas/.test(m)
            ? 'Llegó al máximo de 100 actas guardadas. Borre alguna desde su panel.'
            : 'No pudimos guardar en su cuenta. Su acta sigue a salvo en este equipo.', 'err');
        return;
      }
      // Un update que no tocó ninguna fila significa que esa acta ya no
      // está: la borraron desde el panel, o es de otra cuenta. Se vuelve a
      // crear en vez de perder lo escrito.
      if (_actaId && r.data && r.data.length === 0) {
        _actaId = null;
        _actaFolio = null;
        actaSincronizar();
        return;
      }
      if (r.data && r.data[0]) { _actaId = r.data[0].id; _recordarIdEnBorrador(); }
      _nubeEstado('Guardada en su cuenta a las ' +
        new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }) + '.', 'ok');
    }, function () {
      _nubeEstado('No pudimos guardar en su cuenta. Su acta sigue a salvo en este equipo.', 'err');
    });
  }, 1200);
}

function actaCargarGuardada(id) {
  if (!window.Cuenta || !Cuenta.cliente()) return;
  Cuenta.cliente().from('actas_guardadas').select('id,contenido,folio,pagada').eq('id', id).single()
    .then(function (r) {
      if (r.error || !r.data) return;
      _actaId = r.data.id;
      _actaFolio = r.data.folio || null;
      _recordarIdEnBorrador();
      try { _restoreSnapshot(r.data.contenido); } catch (e) {}
      _nubeEstado(_actaFolio ? 'Acta ' + _actaFolio + ', ya finalizada.' : 'Abierta desde su cuenta.', 'ok');
      if (typeof generateActa === 'function') generateActa();
    });
}

// ---------------------------------------------------------------------
//  Finalizar el acta
//  Aqui se cobra. La comprobacion vive en Postgres (ac_finalizar valida la
//  llave del pago), no en el navegador: un candado de navegador se abre
//  mirando el codigo fuente.
// ---------------------------------------------------------------------
function actaFinalizar(alTerminar) {
  if (_actaPagada()) { alTerminar(null); return; }

  var c = window.Cuenta && Cuenta.cliente();
  if (!c) { alTerminar('Sin conexión con el servicio. Reintente en un momento.'); return; }
  if (!_actaId) { alTerminar('Todavía estamos guardando su acta. Espere unos segundos y reintente.'); return; }

  var llave = '';
  try { llave = localStorage.getItem('acta_pago_llave') || ''; } catch (e) {}
  if (!llave) { alTerminar('SIN_PAGO'); return; }

  c.rpc('ac_finalizar', { p_acta: _actaId, p_llave: llave }).then(function (r) {
    if (r.error) {
      var m = String(r.error.message || '');
      if (/llave_invalida|llave_vencida|pago_ya_usado|pago_de_otra_cuenta/.test(m)) {
        try { localStorage.removeItem('acta_pago_llave'); } catch (e) {}
        alTerminar('SIN_PAGO');
        return;
      }
      if (/does not exist|schema cache|PGRST202/i.test(m)) {
        alTerminar('El cierre del acta todavía no está habilitado en el servidor.');
        return;
      }
      alTerminar('No pudimos finalizar el acta. Reintente en unos minutos.');
      return;
    }
    _actaFolio = (r.data && r.data.folio) || null;
    _recordarIdEnBorrador();
    generateActa();
    alTerminar(null);
  }, function () { alTerminar('No pudimos finalizar el acta. Revise su conexión.'); });
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
      (conocido ? ' hidden' : ' value="' + String(esperado).replace(/"/g, '&quot;') + '"') + '>';
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
  var num = function (v) { return parseFloat(String(v || '').replace(',', '.')) || 0; };

  // (a) Los derechos cargados suman 100.
  var suma = 0, presentes = 0;
  document.querySelectorAll('#asistentes-tbody tr').forEach(function (row) {
    var g = function (sel) { var e = row.querySelector(sel); return e ? e.value : ''; };
    var d = num(g('.derechos'));
    suma += d;
    if (String(g('.asiste')).toLowerCase() !== 'no') presentes += d;
  });
  var sumaOk = suma > 99.5 && suma < 100.5;
  items.push({ ok: sumaOk, texto: sumaOk
    ? 'Los derechos del padr\u00f3n suman ' + suma.toFixed(2).replace('.', ',') + ' %.'
    : 'Los derechos del padr\u00f3n suman ' + suma.toFixed(2).replace('.', ',') + ' % y debieran sumar 100 %.' });

  // (b) El quorum de constitucion del tipo elegido.
  var tipo = (document.getElementById('tipo-asamblea') || {}).value || '';
  var minReq = 33, cumple = presentes >= 33, etiqueta = '33 % (ordinaria, primera citaci\u00f3n)';
  if (tipo === 'extraordinaria-abs') { minReq = 50; cumple = presentes > 50; etiqueta = 'm\u00e1s del 50 %'; }
  if (tipo === 'extraordinaria-ref') { minReq = 66; cumple = presentes >= 66; etiqueta = '66 %'; }
  items.push({ ok: cumple, texto: (cumple
    ? 'Los derechos presentes (' + presentes.toFixed(2).replace('.', ',') + ' %) alcanzan el m\u00ednimo de '
    : 'Los derechos presentes (' + presentes.toFixed(2).replace('.', ',') + ' %) no alcanzan el m\u00ednimo de ') + etiqueta + '.' });

  // (c) Firmantes con nombre.
  var firmantes = firmLeer().filter(function (fr) { return fr.nombre; });
  var alt = firmAlternativa();
  if (firmantes.length === 0) {
    items.push({ ok: false, texto: 'No hay firmantes con nombre. La ley exige que firmen todos los miembros del comit\u00e9 o los copropietarios designados por la asamblea.' });
  } else if (alt === 'comite' && firmantes.length < 2) {
    items.push({ ok: false, texto: 'Hay un solo firmante y la alternativa elegida es "todos los miembros del comit\u00e9": revise si falta alguien.' });
  } else {
    items.push({ ok: true, texto: firmantes.length + ' firmante(s) registrado(s), en calidad de ' + (alt === 'designados' ? 'copropietarios designados por la asamblea.' : 'miembros del comit\u00e9 de administraci\u00f3n.') });
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
    items.push({ ok: true, texto: 'Seg\u00fan el tipo de sesi\u00f3n y los puntos de la tabla, no se detecta exigencia de notario.' });
  } else {
    items.push({ ok: notarioSi, texto: notarioSi
      ? 'La sesi\u00f3n exige la asistencia de un notario y su intervenci\u00f3n est\u00e1 registrada.'
      : 'Esta sesi\u00f3n exige la asistencia de un notario (art. 15) y no est\u00e1 registrada en el paso 5.' });
  }

  // (e) Cada punto sometido a acuerdo tiene resultado.
  var cards = document.querySelectorAll('.punto-card');
  var pendientes = 0;
  cards.forEach(function (pc) {
    if ((pc.dataset.requiere || 'si') === 'si' && (pc.dataset.votAprobado || 'pendiente') === 'pendiente') pendientes++;
  });
  if (!cards.length) {
    items.push({ ok: false, texto: 'La tabla no tiene puntos: un acta sin puntos tratados queda vac\u00eda.' });
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
  box.innerHTML =
    '<h3>Revisi\u00f3n de consistencia' + (advertencias ? ' \u00b7 ' + advertencias + ' advertencia(s)' : ' \u00b7 todo en orden') + '</h3>' +
    '<p class="rev-nota">Revisa los datos ingresados en esta acta. No verifica la citaci\u00f3n, los poderes ni la calidad de los datos del padr\u00f3n, y no certifica la validez legal de la asamblea.</p>' +
    items.map(function (x) {
      return '<div class="rev-item ' + (x.ok ? 'ok' : 'warn') + '"><span class="rev-ic">' + (x.ok ? '\u2713' : '\u26a0') + '</span><span>' + x.texto + '</span></div>';
    }).join('');
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

function hayPagoDelActa() {
  try { return !!localStorage.getItem(LLAVE_ACTA); } catch (e) { return false; }
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
  btn.disabled = true;
  var _t = btn.textContent;
  btn.textContent = 'Buscando\u2026';
  puertaMsg('');
  fetch('/api/pago/estado?orden=' + encodeURIComponent(orden))
    .then(function (r) { return r.json().catch(function () { return null; }); })
    .then(function (d) {
      btn.disabled = false; btn.textContent = _t;
      if (!d || d.estado !== 'pagado' || !d.llave) {
        puertaMsg('No encontramos un pago confirmado con ese n\u00famero. Si acaba de pagarlo, espere un momento y vuelva a intentar.', true);
        return;
      }
      if ((d.producto || 'acta') !== 'acta') {
        puertaMsg('Ese pago corresponde a una consulta por escrito, no a un acta de asamblea.', true);
        return;
      }
      try { localStorage.setItem(LLAVE_ACTA, d.llave); } catch (e) {}
      puertaMsg('Pago encontrado. Abriendo su acta\u2026');
      setTimeout(function () { location.reload(); }, 900);
    })
    .catch(function () {
      btn.disabled = false; btn.textContent = _t;
      puertaMsg('No pudimos consultar el pago. Revise su conexi\u00f3n e int\u00e9ntelo otra vez.', true);
    });
}

function revisarPuertaDePago() {
  var raiz = document.documentElement;
  raiz.classList.remove('acta-abierta');

  // La demostracion vive en localhost y trae su propio simulador de pagos:
  // ahi la puerta estorba, porque el pago es justamente lo que muestra.
  if (window.DEMOA || hayPagoDelActa()) {
    raiz.classList.add('acta-abierta');
    return;
  }
  document.title = 'Pague su acta antes de la asamblea \u00b7 actaviva';
}

// Se llama aqui mismo, no en DOMContentLoaded: este archivo se evalua al
// final del cuerpo, con el documento ya leido y antes de pintar. Esperar
// al evento dejaba un instante con el asistente a la vista.
revisarPuertaDePago();
