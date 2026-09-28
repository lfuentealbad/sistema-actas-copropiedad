const SUPABASE_URL  = 'https://rujwokagmjbqtrcvosye.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1andva2FnbWpicXRyY3Zvc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDgzNzIsImV4cCI6MjA5NzUyNDM3Mn0.E_p3VdfHrMIHy-yq0Uxoz4wEP_pxqVqE64TBWoyVGV0';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);


const $ = id => document.getElementById(id);
const norm = r => String(r||'').replace(/[.\-\s]/g,'').toLowerCase();
function validarRut(rut){
  const c=String(rut||'').replace(/[.\s-]/g,'').toUpperCase();
  if(c.length<2) return false;
  const cuerpo=c.slice(0,-1), dv=c.slice(-1);
  if(!/^\d+$/.test(cuerpo)) return false;
  let sum=0,m=2;
  for(let i=cuerpo.length-1;i>=0;i--){ sum+=parseInt(cuerpo[i],10)*m; m=m===7?2:m+1; }
  const r=11-(sum%11), dvc=r===11?'0':r===10?'K':String(r);
  return dvc===dv;
}
function formatRut(rut){
  const c=String(rut||'').replace(/[^0-9kK]/g,'').toUpperCase();
  if(c.length<2) return String(rut||'').trim();
  let cuerpo=c.slice(0,-1); const dv=c.slice(-1); let out='';
  while(cuerpo.length>3){ out='.'+cuerpo.slice(-3)+out; cuerpo=cuerpo.slice(0,-3); }
  return cuerpo+out+'-'+dv;
}
// El codigo de la sala lo acuna vv_crear en Postgres; aqui solo se recibe.
// Habia un generador local con Math.random que nadie llamaba (SAST-08): se
// fue, para que nadie lo tome por el que vale.
function setBusy(btn,busy,txt){ if(!btn||!btn.tagName) return; if(busy){ if(btn.dataset.t===undefined) btn.dataset.t=btn.textContent; btn.disabled=true; if(txt) btn.textContent=txt; } else { btn.disabled=false; if(btn.dataset.t!==undefined){ btn.textContent=btn.dataset.t; delete btn.dataset.t; } } }
function setConn(txt,cls){ const e=$('conn'); if(!e) return; e.textContent=txt; e.className='conn '+(cls||''); }
function tipoLabel(t){ return t==='ext-abs'?'Extraordinaria · mayoría absoluta (más del 50% de los derechos del condominio)':t==='ext-ref'?'Extraordinaria · reforzada (66% de los derechos del condominio)':'Ordinaria · acuerdos por mayoría absoluta de los derechos presentes'; }
function leyendaVoto(c){ return c==='favor'?'A favor':c==='contra'?'En contra':c==='abst'?'Abstención':''; }

// Arma un elemento con trozos de texto sin pasar por innerHTML. Lo que se
// pinta en la sala mezcla cifras con nombres, unidades y RUT que llegan del
// padron -de una planilla o de la base-, y por textContent un nombre como
// "<img src=x>" se ve tal cual en vez de volverse una etiqueta. Cada trozo
// es un texto o {txt, cls, color, tag}.
function pintar(el, partes){
  if(!el) return el;
  el.textContent='';
  partes.forEach(p=>{
    if(p==null||p==='') return;
    const n=document.createElement((p&&p.tag)||'span');
    if(typeof p==='object'){ if(p.cls) n.className=p.cls; if(p.color) n.style.color=p.color; n.textContent=String(p.txt); }
    else n.textContent=String(p);
    el.appendChild(n);
  });
  return el;
}


let ROL=null;
function show(id){ ['mesa','votar'].forEach(x=>$('screen-'+x).classList.toggle('hidden', x!==id)); }
function entrar(rol){ ROL=rol; $('role-badge').textContent=rol==='mesa'?'MESA':'VOTAR'; show(rol); if(rol==='mesa') initMesa(); if(rol==='votar') initVotar(); }


let asamblea=null, padron=[], puntos=[], puntoActivo=null, votacionAbierta=false, padronDirty=false, autoTimer=null;
let mesaTimer=null, seqVotos=0;
// Verdadero cuando el padron se recupero del servidor sin datos de
// asistencia: hay que pedirla, no inventarla.
let asistenciaSupuesta=false;
// Lo mismo con los correos: vv_set_padron reemplaza el padron entero, asi
// que si el servidor no los devolvio, guardar desde aqui los borra y apaga
// en silencio el aviso de voto por correo, que es lo que vuelve ruidosa una
// suplantacion. Se dice en el resumen en vez de perderlos sin avisar.
let correoDesconocido=false;
// La celda "Teléfono" de cada fila del padron, para repintar solo esa al
// refrescar los vinculos: repintar la tabla entera le quitaria el foco a la
// Mesa si justo esta escribiendo.
let celdasVinculo=[];

// Normaliza un padron que viene de fuera -del servidor, de localStorage, de
// una planilla- a booleanos de verdad.
//
// Adentro las banderas se leen estrictas: lo que no se puede interpretar no
// vota, porque suponerlo agrega derechos a la base y baja el umbral de
// hecho. Pero un borrador guardado por una version anterior puede no traer
// la bandera, y dejar a todo el condominio inhabil de golpe seria peor que
// el problema. Asi que la suposicion se hace UNA vez, aqui, a la vista.
//
// Historicamente la ausencia de `habil` significaba habil -es el default de
// la columna en Postgres- y la de `asiste`, presente.
function normalizarPadron(filas){
  return (filas||[]).map(p=>{
    const h=Derechos.bandera(p.habil), a=Derechos.bandera(p.asiste);
    return Object.assign({}, p, {
      unidad: p.unidad||'', nombre: p.nombre||'', rut: p.rut||'',
      der: Derechos.aNumero(Derechos.desdeTexto(p.der)),
      habil: h === null ? true : h,
      asiste: a === null ? true : a,
      correo: typeof p.correo === 'string' ? p.correo : '',
      vinculado: p.vinculado === true
    });
  });
}
const LS = c => 'sala-mesa-'+c;

function initMesa(){ const last=localStorage.getItem('sala-mesa-last'); if(last){ const r=$('m-reanudar'); r.textContent='Continuar asamblea '+last; r.classList.remove('hidden'); } }
function persistMesa(){ if(!asamblea) return; localStorage.setItem('sala-mesa-last',asamblea.codigo); localStorage.setItem(LS(asamblea.codigo),JSON.stringify({id:asamblea.id,codigo:asamblea.codigo,condo:asamblea.condo,tipo:asamblea.tipo,token:asamblea.token,puntos,puntoActivo})); }

// Esta pantalla es la de los votantes. El rol Mesa solo se alcanza con
// ?rol=mesa y existe para continuar una asamblea ya creada; crear una nueva
// se hace desde /acta, que es donde está el acta y el pago.
async function crearAsamblea(btn){
  // Ver la nota en acta-1.js: la llave que deja la demostracion no sirve
  // para abrir una sala de verdad.
  let llave='';
  try{ llave=localStorage.getItem('acta_pago_llave')||''; }catch(e){}
  if(llave==='DEMO-PAGO-SIMULADO' &&
     !/(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname)) llave='';
  if(!llave){
    alert('Las asambleas se crean desde el sistema de actas.\n\nAbra actascopropiedad.cl/acta, complete los datos y desde ahí inicie la sala de votación. Esta pantalla sirve para continuar una asamblea ya creada.');
    return;
  }
  setBusy(btn,true,'Creando…');
  try{
    const condo=$('m-condo').value.trim(), tipo=$('m-tipo').value;
    const { data, error }=await sb.rpc('vv_crear',{p_titulo:condo,p_llave:llave});
    if(error) throw error;
    asamblea={id:data.id,codigo:data.codigo,condo,tipo,token:data.admin_token}; padron=[]; puntos=[]; puntoActivo=null; votacionAbierta=false; padronDirty=false; correoDesconocido=false;
    padronEjemplo();
    await abrirPanelMesa({votacion_abierta:false});
    await autoGuardarPadron();
    persistMesa();
  }catch(e){
    const m=String((e&&e.message)||e||'');
    // El tope es de salas por pago (tres) y lo pone la base. No es un
    // problema de conexion ni del pago: decirlo asi evita que la Mesa lo
    // reintente sin fin o crea que perdio el pago.
    if(/demasiadas_salas_con_este_pago/.test(m)){
      alert('Con el pago de esta asamblea ya se abrieron 3 salas de votación, que es el máximo por pago, así que no se puede abrir otra.\n\nSi necesita retomar una sala anterior, use «Continuar asamblea» en este mismo equipo.');
      return;
    }
    alert(/pago_|llave_/.test(m)
      ? 'No pudimos validar el pago de esta asamblea. Créela desde actascopropiedad.cl/acta.'
      : 'No se pudo crear la asamblea. Revisa tu conexión a internet e inténtalo nuevamente.');
  }
  finally{ setBusy(btn,false); }
}

async function reanudar(btn){
  setBusy(btn,true,'Cargando…');
  try{
    const code=localStorage.getItem('sala-mesa-last'); if(!code) return;
    const saved=JSON.parse(localStorage.getItem(LS(code))||'{}');
    if(!saved.token){ alert('No tengo la llave de Mesa de esa asamblea en este equipo. Crea una nueva.'); return; }
    const { data, error }=await sb.rpc('vv_reanudar',{p_codigo:code,p_token:saved.token});
    if(error||!data||!data.asamblea){ alert('Esa asamblea ya no existe o la llave no corresponde. Crea una nueva.'); return; }
    const a=data.asamblea;
    asamblea={id:a.id,codigo:a.codigo,condo:saved.condo||a.titulo||'',tipo:saved.tipo||'ordinaria',token:saved.token};
    // La tabla padron no guarda `asiste` todavia (ver la migracion
    // pendiente en Prototipo Votacion en Vivo/). Hasta que la guarde, lo
    // que vuelve del servidor no trae asistencia: se marca para poder
    // avisarlo en vez de dar por presente a todo el mundo en silencio.
    asistenciaSupuesta = false; correoDesconocido = false;
    if (data.padron && data.padron.length) {
      asistenciaSupuesta = data.padron.some(p => Derechos.bandera(p.asiste) === null);
      correoDesconocido = data.padron.every(p => !Object.prototype.hasOwnProperty.call(p||{}, 'correo'));
      padron = normalizarPadron(data.padron);
    } else {
      padron = normalizarPadron(saved.padron);
    }
    puntos=saved.puntos||[];
    { const set=new Set(puntos.map(p=>p.key)); (data.puntos||[]).forEach(k=>{ if(k&&!set.has(k)){ set.add(k); puntos.push({key:k,titulo:String(k).replace(/^\d+\.\s*/,'')}); } }); }
    votacionAbierta=!!a.abierta; puntoActivo=votacionAbierta?a.punto:(saved.puntoActivo||null);
    padronDirty=false;
    await abrirPanelMesa({votacion_abierta:a.abierta,punto:a.punto}); persistMesa();
    if((data.padron||[]).length) { const ok=$('m-padron-ok'); if(ok) ok.textContent='Padrón recuperado del servidor ('+data.padron.length+').'; }
  } finally { setBusy(btn,false); }
}

async function abrirPanelMesa(row){
  $('mesa-crear').classList.add('hidden');
  $('mesa-panel').classList.remove('hidden');
  $('m-codigo').textContent=asamblea.codigo;
  const link=location.origin+location.pathname+'?code='+encodeURIComponent(asamblea.codigo);
  $('m-link').textContent=link;
  // La imagen se arma como elemento y no con createImgTag + innerHTML: asi
  // no queda ningun innerHTML con contenido variable en este archivo.
  try{
    const qr=qrcode(0,'M'); qr.addData(link); qr.make();
    const img=document.createElement('img'); img.src=qr.createDataURL(3,8); img.alt='Código QR para entrar a la asamblea';
    const caja=$('m-qr'); caja.textContent=''; caja.appendChild(img);
  }catch(e){}
  renderPadron(); renderPuntos();
  if(row && row.votacion_abierta){ votacionAbierta=true; puntoActivo=row.punto; mostrarVotacionMesa(); }
  if(mesaTimer) clearInterval(mesaTimer);
  setConn('● en línea','ok');
  // Cada 6 s los votos del punto abierto; cada 30 s, quienes ya quedaron
  // vinculados a su telefono, para que la Mesa vea a quien puede liberar.
  let vueltas=0;
  mesaTimer=setInterval(()=>{
    if(puntoActivo) cargarVotos();
    if(++vueltas%5===0 && !document.hidden) refrescarVinculos(null, true);
  }, 6000);
}
function copiarLink(btn){ navigator.clipboard.writeText($('m-link').textContent).then(()=>{ if(btn){ const t=btn.textContent; btn.textContent='¡Copiado!'; setTimeout(()=>btn.textContent=t,1500); } }); }


function markDirty(){ padronDirty=true; const ok=$('m-padron-ok'); if(ok) ok.textContent='Cambios sin guardar…'; persistMesa(); clearTimeout(autoTimer); autoTimer=setTimeout(autoGuardarPadron,900); }
async function persistirPadronDB(filas){
  // Booleanos de verdad, no cadenas: del otro lado hay un ::boolean.
  // Viajan los siete campos de vv_set_padron (contrato C4). El correo va
  // aunque aqui no se edite: el padron se reemplaza entero, y sin el se
  // perderian los que trajo el acta.
  const arr=filas.map(p=>({rut:norm(p.rut),nombre:p.nombre,unidad:p.unidad,
    habil:Derechos.habilSegura(p.habil),
    asiste:Derechos.bandera(p.asiste)!==false,
    der:Derechos.aNumero(Derechos.desdeTexto(p.der)),
    correo:String(p.correo||'').trim().toLowerCase()}));
  const {data,error}=await sb.rpc('vv_set_padron',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_padron:arr});
  if(error) throw error;
  // n=0 es una respuesta valida (el servidor no guardo ninguna fila): no se
  // reemplaza por lo enviado, que haria creer que quedo todo.
  return { n:(data&&typeof data.n==='number')?data.n:arr.length,
           descartadas:(data&&Array.isArray(data.descartadas))?data.descartadas:[] };
}
// El servidor conserva la primera fila de cada unidad y descarta las demas.
// Aqui se revisa antes de mandar, pero si algo se le escapa a esa revision,
// la Mesa tiene que saber que filas no quedaron: son derechos que no votan.
function textoDescartadas(d){
  if(!d||!d.length) return '';
  const muestra=d.slice(0,10).map(u=>String(u)).join(', ')+(d.length>10?' y '+(d.length-10)+' más':'');
  return ' No se guardaron '+d.length+' fila(s) por unidad repetida ('+muestra+'): quedó la primera de cada unidad.';
}
// Una unidad repetida cuenta sus derechos dos veces; un RUT repetido no es
// un error, es un copropietario con mas de una unidad. Con Object.create(null)
// una unidad llamada "constructor" no se da por vista antes de tiempo (SAST-12).
function unidadesRepetidas(filas){
  const vistas=Object.create(null), dobles=[];
  filas.forEach(p=>{ const k=String(p.unidad||'').trim().toLowerCase(); if(!k) return;
    if(vistas[k]){ if(dobles.indexOf(p.unidad)<0) dobles.push(p.unidad); } else vistas[k]=1; });
  return dobles;
}
async function autoGuardarPadron(){
  clearTimeout(autoTimer); if(!asamblea) return;
  const filas=padron.filter(p=>norm(p.rut));
  const malRut=filas.filter(p=>!validarRut(p.rut));
  const dup=unidadesRepetidas(filas).length>0;
  const ok=$('m-padron-ok');
  if(malRut.length||dup){ if(ok) ok.textContent='Sin guardar — '+(malRut.length?malRut.length+' RUT con formato inválido':'hay una unidad repetida')+' (corrige para guardar).'; return; }
  try{ const r=await persistirPadronDB(filas); padronDirty=false; if(ok) ok.textContent='✓ Guardado automáticamente ('+r.n+').'+textoDescartadas(r.descartadas); persistMesa(); }
  catch(e){ if(ok) ok.textContent='Sin conexión: no se pudo guardar. Reintenta.'; }
}
function renderPadron(){
  const tb=$('m-padron-body'); tb.innerHTML=''; celdasVinculo=[];
  padron.forEach((p,i)=>{
    const tr=document.createElement('tr');
    const td=ch=>{ const c=document.createElement('td'); c.appendChild(ch); return c; };
    const inp=(val,w,fn,type)=>{ const e=document.createElement('input'); e.type=type||'text'; if(w)e.style.width=w; e.value=(val==null?'':val); e.addEventListener('input',()=>fn(e.value,e)); return e; };
    tr.appendChild(td(inp(p.unidad,'64px',v=>{padron[i].unidad=v;markDirty();})));
    tr.appendChild(td(inp(p.nombre,null,v=>{padron[i].nombre=v;markDirty();})));
    const rutInp=inp(p.rut,'120px',(v,el)=>{padron[i].rut=v; el.style.borderColor=(!v||validarRut(v))?'':'var(--err)'; renderPadronSum(); markDirty();});
    rutInp.addEventListener('change',()=>{ if(padron[i].rut && validarRut(padron[i].rut)){ padron[i].rut=formatRut(padron[i].rut); rutInp.value=padron[i].rut; rutInp.style.borderColor=''; renderPadronSum(); } });
    if(p.rut && !validarRut(p.rut)) rutInp.style.borderColor='var(--err)';
    tr.appendChild(td(rutInp));
    const derInp=inp(p.der,'80px',v=>{padron[i].der=Derechos.aNumero(Derechos.desdeTexto(v)); renderPadronSum(); markDirty();},'number'); derInp.step='0.01'; derInp.min='0'; derInp.max='100';
    tr.appendChild(td(derInp));
    const sel=document.createElement('select'); sel.style.width='70px';
    const o1=document.createElement('option'); o1.value='si'; o1.textContent='Sí';
    const o2=document.createElement('option'); o2.value='no'; o2.textContent='No';
    sel.appendChild(o1); sel.appendChild(o2); sel.value=p.habil===false?'no':'si';
    sel.addEventListener('change',()=>{padron[i].habil=sel.value==='si';markDirty();}); tr.appendChild(td(sel));
    const selA=document.createElement('select'); selA.style.width='70px';
    const a1=document.createElement('option'); a1.value='si'; a1.textContent='Sí';
    const a2=document.createElement('option'); a2.value='no'; a2.textContent='No';
    selA.appendChild(a1); selA.appendChild(a2); selA.value=p.asiste===false?'no':'si';
    selA.addEventListener('change',()=>{padron[i].asiste=selA.value==='si';renderPadronSum();markDirty();}); tr.appendChild(td(selA));
    const tdV=document.createElement('td'); pintarVinculo(tdV,p); celdasVinculo.push(tdV); tr.appendChild(tdV);
    const del=document.createElement('button'); del.className='btn-del'; del.textContent='✕'; del.title='Quitar';
    del.addEventListener('click',()=>{ if(confirm('¿Quitar a '+(p.nombre||'esta persona')+' del padrón?')){ padron.splice(i,1); renderPadron(); markDirty(); } });
    tr.appendChild(td(del));
    tb.appendChild(tr);
  });
  renderPadronSum();
}
function renderPadronSum(){
  // Con el art. 14 aplicado: quien debe en otra de sus unidades no es
  // habil en ninguna, y eso cambia cuantos votan.
  const conArt14=Derechos.habilidadPorCopropietario(padron);
  const sum=Derechos.suma(padron.map(p=>Derechos.desdeTexto(p.der)));
  const hab=conArt14.filas.filter(p=>p.habil!==false).length;
  const pres=conArt14.filas.filter(p=>p.habil!==false&&p.asiste!==false).length;
  const malRut=padron.filter(p=>p.rut&&!validarRut(p.rut)).length;
  const unidadesDobles=unidadesRepetidas(padron).length;

  const ERR='var(--err)', WARN='var(--warn)';
  const partes=[padron.length+' copropietarios · '+hab+' hábiles · '+pres+' presentes hábiles · suma de derechos: ',
    {tag:'strong', txt:Derechos.texto(sum)+' %'}];
  if(Math.abs(sum-Derechos.CIEN)>0.5*Derechos.ESCALA&&sum>0) partes.push({txt:' (no suma 100 %)', color:WARN});
  if(malRut) partes.push({txt:' · '+malRut+' RUT inválido', color:ERR});
  if(unidadesDobles) partes.push({txt:' · '+unidadesDobles+' unidad(es) repetida(s)', color:ERR});
  if(conArt14.arrastrados.length) partes.push({txt:' · '+conArt14.arrastrados.length+' inhábil(es) por otra unidad (art. 14)', color:WARN});
  if(asistenciaSupuesta) partes.push({txt:' · la asistencia no viene guardada: revísela antes de abrir la votación', color:WARN});
  if(correoDesconocido) partes.push({txt:' · los correos del padrón no se recuperaron: si lo guarda desde aquí se apagan los avisos de voto por correo (importe el padrón con su columna de correo)', color:WARN});
  const vinc=padron.filter(p=>p.vinculado).length;
  if(vinc) partes.push(' · '+vinc+' con teléfono vinculado');
  pintar($('m-padron-sum'), partes);
}

// ---------------------------------------------------------------------
//  Telefonos vinculados (contrato C3)
// ---------------------------------------------------------------------
// Cada RUT queda atado al primer telefono desde el que se identifica. Si
// la persona cambia de telefono -se le acabo la bateria, se equivoco otro
// y tomo su RUT-, la Mesa lo libera aqui y puede identificarse de nuevo.
// Los votos que ya emitio se conservan.
function pintarVinculo(td, p){
  td.textContent='';
  if(!p.vinculado){ const s=document.createElement('span'); s.className='muted'; s.textContent='—'; td.appendChild(s); }
  else{
    const s=document.createElement('span'); s.className='pill f'; s.textContent='vinculado'; td.appendChild(s);
    const b=document.createElement('button'); b.type='button'; b.className='btn btn-ghost btn-sm'; b.textContent='Liberar';
    b.style.display='block'; b.style.marginTop='4px';
    // El RUT viaja en dataset, no concatenado en HTML: un RUT mal escrito en
    // la planilla no puede cerrar el atributo.
    b.dataset.ac='liberarVinculo'; b.dataset.args='@'; b.dataset.rut=norm(p.rut);
    b.title='Liberar el teléfono de '+(p.nombre||formatRut(p.rut));
    td.appendChild(b);
  }
  // CN-010: el codigo que la Mesa entrega en la sala a quien no tiene
  // correo o no lo recibe. Solo con el padron guardado: la base no da
  // codigo a un RUT que no esta en el suyo.
  if(p.rut && validarRut(p.rut)){
    const c=document.createElement('button'); c.type='button'; c.className='btn btn-ghost btn-sm'; c.textContent='Código';
    c.style.display='block'; c.style.marginTop='4px';
    c.dataset.ac='darCodigoMesa'; c.dataset.args='@'; c.dataset.rut=norm(p.rut);
    c.title='Dar un código de voto a '+(p.nombre||formatRut(p.rut))+', con su carnet a la vista';
    td.appendChild(c);
  }
}
async function darCodigoMesa(btn){
  if(!asamblea||!btn||!btn.dataset) return;
  const rut=norm(btn.dataset.rut); if(!rut) return;
  const quien=padron.find(p=>norm(p.rut)===rut);
  const nombre=(quien&&quien.nombre)||formatRut(rut);
  if(padronDirty){ alert('Guarde primero el padrón: el código solo se da a quien está en el padrón guardado.'); return; }
  if(!confirm('¿Dar un código de voto a '+nombre+' ('+formatRut(rut)+')?\n\nHágalo solo con su carnet a la vista. El código le permite votar desde cualquier teléfono.')) return;
  setBusy(btn,true,'Generando…');
  try{
    const { data, error }=await sb.rpc('vv_codigo_mesa',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_rut:rut});
    if(error) throw error;
    const c=String((data&&data.clave)||'');
    alert('Código para '+nombre+':\n\n      '+c.slice(0,3)+' '+c.slice(3)+'\n\nDíganselo solo a esa persona. Vence en '+((data&&data.minutos)||15)+' minutos y sirve una sola vez.');
  }catch(e){
    const m=String((e&&e.message)||'');
    alert(/no esta en el padron/.test(m) ? 'Ese RUT no está en el padrón guardado. Guarde el padrón y vuelva a intentarlo.'
      : /demasiados_codigos/.test(m) ? 'Se generaron demasiados códigos en la última hora. Espere unos minutos.'
      : 'No se pudo generar el código. Revise su conexión e intente de nuevo.');
  }finally{ setBusy(btn,false); }
}
async function reiniciarIntentos(btn){
  if(!asamblea) return;
  if(!confirm('¿Volver a cero los intentos de identificación de esta asamblea?\n\nÚselo si en la sala aparece «demasiados intentos»: en el WiFi del edificio todos comparten la misma conexión.')) return;
  setBusy(btn,true,'Reiniciando…');
  try{
    const { error }=await sb.rpc('vv_limites_reiniciar',{p_codigo:asamblea.codigo,p_token:asamblea.token});
    if(error) throw error;
    alert('Listo: los intentos de esta asamblea quedaron en cero.');
  }catch(e){ alert('No se pudo reiniciar. Revise su conexión e intente de nuevo.'); }
  finally{ setBusy(btn,false); }
}
function pintarVinculos(){
  celdasVinculo.forEach((td,i)=>{ if(padron[i]) pintarVinculo(td,padron[i]); });
  renderPadronSum();
}
// Pide a la base quienes estan vinculados y lo cruza por RUT con el padron
// que la Mesa tiene en pantalla, sin pisar lo que este editando.
async function refrescarVinculos(btn, silencioso){
  if(!asamblea) return;
  setBusy(btn,true,'Actualizando…');
  try{
    const { data, error }=await sb.rpc('vv_reanudar',{p_codigo:asamblea.codigo,p_token:asamblea.token});
    if(error||!data) throw error||new Error('sin datos');
    const vinc=Object.create(null);
    (data.padron||[]).forEach(p=>{ if(p&&p.vinculado===true) vinc[norm(p.rut)]=true; });
    padron.forEach(p=>{ p.vinculado=vinc[norm(p.rut)]===true; });
    pintarVinculos();
  }catch(e){ if(!silencioso) alert('No se pudo consultar los teléfonos vinculados. Revise su conexión.'); }
  finally{ setBusy(btn,false); }
}
function actualizarVinculos(btn){ return refrescarVinculos(btn,false); }
async function liberarVinculo(btn){
  if(!asamblea||!btn||!btn.dataset) return;
  const rut=norm(btn.dataset.rut); if(!rut) return;
  const quien=padron.find(p=>norm(p.rut)===rut);
  const nombre=(quien&&quien.nombre)||formatRut(rut);
  if(!confirm('¿Liberar el teléfono de '+nombre+'?\n\nPodrá identificarse desde otro teléfono. Los votos que ya emitió se conservan.')) return;
  setBusy(btn,true,'Liberando…');
  try{
    const { error }=await sb.rpc('vv_liberar',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_rut:rut});
    if(error) throw error;
    padron.forEach(p=>{ if(norm(p.rut)===rut) p.vinculado=false; });
    pintarVinculos();
  }catch(e){ alert('No se pudo liberar el teléfono. Revise su conexión e intente de nuevo.'); }
  finally{ setBusy(btn,false); }
}
function agregarFila(){ padron.push({unidad:'',nombre:'',rut:'',der:0,habil:true,asiste:true}); renderPadron(); markDirty(); }
function padronEjemplo(){
  padron=[
    {unidad:'101',nombre:'María González Pérez',rut:'12.345.678-5',der:5.25,habil:true,asiste:true},
    {unidad:'102',nombre:'Juan Sepúlveda Rojas',rut:'11.222.333-9',der:4.80,habil:true,asiste:true},
    {unidad:'201',nombre:'Ana Castro Muñoz',rut:'15.678.901-1',der:5.10,habil:false,asiste:true},
    {unidad:'202',nombre:'Carlos Vega Soto',rut:'9.876.543-3',der:4.75,habil:true,asiste:true},
    {unidad:'301',nombre:'Patricia Soto López',rut:'8.765.432-K',der:5.40,habil:true,asiste:true},
    {unidad:'302',nombre:'Rodrigo Fernández Tapia',rut:'10.111.222-5',der:4.95,habil:true,asiste:true},
  ];
  renderPadron(); markDirty();
}
function importarPadron(input){
  const f=input.files&&input.files[0]; if(!f) return;
  const esCSV=/\.csv$/i.test(f.name);
  const rd=new FileReader();
  rd.onload=e=>{
    try{
      const wb = esCSV ? XLSX.read(e.target.result,{type:'string'}) : XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
      const na=s=>[...norm(s).normalize('NFD')].filter(c=>{const x=c.charCodeAt(0);return x<0x300||x>0x36f;}).join('');
      const pick=(o,keys)=>{ for(const k of Object.keys(o)){ const kn=na(k); if(keys.some(x=>kn.includes(x))) return o[k]; } return ''; };
      let omit=0, hayColDer=false; const nuevo=[];
      rows.forEach(o=>{
        const rut=String(pick(o,['rut','run'])||'').trim();
        const nombre=String(pick(o,['nombre','copropietario','propietario'])||'').trim();
        if(!rut&&!nombre){ omit++; return; }
        const derRaw=pick(o,['derecho','porcentaje','prorrateo','%']); if(String(derRaw).trim()!=='') hayColDer=true;
        const der=Derechos.aNumero(Derechos.desdeTexto(String(derRaw||'0').replace('%','').trim()));
        nuevo.push({ unidad:String(pick(o,['unidad','depto','casa','nro','numero'])||'').trim(), nombre, rut:formatRut(rut), der,
          habil:!/^(no|n|inhabil|0|false)$/.test(na(String(pick(o,['habil','aldia','estado'])||'si'))),
          asiste:!/^(no|n|ausente|0|false)$/.test(na(String(pick(o,['asiste','presente','asistio'])||'si'))),
          // Para el aviso de voto por correo: si el padron trae la columna,
          // cada voto emitido le llega a su dueno como constancia.
          correo:String(pick(o,['correo','email','mail'])||'').trim() });
      });
      if(nuevo.length===0){ alert('No reconocí los datos. El archivo debería tener columnas como: unidad, nombre, rut, derechos, hábil.'); input.value=''; return; }
      padron=nuevo; correoDesconocido=false; renderPadron(); markDirty();
      const cero=nuevo.filter(p=>!p.der).length, malR=nuevo.filter(p=>p.rut&&!validarRut(p.rut)).length;
      let msg='✓ Importados '+nuevo.length+' copropietarios.';
      if(omit) msg+='\nSe omitieron '+omit+' filas sin RUT ni nombre.';
      if(!hayColDer) msg+='\n⚠ No encontré la columna de % de derechos: todos quedaron en 0%. Revisa el encabezado.';
      else if(cero) msg+='\n⚠ '+cero+' quedaron con 0% de derechos, revísalos.';
      if(malR) msg+='\n⚠ '+malR+' RUT con formato inválido (marcados en rojo).';
      msg+='\n\nRevisa la tabla y pulsa "Guardar padrón".';
      alert(msg);
    }catch(err){ alert('No pude leer el archivo. Guárdalo como CSV (UTF-8) o Excel .xlsx e intenta de nuevo.'); }
    input.value='';
  };
  if(esCSV) rd.readAsText(f,'UTF-8'); else rd.readAsArrayBuffer(f);
}
async function guardarPadron(btn){
  if(!asamblea) return;
  const filas=padron.filter(p=>norm(p.rut));
  const malRut=filas.filter(p=>!validarRut(p.rut));
  if(malRut.length){ alert('Hay '+malRut.length+' RUT con formato inválido (marcados en rojo). Corrígelos antes de guardar.'); return; }
  // Un RUT puede repetirse: es un copropietario con mas de una unidad, y
  // vota una vez con la suma de sus derechos. Rechazarlo bloqueaba justo
  // el caso que regula el art. 14 del Reglamento. Lo que no puede
  // repetirse es la UNIDAD.
  const dupsU=unidadesRepetidas(padron);
  if(dupsU.length){ alert('Hay unidades repetidas en el padrón: '+dupsU.join(', ')+'.\nCada unidad debe aparecer una sola vez.'); return; }
  const sum=Derechos.suma(padron.map(p=>Derechos.desdeTexto(p.der)));
  if(sum>0 && Math.abs(sum-Derechos.CIEN)>0.5*Derechos.ESCALA){ if(!confirm('La suma de derechos es '+Derechos.texto(sum)+' %, no 100 %. Esto afecta el cálculo de mayorías. ¿Guardar de todas formas?')) return; }
  setBusy(btn,true,'Guardando…'); const ok=$('m-padron-ok');
  try{
    const r=await persistirPadronDB(filas);
    padronDirty=false; ok.textContent='✓ Padrón guardado ('+r.n+').'+textoDescartadas(r.descartadas); persistMesa();
    if(r.descartadas.length) alert(textoDescartadas(r.descartadas).trim());
  }catch(e){ ok.textContent=''; alert('No se pudo guardar el padrón. Revisa tu conexión e intenta de nuevo.'); }
  finally{ setBusy(btn,false); }
}


function agregarPunto(){ const t=$('m-nuevo-punto').value.trim(); if(!t) return; puntos.push({key:(puntos.length+1)+'. '+t, titulo:t}); $('m-nuevo-punto').value=''; renderPuntos(); persistMesa(); }
function renderPuntos(){
  const c=$('m-puntos-lista'); c.innerHTML='';
  if(puntos.length===0){ c.innerHTML='<p class="muted">Agrega los puntos del orden del día.</p>'; return; }
  puntos.forEach((p,i)=>{
    const activo=puntoActivo===p.key;
    const d=document.createElement('div'); d.className='punto-item'+(activo?' activo':'');
    const num=document.createElement('span'); num.className='pt-num'; num.textContent=i+1; d.appendChild(num);
    const tit=document.createElement('span'); tit.className='pt-tit'; tit.textContent=p.titulo; d.appendChild(tit);
    if(activo && votacionAbierta){ const sp=document.createElement('span'); sp.className='pill p'; sp.textContent='en votación'; d.appendChild(sp); }
    else { const b=document.createElement('button'); b.className='btn btn-teal btn-sm'; b.textContent='▶ Abrir votación'; b.addEventListener('click',()=>abrirPunto(p.key,b)); d.appendChild(b); }
    const del=document.createElement('button'); del.className='btn-del'; del.textContent='✕'; del.addEventListener('click',()=>quitarPunto(i)); d.appendChild(del);
    c.appendChild(d);
  });
}
function quitarPunto(i){ if(puntos[i].key===puntoActivo && votacionAbierta){ alert('No puedes quitar un punto mientras está en votación. Ciérralo primero.'); return; } if(!confirm('¿Quitar el punto "'+puntos[i].titulo+'"?')) return; puntos.splice(i,1); renderPuntos(); persistMesa(); }
async function abrirPunto(key,btn){
  if(padronDirty){ await autoGuardarPadron(); }
  if(padronDirty){ alert('Hay RUT inválidos o unidades repetidas en el padrón. Corrígelos antes de abrir la votación.'); return; }
  if(Derechos.habilidadPorCopropietario(padron).filas.filter(p=>Derechos.habilSegura(p.habil)).length===0){ alert('No hay copropietarios hábiles en el padrón.'); return; }
  setBusy(btn,true,'Abriendo…');
  try{
    const { error }=await sb.rpc('vv_abrir',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_punto:key});
    if(error) throw error;
    puntoActivo=key; votacionAbierta=true;
    renderPuntos(); mostrarVotacionMesa(); await cargarVotos(); persistMesa();
  }catch(e){ votacionAbierta=false; alert('No se pudo abrir la votación. Revisa tu conexión.'); }
  finally{ setBusy(btn,false); }
}
async function cerrarPunto(btn){
  setBusy(btn,true,'Cerrando…');
  try{
    votacionAbierta=false;
    await sb.rpc('vv_cerrar',{p_codigo:asamblea.codigo,p_token:asamblea.token});
    await cargarVotos();
    $('mesa-st').textContent='Votación CERRADA · resultado final';
    $('mesa-cerrar').classList.add('hidden');
    renderPuntos(); persistMesa();
  } finally { setBusy(btn,false); }
}
function mostrarVotacionMesa(){
  $('mesa-votacion').classList.remove('hidden');
  const tit=(puntos.find(p=>p.key===puntoActivo)||{}).titulo||String(puntoActivo||'').replace(/^\d+\.\s*/,'');
  $('mesa-q').textContent=tit; $('mesa-st').textContent='● Votación ABIERTA';
  $('mesa-cerrar').classList.toggle('hidden', !votacionAbierta);
}
async function cargarVotos(){
  if(!asamblea||!puntoActivo) return;
  const punto=puntoActivo, myseq=++seqVotos;
  const { data, error }=await sb.rpc('vv_resultados',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_punto:punto});
  if(error){ setConn('○ reconectando…','warn'); return; }
  setConn('● en línea','ok');
  if(myseq!==seqVotos||punto!==puntoActivo) return;
  renderResultados((data&&data.votos)||[]);
}
function calc(votos){
  // Sin prototipo: un RUT mal cargado como "constructor" no puede encontrar
  // un "voto" heredado de Object y contarse como abstencion (SAST-12).
  const map=Object.create(null); votos.forEach(v=>{ map[v.rut]=v.choice; });
  // Enteros escalados: la suma es exacta y no depende del orden del padron.
  // Y la habilidad se arrastra por copropietario, no por unidad (art. 14
  // del Reglamento): quien tiene dos unidades y debe en una, no vota.
  const filas = Derechos.habilidadPorCopropietario(padron).filas;
  let f=0,c=0,a=0,n=0,nf=0,nc=0,na=0,totalCond=0,totalHabil=0,habPresentes=0;
  let derPresentes=0, sinRegistrar=0;
  filas.forEach(p=>{ const d=Derechos.desdeTexto(p.der); totalCond+=d;
    if(Derechos.habilSegura(p.habil)){ totalHabil+=d; if(Derechos.bandera(p.asiste)!==false){ habPresentes++; derPresentes+=d; } } });
  filas.forEach(p=>{ const v=map[norm(p.rut)]; const d=Derechos.desdeTexto(p.der);
    if(Derechos.habilSegura(p.habil)&&Derechos.bandera(p.asiste)!==false){
      if(v){ n++; if(v==='favor'){f+=d;nf++;} else if(v==='contra'){c+=d;nc++;} else {a+=d;na++;} }
      else sinRegistrar++;
    } });
  return {map,f,c,a,n,nf,nc,na,totalCond,totalHabil,habPresentes,derPresentes,sinRegistrar,filas};
}
// La regla y el formato salen de js/derechos.js, el mismo archivo que usa
// el acta. Eran tres implementaciones de lo mismo y discrepaban.
function reglaDeLaSala(){
  const tipo=asamblea?asamblea.tipo:'ordinaria';
  return tipo==='ext-abs' ? 'absoluta' : tipo==='ext-ref' ? 'reforzada' : 'presentes';
}
function conclusionTipo(r,cerrada){
  if(r.n===0) return {cls:'pe',txt:cerrada?'Sin votos registrados.':'Esperando votos…'};

  const v = Derechos.resolver({
    regla: reglaDeLaSala(),
    favor:r.f, contra:r.c, abstencion:r.a,
    presentes:r.derPresentes, personas:r.habPresentes, personasFavor:r.nf,
    sinRegistrar:r.sinRegistrar, cerrada:cerrada
  });

  const detrasDe = ' ('+r.nf+' de '+r.habPresentes+' asistentes hábiles)';
  const cuenta = v.favorTexto+' % de los derechos a favor'+detrasDe;
  const exige = v.descripcionUmbral.replace(/^Mayoría (absoluta|reforzada): /,'');

  // Mientras la votacion sigue abierta esto es una tendencia, aunque la
  // mayoria ya este numericamente alcanzada. El acta decia "pendiente"
  // sobre el mismo registro y la sala cantaba "APROBADO".
  if(v.estado==='aprobado') return {cls:'ap',txt:'APROBADO — '+cuenta+'. '+v.descripcionBase+'.'};
  if(v.estado==='rechazado') return {cls:'re',txt:'NO APROBADO — '+cuenta+'; se requería '+exige+'.'};
  if(v.alcanzada) return {cls:'pe',txt:'Mayoría alcanzada por ahora — '+cuenta+'. Faltan '+v.sinRegistrar+' por votar: el resultado no es definitivo.'};
  return {cls:'pe',txt:'Por ahora '+cuenta+' · se requiere '+exige+'.'};
}
function renderResultados(votos){
  const r=calc(votos), cerrada=!votacionAbierta;
  const tipo=asamblea?asamblea.tipo:'ordinaria';
  if(tipo==='ordinaria'){
    // Las barras van en derechos, como el veredicto. La base de la ordinaria
    // son los derechos presentes, no el condominio entero.
    const set=(b,pc,val)=>{ $(b).style.width=(r.derPresentes>0?Math.min(val/r.derPresentes*100,100):0)+'%'; $(pc).textContent=Derechos.texto(val)+' %'; };
    set('bar-favor','pct-favor',r.f); set('bar-contra','pct-contra',r.c); set('bar-abst','pct-abst',r.a);
    // La mitad exacta de la base, con el mismo formateador que el acta.
    const minimo=Derechos.texto(r.derPresentes, 2*Derechos.ESCALA);
    pintar($('mesa-base'), ['Han votado ', {tag:'strong', txt:r.n}, ' de '+r.habPresentes+' presentes hábiles · base: ',
      {tag:'strong', txt:Derechos.texto(r.derPresentes)+' %'}, ' de derechos presentes · se adopta con ',
      {tag:'strong', txt:'más de '+minimo+' %'}, ' a favor.']);
  } else {
    const set=(b,pc,val)=>{ $(b).style.width=Math.min(Derechos.aNumero(val),100)+'%'; $(pc).textContent=Derechos.texto(val)+' %'; };
    set('bar-favor','pct-favor',r.f); set('bar-contra','pct-contra',r.c); set('bar-abst','pct-abst',r.a);
    pintar($('mesa-base'), ['Han votado ', {tag:'strong', txt:r.n}, ' de '+r.habPresentes+' hábiles · base hábil: ',
      {tag:'strong', txt:Derechos.texto(r.totalHabil)+' %'}, ' · total condominio: '+Derechos.texto(r.totalCond)+' % · se requiere % de los ',
      {tag:'strong', txt:'derechos del condominio'}, '.']);
  }
  const cn=conclusionTipo(r,cerrada); const cc=$('mesa-concl'); cc.className='concl '+cn.cls; cc.textContent=(cerrada?'':'Tendencia: ')+cn.txt;
  const tb=$('mesa-tbody'); tb.innerHTML='';
  // Unidad y nombre vienen del padron: van por textContent, celda a celda.
  r.filas.forEach(p=>{ const v=r.map[norm(p.rut)];
    const pill = p.asiste===false ? ['p','ausente']
      : p.habil===false ? ['p', p.inhabilPorOtraUnidad?'inhábil (otra unidad)':'inhábil']
      : v==='favor' ? ['f','A favor'] : v==='contra' ? ['c','En contra'] : v==='abst' ? ['a','Abstención'] : ['p','pendiente'];
    const tr=document.createElement('tr');
    [p.unidad, p.nombre, Derechos.texto(Derechos.desdeTexto(p.der))+' %', p.habil===false?'No':'Sí'].forEach(t=>{
      const td=document.createElement('td'); td.textContent=t==null?'':String(t); tr.appendChild(td); });
    const tdV=document.createElement('td'); pintar(tdV, [{cls:'pill '+pill[0], txt:pill[1]}]); tr.appendChild(tdV);
    tb.appendChild(tr);
  });
}
async function exportarResultados(btn){
  setBusy(btn,true,'Generando…'); const ta=$('m-export'); ta.classList.remove('hidden'); ta.value='Generando…';
  try{
    let out='RESULTADOS DE VOTACIÓN\n';
    if(asamblea.condo) out+=asamblea.condo+'\n';
    out+='Tipo de asamblea: '+tipoLabel(asamblea.tipo)+'\nCódigo: '+asamblea.codigo+'\n';
    const esOrd=(asamblea.tipo||'ordinaria')==='ordinaria';
    out+=(esOrd
      ? 'Adopción de acuerdos: por mayoría absoluta de los derechos presentes.\n\n'
      : 'Total derechos hábiles: '+Derechos.texto(Derechos.suma(Derechos.habilidadPorCopropietario(padron).filas.filter(p=>p.habil!==false).map(p=>Derechos.desdeTexto(p.der))))+' % del condominio\n\n');
    for(let i=0;i<puntos.length;i++){
      const p=puntos[i];
      const { data }=await sb.rpc('vv_resultados',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_punto:p.key});
      const r=calc((data&&data.votos)||[]); const cn=conclusionTipo(r,true);
      out+='PUNTO '+(i+1)+': '+p.titulo+'\n';
      out+='  A favor: '+Derechos.texto(r.f)+' %  ·  En contra: '+Derechos.texto(r.c)+' %  ·  Abstención: '+Derechos.texto(r.a)+' %'
        +(esOrd ? '  (de '+Derechos.texto(r.derPresentes)+' % de derechos presentes)' : '')+'\n';
      out+='  Votaron: '+r.n+' de '+r.habPresentes+' copropietarios hábiles\n';
      out+='  Resultado: '+cn.txt+'\n\n';
    }
    if(puntos.length===0) out+='(Aún no hay puntos.)\n';
    ta.value=out;
  } finally { setBusy(btn,false); }
}
function copiarResumen(){ const ta=$('m-export'); const go=()=>navigator.clipboard.writeText(ta.value); if(ta.classList.contains('hidden')||!ta.value){ exportarResultados().then(go); } else go(); }


let asambleaP=null, yo=null, miVoto=null, estado={isOpen:false,question:''};
let fonoTimer=null, seqMiVoto=0;

// ---------------------------------------------------------------------
//  El telefono del votante (contrato C3)
// ---------------------------------------------------------------------
// Antes bastaba el codigo de la sala -que se proyecta en pantalla- y un RUT
// para votar por otro, ver como voto y saber si esta al dia (SB-02,
// AUTH-04). Desde el 22-09-2026 cada RUT queda atado a un telefono, y desde
// el 28-09-2026 (CN-010) el telefono se ata SOLO despues de escribir un
// codigo de 6 cifras que llega al correo del padron o que entrega la Mesa:
// el primero que tecleaba un RUT libre ya no se queda con el. Mientras no
// hay codigo, la base no devuelve ningun dato de la persona.
//
// Lo que ata es este identificador: 16 bytes de crypto.getRandomValues. Una
// vez verificado, es lo que hace que este telefono siga siendo de este RUT
// al recargar la pagina, asi que Math.random no sirve. Se guarda junto al
// RUT en este telefono; en la base queda solo su hash.
const LSV = c => 'sala-voto-'+c;
const DISPOSITIVO_OK = /^[0-9a-f]{32}$/;
// En memoria ademas de en localStorage: en una ventana privada el guardado
// puede fallar, y dentro de la misma visita el telefono sigue siendo el mismo.
let miDispositivo=null;   // { codigo, id }
function leerVinculo(codigo){
  try{
    const g=JSON.parse(localStorage.getItem(LSV(codigo))||'null');
    if(g && typeof g.dispositivo==='string' && DISPOSITIVO_OK.test(g.dispositivo))
      return { rut: typeof g.rut==='string' ? g.rut : '', dispositivo: g.dispositivo };
  }catch(e){}
  return null;
}
function guardarVinculo(codigo, rut, dispositivo){
  try{ localStorage.setItem(LSV(codigo), JSON.stringify({ rut: rut||'', dispositivo: dispositivo })); }catch(e){}
}
function dispositivoNuevo(){
  const c=(typeof crypto!=='undefined' && crypto && typeof crypto.getRandomValues==='function') ? crypto : null;
  if(!c) return null;
  const b=new Uint8Array(16); c.getRandomValues(b);
  let s=''; for(let i=0;i<b.length;i++) s+=(b[i]<16?'0':'')+b[i].toString(16);
  return s;
}
function dispositivoDe(codigo){
  if(miDispositivo && miDispositivo.codigo===codigo) return miDispositivo.id;
  const g=leerVinculo(codigo);
  const id=g ? g.dispositivo : dispositivoNuevo();
  if(!id) return null;
  miDispositivo={ codigo: codigo, id: id };
  if(!g) guardarVinculo(codigo, '', id);
  return id;
}
function olvidarDispositivo(codigo){
  miDispositivo=null;
  try{ localStorage.removeItem(LSV(codigo)); }catch(e){}
}

function initVotar(){
  const cod=new URLSearchParams(location.search).get('code');
  const ci=$('v-codigo'); if(ci){ ci.addEventListener('keydown',e=>{ if(e.key==='Enter') unirse(); }); setTimeout(()=>{try{ci.focus();}catch(e){}},120); }
  const ri=$('rut-input'); if(ri){ ri.addEventListener('input',()=>{ const v=formatRut(ri.value); if(v!==ri.value){ ri.value=v; try{ri.setSelectionRange(v.length,v.length);}catch(e){} } }); ri.addEventListener('keydown',e=>{ if(e.key==='Enter') identificar(); }); }
  if(cod && ci){ ci.value=cod.toUpperCase().replace(/[^A-Z0-9]/g,''); unirse(); }
}
async function unirse(btn){
  const code=$('v-codigo').value.trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  const err=$('v-cod-error'); err.classList.add('hidden');
  if(code.length<4){ err.classList.remove('hidden'); err.textContent='Escribe el código que muestra la Mesa (ej: ABC123).'; return; }
  setBusy(btn,true,'Entrando…');
  try{
    const { data }=await sb.rpc('vv_estado',{p_codigo:code});
    if(!data||!data.existe){ err.classList.remove('hidden'); err.textContent='No encontramos la asamblea '+code+'. Verifica el código con la Mesa o vuelve a escanear el QR.'; return; }
    asambleaP={codigo:code, titulo:data.titulo}; estado={isOpen:!!data.abierta, question:data.punto||''};
    $('votar-codigo').classList.add('hidden'); $('votar-id').classList.remove('hidden');
    const ri=$('rut-input'); if(ri) setTimeout(()=>{try{ri.focus();}catch(e){}},120);
    setConn('● en línea','ok');
    if(fonoTimer) clearInterval(fonoTimer);
    fonoTimer=setInterval(pollEstado, 6000);
    // Si este telefono ya se identifico en esta sala -la persona recargo la
    // pagina o volvio a escanear el QR-, se reanuda con el mismo
    // identificador: el vinculo sigue siendo suyo y no tiene que ir a la Mesa.
    const g=leerVinculo(code);
    if(g && g.rut && ri){ ri.value=formatRut(g.rut); await identificar(); }
  }catch(e){ err.classList.remove('hidden'); err.textContent='No pudimos conectar. Revisa tu internet e intenta de nuevo.'; }
  finally{ setBusy(btn,false); }
}
function onEstado(nuevo){
  const cambioPunto = nuevo.question!==estado.question;
  estado=nuevo;
  if(cambioPunto){ miVoto=null; document.querySelectorAll('.vbtn').forEach(b=>{b.classList.remove('sel'); b.disabled=true;}); $('v-done').classList.add('hidden'); }
  pintarVotar();
  cargarMiVoto().then(()=>document.querySelectorAll('.vbtn').forEach(b=>b.disabled=false));
}
async function pollEstado(){
  if(!asambleaP) return;
  const r=await sb.rpc('vv_estado',{p_codigo:asambleaP.codigo});
  if(r.error||!r.data||!r.data.existe){ setConn('○ reconectando…','warn'); return; }
  setConn('● en línea','ok');
  const nuevo={isOpen:!!r.data.abierta, question:r.data.punto||''};
  if(nuevo.isOpen!==estado.isOpen || nuevo.question!==estado.question) onEstado(nuevo);
  // Aqui se volvia a llamar vv_identificar cada 18 s para refrescar la
  // habilidad. Ya no: vv_identificar vincula, y un telefono viejo que lo
  // llamara solo le quitaria el RUT al telefono nuevo justo despues de que
  // la Mesa lo libero para el. La habilidad se vuelve a consultar a pedido
  // (boton del aviso de inhabil) y vv_emitir la exige igual.
}
async function identificar(btn){
  const raw=$('rut-input').value, r=norm(raw);
  const err=$('rut-error'); err.classList.add('hidden');
  // El error se ve en la pantalla del RUT. Si se pidio desde el aviso de
  // inhabil ("Consultar de nuevo"), se vuelve a ella con el RUT escrito.
  const fallo=t=>{ yo=null; miVoto=null; verificando=null; $('votar-panel').classList.add('hidden');
    $('votar-verif').classList.add('hidden'); $('votar-id').classList.remove('hidden');
    err.classList.remove('hidden'); err.textContent=t; };
  if(!asambleaP){ fallo('Aún conectando con la asamblea, intente de nuevo en un segundo.'); return; }
  if(r.length<2){ fallo('Escriba su RUT para continuar (ej: 12.345.678-5).'); return; }
  const disp=dispositivoDe(asambleaP.codigo);
  if(!disp){ fallo('Este navegador no permite identificar el teléfono de forma segura. Actualícelo o use otro teléfono.'); return; }
  setBusy(btn,true,'Verificando…');
  try{
    const q=await sb.rpc('vv_identificar',{p_codigo:asambleaP.codigo,p_rut:r,p_dispositivo:disp});
    if(q.error){
      // Un identificador que la base no acepta no sirve para nada: se
      // descarta y el proximo intento genera uno nuevo.
      const m=String(q.error.message||'');
      if(/dispositivo_invalido/.test(m)) olvidarDispositivo(asambleaP.codigo);
      // Si la base limita los intentos por conexion, se dice tal cual: un
      // "intente nuevamente" haria reintentar justo lo que la frena.
      fallo(/demasiados_intentos/.test(m)
        ? 'Demasiados intentos desde esta conexión. Espere unos minutos o acérquese a la Mesa.'
        : 'Hubo un problema al verificar su RUT. Intente nuevamente.'); return;
    }
    const data=q.data;
    if(!data||!data.existe){
      fallo(data&&data.motivo==='asamblea' ? 'Esta asamblea ya no existe. Verifique el código con la Mesa.'
        : validarRut(raw) ? 'No encontramos ese RUT en el padrón de esta asamblea. Verifique con la Mesa.'
        : 'No encontramos ese RUT. Revise que esté bien escrito (ej: 12.345.678-5) o consulte con la Mesa.');
      return;
    }
    // CN-010 (28-09-2026): el RUT esta en el padron pero este telefono
    // todavia no es suyo. Falta el codigo de 6 cifras. La respuesta no trae
    // nada de la persona salvo su correo enmascarado; y si era el RUT que
    // este telefono tenia guardado, se olvida, para no pedir codigo en cada
    // recarga por un RUT que ya no es de aqui.
    if(data.verificar){
      if(data.ocupado){
        const g=leerVinculo(asambleaP.codigo);
        if(g && norm(g.rut)===r) guardarVinculo(asambleaP.codigo, '', disp);
      }
      mostrarVerificacion(r, data);
      return;
    }
    entrarComoVotante(data, r, disp);
  }catch(e){ fallo('No pudimos conectar. Revise su internet.'); }
  finally{ setBusy(btn,false); }
}
// Lo que pasa cuando el telefono ya es de este RUT: por un codigo recien
// confirmado, o porque ya lo era (recargo la pagina).
function entrarComoVotante(data, r, disp){
  const rut=typeof data.rut==='string'&&data.rut ? data.rut : r;
  guardarVinculo(asambleaP.codigo, rut, disp);
  yo={rut:rut, nombre:String(data.nombre||''), unidad:String(data.unidad||''), habil:data.habil===true, der:Number(data.der)||0};
  verificando=null;
  $('votar-id').classList.add('hidden'); $('votar-verif').classList.add('hidden'); $('votar-panel').classList.remove('hidden');
  // Con varias unidades la base las junta con ", " y suma sus derechos.
  $('v-nom').textContent=yo.nombre+(yo.unidad.indexOf(',')>=0?' · Unidades ':' · Unidad ')+yo.unidad;
  $('v-peso').textContent=yo.der.toFixed(2)+'%';
  aplicarHabilidad();
}

// ---------------------------------------------------------------------
//  El codigo del votante (CN-010, 28-09-2026)
// ---------------------------------------------------------------------
// El RUT no es secreto: por eso un telefono queda atado a un RUT solo
// despues de escribir un codigo de 6 cifras de un solo uso. Llega al correo
// que el padron tiene para ese RUT (lo manda el servidor: esta pagina nunca
// ve ni el codigo ni la direccion completa), o lo entrega la Mesa en la sala
// a quien no tiene correo o no lo recibe, con el carnet a la vista.
let verificando=null;   // { rut, correo }
function mostrarVerificacion(rut, data){
  verificando={ rut: rut, correo: typeof data.correo==='string' && data.correo ? data.correo : '' };
  $('votar-id').classList.add('hidden'); $('votar-panel').classList.add('hidden');
  $('votar-verif').classList.remove('hidden');
  $('verif-error').classList.add('hidden'); $('verif-msg').textContent='';
  $('verif-ocupado').classList.toggle('hidden', !data.ocupado);
  const env=$('verif-enviar');
  if(verificando.correo){
    $('verif-texto').textContent='Le enviaremos un código de 6 cifras al correo que el padrón tiene registrado ('+verificando.correo+'). Si no le llega, o prefiere, pídalo a la Mesa con su carnet.';
    env.classList.remove('hidden'); env.textContent='Enviar el código a '+verificando.correo;
  }else{
    $('verif-texto').textContent='El padrón no tiene un correo registrado para usted. Acérquese a la Mesa con su carnet: le dará un código de 6 cifras para escribir aquí.';
    env.classList.add('hidden');
  }
  const vi=$('verif-input'); if(vi){ vi.value=''; setTimeout(()=>{try{vi.focus();}catch(e){}},120); }
}
function errorVerif(t){ const e=$('verif-error'); e.textContent=t; e.classList.remove('hidden'); }
async function pedirCodigoCorreo(btn){
  if(!asambleaP||!verificando) return;
  const disp=dispositivoDe(asambleaP.codigo); if(!disp) return;
  $('verif-error').classList.add('hidden'); $('verif-msg').textContent='';
  setBusy(btn,true,'Enviando…');
  try{
    const r=await fetch('/api/voto/codigo',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({codigo:asambleaP.codigo, rut:verificando.rut, dispositivo:disp})});
    const d=await r.json().catch(()=>({}));
    if(r.ok && d.enviado){
      $('verif-msg').textContent='Listo: le enviamos el código a '+(d.correo||verificando.correo)+'. Vence en '+(d.minutos||10)+' minutos. Revise también la carpeta de spam.';
    }else if(d.motivo==='correo_no_configurado' || d.motivo==='sin_correo'){
      errorVerif('Esta asamblea no puede enviar códigos por correo. Pida su código a la Mesa, con su carnet.');
    }else if(d.motivo==='demasiados_codigos' || r.status===429){
      errorVerif('Ya se enviaron varios códigos. Espere unos minutos, revise su correo (también spam) o pida el código a la Mesa.');
    }else{
      errorVerif('No pudimos enviar el código. Inténtelo de nuevo en un momento o pídalo a la Mesa.');
    }
  }catch(e){ errorVerif('No pudimos conectar. Revise su internet.'); }
  finally{ setBusy(btn,false); }
}
async function confirmarCodigo(btn){
  if(!asambleaP||!verificando) return;
  const disp=dispositivoDe(asambleaP.codigo); if(!disp) return;
  const clave=String($('verif-input').value||'').replace(/\D/g,'');
  $('verif-error').classList.add('hidden');
  if(clave.length!==6){ errorVerif('El código tiene 6 cifras.'); return; }
  setBusy(btn,true,'Confirmando…');
  try{
    const q=await sb.rpc('vv_verificar_codigo',{p_codigo:asambleaP.codigo,p_rut:verificando.rut,p_dispositivo:disp,p_clave:clave});
    if(q.error){
      const m=String(q.error.message||'');
      if(/dispositivo_invalido/.test(m)) olvidarDispositivo(asambleaP.codigo);
      errorVerif(/demasiados_intentos/.test(m)
        ? 'Demasiados intentos. Espere unos minutos o acérquese a la Mesa.'
        : 'Hubo un problema al confirmar el código. Intente nuevamente.');
      return;
    }
    const d=q.data||{};
    if(d.ok){ entrarComoVotante(d, verificando.rut, disp); return; }
    errorVerif(d.motivo==='codigo_incorrecto' ? 'Ese código no es correcto. Revíselo e inténtelo de nuevo.'
      : d.motivo==='sin_codigo_vigente' ? 'Ese código ya no sirve: venció, ya se usó o se pidió desde otro teléfono. Pida uno nuevo.'
      : d.motivo==='asamblea' ? 'Esta asamblea ya no existe. Verifique el código con la Mesa.'
      : 'No pudimos confirmar el código. Pida uno nuevo o acérquese a la Mesa.');
  }catch(e){ errorVerif('No pudimos conectar. Revise su internet.'); }
  finally{ setBusy(btn,false); }
}
// El telefono dejo de representar a este RUT: la Mesa lo libero, volvio a
// cargar el padron o ya lo tomo otro telefono. Se vuelve a la pantalla del
// RUT con el motivo a la vista y no se reintenta solo, por la misma razon
// que en pollEstado.
//
// Tambien se olvida el RUT guardado (no el identificador): si no, al recargar
// la pagina unirse() lo retomaba solo y le quitaba el RUT a la persona a
// quien la Mesa acababa de liberarlo, sin que nadie aqui lo pidiera.
function perderVinculo(msg){
  const rut=yo?yo.rut:'';
  yo=null; miVoto=null; verificando=null;
  if(asambleaP && miDispositivo && miDispositivo.codigo===asambleaP.codigo) guardarVinculo(asambleaP.codigo, '', miDispositivo.id);
  $('votar-panel').classList.add('hidden'); $('votar-verif').classList.add('hidden'); $('votar-id').classList.remove('hidden');
  const ri=$('rut-input'); if(ri && rut) ri.value=formatRut(rut);
  const err=$('rut-error'); err.classList.remove('hidden'); err.textContent=msg;
}
// Para cuando dos personas votan desde el mismo telefono, o se equivoco de
// RUT. El identificador del telefono se conserva: el RUT anterior sigue
// atado a este telefono y puede volver a identificarse desde aqui.
function cambiarRut(){
  if(asambleaP && miDispositivo && miDispositivo.codigo===asambleaP.codigo) guardarVinculo(asambleaP.codigo, '', miDispositivo.id);
  yo=null; miVoto=null; verificando=null;
  $('votar-panel').classList.add('hidden'); $('votar-verif').classList.add('hidden'); $('votar-id').classList.remove('hidden');
  $('rut-error').classList.add('hidden');
  const ri=$('rut-input'); if(ri){ ri.value=''; try{ri.focus();}catch(e){} }
}
function aplicarHabilidad(){
  if(!yo) return;
  if(!yo.habil){ $('v-wait').classList.add('hidden'); $('v-choices').classList.add('hidden'); $('v-inhabil').classList.remove('hidden'); return; }
  $('v-inhabil').classList.add('hidden');
  cargarMiVoto(); pintarVotar();
}
async function cargarMiVoto(){
  if(!yo||!yo.habil||!estado.question) return;
  const punto=estado.question, myseq=++seqMiVoto;
  // Sin el identificador de este telefono la base no dice como voto nadie.
  const { data }=await sb.rpc('vv_mi_voto',{p_codigo:asambleaP.codigo,p_rut:yo.rut,p_punto:punto,p_dispositivo:dispositivoDe(asambleaP.codigo)});
  if(myseq!==seqMiVoto||punto!==estado.question||!yo) return;
  miVoto=leyendaVoto(data&&data.choice) ? data.choice : null;
  document.querySelectorAll('.vbtn').forEach(b=>b.classList.toggle('sel', b.dataset.c===miVoto));
  $('v-done').classList.toggle('hidden', !miVoto);
}
// Le dice al lector de pantalla lo que acaba de cambiar. La pantalla del
// votante se transforma sola cuando la Mesa abre un punto: sin esto, quien
// no ve nunca se entera de que ya puede votar.
let _ultimoAnuncio = '';
function anunciar(txt){
  const el = $('v-anuncio');
  if(!el || txt === _ultimoAnuncio) return;
  _ultimoAnuncio = txt;
  el.textContent = txt;
}

function pintarVotar(){
  if(!yo||!yo.habil) return;
  const tit=estado.question? String(estado.question).replace(/^\d+\.\s*/,'') : '—';
  $('v-q').textContent=tit; $('v-q2').textContent=tit;
  const ab=!!estado.isOpen;
  $('v-choices').classList.toggle('hidden', !ab);
  $('v-wait').classList.toggle('hidden', ab);
  if(ab) anunciar('La Mesa abrió la votación de: ' + tit + '. Ya puede votar.');
  const sub=$('v-wait-sub');
  if(!ab){
    if(miVoto){
      const leyenda=leyendaVoto(miVoto);
      $('v-q').textContent='Votación cerrada';
      if(sub) sub.textContent='Su voto ('+leyenda+') quedó registrado.';
      anunciar('La votación se cerró. Su voto quedó registrado como '+leyenda+'.');
    }
    else if(sub){ sub.textContent='Esperando que la Mesa abra la votación…'; anunciar('Esperando que la Mesa abra la votación.'); }
  }
}
async function emitir(choice){
  if(!estado.isOpen||!yo||!yo.habil) return;
  const punto=estado.question;
  const btns=[...document.querySelectorAll('.vbtn')]; btns.forEach(b=>b.disabled=true);
  document.querySelectorAll('.vbtn').forEach(b=>b.classList.toggle('sel', b.dataset.c===choice));
  try{
    const { error }=await sb.rpc('vv_emitir',{p_codigo:asambleaP.codigo,p_rut:yo.rut,p_punto:punto,p_choice:choice,
      p_dispositivo:dispositivoDe(asambleaP.codigo)});
    if(error) throw error;
    miVoto=choice; $('v-done').classList.remove('hidden');
    anunciar('Voto registrado: '+leyendaVoto(choice)+'. Puede cambiarlo mientras la votación siga abierta.');
  }catch(e){
    document.querySelectorAll('.vbtn').forEach(b=>b.classList.toggle('sel', b.dataset.c===miVoto));
    const m=String((e&&e.message)||e||'');
    // Los rechazos de la base se explican uno por uno: "revise su conexion"
    // ante un voto que no se conto por otra razon deja a la persona
    // reintentando algo que nunca va a pasar.
    if(/identifiquese_primero/.test(m))
      perderVinculo('Su RUT ya no está vinculado a este teléfono (la Mesa lo liberó o volvió a cargar el padrón). Su voto anterior se conserva. Pulse Continuar para identificarse de nuevo.');
    else if(/rut_en_otro_dispositivo/.test(m))
      perderVinculo('Su RUT quedó vinculado a otro teléfono, así que desde este ya no puede votar. Si no fue usted, avise a la Mesa de inmediato.');
    else if(/no esta en el padron/.test(m))
      perderVinculo('Su RUT ya no figura en el padrón de esta asamblea. Consulte con la Mesa.');
    else if(/inhabil/.test(m)){ if(yo){ yo.habil=false; aplicarHabilidad(); } }
    else if(/no_figura_presente/.test(m))
      alert('La Mesa no lo tiene registrado como presente en esta asamblea, así que su voto no se contó. Acérquese a la Mesa.');
    else if(/cerrada|punto cambio/.test(m)){ alert('La votación de este punto ya se cerró o cambió de punto. Su pantalla se actualizará.'); pollEstado(); }
    else alert('No se pudo enviar su voto. Revise su conexión e intente de nuevo.');
  }
  finally{ setTimeout(()=>btns.forEach(b=>b.disabled=false), 400); }
}


(function(){ var _p=new URLSearchParams(location.search); if(_p.get('rol')==='mesa') entrar('mesa'); else entrar('votar'); })();

// Reemplaza a onclick="location.href=location.pathname".
function recargarLimpio() {
  location.href = location.pathname;
}
