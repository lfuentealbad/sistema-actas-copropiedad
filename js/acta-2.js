(function(){
  var VV_URL='https://rujwokagmjbqtrcvosye.supabase.co';
  var VV_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1andva2FnbWpicXRyY3Zvc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDgzNzIsImV4cCI6MjA5NzUyNDM3Mn0.E_p3VdfHrMIHy-yq0Uxoz4wEP_pxqVqE64TBWoyVGV0';
  var sb=null, asam=null, pollTimer=null, activo=null, temasActuales=[];
  // Un solo cliente por pagina: el de cuenta.js. Si se crea otro aparte, la
  // sesion abierta en uno no viaja en las llamadas del otro.
  function client(){
    if(!sb){
      if(window.Cuenta) sb=window.Cuenta.cliente();
      else if(window.supabase) sb=window.supabase.createClient(VV_URL,VV_ANON);
    }
    return sb;
  }
  
  var _geo=null;
  try{ var _gs=sessionStorage.getItem('acta_geo'); if(_gs) _geo=JSON.parse(_gs); }catch(e){}
  (function loadGeo(){
    if(_geo) return;
    try{ fetch('/cf-geo').then(function(r){ return r.ok?r.json():null; }).then(function(g){
      if(g){ _geo=g; try{ sessionStorage.setItem('acta_geo', JSON.stringify(g)); }catch(e){} }
    }).catch(function(){}); }catch(e){}
  })();
  
  function track(tipo, props){
    try{
      var c=client(); if(!c) return;
      var s=sessionStorage.getItem('acta_sid');
      if(!s){ s=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():(String(Date.now())+Math.random()); sessionStorage.setItem('acta_sid', s); }
      var p={}; if(props) for(var k in props) p[k]=props[k];
      if(_geo){ if(_geo.region) p.region=_geo.region; if(_geo.ciudad) p.ciudad=_geo.ciudad; }
      var q=c.rpc('vv_log', { p_tipo:String(tipo).slice(0,40), p_sesion:s, p_props:p });
      if (q && q.then) q.then(function(){}, function(){});  
    }catch(e){}
  }
  window.track=track;
  
  function norm(r){ return String(r||'').replace(/[.\-\s]/g,'').toLowerCase(); }
  function codNuevo(){ var A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',s=''; for(var i=0;i<6;i++) s+=A[Math.floor(Math.random()*A.length)]; return s; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function asistentes(){
    var out=[];
    document.querySelectorAll('#asistentes-tbody tr').forEach(function(row){
      var get=function(sel){ var e=row.querySelector(sel); return e?String(e.value).trim():''; };
      var rut=get('.rut-asist'), nombre=get('.nombre-asist'), unidad=get('.unidad');
      var der=parseFloat(get('.derechos'))||0;
      var habil=(row.querySelector('.habil')?row.querySelector('.habil').value:'si')==='si';
      var asiste=(row.querySelector('.asiste')?row.querySelector('.asiste').value:'si')==='si';
      var correo=get('.correo-asist').toLowerCase();
      if(asiste && rut) out.push({rut:rut,nombre:nombre,unidad:unidad,der:der,habil:habil,correo:correo});
    });
    return out;
  }
  function temas(){
    var out=[];
    document.querySelectorAll('.punto-card').forEach(function(card){
      var m=(card.id||'').match(/^punto-(\d+)$/); if(!m) return;
      var n=m[1];
      var req=document.getElementById('p'+n+'-requiere');
      if(req && req.value==='no') return;
      var tEl=document.getElementById('p'+n+'-titulo');
      var tit=tEl?tEl.value.trim():'';
      if(!tit) return;
      out.push({n:n, key:n+'. '+tit, titulo:tit});
    });
    return out;
  }
  if(window.Cuenta) window.Cuenta.usuario(function(u){ USUARIO=u; });
  var LLAVE='acta_pago_llave';
  function llaveGuardada(){ try{ return localStorage.getItem(LLAVE)||''; }catch(e){ return ''; } }
  function guardarLlave(v){ try{ localStorage.setItem(LLAVE,v); }catch(e){} }
  function borrarLlave(){ try{ localStorage.removeItem(LLAVE); }catch(e){} }
  function pagoMsg(texto,error){
    var el=document.getElementById('vv-pago-msg'); if(!el) return;
    if(!texto){ el.style.display='none'; el.textContent=''; return; }
    el.style.display='block'; el.textContent=texto;
    el.style.color = error ? 'var(--c-error)' : 'var(--c-text-2)';
  }
  var USUARIO=null;
  function mostrarPago(on){
    var p=document.getElementById('vv-pago'), s=document.getElementById('vv-start');
    if(p) p.style.display=on?'block':'none';
    if(s) s.style.display=on?'none':'block';
    if(on) pintarPago();
  }
  function pintarPago(){
    var host=document.getElementById('vv-cta-host'), listo=document.getElementById('vv-pago-listo');
    if(!host||!listo) return;
    if(USUARIO){
      host.innerHTML=''; listo.style.display='block';
      var t=document.getElementById('vv-correo-txt'); if(t) t.textContent=USUARIO.correo;
      return;
    }
    // USUARIO se llena al cargar la pagina. La sesion pudo abrirse despues,
    // desde la cabecera: se vuelve a preguntar antes de pedir el correo, o
    // le estariamos pidiendo entrar a alguien que ya entro.
    if(window.Cuenta && !pidiendoSesion){
      pidiendoSesion=true;
      window.Cuenta.usuario(function(u){
        pidiendoSesion=false;
        if(u){ USUARIO=u; pintarPago(); return; }
        pedirCorreo();
      });
      return;
    }
    pedirCorreo();
  }
  var pidiendoSesion=false;
  function pedirCorreo(){
    var listo=document.getElementById('vv-pago-listo');
    if(listo) listo.style.display='none';
    window.Cuenta.panel('vv-cta-host', {
      titulo:'Primero, su correo',
      sub:'Le enviaremos un código para confirmarlo. Con eso queda creada su cuenta y podrá volver a su acta.',
      alEntrar:function(u){ USUARIO=u; pintarPago(); }
    });
  }
  window.actaCerrarSesion=function(btn){
    btn.disabled=true; var _t=btn.textContent; btn.textContent='Saliendo…';
    window.Cuenta.salir(function(){ USUARIO=null; btn.disabled=false; btn.textContent=_t; pintarPago(); });
  };
  window.actaCancelarPago=function(){ pagoMsg(''); mostrarPago(false); };
  // savePDF vive en el otro modulo y necesita poder pedir el pago.
  window.actaMostrarPago=mostrarPago;
  window.actaIrAPagar=async function(btn){
    var correo=USUARIO&&USUARIO.correo;
    if(!window.Cuenta.correoValido(correo)){ pintarPago(); return; }
    btn.disabled=true; var _t=btn.textContent; btn.textContent='Conectando…'; pagoMsg('');
    try{
      var r=await fetch('/api/pago/crear',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({correo:correo})});
      var d=null; try{ d=await r.json(); }catch(e){}
      if(!r.ok||!d||!d.redirigir){
        pagoMsg(d&&d.error==='pasarela_no_configurada'
          ? 'El pago en línea todavía no está habilitado. Escríbanos a contacto@actascopropiedad.cl.'
          : 'No pudimos iniciar el pago. Inténtelo nuevamente en unos minutos.', true);
        return;
      }
      location.href=d.redirigir;
    }catch(e){
      pagoMsg('No pudimos conectar con el medio de pago. Revise su conexión a internet.',true);
    }finally{ btn.disabled=false; btn.textContent=_t; }
  };
  (function retornoDePago(){
    var m=/[?&]pago=(AV-[A-Z0-9]+)/.exec(location.search);
    if(!m) return;
    var orden=m[1], intentos=0;
    try{ history.replaceState(null,'',location.pathname); }catch(e){}
    mostrarPago(true);
    var _l=document.getElementById('vv-pago-listo'); if(_l) _l.style.display='block';
    pagoMsg('Confirmando el pago…');
    (function revisar(){
      intentos++;
      fetch('/api/pago/estado?orden='+encodeURIComponent(orden))
        .then(function(r){ return r.json(); })
        .then(function(d){
          if(d && d.estado==='pagado' && d.llave){
            guardarLlave(d.llave);
            pagoMsg('Pago confirmado. Ya puede iniciar la sala de votación.');
            setTimeout(function(){ pagoMsg(''); mostrarPago(false); },2600);
            return;
          }
          if(intentos<10){ setTimeout(revisar,2000); return; }
          pagoMsg('Todavía no recibimos la confirmación. Si ya pagó, espere un momento y recargue esta página.',true);
        })
        .catch(function(){
          if(intentos<10){ setTimeout(revisar,2000); return; }
          pagoMsg('No pudimos verificar el pago. Recargue la página en unos minutos.',true);
        });
    })();
  })();
  window.actaIniciarSala=async function(btn){
    var c=client();
    if(!c){ alert('No se pudo cargar el componente de votación. Recargue la página.'); return; }
    var asis=asistentes();
    if(asis.length===0){ alert('No hay asistentes presentes con RUT.\n\nEn el Paso 3 agregue el RUT de los copropietarios (o impórtelo desde su Excel) y marque Asiste: Sí.'); return; }
    var tms=temas();
    if(tms.length===0){ alert('No hay puntos que requieran votación. Agregue al menos un punto en el orden del día.'); return; }
    var llave=llaveGuardada();
    if(!llave){ pagoMsg(''); mostrarPago(true); return; }
    btn.disabled=true; var _t=btn.textContent; btn.textContent='Creando sala…';
    try{
      var tipo=document.getElementById('tipo-asamblea')?document.getElementById('tipo-asamblea').value:'ordinaria';
      var tipoSala=tipo==='extraordinaria-abs'?'ext-abs':tipo==='extraordinaria-ref'?'ext-ref':'ordinaria';
      var condo=document.getElementById('condo-nombre')?document.getElementById('condo-nombre').value:'';
      var ins=await c.rpc('vv_crear',{p_titulo:condo,p_llave:llave});
      if(ins.error) throw ins.error;
      var codigo=ins.data.codigo;
      asam={id:ins.data.id, codigo:codigo, token:ins.data.admin_token, tipo:tipoSala};
      salaGuardar();
      var pad=asis.map(function(a){ return {rut:norm(a.rut),nombre:a.nombre,unidad:a.unidad,habil:a.habil,der:a.der,correo:a.correo||''}; });
      var pi=await c.rpc('vv_set_padron',{p_codigo:asam.codigo,p_token:asam.token,p_padron:pad});
      if(pi.error) throw pi.error;
      document.getElementById('vv-start').style.display='none';
      document.getElementById('vv-panel').style.display='block';
      var _tsel=document.getElementById('tipo-asamblea'); if(_tsel) _tsel.disabled=true;
      var _tnote=document.getElementById('tipo-lock-note'); if(_tnote) _tnote.style.display='block';
      document.getElementById('vv-codigo').textContent=codigo;
      var link=location.origin+'/votacion/?code='+codigo;
      document.getElementById('vv-link').textContent=link;
      try{ var qr=qrcode(0,'M'); qr.addData(link); qr.make(); document.getElementById('vv-qr').innerHTML=qr.createImgTag(3,8); }catch(e){}
      temasActuales=tms; renderTemas();
      if(pollTimer) clearInterval(pollTimer);
      pollTimer=setInterval(function(){ if(activo) refrescar(); }, 6000);
    }catch(e){
      var _m=String((e&&e.message)||e||'');
      if(/pago_requerido|llave_invalida|llave_malformada|pago_vencido|pago_ya_utilizado|pago_no_configurado/.test(_m)){
        borrarLlave(); mostrarPago(true);
        pagoMsg(/pago_ya_utilizado/.test(_m)
          ? 'Ese pago ya se usó para abrir otra asamblea. Cada asamblea requiere su propio pago.'
          : /pago_vencido/.test(_m)
            ? 'El pago de esta asamblea venció. Debe realizarse uno nuevo.'
            : 'No pudimos validar el pago de esta asamblea. Inténtelo nuevamente.', true);
      } else {
        alert('No se pudo iniciar la sala. Revise su conexión a internet.\n\n'+_m);
      }
    }
    finally{ btn.disabled=false; btn.textContent=_t; }
  };
  // La llave de Mesa se guarda en este equipo. Sin esto, recargar la pagina
  // con la sala abierta dejaba el padron (con los RUT) en el servidor sin
  // forma de borrarlo a mano: solo lo alcanzaba el barrido de 48 horas.
  var SALA='acta_sala';
  function salaGuardar(){
    try{ localStorage.setItem(SALA, JSON.stringify({codigo:asam.codigo, token:asam.token, tipo:asam.tipo, id:asam.id, t:Date.now()})); }catch(e){}
  }
  function salaOlvidar(){ try{ localStorage.removeItem(SALA); }catch(e){} }
  function salaGuardada(){
    try{
      var g=JSON.parse(localStorage.getItem(SALA));
      if(!g || !g.codigo || !g.token) return null;
      if(Date.now() - (g.t||0) > 48*3600*1000){ salaOlvidar(); return null; }
      return g;
    }catch(e){ return null; }
  }
  window.actaReanudarSala=async function(btn){
    var g=salaGuardada(); if(!g) return;
    var c=client(); if(!c) return;
    var _t = btn ? btn.textContent : '';
    if(btn){ btn.disabled=true; btn.textContent='Recuperando…'; }
    try{
      var r=await c.rpc('vv_reanudar',{p_codigo:g.codigo,p_token:g.token});
      if(r.error || !r.data || !r.data.asamblea) throw new Error('no existe');
      asam={id:g.id, codigo:g.codigo, token:g.token, tipo:g.tipo||'ordinaria'};
      var av=document.getElementById('vv-aviso-sala'); if(av) av.style.display='none';
      document.getElementById('vv-start').style.display='none';
      document.getElementById('vv-panel').style.display='block';
      document.getElementById('vv-codigo').textContent=g.codigo;
      var link=location.origin+'/votacion/?code='+g.codigo;
      document.getElementById('vv-link').textContent=link;
      try{ var qr=qrcode(0,'M'); qr.addData(link); qr.make(); document.getElementById('vv-qr').innerHTML=qr.createImgTag(3,8); }catch(e){}
      temasActuales=temas(); renderTemas();
      if(pollTimer) clearInterval(pollTimer);
      pollTimer=setInterval(function(){ if(activo) refrescar(); }, 6000);
    }catch(e){
      salaOlvidar();
      var a=document.getElementById('vv-aviso-sala');
      if(a) a.textContent='Esa sala ya no existe en el servidor: sus datos ya fueron borrados.';
    }finally{ if(btn){ btn.disabled=false; btn.textContent=_t; } }
  };
  (function avisarSalaPendiente(){
    var g=salaGuardada(); if(!g) return;
    var a=document.getElementById('vv-aviso-sala'); if(!a) return;
    a.style.display='block';
    a.innerHTML='Quedó una sala de votación abierta en este equipo (código <b>'+esc(g.codigo)+'</b>). ' +
      'Mientras no la cierre, el padrón con los RUT sigue en el servidor. ' +
      '<button type="button" class="btn-tool" style="margin-top:8px;display:block" data-ac="actaReanudarSala" data-args="@">Recuperar la sala</button>';
  })();
  window.actaCerrarSala=async function(btn){
    if(!asam){
      if(salaGuardada()){
        alert('Quedó una sala abierta de una sesión anterior.\n\nRecupérela primero con el botón "Recuperar la sala" que aparece en el Paso 6, y desde ahí podrá cerrarla y borrar sus datos.');
        return;
      }
      alert('No hay una sala de votación en vivo activa en esta sesión.\n\nSi usó la votación y ya cerró la sala, sus datos ya fueron borrados del servidor. Si no la usó, no hay nada que borrar: el acta se genera solo en este equipo.');
      return;
    }
    if(!confirm('¿Cerrar la votación y BORRAR los datos de esta asamblea?\n\nSe eliminarán de forma permanente del servidor el padrón (RUT) y los votos. Es lo recomendado al terminar la asamblea (minimización de datos). Los votos que ya trajo al acta quedan guardados en el acta.')) return;
    var _t = btn ? btn.textContent : '';
    if(btn){ btn.disabled=true; btn.textContent='Borrando…'; }
    var codigo=asam.codigo, token=asam.token, c=client();
    try{ if(activo) await cerrar(activo); }catch(e){}
    var borrado=false;
    try{ var r=await c.rpc('vv_borrar',{p_codigo:codigo,p_token:token}); if(r && !r.error) borrado=true; }catch(e){}
    if(pollTimer){ clearInterval(pollTimer); pollTimer=null; }
    salaOlvidar();
    asam=null; activo=null; temasActuales=[];
    var p=document.getElementById('vv-panel'); if(p) p.style.display='none';
    var s=document.getElementById('vv-start'); if(s) s.style.display='block';
    var tt=document.getElementById('vv-temas'); if(tt) tt.innerHTML='';
    var rem=document.getElementById('vv-reminder'); if(rem){ rem.className=''; rem.innerHTML=''; }
    var tsel=document.getElementById('tipo-asamblea'); if(tsel) tsel.disabled=false;
    var tnote=document.getElementById('tipo-lock-note'); if(tnote) tnote.style.display='none';
    if(btn){ btn.disabled=false; btn.textContent=_t; }
    alert(borrado
      ? '✓ Padrón y votos borrados de la base de datos activa.\n\nEl acta que está redactando queda guardada en ESTE equipo (para no perder su trabajo). Si es un computador compartido, al terminar use "Limpiar formulario" para no dejar datos en el navegador.\n\n(Los respaldos automáticos del servidor se purgan al vencer su ventana de retención.)'
      : 'Se cerró la sala. No se pudo confirmar el borrado inmediato; de todos modos, el barrido automático borrará estos datos.');
  };
  function renderTemas(){
    var cont=document.getElementById('vv-temas'); cont.innerHTML='';
    temasActuales.forEach(function(t){
      var d=document.createElement('div'); d.className='vv-tema'; d.id='vv-tema-'+t.n;
      var top=document.createElement('div'); top.className='vv-tema-top';
      var tit=document.createElement('span'); tit.className='vv-tema-tit'; tit.textContent='Punto '+t.n+': '+t.titulo;
      var acc=document.createElement('span'); acc.className='vv-tema-acc';
      var bAb=document.createElement('button'); bAb.type='button'; bAb.className='vv-btn vv-btn-abrir'; bAb.textContent='▶ Abrir';
      bAb.onclick=function(){ abrir(t); };
      var bTr=document.createElement('button'); bTr.type='button'; bTr.className='vv-btn vv-btn-traer'; bTr.textContent='⤵ Traer al acta';
      bTr.onclick=function(){ traer(t); };
      acc.appendChild(bAb); acc.appendChild(bTr);
      var est=document.createElement('span'); est.className='vv-estado cerrado'; est.id='vv-est-'+t.n; est.textContent='● Cerrado';
      top.appendChild(tit); top.appendChild(est); top.appendChild(acc); d.appendChild(top);
      var res=document.createElement('div'); res.className='vv-tema-res'; res.id='vv-res-'+t.n; res.textContent='Aún no se abre a votación.';
      d.appendChild(res);
      cont.appendChild(d);
    });
  }
  async function abrir(t){
    var c=client(); activo=t;
    document.querySelectorAll('.vv-tema').forEach(function(el){ el.classList.remove('activo'); });
    var card=document.getElementById('vv-tema-'+t.n); if(card) card.classList.add('activo');
    temasActuales.forEach(function(x){
      var b=document.querySelector('#vv-tema-'+x.n+' .vv-btn-abrir'); if(!b) return;
      if(x.n===t.n){ b.textContent='■ Cerrar'; b.onclick=function(){ cerrar(t); }; }
      else { b.textContent='▶ Abrir'; b.onclick=function(){ abrir(x); }; }
      var e=document.getElementById('vv-est-'+x.n);
      if(e){ if(x.n===t.n){ e.className='vv-estado abierto'; e.textContent='● Abierto'; } else { e.className='vv-estado cerrado'; e.textContent='● Cerrado'; } }
    });
    var rem=document.getElementById('vv-reminder');
    if(rem){ rem.className='show'; rem.innerHTML='<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="6"/></svg> <strong>Punto '+t.n+' abierto</strong> — los presentes ya pueden votar desde su teléfono. Recuerde pulsar <strong>■ Cerrar</strong> cuando terminen.'; }
    try{ await c.rpc('vv_abrir',{p_codigo:asam.codigo,p_token:asam.token,p_punto:t.key}); }catch(e){}
    refrescar();
  }
  async function cerrar(t){
    var c=client();
    try{ await c.rpc('vv_cerrar',{p_codigo:asam.codigo,p_token:asam.token}); }catch(e){}
    var b=document.querySelector('#vv-tema-'+t.n+' .vv-btn-abrir'); if(b){ b.textContent='▶ Abrir'; b.onclick=function(){ abrir(t); }; }
    var e=document.getElementById('vv-est-'+t.n); if(e){ e.className='vv-estado cerrado'; e.textContent='● Cerrado'; }
    var rem=document.getElementById('vv-reminder'); if(rem){ rem.className=''; rem.innerHTML=''; }
    refrescar();
    avisarVotantes();
  }
  // Constancia por correo a quienes votaron. La pide la Mesa —no el
  // navegador del votante— para que un suplantador no pueda silenciarla.
  async function avisarVotantes(){
    if(!asam) return;
    var conCorreo = asistentes().filter(function(a){ return a.correo; }).length;
    if(conCorreo === 0) return;
    try{
      var r = await fetch('/api/voto/avisos', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ codigo:asam.codigo, token:asam.token,
                               condominio:(document.getElementById('condo-nombre')||{}).value||'' })
      });
      var d = await r.json().catch(function(){ return null; });
      var av = document.getElementById('vv-aviso-correos');
      if(!av) return;
      if(r.ok && d && d.enviados >= 0){
        av.style.display='block';
        av.textContent = d.enviados + ' copropietario(s) recibieron la constancia de su voto por correo' +
                         (d.fallidos ? ' · ' + d.fallidos + ' no se pudo(ieron) enviar' : '') + '.';
      } else if(d && (d.error==='correo_no_configurado' || d.error==='avisos_no_configurados')){
        av.style.display='block';
        av.textContent='El envío de constancias por correo aún no está habilitado.';
      }
    }catch(e){}
  }
  async function refrescar(){
    if(!activo) return;
    var c=client();
    var q=await c.rpc('vv_resultados',{p_codigo:asam.codigo,p_token:asam.token,p_punto:activo.key});
    if(q.error) return;
    var votos=(q.data&&q.data.votos)||[];
    var byRut={}, habPresentes=0;
    asistentes().forEach(function(a){ byRut[norm(a.rut)]=a; if(a.habil) habPresentes++; });
    var f=0,co=0,ab=0, nf=0,nc=0,na=0, n=0;
    votos.forEach(function(v){ var p=byRut[v.rut]; if(!p||!p.habil) return; n++;
      if(v.choice==='favor'){f+=p.der;nf++;} else if(v.choice==='contra'){co+=p.der;nc++;} else {ab+=p.der;na++;} });
    var el=document.getElementById('vv-res-'+activo.n); if(!el) return;
    var tipo=(asam&&asam.tipo)||'ordinaria';
    var OK='var(--c-ok)', ER='var(--c-error)', WN='var(--c-warn,#9A6B1F)';
    var big=function(val,color,lab){ return '<span class="vv-pct" style="color:'+color+'">'+val+'</span><span class="vv-pct-lab">'+lab+'</span>'; };
    if(tipo==='ordinaria'){
      
      var minimo=Math.floor(habPresentes/2)+1;
      var pasa=(habPresentes>0 && nf>=minimo);
      el.innerHTML=
        big(nf,OK,'a favor')+big(nc,ER,'en contra')+big(na,WN,'abstención')+
        '<span class="vv-votos"><b>'+n+'</b> de '+habPresentes+' presentes</span>'+
        '<div class="vv-tema-meta">Asamblea ordinaria: se adopta por <b>mayoría de los presentes</b> — no por % de derechos. '+
        (habPresentes>0?('Se requieren '+minimo+' de '+habPresentes+' votos'+(pasa?' · <b style="color:var(--c-ok)">alcanzado</b>':'')+'.'):'')+'</div>';
    } else {
      
      var umb=(tipo==='ext-ref')?66:51;
      var pasaE=(f>=umb);
      el.innerHTML=
        big(f.toFixed(2)+'%',OK,'a favor')+big(co.toFixed(2)+'%',ER,'en contra')+big(ab.toFixed(2)+'%',WN,'abstención')+
        '<span class="vv-votos"><b>'+n+'</b> votos</span>'+
        '<div class="vv-tema-meta">Asamblea extraordinaria: requiere <b>al menos '+umb+'% de los derechos del condominio</b> · '+
        (pasaE?'<b style="color:var(--c-ok)">alcanza el umbral</b>':'aún no alcanza el umbral')+'.</div>';
    }
  }
  async function traer(t){
    var c=client();
    var q=await c.rpc('vv_resultados',{p_codigo:asam.codigo,p_token:asam.token,p_punto:t.key});
    var votos=(q.data&&q.data.votos)||[];
    if(votos.length===0){ if(!confirm('Aún no hay votos para "'+t.titulo+'". ¿Traer de todas formas?')) return; }
    var voteByRut={}; votos.forEach(function(v){ voteByRut[v.rut]=v.choice; });
    if(typeof _qpese==='function') _qpese(t.n);
    var tbody=document.getElementById('pvot-rows-'+t.n);
    if(!tbody){ alert('No encontré el panel de votación del Punto '+t.n+'. Asegúrese de que el punto requiere votación.'); return; }
    var rows=[].slice.call(tbody.querySelectorAll('tr'));
    var aplicados=0;
    Object.keys(voteByRut).forEach(function(rk){
      
      var row=null; for(var i=0;i<rows.length;i++){ if(norm(rows[i].dataset.rut||'')===rk){ row=rows[i]; break; } }
      if(!row) return;
      var sel=row.querySelector('.pref-select'); if(!sel) return;
      sel.value=voteByRut[rk]; sel.className='pref-select '+sel.value; aplicados++;
    });
    if(typeof _jfg==='function') _jfg(t.n);
    if(typeof _vufa==='function') _vufa(t.n);
    if(typeof autoSave==='function') autoSave();
    var el=document.getElementById('vv-res-'+t.n);
    if(el) el.innerHTML += ' &nbsp;<span style="color:var(--c-ok);font-weight:700">✓ '+aplicados+' votos traídos al acta</span>';
    var body=document.getElementById('pvot-body-'+t.n);
    if(body && body.offsetParent===null && typeof toggleVotPanel==='function') toggleVotPanel(t.n);
  }
  try{ var _vc=document.getElementById('vv-card'), _s4=document.getElementById('step-4'); if(_vc&&_s4&&_s4.firstElementChild&&_s4.firstElementChild!==_vc) _s4.insertBefore(_vc,_s4.firstElementChild); }catch(e){}
})();
