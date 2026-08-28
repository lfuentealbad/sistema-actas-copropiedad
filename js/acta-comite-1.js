/* =====================================================================
 *  actaviva · Acta de reunion del comite de administracion
 *
 *  Un documento por reunion: se escribe, se cierra -y ahi recibe su
 *  numero- y se descarga. Es GRATIS: la herramienta que se le regala a
 *  los comites para que el sistema los encuentre adentro cuando llegue
 *  la asamblea anual, que si se cobra.
 *
 *  Por eso aqui no hay llave, ni pasarela, ni producto: el folio no es
 *  comprobante de pago, es el numero del documento y la marca de que
 *  quedo cerrado. Lo escribe Postgres y nadie mas.
 *
 *  Tres cosas que conviene tener presentes al leer esto:
 *
 *  1) No hay manejadores en linea. El CSP no lleva 'unsafe-inline' en
 *     script-src: los botones se marcan con data-ac="funcion" y la
 *     funcion tiene que ser GLOBAL, declarada con function en el nivel
 *     superior. Con const no la encuentra el despachador.
 *
 *  2) No existe un padron de integrantes del comite. Los nombres viven
 *     dentro del acta que los menciona. Para no retipearlos, acTraerAnterior
 *     los copia desde la ultima acta del propio dueno; si esa acta se
 *     borra, no queda de donde copiar, que es lo correcto.
 *
 *  3) El unico cargo que la ley nombra es quien preside (art. 17). Los
 *     demas los define la comunidad, por eso el cargo es texto libre y
 *     'preside' va aparte, como una marca.
 * ===================================================================== */

var AC_BORRADOR = 'acta_comite_borrador';

var acId     = null;    // id de la fila en Postgres
var acFolio  = null;    // numero del acta: sin folio, es un borrador
var acReloj  = null;

var acGuardando = false;  // hay un guardado viajando
var acPendiente = false;  // se escribió algo mientras viajaba
var acEspera    = [];     // quienes esperan a que ese guardado termine

var acta = {
  condominio: '', direccion: '', fecha: '', hora: '', modalidad: 'presencial', lugar: '',
  total: 3,
  asistentes: [],
  puntos: [],
  cierre: ''
};


/* ─────────────────────────────────────────────────────────────────────
 *  Utilidades
 * ───────────────────────────────────────────────────────────────────── */

function acEsc(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function acNl(s) { return acEsc(s).replace(/\n/g, '<br>'); }
function $ac(id) { return document.getElementById(id); }
function acVal(id) { var e = $ac(id); return e ? e.value.trim() : ''; }
function acPon(id, v) { var e = $ac(id); if (e && v != null) e.value = v; }

function acFecha(iso) {
  if (!iso) return '';
  var p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + p[0];
}
function acFechaLarga(iso) {
  if (!iso) return '—';
  var m = ['enero','febrero','marzo','abril','mayo','junio',
           'julio','agosto','septiembre','octubre','noviembre','diciembre'];
  var p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return iso;
  return parseInt(p[2], 10) + ' de ' + m[parseInt(p[1], 10) - 1] + ' de ' + p[0];
}
function acHoy() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
}

function acAviso(texto, malo) {
  var el = $ac('guardado');
  if (!el) return;
  el.textContent = texto;
  el.classList.toggle('malo', !!malo);
  el.classList.add('ver');
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove('ver'); }, malo ? 4200 : 1700);
}
function acMensaje(donde, texto, clase) {
  var el = $ac(donde);
  if (!el) return;
  el.innerHTML = texto ? '<div class="msg ' + clase + '">' + acEsc(texto) + '</div>' : '';
}


/* ─────────────────────────────────────────────────────────────────────
 *  Recoger y pintar el formulario
 * ───────────────────────────────────────────────────────────────────── */

function acRecoger() {
  if (!$ac('condominio')) return;

  acta.condominio = acVal('condominio');
  acta.direccion  = acVal('direccion');
  acta.fecha      = acVal('fecha');
  acta.hora       = acVal('hora');
  acta.modalidad  = acVal('modalidad');
  acta.lugar      = acVal('lugar');
  acta.total      = parseInt(acVal('total-comite') || '3', 10);
  acta.cierre     = acVal('cierre');

  acta.asistentes = [];
  var filas = document.querySelectorAll('#asistentes tr');
  for (var i = 0; i < filas.length; i++) {
    var f = filas[i];
    var nombre = f.querySelector('.a-nombre');
    var cargo  = f.querySelector('.a-cargo');
    var pres   = f.querySelector('.a-preside');
    if (nombre && nombre.value.trim()) {
      acta.asistentes.push({
        nombre: nombre.value.trim(),
        cargo: cargo ? cargo.value.trim() : '',
        preside: !!(pres && pres.checked)
      });
    }
  }

  acta.puntos = [];
  var cajas = document.querySelectorAll('#puntos .punto');
  for (var j = 0; j < cajas.length; j++) {
    var c = cajas[j];
    var g = function (cl) { var e = c.querySelector(cl); return e ? e.value.trim() : ''; };
    var p = { materia: g('.p-materia'), tratado: g('.p-tratado'), acuerdo: g('.p-acuerdo') };
    if (p.materia || p.tratado || p.acuerdo) acta.puntos.push(p);
  }
}

function acPintarFormulario() {
  acPon('condominio', acta.condominio); acPon('direccion', acta.direccion);
  acPon('fecha', acta.fecha);           acPon('hora', acta.hora);
  acPon('modalidad', acta.modalidad);   acPon('lugar', acta.lugar);
  acPon('total-comite', String(acta.total || 3));
  acPon('cierre', acta.cierre);
  acPintarAsistentes();
  acPintarPuntos();
}


/* ─────────────────────────────────────────────────────────────────────
 *  Asistentes
 *
 *  El cargo es texto libre a proposito: la ley solo nombra a quien
 *  preside, y todo lo demas lo define cada comunidad.
 * ───────────────────────────────────────────────────────────────────── */

function acFilaAsistente(a) {
  a = a || {};
  // Los data-rotulo son los que la tabla usa como etiqueta cuando en el
  // teléfono deja de ser tabla y pasa a ser una ficha por persona.
  var tr = document.createElement('tr');
  tr.innerHTML =
    '<td data-rotulo="Nombre"><input type="text" class="a-nombre" value="' + acEsc(a.nombre) + '" placeholder="Nombre y apellido" aria-label="Nombre de quien asistió"></td>' +
    '<td data-rotulo="Cargo en el comité"><input type="text" class="a-cargo" list="cargos-sugeridos" value="' + acEsc(a.cargo) + '" placeholder="Integrante" aria-label="Cargo en el comité"></td>' +
    '<td class="preside-celda" data-rotulo="Preside la reunión">' +
      '<input type="radio" name="preside" class="a-preside"' + (a.preside ? ' checked' : '') +
      ' data-cambio="acQuorum" aria-label="Es presidente o presidenta del comité"></td>' +
    '<td class="quitar-celda"><button class="btn btn-d btn-sm" type="button" data-ac="acAsistenteQuitar" data-args="@" aria-label="Quitar a esta persona">✕</button></td>';
  return tr;
}

function acPintarAsistentes() {
  var cuerpo = $ac('asistentes');
  if (!cuerpo) return;
  cuerpo.innerHTML = '';
  var lista = acta.asistentes && acta.asistentes.length ? acta.asistentes : [{}, {}, {}];
  for (var i = 0; i < lista.length; i++) cuerpo.appendChild(acFilaAsistente(lista[i]));
  acQuorum();
}

function acAsistenteNuevo() {
  var cuerpo = $ac('asistentes');
  if (!cuerpo) return;
  cuerpo.appendChild(acFilaAsistente({}));
  acQuorum();
}

/* El administrador puede asistir, pero no integra el comite (art. 18):
   entra como invitado, sin contar para la mayoria. */
function acAgregarAdministrador() {
  var cuerpo = $ac('asistentes');
  if (!cuerpo) return;
  cuerpo.appendChild(acFilaAsistente({ nombre: '', cargo: 'Administrador/a (invitado)' }));
  var filas = cuerpo.querySelectorAll('tr');
  var ultima = filas[filas.length - 1];
  var n = ultima && ultima.querySelector('.a-nombre');
  if (n) n.focus();
  acQuorum();
}

function acAsistenteQuitar(btn) {
  var cuerpo = $ac('asistentes');
  if (!cuerpo || !btn || !btn.closest) return;
  var fila = btn.closest('tr');
  if (!fila) return;

  var nombre = fila.querySelector('.a-nombre');
  var quien = nombre && nombre.value.trim();
  if (quien && !confirm('¿Quitar a ' + quien + ' de la asistencia?')) return;

  fila.remove();
  if (!cuerpo.querySelectorAll('tr').length) cuerpo.appendChild(acFilaAsistente({}));
  acRecoger();
  acQuorum();
  acRefrescar();
}

/* Art. 17: los acuerdos se adoptan por la mitad mas uno de los INTEGRANTES
   del comite, no de los presentes. Los invitados no cuentan. */
/* Quién no cuenta para la mayoría.
 *
 *  El administrador no integra el comité (art. 18) y los invitados
 *  tampoco. Se reconocen por lo que diga su cargo. Es una regla frágil
 *  -alguien puede escribir «visita»-, y por eso el aviso de abajo dice
 *  con todas sus letras a quién dejó fuera: si se equivocó, se ve.
 *
 *  Vive en una sola función porque la usan el aviso y el acta; separadas
 *  se desincronizan y el documento termina contradiciendo a la pantalla.
 */
function acEsInvitado(cargo) {
  return /invitad|administrador|administradora|asesor|abogad|contador/i.test(cargo || '');
}

function acQuorum() {
  var el = $ac('quorum');
  if (!el) return;

  var total = parseInt(acVal('total-comite') || '3', 10);
  var integrantes = [], invitados = [], preside = false;

  var filas = document.querySelectorAll('#asistentes tr');
  for (var i = 0; i < filas.length; i++) {
    var nombre = filas[i].querySelector('.a-nombre');
    var cargo  = filas[i].querySelector('.a-cargo');
    var pres   = filas[i].querySelector('.a-preside');
    if (!nombre || !nombre.value.trim()) continue;
    if (acEsInvitado(cargo ? cargo.value : '')) invitados.push(nombre.value.trim());
    else integrantes.push(nombre.value.trim());
    if (pres && pres.checked) preside = true;
  }

  if (!integrantes.length && !invitados.length) { el.textContent = ''; el.className = 'quorum'; return; }

  var minimo = Math.floor(total / 2) + 1;
  var presentes = integrantes.length;

  var extra = '';
  if (invitados.length) {
    extra += ' No cuenta' + (invitados.length > 1 ? 'n' : '') + ' para la mayoría: ' +
             acEsc(invitados.join(', ')) + '.';
  }
  if (!preside) extra += ' Falta marcar al presidente/a.';

  // Antes decía cosas imposibles como «asisten 5 de 3 integrantes». Si hay
  // más asistentes que integrantes declarados, el que está mal es uno de
  // los dos números, y el usuario es quien sabe cuál.
  if (presentes > total) {
    el.className = 'quorum no';
    el.innerHTML = 'Anotó <strong>' + presentes + '</strong> integrantes presentes, pero declaró que el comité ' +
      'tiene ' + total + '. Corrija el número de arriba, o marque como invitado a quien no lo integre.' + extra;
    return;
  }

  if (presentes >= minimo) {
    el.className = 'quorum ok';
    el.innerHTML = '✓ Asisten <strong>' + presentes + '</strong> de ' + total +
      ' integrantes. Alcanza para adoptar acuerdos, que necesitan ' + minimo + '.' + extra;
  } else {
    el.className = 'quorum no';
    el.innerHTML = 'Asisten <strong>' + presentes + '</strong> de ' + total +
      ' integrantes. Para adoptar acuerdos se necesitan ' + minimo +
      '. Puede dejar constancia igual: el acta sirve para registrar lo tratado.' + extra;
  }
}


/* ─────────────────────────────────────────────────────────────────────
 *  Puntos de la reunion
 * ───────────────────────────────────────────────────────────────────── */

/* Cada campo lleva su id propio para que el <label> lo pueda apuntar con
 * for=. Sin eso, un lector de pantalla anuncia «cuadro de edición» y nada
 * más, que en un formulario de doce temas es quedarse a ciegas.
 * El contador nunca se reinicia: si se numerara por posición, quitar un
 * tema y agregar otro produciría dos campos con el mismo id. */
var acSeq = 0;

function acCajaPunto(p, n) {
  p = p || {};
  var s = ++acSeq;
  var div = document.createElement('div');
  div.className = 'punto';
  div.innerHTML =
    '<div class="punto-cab">' +
      '<span class="punto-n">Tema ' + n + '</span>' +
      '<button class="btn btn-d btn-sm" type="button" style="margin-left:auto" ' +
        'data-ac="acPuntoQuitar" data-args="@" aria-label="Quitar el tema ' + n + '">Quitar</button>' +
    '</div>' +
    '<div class="punto-cuerpo">' +
      '<div class="campo">' +
        '<label for="p-materia-' + s + '">De qué se trató</label>' +
        '<input type="text" id="p-materia-' + s + '" class="p-materia" value="' + acEsc(p.materia) + '" placeholder="Presupuesto para pintar la fachada">' +
      '</div>' +
      '<div class="campo">' +
        '<label for="p-tratado-' + s + '">Lo conversado <span style="font-weight:400;color:var(--c-text-3)">(opcional)</span></label>' +
        '<textarea id="p-tratado-' + s + '" class="p-tratado" placeholder="Se revisaron tres presupuestos. El más bajo no incluye andamios.">' + acEsc(p.tratado) + '</textarea>' +
      '</div>' +
      '<div class="campo">' +
        '<label for="p-acuerdo-' + s + '">El acuerdo</label>' +
        '<textarea id="p-acuerdo-' + s + '" class="p-acuerdo" placeholder="Se acuerda contratar a la empresa X por $2.400.000 e instruir al administrador firmar el contrato esta semana.">' + acEsc(p.acuerdo) + '</textarea>' +
      '</div>' +
    '</div>';
  return div;
}

function acPintarPuntos() {
  var caja = $ac('puntos');
  if (!caja) return;
  caja.innerHTML = '';
  var lista = acta.puntos && acta.puntos.length ? acta.puntos : [{}];
  for (var i = 0; i < lista.length; i++) caja.appendChild(acCajaPunto(lista[i], i + 1));
}

function acPuntoNuevo() {
  acRecoger();
  var caja = $ac('puntos');
  if (!caja) return;
  var n = caja.querySelectorAll('.punto').length + 1;
  caja.appendChild(acCajaPunto({}, n));
  var nuevo = caja.lastChild.querySelector('.p-materia');
  if (nuevo) nuevo.focus();
}

function acPuntoQuitar(btn) {
  if (!btn || !btn.closest) return;
  var caja = $ac('puntos');
  var punto = btn.closest('.punto');
  if (!punto || !caja) return;

  var tieneAlgo = punto.querySelector('.p-materia').value.trim() ||
                  punto.querySelector('.p-acuerdo').value.trim();
  if (tieneAlgo && !confirm('¿Quitar este tema del acta?')) return;

  punto.remove();
  acRecoger();
  if (!acta.puntos.length) { acta.puntos = [{}]; }
  acPintarPuntos();
  acRefrescar();
}


/* ─────────────────────────────────────────────────────────────────────
 *  El acta: vista previa y documento
 * ───────────────────────────────────────────────────────────────────── */

function acCuerpoActa() {
  var modalidades = { presencial: 'de manera presencial', telematica: 'por videoconferencia', mixta: 'de manera mixta' };
  var quienPreside = null, integrantes = [], invitados = [];

  for (var i = 0; i < acta.asistentes.length; i++) {
    var a = acta.asistentes[i];
    if (a.preside) quienPreside = a;
    if (acEsInvitado(a.cargo)) invitados.push(a);
    else integrantes.push(a);
  }

  var minimo = Math.floor((acta.total || 3) / 2) + 1;
  var hayMayoria = integrantes.length >= minimo;

  var encabezado =
    'En ' + (acta.direccion ? acEsc(acta.direccion) : acEsc(acta.condominio || 'el condominio')) +
    ', a ' + acFechaLarga(acta.fecha) +
    (acta.hora ? ', siendo las ' + acEsc(acta.hora) + ' horas' : '') +
    ', se reunió ' + (modalidades[acta.modalidad] || 'de manera presencial') +
    ' el comité de administración del ' + acEsc(acta.condominio || '—') +
    (acta.lugar ? ', en ' + acEsc(acta.lugar) : '') + '.';

  var listaInt = integrantes.map(function (a) {
    return '<li>' + acEsc(a.nombre) +
      (a.preside ? ' — <strong>Presidente/a</strong>' : (a.cargo ? ' — ' + acEsc(a.cargo) : '')) + '</li>';
  }).join('');

  var listaInv = invitados.map(function (a) {
    return '<li>' + acEsc(a.nombre) + (a.cargo ? ' — ' + acEsc(a.cargo) : '') + '</li>';
  }).join('');

  var puntosHtml = acta.puntos.length
    ? acta.puntos.map(function (p, i) {
        return '<p><strong>' + (i + 1) + '. ' + acEsc(p.materia || 'Sin título') + '</strong></p>' +
          (p.tratado ? '<p>' + acNl(p.tratado) + '</p>' : '') +
          (p.acuerdo ? '<p><strong>Acuerdo:</strong> ' + acNl(p.acuerdo) + '</p>' : '');
      }).join('')
    : '<p>No se registraron temas.</p>';

  /* Las firmas.
   *
   *  Antes solo salían si alguien estaba marcado como presidente/a, con lo
   *  que un acta sin esa marca se imprimía sin dónde firmar. Ahora firman
   *  siempre los dos primeros integrantes presentes; quien preside, si
   *  está marcado, va primero y con su rótulo.
   */
  var firmantes = [];
  if (quienPreside) firmantes.push({ nombre: quienPreside.nombre, rotulo: 'Presidente/a del comité' });
  for (var k = 0; k < integrantes.length && firmantes.length < 2; k++) {
    if (integrantes[k].preside) continue;
    firmantes.push({
      nombre: integrantes[k].nombre,
      rotulo: integrantes[k].cargo || 'Integrante del comité'
    });
  }

  var firmas = firmantes.length
    ? '<div class="firmas">' + firmantes.map(function (f) {
        return '<div class="firma"><b>' + acEsc(f.nombre) + '</b>' + acEsc(f.rotulo) + '</div>';
      }).join('') + '</div>'
    : '';

  return {
    titulo: 'Acta de reunión del comité de administración',
    subtitulo: acEsc(acta.condominio || '') + (acta.fecha ? ' · ' + acFecha(acta.fecha) : ''),
    html:
      '<h4>Constitución</h4><p>' + encabezado + '</p>' +
      '<h4>Asistencia</h4>' +
      (integrantes.length
        ? '<p>Asisten ' + integrantes.length + ' de los ' + (acta.total || 3) +
          ' integrantes del comité' + (hayMayoria
            ? ', con lo que se reúne la mayoría que exige el artículo 17 para adoptar acuerdos.'
            : '. No se reúne la mayoría del artículo 17, por lo que se deja constancia de lo tratado.') +
          '</p><ul class="lista">' + listaInt + '</ul>'
        : '<p>No se registraron asistentes.</p>') +
      (invitados.length ? '<p>Asisten además, sin integrar el comité:</p><ul class="lista">' + listaInv + '</ul>' : '') +
      '<h4>Temas tratados y acuerdos</h4>' + puntosHtml +
      (acta.cierre ? '<h4>Cierre</h4><p>' + acNl(acta.cierre) + '</p>' : '') +
      firmas,
    firmas: firmas
  };
}

function acRefrescar() {
  acRecoger();
  var caja = $ac('previa');
  if (!caja) return;

  var doc = acCuerpoActa();
  caja.className = 'previa' + (acFolio ? '' : ' borrador');
  caja.innerHTML =
    '<h3>' + doc.titulo + '</h3>' +
    '<p class="sub">' + doc.subtitulo + '</p>' +
    doc.html +
    (acFolio
      ? '<p class="folio">Acta N° ' + acEsc(acFolio) + ' · emitida el ' + acFecha(acHoy()) + ' con actaviva</p>'
      : '<p class="folio">Documento en borrador. Al finalizarlo recibe un folio y se quita esta marca.</p>');

  var barra = $ac('barra');
  var tx = $ac('barra-tx');
  var boton = $ac('b-finalizar');
  if (barra) barra.hidden = false;
  if (acFolio) {
    if (tx) tx.innerHTML = '✓ Acta cerrada · <b>N° ' + acEsc(acFolio) + '</b>';
    if (boton) { boton.textContent = '⬇ Descargar el acta'; boton.setAttribute('data-ac', 'acDescargar'); }
  } else {
    // La parte marcada como .larga se esconde en el teléfono: ahí la barra
    // tiene que dejar espacio al botón, no a la explicación.
    if (tx) tx.innerHTML = 'Acta en <b>borrador</b><span class="larga"> · descárguela así, o ciérrela para numerarla</span>';
    if (boton) { boton.textContent = 'Cerrar el acta'; boton.setAttribute('data-ac', 'acFinalizar'); }
  }
}

function acFaltantes() {
  acRecoger();
  var faltan = [];
  if (!acta.condominio) faltan.push('el nombre del condominio');
  if (!acta.fecha)      faltan.push('la fecha de la reunión');
  if (!acta.asistentes.length) faltan.push('al menos un asistente');
  var conAcuerdo = acta.puntos.filter(function (p) { return p.materia || p.acuerdo; }).length;
  if (!conAcuerdo) faltan.push('al menos un tema tratado');
  return faltan;
}


/* ─────────────────────────────────────────────────────────────────────
 *  Guardar en la cuenta
 *
 *  Se guarda por lo mismo que el acta de asamblea: para poder retomarla
 *  desde otro equipo y para poder exigir el pago en el servidor. El
 *  dueno la borra desde su panel y desaparece.
 * ───────────────────────────────────────────────────────────────────── */

function acGuardar() {
  clearTimeout(acReloj);
  acReloj = setTimeout(function () { acGuardarYa(null); }, 900);
}

/* Un guardado a la vez.
 *
 *  Sin esto: la primera tecla dispara un insert; mientras viaja, el
 *  usuario sigue escribiendo, salta otro guardado, acId TODAVIA es null
 *  y se inserta un acta nueva. Con la red lenta terminaba con dos o tres
 *  actas duplicadas y editando cualquiera de ellas.
 *
 *  El candado deja pasar uno; lo que llegue mientras tanto se anota como
 *  pendiente y se corre al final, una sola vez y con el texto de ese
 *  momento, que es el que interesa.
 */
function acGuardarYa(cb) {
  // Con folio, el documento está cerrado: no se guarda nada más.
  if (acFolio) { if (cb) cb(true); return; }

  if (acGuardando) {
    acPendiente = true;
    if (cb) acEspera.push(cb);
    return;
  }

  acRecoger();

  var c = window.Cuenta && Cuenta.cliente();
  if (!c) {
    try { localStorage.setItem(AC_BORRADOR, JSON.stringify(acta)); } catch (e) {}
    if (cb) cb(false);
    return;
  }

  var fila = {
    condominio:    (acta.condominio || '').slice(0, 200) || null,
    fecha_reunion: acta.fecha || null,
    contenido:     acta
  };

  acGuardando = true;

  var q = acId
    ? c.from('actas_comite').update(fila).eq('id', acId).select('id,folio')
    : c.from('actas_comite').insert(fila).select('id,folio');

  q.then(function (r) {
    acGuardando = false;

    if (r.error) {
      // El tope de tamaño de la tabla se avisa por su nombre: «no pudimos
      // guardar», repetido y sin causa, es lo más frustrante que hay.
      var m = String(r.error.message || '');
      acAviso(/tamano|too large|value too long/i.test(m)
        ? 'El acta es demasiado extensa para guardarla. Acorte los textos más largos.'
        : 'No pudimos guardar. Su texto sigue en pantalla.', true);
      acAvisarEspera(false, cb);
      return;
    }
    var f = r.data && r.data[0];
    if (f) { acId = f.id; acFolio = f.folio || null; }
    try { localStorage.removeItem(AC_BORRADOR); } catch (e) {}
    acAviso('Guardado');
    acAvisarEspera(true, cb);

    // Lo que se escribió mientras viajaba este guardado va ahora, ya con
    // el id en la mano: es un update, no otra acta.
    if (acPendiente) { acPendiente = false; acGuardar(); }
  }, function () {
    acGuardando = false;
    acAviso('No pudimos guardar. Su texto sigue en pantalla.', true);
    acAvisarEspera(false, cb);
  });
}

/* Un acta con folio ya no se toca.
 *
 *  El folio es el sello del pago y lo que hace que el documento valga como
 *  emitido: si el texto pudiera seguir cambiando después, el número no
 *  diría nada. Postgres ya impide alterar folio y pagada; esto impide
 *  alterar el CONTENIDO, que es lo que los triggers no miran.
 *
 *  Se puede leer, descargar e imprimir. Para corregir algo, se hace un
 *  acta nueva, como con cualquier documento numerado.
 */
function acSellarFormulario() {
  if (!acFolio) return;

  var campos = document.querySelectorAll(
    '#m-condominio input, #todo input, #todo select, #todo textarea'
  );
  for (var i = 0; i < campos.length; i++) {
    var e = campos[i];
    if (e.closest && e.closest('.fondo-modal')) continue;   // el modal de pago no
    if (e.type === 'radio' || e.type === 'checkbox' || e.tagName === 'SELECT') e.disabled = true;
    else e.readOnly = true;
  }

  // Los botones que agregan o quitan cosas dejan de tener sentido.
  var quitar = document.querySelectorAll(
    '[data-ac="acAsistenteNuevo"],[data-ac="acAsistenteQuitar"],' +
    '[data-ac="acAgregarAdministrador"],[data-ac="acPuntoNuevo"],' +
    '[data-ac="acPuntoQuitar"],[data-ac="acTraerAnterior"]'
  );
  for (var j = 0; j < quitar.length; j++) quitar[j].disabled = true;

  var invita = $ac('n-repetir');
  if (invita) invita.hidden = true;

  var sello = $ac('sello-final');
  if (sello) {
    sello.hidden = false;
    sello.innerHTML = '<div class="msg msg-ok">Esta acta quedó cerrada con el número <strong>' +
      acEsc(acFolio) + '</strong>, así que ya no se puede modificar. ' +
      'Descárguela para firmarla, o empiece otra para la próxima reunión.' +
      '<div class="btn-fila" style="margin-top:12px">' +
        '<button class="btn btn-t btn-sm" type="button" data-ac="acDescargar">⬇ Descargar el acta</button>' +
        '<button class="btn btn-s btn-sm" type="button" data-ac="acNuevaActa">Empezar otra acta</button>' +
      '</div></div>';
  }
}

function acAvisarEspera(ok, cb) {
  if (cb) cb(ok);
  var pendientes = acEspera;
  acEspera = [];
  for (var i = 0; i < pendientes.length; i++) {
    try { pendientes[i](ok); } catch (e) {}
  }
}

function acCargar(alTerminar) {
  var c = window.Cuenta && Cuenta.cliente();
  if (!c) { if (alTerminar) alTerminar(); return; }

  // La que se estaba escribiendo: la mas reciente sin finalizar.
  c.from('actas_comite')
    .select('id,contenido,folio')
    .is('folio', null)
    .order('actualizada', { ascending: false })
    .limit(1)
    .then(function (r) {
      if (!r.error && r.data && r.data.length) {
        var f = r.data[0];
        acId = f.id; acFolio = f.folio || null;
        var cont = f.contenido || {};
        for (var k in acta) if (cont[k] !== undefined) acta[k] = cont[k];
      } else {
        try {
          var raw = localStorage.getItem(AC_BORRADOR);
          if (raw) {
            var b = JSON.parse(raw);
            if (b && typeof b === 'object') for (var j in acta) if (b[j] !== undefined) acta[j] = b[j];
          }
        } catch (e) {}
      }
      if (alTerminar) alTerminar();
    });
}

/* ¿Hay alguna acta anterior de la que copiar? Se pregunta solo por eso:
   no se guarda ninguna lista de personas en ninguna otra parte. */
function acHayAnterior(cb) {
  var c = window.Cuenta && Cuenta.cliente();
  if (!c) { cb(false); return; }
  c.from('actas_comite').select('id').limit(1).then(function (r) {
    cb(!r.error && r.data && r.data.length > 0);
  });
}

function acTraerAnterior() {
  var c = window.Cuenta && Cuenta.cliente();
  if (!c) { acAviso('Entre a su cuenta para poder traer datos anteriores', true); return; }

  c.from('actas_comite')
    .select('id,contenido,fecha_reunion')
    .order('fecha_reunion', { ascending: false, nullsFirst: false })
    .limit(2)
    .then(function (r) {
      if (r.error || !r.data || !r.data.length) {
        acAviso('No encontramos un acta anterior', true);
        return;
      }
      // Si la primera es la que estoy escribiendo, tomo la siguiente.
      var previa = null;
      for (var i = 0; i < r.data.length; i++) {
        if (r.data[i].id !== acId) { previa = r.data[i]; break; }
      }
      if (!previa) { acAviso('Todavía no hay un acta anterior de dónde copiar', true); return; }

      var v = previa.contenido || {};
      acta.condominio = v.condominio || acta.condominio;
      acta.direccion  = v.direccion  || acta.direccion;
      acta.lugar      = v.lugar      || acta.lugar;
      acta.modalidad  = v.modalidad  || acta.modalidad;
      acta.total      = v.total      || acta.total;
      // Los nombres y los cargos se copian; la marca de presidente/a no.
      // Quien preside resguarda el libro y lo entrega al comite siguiente
      // (art. 17): es un dato con consecuencia, y arrastrarlo sin mirar
      // deja actas que dicen que presidio alguien que ese dia no estaba.
      // Sin la marca, el aviso de quorum pide confirmarla; es un clic.
      acta.asistentes = (v.asistentes || []).map(function (a) {
        return { nombre: a.nombre, cargo: a.cargo, preside: false };
      });

      acPintarFormulario();
      acRefrescar();
      acGuardar();
      acAviso('Datos traídos de su acta del ' + acFecha(previa.fecha_reunion));
    });
}


/* ─────────────────────────────────────────────────────────────────────
 *  Cerrar el acta
 *
 *  Gratis: no hay pago, llave ni pasarela. Cerrar hace dos cosas -darle
 *  numero al documento y dejarlo fijo- y las dos las hace Postgres, que
 *  es el unico que puede escribir el folio.
 * ───────────────────────────────────────────────────────────────────── */

function acFinalizar() {
  var faltan = acFaltantes();
  if (faltan.length) {
    acMensaje('msg-acta', 'Antes de cerrar el acta falta ' + faltan.join(', ') + '.', 'msg-warn');
    acAviso('Faltan datos para cerrar el acta', true);
    return;
  }
  acMensaje('msg-acta', '', '');

  if (acFolio) { acDescargar(); return; }

  // Cerrar es irreversible, así que se pregunta. No es un cobro: es que
  // después ya no se puede corregir.
  acAbrirModal('mod-cerrar');
}

function acCerrarActa() {
  var boton = $ac('b-cerrar');
  if (boton) { boton.disabled = true; boton.textContent = 'Cerrando…'; }

  acGuardarYa(function (ok) {
    if (!ok || !acId) {
      if (boton) { boton.disabled = false; boton.textContent = 'Cerrar el acta y numerarla'; }
      acMensaje('msg-cerrar', 'No pudimos guardar el acta antes de cerrarla. Revise su conexión.', 'msg-err');
      return;
    }

    var c = window.Cuenta && Cuenta.cliente();
    if (!c) {
      if (boton) { boton.disabled = false; boton.textContent = 'Cerrar el acta y numerarla'; }
      return;
    }

    c.rpc('ac_comite_finalizar', { p_acta: acId }).then(function (r) {
      if (boton) { boton.disabled = false; boton.textContent = 'Cerrar el acta y numerarla'; }

      if (r.error) {
        var m = String(r.error.message || '');
        acMensaje('msg-cerrar',
          /acta_incompleta/.test(m)
            ? 'Faltan el condominio o la fecha de la reunión.'
            : /acta_no_encontrada/.test(m)
              ? 'No encontramos esta acta en su cuenta. Recargue la página.'
              : 'No pudimos cerrar el acta. Inténtelo en unos minutos.', 'msg-err');
        return;
      }

      acFolio = (r.data && r.data.folio) || null;
      acCerrarModal('mod-cerrar');
      acSellarFormulario();
      acRefrescar();
      acMensaje('msg-acta', 'Acta cerrada con el número ' + acFolio + '. Ya puede descargarla y firmarla.', 'msg-ok');
      acAviso('Acta cerrada');
      acDescargar();
    });
  });
}


/* ─────────────────────────────────────────────────────────────────────
 *  Descargar e imprimir
 * ───────────────────────────────────────────────────────────────────── */

function acDescargar() {
  var doc = acCuerpoActa();
  var esBorrador = !acFolio;

  var estilos =
    'body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.75;color:#24282D;max-width:720px;margin:0 auto;padding:28pt 26pt;}' +
    'h1{font-size:15pt;color:#1E3A6E;text-align:center;margin:0 0 4pt;}' +
    '.sub{text-align:center;color:#5C6168;font-size:10.5pt;margin:0 0 18pt;padding-bottom:12pt;border-bottom:2px solid #1E3A6E;}' +
    'h4{font-size:9.5pt;color:#1E3A6E;text-transform:uppercase;letter-spacing:.9px;margin:18pt 0 6pt;padding-bottom:3pt;border-bottom:1px solid #D7D6CE;}' +
    'p{margin:0 0 8pt;text-align:justify;}' +
    'ul{margin:0 0 8pt 18pt;padding:0;}' +
    'li{margin-bottom:3pt;}' +
    '.firmas{display:flex;gap:40pt;margin-top:50pt;page-break-inside:avoid;}' +
    '.firma{flex:1;border-top:1px solid #24282D;padding-top:7pt;text-align:center;font-size:10pt;color:#5C6168;}' +
    '.firma b{display:block;color:#24282D;font-size:11pt;}' +
    '.folio{text-align:center;font-size:9pt;color:#6E7276;margin-top:26pt;padding-top:10pt;border-top:1px solid #D7D6CE;}' +
    // La marca de agua va en position:fixed para que el navegador la repita
    // en cada pagina al imprimir, y con print-color-adjust para que no se
    // pierda cuando el PDF se genera sin fondos.
    (esBorrador
      ? 'body{position:relative;}' +
        '.agua{position:fixed;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-32deg);' +
          'font-size:90pt;font-weight:bold;letter-spacing:.06em;color:rgba(178,58,46,.11);' +
          'z-index:0;pointer-events:none;white-space:nowrap;' +
          '-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
        'h1,.sub,h4,p,ul,.firmas,.folio{position:relative;z-index:1;}'
      : '') +
    '@page{size:A4;margin:20mm 18mm;}';

  var html = '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
    // Sin esto, el acta abierta en el teléfono sale del tamaño de un sello.
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>' + doc.titulo + (acFolio ? ' ' + acEsc(acFolio) : '') + '</title>' +
    '<style>' + estilos + '</style></head><body>' +
    (esBorrador ? '<div class="agua" aria-hidden="true">BORRADOR</div>' : '') +
    '<h1>' + doc.titulo + '</h1>' +
    '<p class="sub">' + doc.subtitulo + '</p>' +
    doc.html +
    '<p class="folio">' +
      (acFolio
        ? 'Acta N° ' + acEsc(acFolio) + ' · emitida el ' + acFecha(acHoy()) + '<br>'
        : 'Documento en borrador, sin folio.<br>') +
      'Registro llevado conforme al artículo 17 de la Ley N° 21.442 sobre Copropiedad Inmobiliaria.<br>' +
      'Generado con actaviva · actascopropiedad.cl' +
    '</p></body></html>';

  var nombre = (acta.condominio || 'comite').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 40);
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'acta_comite_' + nombre + '_' + (acta.fecha || acHoy()) + '.html';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 3000);

  acAviso(esBorrador ? 'Borrador descargado' : 'Acta descargada');
}

function acImprimir() {
  acRefrescar();
  setTimeout(function () { window.print(); }, 200);
}

function acNuevaActa() {
  if (!acFolio && (acta.condominio || acta.puntos.length)) {
    if (!confirm('Esta acta todavía está en borrador. Si empieza otra, la actual queda guardada en su cuenta y podrá retomarla desde el panel.\n\n¿Empezar una nueva?')) return;
  }
  acGuardarYa(function () { location.href = location.pathname; });
}


/* ─────────────────────────────────────────────────────────────────────
 *  Ventanas
 * ───────────────────────────────────────────────────────────────────── */

function acAbrirModal(id) {
  var m = $ac(id);
  if (m) m.classList.add('ver');
}
function acCerrarModal(id) {
  var m = $ac(id);
  if (m) m.classList.remove('ver');
}


/* ─────────────────────────────────────────────────────────────────────
 *  Arranque
 * ───────────────────────────────────────────────────────────────────── */

function acIniciar() {
  if (!acta.fecha) acta.fecha = acHoy();
  acPintarFormulario();
  acRefrescar();
  acSellarFormulario();   // por si se abrió una que ya tenía folio

  var cargando = $ac('cargando-todo');
  var todo = $ac('todo');
  if (cargando) cargando.hidden = true;
  if (todo) todo.hidden = false;

  // La invitación a copiar solo aparece si de verdad hay de dónde.
  acHayAnterior(function (hay) {
    var n = $ac('n-repetir');
    if (n) n.hidden = !hay;
  });
}
