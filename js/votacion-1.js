const SUPABASE_URL  = 'https://rujwokagmjbqtrcvosye.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1andva2FnbWpicXRyY3Zvc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDgzNzIsImV4cCI6MjA5NzUyNDM3Mn0.E_p3VdfHrMIHy-yq0Uxoz4wEP_pxqVqE64TBWoyVGV0';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);


const $ = id => document.getElementById(id);
const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
const codigoNuevo = () => { const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s=''; for(let i=0;i<6;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; };
function setBusy(btn,busy,txt){ if(!btn||!btn.tagName) return; if(busy){ if(btn.dataset.t===undefined) btn.dataset.t=btn.textContent; btn.disabled=true; if(txt) btn.textContent=txt; } else { btn.disabled=false; if(btn.dataset.t!==undefined){ btn.textContent=btn.dataset.t; delete btn.dataset.t; } } }
function setConn(txt,cls){ const e=$('conn'); if(!e) return; e.textContent=txt; e.className='conn '+(cls||''); }
function tipoLabel(t){ return t==='ext-abs'?'Extraordinaria · mayoría absoluta (50+1% de los derechos)':t==='ext-ref'?'Extraordinaria · reforzada (66%)':'Ordinaria · acuerdos por mayoría de los presentes'; }


let ROL=null;
function show(id){ ['mesa','votar'].forEach(x=>$('screen-'+x).classList.toggle('hidden', x!==id)); }
function entrar(rol){ ROL=rol; $('role-badge').textContent=rol==='mesa'?'MESA':'VOTAR'; show(rol); if(rol==='mesa') initMesa(); if(rol==='votar') initVotar(); }


let asamblea=null, padron=[], puntos=[], puntoActivo=null, votacionAbierta=false, padronDirty=false, autoTimer=null;
let mesaTimer=null, seqVotos=0;
const LS = c => 'sala-mesa-'+c;

function initMesa(){ const last=localStorage.getItem('sala-mesa-last'); if(last){ const r=$('m-reanudar'); r.textContent='Continuar asamblea '+last; r.classList.remove('hidden'); } }
function persistMesa(){ if(!asamblea) return; localStorage.setItem('sala-mesa-last',asamblea.codigo); localStorage.setItem(LS(asamblea.codigo),JSON.stringify({id:asamblea.id,codigo:asamblea.codigo,condo:asamblea.condo,tipo:asamblea.tipo,token:asamblea.token,puntos,puntoActivo})); }

// Esta pantalla es la de los votantes. El rol Mesa solo se alcanza con
// ?rol=mesa y existe para continuar una asamblea ya creada; crear una nueva
// se hace desde /acta, que es donde está el acta y el pago.
async function crearAsamblea(btn){
  let llave='';
  try{ llave=localStorage.getItem('acta_pago_llave')||''; }catch(e){}
  if(!llave){
    alert('Las asambleas se crean desde el sistema de actas.\n\nAbra actascopropiedad.cl/acta, complete los datos y desde ahí inicie la sala de votación. Esta pantalla sirve para continuar una asamblea ya creada.');
    return;
  }
  setBusy(btn,true,'Creando…');
  try{
    const condo=$('m-condo').value.trim(), tipo=$('m-tipo').value;
    const { data, error }=await sb.rpc('vv_crear',{p_titulo:condo,p_llave:llave});
    if(error) throw error;
    asamblea={id:data.id,codigo:data.codigo,condo,tipo,token:data.admin_token}; padron=[]; puntos=[]; puntoActivo=null; votacionAbierta=false; padronDirty=false;
    padronEjemplo();
    await abrirPanelMesa({votacion_abierta:false});
    await autoGuardarPadron();
    persistMesa();
  }catch(e){
    const m=String((e&&e.message)||e||'');
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
    padron=(data.padron&&data.padron.length)? data.padron.map(p=>({unidad:p.unidad||'',nombre:p.nombre||'',rut:p.rut||'',der:Number(p.der)||0,habil:p.habil!==false,asiste:p.asiste!==false})) : (saved.padron||[]);
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
  const link=location.origin+location.pathname+'?code='+asamblea.codigo;
  $('m-link').textContent=link;
  try{ const qr=qrcode(0,'M'); qr.addData(link); qr.make(); $('m-qr').innerHTML=qr.createImgTag(3,8); }catch(e){}
  renderPadron(); renderPuntos();
  if(row && row.votacion_abierta){ votacionAbierta=true; puntoActivo=row.punto; mostrarVotacionMesa(); }
  if(mesaTimer) clearInterval(mesaTimer);
  setConn('● en línea','ok');
  mesaTimer=setInterval(()=>{ if(puntoActivo) cargarVotos(); }, 6000);
}
function copiarLink(btn){ navigator.clipboard.writeText($('m-link').textContent).then(()=>{ if(btn){ const t=btn.textContent; btn.textContent='¡Copiado!'; setTimeout(()=>btn.textContent=t,1500); } }); }


function markDirty(){ padronDirty=true; const ok=$('m-padron-ok'); if(ok) ok.textContent='Cambios sin guardar…'; persistMesa(); clearTimeout(autoTimer); autoTimer=setTimeout(autoGuardarPadron,900); }
async function persistirPadronDB(filas){
  const arr=filas.map(p=>({rut:norm(p.rut),nombre:p.nombre,unidad:p.unidad,habil:p.habil!==false,der:parseFloat(p.der)||0}));
  const {data,error}=await sb.rpc('vv_set_padron',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_padron:arr});
  if(error) throw error;
  return (data&&data.n)||arr.length;
}
async function autoGuardarPadron(){
  clearTimeout(autoTimer); if(!asamblea) return;
  const filas=padron.filter(p=>norm(p.rut));
  const malRut=filas.filter(p=>!validarRut(p.rut));
  const seen={}; let dup=false; filas.forEach(p=>{ const k=norm(p.rut); if(seen[k]) dup=true; else seen[k]=1; });
  const ok=$('m-padron-ok');
  if(malRut.length||dup){ if(ok) ok.textContent='Sin guardar — '+(malRut.length?malRut.length+' RUT con formato inválido':'hay RUT repetido')+' (corrige para guardar).'; return; }
  try{ const n=await persistirPadronDB(filas); padronDirty=false; if(ok) ok.textContent='✓ Guardado automáticamente ('+n+').'; persistMesa(); }
  catch(e){ if(ok) ok.textContent='Sin conexión: no se pudo guardar. Reintenta.'; }
}
function renderPadron(){
  const tb=$('m-padron-body'); tb.innerHTML='';
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
    const derInp=inp(p.der,'80px',v=>{padron[i].der=parseFloat(v)||0; renderPadronSum(); markDirty();},'number'); derInp.step='0.01'; derInp.min='0'; derInp.max='100';
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
    const del=document.createElement('button'); del.className='btn-del'; del.textContent='✕'; del.title='Quitar';
    del.addEventListener('click',()=>{ if(confirm('¿Quitar a '+(p.nombre||'esta persona')+' del padrón?')){ padron.splice(i,1); renderPadron(); markDirty(); } });
    tr.appendChild(td(del));
    tb.appendChild(tr);
  });
  renderPadronSum();
}
function renderPadronSum(){
  const sum=padron.reduce((a,p)=>a+(parseFloat(p.der)||0),0);
  const hab=padron.filter(p=>p.habil!==false).length;
  const pres=padron.filter(p=>p.habil!==false&&p.asiste!==false).length;
  const malRut=padron.filter(p=>p.rut&&!validarRut(p.rut)).length;
  let h=padron.length+' copropietarios · '+hab+' hábiles · '+pres+' presentes hábiles · suma de derechos: <strong>'+sum.toFixed(2)+'%</strong>';
  if(Math.abs(sum-100)>0.5&&sum>0) h+=' <span style="color:var(--warn)">(no suma 100%)</span>';
  if(malRut) h+=' <span style="color:var(--err)">· '+malRut+' RUT inválido</span>';
  $('m-padron-sum').innerHTML=h;
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
        const der=parseFloat(String(derRaw||'0').replace('%','').replace(',','.').trim())||0;
        nuevo.push({ unidad:String(pick(o,['unidad','depto','casa','nro','numero'])||'').trim(), nombre, rut:formatRut(rut), der,
          habil:!/^(no|n|inhabil|0|false)$/.test(na(String(pick(o,['habil','aldia','estado'])||'si'))),
          asiste:!/^(no|n|ausente|0|false)$/.test(na(String(pick(o,['asiste','presente','asistio'])||'si'))) });
      });
      if(nuevo.length===0){ alert('No reconocí los datos. El archivo debería tener columnas como: unidad, nombre, rut, derechos, hábil.'); input.value=''; return; }
      padron=nuevo; renderPadron(); markDirty();
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
  const seen={}, dups=[];
  filas.forEach(p=>{ const k=norm(p.rut); if(seen[k]){ if(dups.indexOf(p.rut)<0) dups.push(p.rut); } else seen[k]=1; });
  if(dups.length){ alert('Hay RUT repetidos en el padrón: '+dups.join(', ')+'.\nCada copropietario debe aparecer una sola vez.'); return; }
  const sum=padron.reduce((a,p)=>a+(parseFloat(p.der)||0),0);
  if(sum>0 && Math.abs(sum-100)>0.5){ if(!confirm('La suma de derechos es '+sum.toFixed(2)+'%, no 100%. Esto afecta el cálculo de mayorías. ¿Guardar de todas formas?')) return; }
  setBusy(btn,true,'Guardando…'); const ok=$('m-padron-ok');
  try{
    const n=await persistirPadronDB(filas);
    padronDirty=false; ok.textContent='✓ Padrón guardado ('+n+').'; persistMesa();
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
  if(padronDirty){ alert('Hay RUT inválidos o repetidos en el padrón (marcados en rojo). Corrígelos antes de abrir la votación.'); return; }
  if(padron.filter(p=>p.habil!==false).length===0){ alert('No hay copropietarios hábiles en el padrón.'); return; }
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
  const map={}; votos.forEach(v=>map[v.rut]=v.choice);
  let f=0,c=0,a=0,n=0,nf=0,nc=0,na=0,totalCond=0,totalHabil=0,habPresentes=0;
  padron.forEach(p=>{ const d=parseFloat(p.der)||0; totalCond+=d; if(p.habil!==false){ totalHabil+=d; if(p.asiste!==false) habPresentes++; } });
  padron.forEach(p=>{ const v=map[norm(p.rut)]; const d=parseFloat(p.der)||0; if(v&&p.habil!==false&&p.asiste!==false){ n++; if(v==='favor'){f+=d;nf++;} else if(v==='contra'){c+=d;nc++;} else {a+=d;na++;} } });
  return {map,f,c,a,n,nf,nc,na,totalCond,totalHabil,habPresentes};
}
function conclusionTipo(r,cerrada){
  const tipo=asamblea?asamblea.tipo:'ordinaria';
  if(r.n===0) return {cls:'pe',txt:cerrada?'Sin votos registrados.':'Esperando votos…'};
  if(tipo==='ext-abs'){ const ok=r.f>=51; return ok?{cls:'ap',txt:'APROBADO — '+r.f.toFixed(2)+'% de los derechos a favor (alcanza el 51%).'}:{cls:cerrada?'re':'pe',txt:(cerrada?'NO APROBADO — ':'Por ahora no alcanza: ')+r.f.toFixed(2)+'% a favor (se requiere al menos 51% — el 50+1% — de los derechos del condominio).'}; }
  if(tipo==='ext-ref'){ const ok=r.f>=66; return ok?{cls:'ap',txt:'APROBADO — '+r.f.toFixed(2)+'% de los derechos a favor (alcanza el 66%).'}:{cls:cerrada?'re':'pe',txt:(cerrada?'NO APROBADO — ':'Por ahora no alcanza: ')+r.f.toFixed(2)+'% a favor (se requiere 66% de los derechos del condominio).'}; }
  
  const minimo=Math.floor(r.habPresentes/2)+1;
  if(r.habPresentes>0 && r.nf>=minimo) return {cls:'ap',txt:'APROBADO — '+r.nf+' de '+r.habPresentes+' presentes a favor (mayoría alcanzada; se requerían '+minimo+').'};
  if(cerrada) return {cls:'re',txt:'NO APROBADO — '+r.nf+' a favor de '+r.habPresentes+' presentes (se requerían '+minimo+' para la mayoría).'};
  return {cls:'pe',txt:'Por ahora '+r.nf+' a favor · se requieren '+minimo+' de '+r.habPresentes+' presentes.'};
}
function renderResultados(votos){
  const r=calc(votos), cerrada=!votacionAbierta;
  const tipo=asamblea?asamblea.tipo:'ordinaria';
  if(tipo==='ordinaria'){
    
    const setN=(b,pc,cnt)=>{ $(b).style.width=(r.n>0?Math.round(cnt/r.n*100):0)+'%'; $(pc).textContent=String(cnt); };
    setN('bar-favor','pct-favor',r.nf); setN('bar-contra','pct-contra',r.nc); setN('bar-abst','pct-abst',r.na);
    const minimo=Math.floor(r.habPresentes/2)+1;
    $('mesa-base').innerHTML='Han votado <strong>'+r.n+'</strong> de '+r.habPresentes+' presentes hábiles · se adopta por <strong>mayoría de los presentes</strong> (se requieren '+minimo+'), no por % de derechos.';
  } else {
    const set=(b,pc,val)=>{ $(b).style.width=Math.min(val,100)+'%'; $(pc).textContent=val.toFixed(2)+'%'; };
    set('bar-favor','pct-favor',r.f); set('bar-contra','pct-contra',r.c); set('bar-abst','pct-abst',r.a);
    $('mesa-base').innerHTML='Han votado <strong>'+r.n+'</strong> de '+r.habPresentes+' hábiles · base hábil: <strong>'+r.totalHabil.toFixed(2)+'%</strong> · total condominio: '+r.totalCond.toFixed(2)+'% · se requiere % de los <strong>derechos del condominio</strong>.';
  }
  const cn=conclusionTipo(r,cerrada); const cc=$('mesa-concl'); cc.className='concl '+cn.cls; cc.textContent=(cerrada?'':'Tendencia: ')+cn.txt;
  const tb=$('mesa-tbody'); tb.innerHTML='';
  padron.forEach(p=>{ const v=r.map[norm(p.rut)];
    const pill=p.asiste===false?'<span class="pill p">ausente</span>':p.habil===false?'<span class="pill p">inhábil</span>':v==='favor'?'<span class="pill f">A favor</span>':v==='contra'?'<span class="pill c">En contra</span>':v==='abst'?'<span class="pill a">Abstención</span>':'<span class="pill p">pendiente</span>';
    const tr=document.createElement('tr');
    tr.innerHTML='<td>'+esc(p.unidad)+'</td><td>'+esc(p.nombre)+'</td><td>'+(parseFloat(p.der)||0).toFixed(2)+'%</td><td>'+(p.habil===false?'No':'Sí')+'</td><td>'+pill+'</td>';
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
      ? 'Adopción de acuerdos: por mayoría de los presentes (conteo de votos).\n\n'
      : 'Total derechos hábiles: '+padron.filter(p=>p.habil!==false).reduce((a,p)=>a+(parseFloat(p.der)||0),0).toFixed(2)+'% del condominio\n\n');
    for(let i=0;i<puntos.length;i++){
      const p=puntos[i];
      const { data }=await sb.rpc('vv_resultados',{p_codigo:asamblea.codigo,p_token:asamblea.token,p_punto:p.key});
      const r=calc((data&&data.votos)||[]); const cn=conclusionTipo(r,true);
      out+='PUNTO '+(i+1)+': '+p.titulo+'\n';
      out+=(esOrd
        ? '  A favor: '+r.nf+'  ·  En contra: '+r.nc+'  ·  Abstención: '+r.na+'  (de '+r.habPresentes+' presentes)\n'
        : '  A favor: '+r.f.toFixed(2)+'%  ·  En contra: '+r.c.toFixed(2)+'%  ·  Abstención: '+r.a.toFixed(2)+'%\n');
      out+='  Votaron: '+r.n+' de '+r.habPresentes+' copropietarios hábiles\n';
      out+='  Resultado: '+cn.txt+'\n\n';
    }
    if(puntos.length===0) out+='(Aún no hay puntos.)\n';
    ta.value=out;
  } finally { setBusy(btn,false); }
}
function copiarResumen(){ const ta=$('m-export'); const go=()=>navigator.clipboard.writeText(ta.value); if(ta.classList.contains('hidden')||!ta.value){ exportarResultados().then(go); } else go(); }


let asambleaP=null, yo=null, miVoto=null, estado={isOpen:false,question:''};
let fonoTimer=null, pollTick=0, seqMiVoto=0;

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
  if(yo && (++pollTick % 3 === 0)) refrescarYo();
}
async function identificar(btn){
  const raw=$('rut-input').value, r=norm(raw);
  const err=$('rut-error'); err.classList.add('hidden');
  if(!asambleaP){ err.classList.remove('hidden'); err.textContent='Aún conectando con la asamblea, intente de nuevo en un segundo.'; return; }
  if(r.length<2){ err.classList.remove('hidden'); err.textContent='Escriba su RUT para continuar (ej: 12.345.678-5).'; return; }
  setBusy(btn,true,'Verificando…');
  try{
    const q=await sb.rpc('vv_identificar',{p_codigo:asambleaP.codigo,p_rut:r});
    if(q.error){ err.classList.remove('hidden'); err.textContent='Hubo un problema al verificar su RUT. Intente nuevamente.'; return; }
    const data=q.data;
    if(!data||!data.existe){ err.classList.remove('hidden'); err.textContent = validarRut(raw) ? 'No encontramos ese RUT en el padrón de esta asamblea. Verifique con la Mesa.' : 'No encontramos ese RUT. Revise que esté bien escrito (ej: 12.345.678-5) o consulte con la Mesa.'; return; }
    yo={rut:data.rut,nombre:data.nombre,unidad:data.unidad,habil:data.habil,der:Number(data.der)};
    $('votar-id').classList.add('hidden'); $('votar-panel').classList.remove('hidden');
    $('v-nom').textContent=yo.nombre+' · Unidad '+yo.unidad;
    $('v-peso').textContent=yo.der.toFixed(2)+'%';
    aplicarHabilidad();
  }catch(e){ err.classList.remove('hidden'); err.textContent='No pudimos conectar. Revise su internet.'; }
  finally{ setBusy(btn,false); }
}
async function refrescarYo(){
  if(!yo||!asambleaP) return;
  const { data }=await sb.rpc('vv_identificar',{p_codigo:asambleaP.codigo,p_rut:yo.rut});
  if(!data||!data.existe) return;
  const wasHabil=yo.habil;
  yo={rut:data.rut,nombre:data.nombre,unidad:data.unidad,habil:data.habil,der:Number(data.der)};
  $('v-peso').textContent=yo.der.toFixed(2)+'%';
  if(wasHabil!==yo.habil) aplicarHabilidad();
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
  const { data }=await sb.rpc('vv_mi_voto',{p_codigo:asambleaP.codigo,p_rut:yo.rut,p_punto:punto});
  if(myseq!==seqMiVoto||punto!==estado.question) return;
  miVoto=(data&&data.choice)||null;
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
      const leyenda={favor:'A favor',contra:'En contra',abst:'Abstención'}[miVoto];
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
    const { error }=await sb.rpc('vv_emitir',{p_codigo:asambleaP.codigo,p_rut:yo.rut,p_punto:punto,p_choice:choice});
    if(error) throw error;
    miVoto=choice; $('v-done').classList.remove('hidden');
    anunciar('Voto registrado: '+({favor:'A favor',contra:'En contra',abst:'Abstención'}[choice])+'. Puede cambiarlo mientras la votación siga abierta.');
  }catch(e){
    document.querySelectorAll('.vbtn').forEach(b=>b.classList.toggle('sel', b.dataset.c===miVoto));
    alert('No se pudo enviar su voto. Revise su conexión e intente de nuevo.');
  }
  finally{ setTimeout(()=>btns.forEach(b=>b.disabled=false), 400); }
}


(function(){ var _p=new URLSearchParams(location.search); if(_p.get('rol')==='mesa') entrar('mesa'); else entrar('votar'); })();

// Reemplaza a onclick="location.href=location.pathname".
function recargarLimpio() {
  location.href = location.pathname;
}
