// El cliente lo entrega cuenta.js: uno solo por página, para que la sesión
// abierta al entrar viaje también en las llamadas a las funciones.
const sb = Cuenta.cliente();

const $ = id => document.getElementById(id);
const LS = 'cc_mesa';
let C = null, timer = null;

function msg(el, texto, clase){
  const e = $(el);
  // El hueco puede no estar: en modo vitrina el Worker borra los del pago.
  if(!e) return;
  if(!texto){ e.classList.add('hidden'); return; }
  e.className = 'aviso ' + (clase||'ok'); e.textContent = texto;
}
function busy(btn, on, txt){
  if(!btn) return;
  if(on){ btn.dataset.t = btn.textContent; btn.disabled = true; if(txt) btn.textContent = txt; }
  else { btn.disabled = false; if(btn.dataset.t) btn.textContent = btn.dataset.t; }
}
// El mismo formateador exacto que el acta y la sala: dos decimales como
// minimo y los que hagan falta para no mentir sobre el umbral.
const pct = n => Derechos.texto(Derechos.desdeTexto(n)) + ' %';
function guardar(){ try{ localStorage.setItem(LS, JSON.stringify(C)); }catch(e){} }
function recuperar(){ try{ return JSON.parse(localStorage.getItem(LS)); }catch(e){ return null; } }

function casillaDe(codigo){ return 'c-' + codigo + '@' + location.hostname.replace(/^www\./,''); }

// El pago se comparte con el acta: una llave abre una asamblea O una
// consulta, y la base de datos impide reutilizarla.
// La consulta es un servicio aparte: su pago no es el del acta.
const LLAVE = 'consulta_pago_llave';
// Ver la nota en acta-1.js: /consulta/demo escribe esta llave para abrirse
// sola, y localStorage es del origen entero. Al volver a /consulta/ quedaba
// puesta y la consulta se ofrecia como pagada; el servidor la rechazaba
// recien al crear. Fuera de una pagina de demostracion no vale.
const LLAVE_DE_DEMO = 'DEMO-PAGO-SIMULADO';
const enPaginaDemo = () => /(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname);
const llaveGuardada = () => {
  let v = '';
  try{ v = localStorage.getItem(LLAVE)||''; }catch(e){ return ''; }
  return (v === LLAVE_DE_DEMO && !enPaginaDemo()) ? '' : v;
};
const borrarLlave = () => { try{ localStorage.removeItem(LLAVE); }catch(e){} };

let USUARIO = null;

// Muestra la entrada a la cuenta o, si ya entró, el botón de pago.
function pintarPago(){
  // En modo vitrina el Worker borró el recuadro del pago. Sin él no hay nada
  // que pintar, y sobre todo: no hay que reventar. Se dice qué pasa, porque
  // callar deja el botón muerto y al que mira pensando que se rompió.
  if(!$('c-pago')){
    msg('nueva-msg', 'Crear la consulta requiere activar la asamblea, y eso no está ' +
        'habilitado en esta presentación. La consulta completa se puede recorrer ' +
        'en /consulta/demo.', 'warn');
    return;
  }
  $('c-pago').classList.remove('hidden');
  if(USUARIO){
    $('cta-host').innerHTML = '';
    $('pago-listo').classList.remove('hidden');
    $('p-correo').textContent = USUARIO.correo;
    const ah = $('c-acepta-host');
    if(ah && !ah.innerHTML) ah.innerHTML = Cuenta.terminos.html('c-acepta');
  } else {
    $('pago-listo').classList.add('hidden');
    Cuenta.panel('cta-host', {
      titulo: 'Primero, su cuenta',
      sub: 'Entre, o cree su cuenta en un minuto. Con ella podrá volver a esta consulta.',
      alEntrar: u => { USUARIO = u; pintarPago(); }
    });
  }
}

// Salir borra del equipo lo que la consulta dejo (cc_mesa, la llave), pero
// en pantalla seguiria el panel de la consulta abierta, con su padron y sus
// respuestas, a la vista de quien entre despues. Se recarga: la pagina vuelve
// a su portero y arranca en blanco.
function cerrarSesion(btn){
  busy(btn, true, 'Saliendo…');
  Cuenta.salir(() => { USUARIO = null; location.reload(); });
}

// Solo se navega a Flow, con https y su propio dominio: 'www.flow.cl.otro'
// o 'www.flow.cl@otro' no pasan porque despues de '.cl' tiene que venir '/'.
const esPasarela = u => typeof u === 'string' && /^https:\/\/(www|sandbox)\.flow\.cl\//.test(u);

async function irAPagar(btn){
  const correo = USUARIO && USUARIO.correo;
  if(!Cuenta.correoValido(correo)){ pintarPago(); return; }
  if(!Cuenta.terminos.aceptados('c-acepta')){
    msg('pago-msg', Cuenta.terminos.AVISO, 'err');
    const c = $('c-acepta'); if(c) c.focus();
    return;
  }
  busy(btn, true, 'Conectando…'); msg('pago-msg','');
  try{
    // El Worker ata la orden a la cuenta: sin sesion no se cobra. Si se
    // vencio, se vuelve a pedir la entrada en el mismo recuadro.
    const token = await Cuenta.tokenDeAcceso();
    if(!token){
      USUARIO = null; pintarPago();
      msg('pago-msg','Su sesión terminó. Vuelva a entrar para pagar.','err');
      return;
    }
    const r = await fetch('/api/pago/crear', {method:'POST', headers:{'content-type':'application/json', 'authorization':'Bearer ' + token}, body: JSON.stringify({correo, producto:'consulta', acepta: Cuenta.terminos.VERSION})});
    const d = await r.json().catch(() => null);
    if(r.status === 401){
      USUARIO = null; pintarPago();
      msg('pago-msg','Su sesión terminó. Vuelva a entrar para pagar.','err');
      return;
    }
    // La URL la arma el Worker con lo que contesta Flow. Se comprueba que
    // sea Flow antes de mandar a la persona: si llegara otra cosa, no se sigue.
    if(!r.ok || !d || !esPasarela(d.redirigir)){
      msg('pago-msg', d && d.error === 'pasarela_no_configurada'
        ? 'El pago en línea todavía no está habilitado. Escríbanos a contacto@actascopropiedad.cl.'
        : 'No pudimos iniciar el pago. Inténtelo nuevamente en unos minutos.', 'err');
      return;
    }
    location.href = d.redirigir;
  }catch(e){ msg('pago-msg','No pudimos conectar con el medio de pago.','err'); }
  finally{ busy(btn, false); }
}

// Vuelta desde la pasarela: /consulta/?pago=AV-XXXX. Se llama ya con la
// sesion abierta (desde inicio()), porque el Worker entrega la llave solo a
// la cuenta que pidio la orden. La orden se quita de la direccion recien con
// una respuesta definitiva: el mensaje de espera recomienda recargar, y
// recargar tiene que volver a intentarlo.
function retornoDePago(){
  const m = /[?&]pago=(AV-[A-Z0-9]+)/.exec(location.search);
  if(!m) return;
  const orden = m[1]; let intentos = 0;
  const olvidarOrden = () => { try{ history.replaceState(null,'',location.pathname); }catch(e){} };
  if(!$('c-pago')){ olvidarOrden(); return; }   // vitrina: no hay recuadro que mostrar
  $('c-pago').classList.remove('hidden');
  $('pago-listo').classList.remove('hidden');
  msg('pago-msg','Confirmando el pago…','warn');
  Cuenta.tokenDeAcceso().then(token => {
    if(!token){ msg('pago-msg','Entre a su cuenta para confirmar el pago.','err'); return; }
    (function revisar(){
      intentos++;
      fetch('/api/pago/estado?orden=' + encodeURIComponent(orden), { headers: { 'authorization': 'Bearer ' + token } })
        .then(r => r.json().then(d => ({ estado: r.status, d })))
        .then(({ estado, d }) => {
          if(d && d.estado === 'pagado' && d.llave){
            olvidarOrden();
            try{ localStorage.setItem(LLAVE, d.llave); }catch(e){}
            msg('pago-msg','Pago confirmado. Ya puede crear la consulta.','ok');
            setTimeout(() => { if($('c-pago')) $('c-pago').classList.add('hidden'); }, 2600);
            return;
          }
          // 404: la orden no existe o es de otra cuenta. El Worker no dice
          // cual, y esperar no la va a hacer aparecer.
          // Antes de quitarla de la direccion se anota en el equipo: si se
          // pago con otra cuenta, Cuenta.recuperarPagos la entrega al entrar
          // con ella.
          if(estado === 404){
            if(typeof Cuenta.anotarPago === 'function') Cuenta.anotarPago(orden);
            olvidarOrden();
            msg('pago-msg','No encontramos ese pago en esta cuenta. Si pagó con otra, entre con ella en este equipo y se lo entregaremos.','err');
            return;
          }
          if(estado === 401){ msg('pago-msg','Su sesión terminó. Recargue la página y vuelva a entrar.','err'); return; }
          if(intentos < 10){ setTimeout(revisar, 2000); return; }
          msg('pago-msg','Todavía no recibimos la confirmación. Si ya pagó, recargue esta página en un momento.','err');
        })
        .catch(() => { if(intentos < 10) setTimeout(revisar, 2000);
                       else msg('pago-msg','No pudimos verificar el pago.','err'); });
    })();
  });
}

async function crear(btn){
  const condo = $('f-condo').value.trim();
  const materia = $('f-materia').value.trim();
  const plazo = $('f-plazo').value;
  if(materia.length < 10){ msg('nueva-msg','Describa qué se somete a acuerdo.','err'); return; }
  if(!plazo){ msg('nueva-msg','Fije la fecha y hora en que vence el plazo.','err'); return; }
  if(new Date(plazo) <= new Date()){ msg('nueva-msg','El plazo debe terminar en el futuro.','err'); return; }
  const infoF = $('f-if').value;
  if(!infoF){ msg('nueva-msg','Registre la fecha de la sesión informativa: la ley la exige antes de consultar.','err'); return; }

  const llave = llaveGuardada();
  if(!llave){ msg('nueva-msg',''); pintarPago(); return; }

  busy(btn, true, 'Creando…'); msg('nueva-msg','');
  try{
    const { data, error } = await sb.rpc('cc_crear', {
      p_condominio: condo, p_materia: materia, p_tipo: $('f-tipo').value,
      p_plazo_fin: new Date(plazo).toISOString(),
      p_info_fecha: new Date(infoF).toISOString(),
      p_info_modalidad: $('f-im').value,
      p_info_asistentes: parseInt($('f-ia').value, 10) || 0,
      p_info_observacion: $('f-io').value.trim(),
      p_llave: llave
    });
    if(error) throw error;
    C = { codigo: data.codigo, token: data.admin_token, materia: materia, condo: condo };
    guardar();
    $('c-nueva').classList.add('hidden');
    $('c-padron').classList.remove('hidden');
  }catch(e){
    const m = String((e && e.message) || e || '');
    if(/pago_requerido|llave_invalida|llave_malformada|pago_vencido|pago_ya_utilizado|pago_no_configurado/.test(m)){
      borrarLlave();
      if($('c-pago')) $('c-pago').classList.remove('hidden');
      msg('pago-msg', /pago_ya_utilizado/.test(m)
        ? 'Ese pago ya se usó. Cada consulta o asamblea requiere el suyo.'
        : /pago_vencido/.test(m) ? 'El pago venció. Debe realizarse uno nuevo.'
        : 'No pudimos validar el pago. Inténtelo nuevamente.', 'err');
      msg('nueva-msg','');
    } else {
      msg('nueva-msg', 'No se pudo crear la consulta. ' + m, 'err');
    }
  }finally{ busy(btn, false); }
}

// En Chile los decimales van con coma ("2,5"), asi que separar por coma
// parte los derechos en dos. Se prefiere tabulacion, luego punto y coma, y
// solo se usa la coma cuando no hay ninguno de los dos.
function separar(linea){
  if(linea.indexOf('\t') >= 0) return linea.split('\t');
  if(linea.indexOf(';') >= 0) return linea.split(';');
  return linea.split(',');
}
// La sexta columna, Hábil, es optativa: vacía vale Sí. Antes no existía y
// todos entraban como hábiles, así que la aceptación de un moroso sumaba
// derechos; la ley dice que solo los hábiles concurren con su voto (art.
// 15). Y la habilidad es del copropietario, no de la unidad: quien tiene
// varias y debe en una, no vota con ninguna (art. 14 del Reglamento).
function filasDesdeTexto(texto){
  const filas = texto.split(/\n+/).map(separar).filter(c => c.length >= 4)
    .map(c => ({
      unidad: (c[0]||'').trim(), nombre: (c[1]||'').trim(), rut: (c[2]||'').trim(),
      correo: (c[3]||'').trim().toLowerCase(),
      der: parseFloat(String(c[4]||'0').replace(',', '.')) || 0,
      habil: Derechos.bandera(String(c[5]||'').trim()) !== false
    }))
    .filter(f => /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(f.correo));
  return Derechos.habilidadPorCopropietario(filas).filas;
}

// Aquí el correo no es opcional como en el acta: es el mecanismo de
// identidad que fija el art. 17 del reglamento. Sin correo, esa unidad
// simplemente no puede responder la consulta. La plantilla lo dice.
function descargarPlantilla(){
  if(typeof XLSX === 'undefined'){ msg('padron-msg','No se pudo preparar la plantilla. Recargue la página.','err'); return; }
  const filas = [
    ['Unidad','Nombre del copropietario','RUT','Correo','% Derechos','Hábil'],
    ['101','Juan Pérez González','12.345.678-5','juan.perez@correo.cl',1.5,'Sí'],
    ['202','María López Soto','9.876.543-3','maria.lopez@correo.cl',0.85,'Sí'],
    ['303','Carlos Ramírez Fuentes','15.234.567-4','carlos.ramirez@correo.cl',2.1,'No']
  ];
  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = [{wch:10},{wch:32},{wch:16},{wch:30},{wch:12},{wch:8}];

  const guia = [
    ['Cómo completar esta planilla'],
    [''],
    ['1. Borre las tres filas de ejemplo de la hoja «Padrón».'],
    ['2. No cambie los nombres de las columnas ni su orden.'],
    ['3. Agregue una fila por cada unidad del condominio.'],
    [''],
    ['Lo más importante: el correo'],
    ['La consulta por escrito se responde DESDE el correo de cada copropietario. El artículo 17 del'],
    ['Reglamento de la Ley N° 21.442 dispone que, si el reglamento de copropiedad no establece otro'],
    ['mecanismo, la respuesta enviada en soporte digital se verifica a través de la casilla de correo'],
    ['singularizada en el Registro de Copropietarios.'],
    [''],
    ['Por eso el correo debe ser EXACTAMENTE el que figura en ese Registro. Una unidad sin correo no'],
    ['podrá responder la consulta, y su porcentaje de derechos no se computará.'],
    [''],
    ['Columna', 'Qué se escribe', '¿Obligatorio?'],
    ['Unidad', 'Número o identificación del departamento, casa o local. Ej: 101, A-3, Local 2.', 'Sí'],
    ['Nombre del copropietario', 'Nombre completo de quien figura como propietario de esa unidad.', 'Sí'],
    ['RUT', 'RUT del propietario, con o sin puntos y con guion.', 'Sí'],
    ['Correo', 'El correo inscrito en el Registro de Copropietarios. Desde esa casilla debe llegar la respuesta.', 'Sí'],
    ['% Derechos', 'Porcentaje sobre los bienes comunes. Escríbalo como número (1,5), no como texto. La suma de todas las unidades debe dar 100.', 'Sí'],
    ['Hábil', 'Sí o No. «No» si el copropietario no está al día en sus obligaciones económicas: puede responder, pero su respuesta no se computa (art. 15, Ley N° 21.442). Vacío se entiende Sí. Quien tiene varias unidades y debe en una, no vota con ninguna (art. 14 del Reglamento).', 'No'],
    [''],
    ['Cuando termine'],
    ['Guarde el archivo y súbalo con «Importar desde Excel». El sistema le dirá cuántas unidades cargó,'],
    ['cuánto suma el porcentaje de derechos y si encontró correos repetidos o mal escritos.']
  ];
  const hojaGuia = XLSX.utils.aoa_to_sheet(guia);
  hojaGuia['!cols'] = [{wch:26},{wch:86},{wch:14}];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Padrón');
  XLSX.utils.book_append_sheet(libro, hojaGuia, 'Instrucciones');
  XLSX.writeFile(libro, 'padron_consulta_escrita.xlsx');
}

function ejemplo(){
  $('f-padron').value = '101\tMaría Soto\t12.345.678-5\tmaria@correo.cl\t2,5\n102\tJuan Pérez\t11.111.111-1\tjuan@correo.cl\t2,5';
  msg('padron-msg','Ese es el formato: una fila por unidad, separada por tabulaciones o punto y coma.','ok');
}

$('f-xlsx').addEventListener('change', function(ev){
  const f = ev.target.files && ev.target.files[0];
  if(!f) return;
  const lector = new FileReader();
  lector.onload = function(e){
    try{
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      const hoja = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(hoja, {header:1, blankrows:false});
      $('f-padron').value = filas.map(r => r.join('\t')).join('\n');
      msg('padron-msg','Planilla leída. Revise que las columnas queden en el orden esperado antes de guardar.','warn');
    }catch(err){ msg('padron-msg','No pudimos leer esa planilla. Pruebe copiando y pegando las columnas.','err'); }
  };
  lector.readAsArrayBuffer(f);
});

// Revisa lo que de verdad se equivoca y, sobre todo, avisa quién quedaría
// sin poder responder: sin correo válido esa unidad no vota y su
// porcentaje de derechos no se computa.
function revisarPadron(texto){
  const lineas = texto.split(/\n+/).map(l => l.trim()).filter(Boolean);
  const filas = filasDesdeTexto(texto);
  const correos = {}, ruts = {};
  let correosRepetidos = 0, rutsRepetidos = 0;
  filas.forEach(f => {
    if(correos[f.correo]) correosRepetidos++; else correos[f.correo] = 1;
    const r = f.rut.replace(/[.\s-]/g,'').toLowerCase();
    if(r){ if(ruts[r]) rutsRepetidos++; else ruts[r] = 1; }
  });
  // Las líneas que se cayeron son, casi siempre, filas sin correo válido.
  // Se descuenta el encabezado si venía en la planilla.
  const conEncabezado = /correo|derecho|unidad/i.test(lineas[0] || '') && filas.length < lineas.length;
  const descartadas = Math.max(0, lineas.length - filas.length - (conEncabezado ? 1 : 0));
  const suma = filas.reduce((s,f) => s + f.der, 0);
  const inhabiles = filas.filter(f => f.habil === false).length;
  const arrastrados = filas.filter(f => f.inhabilPorOtraUnidad).map(f => f.unidad || f.rut);
  return { filas, suma, descartadas, correosRepetidos, rutsRepetidos, inhabiles, arrastrados };
}

async function guardarPadron(btn){
  const r = revisarPadron($('f-padron').value);
  if(r.filas.length === 0){
    msg('padron-msg','No encontramos ninguna fila con correo válido. La consulta se responde desde el correo de cada copropietario, así que sin esa columna no se puede continuar.','err');
    return;
  }
  busy(btn, true, 'Guardando…');
  try{
    const { data, error } = await sb.rpc('cc_set_padron', { p_codigo: C.codigo, p_token: C.token, p_padron: r.filas });
    if(error) throw error;

    const avisos = [];
    if(r.descartadas > 0)      avisos.push(r.descartadas + ' fila(s) sin correo válido quedaron fuera: esas unidades no podrán responder.');
    if(r.correosRepetidos > 0) avisos.push(r.correosRepetidos + ' correo(s) repetido(s): solo se guardó una unidad por casilla.');
    if(r.rutsRepetidos > 0)    avisos.push(r.rutsRepetidos + ' RUT repetido(s): revise que no haya unidades duplicadas.');
    if(r.inhabiles > 0)        avisos.push(r.inhabiles + ' unidad(es) inhábil(es): pueden responder, pero su respuesta no se computa (art. 15, Ley N° 21.442).'
                                 + (r.arrastrados.length ? ' De ellas, ' + r.arrastrados.join(', ') + ' por pertenecer a quien no está al día en otra de sus unidades (art. 14 del Reglamento).' : ''));
    const sumaMal = Math.abs(r.suma - 100) > 0.5;
    if(sumaMal)                avisos.push('La suma de derechos es ' + pct(r.suma) + ' y debería ser 100%.');

    msg('padron-msg',
        data.cargados + ' copropietarios cargados. Suma de derechos: ' + pct(r.suma) + (sumaMal ? '' : ' ✓') +
        (avisos.length ? '\n\nPara revisar:\n• ' + avisos.join('\n• ') : ''),
        avisos.length ? 'warn' : 'ok');
    setTimeout(abrirPanel, avisos.length ? 2600 : 900);
  }catch(e){
    // Desde el 28-09-2026 (CN-028) la base no cambia el padrón de una
    // consulta cerrada o que ya recibió respuestas: se perderían las
    // respuestas o cambiaría el cómputo a mitad de camino.
    const m = String((e && e.message) || '');
    msg('padron-msg',
      /consulta_con_respuestas/.test(m) ? 'Esta consulta ya recibió respuestas: el padrón no se puede cambiar, porque se perderían o cambiaría el cómputo. Si el padrón estaba mal, cree una consulta nueva.'
      : /consulta_cerrada/.test(m) ? 'Esta consulta ya está cerrada: el padrón no se puede cambiar.'
      : 'No se pudo guardar el padrón. ' + m, 'err');
  }finally{ busy(btn, false); }
}

function abrirPanel(){
  $('c-padron').classList.add('hidden');
  $('c-nueva').classList.add('hidden');
  $('c-panel').classList.remove('hidden');
  $('p-codigo').textContent = C.codigo;
  $('p-materia').textContent = C.materia || '';
  $('p-casilla').textContent = casillaDe(C.codigo);
  $('estado-pill').textContent = 'Consulta ' + C.codigo;
  $('estado-pill').className = 'pill a';
  refrescar(false);
  if(timer) clearInterval(timer);
  timer = setInterval(() => refrescar(false), 30000);
}

function copiarTexto(btn){
  const t = 'Estimado copropietario:\n\n' +
    'Conforme al artículo 15 de la Ley N° 21.442, se somete a su consideración la siguiente materia:\n\n' +
    (C.materia || '') + '\n\n' +
    'Para manifestar su decisión, responda este correo escribiendo APRUEBO o RECHAZO.\n' +
    'Su respuesta debe enviarse desde el correo registrado en el Registro de Copropietarios.\n\n' +
    'Dirección de respuesta: ' + casillaDe(C.codigo) + '\n';
  navigator.clipboard.writeText(t).then(
    () => { busy(btn,false); btn.textContent = 'Texto copiado'; setTimeout(()=>btn.textContent='Copiar texto sugerido', 2200); },
    () => msg('panel-msg','No pudimos copiar. Seleccione el texto a mano.','err')
  );
}

// La regla sale de js/derechos.js, el mismo archivo que usan el acta y la
// sala. Eran tres implementaciones de lo mismo y discrepaban entre si.
//
// La consulta por escrito no tiene un "quorum ordinario" propio: cuando el
// tipo es ordinaria no hay umbral que aplicar y la calificacion queda en el
// comite. Eso no cambio.
const UMBRAL = {
  'ordinaria': null,
  'ext-abs': { regla: 'absoluta',  texto: 'más del 50 % de los derechos del condominio' },
  'ext-ref': { regla: 'reforzada', texto: 'al menos el 66 % de los derechos del condominio' }
};

// El valor llega del servidor como numero; se pasa a entero escalado para
// comparar sin coma flotante. Con 17 + 17,01 + 15,99 la suma binaria daba
// 50.00000000000001 y "superaba" el 50 %.
function alcanza(u, a) {
  return Derechos.resolver({
    regla: u.regla,
    favor: Derechos.desdeTexto(a),
    cerrada: true
  }).estado === 'aprobado';
}

async function refrescar(manual){
  if(!C) return;
  try{
    const e = await sb.rpc('cc_estado', { p_codigo: C.codigo, p_token: C.token });
    if(e.error) throw e.error;
    const d = await sb.rpc('cc_detalle', { p_codigo: C.codigo, p_token: C.token });
    if(d.error) throw d.error;
    pintar(e.data, d.data || []);
    if(manual) msg('panel-msg','Actualizado.','ok');
  }catch(err){
    if(manual) msg('panel-msg','No pudimos actualizar. ' + (err.message||''), 'err');
  }
}

function pintar(est, filas){
  const a = Number(est.aprueba)||0, r = Number(est.rechaza)||0;
  $('m-aprueba').textContent = pct(a);
  $('m-rechaza').textContent = pct(r);
  $('m-falta').textContent = est.sin_responder;
  $('m-amb').textContent = est.ambiguas;
  $('b-a').style.width = Math.min(a,100) + '%';
  $('b-r').style.width = Math.min(r,100) + '%';

  const u = UMBRAL[est.tipo_quorum];
  const v = $('p-veredicto');
  if(est.ambiguas > 0){
    v.className = 'aviso warn';
    v.textContent = 'Hay ' + est.ambiguas + ' respuesta(s) que el sistema no pudo interpretar. Revíselas abajo antes de dar por cerrado el acuerdo.';
  } else if(u !== null && alcanza(u, a)){
    v.className = 'aviso ok';
    v.textContent = 'Aprobado: ' + pct(a) + ' de los derechos, y la materia exige ' + u.texto + '.';
  } else if(u !== null){
    v.className = 'aviso warn';
    v.textContent = 'Aún no se alcanza el quórum: ' + pct(a) + ' de los derechos, y la materia exige ' + u.texto + '.';
  } else {
    v.className = 'aviso warn';
    v.textContent = 'Quórum ordinario: se calcula sobre los asistentes, noción que no traslada directamente a una consulta escrita. La calificación corresponde al comité.';
  }

  const tb = $('p-tabla').querySelector('tbody');
  tb.innerHTML = '';
  filas.forEach(f => {
    const tr = document.createElement('tr');
    const est2 = f.sentido || null;
    const pill = est2 === 'aprueba' ? '<span class="pill a">Aprueba</span>'
               : est2 === 'rechaza' ? '<span class="pill r">Rechaza</span>'
               : est2 === 'ambigua' ? '<span class="pill x">Por revisar</span>'
               : '<span class="pill n">Sin responder</span>';
    const cita = est2 === 'ambigua' && f.texto ? '<div class="cita">' + esc(f.texto) + '</div>' : '';
    const id = esc(String(f.id || '').replace(/[^A-Za-z0-9-]/g, ''));
    const acc = est2 === 'ambigua'
      ? '<button class="btn btn-ghost btn-sm" data-ac="resolver" data-args="' + id + '|aprueba|@">Aprueba</button> ' +
        '<button class="btn btn-ghost btn-sm" data-ac="resolver" data-args="' + id + '|rechaza|@">Rechaza</button>'
      : (f.resuelta ? '<span class="muted" style="font-size:12px">resuelta por la Mesa</span>' : '');
    tr.innerHTML = '<td>' + esc(f.unidad) + '</td><td>' + esc(f.nombre) + '<br><span class="muted" style="font-size:12px">' + esc(f.correo) + '</span></td>' +
                   '<td>' + pct(f.der) + '</td><td>' + pill + cita + '</td><td>' + acc + '</td>';
    tb.appendChild(tr);
  });
}

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function resolver(id, sentido, btn){
  busy(btn, true, '…');
  try{
    const { error } = await sb.rpc('cc_resolver', { p_codigo:C.codigo, p_token:C.token, p_destinatario:id, p_sentido:sentido });
    if(error) throw error;
    await refrescar(false);
    msg('panel-msg','Respuesta resuelta por la Mesa. Queda constancia de que fue una decisión suya, no del sistema.','ok');
  }catch(e){
    // Desde que la Mesa cargó la tabla, la persona respondió de nuevo o la
    // resolvieron en otra pestaña: la base no deja pisarlo (paso 16).
    if(/respuesta_ya_resuelta/.test(e.message||'')){
      await refrescar(false);
      msg('panel-msg','Esa respuesta cambió mientras la revisaba: llegó otra de la misma persona o ya se resolvió en otra pestaña. La tabla quedó al día; revísela de nuevo.','err');
      return;
    }
    msg('panel-msg','No se pudo resolver. ' + (e.message||''), 'err');
    busy(btn, false);
  }
}

// --- documento final -------------------------------------------------
const MODALIDAD = { presencial:'presencial', telematica:'telemática', mixta:'mixta' };
const NOMBRE_QUORUM = {
  'ordinaria':'ordinaria',
  'ext-abs':'extraordinaria con mayoría absoluta',
  'ext-ref':'extraordinaria con mayoría reforzada'
};

function fmtFecha(iso){
  if(!iso) return '—';
  const d = new Date(iso);
  if(isNaN(d)) return '—';
  return d.toLocaleDateString('es-CL', {day:'2-digit', month:'long', year:'numeric'}) +
         ', ' + d.toLocaleTimeString('es-CL', {hour:'2-digit', minute:'2-digit', hour12:false}) + ' horas';
}

function veredicto(est, a){
  const u = UMBRAL[est.tipo_quorum];
  if(u === null){
    return { texto:'La presente consulta se sometió a quórum ordinario. El cómputo obtenido se ' +
             'consigna precedentemente y su calificación corresponde al comité de administración.',
             clase:'neutro' };
  }
  return alcanza(u, a)
    ? { texto:'Se DA POR APROBADA la materia consultada, por haberse obtenido la aceptación escrita de ' +
        'copropietarios que representan el ' + pct(a) + ' de los derechos del condominio, cumpliéndose el ' +
        'quórum de ' + u.texto + ' que la materia exige.', clase:'aprobado' }
    : { texto:'NO SE APRUEBA la materia consultada, por no haberse alcanzado el quórum exigido: se obtuvo ' +
        'el ' + pct(a) + ' de los derechos, y la materia exige ' + u.texto + '.', clase:'rechazado' };
}

async function generarDocumento(btn){
  if(!C) return;
  busy(btn, true, 'Generando…');
  try{
    const e = await sb.rpc('cc_estado', { p_codigo:C.codigo, p_token:C.token });
    if(e.error) throw e.error;
    const d = await sb.rpc('cc_detalle', { p_codigo:C.codigo, p_token:C.token });
    if(e.error || d.error) throw (d.error || e.error);
    const est = e.data, filas = d.data || [];

    const pend = filas.filter(f => f.sentido === 'ambigua').length;
    if(pend > 0 && !confirm('Hay ' + pend + ' respuesta(s) sin resolver. No se computarán en el documento. ¿Generarlo igual?')){
      busy(btn, false); return;
    }

    const a = Number(est.aprueba)||0, r = Number(est.rechaza)||0;
    const v = veredicto(est, a);
    const resueltas = filas.filter(f => f.resuelta).length;

    const filasHtml = filas.map(f => {
      const s = f.sentido === 'aprueba' ? 'Aprueba'
              : f.sentido === 'rechaza' ? 'Rechaza'
              : f.sentido === 'ambigua' ? 'No computada'
              : 'Sin respuesta';
      return '<tr><td>' + esc(f.unidad) + '</td><td>' + esc(f.nombre) + '</td><td>' + esc(f.correo) +
             '</td><td class="num">' + pct(f.der) + '</td><td>' + s + '</td><td>' +
             (f.recibida ? fmtFecha(f.recibida) : '—') + '</td></tr>';
    }).join('');

    const css =
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'body{font-family:"Helvetica Neue",Arial,sans-serif;font-size:10.5pt;line-height:1.7;color:#24282D;background:#fff;padding:16mm 14mm;}' +
      '@media print{.aviso{display:none !important;} body{padding:0;}}' +
      '@page{size:A4;margin:20mm 18mm;}' +
      '.aviso{background:#E7EEEC;border-left:4px solid #2C313A;padding:10px 14px;margin-bottom:20px;font-size:10pt;color:#21262E;border-radius:3px;}' +
      '.enc{text-align:center;border-bottom:2px solid #2C313A;padding-bottom:14px;margin-bottom:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.tit{font-size:14pt;font-weight:bold;color:#2C313A;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}' +
      '.sub{font-size:10pt;color:#5C6168;margin-top:4px;line-height:1.4;}' +
      '.sec{margin-bottom:18px;page-break-inside:avoid;}' +
      '.sec-t{font-size:8pt;font-weight:bold;color:#2C313A;text-transform:uppercase;letter-spacing:1px;border-bottom:1.5px solid #2C313A;padding-bottom:4px;margin-bottom:8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      'p{margin-bottom:8px;text-align:justify;orphans:3;widows:3;}' +
      'table{width:100%;border-collapse:collapse;font-size:9pt;margin:8px 0;}' +
      'thead{display:table-header-group;} tr{page-break-inside:avoid;}' +
      'th{background:#2C313A;color:#fff;padding:6px 8px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.3px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      'td{padding:5px 8px;border:1px solid #D7D6CE;font-size:9.5pt;}' +
      'tr:nth-child(even) td{background:#F4F4F0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '.num{text-align:right;font-variant-numeric:tabular-nums;}' +
      '.veredicto{border:1.5px solid #2C313A;padding:12px 14px;margin:10px 0;font-weight:bold;}' +
      '.firmas{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:50px;page-break-inside:avoid;}' +
      '.firma{border-top:1px solid #24282D;padding-top:8px;text-align:center;font-size:10pt;color:#5C6168;margin-top:46px;}' +
      '.firma b{display:block;font-size:10.5pt;color:#24282D;}';

    const doc =
      '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
      '<title>Consulta escrita ' + esc(est.codigo) + '</title><style>' + css + '</style></head><body>' +
      '<div class="aviso"><strong>Para guardar como PDF:</strong> presione Ctrl+P (Windows) o Cmd+P (Mac) y elija "Guardar como PDF" como destino de impresión.</div>' +
      '<div class="enc"><div class="tit">Acta de consulta por escrito</div>' +
      '<div class="sub">' + esc(est.condominio || 'Condominio') + '</div>' +
      '<div class="sub">Artículo 15 de la Ley N° 21.442 sobre Copropiedad Inmobiliaria</div>' +
      '<div class="sub">Consulta N° ' + esc(est.codigo) + '</div></div>' +

      '<div class="sec"><div class="sec-t">1. Sesión informativa previa</div>' +
      '<p>Con carácter previo a la presente consulta, y conforme lo exige el artículo 15 de la Ley N° 21.442, ' +
      'se expuso la propuesta en sesión informativa celebrada el <strong>' + fmtFecha(est.info_fecha) + '</strong>, ' +
      'en modalidad <strong>' + esc(MODALIDAD[est.info_modalidad] || est.info_modalidad || '—') + '</strong>, ' +
      'con la asistencia de <strong>' + (est.info_asistentes || 0) + '</strong> participantes. ' +
      'Dicha sesión no requiere quórum mínimo para su constitución.</p>' +
      (est.info_observacion ? '<p>' + esc(est.info_observacion) + '</p>' : '') + '</div>' +

      '<div class="sec"><div class="sec-t">2. Materia sometida a acuerdo</div><p>' + esc(est.materia) + '</p>' +
      '<p>La materia se sometió a <strong>quórum de asamblea ' + esc(NOMBRE_QUORUM[est.tipo_quorum] || est.tipo_quorum) + '</strong>.</p></div>' +

      '<div class="sec"><div class="sec-t">3. Plazo y forma de la consulta</div>' +
      '<p>La consulta se remitió a los correos electrónicos singularizados en el Registro de Copropietarios, ' +
      'conforme al artículo 17 del Reglamento de la Ley N° 21.442. El plazo para responder se extendió desde ' +
      'el <strong>' + fmtFecha(est.plazo_inicio) + '</strong> hasta el <strong>' + fmtFecha(est.plazo_fin) + '</strong>.</p>' +
      // Desde el 28-09-2026 (CN-011) el Worker verifica la firma DKIM del
      // dominio remitente: el acta dice lo que de verdad se comprobó.
      '<p>La identidad de quienes respondieron se verificó por la casilla de correo desde la cual fue enviada ' +
      'cada respuesta, la que debe corresponder a la registrada para la respectiva unidad, y por la firma ' +
      'electrónica (DKIM) con que el proveedor de esa casilla autentica sus envíos, la que además debía vincular ' +
      'la respuesta a esta consulta y fecharla. Una respuesta sin esa firma no se contó por sí sola: quedó para ' +
      'calificación de la Mesa; un mismo correo recibido dos veces se contó una vez, y una respuesta anterior ' +
      'no reemplazó a una posterior. Se consultó a ' +
      '<strong>' + (est.convocados || 0) + '</strong> copropietarios.</p></div>' +

      '<div class="sec"><div class="sec-t">4. Respuestas recibidas</div>' +
      '<table><thead><tr><th>Unidad</th><th>Copropietario</th><th>Casilla</th><th>Derechos</th><th>Respuesta</th><th>Recepción</th></tr></thead>' +
      '<tbody>' + filasHtml + '</tbody></table>' +
      (resueltas > 0 ? '<p><em>Nota: ' + resueltas + ' respuesta(s) fueron calificadas por la Mesa a partir del ' +
        'texto recibido, por no ser concluyentes en su redacción.</em></p>' : '') +
      (pend > 0 ? '<p><em>Nota: ' + pend + ' respuesta(s) no pudieron ser calificadas y no se computaron.</em></p>' : '') +
      '</div>' +

      '<div class="sec"><div class="sec-t">5. Cómputo</div>' +
      '<table><tbody>' +
      '<tr><td>Derechos que aprueban</td><td class="num">' + pct(a) + '</td></tr>' +
      '<tr><td>Derechos que rechazan</td><td class="num">' + pct(r) + '</td></tr>' +
      '<tr><td>Copropietarios sin respuesta</td><td class="num">' + est.sin_responder + '</td></tr>' +
      '</tbody></table>' +
      '<div class="veredicto">' + v.texto + '</div></div>' +

      '<div class="firmas">' +
      '<div class="firma"><b>Presidente del Comité de Administración</b>Nombre y firma</div>' +
      '<div class="firma"><b>Administrador</b>Nombre y firma</div>' +
      '</div>' +
      '<p style="margin-top:26px;font-size:9pt;color:#5C6168;">Documento generado el ' + fmtFecha(new Date().toISOString()) +
      '. Cuando el acuerdo verse sobre las materias señaladas en la letra a) del N° 2 o en el N° 3 del ' +
      'artículo 15 de la Ley N° 21.442, deberá además reducirse a escritura pública.</p>' +
      '</body></html>';

    const w = window.open('', '_blank');
    if(!w){ msg('panel-msg','El navegador bloqueó la ventana. Permita las ventanas emergentes e intente de nuevo.','err'); return; }
    w.document.write(doc); w.document.close();
    msg('panel-msg','Documento generado en una pestaña nueva.','ok');
  }catch(err){
    msg('panel-msg','No se pudo generar el documento. ' + (err.message||''), 'err');
  }finally{ busy(btn, false); }
}

async function cerrar(btn){
  if(!confirm('¿Cerrar la consulta? Después de cerrarla ya no se aceptarán más respuestas.')) return;
  busy(btn, true, 'Cerrando…');
  try{
    const { error } = await sb.rpc('cc_cerrar', { p_codigo:C.codigo, p_token:C.token });
    if(error) throw error;
    if(timer) clearInterval(timer);
    await refrescar(false);
    msg('panel-msg','Consulta cerrada. Ya no se aceptarán más respuestas; el documento sigue disponible.','ok');
  }catch(e){
    msg('panel-msg','No se pudo cerrar. ' + (e.message||''), 'err');
  }finally{ busy(btn, false); }
}

// Recuperación en dos pasos: primero lo guardado en este equipo; si no hay
// nada, se buscan las consultas de la cuenta. Una consulta dura días, así que
// perder el navegador no puede significar perder la consulta.
async function listarMisConsultas(){
  try{
    const { data, error } = await sb.rpc('cc_mis_consultas');
    if(error) throw error;
    const lista = data || [];
    if(lista.length === 0){
      msg('nueva-msg','Su cuenta no tiene consultas de los últimos 180 días.','err');
      return;
    }
    const cont = $('mis-lista');
    cont.innerHTML = '';
    lista.forEach(c => {
      const fila = document.createElement('div');
      fila.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-top:1px solid #E6EDF4;flex-wrap:wrap';
      fila.innerHTML = '<div style="flex:1;min-width:190px"><b style="letter-spacing:2px;color:var(--graf)">' + esc(c.codigo) + '</b>' +
        '<div class="muted" style="font-size:12.5px">' + esc(c.condominio || 'Sin condominio') + ' · ' +
        (c.cerrada ? 'cerrada' : 'vence ' + fmtFecha(c.plazo_fin)) + '</div></div>';
      const b = document.createElement('button');
      b.className = 'btn btn-ghost btn-sm'; b.textContent = 'Abrir';
      b.addEventListener('click', () => {
        C = { codigo:c.codigo, token:c.admin_token, materia:c.materia, condo:c.condominio };
        guardar(); $('mis-consultas').classList.add('hidden'); abrirPanel();
      });
      fila.appendChild(b);
      cont.appendChild(fila);
    });
    $('mis-consultas').classList.remove('hidden');
    msg('nueva-msg','');
  }catch(e){
    msg('nueva-msg', /no autorizado/.test(String(e.message||''))
      ? 'Entre a su cuenta para recuperar sus consultas.'
      : 'No pudimos consultar sus consultas. ' + (e.message||''), 'err');
    if(/no autorizado/.test(String(e.message||''))) pintarPago();
  }
}

$('lnk-reanudar').addEventListener('click', function(ev){
  ev.preventDefault();
  const g = recuperar();
  if(g && g.codigo){ C = g; abrirPanel(); return; }
  listarMisConsultas();
});

(function inicio(){
  // Mismo portero que el generador de actas: sin sesion no se entra.
  Cuenta.exigirSesion({
    titulo: 'Entre para su consulta',
    sub: 'Con su cuenta puede volver a la consulta, ver las respuestas y descargar el expediente.'
  }, function(u){
    USUARIO = u;
    // La vuelta desde la pasarela espera a la sesion: sin su token el Worker
    // no entrega la llave.
    retornoDePago();
    // Esto corre en cada carga. Sin la guarda, en vitrina reventaba aqui y la
    // pagina entera quedaba sin arrancar: ni panel, ni consulta recuperada.
    if($('c-pago') && !$('c-pago').classList.contains('hidden')) pintarPago();
    const g = recuperar();
    if(g && g.codigo){ C = g; abrirPanel(); }
  });
})();

// Reemplaza a la expresion que estaba en el atributo onclick.
function cerrarPago() {
  var el = document.getElementById('c-pago');
  if (el) el.classList.add('hidden');
}
