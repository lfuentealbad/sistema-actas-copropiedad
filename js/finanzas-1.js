/* =====================================================================
 *  Gestion economica del condominio  ·  Ley N° 21.442
 *
 *  Modulo de cuentas del comite: reparte los gastos del mes entre las
 *  unidades segun su alicuota, lleva el fondo comun de reserva (art. 39) y
 *  emite la liquidacion que exige el art. 31.
 *
 *  Ojo con el art. 6: la regla es contribuir "en proporcion al derecho que
 *  le corresponda en los bienes de dominio comun", pero termina con "salvo
 *  que el reglamento de copropiedad establezca otra forma de contribucion".
 *  Esta herramienta solo sabe repartir por alicuota. Un condominio cuyo
 *  reglamento reparta de otra manera no puede usarla tal cual, y la pagina
 *  se lo tiene que decir.
 *
 *  Los datos viven en el navegador de quien administra (localStorage).
 *  No se suben: el respaldo lo baja y lo guarda la propia persona. Y como
 *  ese archivo pasa de mano en mano, el que se importa lo escribio otro: se
 *  revisa campo por campo antes de entrar (ver sanearEstado, en RESPALDOS).
 *
 *  Sin manejadores en linea: los botones llevan data-ac= y los resuelve
 *  js/acciones.js. Toda funcion invocada desde el HTML tiene que ser
 *  global (declarada con "function" en el nivel superior de este archivo).
 * ===================================================================== */


/* ============ ESTADO Y PERSISTENCIA ============ */
const STORAGE_KEY = 'actaviva_finanzas_v1';
const CATEGORIAS_EGRESO = [
  // Los cuatro tipos de gasto común ordinario (de administración, de
  // mantención, de reparación y de uso o consumo) y el extraordinario los
  // define el art. 2 de la Ley. El art. 9 es otra cosa: el primer reglamento
  // de copropiedad. El resto de las categorías es uso corriente del rubro.
  { grupo:'ordinario', cat:'Administración', desc:'Honorarios, remuneraciones, conserjería, cotizaciones previsionales' },
  { grupo:'ordinario', cat:'Mantención', desc:'Aseo, mantención áreas comunes, ascensores, equipos' },
  { grupo:'ordinario', cat:'Reparación', desc:'Arreglo de desperfectos en bienes comunes' },
  { grupo:'ordinario', cat:'Servicios básicos', desc:'Agua, luz, gas, telecomunicaciones (uso o consumo)' },
  { grupo:'ordinario', cat:'Mantenimiento de bombas', desc:'Sistema de bombeo y agua potable' },
  { grupo:'ordinario', cat:'Jardinería', desc:'Servicio de jardinería y áreas verdes' },
  { grupo:'ordinario', cat:'Seguros', desc:'Prima seguro colectivo contra incendio (art. 43 Ley)' },
  { grupo:'ordinario', cat:'Caja chica', desc:'Gastos menores con boletas' },
  { grupo:'ordinario', cat:'Reemplazo de conserjería', desc:'Turnos de reemplazo' },
  { grupo:'ordinario', cat:'Avances de personal', desc:'Adelantos de remuneraciones' },
  { grupo:'ordinario', cat:'Liquidaciones', desc:'Liquidaciones mensuales del personal' },
  { grupo:'ordinario', cat:'Finiquitos', desc:'Indemnizaciones por término de contrato' },
  { grupo:'ordinario', cat:'Previred', desc:'Pago cotizaciones previsionales' },
  { grupo:'ordinario', cat:'Artículos de limpieza', desc:'Insumos de aseo' },
  { grupo:'ordinario', cat:'Uso o consumo', desc:'Software administrativo, otros consumos' },
  { grupo:'extraordinario', cat:'Gastos extraordinarios', desc:'Gastos imprevistos no presupuestados' },
];

const estadoInicial = {
  config:{
    condNombre:'', condRut:'', condDir:'', condComuna:'',
    admNombre:'', admRut:'', admCorreo:'', admTel:'', admRegistro:'', admFirma:'',
    porcFondo:5, tasaMora:1.5, diaVenc:18,
    // El tope de la mora (art. 7) es la mitad del interés corriente bancario,
    // que publica la CMF y cambia todos los meses. No se puede saber sin red,
    // así que se pide: con ese dato el sistema aplica el tope solo.
    interesCorriente:0,
    banco:'', bancoTipo:'Cuenta corriente', bancoNum:'', bancoTitular:'',
    obs:'',
    segCia:'', segPoliza:'', segVig:'', segPrima:0, segCuotas:0, segCuotaAct:0,
  },
  unidades: [],
  cobros: [],
  egresos: [],
  ingresos: [],
  fondo: [], // movimientos del fondo común de reserva
  mantenciones: [],
  contadorFolio: 1000,
  foliosLiq: {},   // "unidadId|periodo" -> folio ya emitido, para que no cambie
};
let estado = JSON.parse(JSON.stringify(estadoInicial));

function cargar(){
  // Protegidas con contrasena: las abre el candado (abrirCandado), no esto.
  if(hayCofre()) return;
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      // Pasa por la misma revision que un respaldo: lo que esta guardado aqui
      // pudo venir de un respaldo importado antes de que la revision
      // existiera, y quedo tal cual. Lo que esta pagina guarda pasa intacto.
      const r = sanearEstado(JSON.parse(raw));
      estado = r.estado;
      if(r.descartadas || r.idsNuevos){
        guardar();
        toast('Se corrigieron datos guardados que no tenían un formato válido. Conviene revisar las cuentas.', 'warning');
      }
    }
  }catch(e){ console.error(e); }
}
// Sin contrasena, como siempre: en claro, y si no cabe lanza. Con
// contrasena, cifrado (js/finanzas-cofre.js) y devuelve una promesa que dice
// si se pudo; si no, ya lo aviso. Con el cofre cerrado no escribe nada: ni en
// claro ni encima de lo cifrado.
function guardar(){
  if(hayCofre()){
    if(!CofreFinanzas.abierto()) return Promise.resolve(false);
    return CofreFinanzas.guardar(JSON.stringify(estado)).then(()=>true, err=>{
      toast('No se pudo guardar en este navegador: ' + ((err && err.message) || 'error desconocido'), 'danger');
      return false;
    });
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(estado));
  // Las primeras cuentas que se escriben cambian el aviso de arriba.
  pintarCofre();
}

/* ============ CONTRASENA DE ESTE EQUIPO (CN-003) ============
 *  Las cuentas no salen del navegador, y en un equipo compartido las ve
 *  quien abra la pagina. Protegidas, la copia del equipo queda cifrada y la
 *  pagina abre con un candado. Ver js/finanzas-cofre.js.
 */
const BLOQUEO_INACTIVA_MIN = 15;
let _respaldoAntesDeProteger = false;
let _relojBloqueo = null;

function hayCofre(){
  return typeof CofreFinanzas !== 'undefined' && CofreFinanzas.protegido();
}
// Hay algo que proteger: una planilla vacia no es dato de nadie.
function hayDatos(e){
  e = e || estado;
  return ['unidades','cobros','egresos','ingresos','fondo','mantenciones'].some(k => (e[k]||[]).length > 0)
    || !!(e.config && (e.config.condNombre || e.config.admNombre));
}

function mostrarCandado(){
  document.querySelectorAll('.app, .cinta').forEach(el => { el.hidden = true; });
  const c = document.getElementById('candado');
  c.hidden = false;
  const inp = document.getElementById('candadoClave');
  if(inp && !inp._oyente){
    inp._oyente = true;
    inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); abrirCandado(); } });
  }
  if(inp) inp.focus();
}

async function abrirCandado(){
  const inp = document.getElementById('candadoClave');
  const msg = document.getElementById('candadoMsg');
  const btn = document.getElementById('candadoAbrir');
  btn.disabled = true;
  msg.textContent = 'Abriendo…';
  let texto;
  try{
    texto = await CofreFinanzas.abrir(inp.value);
  }catch(err){
    const m = err && err.message;
    msg.textContent = m === 'contrasena_incorrecta' ? 'La contraseña no es la correcta.'
      : m === 'copia_danada' ? 'La copia protegida de este equipo está dañada y no se puede abrir. Si tiene un respaldo, use «Olvidé la contraseña».'
      : m === 'sin_cifrado' ? 'Este navegador no puede descifrar. Ábrala en un navegador actualizado.'
      : 'No se pudo abrir: ' + (m || 'error desconocido');
    btn.disabled = false;
    inp.select();
    return;
  }
  inp.value = '';
  const r = sanearEstado(JSON.parse(texto));
  estado = r.estado;
  // Una copia en claro junto a la cifrada solo queda si se corto la luz entre
  // escribir la cifrada y borrar la otra: lo que vale ya esta en el cofre.
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  document.getElementById('candado').hidden = true;
  msg.textContent = '';
  btn.disabled = false;
  document.querySelectorAll('.app, .cinta').forEach(el => { el.hidden = false; });
  arrancar();
  if(r.descartadas || r.idsNuevos){
    await guardar();
    toast('Se corrigieron datos guardados que no tenían un formato válido. Conviene revisar las cuentas.', 'warning');
  }
}

function olvideClave(){
  document.getElementById('candadoOlvido').hidden = false;
}

// Sin la contrasena no hay forma de abrirla. Lo unico que se puede hacer es
// borrar la copia protegida y empezar de cero, o cargar un respaldo.
async function borrarCopiaProtegida(){
  const ok1 = await confirmar({
    titulo:'Borrar la copia protegida',
    mensaje:'Sin la contraseña nadie puede abrirla, ni usted ni nosotros. Si la borra, en este equipo no queda nada de esas cuentas; si tiene un respaldo, después puede importarlo.\nNo se puede deshacer.',
    okText:'Continuar', variant:'danger'
  });
  if(!ok1) return;
  const ok2 = await confirmar({
    titulo:'Confirmación final',
    mensaje:'Si estas cuentas son de otra persona, también se pierden para ella en este equipo. ¿Borrar la copia protegida?',
    okText:'Sí, borrar', variant:'danger'
  });
  if(!ok2) return;
  CofreFinanzas.olvidar();
  location.reload();
}

function abrirProteger(){
  if(typeof CofreFinanzas === 'undefined' || !CofreFinanzas.disponible()){
    toast('Este navegador no puede cifrar. Use uno actualizado.', 'danger');
    return;
  }
  _respaldoAntesDeProteger = false;
  document.getElementById('protegerClave').value = '';
  document.getElementById('protegerClave2').value = '';
  document.getElementById('protegerMsg').textContent = '';
  document.getElementById('protegerRespaldoOk').textContent = '';
  document.getElementById('protegerOk').disabled = true;
  abrirModal('mProteger');
}

// Sin contrasena no hay como volver a abrirlas: antes de protegerlas se baja
// un respaldo. El boton de proteger no se habilita sin esto.
function protegerRespaldo(){
  exportarRespaldo();
  _respaldoAntesDeProteger = true;
  document.getElementById('protegerRespaldoOk').textContent = 'Respaldo descargado. Guárdelo donde solo usted lo vea: el archivo no queda protegido.';
  document.getElementById('protegerOk').disabled = false;
}

async function protegerConClave(){
  const msg = document.getElementById('protegerMsg');
  const c1 = document.getElementById('protegerClave');
  const c2 = document.getElementById('protegerClave2');
  if(!_respaldoAntesDeProteger){ msg.textContent = 'Primero baje el respaldo.'; return; }
  if(c1.value.length < CofreFinanzas.MINIMO){ msg.textContent = `La contraseña debe tener al menos ${CofreFinanzas.MINIMO} caracteres.`; return; }
  if(c1.value !== c2.value){ msg.textContent = 'Las dos contraseñas no coinciden.'; return; }
  const btn = document.getElementById('protegerOk');
  btn.disabled = true;
  msg.textContent = 'Protegiendo…';
  try{
    await CofreFinanzas.proteger(JSON.stringify(estado), c1.value);
  }catch(err){
    msg.textContent = 'No se pudo proteger: ' + ((err && err.message) || 'error desconocido') + '. Las cuentas siguen como estaban.';
    btn.disabled = false;
    return;
  }
  // Recien con la copia cifrada escrita y comprobada se quita la otra.
  try{ localStorage.removeItem(STORAGE_KEY); }catch(e){}
  c1.value = ''; c2.value = '';
  msg.textContent = '';
  cerrarModal('mProteger');
  pintarCofre();
  vigilarBloqueo();
  toast('Protegidas. Desde ahora, esta página pide la contraseña al abrirse.', 'success');
}

// Vuelve a dejarlas en claro: primero se escribe la copia en claro y recien
// despues se borra la cifrada, para que nunca haya cero copias.
async function quitarClave(){
  const ok = await confirmar({
    titulo:'Quitar la contraseña',
    mensaje:'Las cuentas vuelven a quedar legibles para cualquiera que use este navegador.',
    okText:'Quitar', variant:'warning'
  });
  if(!ok) return;
  await CofreFinanzas.esperar();
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(estado)); }
  catch(err){ toast('No se pudo guardar en claro: ' + err.message + '. Siguen protegidas.', 'danger'); return; }
  CofreFinanzas.olvidar();
  pintarCofre();
  toast('Contraseña quitada.', 'success');
}

async function bloquearFinanzas(){
  if(typeof CofreFinanzas === 'undefined') return;
  await CofreFinanzas.esperar();
  CofreFinanzas.cerrar();
  estado = JSON.parse(JSON.stringify(estadoInicial));
  location.reload();
}

// Con la copia protegida y abierta: se bloquea tras BLOQUEO_INACTIVA_MIN sin
// uso y cuando se cierra la sesion de la cuenta en otra pestana.
function vigilarBloqueo(){
  if(!hayCofre() || !CofreFinanzas.abierto() || window._vigilaBloqueo) return;
  window._vigilaBloqueo = true;
  const reiniciar = ()=>{
    if(_relojBloqueo) clearTimeout(_relojBloqueo);
    _relojBloqueo = setTimeout(()=>{ if(hayCofre() && CofreFinanzas.abierto()) bloquearFinanzas(); },
                               BLOQUEO_INACTIVA_MIN * 60000);
  };
  ['pointerdown','keydown','wheel','touchstart'].forEach(t => document.addEventListener(t, reiniciar, { passive:true }));
  reiniciar();
  window.addEventListener('storage', e=>{
    if(!hayCofre() || !CofreFinanzas.abierto()) return;
    if(e.key === null || (/^sb-.*-auth-token$/.test(e.key || '') && e.newValue == null)) bloquearFinanzas();
  });
}

// El aviso de arriba y la tarjeta de Respaldo dicen en que estado esta.
function pintarCofre(){
  const aviso = document.getElementById('avisoDatosTexto');
  const tarjeta = document.getElementById('cofreEstado');
  const puede = typeof CofreFinanzas !== 'undefined' && CofreFinanzas.disponible();
  const protegidas = hayCofre() && CofreFinanzas.abierto();
  let a, t;
  if(protegidas){
    a = 'Protegidas con contraseña en este equipo. Se bloquean al cerrar la pestaña, tras '
      + BLOQUEO_INACTIVA_MIN + ' minutos sin uso o al cerrar sesión. '
      + '<button type="button" class="btn sm" data-ac="bloquearFinanzas">Bloquear ahora</button>';
    t = '<p class="muted" style="font-size:12.5px">Las cuentas están cifradas en este navegador. Sin la contraseña nadie puede abrirlas, ni usted ni nosotros: guarde el respaldo.</p>'
      + '<div class="btn-row"><button type="button" class="btn" data-ac="bloquearFinanzas">Bloquear ahora</button>'
      + '<button type="button" class="btn" data-ac="quitarClave">Quitar la contraseña</button></div>';
  } else if(hayDatos()){
    a = '<b>Estas cuentas quedan en este navegador sin contraseña:</b> cualquiera que use este equipo puede verlas. '
      + (puede ? '<button type="button" class="btn sm" data-ac="abrirProteger">Proteger con contraseña</button> ' : '')
      + 'Baje un respaldo cada cierto tiempo desde <b>Respaldo y datos</b>.';
    t = '<p class="muted" style="font-size:12.5px">En un equipo que usan otras personas, protéjalas: la copia de este navegador queda cifrada y la página pide la contraseña al abrirse.</p>'
      + '<div class="btn-row"><button type="button" class="btn primary" data-ac="abrirProteger"' + (puede ? '' : ' disabled') + '>Proteger con contraseña</button></div>';
  } else {
    return; // sin datos queda el aviso de siempre
  }
  if(aviso) aviso.innerHTML = a;
  if(tarjeta) tarjeta.innerHTML = t;
}

/* ============ UTILIDADES ============ */
const fmtCLP = n => '$ ' + (Math.round(n||0)).toLocaleString('es-CL').replace(/,/g,'.');
// % Alícuota sin ceros sobrantes a la derecha y con coma decimal chilena
const fmtPct = n => {
  const v = Number(n||0);
  if(!v) return '0%';
  const s = parseFloat(v.toFixed(4)).toString();
  return s.replace('.', ',') + '%';
};
// Cualquier número entero con separador de miles (ej. folios)
const fmtNum = n => Number(n||0).toLocaleString('es-CL').replace(/,/g,'.');
// RUT chileno con puntos cada 3 dígitos y guion al DV
const fmtRut = s => {
  if(!s) return '';
  const clean = String(s).replace(/\./g,'').replace(/\s/g,'').toUpperCase();
  // Si tiene guión: separar cuerpo y DV
  let cuerpo, dv;
  const idx = clean.indexOf('-');
  if(idx >= 0){ cuerpo = clean.slice(0, idx); dv = clean.slice(idx+1); }
  else if(clean.length >= 2){ cuerpo = clean.slice(0,-1); dv = clean.slice(-1); }
  else return clean;
  cuerpo = cuerpo.replace(/[^0-9]/g,'').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return cuerpo ? cuerpo + '-' + dv : dv;
};
// Un "2026-09-04" suelto lo interpreta Date como medianoche UTC, que en Chile
// son las 20:00 del día ANTERIOR: al formatearlo en hora local, toda fecha
// guardada salía impresa un día antes. Se arman los componentes a mano.
const fmtFecha = s => {
  if(!s) return '';
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  const d = p ? new Date(+p[1], +p[2]-1, +p[3]) : new Date(s);
  return isNaN(d) ? '' : d.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'});
};
// Los dos formatos de periodo solo devuelven un nombre de mes y digitos. Antes
// copiaban el ano tal como venia ("<lo que sea>-03" salia "marzo <lo que
// sea>"), y el periodo de un cobro llega del respaldo, que puede haberlo
// escrito otra persona. Lo que no tiene forma AAAA-MM sale vacio.
const RE_PERIODO_INICIO = /^(\d{4})-(0[1-9]|1[0-2])/;
const fmtPeriodoLargo = s => {
  const p = RE_PERIODO_INICIO.exec(String(s||''));
  if(!p) return '';
  const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${meses[parseInt(p[2],10)-1]} ${p[1]}`;
};
const fmtPeriodoCorto = s => {
  const p = RE_PERIODO_INICIO.exec(String(s||''));
  if(!p) return '';
  const meses=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  return `${meses[parseInt(p[2],10)-1]} '${p[1].slice(2)}`;
};
// Fechas en hora local, nunca en UTC. toISOString() convierte a UTC, y Chile
// va tres o cuatro horas atras: un egreso anotado a las 21:00 del 31 de marzo
// quedaba con fecha 1 de abril y caia en el periodo equivocado. Se arma el
// texto a mano desde los campos locales del Date.
const dosCifras = n => String(n).padStart(2, '0');
const aFechaLocal = d => `${d.getFullYear()}-${dosCifras(d.getMonth()+1)}-${dosCifras(d.getDate())}`;
const aPeriodoLocal = d => `${d.getFullYear()}-${dosCifras(d.getMonth()+1)}`;
const periodoActual = () => aPeriodoLocal(new Date());
const fechaHoy = () => aFechaLocal(new Date());
const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const escapeHtml = s => String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// escapeHtml cubre las dos comillas, asi que sirve tambien dentro de un
// atributo, y todo dato que va a data-args, id o value pasa por ella. Pero a
// un identificador no le basta con eso: el despachador (acciones.js) parte
// data-args por "|" y lee "n:" y "b:" como tipos, de modo que un id con esos
// caracteres cambia los argumentos aunque no cierre el atributo. Por eso los
// ids tienen ademas un formato cerrado, que sanearEstado hace cumplir.
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;
const esPeriodo = s => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
// Para mirar una tabla con una clave que viene de afuera sin tropezar con
// lo heredado: PANE_RENDERERS['__proto__'] es "verdadero" y no es funcion.
const propia = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// SAST-06. escapeHtml impide cerrar el atributo, pero no mira el esquema:
// "javascript:alert(1)" no tiene nada que escapar y salia intacto en el href
// del respaldo digital de un gasto. La CSP igual lo bloquearia (no hay
// 'unsafe-inline'), pero no puede ser la CSP la unica que sabe que eso no es
// un enlace. La direccion se interpreta con el mismo lector del navegador
// -asi " JAVASCRIPT:" o "java<tab>script:" no lo enganan- y solo pasan http
// y https. Devuelve la direccion normalizada, o null si no es un enlace.
const urlSegura = s => {
  if(typeof s !== 'string' || !s.trim()) return null;
  let u;
  try{ u = new URL(s.trim()); }catch(_){ return null; }
  return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null;
};
// La firma del administrador termina en un <img src>. Ahi vale ademas una
// imagen incrustada (data:image/...), que es lo unico que la CSP deja
// mostrar aparte de lo del propio sitio. Nada de data:text/html ni de SVG.
const urlImagenSegura = s => {
  if(typeof s !== 'string') return null;
  const t = s.trim();
  if(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+\/=]+$/i.test(t)) return t;
  return urlSegura(t);
};
const periodosUlt = (n, hasta) => {
  const arr=[]; const [y,m] = (hasta||periodoActual()).split('-').map(Number);
  let d = new Date(y, m-1, 1);
  for(let i=0;i<n;i++){ arr.unshift(aPeriodoLocal(d)); d.setMonth(d.getMonth()-1); }
  return arr;
};

// Cuelga un oyente solo si el elemento existe. Ver el comentario de los
// filtros mas abajo: sin esta guarda, un id renombrado mata el modulo entero.
function oir(ids, evento, fn){
  (Array.isArray(ids) ? ids : [ids]).forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.addEventListener(evento, fn);
    else if(window.console) console.warn('Falta el elemento #' + id);
  });
}

/* === TOAST con variantes e icono === */
const TOAST_ICONS = {
  default: '',
  success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  danger:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
};
let _toastTimer;
function toast(msg, variant='default'){
  const t = document.getElementById('toast');
  t.className = 'toast';
  if(variant !== 'default') t.classList.add(variant);
  t.innerHTML = (TOAST_ICONS[variant]||'') + '<span>'+escapeHtml(msg)+'</span>';
  // Force reflow para reiniciar la animación
  void t.offsetWidth;
  t.classList.add('show');
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>t.classList.remove('show'), variant==='danger'?4000:2600);
}

/* === FOCUS TRAP para modales === */
const _focusTraps = new Map();
function getFocusable(el){
  return [...el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(n=>n.offsetParent !== null);
}
function trapFocus(modal){
  if(_focusTraps.has(modal.id)) return;
  const lastFocused = document.activeElement;
  const handler = e=>{
    if(e.key === 'Escape'){
      // Excepción: si es el modal de confirmación, cancela
      if(modal.id === 'mConfirm'){ document.getElementById('mConfirmCancel').click(); return; }
      cerrarModal(modal.id);
      return;
    }
    if(e.key !== 'Tab') return;
    const focusable = getFocusable(modal);
    if(!focusable.length) return;
    const first = focusable[0], last = focusable[focusable.length-1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  };
  modal.addEventListener('keydown', handler);
  _focusTraps.set(modal.id, {handler, lastFocused});
  // Mover foco al primer elemento focusable del modal
  setTimeout(()=>{
    const focusable = getFocusable(modal);
    if(focusable.length) focusable[0].focus();
    else modal.querySelector('.panel')?.focus?.();
  }, 50);
}
function releaseFocus(modal){
  const trap = _focusTraps.get(modal.id);
  if(!trap) return;
  modal.removeEventListener('keydown', trap.handler);
  _focusTraps.delete(modal.id);
  // Restaurar foco al elemento que abrió el modal
  if(trap.lastFocused && trap.lastFocused.focus) trap.lastFocused.focus();
}

/* === CONFIRM accesible (reemplaza window.confirm) === */
function confirmar(opciones){
  // opciones = { titulo, mensaje, okText, cancelText, variant: 'danger'|'warning'|'primary' }
  return new Promise((resolve)=>{
    const modal = document.getElementById('mConfirm');
    const title = document.getElementById('mConfirmTitle');
    const desc  = document.getElementById('mConfirmDesc');
    const icon  = document.getElementById('mConfirmIcon');
    const ok    = document.getElementById('mConfirmOk');
    const cancel= document.getElementById('mConfirmCancel');
    title.textContent = opciones.titulo || 'Confirmar acción';
    desc.textContent  = opciones.mensaje || '';
    ok.textContent    = opciones.okText || 'Confirmar';
    cancel.textContent= opciones.cancelText || 'Cancelar';
    const variant = opciones.variant || 'primary';
    icon.className = 'confirm-icon ' + variant;
    ok.className = 'btn ' + (variant==='danger'?'danger':variant==='warning'?'primary':'primary');
    if(variant==='danger') ok.classList.add('danger');
    const cleanup = (val)=>{
      ok.onclick = null; cancel.onclick = null;
      cerrarModal('mConfirm');
      resolve(val);
    };
    ok.onclick = ()=>cleanup(true);
    cancel.onclick = ()=>cleanup(false);
    abrirModal('mConfirm');
  });
}

/* ============ EL MES ACTIVO ============
 *  El mes es el estado de la aplicacion, no el filtro de una pantalla. Se
 *  elige en la cinta de arriba y lo siguen los gastos, los cobros y la
 *  liquidacion: cerrar un mes deja de ser un recorrido por diez secciones.
 *  Los copropietarios y los datos del condominio quedan fuera a proposito,
 *  porque no pertenecen a ningun mes.
 */
let mesActivo = periodoActual();

// Doce meses hacia atras mas el actual; se muestran los seis ultimos y el
// resto queda al alcance del desplazamiento lateral.
function renderCintaMeses(){
  const caja = document.getElementById('cintaMeses');
  if(!caja) return;
  const hoy = periodoActual();
  const lista = periodosUlt(12, hoy > mesActivo ? hoy : mesActivo);
  caja.innerHTML = lista.map(p=>
    `<button type="button" data-ac="irAlMes" data-args="${escapeHtml(p)}" class="${p===mesActivo?'act':''}"` +
    ` aria-pressed="${p===mesActivo}">${escapeHtml(fmtPeriodoCorto(p))}</button>`
  ).join('');
  const act = caja.querySelector('button.act');
  if(act && act.scrollIntoView) act.scrollIntoView({block:'nearest', inline:'center'});

  const u = document.getElementById('cintaUnidades');
  if(u) u.textContent = estado.unidades.length === 1
    ? '1 unidad' : `${fmtNum(estado.unidades.length)} unidades`;
}

// Cambiar de mes arrastra a todas las secciones que dependen de el.
function irAlMes(periodo){
  // El mes activo se vuelve a pintar dentro de atributos (la cinta): solo
  // entra si tiene forma de periodo.
  if(!esPeriodo(periodo)) return;
  mesActivo = periodo;
  ['cobroFiltroMes','egFiltroMes','liqMes'].forEach(function(id){
    const el = document.getElementById(id);
    if(el) el.value = periodo;
  });
  renderCintaMeses();
  const pane = (location.hash || '#dashboard').slice(1);
  const pinta = propia(PANE_RENDERERS, pane) ? PANE_RENDERERS[pane] : PANE_RENDERERS.dashboard;
  pinta();
}

/* ============ NAVEGACIÓN con hash routing ============ */
const PANE_RENDERERS = {
  dashboard: ()=>renderDashboard(),
  unidades:  ()=>renderUnidades(),
  cobros:    ()=>renderCobros(),
  egresos:   ()=>renderEgresos(),
  ingresos:  ()=>renderIngresos(),
  fondo:     ()=>renderFondo(),
  liquidacion: ()=>prepLiquidacion(),
  presupuesto: ()=>renderPresupuesto(),
  config:    ()=>cargarConfig(),
  datos:     ()=>{},
  legal:     ()=>{}
};
function navegarA(pane){
  // El nombre sale de la direccion (#...), que cualquiera puede escribir en
  // un enlace: "#__proto__" encontraba algo que no era una seccion y la
  // pagina se caia al llamarlo.
  if(!propia(PANE_RENDERERS, pane)) pane = 'dashboard';
  // Los enlaces de la cinta marcan donde esta uno; el mes no cambia al
  // moverse entre secciones.
  document.querySelectorAll('.cinta-der a[data-pane], .barra-abajo a[data-pane]').forEach(function(a){
    a.classList.toggle('act', a.getAttribute('data-pane') === pane);
  });
  document.querySelectorAll('.nav a').forEach(x=>{
    const isActive = x.dataset.pane === pane;
    x.classList.toggle('active', isActive);
    if(isActive) x.setAttribute('aria-current','page');
    else x.removeAttribute('aria-current');
  });
  document.querySelectorAll('.pane').forEach(x=>x.classList.remove('show'));
  const p = document.querySelector(`.pane[data-pane="${pane}"]`);
  if(p) p.classList.add('show');
  PANE_RENDERERS[pane]();
  // Mover foco al main para lectores de pantalla
  document.getElementById('main-content').focus({preventScroll:true});
}
function manejarHash(){
  const hash = (location.hash || '#dashboard').slice(1).split('/')[0];
  navegarA(hash);
}
window.addEventListener('hashchange', manejarHash);
document.querySelectorAll('.nav a').forEach(a=>{
  // Los <a href="#xxx"> ya disparan hashchange; solo evitamos scroll automático
  a.addEventListener('click', e=>{
    // Permitir Cmd/Ctrl+click para abrir en nueva pestaña (no aplica acá pero buena práctica)
    if(e.metaKey || e.ctrlKey) return;
  });
});

/* ============ MODAL HELPERS (con focus trap y ESC) ============ */
function abrirModal(id){
  const m = document.getElementById(id);
  m.classList.add('show');
  trapFocus(m);
}
function cerrarModal(id){
  const m = document.getElementById(id);
  m.classList.remove('show');
  releaseFocus(m);
}
document.querySelectorAll('.modal').forEach(m=>{
  m.addEventListener('click', e=>{
    if(e.target===m){
      if(m.id==='mConfirm'){ document.getElementById('mConfirmCancel').click(); return; }
      cerrarModal(m.id);
    }
  });
});

/* ============ CONFIGURACIÓN ============ */
function cargarConfig(){
  const c = estado.config;
  Object.entries({
    cfgCondNombre:'condNombre', cfgCondRut:'condRut', cfgCondDir:'condDir', cfgCondComuna:'condComuna',
    cfgAdmNombre:'admNombre', cfgAdmRut:'admRut', cfgAdmCorreo:'admCorreo', cfgAdmTel:'admTel',
    cfgAdmRegistro:'admRegistro', cfgAdmFirma:'admFirma',
    cfgPorcFondo:'porcFondo', cfgTasaMora:'tasaMora', cfgDiaVenc:'diaVenc',
    cfgInteresCorriente:'interesCorriente',
    cfgBanco:'banco', cfgBancoTipo:'bancoTipo', cfgBancoNum:'bancoNum', cfgBancoTitular:'bancoTitular',
    cfgObs:'obs',
    cfgSegCia:'segCia', cfgSegPoliza:'segPoliza', cfgSegVig:'segVig', cfgSegPrima:'segPrima',
    cfgSegCuotas:'segCuotas', cfgSegCuotaAct:'segCuotaAct'
  }).forEach(([id,k])=>{
    const el=document.getElementById(id); if(el) el.value=c[k]??'';
  });
  // Formatear RUTs cargados
  ['cfgCondRut','cfgAdmRut'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.value) el.value = fmtRut(el.value);
  });
}
function guardarConfig(){
  const c = estado.config;
  Object.entries({
    cfgCondNombre:'condNombre', cfgCondRut:'condRut', cfgCondDir:'condDir', cfgCondComuna:'condComuna',
    cfgAdmNombre:'admNombre', cfgAdmRut:'admRut', cfgAdmCorreo:'admCorreo', cfgAdmTel:'admTel',
    cfgAdmRegistro:'admRegistro', cfgAdmFirma:'admFirma',
    cfgBanco:'banco', cfgBancoTipo:'bancoTipo', cfgBancoNum:'bancoNum', cfgBancoTitular:'bancoTitular',
    cfgObs:'obs',
    cfgSegCia:'segCia', cfgSegPoliza:'segPoliza', cfgSegVig:'segVig'
  }).forEach(([id,k])=>{
    const el=document.getElementById(id); if(el) c[k]=el.value;
  });
  ['porcFondo','tasaMora','diaVenc','interesCorriente','segPrima','segCuotas','segCuotaAct'].forEach(k=>{
    const el=document.getElementById('cfg'+k.charAt(0).toUpperCase()+k.slice(1));
    if(el) c[k] = parseFloat(el.value)||0;
  });
  const avisos = [];
  // La firma va a un <img src> de la liquidacion: solo imagen incrustada o
  // enlace http(s) (urlImagenSegura). Otra cosa la borraria sola la revision
  // de cargar() al volver a abrir la pagina, sin decir nada; mejor decirlo
  // ahora, cuando la persona todavia tiene el campo delante.
  if(c.admFirma && !urlImagenSegura(c.admFirma)){
    c.admFirma = '';
    const campo = document.getElementById('cfgAdmFirma');
    if(campo) campo.value = '';
    avisos.push('La firma tiene que ser una imagen (data:image/...) o un enlace https://; la que se escribió no se usará.');
  }
  // Validación art. 39: mínimo 5%. Auditoria CN-019 (20-10-2026): el art.
  // 47 del Reglamento permite a condominios de viviendas sociales con
  // programas de autofinanciamiento rebajarlo temporalmente por acuerdo de
  // asamblea extraordinaria. Forzarlo a 5 % dejaba fuera ese caso: se avisa
  // y se respeta lo escrito.
  if(c.porcFondo < 5){
    avisos.push('El fondo de reserva queda bajo el mínimo del 5 % del art. 39. Solo procede en condominios de viviendas sociales con programas de autofinanciamiento, por acuerdo de asamblea extraordinaria (art. 47 del Reglamento).');
  }
  // Validación art. 7: la mora no puede pasar del 50% del interés corriente
  // bancario. Ese dato lo publica la CMF y aquí lo escribe la administración;
  // sin él no hay tope que calcular y solo se avisa.
  const topeMora = c.interesCorriente > 0 ? c.interesCorriente / 2 : 0;
  if(topeMora > 0 && c.tasaMora > topeMora){
    // Hacia abajo (auditoria CN-015): redondear al centesimo mas cercano
    // podia dejarla sobre el tope (2,35 % / 2 = 1,175 % -> 1,18 %).
    c.tasaMora = Math.floor(topeMora * 100) / 100;
    document.getElementById('cfgTasaMora').value = c.tasaMora;
    avisos.push(`El interés por mora se ajustó a ${fmtPct(c.tasaMora)}, el tope del art. 7.`);
  } else if(c.tasaMora > 0 && topeMora === 0){
    avisos.push('Falta el interés corriente bancario: sin ese dato no se puede comprobar el tope del art. 7.');
  }
  if(avisos.length) toast(avisos.join(' '), 'warning');
  else toast('Configuración guardada', 'success');
  guardar();
  renderDashboard();
}

/* ============ UNIDADES ============ */
// Los mismos seis del selector #uTipo. Los usan la planilla y el respaldo.
const TIPOS_UNIDAD = ['departamento','casa','local','bodega','estacionamiento','oficina'];
let unidadEditId = null;
function abrirUnidad(id){
  unidadEditId = id||null;
  const u = id ? estado.unidades.find(x=>x.id===id) : {tipo:'departamento'};
  document.getElementById('uCodigo').value = u.codigo||'';
  document.getElementById('uTipo').value = u.tipo||'departamento';
  document.getElementById('uPropietario').value = u.propietario||'';
  document.getElementById('uResidente').value = u.residente||'';
  document.getElementById('uCorreo').value = u.correo||'';
  document.getElementById('uTel').value = u.tel||'';
  document.getElementById('uAlicuota').value = u.alicuota||'';
  abrirModal('mUnidad');
}
function guardarUnidad(){
  const data = {
    codigo: document.getElementById('uCodigo').value.trim(),
    tipo: document.getElementById('uTipo').value,
    propietario: document.getElementById('uPropietario').value.trim(),
    residente: document.getElementById('uResidente').value.trim(),
    correo: document.getElementById('uCorreo').value.trim(),
    tel: document.getElementById('uTel').value.trim(),
    alicuota: parseFloat(document.getElementById('uAlicuota').value)||0,
  };
  if(!data.codigo){ toast('El código es obligatorio'); return; }
  if(unidadEditId){
    const i = estado.unidades.findIndex(x=>x.id===unidadEditId);
    estado.unidades[i] = Object.assign({}, estado.unidades[i], data);
  } else {
    estado.unidades.push(Object.assign({id:id()}, data));
  }
  guardar(); renderUnidades(); cerrarModal('mUnidad');
  toast(unidadEditId ? 'Unidad actualizada' : 'Unidad agregada');
  unidadEditId = null;
}
async function eliminarUnidad(id){
  const u = estado.unidades.find(x=>x.id===id);
  if(!u) return;
  const ok = await confirmar({
    titulo:`Eliminar unidad ${u.codigo}`,
    mensaje:`Se eliminará la unidad y todos sus cobros (pendientes y pagados).\nEsta acción no se puede deshacer.`,
    okText:'Eliminar',
    variant:'danger'
  });
  if(!ok) return;
  estado.unidades = estado.unidades.filter(x=>x.id!==id);
  estado.cobros = estado.cobros.filter(x=>x.unidadId!==id);
  guardar(); renderUnidades();
  toast(`Unidad ${u.codigo} eliminada`, 'success');
}
function balanceUnidad(uid){
  const cob = estado.cobros.filter(c=>c.unidadId===uid);
  const adeudado = cob.filter(c=>c.estado==='pendiente').reduce((s,c)=>s+(c.adeudado||0), 0);
  const pagado = cob.filter(c=>c.estado==='pagado').reduce((s,c)=>s+(c.montoPagado||c.adeudado||0), 0);
  return { adeudado, pagado };
}
function renderUnidades(){
  const tb = document.querySelector('#tablaUnidades tbody');
  if(!estado.unidades.length){
    tb.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="et">Sin copropietarios cargados</div><div class="ed">Descargue la plantilla, llénela con los datos de sus unidades y vuelva a importarla, o agréguelas una por una.</div></div></td></tr>`;
    document.getElementById('alicTotal').textContent = '0%';
    return;
  }
  let totAlic = 0;
  estado.unidades.forEach(u=>totAlic += u.alicuota||0);
  // Render: simple si <=200, virtualizado si más
  const renderRow = u => {
    const b = balanceUnidad(u.id);
    const badge = b.adeudado>0
      ? `<span class="badge danger">Deudor ${fmtCLP(b.adeudado)}</span>`
      : `<span class="badge success">Al día</span>`;
    return `<tr>
      <td><strong>${escapeHtml(u.codigo)}</strong></td>
      <td>${escapeHtml(u.tipo)}</td>
      <td>${escapeHtml(u.propietario||'—')}</td>
      <td>${escapeHtml(u.residente||u.propietario||'—')}<br><span class="muted" style="font-size:var(--fs-xs)">${escapeHtml(u.correo||'')}</span></td>
      <td class="num">${fmtPct(u.alicuota)}</td>
      <td class="num">${badge}</td>
      <td><div class="btn-row">
        <button class="btn sm" data-ac="abrirUnidad" data-args="${escapeHtml(u.id)}" aria-label="Editar unidad ${escapeHtml(u.codigo)}">Editar</button>
        <button class="btn sm danger" data-ac="eliminarUnidad" data-args="${escapeHtml(u.id)}" aria-label="Eliminar unidad ${escapeHtml(u.codigo)}">Eliminar</button>
      </div></td>
    </tr>`;
  };
  if(estado.unidades.length <= 200){
    tb.innerHTML = estado.unidades.map(renderRow).join('');
  } else {
    // Virtualización ligera: renderiza primeras 100, oculta resto bajo botón "Mostrar más"
    const lote = Number(window._unidadesLote) || 100;
    tb.innerHTML = estado.unidades.slice(0, lote).map(renderRow).join('') +
      `<tr><td colspan="7" style="text-align:center;padding:var(--sp-4)">
        <button class="btn ghost" data-ac="mostrarMasUnidades" data-args="n:${escapeHtml(lote+100)}">
          Mostrar 100 más (${fmtNum(estado.unidades.length - lote)} restantes)
        </button>
      </td></tr>`;
  }
  const span = document.getElementById('alicTotal');
  span.textContent = fmtPct(totAlic);
  span.style.color = (Math.abs(totAlic-100) < 0.01) ? 'var(--success)' : 'var(--warning)';
}

/* CSV import / template */
function abrirImportCSV(){ abrirModal('mImportCSV'); }

const PLANTILLA_HEADERS = ['Unidad','Tipo','Propietario','RUT','Residente','Correo','Teléfono','% Alícuota'];
const PLANTILLA_WIDTHS  = [12, 16, 38, 18, 38, 32, 20, 14]; // anchos en unidades Excel
const PLANTILLA_EJEMPLOS = [
  ['A-101','departamento','Juan Pérez González','12.345.678-9','Juan Pérez González','juan.perez@ejemplo.cl','+56 9 1111 1111',1.5],
  ['A-102','departamento','María López Soto','9.876.543-2','Arrendatario s/i','maria.lopez@ejemplo.cl','+56 9 2222 2222',0.85],
  ['B-303','casa','Carlos Ramírez Fuentes','15.234.567-8','Carlos Ramírez Fuentes','carlos.r@ejemplo.cl','+56 9 3333 3333',2.1],
  ['L-01','local','Comercial XYZ Ltda.','76.000.000-1','','contacto@xyz.cl','+56 2 2555 5555',0.5],
];

/* === Generación XLSX nativo (sin dependencias) ===
   Construye un .xlsx real (ZIP de XMLs) con anchos de columna y encabezado
   estilizado. Sin advertencia de "extensión no coincide" en Excel. */
function descargarPlantilla(){
  // La plantilla se arma con SheetJS (vendor/xlsx.full.min.js), que ya viene
  // con el sitio. Antes esto era un generador de ZIP y XML escrito a mano:
  // 200 lineas para hacer lo que la libreria hace bien y ya estaba pagada.
  if(!window.XLSX){ toast('No se pudo cargar el generador de Excel', 'danger'); return; }

  var filas = [
    PLANTILLA_HEADERS,
    ['↓ BORRE las filas de ejemplo y escriba sus datos. La alicuota sale del reglamento de copropiedad y la suma debe dar 100%.','','','','','','',''],
  ];
  PLANTILLA_EJEMPLOS.forEach(function(f){ filas.push(f); });
  for(var i=0;i<25;i++) filas.push(['','','','','','','','']);

  var hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja['!cols'] = PLANTILLA_WIDTHS.map(function(w){ return {wch:w}; });
  hoja['!freeze'] = {xSplit:0, ySplit:2};

  var libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Unidades');
  XLSX.writeFile(libro, 'plantilla_unidades_condominio.xlsx');
  toast('Plantilla descargada', 'success');
}

async function borrarTodasUnidades(){
  if(!estado.unidades.length){ toast('No hay unidades cargadas'); return; }
  const n = estado.unidades.length;
  const cobrosCount = estado.cobros.length;
  const ok1 = await confirmar({
    titulo:`Eliminar todas las unidades`,
    mensaje:`Se eliminarán ${fmtNum(n)} unidades del condominio y ${fmtNum(cobrosCount)} cobros asociados (pendientes y pagados).\nEsta acción no se puede deshacer.`,
    okText:'Continuar',
    variant:'danger'
  });
  if(!ok1) return;
  const ok2 = await confirmar({
    titulo:`Confirmación final`,
    mensaje:`¿Confirmar el borrado de ${fmtNum(n)} unidades y ${fmtNum(cobrosCount)} cobros?`,
    okText:'Sí, borrar todo',
    variant:'danger'
  });
  if(!ok2) return;
  estado.unidades = [];
  estado.cobros = [];
  guardar(); renderUnidades();
  toast(`${fmtNum(n)} unidades eliminadas`, 'success');
}


function detectarSeparador(linea){
  // Si hay más ; que ,, usa ;. Default ,
  const c1 = (linea.match(/;/g)||[]).length;
  const c2 = (linea.match(/,/g)||[]).length;
  return c1 > c2 ? ';' : ',';
}
function parsearLineaCSV(linea, sep){
  // Soporta campos entrecomillados con sep dentro
  const out = []; let cur = ''; let dentro = false;
  for(let i=0;i<linea.length;i++){
    const ch = linea[i];
    if(ch==='"'){
      if(dentro && linea[i+1]==='"'){ cur+='"'; i++; }
      else dentro = !dentro;
    } else if(ch===sep && !dentro){
      out.push(cur); cur='';
    } else cur+=ch;
  }
  out.push(cur);
  return out.map(c=>c.trim());
}
function aNumeroCSV(s){
  if(!s) return 0;
  // Acepta "1,5000" o "1.5000" o "1.234,50"
  let t = String(s).trim().replace(/\s/g,'');
  if(t.includes(',') && t.includes('.')){
    // formato es-CL: 1.234,50 → quitar puntos miles, coma decimal
    t = t.replace(/\./g,'').replace(',','.');
  } else if(t.includes(',')){
    t = t.replace(',','.');
  }
  return parseFloat(t)||0;
}

async function procesarImportacion(){
  const f = document.getElementById('csvFile').files[0];
  if(!f){ toast('Seleccione un archivo'); return; }
  // La planilla tambien suele venir de otra persona. Un padron de miles de
  // unidades pesa menos de 1 MB; algo mucho mayor no es un padron y dejaria
  // la pestana pegada mientras el lector de Excel lo recorre.
  if(f.size > 10 * 1024 * 1024){ toast('El archivo es demasiado grande para ser una planilla de unidades', 'danger'); return; }
  try{
    let filas;
    if(f.name.toLowerCase().endsWith('.xlsx')){
      const buf = await f.arrayBuffer();
      filas = await parsearXlsx(buf);
    } else {
      const txt = await f.text();
      filas = parsearTextoCSV(txt);
    }
    if(!filas || !filas.length){ toast('Archivo vacío'); return; }
    procesarFilasUnidades(filas);
  } catch(err){
    console.error(err);
    await confirmar({
      titulo:'Error al leer el archivo',
      mensaje:`${err.message}\n\nSi cargó un Excel y falla, guárdelo como CSV UTF-8 desde Excel y vuelva a importarlo.`,
      okText:'Entendido', cancelText:'Cerrar',
      variant:'warning'
    });
  }
}

function parsearTextoCSV(txt){
  if(txt.charCodeAt(0)===0xFEFF) txt = txt.slice(1); // BOM
  const lines = txt.split(/\r?\n/)
    .map(l=>l.trim())
    .filter(l => l && !l.startsWith('#'));
  if(!lines.length) return [];
  const sep = detectarSeparador(lines[0]);
  return lines.map(l=>parsearLineaCSV(l, sep));
}

/* === Parser XLSX (lee la plantilla descargada o cualquier .xlsx con
   estructura estándar). Usa DecompressionStream del navegador para deflate. === */
async function parsearXlsx(arrayBuffer){
  if(!window.XLSX) throw new Error('No se pudo cargar el lector de Excel');
  var libro = XLSX.read(arrayBuffer, {type:'array'});
  var hoja  = libro.Sheets[libro.SheetNames[0]];
  if(!hoja) throw new Error('El archivo no tiene ninguna hoja');
  // header:1 devuelve filas como arreglos, que es lo que espera el importador.
  return XLSX.utils.sheet_to_json(hoja, {header:1, raw:true, defval:''})
              .map(function(f){ return f.map(function(c){ return c==null ? '' : String(c); }); })
              .filter(function(f){ return f.some(function(c){ return c !== ''; }); });
}

function procesarFilasUnidades(filas){
    let count = 0, omitidos = 0, sinAlicuota = 0;
    if(!filas.length){ toast('Archivo vacío'); return; }

    // Detectar encabezado
    const headerJoined = filas[0].join(' ');
    const esEncabezado = /unidad|c[óo]digo|propietario|alicuota|al[íi]cuota|tipo/i.test(headerJoined);

    let layoutExtendido;
    if(esEncabezado){
      layoutExtendido = /\brut\b/i.test(headerJoined);
    } else {
      const maxCols = Math.max(...filas.map(f=>f.length));
      layoutExtendido = maxCols >= 8;
    }

    const dataLines = esEncabezado ? filas.slice(1) : filas;
    const tiposValidos = TIPOS_UNIDAD;

    dataLines.forEach(cols=>{
      if(!cols[0]) return;
      // Ignorar la fila de instrucción de la plantilla
      if(String(cols[0]).startsWith('↓') || String(cols[0]).toUpperCase().includes('BORRA')) return;
      let codigo, tipo, propietario, rut, residente, correo, tel, alic;
      if(layoutExtendido){
        [codigo, tipo, propietario, rut, residente, correo, tel] = cols;
        alic = cols[7];
      } else {
        [codigo, tipo, propietario, residente, correo, tel] = cols;
        rut = '';
        alic = cols[6];
      }
      tipo = String(tipo||'departamento').toLowerCase().trim();
      if(!tiposValidos.includes(tipo)) tipo = 'departamento';
      const correoT = String(correo||'').trim();
      if(correoT && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoT)){ omitidos++; return; }
      const alicNum = aNumeroCSV(alic);
      if(alicNum<=0) sinAlicuota++;
      // Con los mismos largos que acepta la revision de cargar() (LARGO): si
      // no, una celda larga se guardaria entera y se recortaria sola al
      // volver a abrir la pagina.
      const txt = (v, k) => String(v||'').trim().slice(0, LARGO[k]);
      estado.unidades.push({
        id:id(), codigo:txt(codigo, 'codigo'), tipo,
        propietario:txt(propietario, 'propietario'), rut:txt(rut, 'rut'),
        residente:txt(residente, 'residente'),
        correo:correoT.slice(0, LARGO.correo), tel:txt(tel, 'tel'),
        alicuota: alicNum
      });
      count++;
    });
    if(sinAlicuota === count && count>0){
      confirmar({
        titulo:'Alícuotas en cero',
        mensaje:`Se importaron ${fmtNum(count)} unidades, pero ninguna tiene alícuota mayor a 0.\nVerifique que la columna "% Alícuota" esté bien llenada en su archivo.`,
        okText:'Entendido', cancelText:'Cerrar',
        variant:'warning'
      });
    } else if(sinAlicuota > 0){
      console.warn(`${sinAlicuota} unidades quedaron con alícuota 0.`);
    }
    guardar(); renderUnidades(); cerrarModal('mImportCSV');
    toast(`${count} unidades importadas${omitidos?` · ${omitidos} omitidas (correo inválido)`:''}`);
}

// Compatibilidad con el HTML antiguo si llegara a llamarse
function procesarCSV(){ return procesarImportacion(); }

/* ============ COBROS ============ */
let cobroEditId = null;
function abrirCobro(id){
  cobroEditId = id||null;
  const c = id ? estado.cobros.find(x=>x.id===id) : {tipo:'ordinaria', estado:'pendiente', periodo:periodoActual()};
  const sel = document.getElementById('cUnidad');
  sel.innerHTML = estado.unidades.map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.codigo)} — ${escapeHtml(u.propietario||'')}</option>`).join('');
  if(c.unidadId) sel.value = c.unidadId;
  document.getElementById('cPeriodo').value = c.periodo||periodoActual();
  document.getElementById('cTipo').value = c.tipo||'ordinaria';
  document.getElementById('cConcepto').value = c.concepto||'';
  document.getElementById('cMonto').value = c.adeudado||'';
  document.getElementById('cEstado').value = c.estado||'pendiente';
  document.getElementById('cFechaPago').value = c.fechaPago||'';
  document.getElementById('cMontoPagado').value = c.montoPagado||'';
  abrirModal('mCobro');
}
function guardarCobro(){
  const monto = parseFloat(document.getElementById('cMonto').value)||0;
  if(monto<=0){ toast('Monto debe ser mayor a 0'); return; }
  const data = {
    unidadId: document.getElementById('cUnidad').value,
    periodo: document.getElementById('cPeriodo').value,
    tipo: document.getElementById('cTipo').value,
    concepto: document.getElementById('cConcepto').value.trim() || (document.getElementById('cTipo').value === 'ordinaria' ? 'Gasto común mensual' : ''),
    adeudado: monto,
    estado: document.getElementById('cEstado').value,
    fechaPago: document.getElementById('cFechaPago').value,
    montoPagado: parseFloat(document.getElementById('cMontoPagado').value)||0,
  };
  if(data.estado==='pagado' && !data.fechaPago) data.fechaPago = fechaHoy();
  if(data.estado==='pagado' && !data.montoPagado) data.montoPagado = data.adeudado;
  if(data.estado==='pagado' && !estado.cobros.find(c=>c.id===cobroEditId)?.folioBoleta){
    estado.contadorFolio++;
    data.folioBoleta = estado.contadorFolio;
  }
  if(cobroEditId){
    const i = estado.cobros.findIndex(x=>x.id===cobroEditId);
    estado.cobros[i] = Object.assign({}, estado.cobros[i], data);
  } else {
    estado.cobros.push(Object.assign({id:id()}, data));
  }
  guardar(); renderCobros(); cerrarModal('mCobro');
  toast('Cobro guardado');
  cobroEditId = null;
}
async function eliminarCobro(id){
  const ok = await confirmar({
    titulo:'Eliminar cobro',
    mensaje:'¿Eliminar este cobro? La acción no se puede deshacer.',
    okText:'Eliminar',
    variant:'danger'
  });
  if(!ok) return;
  estado.cobros = estado.cobros.filter(c=>c.id!==id);
  guardar(); renderCobros();
  toast('Cobro eliminado', 'success');
}
async function generarCobrosMes(){
  if(!estado.unidades.length){ toast('No hay unidades cargadas', 'warning'); return; }
  const totalAlic = estado.unidades.reduce((s,u)=>s+(u.alicuota||0),0);
  if(Math.abs(totalAlic-100) > 0.01){
    const ok = await confirmar({
      titulo:'Alícuotas no suman 100%',
      mensaje:`Las alícuotas registradas suman ${fmtPct(totalAlic)}. Lo correcto es que sumen 100% (art. 6 Ley 21.442).\n\n¿Continuar de todos modos? (Recomendado: revisar primero las alícuotas en Copropietarios.)`,
      okText:'Continuar',
      variant:'warning'
    });
    if(!ok) return;
  }
  document.getElementById('genPeriodo').value = periodoActual();
  document.getElementById('genIncluyeFondo').checked = true;
  document.getElementById('genIncluyeSeguro').checked = !!estado.config.segPrima;
  actualizarSugerenciaTotal();
  abrirModal('mGenerarCobros');
}

function actualizarSugerenciaTotal(){
  const periodo = document.getElementById('genPeriodo').value;
  if(!periodo){
    document.getElementById('genBreakdown').innerHTML = '';
    actualizarPreviewCobros();
    return;
  }
  // Sumar egresos registrados para este período
  const egPeriodo = estado.egresos.filter(e=>e.periodo===periodo);
  const sumEg = egPeriodo.reduce((s,e)=>s+e.monto,0);
  const breakdown = document.getElementById('genBreakdown');

  // Auditoria CN-012 (20-10-2026): si la prima del seguro ya esta entre los
  // egresos del periodo, el total sugerido la incluye; sumarla aparte la
  // cobraba dos veces.
  const seguroEnEgresos = egPeriodo.some(e=>/seguro/i.test(String(e.categoria||'')));
  if(seguroEnEgresos) document.getElementById('genIncluyeSeguro').checked = false;
  if(egPeriodo.length){
    // Auto-fill con suma de egresos del período
    document.getElementById('genTotal').value = sumEg;
    // Sin prototipo: la categoria es texto libre del respaldo, y una llamada
    // "__proto__" no puede terminar escribiendo en Object.prototype.
    const porCat = Object.create(null);
    egPeriodo.forEach(e=>{ porCat[e.categoria] = (porCat[e.categoria]||0) + e.monto; });
    const items = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
    breakdown.innerHTML = `
      <div style="font-size:11px;color:var(--ink-mute);text-transform:uppercase;letter-spacing:.05em;font-weight:600;margin-bottom:6px">Egresos registrados para ${escapeHtml(fmtPeriodoLargo(periodo))} · ${egPeriodo.length} ítems</div>
      ${items.map(([cat,m])=>`<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:3px 0"><span>${escapeHtml(cat)}</span><span style="font-variant-numeric:tabular-nums;color:var(--ink-soft)">${fmtCLP(m)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px 0 0;border-top:1px solid var(--line);margin-top:8px;font-weight:700;color:var(--primary)"><span>Total egresos del período</span><span>${fmtCLP(sumEg)}</span></div>
      ${seguroEnEgresos ? '<div style="font-size:12.5px;color:var(--ink-soft);margin-top:8px">La prima del seguro ya está entre estos egresos, así que no se suma aparte.</div>' : ''}
    `;
  } else {
    // No hay egresos: ofrecer promedio últimos 3 meses como sugerencia
    const ult3 = periodosUlt(4, periodo).slice(0,-1);
    const sumUlt3 = estado.egresos.filter(e=>ult3.includes(e.periodo)).reduce((s,e)=>s+e.monto,0);
    const ult3conData = ult3.filter(p=>estado.egresos.some(e=>e.periodo===p)).length;
    const promedio = ult3conData ? Math.round(sumUlt3/ult3conData) : 0;
    document.getElementById('genTotal').value = promedio || '';
    breakdown.innerHTML = `
      <div style="font-size:12.5px;color:var(--ink-soft);line-height:1.5">
        <strong style="color:var(--warning)">Sin egresos registrados para ${escapeHtml(fmtPeriodoLargo(periodo))}.</strong><br>
        Lo recomendado es <strong>registrar primero todos los gastos del mes</strong> en la pestaña "Egresos del condominio" y luego generar los cobros. Así el sistema usa la suma exacta como base de prorrateo (art. 22 Ley 21.442).<br>
        ${promedio ? `<br>Sugerencia (promedio últimos 3 meses con datos): <strong>${fmtCLP(promedio)}</strong>. Puede editarlo abajo.` : 'Ingrese el monto manualmente.'}
      </div>
    `;
  }
  actualizarPreviewCobros();
}

function actualizarPreviewCobros(){
  const total = parseFloat(document.getElementById('genTotal').value)||0;
  const incFondo = document.getElementById('genIncluyeFondo').checked;
  const incSeguro = document.getElementById('genIncluyeSeguro').checked;
  const porcFondo = estado.config.porcFondo/100;
  const tb = document.querySelector('#previewCobros tbody');
  document.getElementById('genTotalFmt').textContent = total ? fmtCLP(total) : '$ 0';
  if(!total){
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ink-mute);padding:20px">Ingrese un monto total para ver la distribución</td></tr>`;
    document.getElementById('previewSumGC').textContent = '$ 0';
    document.getElementById('previewSumFR').textContent = '$ 0';
    document.getElementById('previewSumSeg').textContent = '$ 0';
    document.getElementById('previewSumTot').textContent = '$ 0';
    return;
  }
  let sumGC=0, sumFR=0, sumSeg=0, sumTot=0;
  const cuotas = repartirPorAlicuota(total);
  const primas = (incSeguro && estado.config.segPrima>0) ? repartirPorAlicuota(estado.config.segPrima) : null;
  tb.innerHTML = estado.unidades.map(u=>{
    const cuota = cuotas[u.id] || 0;
    const fondo = incFondo ? Math.round(cuota * porcFondo) : 0;
    const seguro = primas ? (primas[u.id] || 0) : 0;
    const tot = cuota+fondo+seguro;
    sumGC+=cuota; sumFR+=fondo; sumSeg+=seguro; sumTot+=tot;
    return `<tr>
      <td><strong>${escapeHtml(u.codigo)}</strong> · ${fmtPct(u.alicuota)}</td>
      <td class="num">${fmtCLP(cuota)}</td>
      <td class="num">${fondo?fmtCLP(fondo):'—'}</td>
      <td class="num">${seguro?fmtCLP(seguro):'—'}</td>
      <td class="num"><strong>${fmtCLP(tot)}</strong></td>
    </tr>`;
  }).join('');
  document.getElementById('previewSumGC').textContent = fmtCLP(sumGC);
  document.getElementById('previewSumFR').textContent = fmtCLP(sumFR);
  document.getElementById('previewSumSeg').textContent = fmtCLP(sumSeg);
  document.getElementById('previewSumTot').textContent = fmtCLP(sumTot);
}

// Reparte un monto en pesos entre las unidades segun su alicuota (art. 6).
// Redondear cada cuota por separado hacia que la suma no diera el total:
// con 18 unidades se cobraban unos pesos de mas o de menos cada mes. Aqui
// cada unidad recibe su parte entera y los pesos que sobran van, de uno en
// uno, a las de mayor fraccion (metodo del mayor resto). La proporcion no
// cambia y, si las alicuotas suman 100 %, lo cobrado es exactamente el
// total. Si no suman 100 %, se cobra lo que corresponde a esa suma, como
// antes (el aviso de arriba lo advierte).
function repartirPorAlicuota(monto){
  const partes = estado.unidades.map(u=>{
    const exacto = monto * (u.alicuota||0) / 100;
    return { id:u.id, entero:Math.floor(exacto), resto:exacto-Math.floor(exacto) };
  });
  const objetivo = Math.round(partes.reduce((s,x)=>s+x.entero+x.resto,0));
  let faltan = objetivo - partes.reduce((s,x)=>s+x.entero,0);
  partes.slice().sort((a,b)=>b.resto-a.resto).forEach(x=>{ if(faltan>0 && x.resto>0){ x.entero++; faltan--; } });
  const porId = Object.create(null);
  partes.forEach(x=>{ porId[x.id] = x.entero; });
  return porId;
}

async function limpiarCobros(){
  const pend = estado.cobros.filter(c=>c.estado==='pendiente').length;
  const pag  = estado.cobros.filter(c=>c.estado==='pagado').length;
  if(!estado.cobros.length){ toast('No hay cobros', 'warning'); return; }
  if(pend && pag){
    const ok = await confirmar({
      titulo:`Eliminar cobros pendientes`,
      mensaje:`Estado actual: ${fmtNum(pend)} pendientes y ${fmtNum(pag)} pagados.\nSe eliminarán SOLO los pendientes. El historial de pagos se conserva.`,
      okText:`Eliminar ${fmtNum(pend)} pendientes`,
      variant:'danger'
    });
    if(!ok) return;
    estado.cobros = estado.cobros.filter(c=>c.estado==='pagado');
    guardar(); renderCobros();
    toast(`${fmtNum(pend)} cobros pendientes eliminados`, 'success');
  } else if(pend){
    const ok = await confirmar({
      titulo:'Eliminar cobros pendientes',
      mensaje:`Se eliminarán ${fmtNum(pend)} cobros pendientes. La acción no se puede deshacer.`,
      okText:'Eliminar',
      variant:'danger'
    });
    if(!ok) return;
    estado.cobros = [];
    guardar(); renderCobros();
    toast(`${fmtNum(pend)} cobros eliminados`, 'success');
  } else {
    const ok1 = await confirmar({
      titulo:'Borrar historial',
      mensaje:`Solo hay cobros pagados (${fmtNum(pag)}). Borrarlos elimina el historial.\nNo es recomendable.`,
      okText:'Continuar',
      variant:'danger'
    });
    if(!ok1) return;
    const ok2 = await confirmar({
      titulo:'Confirmación final',
      mensaje:`¿Borrar definitivamente el historial de ${fmtNum(pag)} cobros pagados?`,
      okText:'Sí, borrar',
      variant:'danger'
    });
    if(!ok2) return;
    estado.cobros = [];
    guardar(); renderCobros();
    toast(`${fmtNum(pag)} cobros eliminados`, 'success');
  }
}

async function confirmarGenerarCobros(){
  const periodo = document.getElementById('genPeriodo').value;
  const total = parseFloat(document.getElementById('genTotal').value)||0;
  const incFondo = document.getElementById('genIncluyeFondo').checked;
  const incSeguro = document.getElementById('genIncluyeSeguro').checked;
  if(!periodo){ toast('Seleccione un período', 'warning'); return; }
  if(total<=0){ toast('Ingrese el monto total a recaudar', 'warning'); return; }

  // Auditoria CN-011 (20-10-2026). Regenerar un periodo borraba TODO lo
  // pendiente (tambien multas, intereses y cuotas extraordinarias cargadas a
  // mano) y volvia a cobrar la cuota a quien ya la habia pagado. Ahora solo
  // se recalcula lo que este boton genera (gasto comun, fondo y seguro), y
  // a quien ya pago un concepto no se le vuelve a cobrar.
  const GENERADOS = ['ordinaria','fondo','seguro'];
  const yaExiste = estado.unidades.some(u=>estado.cobros.find(c=>c.unidadId===u.id && c.periodo===periodo && c.tipo==='ordinaria'));
  if(yaExiste){
    const ok = await confirmar({
      titulo:'Cobros existentes',
      mensaje:`Ya hay cobros generados para ${fmtPeriodoLargo(periodo)}.\n\nSe recalculan las cuotas pendientes de gasto común, fondo de reserva y seguro. Lo ya pagado no se vuelve a cobrar, y las multas, intereses y cuotas extraordinarias se conservan.`,
      okText:'Recalcular',
      variant:'warning'
    });
    if(!ok) return;
    estado.cobros = estado.cobros.filter(c=>!(c.periodo===periodo && c.estado==='pendiente' && GENERADOS.indexOf(c.tipo) >= 0));
  }
  if(incSeguro && estado.egresos.some(e=>e.periodo===periodo && /seguro/i.test(String(e.categoria||'')))){
    const ok = await confirmar({
      titulo:'El seguro ya está en los egresos',
      mensaje:`Entre los egresos de ${fmtPeriodoLargo(periodo)} hay un gasto de seguros. Si el monto a recaudar ya los incluye, cobrar además la prima la suma dos veces.\n\n¿Cobrar la prima aparte de todos modos?`,
      okText:'Cobrarla aparte',
      variant:'warning'
    });
    if(!ok) return;
  }
  const yaPagado = (uid, tipo) => estado.cobros.some(c=>c.unidadId===uid && c.periodo===periodo && c.tipo===tipo && c.estado==='pagado');

  const porcFondo = estado.config.porcFondo/100;
  const cuotas = repartirPorAlicuota(total);
  const primas = (incSeguro && estado.config.segPrima>0) ? repartirPorAlicuota(estado.config.segPrima) : null;
  let count = 0;
  estado.unidades.forEach(u=>{
    if(!u.alicuota) return;
    const cuota = cuotas[u.id] || 0;
    if(cuota<=0) return;
    if(!yaPagado(u.id, 'ordinaria')) estado.cobros.push({
      id:id(), unidadId:u.id, periodo,
      tipo:'ordinaria', concepto:`Gasto común ${fmtPeriodoLargo(periodo)}`,
      adeudado: cuota, estado:'pendiente'
    });
    if(incFondo && !yaPagado(u.id, 'fondo')){
      const fondo = Math.round(cuota * porcFondo);
      if(fondo>0){
        estado.cobros.push({
          id:id(), unidadId:u.id, periodo,
          tipo:'fondo', concepto:`Fondo de reserva (${estado.config.porcFondo}%)`,
          adeudado: fondo, estado:'pendiente'
        });
      }
    }
    if(primas && !yaPagado(u.id, 'seguro')){
      const prima = primas[u.id] || 0;
      if(prima>0){
        estado.cobros.push({
          id:id(), unidadId:u.id, periodo,
          tipo:'seguro', concepto:`Prima seguro incendio (${estado.config.segCuotaAct||1}/${estado.config.segCuotas||10})`,
          adeudado: prima, estado:'pendiente'
        });
      }
    }
    count++;
  });
  guardar(); renderCobros(); cerrarModal('mGenerarCobros');
  toast(`Cobros generados para ${count} unidades del período ${fmtPeriodoLargo(periodo)}`);
}
function pagarCobro(id){
  const c = estado.cobros.find(x=>x.id===id);
  if(!c) return;
  c.estado = 'pagado';
  c.fechaPago = fechaHoy();
  c.montoPagado = c.adeudado;
  if(!c.folioBoleta){
    estado.contadorFolio++;
    c.folioBoleta = estado.contadorFolio;
  }
  guardar(); renderCobros();
  toast('Cobro marcado como pagado');
}
function renderCobros(){
  const wrap = document.getElementById('tablaCobrosWrap');
  const fM = document.getElementById('cobroFiltroMes').value;
  const fE = document.getElementById('cobroFiltroEstado').value;
  const fV = document.getElementById('cobroFiltroVista').value || 'agrupada';
  const fQ = (document.getElementById('cobroFiltroQ').value||'').toLowerCase().trim();

  let cobros = [...estado.cobros];
  if(fM) cobros = cobros.filter(c=>c.periodo===fM);
  if(fQ){
    cobros = cobros.filter(c=>{
      const u = estado.unidades.find(x=>x.id===c.unidadId);
      const haystack = `${u?.codigo||''} ${u?.propietario||''} ${u?.residente||''} ${c.folioBoleta||''} ${c.concepto||''}`.toLowerCase();
      return haystack.includes(fQ);
    });
  }

  if(!cobros.length){
    wrap.innerHTML = `<div class="empty"><div class="et">Sin cuotas que mostrar</div><div class="ed">${estado.cobros.length?'Ajuste los filtros o la búsqueda.':'Genera cobros del mes con el botón superior, o crea uno manual.'}</div></div>`;
    return;
  }

  if(fV === 'detalle'){
    // Vista detalle clásica
    cobros.sort((a,b)=>(b.periodo||'').localeCompare(a.periodo||''));
    if(fE) cobros = cobros.filter(c=>c.estado===fE);
    const tipos = {ordinaria:'Cuota ordinaria',extraordinaria:'Cuota extraordinaria',fondo:'Fondo reserva',seguro:'Seguro',multa:'Multa',interes:'Interés'};
    wrap.innerHTML = `<table class="table">
      <thead><tr><th>Período</th><th>Unidad</th><th>Concepto</th><th>Tipo</th><th class="num">Adeudado</th><th class="num">Pagado</th><th>Estado</th><th></th></tr></thead>
      <tbody>${cobros.map(c=>{
        const u = estado.unidades.find(x=>x.id===c.unidadId);
        const estadoBadge = c.estado==='pagado'
          ? `<span class="badge success">Pagado · F${c.folioBoleta?fmtNum(c.folioBoleta):''}</span>`
          : `<span class="badge danger">Pendiente</span>`;
        return `<tr>
          <td>${escapeHtml(fmtPeriodoLargo(c.periodo))}</td>
          <td><strong>${escapeHtml(u?.codigo||'?')}</strong> · ${escapeHtml(u?.propietario||'')}</td>
          <td>${escapeHtml(c.concepto||'—')}</td>
          <td>${escapeHtml(tipos[c.tipo]||c.tipo)}</td>
          <td class="num">${fmtCLP(c.adeudado)}</td>
          <td class="num">${c.estado==='pagado'?fmtCLP(c.montoPagado||c.adeudado):'—'}</td>
          <td>${estadoBadge}</td>
          <td><div class="btn-row">
            ${c.estado==='pendiente'?`<button class="btn sm success" data-ac="pagarCobro" data-args="${escapeHtml(c.id)}" aria-label="Marcar como pagado">Marcar pagado</button>`:''}
            <button class="btn sm" data-ac="abrirCobro" data-args="${escapeHtml(c.id)}" aria-label="Editar cobro">Editar</button>
            <button class="btn sm danger" data-ac="eliminarCobro" data-args="${escapeHtml(c.id)}" aria-label="Eliminar cobro">Eliminar</button>
          </div></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
    return;
  }

  // Vista AGRUPADA por unidad+período (recomendada)
  const grupos = Object.create(null);
  cobros.forEach(c=>{
    const k = `${c.unidadId}__${c.periodo}`;
    if(!grupos[k]) grupos[k] = {unidadId:c.unidadId, periodo:c.periodo, items:[]};
    grupos[k].items.push(c);
  });
  let lista = Object.values(grupos);
  // Filtro de estado a nivel grupo
  if(fE){
    lista = lista.filter(g=>{
      const allPagados = g.items.every(c=>c.estado==='pagado');
      const algunoPagado = g.items.some(c=>c.estado==='pagado');
      if(fE==='pagado') return allPagados;
      if(fE==='pendiente') return !algunoPagado;
      if(fE==='parcial') return algunoPagado && !allPagados;
      return true;
    });
  }
  lista.sort((a,b)=>{
    if(a.periodo !== b.periodo) return (b.periodo||'').localeCompare(a.periodo||'');
    const ua = estado.unidades.find(x=>x.id===a.unidadId);
    const ub = estado.unidades.find(x=>x.id===b.unidadId);
    return (ua?.codigo||'').localeCompare(ub?.codigo||'', 'es', {numeric:true});
  });

  wrap.innerHTML = `<table class="table">
    <thead><tr><th style="width:32px"></th><th>Período</th><th>Unidad · Propietario</th><th class="num">Total</th><th>Estado</th><th>Acciones</th></tr></thead>
    <tbody>${lista.map(g=>{
      const u = estado.unidades.find(x=>x.id===g.unidadId);
      const total = g.items.reduce((s,c)=>s+c.adeudado, 0);
      const pagado = g.items.filter(c=>c.estado==='pagado').reduce((s,c)=>s+(c.montoPagado||c.adeudado), 0);
      const pend = g.items.filter(c=>c.estado==='pendiente');
      const totPend = pend.reduce((s,c)=>s+c.adeudado, 0);
      const allPag = pend.length === 0;
      const algunoPag = g.items.some(c=>c.estado==='pagado');
      let estadoBadge;
      if(allPag){
        const folios = [...new Set(g.items.map(c=>c.folioBoleta).filter(Boolean))];
        estadoBadge = `<span class="badge success">Pagado${folios.length?` · F${fmtNum(folios[0])}`:''}</span>`;
      } else if(algunoPag){
        estadoBadge = `<span class="badge warning">Parcial · falta ${fmtCLP(totPend)}</span>`;
      } else {
        estadoBadge = `<span class="badge danger">Pendiente</span>`;
      }
      const groupId = `g_${g.unidadId}_${g.periodo}`;
      const subRows = g.items.map(c=>{
        const tipos = {ordinaria:'Cuota ordinaria',extraordinaria:'Cuota extraordinaria',fondo:'Fondo de reserva',seguro:'Prima seguro',multa:'Multa',interes:'Interés mora'};
        const sBadge = c.estado==='pagado'
          ? `<span class="badge success">Pagado${c.folioBoleta?` · F${fmtNum(c.folioBoleta)}`:''}</span>`
          : `<span class="badge danger">Pendiente</span>`;
        return `<tr>
          <td></td><td colspan="2" style="padding-left:var(--sp-8);font-size:var(--fs-sm)">
            ${escapeHtml(c.concepto||tipos[c.tipo]||c.tipo)}
            <span class="muted" style="font-size:var(--fs-xs)"> · ${escapeHtml(tipos[c.tipo]||c.tipo)}</span>
          </td>
          <td class="num" style="font-size:var(--fs-sm)">${fmtCLP(c.adeudado)}</td>
          <td>${sBadge}</td>
          <td><div class="btn-row">
            ${c.estado==='pendiente'?`<button class="btn sm success" data-ac="pagarCobro" data-args="${escapeHtml(c.id)}" aria-label="Marcar este concepto como pagado">Marcar pagado</button>`:''}
            <button class="btn sm" data-ac="abrirCobro" data-args="${escapeHtml(c.id)}" aria-label="Editar concepto">Editar</button>
            <button class="btn sm danger" data-ac="eliminarCobro" data-args="${escapeHtml(c.id)}" aria-label="Eliminar concepto">Eliminar</button>
          </div></td>
        </tr>`;
      }).join('');
      // groupId va en cuatro atributos (dos data-args y dos id): escapado en
      // cada uno. El id del boton iba ANTES del data-ac legitimo, asi que un
      // data-ac colado ahi era el que el navegador se quedaba.
      return `
        <tr style="cursor:pointer" data-ac="toggleGrupoCobro" data-args="${escapeHtml(groupId)}">
          <td>
            <button class="btn sm ghost" aria-label="Ver detalle" id="${escapeHtml(groupId)}_btn" style="padding:2px 6px;min-height:auto" data-ac="toggleGrupoCobro" data-args="${escapeHtml(groupId)}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="transition:transform var(--dur-fast) var(--ease-out)"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </td>
          <td>${escapeHtml(fmtPeriodoLargo(g.periodo))}</td>
          <td><strong>${escapeHtml(u?.codigo||'?')}</strong> · ${escapeHtml(u?.propietario||'—')}<br><span class="muted" style="font-size:var(--fs-xs)">${g.items.length} concepto${g.items.length>1?'s':''}: ${escapeHtml([...new Set(g.items.map(c=>c.tipo))].join(' + '))}</span></td>
          <td class="num"><strong>${fmtCLP(total)}</strong>${algunoPag&&!allPag?`<br><span class="muted" style="font-size:var(--fs-xs)">Pagado: ${fmtCLP(pagado)}</span>`:''}</td>
          <td>${estadoBadge}</td>
          <td>
            <div class="btn-row">
              ${!allPag?`<button class="btn sm success" data-ac="pagarTodoGrupo" data-args="${escapeHtml(g.unidadId)}|${escapeHtml(g.periodo)}" aria-label="Marcar todo del mes como pagado para ${escapeHtml(u?.codigo||'')}">Marcar todo pagado</button>`:''}
              <button class="btn sm ghost" data-ac="abrirLiquidacionDirecta" data-args="${escapeHtml(g.unidadId)}|${escapeHtml(g.periodo)}" aria-label="Ver liquidación">Ver liquidación</button>
            </div>
          </td>
        </tr>
        <tr id="${escapeHtml(groupId)}_detail" style="display:none;background:var(--bg-subtle)">
          <td colspan="6" style="padding:0">
            <table class="table" style="margin:0">
              <tbody>${subRows}</tbody>
            </table>
          </td>
        </tr>
      `;
    }).join('')}</tbody>
  </table>`;
}

function toggleGrupoCobro(id){
  const det = document.getElementById(id+'_detail');
  const btn = document.getElementById(id+'_btn');
  if(!det) return;
  const isOpen = det.style.display !== 'none';
  det.style.display = isOpen ? 'none' : 'table-row';
  if(btn){
    const svg = btn.querySelector('svg');
    if(svg) svg.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(90deg)';
  }
}

async function pagarTodoGrupo(unidadId, periodo){
  const items = estado.cobros.filter(c=>c.unidadId===unidadId && c.periodo===periodo && c.estado==='pendiente');
  if(!items.length){ toast('Ya no hay conceptos pendientes', 'warning'); return; }
  const u = estado.unidades.find(x=>x.id===unidadId);
  const total = items.reduce((s,c)=>s+c.adeudado, 0);
  const ok = await confirmar({
    titulo:`Marcar todo pagado · ${u?.codigo||''}`,
    // confirmar() escribe con textContent, no con innerHTML: escapar aqui
    // no protege de nada y ademas se ve, un apellido con "&" saldria "&amp;".
    mensaje:`Se marcarán ${items.length} conceptos como pagados para ${u?.propietario||u?.codigo||''} (${fmtPeriodoLargo(periodo)}).\n\nTotal: ${fmtCLP(total)}.\nSe asignará un folio único.`,
    okText:'Sí, marcar pagado',
    variant:'primary'
  });
  if(!ok) return;
  estado.contadorFolio++;
  const folio = estado.contadorFolio;
  const fecha = fechaHoy();
  items.forEach(c=>{
    c.estado = 'pagado';
    c.fechaPago = fecha;
    c.montoPagado = c.adeudado;
    c.folioBoleta = folio;
  });
  guardar(); renderCobros();
  toast(`${items.length} conceptos pagados · folio ${fmtNum(folio)}`, 'success');
}

function abrirLiquidacionDirecta(unidadId, periodo){
  location.hash = '#liquidacion';
  setTimeout(()=>{
    document.getElementById('liqUnidad').value = unidadId;
    document.getElementById('liqMes').value = periodo;
    renderLiquidacion();
  }, 100);
}

// Con guarda: estos oyentes se cuelgan al cargar el archivo, antes de que
// nadie haya tocado nada. Sin el "if", basta que a un id le cambien el nombre
// en el HTML para que el script muera aqui y el modulo entero deje de
// responder, sin un solo error visible en la pagina.
oir(['cobroFiltroMes','cobroFiltroEstado','cobroFiltroVista'], 'change', renderCobros);
oir('cobroFiltroQ', 'input', renderCobros);

/* ============ EGRESOS ============ */
let egresoEditId = null;
function abrirEgreso(id){
  egresoEditId = id||null;
  const e = id ? estado.egresos.find(x=>x.id===id) : {fecha:fechaHoy()};
  document.getElementById('eFecha').value = e.fecha||fechaHoy();
  const sel = document.getElementById('eCategoria');
  sel.innerHTML = CATEGORIAS_EGRESO.map(c=>`<option value="${escapeHtml(c.cat)}">${escapeHtml(c.cat)}</option>`).join('');
  sel.value = e.categoria || CATEGORIAS_EGRESO[0].cat;
  document.getElementById('eSubcat').value = e.subcat||'';
  document.getElementById('eContraparte').value = e.contraparte||'';
  document.getElementById('eDoc').value = e.numDoc||'';
  document.getElementById('eMonto').value = e.monto||'';
  document.getElementById('eDesc').value = e.descripcion||'';
  document.getElementById('eBoletaURL').value = e.boletaURL||'';
  document.getElementById('eMontoFmt').textContent = fmtCLP(e.monto||0);
  abrirModal('mEgreso');
}
function guardarEgreso(){
  const monto = parseFloat(document.getElementById('eMonto').value)||0;
  if(monto<=0){ toast('Monto debe ser mayor a 0', 'warning'); return; }
  const fecha = document.getElementById('eFecha').value;
  const data = {
    fecha,
    periodo: fecha.slice(0,7),
    categoria: document.getElementById('eCategoria').value,
    subcat: document.getElementById('eSubcat').value.trim(),
    contraparte: document.getElementById('eContraparte').value.trim(),
    numDoc: document.getElementById('eDoc').value.trim(),
    monto,
    descripcion: document.getElementById('eDesc').value.trim(),
    boletaURL: document.getElementById('eBoletaURL').value.trim(),
  };
  if(egresoEditId){
    const i = estado.egresos.findIndex(x=>x.id===egresoEditId);
    estado.egresos[i] = Object.assign({}, estado.egresos[i], data);
  } else {
    estado.egresos.push(Object.assign({id:id()}, data));
  }
  guardar(); renderEgresos(); cerrarModal('mEgreso');
  toast('Egreso registrado');
  egresoEditId = null;
}
async function eliminarEgreso(id){
  const ok = await confirmar({
    titulo:'Eliminar gasto',
    mensaje:'¿Eliminar este gasto del condominio? La acción no se puede deshacer.',
    okText:'Eliminar',
    variant:'danger'
  });
  if(!ok) return;
  estado.egresos = estado.egresos.filter(e=>e.id!==id);
  guardar(); renderEgresos();
  toast('Gasto eliminado', 'success');
}
function renderEgresos(){
  const sel = document.getElementById('egFiltroCat');
  if(!sel.options.length){
    sel.innerHTML = '<option value="">Todas</option>' + CATEGORIAS_EGRESO.map(c=>`<option>${escapeHtml(c.cat)}</option>`).join('');
  }
  const fM = document.getElementById('egFiltroMes').value;
  const fC = document.getElementById('egFiltroCat').value;
  const fQ = document.getElementById('egFiltroQ').value.toLowerCase();
  let egs = [...estado.egresos];
  if(fM) egs = egs.filter(e=>e.periodo===fM);
  if(fC) egs = egs.filter(e=>e.categoria===fC);
  if(fQ) egs = egs.filter(e=>(e.contraparte+' '+e.descripcion+' '+e.numDoc+' '+e.subcat).toLowerCase().includes(fQ));
  egs.sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  const tb = document.querySelector('#tablaEgresos tbody');
  if(!egs.length){
    tb.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="et">Sin egresos</div><div class="ed">Registre los gastos del condominio.</div></div></td></tr>`;
    return;
  }
  tb.innerHTML = egs.map(e=>`
    <tr>
      <td>${fmtFecha(e.fecha)}</td>
      <td><strong>${escapeHtml(e.categoria)}</strong>${e.subcat?'<br><span class="muted" style="font-size:11px">'+escapeHtml(e.subcat)+'</span>':''}</td>
      <td>${escapeHtml(e.contraparte||'—')}</td>
      <td>${escapeHtml(e.descripcion||'—')}</td>
      <td>${escapeHtml(e.numDoc||'—')}${enlaceBoleta(e.boletaURL)}</td>
      <td class="num">${fmtCLP(e.monto)}</td>
      <td><div class="btn-row"><button class="btn sm" data-ac="abrirEgreso" data-args="${escapeHtml(e.id)}" aria-label="Editar gasto">Editar</button><button class="btn sm danger" data-ac="eliminarEgreso" data-args="${escapeHtml(e.id)}" aria-label="Eliminar gasto">Eliminar</button></div></td>
    </tr>`).join('');
}
// El respaldo digital de un gasto. Es enlace solo si la direccion es http o
// https (urlSegura, SAST-06); si no -una ruta del computador, que el campo
// admite, o algo peor- se muestra como el texto que es. El enlace abre otra
// pestana sin darle a esa pagina acceso a esta (noopener) ni la direccion
// de origen (noreferrer).
const enlaceBoleta = s => {
  if(!s) return '';
  const u = urlSegura(s);
  if(!u) return ` <span class="muted" style="font-size:11px;word-break:break-all">${escapeHtml(s)}</span>`;
  return ` <a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" title="Ver boleta" aria-label="Abrir respaldo digital" style="display:inline-block;margin-left:4px"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:middle"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71"/></svg></a>`;
};
oir(['egFiltroMes','egFiltroCat','egFiltroQ'], 'input', renderEgresos);

// Listener: formatear monto en vivo en modal egreso
document.addEventListener('DOMContentLoaded', ()=>{
  const eMonto = document.getElementById('eMonto');
  if(eMonto) eMonto.addEventListener('input', e=>{
    document.getElementById('eMontoFmt').textContent = fmtCLP(parseFloat(e.target.value)||0);
  });
});

/* ============ INGRESOS ============ */
let ingresoEditId = null;
function abrirIngreso(id){
  ingresoEditId = id||null;
  const i = id ? estado.ingresos.find(x=>x.id===id) : {fecha:fechaHoy()};
  document.getElementById('iFecha').value = i.fecha||fechaHoy();
  document.getElementById('iCategoria').value = i.categoria||'Arriendo bienes comunes';
  document.getElementById('iContraparte').value = i.contraparte||'';
  document.getElementById('iMonto').value = i.monto||'';
  document.getElementById('iDesc').value = i.descripcion||'';
  abrirModal('mIngreso');
}
function guardarIngreso(){
  const monto = parseFloat(document.getElementById('iMonto').value)||0;
  if(monto<=0){ toast('Monto debe ser mayor a 0'); return; }
  const fecha = document.getElementById('iFecha').value;
  const data = {
    fecha, periodo: fecha.slice(0,7),
    categoria: document.getElementById('iCategoria').value,
    contraparte: document.getElementById('iContraparte').value.trim(),
    monto,
    descripcion: document.getElementById('iDesc').value.trim(),
  };
  if(ingresoEditId){
    const i = estado.ingresos.findIndex(x=>x.id===ingresoEditId);
    estado.ingresos[i] = Object.assign({}, estado.ingresos[i], data);
  } else {
    estado.ingresos.push(Object.assign({id:id()}, data));
  }
  guardar(); renderIngresos(); cerrarModal('mIngreso');
  toast('Ingreso registrado');
  ingresoEditId = null;
}
async function eliminarIngreso(id){
  const ok = await confirmar({
    titulo:'Eliminar ingreso',
    mensaje:'¿Eliminar este ingreso? La acción no se puede deshacer.',
    okText:'Eliminar',
    variant:'danger'
  });
  if(!ok) return;
  estado.ingresos = estado.ingresos.filter(x=>x.id!==id);
  guardar(); renderIngresos();
  toast('Ingreso eliminado', 'success');
}
function renderIngresos(){
  const tb = document.querySelector('#tablaIngresos tbody');
  const ings = [...estado.ingresos].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  if(!ings.length){
    tb.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="et">Sin ingresos extraordinarios</div></div></td></tr>`;
    return;
  }
  tb.innerHTML = ings.map(e=>`
    <tr>
      <td>${fmtFecha(e.fecha)}</td>
      <td>${escapeHtml(e.categoria)}</td>
      <td>${escapeHtml(e.contraparte||'—')}</td>
      <td>${escapeHtml(e.descripcion||'—')}</td>
      <td class="num">${fmtCLP(e.monto)}</td>
      <td><div class="btn-row"><button class="btn sm" data-ac="abrirIngreso" data-args="${escapeHtml(e.id)}">Editar</button><button class="btn sm danger" data-ac="eliminarIngreso" data-args="${escapeHtml(e.id)}">Eliminar</button></div></td>
    </tr>`).join('');
}

/* ============ FONDO COMÚN DE RESERVA ============ */
function abrirMovFondo(tipo){
  document.getElementById('fTipo').value = tipo;
  document.getElementById('mFondoTitulo').textContent = tipo==='ingreso' ? 'Aporte adicional al fondo' : 'Uso del fondo (gasto urgente / extraordinario)';
  document.getElementById('fFecha').value = fechaHoy();
  document.getElementById('fMonto').value = '';
  document.getElementById('fOrigen').value = '';
  document.getElementById('fDesc').value = '';
  abrirModal('mFondo');
}
function guardarMovFondo(){
  const monto = parseFloat(document.getElementById('fMonto').value)||0;
  if(monto<=0){ toast('Monto debe ser mayor a 0'); return; }
  const fecha = document.getElementById('fFecha').value;
  estado.fondo.push({
    id:id(), tipo:document.getElementById('fTipo').value,
    fecha, periodo:fecha.slice(0,7), monto,
    origen: document.getElementById('fOrigen').value.trim(),
    descripcion: document.getElementById('fDesc').value.trim()
  });
  guardar(); renderFondo(); cerrarModal('mFondo');
  toast('Movimiento registrado');
}
async function eliminarMovFondo(id){
  const ok = await confirmar({
    titulo:'Eliminar movimiento',
    mensaje:'¿Eliminar este movimiento del fondo de reserva?',
    okText:'Eliminar',
    variant:'danger'
  });
  if(!ok) return;
  estado.fondo = estado.fondo.filter(m=>m.id!==id);
  guardar(); renderFondo();
  toast('Movimiento eliminado', 'success');
}
// Lo que entra al fondo común de reserva NO es caja del condominio: el art. 39
// lo manda a una cuenta separada y solo se toca con autorización del comité.
// Estos tres tipos de cobro alimentan el fondo, así que se cuentan allá y se
// descuentan acá. Antes se sumaban en los dos lados y la misma plata aparecía
// dos veces: el saldo de caja del art. 31 salía inflado por el fondo entero.
const esDelFondo = c => c.tipo==='fondo' || c.tipo==='multa' || c.tipo==='interes';

function calcSaldoFondo(hastaPeriodo){
  // saldo del fondo = aportes recaudados (cobros tipo fondo pagados) + multas + intereses + aportes manuales − egresos manuales
  let saldo = 0;
  estado.cobros.filter(c=>c.estado==='pagado' && esDelFondo(c))
    .filter(c=>!hastaPeriodo || c.periodo<=hastaPeriodo)
    .forEach(c=>saldo += c.montoPagado||c.adeudado||0);
  estado.fondo.filter(m=>!hastaPeriodo || m.periodo<=hastaPeriodo).forEach(m=>{
    if(m.tipo==='ingreso') saldo += m.monto;
    else saldo -= m.monto;
  });
  return saldo;
}
function renderFondo(){
  const periodo = periodoActual();
  document.getElementById('fondoSaldo').textContent = fmtCLP(calcSaldoFondo());
  const aportesPeriodo = estado.cobros.filter(c=>c.estado==='pagado' && (c.tipo==='fondo'||c.tipo==='multa'||c.tipo==='interes') && c.periodo===periodo)
    .reduce((s,c)=>s+(c.montoPagado||c.adeudado||0),0)
    + estado.fondo.filter(m=>m.tipo==='ingreso' && m.periodo===periodo).reduce((s,m)=>s+m.monto,0);
  const egresosPeriodo = estado.fondo.filter(m=>m.tipo==='egreso' && m.periodo===periodo).reduce((s,m)=>s+m.monto,0);
  document.getElementById('fondoAportes').textContent = fmtCLP(aportesPeriodo);
  document.getElementById('fondoEgresos').textContent = fmtCLP(egresosPeriodo);
  document.getElementById('fondoAportesSub').textContent = fmtPeriodoLargo(periodo);
  document.getElementById('fondoEgresosSub').textContent = fmtPeriodoLargo(periodo);

  const tb = document.querySelector('#tablaFondo tbody');
  const movs = [...estado.fondo].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
  if(!movs.length){
    tb.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="et">Sin movimientos manuales</div><div class="ed">Los aportes mensuales se registran automáticamente al pagarse el cobro tipo "fondo".</div></div></td></tr>`;
    return;
  }
  tb.innerHTML = movs.map(m=>`
    <tr>
      <td>${fmtFecha(m.fecha)}</td>
      <td>${m.tipo==='ingreso' ? '<span class="badge success">Aporte</span>' : '<span class="badge warning">Uso</span>'}</td>
      <td>${escapeHtml(m.origen||'—')}</td>
      <td>${escapeHtml(m.descripcion||'—')}</td>
      <td class="num">${fmtCLP(m.monto)}</td>
      <td><button class="btn sm danger" data-ac="eliminarMovFondo" data-args="${escapeHtml(m.id)}">Eliminar</button></td>
    </tr>`).join('');
}

/* ============ DASHBOARD ============ */
function calcMes(periodo){
  const pagados = estado.cobros.filter(c=>c.estado==='pagado' && c.periodo===periodo);
  const recaudado = pagados.filter(c=>!esDelFondo(c))
    .reduce((s,c)=>s+(c.montoPagado||c.adeudado||0),0);
  const aportesFondo = pagados.filter(esDelFondo)
    .reduce((s,c)=>s+(c.montoPagado||c.adeudado||0),0);
  const ingresosExtra = estado.ingresos.filter(i=>i.periodo===periodo).reduce((s,i)=>s+i.monto,0);
  const egresos = estado.egresos.filter(e=>e.periodo===periodo).reduce((s,e)=>s+e.monto,0);
  return { ingresos: recaudado + ingresosExtra, egresos, aportesFondo };
}
function calcSaldoCaja(hastaPeriodo){
  let saldo = 0;
  // Sin los cobros del fondo: esos viven en calcSaldoFondo (art. 39).
  estado.cobros.filter(c=>c.estado==='pagado' && !esDelFondo(c)).forEach(c=>{
    if(!hastaPeriodo || c.periodo<=hastaPeriodo) saldo += c.montoPagado||c.adeudado||0;
  });
  estado.ingresos.forEach(i=>{
    if(!hastaPeriodo || i.periodo<=hastaPeriodo) saldo += i.monto;
  });
  estado.egresos.forEach(e=>{
    if(!hastaPeriodo || e.periodo<=hastaPeriodo) saldo -= e.monto;
  });
  return saldo;
}
function renderDashboard(){
  renderCintaMeses();

  const haDatos = estado.unidades.length > 0 || estado.egresos.length > 0;
  const onb = document.getElementById('onboardingPanel');
  if(onb) onb.style.display = haDatos ? 'none' : 'block';

  const periodo = mesActivo;
  const t = document.getElementById('mesTitulo');
  if(t) t.textContent = fmtPeriodoLargo(periodo).replace(/^./, c=>c.toUpperCase());

  const m = calcMes(periodo);
  const pagados = estado.cobros.filter(c=>c.estado==='pagado' && c.periodo===periodo);
  const alDia = estado.unidades.filter(u=>balanceUnidad(u.id).adeudado===0).length;
  const deudoras = estado.unidades.length - alDia;

  document.getElementById('kpiIng').textContent = fmtCLP(m.ingresos);
  // Unidades distintas que pagaron, no cobros: una unidad paga la cuota, el
  // fondo y el seguro y son tres cobros, pero sigue siendo una unidad.
  const pagaron = new Set(pagados.filter(c=>!esDelFondo(c)).map(c=>c.unidadId)).size;
  document.getElementById('kpiIngSub').textContent = estado.unidades.length
    ? `Pagaron ${fmtNum(pagaron)} de ${fmtNum(estado.unidades.length)} unidades`
    : 'Sin unidades cargadas';
  document.getElementById('kpiEg').textContent = fmtCLP(m.egresos);
  const egDelMes = estado.egresos.filter(e=>e.periodo===periodo);
  const cats = new Set(egDelMes.map(e=>e.categoria));
  document.getElementById('kpiEgSub').textContent = egDelMes.length
    ? `${fmtNum(egDelMes.length)} ${egDelMes.length===1?'documento':'documentos'} en ` +
      `${fmtNum(cats.size)} ${cats.size===1?'categoría':'categorías'}`
    : 'Sin gastos anotados';
  document.getElementById('kpiSaldo').textContent = fmtCLP(calcSaldoCaja(periodo));
  document.getElementById('kpiFondo').textContent = fmtCLP(calcSaldoFondo(periodo));
  document.getElementById('kpiFondoSub').textContent = m.aportesFondo
    ? `Entraron ${fmtCLP(m.aportesFondo)} este mes` : 'Sin aportes este mes';

  pintarCierre(periodo, deudoras);
  pintarGastosDelMes(periodo);
  pintarCobrosDelMes(periodo, alDia, deudoras);
  pintarEvolucion(periodo);
}

// Que falta para cerrar el mes. Es un estado, no un asistente: dice donde
// esta uno sin obligar a un orden, porque el trabajo rara vez lo lleva.
function pintarCierre(periodo, deudoras){
  const caja = document.getElementById('cierrePasos');
  if(!caja) return;
  const tit = document.getElementById('cierreTitulo');
  if(tit) tit.textContent = 'Para cerrar ' + fmtPeriodoLargo(periodo);

  const hayEg = estado.egresos.some(e=>e.periodo===periodo);
  const cobros = estado.cobros.filter(c=>c.periodo===periodo);
  const hayCuotas = cobros.length > 0;
  const pendientes = cobros.filter(c=>c.estado==='pendiente').length;
  const emitidas = estado.unidades.length > 0 && estado.unidades.every(u=>
    estado.foliosLiq && estado.foliosLiq[u.id + '|' + periodo]);

  const VISTO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
  const RELOJ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  const chip = (est, txt) => `<span class="paso-chip ${est}">${est==='ok'?VISTO:est==='pend'?RELOJ:''}${escapeHtml(txt)}</span>`;
  caja.innerHTML = [
    hayEg    ? chip('ok','Gastos anotados')  : chip('no','Sin gastos anotados'),
    hayCuotas? chip('ok','Cuotas repartidas'): chip('no','Cuotas sin repartir'),
    pendientes? chip('pend', `Falta${pendientes===1?'':'n'} ${fmtNum(pendientes)} ${pendientes===1?'pago':'pagos'}`) : hayCuotas ? chip('ok','Todo cobrado') : chip('no','Sin cobros'),
    emitidas ? chip('ok','Liquidaciones emitidas') : chip('no','Liquidaciones sin emitir')
  ].join('');
}

function pintarGastosDelMes(periodo){
  const caja = document.getElementById('mesEgresos');
  if(!caja) return;
  const grupos = obtenerEgresosAgrupados(periodo);
  const total = Object.values(grupos).reduce((s,g)=>s+g.total,0);
  const tot = document.getElementById('mesEgTotal');
  if(tot) tot.textContent = fmtCLP(total);

  const filas = Object.entries(grupos).sort((a,b)=>b[1].total-a[1].total);
  if(!filas.length){
    caja.innerHTML = '<div class="lista-vacia">Todavía no hay gastos anotados en este mes.</div>';
    return;
  }
  const visibles = filas.slice(0,6), resto = filas.slice(6);
  let html = visibles.map(([cat,g])=>
    `<div class="fila" style="grid-template-columns:1fr auto">
       <div>${escapeHtml(cat)} <span class="muted" style="font-size:var(--fs-sm)">· ${fmtNum(g.items.length)} doc.</span></div>
       <div class="num">${fmtCLP(g.total)}</div>
     </div>`).join('');
  if(resto.length){
    const sum = resto.reduce((s,[,g])=>s+g.total,0);
    html += `<div class="fila" style="grid-template-columns:1fr auto">
       <div class="muted">Otras ${fmtNum(resto.length)} categorías</div>
       <div class="num muted">${fmtCLP(sum)}</div>
     </div>`;
  }
  caja.innerHTML = html;
}

function pintarCobrosDelMes(periodo, alDia, deudoras){
  const caja = document.getElementById('mesCobros');
  if(!caja) return;
  const sub = document.getElementById('mesCobrosSub');
  if(sub) sub.innerHTML = estado.unidades.length
    ? `${fmtNum(alDia)} al día · <b style="color:var(--danger)">${fmtNum(deudoras)} con deuda</b>`
    : '—';

  if(!estado.unidades.length){
    caja.innerHTML = '<div class="lista-vacia">Cargue los copropietarios para repartir el gasto común.</div>';
    return;
  }
  // Primero los que deben: es lo que hay que hacer, no lo que ya esta hecho.
  const filas = estado.unidades.map(u=>{
    const b = balanceUnidad(u.id);
    const delMes = estado.cobros.filter(c=>c.unidadId===u.id && c.periodo===periodo)
      .reduce((s,c)=>s+(c.adeudado||0),0);
    return { u, b, delMes };
  }).sort((a,b)=> (b.b.adeudado>0) - (a.b.adeudado>0) || a.u.codigo.localeCompare(b.u.codigo));

  caja.innerHTML = filas.slice(0,6).map(({u,b,delMes})=>
    `<div class="fila" style="grid-template-columns:76px 1fr auto auto">
       <div><b>${escapeHtml(u.codigo)}</b></div>
       <div class="muted" style="font-size:var(--fs-md)">${fmtPct(u.alicuota)}</div>
       <div class="num">${fmtCLP(delMes)}</div>
       <div>${b.adeudado>0
         ? `<span class="badge danger">Debe ${fmtCLP(b.adeudado)}</span>`
         : '<span class="badge success">Al día</span>'}</div>
     </div>`).join('');
}

function pintarEvolucion(periodo){
  const chart = document.getElementById('chart12');
  if(!chart) return;
  const periodos = periodosUlt(12, periodo);
  const datos = periodos.map(p=>calcMes(p));
  const maxVal = Math.max(1, ...datos.map(d=>Math.max(d.ingresos,d.egresos)));
  const w=720, h=220, pl=60, pr=20, pt=20, pb=40;
  const cw = w-pl-pr, ch = h-pt-pb;
  const bw = cw/12 * 0.55;
  const ultMes = datos[datos.length-1];
  const aria = `Evolución de los últimos 12 meses. Máximo ${fmtCLP(maxVal)}. Mes más reciente: ingresos ${fmtCLP(ultMes.ingresos)}, gastos ${fmtCLP(ultMes.egresos)}.`;
  let svg = `<title>Evolución mensual de ingresos y gastos del condominio</title><desc>${escapeHtml(aria)}</desc>`;
  for(let i=0;i<=4;i++){
    const y = pt + ch - (ch * i/4);
    const v = Math.round(maxVal * i/4);
    svg += `<line x1="${pl}" y1="${y}" x2="${w-pr}" y2="${y}" stroke="${i?'#E3EDF7':'#C3CDD9'}" stroke-width="1"/>`;
    svg += `<text x="${pl-8}" y="${y+3}" text-anchor="end" font-size="10" fill="#6E7276">${fmtCLP(v)}</text>`;
  }
  periodos.forEach((p,i)=>{
    const x = pl + (cw*i/12) + (cw/12 - bw)/2;
    const hEg = ch * (datos[i].egresos/maxVal);
    const tip = `${fmtPeriodoLargo(p)}: ingresos ${fmtCLP(datos[i].ingresos)}, gastos ${fmtCLP(datos[i].egresos)}`;
    svg += `<g><title>${escapeHtml(tip)}</title>`;
    svg += `<rect x="${pl + (cw*i/12)}" y="${pt}" width="${cw/12}" height="${ch}" fill="transparent"/>`;
    svg += `<rect x="${x}" y="${pt+ch-hEg}" width="${bw}" height="${hEg}" fill="${p===periodo?'#1E3A6E':'#1E3A6E'}" opacity="${p===periodo?'1':'.45'}" rx="3"/>`;
    svg += `</g>`;
    svg += `<text x="${x+bw/2}" y="${h-pb+15}" text-anchor="middle" font-size="10" fill="${p===periodo?'#1E3A6E':'#6E7276'}" font-weight="${p===periodo?'700':'400'}">${escapeHtml(fmtPeriodoCorto(p))}</text>`;
  });
  let path = '';
  periodos.forEach((p,i)=>{
    const x = pl + (cw*i/12) + cw/24;
    const y = pt + ch - ch * (datos[i].ingresos/maxVal);
    path += (i===0?'M':'L') + x + ',' + y + ' ';
  });
  svg += `<path d="${path}" stroke="#0B6BB5" stroke-width="2.5" fill="none"/>`;
  periodos.forEach((p,i)=>{
    const x = pl + (cw*i/12) + cw/24;
    const y = pt + ch - ch * (datos[i].ingresos/maxVal);
    svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#0B6BB5"/>`;
  });
  svg += `<g transform="translate(${pl},${pt-12})" font-size="10" fill="#5C6168">`;
  svg += `<rect x="0" y="0" width="10" height="10" fill="#1E3A6E" opacity=".7" rx="2"/><text x="14" y="9">Gastos</text>`;
  svg += `<line x1="60" y1="5" x2="80" y2="5" stroke="#0B6BB5" stroke-width="2.5"/><circle cx="70" cy="5" r="3" fill="#0B6BB5"/><text x="84" y="9">Ingresos</text>`;
  svg += `</g>`;
  chart.innerHTML = svg;
  chart.setAttribute('role', 'img');
  chart.setAttribute('aria-label', aria);
}


/* ============ LIQUIDACIÓN ============ */
function prepLiquidacion(){
  const sel = document.getElementById('liqUnidad');
  sel.innerHTML = estado.unidades.map(u=>`<option value="${escapeHtml(u.id)}">${escapeHtml(u.codigo)} — ${escapeHtml(u.propietario||'')}</option>`).join('');
  if(!document.getElementById('liqMes').value) document.getElementById('liqMes').value = periodoActual();
}

function obtenerEgresosAgrupados(periodo){
  const egs = estado.egresos.filter(e=>e.periodo===periodo);
  // Sin prototipo, por la misma razon que en actualizarSugerenciaTotal: con
  // un objeto comun, la categoria "__proto__" devolvia Object.prototype y la
  // suma de abajo escribia en el de todos los objetos de la pagina.
  const grupos = Object.create(null);
  egs.forEach(e=>{
    if(!grupos[e.categoria]) grupos[e.categoria] = { total:0, items:[] };
    grupos[e.categoria].total += e.monto;
    grupos[e.categoria].items.push(e);
  });
  return grupos;
}

function obtenerUltimoPago(uid, antesPeriodo){
  const pagos = estado.cobros
    .filter(c=>c.unidadId===uid && c.estado==='pagado')
    .filter(c=>!antesPeriodo || c.periodo<antesPeriodo)
    .sort((a,b)=>(b.fechaPago||'').localeCompare(a.fechaPago||''));
  if(!pagos.length) return null;
  // Agrupar por fecha
  const pago = pagos[0];
  const mismaFecha = pagos.filter(p=>p.fechaPago===pago.fechaPago);
  const total = mismaFecha.reduce((s,p)=>s+(p.montoPagado||p.adeudado||0),0);
  return { fecha:pago.fechaPago, monto:total, folio:pago.folioBoleta };
}

// El folio identifica al documento, así que la misma liquidación tiene que
// salir siempre con el mismo número. Antes se sorteaba con Math.random() y
// cada impresión llevaba uno distinto — en un aviso de cobro que, firmado por
// el administrador, tiene mérito ejecutivo (art. 32). Ahora se toma del mismo
// correlativo que las boletas y queda guardado la primera vez que se emite.
function folioLiquidacion(unidadId, periodo){
  if(!estado.foliosLiq) estado.foliosLiq = {};
  const clave = `${unidadId}|${periodo}`;
  if(!estado.foliosLiq[clave]){
    estado.contadorFolio++;
    estado.foliosLiq[clave] = estado.contadorFolio;
    guardar();
  }
  return estado.foliosLiq[clave];
}

function buildLiquidacionHTML(unidad, periodo){
  // El periodo se imprime una docena de veces en el documento; se exige su
  // forma una vez aqui en vez de escaparlo en cada una.
  if(!esPeriodo(periodo)) return '';
  const c = estado.config;
  const cobrosPeriodo = estado.cobros.filter(co=>co.unidadId===unidad.id && co.periodo===periodo);
  const totalAPagar = cobrosPeriodo.filter(co=>co.estado==='pendiente').reduce((s,co)=>s+co.adeudado,0);
  const adeudadoHistorico = estado.cobros.filter(co=>co.unidadId===unidad.id && co.estado==='pendiente' && co.periodo<periodo)
    .reduce((s,co)=>s+co.adeudado,0);
  const ultPago = obtenerUltimoPago(unidad.id, periodo);
  const fechaEmision = fechaHoy();
  const [pY, pM] = periodo.split('-').map(Number);
  const venc = new Date(pY, pM, c.diaVenc||18); // mes siguiente
  const vencStr = venc.toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'numeric'});
  const folioEmision = folioLiquidacion(unidad.id, periodo);

  // Egresos agrupados
  const grupos = obtenerEgresosAgrupados(periodo);
  const totalEgresosCom = Object.values(grupos).reduce((s,g)=>s+g.total,0);
  // Recaudación de gasto común, sin lo que se fue al fondo de reserva: eso se
  // informa aparte, más abajo y en la página 3 (art. 39).
  const recaudadoMes = estado.cobros.filter(co=>co.estado==='pagado' && co.periodo===periodo && !esDelFondo(co))
    .reduce((s,co)=>s+(co.montoPagado||co.adeudado||0),0);
  const ingresosExtra = estado.ingresos.filter(i=>i.periodo===periodo).reduce((s,i)=>s+i.monto,0);
  const totalIngresos = recaudadoMes + ingresosExtra;
  const saldoCaja = calcSaldoCaja(periodo);
  const saldoFondo = calcSaldoFondo(periodo);
  const aportesFondoMes = estado.cobros.filter(co=>co.estado==='pagado' && esDelFondo(co) && co.periodo===periodo)
    .reduce((s,co)=>s+(co.montoPagado||co.adeudado||0),0);
  const egresosFondoMes = estado.fondo.filter(m=>m.tipo==='egreso' && m.periodo===periodo).reduce((s,m)=>s+m.monto,0);

  // Histórico 12 meses para gráfico
  const periodos12 = periodosUlt(12, periodo);
  const datosEgresos = periodos12.map(p=>estado.egresos.filter(e=>e.periodo===p).reduce((s,e)=>s+e.monto,0));
  const maxEg = Math.max(1, ...datosEgresos);

  let html = `<div class="liquidacion">`;

  /* ====== PÁGINA 1 ====== */
  html += `<div class="liq-page">
    <div class="liq-title">
      <div>
        <div class="ttl">Liquidación de gastos comunes</div>
        <div class="legal-ref">Documento conforme art. 31 Ley N° 21.442 y art. 24 Decreto N° 7/2023 MINVU. Mérito ejecutivo según art. 32 Ley.</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6E7276">Folio ${fmtNum(folioEmision)}<br>Emitido ${fmtFecha(fechaEmision)}</div>
    </div>
    <div class="liq-cond">
      <div class="box">
        <strong style="font-family:'Fraunces',serif;font-size:16px">${escapeHtml(c.condNombre||'Condominio')}</strong><br>
        ${escapeHtml(c.condDir||'')}<br>
        ${escapeHtml(c.condComuna||'')}<br>
        <strong>RUT:</strong> ${escapeHtml(c.condRut||'—')}
      </div>
      <div class="pay-box">
        <div class="h">Pague sus gastos comunes a tiempo.</div>
        <div><strong>${escapeHtml(c.banco||'—')}</strong> · ${escapeHtml(c.bancoTipo||'')}</div>
        <div>N° ${escapeHtml(c.bancoNum||'—')}</div>
        <div>${escapeHtml(c.bancoTitular||c.condNombre||'')}</div>
        <div style="margin-top:4px;font-size:11px">Enviar comprobante a:<br>${escapeHtml(c.admCorreo||'—')}</div>
      </div>
    </div>

    <div class="liq-unit">
      <div><span class="lbl">Unidad:</span> <strong>${escapeHtml(unidad.codigo)}</strong></div>
      <div><span class="lbl">Vencimiento:</span> ${vencStr}</div>
      <div><span class="lbl">Residente:</span> ${escapeHtml(unidad.residente||unidad.propietario||'—')}</div>
      <div><span class="lbl">Mes de cobro:</span> ${fmtPeriodoLargo(periodo)}</div>
      <div><span class="lbl">Prorrateo:</span> ${fmtPct(unidad.alicuota)}</div>
      <div><span class="lbl">Fecha de emisión:</span> ${fmtFecha(fechaEmision)}</div>
      <div><span class="lbl">Folio último pago:</span> ${ultPago?.folio?fmtNum(ultPago.folio):'—'}</div>
      <div><span class="lbl">Último pago:</span> ${ultPago?fmtFecha(ultPago.fecha):'—'}</div>
      <div><span class="lbl">Monto último pago:</span> ${ultPago?fmtCLP(ultPago.monto):'—'}</div>
      <div><span class="lbl">Saldo anterior pendiente:</span> ${fmtCLP(adeudadoHistorico)}</div>
    </div>

    <div class="section-h">Detalle del cobro del período <span style="font-weight:400;font-size:11px">art. 31 Ley</span></div>
    <table class="liq-table">
      <thead><tr><th>Concepto</th><th class="num">Monto</th></tr></thead>
      <tbody>
        ${cobrosPeriodo.map(co=>`<tr><td>${escapeHtml(co.concepto||co.tipo)}</td><td class="num">${fmtCLP(co.adeudado)}</td></tr>`).join('') || '<tr><td colspan="2" style="text-align:center;color:#6E7276">No se han generado cobros para este período.</td></tr>'}
        ${adeudadoHistorico>0?`<tr><td><strong>Saldo pendiente períodos anteriores</strong></td><td class="num"><strong>${fmtCLP(adeudadoHistorico)}</strong></td></tr>`:''}
        <tr class="total-row"><td>Total a pagar</td><td class="num">${fmtCLP(totalAPagar+adeudadoHistorico)}</td></tr>
      </tbody>
    </table>

    <div class="liq-firma">
      <div class="firma-block">
        ${urlImagenSegura(c.admFirma)?`<img src="${escapeHtml(urlImagenSegura(c.admFirma))}" class="firma-img" />`:'<div class="firma-img"></div>'}
        <strong>${escapeHtml(c.admNombre||'Administrador')}</strong><br>
        ${escapeHtml(c.admCorreo||'')}<br>
        ${escapeHtml(c.admTel||'')}
        ${c.admRegistro?`<br><span style="font-size:10px;color:#6E7276">Reg. Nac. Adm. N° ${escapeHtml(c.admRegistro)}</span>`:''}
      </div>
      <div class="total-pago">
        <div class="lbl">Total a pagar</div>
        <div class="val">${fmtCLP(totalAPagar+adeudadoHistorico)}</div>
        <div style="font-size:11px;margin-top:4px">Vence: ${vencStr}</div>
      </div>
    </div>

    <div class="liq-obs" style="margin-top:14px">
      <h4>Observaciones de la administración</h4>
      ${c.obs ? escapeHtml(c.obs).split('\n').map(l=>'<div>'+l+'</div>').join('') : '<div style="color:#6E7276">Sin observaciones registradas.</div>'}
      <hr class="soft" style="margin:8px 0">
      <div style="font-size:10.5px;color:#6E7276">
        Mora: interés de ${fmtPct(c.tasaMora)} mensual sobre saldos morosos, según el reglamento de copropiedad. El art. 7 de la Ley N° 21.442 lo limita al 50% del interés corriente bancario${c.interesCorriente>0?`, que este mes es de ${fmtPct(c.interesCorriente)} (tope: ${fmtPct(c.interesCorriente/2)})`:''}. La suspensión del servicio eléctrico, de telecomunicaciones o de calefacción procede desde tres cuotas adeudadas, continuas o discontinuas (arts. 20 N° 9 y 36 Ley), con acuerdo del Comité de Administración y avisando por escrito al copropietario o residente con al menos <b>5 días corridos</b> de anticipación (art. 27 Decreto 7/2023). No puede suspenderse más de un servicio a la vez, ni cortarse la electricidad en una unidad donde resida una <b>persona electrodependiente</b>, ni suspenderse ningún servicio por deudas devengadas durante un <b>estado de catástrofe</b> vigente que afecte al condominio (art. 36 Ley).
      </div>
    </div>

    <div class="liq-foot">Página 1 / 3 · Liquidación ${fmtPeriodoLargo(periodo)} · Unidad ${escapeHtml(unidad.codigo)}</div>
  </div>`;

  /* ====== PÁGINA 2: EGRESOS ====== */
  html += `<div class="liq-page">
    <div class="liq-title">
      <div>
        <div class="ttl">Egresos del condominio</div>
        <div class="legal-ref">Detalle de egresos del período · art. 31 Ley + art. 24 Decreto 7/2023</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6E7276">${escapeHtml(c.condNombre||'')}<br>${fmtPeriodoLargo(periodo)}</div>
    </div>

    <div class="section-h">Egresos del período <span style="font-weight:600">${fmtCLP(totalEgresosCom)}</span></div>
    <table class="liq-table">
      <thead><tr><th>N°</th><th>Concepto</th><th>Descripción</th><th>N° Doc</th><th>Fecha</th><th class="num">Monto</th></tr></thead>
      <tbody>
        ${Object.keys(grupos).length ? Object.entries(grupos).map(([cat,g])=>{
          let r = `<tr class="cat-row"><td colspan="5">${escapeHtml(cat)}</td><td class="num">${fmtCLP(g.total)}</td></tr>`;
          g.items.forEach((it,idx)=>{
            r += `<tr>
              <td>${idx+1}</td>
              <td>${escapeHtml(it.contraparte||it.subcat||'—')}</td>
              <td>${escapeHtml(it.descripcion||it.subcat||'—')}</td>
              <td>${escapeHtml(it.numDoc||'—')}</td>
              <td>${fmtFecha(it.fecha)}</td>
              <td class="num">${fmtCLP(it.monto)}</td>
            </tr>`;
          });
          return r;
        }).join('') : '<tr><td colspan="6" style="text-align:center;color:#6E7276;padding:18px">No se han registrado egresos para este período.</td></tr>'}
        <tr class="total-row"><td colspan="5">Total egresos del período</td><td class="num">${fmtCLP(totalEgresosCom)}</td></tr>
      </tbody>
    </table>

    <div class="section-h primary">Resumen de ingresos, egresos y saldo de caja <span style="font-size:11px;font-weight:600">art. 31 inc. 1 Ley</span></div>
    <div class="resumen-caja green">
      <div class="green"><div class="lbl">Total ingresos</div><div class="val">${fmtCLP(totalIngresos)}</div><div style="font-size:10.5px;color:#6E7276;margin-top:2px">Recaudación + ingresos extraordinarios</div></div>
      <div class="red"><div class="lbl">Total egresos</div><div class="val">${fmtCLP(totalEgresosCom)}</div><div style="font-size:10.5px;color:#6E7276;margin-top:2px">${fmtPeriodoLargo(periodo)}</div></div>
      <div><div class="lbl">Saldo de caja</div><div class="val" style="color:${saldoCaja>=0?'var(--success)':'var(--danger)'}">${fmtCLP(saldoCaja)}</div><div style="font-size:10.5px;color:#6E7276;margin-top:2px">Acumulado al cierre</div></div>
    </div>
    <div style="font-size:11px;color:#6E7276;margin:-8px 0 14px">
      Las tres cifras son de la cuenta de gasto común y no incluyen el fondo común de reserva,
      que se informa aparte porque el art. 39 de la Ley lo destina a gastos extraordinarios, urgentes o imprevistos. En este período entraron al fondo
      <strong>${fmtCLP(aportesFondoMes)}</strong>; su detalle y su saldo están en la página 3.
    </div>

    <div class="liq-foot">Página 2 / 3 · Liquidación ${fmtPeriodoLargo(periodo)} · Unidad ${escapeHtml(unidad.codigo)}</div>
  </div>`;

  /* ====== PÁGINA 3: FONDO Y EVOLUCIÓN ====== */
  // SVG chart
  const w=640, h=200, pl=60, pr=20, pt=20, pb=40;
  const cw = w-pl-pr, ch = h-pt-pb;
  const bw = cw/12 * 0.6;
  let chartSvg = '';
  for(let i=0;i<=3;i++){
    const y = pt + ch - (ch * i/3);
    const v = Math.round(maxEg * i/3);
    chartSvg += `<line x1="${pl}" y1="${y}" x2="${w-pr}" y2="${y}" stroke="#D7D6CE"/>`;
    chartSvg += `<text x="${pl-8}" y="${y+3}" text-anchor="end" font-size="10" fill="#6E7276">${fmtCLP(v)}</text>`;
  }
  periodos12.forEach((p,i)=>{
    const x = pl + (cw*i/12) + (cw/12 - bw)/2;
    const hEg = ch * (datosEgresos[i]/maxEg);
    chartSvg += `<rect x="${x}" y="${pt+ch-hEg}" width="${bw}" height="${hEg}" fill="#1E3A6E" opacity=".7" rx="2"/>`;
    chartSvg += `<text x="${x+bw/2}" y="${h-pb+15}" text-anchor="middle" font-size="9" fill="#6E7276">${fmtPeriodoCorto(p)}</text>`;
  });

  html += `<div class="liq-page">
    <div class="liq-title">
      <div>
        <div class="ttl">Fondo de reserva y evolución</div>
        <div class="legal-ref">art. 39 Ley 21.442 (fondo común de reserva) · art. 22 Ley (proyección)</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#6E7276">${escapeHtml(c.condNombre||'')}<br>${fmtPeriodoLargo(periodo)}</div>
    </div>

    <div class="section-h warning">Fondo común de reserva</div>
    <table class="liq-table">
      <thead><tr><th>Fondo</th><th class="num">Cobrado período</th><th class="num">Ingresos extra</th><th class="num">Egresos período</th><th class="num">Saldo actual</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>Fondo común de reserva (${fmtPct(c.porcFondo)})</strong></td>
          <td class="num">${fmtCLP(aportesFondoMes)}</td>
          <td class="num">${fmtCLP(estado.fondo.filter(m=>m.tipo==='ingreso'&&m.periodo===periodo).reduce((s,m)=>s+m.monto,0))}</td>
          <td class="num">${fmtCLP(egresosFondoMes)}</td>
          <td class="num"><strong>${fmtCLP(saldoFondo)}</strong></td>
        </tr>
      </tbody>
    </table>
    <div style="font-size:11px;color:#6E7276;margin-bottom:14px">Los recursos del fondo se mantienen en una cuenta corriente bancaria o de ahorro, o se invierten en instrumentos financieros previo acuerdo del comité; esa cuenta puede ser la misma del art. 33 (art. 39 inciso final, Ley 21.442). Se usa para gastos extraordinarios, urgentes o imprevistos con autorización del comité, y para gastos ordinarios de mantención o reparación solo con acuerdo de la asamblea por mayoría absoluta de los derechos del condominio (art. 39).</div>

    <div class="section-h primary" style="margin-top:18px">Evolución de egresos · últimos 12 meses</div>
    <div style="background:#fff;padding:16px;border:1px solid var(--line);border-top:0;border-radius:0 0 6px 6px">
      <svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto">${chartSvg}</svg>
      <div style="text-align:center;font-size:10.5px;color:#6E7276;margin-top:8px">Pesos chilenos · barras: egresos mensuales del condominio</div>
    </div>

    ${c.segCia ? `
    <div class="section-h" style="margin-top:18px">Seguro colectivo contra incendio · art. 43 Ley</div>
    <table class="liq-table">
      <tbody>
        <tr><td><strong>Compañía</strong></td><td>${escapeHtml(c.segCia)}</td><td><strong>Póliza</strong></td><td>${escapeHtml(c.segPoliza||'—')}</td></tr>
        <tr><td><strong>Vigencia hasta</strong></td><td>${c.segVig?fmtFecha(c.segVig):'—'}</td><td><strong>Cuota</strong></td><td>${escapeHtml(c.segCuotaAct||'—')} de ${escapeHtml(c.segCuotas||'—')}</td></tr>
        <tr><td><strong>Prima mensual</strong></td><td>${fmtCLP(c.segPrima)}</td><td colspan="2" style="font-size:10.5px;color:#6E7276">Prorrateada según alícuota — incluida en el aviso de cobro (art. 37 D.7).</td></tr>
      </tbody>
    </table>
    ` : ''}

    <div class="liq-obs" style="margin-top:18px">
      <h4>Información legal</h4>
      <div style="font-size:11px;color:#4b5563;line-height:1.55">
        Este documento da cumplimiento al art. 31 Ley N° 21.442, que exige consignar la proporción del copropietario en los gastos comunes y fondo de reserva, intereses y multas adeudadas, y el detalle de ingresos, egresos mensuales y saldo de caja del condominio. Conforme al art. 32 Ley, el aviso de cobro firmado por el administrador tiene mérito ejecutivo. La rendición mensual al comité de administración cumple lo dispuesto en el art. 21 Ley y en el art. 24 del Decreto N° 7/2023. Los respaldos (verificadores) de cada gasto están disponibles para revisión con 24 horas de antelación a la sesión ordinaria, conforme al art. 28 Decreto 7.
      </div>
    </div>

    <div class="liq-foot">Página 3 / 3 · Liquidación ${fmtPeriodoLargo(periodo)} · Unidad ${escapeHtml(unidad.codigo)}</div>
  </div>`;

  html += `</div>`;
  return html;
}

function renderLiquidacion(){
  const uid = document.getElementById('liqUnidad').value;
  const periodo = document.getElementById('liqMes').value;
  if(!uid){ toast('Seleccione una unidad'); return; }
  if(!esPeriodo(periodo)){ toast('Seleccione un período'); return; }
  const u = estado.unidades.find(x=>x.id===uid);
  if(!u){ toast('Unidad no encontrada'); return; }
  document.getElementById('liqContenedor').innerHTML = buildLiquidacionHTML(u, periodo);
}
function imprimirLiquidacion(){
  const uid = document.getElementById('liqUnidad').value;
  const periodo = document.getElementById('liqMes').value;
  if(!uid || !esPeriodo(periodo)){ toast('Seleccione unidad y período', 'warning'); return; }
  const u = estado.unidades.find(x=>x.id===uid);
  if(!u){ toast('Unidad no encontrada'); return; }
  document.getElementById('liquidacionPrint').innerHTML = buildLiquidacionHTML(u, periodo);
  // Sugerir nombre del PDF
  const oldTitle = document.title;
  document.title = `Liquidacion_${u.codigo}_${periodo}`;
  setTimeout(()=>{
    window.print();
    setTimeout(()=>{ document.title = oldTitle; }, 1000);
  }, 100);
}
async function generarTodasLiquidaciones(){
  const periodo = document.getElementById('liqMes').value;
  if(!esPeriodo(periodo)){ toast('Seleccione un período', 'warning'); return; }
  if(!estado.unidades.length){ toast('No hay unidades', 'warning'); return; }
  const ok = await confirmar({
    titulo:'Generar todas las liquidaciones',
    mensaje:`Se generarán ${fmtNum(estado.unidades.length)} liquidaciones de ${fmtPeriodoLargo(periodo)} en un solo documento.\n\nAl imprimir, recomendado: "Guardar como PDF" para luego enviar a cada copropietario.\n\nSugerencia: nombra el archivo "Liquidaciones_${(estado.config.condNombre||'Condominio').replace(/\s+/g,'_')}_${periodo}.pdf"`,
    okText:'Generar e imprimir',
    variant:'primary'
  });
  if(!ok) return;
  let all = '';
  estado.unidades.forEach(u=>{
    all += buildLiquidacionHTML(u, periodo);
  });
  document.getElementById('liquidacionPrint').innerHTML = all;
  // Cambiar título del documento temporalmente para sugerir el nombre del PDF
  const oldTitle = document.title;
  document.title = `Liquidaciones_${(estado.config.condNombre||'Condominio').replace(/\s+/g,'_')}_${periodo}`;
  setTimeout(()=>{
    window.print();
    setTimeout(()=>{ document.title = oldTitle; }, 1000);
  }, 200);
}

/* ============ PRESUPUESTO ============ */
function calcularPresupuesto(){
  // Promedio mensual de últimos 12 meses por categoría
  const periodos = periodosUlt(12);
  const porCat = Object.create(null);   // ver actualizarSugerenciaTotal
  estado.egresos.filter(e=>periodos.includes(e.periodo)).forEach(e=>{
    if(!porCat[e.categoria]) porCat[e.categoria] = 0;
    porCat[e.categoria] += e.monto;
  });
  const totalAnual = Object.values(porCat).reduce((s,v)=>s+v, 0);
  const tb = document.querySelector('#tablaPresupuesto tbody');
  if(!Object.keys(porCat).length){
    tb.innerHTML = `<tr><td colspan="4"><div class="empty"><div class="et">Sin datos históricos</div><div class="ed">Registre egresos en distintos meses para calcular el presupuesto.</div></div></td></tr>`;
    return;
  }
  const filas = Object.entries(porCat).sort((a,b)=>b[1]-a[1]);
  let totalProy = 0;
  tb.innerHTML = filas.map(([cat,total])=>{
    const promMensual = total/12;
    const proy = total; // = 12 meses
    totalProy += proy;
    return `<tr>
      <td><strong>${escapeHtml(cat)}</strong></td>
      <td class="num">${fmtCLP(promMensual)}</td>
      <td class="num">${fmtCLP(proy)}</td>
      <td class="num">${(total/totalAnual*100).toFixed(1)}%</td>
    </tr>`;
  }).join('') + `<tr style="font-weight:700;background:#f9fafb"><td>Total presupuesto anual estimado</td><td class="num">${fmtCLP(totalProy/12)}</td><td class="num">${fmtCLP(totalProy)}</td><td class="num">100%</td></tr>`;
  renderMantenciones();
  toast('Presupuesto calculado en base a últimos 12 meses');
}
function renderPresupuesto(){
  calcularPresupuesto();
  renderMantenciones();
}
function abrirMantencion(){
  document.getElementById('manMes').value = '';
  document.getElementById('manConcepto').value = '';
  document.getElementById('manCosto').value = '';
  document.getElementById('manTipo').value = 'mantencion';
  document.getElementById('manPrior').value = 'media';
  abrirModal('mMantencion');
}
function guardarMantencion(){
  const data = {
    id:id(),
    mes: document.getElementById('manMes').value,
    concepto: document.getElementById('manConcepto').value.trim(),
    costo: parseFloat(document.getElementById('manCosto').value)||0,
    tipo: document.getElementById('manTipo').value,
    prioridad: document.getElementById('manPrior').value,
  };
  if(!data.concepto || !data.mes){ toast('Mes y concepto son obligatorios'); return; }
  estado.mantenciones.push(data);
  guardar(); renderMantenciones(); cerrarModal('mMantencion');
  toast('Item agregado');
}
async function eliminarMantencion(id){
  const ok = await confirmar({
    titulo:'Eliminar item',
    mensaje:'¿Eliminar este item del programa de mantención?',
    okText:'Eliminar',
    variant:'danger'
  });
  if(!ok) return;
  estado.mantenciones = estado.mantenciones.filter(m=>m.id!==id);
  guardar(); renderMantenciones();
  toast('Item eliminado', 'success');
}
function renderMantenciones(){
  const tb = document.querySelector('#tablaMantenciones tbody');
  const items = [...estado.mantenciones].sort((a,b)=>(a.mes||'').localeCompare(b.mes||''));
  if(!items.length){
    tb.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="et">Sin programa de mantenciones</div><div class="ed">Agregue ítems para los próximos 12 meses.</div></div></td></tr>`;
    return;
  }
  tb.innerHTML = items.map(m=>`
    <tr>
      <td>${escapeHtml(fmtPeriodoLargo(m.mes))}</td>
      <td>${escapeHtml(m.concepto)} <span class="badge ${m.prioridad==='alta'?'danger':m.prioridad==='media'?'warning':'mute'}">${escapeHtml(m.prioridad)}</span></td>
      <td>${escapeHtml(m.tipo)}</td>
      <td class="num">${fmtCLP(m.costo)}</td>
      <td><button class="btn sm danger" data-ac="eliminarMantencion" data-args="${escapeHtml(m.id)}">Eliminar</button></td>
    </tr>`).join('');
}

/* ============ RESPALDOS ============ */

/*  Lo que llega de afuera
 *
 *  El respaldo es un archivo hecho para pasar de mano en mano: el tesorero
 *  saliente se lo entrega al que entra, la administradora se lo manda al
 *  comite. Lo que trae lo escribio otra persona, y hasta el 22-09-2026 se
 *  metia entero al estado con un Object.assign.
 *
 *  El dano concreto estaba en los identificadores. Se pintan dentro de
 *  atributos (data-args, id, value) y no se escapaban: un id con una
 *  comilla cerraba el atributo y le colgaba al boton otro data-ac, con la
 *  funcion que eligio quien armo el archivo (resetearTodo, por ejemplo), que
 *  corria en cuanto alguien tocaba el boton. Ahora los ids se escapan al
 *  pintarlos y, ademas, aqui:
 *
 *    - cada fila se reconstruye con sus claves conocidas, su tipo y un
 *      largo maximo; lo que el archivo traiga de mas no entra;
 *    - un id que no cumple ID_VALIDO, o que se repite en su lista, se cambia
 *      por uno nuevo, y se corrigen las referencias que lo nombraban (los
 *      cobros a su unidad, los folios de liquidacion a la suya);
 *    - la fila que no se puede interpretar -un cobro sin monto, un periodo
 *      que no es periodo, un tipo que no existe, una referencia ilegible- no
 *      se adivina: se descarta y se cuenta, para decirselo a la persona
 *      antes de reemplazar nada.
 *
 *  Todo lo que esta misma pagina guarda pasa sin cambios (lo comprueba
 *  Pruebas/prueba-seg-finanzas.mjs con los datos de demostracion), porque
 *  cargar() tambien pasa por aqui.
 */
const MAX_RESPALDO = 15 * 1024 * 1024;   // bytes
const TIPOS_COBRO = ['ordinaria','extraordinaria','fondo','seguro','multa','interes'];
const TIPOS_MANTENCION = ['mantencion','reparacion','certificacion','inspeccion'];
const PRIORIDADES = ['alta','media','baja'];
// Largo maximo de cada texto de la configuracion. La firma es larga porque
// puede venir como imagen incrustada (data:image/...).
const LARGO_CONFIG = {
  condNombre:200, condRut:20, condDir:200, condComuna:120,
  admNombre:200, admRut:20, admCorreo:254, admTel:40, admRegistro:60, admFirma:500000,
  banco:120, bancoTipo:60, bancoNum:40, bancoTitular:200,
  obs:10000, segCia:120, segPoliza:60, segVig:10,
};
// Largo maximo de los textos de cada fila. Son los mismos maxlength de los
// campos de finanzas.html y los que aplica el importador de planillas: si la
// pagina dejara escribir mas de lo que esta revision acepta, cargar()
// recortaria en silencio lo que la propia persona anoto.
const LARGO = {
  codigo:60, propietario:200, residente:200, correo:254, tel:40, rut:20,
  concepto:300, categoria:120, subcat:200, contraparte:200, numDoc:60,
  descripcion:2000, boletaURL:2000, origen:200,
};

const esFila = v => !!v && typeof v === 'object' && !Array.isArray(v);
// Texto: una cadena, o un numero que una planilla pudo dejar como tal. Otra
// cosa (un objeto, una lista) queda vacia en vez de volverse "[object Object]".
const textoCampo = (v, max) =>
  typeof v === 'string' ? v.slice(0, max)
  : (typeof v === 'number' && Number.isFinite(v)) ? String(v).slice(0, max) : '';
// Numero finito, escrito como numero o como texto ("1500"). Si no, null.
const numeroCampo = v => {
  const n = typeof v === 'number' ? v
          : (typeof v === 'string' && v.trim() !== '') ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
// Un monto de cobro o de gasto no es negativo: la pagina exige mas de cero.
const montoCampo = v => { const n = numeroCampo(v); return n !== null && n >= 0 ? n : null; };
// Fecha y periodo: vacio vale (la pagina lo deja asi si se borra el campo);
// cualquier otra forma no se puede interpretar y devuelve null.
const fechaCampo = v => (v == null || v === '') ? ''
  : (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) ? v : null;
const periodoCampo = v => (v == null || v === '') ? '' : esPeriodo(v) ? v : null;

// Devuelve { estado, descartadas, idsNuevos }. Lanza un error solo si lo que
// llega ni siquiera es un objeto: eso no es un respaldo de estas cuentas.
function sanearEstado(data){
  if(!esFila(data)) throw new Error('no tiene la forma de un respaldo de estas cuentas');
  const limpio = JSON.parse(JSON.stringify(estadoInicial));
  let descartadas = 0, idsNuevos = 0;
  const lista = v => Array.isArray(v) ? v : [];

  // El id de una fila: si cumple el formato y no se repite en su lista, se
  // conserva. Si no, se cambia por uno nuevo; y si el viejo era ilegible, se
  // anota en "cambios" para corregir las referencias que lo nombraban. Un id
  // repetido no se anota: sus referencias siguen yendo a la primera fila.
  // El id nuevo tampoco puede coincidir con uno valido que aparece MAS ABAJO
  // en la misma lista ("reservados"): esa fila tendria que cambiarlo a su vez,
  // y lo que la nombraba pasaria a nombrar a la otra.
  const reservar = v => new Set(lista(v).map(x=>esFila(x) ? x.id : null)
    .filter(x=>typeof x === 'string' && ID_VALIDO.test(x)));
  const tomarId = (viejo, usados, cambios, reservados) => {
    if(typeof viejo === 'string' && ID_VALIDO.test(viejo) && !usados.has(viejo)){
      usados.add(viejo);
      return viejo;
    }
    let nuevo;
    do { nuevo = id(); }
    while(usados.has(nuevo) || (reservados && reservados.has(nuevo)) || !ID_VALIDO.test(nuevo));
    usados.add(nuevo);
    idsNuevos++;
    if(cambios && typeof viejo === 'string' && !ID_VALIDO.test(viejo) && !cambios.has(viejo))
      cambios.set(viejo, nuevo);
    return nuevo;
  };

  // ---- configuracion: solo las claves que la pagina conoce ----
  const cfg = esFila(data.config) ? data.config : {};
  Object.keys(estadoInicial.config).forEach(k=>{
    if(!propia(cfg, k)) return;
    if(typeof estadoInicial.config[k] === 'number'){
      const n = numeroCampo(cfg[k]);
      if(n !== null) limpio.config[k] = n;
    } else {
      limpio.config[k] = textoCampo(cfg[k], LARGO_CONFIG[k] || 200);
    }
  });
  // La firma termina en un <img src> y el vencimiento del seguro es fecha.
  // La fecha se mira en lo que vino, no en lo recortado: cortado a diez
  // caracteres, "2026-12-31<cualquier cosa>" pareceria una fecha valida.
  // Lo mismo con la firma: una imagen recortada sigue pareciendo base64 valido
  // y saldria rota en cada liquidacion. Si no cabe entera, no entra.
  if(typeof cfg.admFirma === 'string' && cfg.admFirma.length > LARGO_CONFIG.admFirma) limpio.config.admFirma = '';
  if(limpio.config.admFirma && !urlImagenSegura(limpio.config.admFirma)) limpio.config.admFirma = '';
  limpio.config.segVig = propia(cfg, 'segVig') ? (fechaCampo(cfg.segVig) || '') : '';

  // ---- unidades ----
  // Una unidad sin codigo sigue siendo una unidad (una planilla con la
  // celda en blanco la deja asi): solo se descarta lo que no es una fila.
  const usadosU = new Set(), cambiosU = new Map(), reservadosU = reservar(data.unidades);
  lista(data.unidades).forEach(u=>{
    if(!esFila(u)){ descartadas++; return; }
    const alic = numeroCampo(u.alicuota);
    const fila = {
      id: tomarId(u.id, usadosU, cambiosU, reservadosU),
      codigo: textoCampo(u.codigo, LARGO.codigo),
      tipo: TIPOS_UNIDAD.includes(u.tipo) ? u.tipo : 'departamento',
      propietario: textoCampo(u.propietario, LARGO.propietario),
      residente: textoCampo(u.residente, LARGO.residente),
      correo: textoCampo(u.correo, LARGO.correo),
      tel: textoCampo(u.tel, LARGO.tel),
      alicuota: alic !== null ? alic : 0,
    };
    if(propia(u, 'rut')) fila.rut = textoCampo(u.rut, LARGO.rut);
    limpio.unidades.push(fila);
  });
  // A que unidad apunta una referencia: la nueva si su id se cambio, la misma
  // si tiene formato valido, vacio si venia vacio (un cobro anotado cuando
  // aun no habia unidades). Cualquier otra cosa es ilegible: null.
  const refUnidad = v => {
    if(typeof v !== 'string') return null;
    if(cambiosU.has(v)) return cambiosU.get(v);
    return (v === '' || ID_VALIDO.test(v)) ? v : null;
  };

  // ---- cobros ----
  const usadosC = new Set();
  lista(data.cobros).forEach(c=>{
    const ok = esFila(c);
    const unidadId = ok ? refUnidad(c.unidadId) : null;
    const periodo = ok ? periodoCampo(c.periodo) : null;
    const adeudado = ok ? montoCampo(c.adeudado) : null;
    if(unidadId === null || periodo === null || adeudado === null ||
       !TIPOS_COBRO.includes(c.tipo) || (c.estado !== 'pendiente' && c.estado !== 'pagado')){
      descartadas++; return;
    }
    const fila = { id: tomarId(c.id, usadosC), unidadId, periodo, tipo: c.tipo,
      concepto: textoCampo(c.concepto, LARGO.concepto), adeudado, estado: c.estado };
    if(propia(c, 'fechaPago')) fila.fechaPago = fechaCampo(c.fechaPago) || '';
    if(propia(c, 'montoPagado')) fila.montoPagado = numeroCampo(c.montoPagado) || 0;
    if(propia(c, 'folioBoleta')) fila.folioBoleta = Math.floor(montoCampo(c.folioBoleta) || 0);
    limpio.cobros.push(fila);
  });

  // ---- egresos, ingresos y fondo: fecha, periodo y monto son la fila ----
  // "resto" arma los demas campos de la fila, o devuelve null si alguno
  // esencial no se puede interpretar.
  const movimiento = (x, usados, resto) => {
    if(!esFila(x)) return null;
    const fecha = fechaCampo(x.fecha);
    let periodo = periodoCampo(x.periodo);
    const monto = montoCampo(x.monto);
    const campos = resto(x);
    if(fecha === null || periodo === null || monto === null || !campos) return null;
    // La pagina deriva el periodo de la fecha; si falta, se deriva igual.
    if(!periodo && fecha) periodo = fecha.slice(0,7);
    return Object.assign({ id: tomarId(x.id, usados), fecha, periodo, monto }, campos);
  };
  const usadosE = new Set(), usadosI = new Set(), usadosF = new Set();
  lista(data.egresos).forEach(e=>{
    const fila = movimiento(e, usadosE, x=>({
      categoria: textoCampo(x.categoria, LARGO.categoria), subcat: textoCampo(x.subcat, LARGO.subcat),
      contraparte: textoCampo(x.contraparte, LARGO.contraparte), numDoc: textoCampo(x.numDoc, LARGO.numDoc),
      descripcion: textoCampo(x.descripcion, LARGO.descripcion),
      // Se guarda como texto: si es enlace o no lo decide enlaceBoleta al
      // pintarlo. Una ruta del computador es un dato legitimo.
      boletaURL: textoCampo(x.boletaURL, LARGO.boletaURL),
    }));
    if(fila) limpio.egresos.push(fila); else descartadas++;
  });
  lista(data.ingresos).forEach(i=>{
    const fila = movimiento(i, usadosI, x=>({
      categoria: textoCampo(x.categoria, LARGO.categoria), contraparte: textoCampo(x.contraparte, LARGO.contraparte),
      descripcion: textoCampo(x.descripcion, LARGO.descripcion),
    }));
    if(fila) limpio.ingresos.push(fila); else descartadas++;
  });
  lista(data.fondo).forEach(m=>{
    // Aporte o uso: otro tipo no se puede sumar ni restar al fondo.
    const fila = movimiento(m, usadosF, x=>
      (x.tipo === 'ingreso' || x.tipo === 'egreso') ? {
        tipo: x.tipo, origen: textoCampo(x.origen, LARGO.origen), descripcion: textoCampo(x.descripcion, LARGO.descripcion),
      } : null);
    if(fila) limpio.fondo.push(fila); else descartadas++;
  });

  // ---- programa de mantenciones: sin mes o sin concepto no es un item ----
  const usadosM = new Set();
  lista(data.mantenciones).forEach(m=>{
    const mes = esFila(m) ? periodoCampo(m.mes) : null;
    const concepto = esFila(m) ? textoCampo(m.concepto, LARGO.concepto) : '';
    if(!mes || !concepto.trim()){ descartadas++; return; }
    const costo = numeroCampo(m.costo);
    limpio.mantenciones.push({ id: tomarId(m.id, usadosM), mes, concepto,
      costo: costo !== null ? costo : 0,
      tipo: TIPOS_MANTENCION.includes(m.tipo) ? m.tipo : 'mantencion',
      prioridad: PRIORIDADES.includes(m.prioridad) ? m.prioridad : 'media' });
  });

  // ---- folios de liquidacion: "unidadId|AAAA-MM" -> numero ----
  const fl = esFila(data.foliosLiq) ? data.foliosLiq : {};
  Object.keys(fl).forEach(clave=>{
    // Se corta en el ULTIMO "|": un id ilegible pudo traer otros adentro.
    const corte = clave.lastIndexOf('|');
    const uid = corte > 0 ? refUnidad(clave.slice(0, corte)) : null;
    const periodo = clave.slice(corte + 1);
    const folio = montoCampo(fl[clave]);
    if(!uid || !esPeriodo(periodo) || !folio){ descartadas++; return; }
    limpio.foliosLiq[uid + '|' + periodo] = Math.floor(folio);
  });

  // El correlativo no puede quedar por debajo de un folio ya emitido: el
  // proximo pago repetiria numero en un documento con merito ejecutivo.
  let tope = 0;
  limpio.cobros.forEach(c=>{ if(c.folioBoleta > tope) tope = c.folioBoleta; });
  Object.keys(limpio.foliosLiq).forEach(k=>{ if(limpio.foliosLiq[k] > tope) tope = limpio.foliosLiq[k]; });
  const cf = montoCampo(data.contadorFolio);
  limpio.contadorFolio = Math.max(cf !== null ? Math.floor(cf) : estadoInicial.contadorFolio, tope);

  return { estado: limpio, descartadas, idsNuevos };
}

function exportarRespaldo(){
  const data = JSON.stringify(estado, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `respaldo_${estado.config.condNombre||'condominio'}_${fechaHoy()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
async function importarRespaldo(){
  const f = document.getElementById('importFile').files[0];
  if(!f){ toast('Seleccione un archivo', 'warning'); return; }
  // El respaldo de un condominio grande, con anos de cobros, pesa unos pocos
  // MB, y el navegador no guarda mucho mas. Algo muy superior no es un
  // respaldo de estas cuentas y no vale la pena leerlo entero.
  if(f.size > MAX_RESPALDO){ toast('El archivo es demasiado grande para ser un respaldo de estas cuentas', 'danger'); return; }
  let r;
  try{
    // Se revisa ANTES de preguntar: la persona decide si reemplaza sus datos
    // sabiendo lo que trae el archivo, no despues.
    r = sanearEstado(JSON.parse(await f.text()));
  }catch(err){ toast('Archivo inválido: '+err.message, 'danger'); return; }
  const avisos = [];
  if(r.descartadas) avisos.push(r.descartadas === 1
    ? '1 fila no se pudo leer y se descarta.'
    : `${fmtNum(r.descartadas)} filas no se pudieron leer y se descartan.`);
  if(r.idsNuevos) avisos.push(r.idsNuevos === 1
    ? '1 identificador venía con un formato inválido o repetido y se reemplaza.'
    : `${fmtNum(r.idsNuevos)} identificadores venían con un formato inválido o repetidos y se reemplazan.`);
  if(avisos.length) avisos.push('Si nadie editó el archivo a mano, conviene preguntar a quien lo envió.');
  const ok = await confirmar({
    titulo:'Reemplazar todos los datos',
    mensaje:`Esto reemplazará todos los datos actuales del condominio con los del archivo de respaldo.\nLa acción no se puede deshacer.` +
      (avisos.length ? '\n\nAl revisar el archivo: ' + avisos.join(' ') : ''),
    okText:'Reemplazar',
    variant:'warning'
  });
  if(!ok) return;
  const previo = estado;
  estado = r.estado;
  if(hayCofre()){
    // Protegidas: el respaldo entra cifrado con la misma contrasena. Si no
    // se pudo escribir, guardar() ya lo dijo y lo de antes sigue intacto.
    if(!(await guardar())){ estado = previo; return; }
    await CofreFinanzas.esperar();
    toast('Respaldo importado', 'success');
    location.reload();
    return;
  }
  try{ guardar(); }
  catch(err){
    // No cupo: se vuelve a lo que estaba guardado, que sigue intacto.
    estado = JSON.parse(JSON.stringify(estadoInicial));
    cargar();
    toast('No se pudo guardar en este navegador: '+err.message, 'danger');
    return;
  }
  toast('Respaldo importado', 'success');
  location.reload();
}
async function resetearTodo(){
  const ok1 = await confirmar({
    titulo:'Borrar todos los datos',
    mensaje:`Esto borrará completamente el estado del condominio: configuración, copropietarios, gastos, cuotas, fondo y mantenciones.\nNo se puede deshacer.`,
    okText:'Continuar',
    variant:'danger'
  });
  if(!ok1) return;
  const ok2 = await confirmar({
    titulo:'Confirmación final',
    mensaje:'¿Borrar todos los datos del condominio?',
    okText:'Sí, borrar todo',
    variant:'danger'
  });
  if(!ok2) return;
  localStorage.removeItem(STORAGE_KEY);
  if(hayCofre()){ await CofreFinanzas.esperar(); CofreFinanzas.olvidar(); }
  location.reload();
}

async function cargarDemo(){
  if(estado.unidades.length){
    const ok = await confirmar({
      titulo:'Cargar datos de prueba',
      mensaje:'Ya hay datos cargados en el sistema. Si continúas, serán reemplazados por los datos demostrativos.',
      okText:'Reemplazar',
      variant:'warning'
    });
    if(!ok) return;
  }
  estado = JSON.parse(JSON.stringify(estadoInicial));
  estado.config = {
    condNombre:'Edificio Cordillera de los Andes',
    condRut:'22.222.222-2',
    condDir:'Avenida Pedro de Valdivia 4520, Torre B',
    condComuna:'Ñuñoa, Región Metropolitana',
    admNombre:'María Eugenia Salinas Henríquez',
    admRut:'11.111.111-1',
    admCorreo:'administracion@ejemplo.cl',
    admTel:'+56 9 0000 0000',
    admRegistro:'RNA-2024-08731',
    admFirma:'',
    porcFondo:5, tasaMora:1.5, diaVenc:18,
    banco:'Banco Estado', bancoTipo:'Cuenta corriente',
    bancoNum:'0000000000', bancoTitular:'Edificio Cordillera de los Andes',
    obs:'Datos para transferencia electrónica:\nBanco Estado · Cta Cte 0000000000 · RUT 22.222.222-2\nDestinatario: Edificio Cordillera de los Andes\n\nEnviar comprobante a administracion@ejemplo.cl indicando el N° de departamento.\nRecuerde: el plazo de pago es de 10 días desde la emisión del aviso, salvo que el reglamento de copropiedad fije otro (art. 7 Ley 21.442). Pasado ese plazo corre el interés por mora indicado más abajo.',
    segCia:'HDI Seguros', segPoliza:'POL-2025-44782', segVig:'2026-12-31',
    segPrima:65000, segCuotas:12, segCuotaAct:5,
  };

  // 18 unidades de ejemplo (alícuotas suman 100%). Correos en ejemplo.cl,
  // teléfonos 0000 y RUT 11.111.111-1 / 22.222.222-2: nada que pueda ser de
  // una persona o una casilla reales (hallazgo CN-017 del 26-09-2026).
  // Edificio de 6 pisos, 3 deptos por piso (101-103, 201-203, ..., 601-603)
  // Alícuotas calibradas para sumar exactamente 100% (penthouse con mayor metraje paga más)
  const ROSTER = [
    // [codigo, propietario, residente_distinto?, correo, tel, alicuota, tipo]
    ['101','Roberto Andrés Hernández Cabrera', null,                            'roberto.hernandez@ejemplo.cl',   '+56 9 0000 0101', 5.20, 'departamento'],
    ['102','Patricia Andrea Soto Ríos',         'Camila Soto (arrendataria)',   'patricia.soto.r@ejemplo.cl',     '+56 9 0000 0102', 4.80, 'departamento'],
    ['103','Jorge Luis Méndez Vargas',          null,                            'jmendez@ejemplo.cl',           '+56 9 0000 0103', 5.10, 'departamento'],
    ['201','Sergio Manuel Tapia Bravo',         null,                            'sergio.tapia@ejemplo.cl',      '+56 9 0000 0201', 5.30, 'departamento'],
    ['202','Constanza Belén Pizarro Silva',     null,                            'cpizarrosilva@ejemplo.cl',       '+56 9 0000 0202', 4.90, 'departamento'],
    ['203','Francisco Javier Cornejo Lagos',    null,                            'fcornejo.lagos@ejemplo.cl',      '+56 9 0000 0203', 5.20, 'departamento'],
    ['301','Marta Ximena Aguirre Olmos',        null,                            'marta.aguirre@ejemplo.cl',       '+56 9 0000 0301', 5.40, 'departamento'],
    ['302','Inversiones Las Palmas SpA',        'Daniel Rojas (arrendatario)',  'contacto.302@ejemplo.cl',     '+56 9 0000 0302', 5.00, 'departamento'],
    ['303','Hernán Alejandro Saavedra Pino',    null,                            'hsaavedra.p@ejemplo.cl',         '+56 9 0000 0303', 5.30, 'departamento'],
    ['401','Andrea Paulina Veloso Maldonado',   null,                            'andreaveloso@ejemplo.cl',        '+56 9 0000 0401', 5.50, 'departamento'],
    ['402','Eduardo Sebastián Rojas Bustamante',null,                            'eduardo.rojas.b@ejemplo.cl',     '+56 9 0000 0402', 5.20, 'departamento'],
    ['403','Carolina Ester Mardones Quintana',  null,                            'cmardones@ejemplo.cl',           '+56 9 0000 0403', 5.30, 'departamento'],
    ['501','Luis Antonio Cifuentes Pereira',    null,                            'lcifuentes.p@ejemplo.cl',        '+56 9 0000 0501', 5.50, 'departamento'],
    ['502','Ignacio José Bravo Arancibia',      null,                            'ignacio.bravo.a@ejemplo.cl',     '+56 9 0000 0502', 5.40, 'departamento'],
    ['503','Verónica Lorena Espinoza Tobar',    null,                            'veronica.espinoza@ejemplo.cl',   '+56 9 0000 0503', 5.50, 'departamento'],
    ['601','Familia Henríquez-Vargas',          'Don Mario y señora',            'mariohv@ejemplo.cl',             '+56 9 0000 0601', 7.50, 'departamento'],
    ['602','Cristián Felipe Donoso Toro',       null,                            'cdonoso.toro@ejemplo.cl',        '+56 9 0000 0602', 7.00, 'departamento'],
    ['603','Susana del Carmen Riquelme Núñez',  null,                            'susanariquelme@ejemplo.cl',      '+56 9 0000 0603', 6.90, 'departamento'],
  ];
  // Verificación: las alícuotas suman 100.00%
  ROSTER.forEach(r=>{
    estado.unidades.push({
      id:id(), codigo:`B-${r[0]}`, tipo:r[6],
      propietario:r[1], residente:r[2]||r[1],
      correo:r[3], tel:r[4],
      alicuota:r[5]
    });
  });

  // Catálogo realista de gastos mensuales recurrentes
  const GASTOS_MENSUALES = [
    {cat:'Administración', sub:'Honorarios administradora', prov:'María Eugenia Salinas H.',     doc:'BHE-2025-', base:380000, var:0},
    {cat:'Liquidaciones',  sub:'Sueldo conserje turno día', prov:'Don Pedro Manuel Cárcamo S.',  doc:'LIQ-PMC-', base:520000, var:0},
    {cat:'Liquidaciones',  sub:'Sueldo conserje turno noche', prov:'Don Juan Carlos Lara V.',    doc:'LIQ-JCL-', base:540000, var:0},
    {cat:'Previred',       sub:'Cotizaciones previsionales', prov:'Previred S.A.',               doc:'PRV-',    base:285000, var:0},
    {cat:'Servicios básicos', sub:'Cuenta agua potable',   prov:'Aguas Andinas',                doc:'AA-',     base:185000, var:0.15},
    {cat:'Servicios básicos', sub:'Cuenta luz áreas comunes', prov:'Enel Distribución',         doc:'EN-',     base:148000, var:0.18},
    {cat:'Servicios básicos', sub:'Cuenta gas calderas',   prov:'Lipigas',                       doc:'LP-',     base:95000,  var:0.22},
    {cat:'Mantenimiento de bombas', sub:'Mantención mensual', prov:'Hidráulica López SpA',      doc:'HL-',     base:75000,  var:0.05},
    {cat:'Mantención',      sub:'Mantención ascensor',     prov:'Otis Chile S.A.',               doc:'OT-',     base:165000, var:0},
    {cat:'Jardinería',      sub:'Mantención áreas verdes', prov:'Verde Vivo Limitada',           doc:'VV-',     base:120000, var:0.05},
    {cat:'Artículos de limpieza', sub:'Insumos aseo común', prov:'Comercial San Diego',         doc:'CSD-',    base:48000,  var:0.20},
    {cat:'Reemplazo de conserjería', sub:'Días libres conserjes', prov:'Carlos Mauricio Pino A.', doc:'REM-',  base:90000,  var:0.30},
    {cat:'Seguros',         sub:'Prima seguro incendio (cuota mensual)', prov:'HDI Seguros',     doc:'HDI-',    base:65000,  var:0},
    {cat:'Uso o consumo',   sub:'Internet conserjería',    prov:'Movistar Empresas',             doc:'MV-',     base:18900,  var:0},
    {cat:'Uso o consumo',   sub:'Software administrativo', prov:'Comunidad Feliz',               doc:'CF-',     base:25900,  var:0},
  ];
  // Gastos extraordinarios eventuales
  const GASTOS_EXTRA = [
    {month:3, items:[{cat:'Gastos extraordinarios', sub:'Pintura escalera norte', prov:'Pinturas y Acabados Solis Ltda.', doc:'PYA-2026-014', monto:680000}]},
    {month:1, items:[{cat:'Reparación', sub:'Cambio bomba presurizadora', prov:'Hidráulica López SpA', doc:'HL-REP-2025-44', monto:1250000}]},
    {month:4, items:[{cat:'Mantención', sub:'Limpieza de fachadas (anual)', prov:'Servicios Verticales Andinos', doc:'SVA-2026-08', monto:450000}]},
  ];

  // Generar 8 meses de historia (julio 2025 → febrero 2026 + actual)
  // Ajustar fechas a partir del mes actual hacia atrás
  const HOY = new Date();
  for(let m=8; m>=0; m--){
    const fecha = new Date(HOY.getFullYear(), HOY.getMonth()-m, 1);
    const periodo = aPeriodoLocal(fecha);
    const yearShort = String(fecha.getFullYear()).slice(2);
    let docCounter = 100;
    // Gastos recurrentes
    GASTOS_MENSUALES.forEach((g, idx)=>{
      const variacion = g.var ? (1 + (Math.random()-0.5)*g.var) : 1;
      const monto = Math.round(g.base * variacion);
      estado.egresos.push({
        id:id(),
        fecha:`${periodo}-${String(2 + (idx % 25)).padStart(2,'0')}`,
        periodo,
        categoria:g.cat, subcat:g.sub,
        contraparte:g.prov,
        numDoc: g.doc + yearShort + String(docCounter++).padStart(4,'0'),
        monto,
        descripcion:`${g.sub} · ${fmtPeriodoLargo(periodo)}`,
        boletaURL: idx % 4 === 0 ? `https://drive.google.com/file/d/demo_${periodo}_${idx}/view` : ''
      });
    });
    // Gastos extraordinarios para mes específico
    GASTOS_EXTRA.forEach(ge=>{
      if(ge.month === m){
        ge.items.forEach((it, idx)=>{
          estado.egresos.push({
            id:id(),
            fecha:`${periodo}-${15+idx}`,
            periodo,
            categoria:it.cat, subcat:it.sub,
            contraparte:it.prov, numDoc:it.doc,
            monto:it.monto,
            descripcion:`${it.sub} · ${fmtPeriodoLargo(periodo)}`,
            boletaURL:''
          });
        });
      }
    });

    // Total a recaudar = suma de gastos del mes
    const totalGastosMes = estado.egresos.filter(e=>e.periodo===periodo).reduce((s,e)=>s+e.monto,0);

    // Cobros del mes — distribución por alícuota
    const isMesActual = (m === 0);
    let folioPrincipio = 5500 + (8-m) * 30;
    estado.unidades.forEach((u, uIdx)=>{
      const cuota = Math.round(totalGastosMes * u.alicuota/100);
      const fondo = Math.round(cuota * 0.05);
      const seguro = Math.round(65000 * u.alicuota/100);
      // Un condominio que funciona. Del mes en curso falta lo que aun no
      // vence (~20%), y del anterior quedan dos rezagados. Mas atras esta
      // todo cobrado: en la vida real el que se atrasa paga al mes siguiente,
      // no arrastra nueve meses. Sin esta regla la demostracion abre con
      // morosidad de dos tercios y la caja en rojo, que es exactamente lo
      // contrario de lo que la herramienta deberia mostrar.
      var estadoCobro;
      if (isMesActual)   estadoCobro = (uIdx % 5 !== 0) ? 'pagado' : 'pendiente';
      else if (m === 1)  estadoCobro = (uIdx === 3 || uIdx === 11) ? 'pendiente' : 'pagado';
      else               estadoCobro = 'pagado';
      const folio = estadoCobro==='pagado' ? folioPrincipio + uIdx : 0;
      const fechaPago = estadoCobro==='pagado' ? `${periodo}-${String(3 + (uIdx % 12)).padStart(2,'0')}` : '';
      estado.cobros.push({id:id(), unidadId:u.id, periodo, tipo:'ordinaria',
        concepto:`Gasto común ${fmtPeriodoLargo(periodo)}`,
        adeudado:cuota, estado:estadoCobro,
        montoPagado: estadoCobro==='pagado'?cuota:0,
        fechaPago, folioBoleta:folio});
      estado.cobros.push({id:id(), unidadId:u.id, periodo, tipo:'fondo',
        concepto:'Fondo de reserva (5%)',
        adeudado:fondo, estado:estadoCobro,
        montoPagado: estadoCobro==='pagado'?fondo:0,
        fechaPago, folioBoleta:folio});
      estado.cobros.push({id:id(), unidadId:u.id, periodo, tipo:'seguro',
        concepto:`Prima seguro incendio (cuota ${5-Math.min(4,m)} de 12)`,
        adeudado:seguro, estado:estadoCobro,
        montoPagado: estadoCobro==='pagado'?seguro:0,
        fechaPago, folioBoleta:folio});
    });
  }

  // Caja al inicio del periodo simulado: lo que el condominio traia de antes.
  // Un edificio de 18 unidades con nueve meses de historia no parte en cero.
  var arranque = new Date(HOY.getFullYear(), HOY.getMonth() - 9, 28);
  estado.ingresos.push({
    id:id(),
    fecha: aFechaLocal(arranque),
    periodo: aPeriodoLocal(arranque),
    categoria:'Otros',
    contraparte:'Saldo anterior',
    monto: 3850000,
    descripcion:'Saldo de caja traspasado del periodo anterior, según acta de asamblea ordinaria.'
  });

  // Movimiento manual del fondo: una compra extraordinaria histórica
  const fondoFecha = new Date(HOY.getFullYear(), HOY.getMonth()-6, 18);
  estado.fondo.push({
    id:id(), tipo:'egreso',
    fecha: aFechaLocal(fondoFecha),
    periodo: aPeriodoLocal(fondoFecha),
    monto: 850000,
    origen:'Bomba reemplazo + instalación',
    descripcion:'Compra de bomba presurizadora marca Pedrollo + instalación. Aprobado por comité acta N° 14/2025.'
  });
  // Aporte voluntario único
  const fondoFecha2 = new Date(HOY.getFullYear(), HOY.getMonth()-3, 5);
  estado.fondo.push({
    id:id(), tipo:'ingreso',
    fecha: aFechaLocal(fondoFecha2),
    periodo: aPeriodoLocal(fondoFecha2),
    monto: 250000,
    origen:'Arriendo de salón de eventos',
    descripcion:'Arriendo del salón de eventos a copropietario del 402 para cumpleaños familiar (acuerdo según reglamento).'
  });

  // Programa de mantenciones para los próximos 12 meses
  const MANT_PROG = [
    {meses:1, c:'Certificación ascensor (anual obligatoria)', t:'certificacion', costo:185000, p:'alta'},
    {meses:2, c:'Mantención preventiva calderas', t:'mantencion', costo:120000, p:'alta'},
    {meses:3, c:'Limpieza tanque de agua potable', t:'mantencion', costo:280000, p:'alta'},
    {meses:4, c:'Inspección de gas (SEC)', t:'certificacion', costo:95000, p:'alta'},
    {meses:5, c:'Pintura departamento conserjería', t:'reparacion', costo:380000, p:'media'},
    {meses:6, c:'Mantención bombas (semestral)', t:'mantencion', costo:75000, p:'media'},
    {meses:8, c:'Limpieza profunda fachadas', t:'mantencion', costo:450000, p:'baja'},
    {meses:10, c:'Renovación seguro contra incendio', t:'mantencion', costo:65000, p:'alta'},
    {meses:12, c:'Reposición luminarias LED', t:'reparacion', costo:240000, p:'media'},
  ];
  MANT_PROG.forEach(m=>{
    const f = new Date(HOY.getFullYear(), HOY.getMonth()+m.meses, 1);
    estado.mantenciones.push({
      id:id(),
      mes: aPeriodoLocal(f),
      concepto: m.c, costo: m.costo, tipo: m.t, prioridad: m.p
    });
  });

  // Ajustar contador de folios para que los siguientes pagos sigan correlativos
  estado.contadorFolio = 5500 + 9 * 30 + 18;

  await guardar();
  toast('Datos demostrativos cargados — Edificio Cordillera de los Andes', 'success');
  setTimeout(()=>location.reload(), 800);
}

/* ============ ACCIONES QUE ANTES ERAN ATRIBUTOS EN LINEA ============ */

// El despachador de acciones.js cubre click y change. Para "input" (reaccionar
// mientras se escribe) y "blur" hacen falta oyentes propios.
function montarOyentesFinos(){
  var total = document.getElementById('genTotal');
  if(total) total.addEventListener('input', actualizarPreviewCobros);

  ['cfgCondRut','cfgAdmRut'].forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.addEventListener('blur', function(){ el.value = fmtRut(el.value); });
  });
}

// El listado de copropietarios se corta en lotes cuando el condominio es
// grande; este es el "ver 100 mas".
function mostrarMasUnidades(n){
  window._unidadesLote = Number(n) || 100;
  renderUnidades();
}

/* ============ INIT ============ */
document.addEventListener('DOMContentLoaded', function(){
  // Protegidas con contrasena: no se pinta nada hasta abrir el candado.
  if(hayCofre()){ mostrarCandado(); return; }
  cargar();
  arrancar();
});
function arrancar(){
  // Los filtros de cada seccion nacen en el mes activo: la cinta manda.
  irAlMes(mesActivo);
  montarOyentesFinos();
  manejarHash();   // sin hash entra al panel
  pintarCofre();
  vigilarBloqueo();
}
