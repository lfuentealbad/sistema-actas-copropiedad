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
  // El codigo de la sala lo acuna vv_crear en Postgres; aqui solo se recibe.
  // Habia un generador local con Math.random que nadie llamaba (SAST-08).
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function asistentes(){
    var filas=[];
    document.querySelectorAll('#asistentes-tbody tr').forEach(function(row){
      var get=function(sel){ var e=row.querySelector(sel); return e?String(e.value).trim():''; };
      var rut=get('.rut-asist'), nombre=get('.nombre-asist'), unidad=get('.unidad');
      var der=parseFloat(get('.derechos'))||0;
      var habil=(row.querySelector('.habil')?row.querySelector('.habil').value:'si')==='si';
      var asiste=(row.querySelector('.asiste')?row.querySelector('.asiste').value:'si')==='si';
      var correo=get('.correo-asist').toLowerCase();
      filas.push({rut:rut,nombre:nombre,unidad:unidad,der:der,habil:habil,asiste:asiste,correo:correo});
    });
    // Art. 14 del Reglamento: la habilidad es del copropietario, no de la
    // unidad. Se decide con TODAS sus filas -tambien las de unidades que no
    // asisten- antes de quedarse con las presentes. Filtrar primero dejaba
    // votar en la sala a quien debe en otra unidad que no vino a la asamblea.
    if(window.Derechos && Derechos.habilidadPorCopropietario) filas=Derechos.habilidadPorCopropietario(filas).filas;
    return filas.filter(function(a){ return a.asiste && a.rut; });
  }
  // Una persona puede tener varias unidades: en la sala vota una vez, con la
  // suma de sus derechos, y es habil solo si lo es en todas (C3). Los votos
  // llegan por RUT, asi que el computo tambien se hace por RUT.
  function porRut(lista){
    var out=Object.create(null);
    lista.forEach(function(a){
      var k=norm(a.rut); if(!k) return;
      if(!out[k]) out[k]={der:0,habil:true};
      out[k].der+=a.der;
      out[k].habil=out[k].habil && a.habil;
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
  // Ver la nota en acta-1.js: la llave de la demostracion no vale fuera de
  // una pagina de demostracion, aunque haya quedado en localStorage.
  var LLAVE_DE_DEMO='DEMO-PAGO-SIMULADO';
  function enPaginaDemo(){ return /(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname); }
  function llaveGuardada(){
    var v='';
    try{ v=localStorage.getItem(LLAVE)||''; }catch(e){ return ''; }
    return (v===LLAVE_DE_DEMO && !enPaginaDemo()) ? '' : v;
  }
  function guardarLlave(v){ try{ localStorage.setItem(LLAVE,v); }catch(e){} }
  function borrarLlave(){ try{ localStorage.removeItem(LLAVE); }catch(e){} }
  // La llave es <payload base64url>.<firma>, con la orden en payload.o. Una
  // llave que aqui no sirve -de otra cuenta, de otro producto- sigue siendo
  // plata de quien pago: antes de borrarla se anota su orden, y cuenta.js
  // se la devuelve a esa cuenta cuando entre en este equipo (recuperarPagos).
  function anotarOrdenDeLlave(v){
    var p=String(v||'').split('.'); if(p.length!==2) return;
    try{
      var b=p[0].replace(/-/g,'+').replace(/_/g,'/'); while(b.length%4) b+='=';
      var o=String((JSON.parse(atob(b))||{}).o||'');
      if(/^AV-[A-Z0-9]{1,32}$/.test(o) && window.Cuenta && typeof Cuenta.anotarPago==='function') Cuenta.anotarPago(o);
    }catch(e){}
  }
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
      var ah=document.getElementById('vv-acepta-host');
      if(ah && !ah.innerHTML) ah.innerHTML=Cuenta.terminos.html('vv-acepta');
      return;
    }
    // USUARIO se llena al cargar la pagina. La sesion pudo abrirse despues,
    // desde la cabecera: se vuelve a preguntar antes de pedir el correo, o
    // le estariamos pidiendo entrar a alguien que ya entro.
    if(window.Cuenta && !pidiendoSesion){
      pidiendoSesion=true;
      window.Cuenta.usuario(function(u){
        pidiendoSesion=false;
        if(otraCuenta(u)){ location.reload(); return; }
        if(u){ USUARIO=u; pintarPago(); return; }
        pedirCorreo();
      });
      return;
    }
    pedirCorreo();
  }
  var pidiendoSesion=false;
  // ¿Entro otra cuenta que la que abrio la pagina (window._uidSesion, de
  // acta-1.js)? Entonces lo que esta en pantalla -el padron, con sus RUT- es
  // de la anterior, y el autoguardado lo subiria a esta. Se recarga y la
  // pagina arranca en blanco para esta: acta-1.js no le ofrece el borrador
  // ajeno (ver _tryRestore).
  function otraCuenta(u){ return !!(u && window._uidSesion && u.id!==window._uidSesion); }
  function pedirCorreo(){
    var listo=document.getElementById('vv-pago-listo');
    if(listo) listo.style.display='none';
    // El codigo por correo ya no crea cuentas (AUTH-03): el texto no puede
    // prometer que con el basta.
    window.Cuenta.panel('vv-cta-host', {
      titulo:'Primero, su correo',
      sub:'Entre, o cree su cuenta en un minuto. Con ella podrá volver a su acta.',
      alEntrar:function(u){
        if(otraCuenta(u)){ location.reload(); return; }
        USUARIO=u; pintarPago();
      }
    });
  }
  // Salir borra del equipo el borrador y las llaves (cuenta.js), pero en
  // pantalla seguiria el acta abierta, con el padron y sus RUT, a la vista
  // de quien entre despues. Se recarga, como en la consulta: la pagina
  // vuelve a su portero y arranca en blanco.
  window.actaCerrarSesion=function(btn){
    btn.disabled=true; btn.textContent='Saliendo…';
    window.Cuenta.salir(function(){ USUARIO=null; location.reload(); });
  };
  window.actaCancelarPago=function(){ pagoMsg(''); mostrarPago(false); };
  // savePDF vive en el otro modulo y necesita poder pedir el pago.
  window.actaMostrarPago=mostrarPago;
  // C1: /api/pago/* exige la sesion de la cuenta. El token sale de
  // Cuenta.tokenDeAcceso() (cuenta.js); sin el no se llama al Worker.
  function tokenDeAcceso(){
    if(!window.Cuenta || typeof Cuenta.tokenDeAcceso!=='function') return Promise.resolve(null);
    return Promise.resolve().then(function(){ return Cuenta.tokenDeAcceso(); })
      .then(function(t){ return t||null; }, function(){ return null; });
  }
  // La URL de la pasarela la arma el Worker con lo que contesta Flow. Antes
  // de mandar a alguien a pagar se comprueba que el destino sea Flow: son
  // dos lineas, y convierten un "confie en mi" en algo que se puede leer.
  function destinoDePagoValido(u){
    u=String(u||'');
    return u.indexOf('https://www.flow.cl/')===0 || u.indexOf('https://sandbox.flow.cl/')===0;
  }
  window.actaIrAPagar=async function(btn){
    var correo=USUARIO&&USUARIO.correo;
    if(!window.Cuenta.correoValido(correo)){ pintarPago(); return; }
    if(!Cuenta.terminos.aceptados('vv-acepta')){
      pagoMsg(Cuenta.terminos.AVISO, true);
      var _c=document.getElementById('vv-acepta'); if(_c) _c.focus();
      return;
    }
    btn.disabled=true; var _t=btn.textContent; btn.textContent='Conectando…'; pagoMsg('');
    try{
      var token=await tokenDeAcceso();
      // Sin sesion vigente se vuelve a pedir la cuenta: el pago queda atado
      // a ella, y el comprobante va a su correo, no al que se escriba aqui.
      if(!token){ USUARIO=null; pintarPago(); return; }
      var r=await fetch('/api/pago/crear',{method:'POST',headers:{'content-type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({correo:correo,acepta:Cuenta.terminos.VERSION})});
      var d=null; try{ d=await r.json(); }catch(e){}
      if(r.status===401){
        USUARIO=null; pintarPago();
        pagoMsg('Su sesión venció. Entre de nuevo para continuar con el pago.', true);
        return;
      }
      if(!r.ok||!d||!d.redirigir){
        pagoMsg(d&&d.error==='pasarela_no_configurada'
          ? 'El pago en línea todavía no está habilitado. Escríbanos a contacto@actascopropiedad.cl.'
          : 'No pudimos iniciar el pago. Inténtelo nuevamente en unos minutos.', true);
        return;
      }
      if(!destinoDePagoValido(d.redirigir)){
        pagoMsg('No pudimos iniciar el pago. Inténtelo nuevamente en unos minutos.', true);
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
    // La orden se quita de la direccion recien con una respuesta definitiva
    // (pagado, o 404), como en el panel y la consulta: el mensaje de espera
    // pide recargar, y recargar tiene que volver a intentarlo.
    var olvidarOrden=function(){ try{ history.replaceState(null,'',location.pathname); }catch(e){} };
    mostrarPago(true);
    var _l=document.getElementById('vv-pago-listo'); if(_l) _l.style.display='block';
    pagoMsg('Confirmando el pago…');
    var pidioSesion=false;
    (function revisar(){
      intentos++;
      // C1: la llave se entrega solo a la cuenta que pago. Si la sesion no
      // esta (vuelve de la pasarela en otra pestaña, o vencio), se pide una
      // vez y se sigue consultando al entrar.
      tokenDeAcceso().then(function(token){
        if(!token){
          if(!pidioSesion && window.Cuenta && Cuenta.exigirSesion){
            pidioSesion=true; intentos--;
            pagoMsg('Entre con la cuenta con la que pagó para confirmar el pago.', true);
            // El portero de acta-1.js ya pide la sesion al cargar, y el cajon
            // es uno solo. Se espera a ese portero en vez de abrir un segundo
            // pedido: asi hay un solo lugar que decide quien entro.
            if(typeof window.actaTrasElPortero==='function'){ window.actaTrasElPortero(revisar); return null; }
            Cuenta.exigirSesion({ titulo:'Entre con la cuenta con la que pagó',
              sub:'El pago queda asociado a esa cuenta, y solo ella puede recuperarlo.' }, revisar);
            return null;
          }
          throw new Error('sin_sesion');
        }
        return fetch('/api/pago/estado?orden='+encodeURIComponent(orden),{headers:{'Authorization':'Bearer '+token}})
          .then(function(r){
            return r.json().catch(function(){ return null; })
              .then(function(d){ return {estado:r.status, d:d}; });
          });
      })
        .then(function(x){
          if(x===null) return;
          var d=x.d;
          if(d && d.estado==='pagado' && d.llave){
            olvidarOrden();
            // Una orden de consulta por escrito no abre la sala ni finaliza
            // el acta, y guardarla aqui pisaria la llave de la asamblea que
            // hubiera en el equipo. Mismo criterio que la puerta (acta-1.js).
            if((d.producto||'acta')!=='acta'){
              pagoMsg('Ese pago corresponde a una consulta por escrito, no a un acta de asamblea.', true);
              return;
            }
            guardarLlave(d.llave);
            pagoMsg('Pago confirmado. Ya puede iniciar la sala de votación.');
            setTimeout(function(){ pagoMsg(''); mostrarPago(false); },2600);
            return;
          }
          // 404: la orden no existe o es de otra cuenta; el Worker no dice
          // cual, y esperar no la va a hacer aparecer. Antes de quitarla de
          // la direccion se anota en el equipo: si se pago con otra cuenta,
          // Cuenta.recuperarPagos la entrega al entrar con ella.
          if(x.estado===404){
            if(window.Cuenta && typeof Cuenta.anotarPago==='function') Cuenta.anotarPago(orden);
            olvidarOrden();
            pagoMsg('No encontramos ese pago en esta cuenta. Si pagó con otra, entre con ella en este equipo y se lo entregaremos.', true);
            return;
          }
          if(x.estado===401){
            pagoMsg('Su sesión terminó. Recargue la página y entre con la cuenta con la que pagó.', true);
            return;
          }
          if(intentos<10){ setTimeout(revisar,2000); return; }
          // Aqui la orden es de esta cuenta (la ajena ya salio por el 404):
          // solo falta que Flow la confirme.
          pagoMsg('Todavía no recibimos la confirmación. Si ya pagó, espere un momento y recargue esta página.',true);
        })
        .catch(function(){
          if(intentos<10){ setTimeout(revisar,2000); return; }
          pagoMsg('No pudimos verificar el pago. Recargue la página en unos minutos.',true);
        });
    })();
  })();
  // C4: la base guarda una fila por unidad y, si la misma unidad viene dos
  // veces, se queda con la primera y devuelve las otras en "descartadas".
  // La Mesa tiene que saberlo: son derechos que la sala no va a contar.
  function avisarDescartadas(res){
    var el=document.getElementById('vv-aviso-padron'); if(!el) return;
    var d=(res && Array.isArray(res.descartadas)) ? res.descartadas : [];
    if(!d.length){ el.style.display='none'; el.textContent=''; return; }
    el.style.display='block';
    el.textContent='La sala no cargó '+d.length+' fila(s) del padrón porque su unidad venía repetida: '+
      d.map(function(u){ return String(u); }).join(', ')+'. Se conservó la primera fila de cada una. '+
      'Revise el Paso 3: si son unidades distintas, corrija el número antes de votar, cierre esta sala y ábrala de nuevo.';
  }
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
      // C4: el padron lleva asiste y correo. Van solo los presentes -la sala
      // es para quien esta en la reunion-, con la habilidad ya decidida por
      // copropietario (ver asistentes()).
      var pad=asis.map(function(a){ return {rut:norm(a.rut),nombre:a.nombre,unidad:a.unidad,habil:a.habil,asiste:true,der:a.der,correo:a.correo||''}; });
      var pi=await c.rpc('vv_set_padron',{p_codigo:asam.codigo,p_token:asam.token,p_padron:pad});
      if(pi.error) throw pi.error;
      avisarDescartadas(pi.data);
      document.getElementById('vv-start').style.display='none';
      document.getElementById('vv-panel').style.display='block';
      var _tsel=document.getElementById('tipo-asamblea'); if(_tsel) _tsel.disabled=true;
      var _tnote=document.getElementById('tipo-lock-note'); if(_tnote) _tnote.style.display='block';
      document.getElementById('vv-codigo').textContent=codigo;
      var link=location.origin+'/votacion/?code='+encodeURIComponent(codigo);
      document.getElementById('vv-link').textContent=link;
      try{ var qr=qrcode(0,'M'); qr.addData(link); qr.make(); document.getElementById('vv-qr').innerHTML=qr.createImgTag(3,8); }catch(e){}
      temasActuales=tms; renderTemas();
      if(pollTimer) clearInterval(pollTimer);
      pollTimer=setInterval(function(){ if(activo) refrescar(); }, 6000);
    }catch(e){
      var _m=String((e&&e.message)||e||'');
      // El tope es de salas por pago (tres), no del pago: la llave sigue
      // sirviendo para finalizar el acta, asi que no se borra ni se pide
      // pagar otra vez.
      if(/demasiadas_salas_con_este_pago/.test(_m)){
        alert('Con el pago de esta asamblea ya se abrieron 3 salas de votación, que es el máximo por pago, así que no se puede abrir otra.\n\nEl pago sigue sirviendo para finalizar el acta.');
        return;
      }
      if(/pago_de_otra_cuenta|llave_de_otro_producto/.test(_m)){
        anotarOrdenDeLlave(llave);
        borrarLlave(); mostrarPago(true);
        pagoMsg(/pago_de_otra_cuenta/.test(_m)
          ? 'El pago guardado en este equipo es de otra cuenta. Si pagó con otra cuenta, entre con ella en este equipo y se lo devolveremos; si no, active esta asamblea con su propio pago.'
          : 'El pago guardado en este equipo no corresponde a un acta de asamblea. Active esta asamblea para abrir la sala.', true);
        return;
      }
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
      var link=location.origin+'/votacion/?code='+encodeURIComponent(g.codigo);
      document.getElementById('vv-link').textContent=link;
      try{ var qr=qrcode(0,'M'); qr.addData(link); qr.make(); document.getElementById('vv-qr').innerHTML=qr.createImgTag(3,8); }catch(e){}
      temasActuales=temas(); renderTemas();
      if(pollTimer) clearInterval(pollTimer);
      pollTimer=setInterval(function(){ if(activo) refrescar(); }, 6000);
      // Al recuperar la sala la Mesa ve de inmediato quien ya esta
      // identificado, por si alguien espera que lo liberen.
      window.actaActualizarTelefonos(null);
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
  // -------------------------------------------------------------------
  //  Telefonos identificados (contrato C3)
  // -------------------------------------------------------------------
  //  Desde el 22-09-2026 cada RUT queda atado al primer telefono que se
  //  identifica con el, y solo la Mesa puede soltar ese vinculo: cuando a un
  //  vecino se le apaga el telefono, o alguien se le adelanto con su RUT. La
  //  pagina de la sala (/votacion/) ya tenia el boton; la Mesa que dirige la
  //  votacion desde el acta -que es el camino principal- no tenia como, y un
  //  vecino podia quedar sin votar en plena asamblea.
  //  Se consulta a pedido y al recuperar la sala, no en cada vuelta del
  //  sondeo de resultados: trae el padron entero y no hace falta cada 6 s.
  //  Todo se pinta con textContent: nombres y unidades vienen del Excel.
  function pintarTelefonos(padron){
    var caja=document.getElementById('vv-telefonos-lista'); if(!caja) return;
    caja.textContent='';
    // Una persona con varias unidades aparece una sola vez: el vinculo es
    // del RUT, no de la unidad.
    var porRut=Object.create(null), orden=[], total=0;
    (padron||[]).forEach(function(p){
      if(!p) return;
      var r=norm(p.rut); if(!r) return;
      if(!porRut[r]){ porRut[r]={rut:r, nombre:String(p.nombre||''), unidades:[], vinculado:false}; orden.push(r); total++; }
      if(p.unidad) porRut[r].unidades.push(String(p.unidad));
      if(p.vinculado===true) porRut[r].vinculado=true;
    });
    var vinc=orden.map(function(r){ return porRut[r]; }).filter(function(x){ return x.vinculado; });
    var res=document.createElement('p');
    res.style.cssText='font-size:12.5px;margin:4px 0 8px';
    res.textContent=vinc.length
      ? vinc.length+' de '+total+' copropietarios presentes se identificaron desde su teléfono.'
      : 'Todavía nadie se ha identificado desde su teléfono.';
    caja.appendChild(res);
    vinc.forEach(function(x){
      var fila=document.createElement('div');
      fila.style.cssText='display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid var(--c-border, #e5e7eb)';
      var t=document.createElement('span'); t.style.flex='1';
      t.textContent=(x.unidades.length ? x.unidades.join(', ')+' — ' : '')+(x.nombre||x.rut);
      var b=document.createElement('button');
      b.type='button'; b.className='btn-tool'; b.textContent='Liberar';
      b.setAttribute('aria-label','Liberar el teléfono de '+(x.nombre||x.rut));
      b.dataset.ac='actaLiberarTelefono'; b.dataset.args='@';
      b.dataset.rut=x.rut; b.dataset.nombre=x.nombre;
      fila.appendChild(t); fila.appendChild(b); caja.appendChild(fila);
    });
  }
  function avisoTelefonos(texto){
    var caja=document.getElementById('vv-telefonos-lista'); if(caja) caja.textContent=texto;
  }
  window.actaActualizarTelefonos=async function(btn){
    if(!asam){ avisoTelefonos('No hay una sala abierta en esta sesión.'); return; }
    var c=client(); if(!c) return;
    var _t=btn?btn.textContent:'';
    if(btn){ btn.disabled=true; btn.textContent='Consultando…'; }
    try{
      var r=await c.rpc('vv_reanudar',{p_codigo:asam.codigo,p_token:asam.token});
      if(r.error || !r.data) throw r.error||new Error('sin datos');
      pintarTelefonos(r.data.padron);
    }catch(e){
      avisoTelefonos('No se pudo consultar quién está identificado. Revise su conexión e inténtelo de nuevo.');
    }finally{ if(btn){ btn.disabled=false; btn.textContent=_t; } }
  };
  window.actaLiberarTelefono=async function(btn){
    if(!asam || !btn || !btn.dataset) return;
    var rut=String(btn.dataset.rut||''); if(!rut) return;
    var nombre=String(btn.dataset.nombre||'')||rut;
    if(!confirm('¿Liberar el teléfono de '+nombre+'?\n\nPodrá volver a identificarse desde otro teléfono. Los votos que ya emitió se conservan.\n\nHágalo solo si esa persona se lo pide en la sala.')) return;
    var c=client(); if(!c) return;
    btn.disabled=true;
    try{
      var r=await c.rpc('vv_liberar',{p_codigo:asam.codigo,p_token:asam.token,p_rut:rut});
      if(r.error) throw r.error;
    }catch(e){
      btn.disabled=false;
      alert('No se pudo liberar el teléfono. Revise su conexión e inténtelo de nuevo.');
      return;
    }
    await window.actaActualizarTelefonos(null);
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
  //
  // El Worker manda a lo mas 40 por llamada y contesta cuantas "quedan".
  // Se vuelve a llamar mientras la llamada anterior haya enviado algo: si no
  // envio nada, el servicio de correo esta rechazando y repetir no lo
  // arregla. Diez rondas como tope. Ante un 429 se espera lo que diga
  // retry-after -nunca menos- antes de la ronda siguiente; si pide mas de
  // dos minutos, no se deja a la Mesa esperando sin saberlo: se le dice.
  var AVISOS_RONDAS=10, AVISOS_ESPERA_MAX=120;
  var avisando=false, avisarOtraVez=false;
  function dormir(ms){ return new Promise(function(res){ setTimeout(res,ms); }); }
  function segundosDeEspera(r){
    var v=null;
    try{ v=(r.headers && r.headers.get) ? r.headers.get('retry-after') : null; }catch(e){}
    var s=parseInt(v,10);
    // retry-after puede venir en segundos o como fecha HTTP.
    if(!(s>=0)){ var f=Date.parse(v||''); s=isNaN(f) ? 60 : Math.ceil((f-Date.now())/1000); }
    return Math.max(5,s);
  }
  function avisoCorreos(texto, problema, reintentar){
    var av=document.getElementById('vv-aviso-correos'); if(!av) return;
    av.setAttribute('role','status');
    av.textContent=texto;
    av.style.display='block';
    av.style.background=problema ? 'var(--c-warn-bg)' : 'var(--c-ok-bg)';
    av.style.color=problema ? 'var(--c-warn)' : 'var(--c-ok)';
    if(!reintentar) return;
    var b=document.createElement('button'); b.type='button'; b.className='btn-tool';
    b.style.display='block'; b.style.marginTop='8px';
    b.textContent='Reintentar el envío';
    b.addEventListener('click', function(){ b.disabled=true; avisarVotantes(); });
    av.appendChild(b);
  }
  async function avisarVotantes(){
    if(!asam) return;
    var conCorreo = asistentes().filter(function(a){ return a.correo; }).length;
    if(conCorreo === 0) return;
    // Se puede cerrar otro punto mientras la ronda anterior sigue enviando.
    // No se abre un envio en paralelo: se le pide al que corre una vuelta
    // mas al terminar, que recoge lo nuevo (el Worker trae todo lo pendiente).
    if(avisando){ avisarOtraVez=true; return; }
    avisando=true;
    try{
      // Solo si la vuelta anterior termino por las buenas. Si paro por un
      // 429, un 503 o sin red, volver a llamar en el acto es justo el bucle
      // apretado que retry-after pide evitar: queda el boton «Reintentar».
      var terminoBien;
      do{ avisarOtraVez=false; terminoBien=await rondasDeAvisos(asam); }while(terminoBien && avisarOtraVez && asam);
    }finally{ avisando=false; }
  }
  // true si el servidor contesto por las buenas hasta el final; nada (falso)
  // si paro por un 429, un 503, sin red o sin_confirmar.
  async function rondasDeAvisos(sala){
    var enviados=0, ultimo=null;
    var condominio=(document.getElementById('condo-nombre')||{}).value||'';
    var hechos=function(){ return enviados ? 'Se enviaron '+enviados+' constancia(s) de voto por correo. ' : ''; };
    var LUEGO=' Pulse «Reintentar el envío» en unos minutos; también se reintenta al cerrar el próximo punto.';
    for(var ronda=1; ronda<=AVISOS_RONDAS; ronda++){
      var r, d;
      try{
        r=await fetch('/api/voto/avisos', {
          method:'POST', headers:{'content-type':'application/json'},
          body: JSON.stringify({ codigo:sala.codigo, token:sala.token, condominio:condominio })
        });
        d=await r.json().catch(function(){ return null; });
      }catch(e){
        if(asam===sala) avisoCorreos(hechos()+'No pudimos conectar con el servidor para enviar las constancias que faltan. Revise su conexión a internet.'+LUEGO, true, true);
        return;
      }
      // La sala se cerro mientras tanto: sus votos ya no estan en el servidor.
      if(asam!==sala) return;
      if(r.status===429){
        var s=segundosDeEspera(r);
        if(ronda===AVISOS_RONDAS || s>AVISOS_ESPERA_MAX){
          avisoCorreos(hechos()+'El servidor está recibiendo demasiadas solicitudes y pidió esperar, así que las constancias que faltan no se enviaron.'+LUEGO, true, true);
          return;
        }
        avisoCorreos(hechos()+'El servidor pidió una pausa: el envío de las constancias que faltan sigue en '+s+' segundos.', true, false);
        await dormir(s*1000);
        if(asam!==sala) return;
        continue;
      }
      if(!r.ok || !d){
        var err=d && d.error;
        if(err==='correo_no_configurado' || err==='avisos_no_configurados'){
          avisoCorreos('El envío de constancias por correo aún no está habilitado.', true, false);
        } else if(err==='base_no_disponible'){
          avisoCorreos(hechos()+'La base de datos no respondió, así que las constancias que faltan no se enviaron.'+LUEGO, true, true);
        } else {
          // no_autorizado o parametros_invalidos: la sala ya no existe o la
          // llave de la Mesa no calza. Reintentar no lo cambia.
          avisoCorreos(hechos()+'No se pudieron enviar las constancias de voto por correo.', true, false);
        }
        return;
      }
      enviados+=Number(d.enviados)||0;
      ultimo=d;
      // La base no alcanzo a marcar como avisado lo que se envio. El Worker
      // se detuvo ahi para no repetirlo; seguir llamando solo repetiria mas.
      if(d.sin_confirmar){
        avisoCorreos(hechos()+'La base de datos no alcanzó a registrar las últimas constancias enviadas, así que el envío se detuvo para no repetirlas. Al reintentar, alguien podría recibir su constancia dos veces.'+LUEGO, true, true);
        return;
      }
      if(!((Number(d.quedan)||0)>0 && (Number(d.enviados)||0)>0)) break;
    }
    // Lo que sigue pendiente en la base: lo que fallo en la ultima ronda
    // (se vuelve a intentar en la proxima) y lo que no se alcanzo a intentar.
    var fallidos=(ultimo && Number(ultimo.fallidos))||0, quedan=(ultimo && Number(ultimo.quedan))||0;
    if(!fallidos && !quedan){
      avisoCorreos(enviados ? hechos().trim() : 'No había constancias de voto pendientes de envío.', false, false);
      return true;
    }
    avisoCorreos(hechos()+
      (fallidos ? fallidos+' no se pudieron enviar: el servicio de correo no las aceptó. ' : '')+
      (quedan ? quedan+' quedaron por enviar. ' : '')+LUEGO.trim(), true, true);
    // El servidor contesto bien; lo pendiente es del servicio de correo o
    // del tope de rondas, no una pausa pedida.
    return true;
  }
  async function refrescar(){
    if(!activo) return;
    var c=client();
    var q=await c.rpc('vv_resultados',{p_codigo:asam.codigo,p_token:asam.token,p_punto:activo.key});
    if(q.error) return;
    var votos=(q.data&&q.data.votos)||[];
    var byRut=porRut(asistentes()), habPresentes=0;
    Object.keys(byRut).forEach(function(k){ if(byRut[k].habil) habPresentes++; });
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
    var voteByRut=Object.create(null); votos.forEach(function(v){ voteByRut[v.rut]=v.choice; });
    if(typeof _qpese==='function') _qpese(t.n);
    var tbody=document.getElementById('pvot-rows-'+t.n);
    if(!tbody){ alert('No encontré el panel de votación del Punto '+t.n+'. Asegúrese de que el punto requiere votación.'); return; }
    var rows=[].slice.call(tbody.querySelectorAll('tr'));
    var aplicados=0;
    Object.keys(voteByRut).forEach(function(rk){
      // El voto es de la persona y vale para todas sus unidades: antes se
      // aplicaba solo a la primera fila con ese RUT y las demas quedaban
      // "sin registrar".
      for(var i=0;i<rows.length;i++){
        if(norm(rows[i].dataset.rut||'')!==rk) continue;
        var sel=rows[i].querySelector('.pref-select'); if(!sel) continue;
        sel.value=voteByRut[rk]; sel.className='pref-select '+sel.value; aplicados++;
      }
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
