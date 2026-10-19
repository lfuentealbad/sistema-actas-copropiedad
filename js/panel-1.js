(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fecha(v){
    if(!v) return '';
    // Una fecha sola ('2026-01-10', como fecha_sesion) el navegador la lee
    // en UTC, y en Chile se pintaba el dia anterior. Se arma en hora local.
    var f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
    var d = f ? new Date(+f[1], +f[2] - 1, +f[3]) : new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('es-CL', { day:'2-digit', month:'long', year:'numeric' });
  }
  function fechaCorta(v){
    var d = new Date(v);
    if(isNaN(d)) return '';
    return d.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' }) +
           ', ' + d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12:false });
  }
  function leer(clave){
    try { return JSON.parse(localStorage.getItem(clave)); } catch(e){ return null; }
  }
  function lista(html){ return '<div class="lista">' + html + '</div>'; }
  function vacio(titulo, texto, boton){
    return '<div class="vacio"><b>' + esc(titulo) + '</b>' + esc(texto) +
      (boton ? '<div><a class="btn btn-p" href="' + boton.href + '">' + esc(boton.txt) + '</a></div>' : '') + '</div>';
  }
  function noDisponible(que){
    return '<div class="nota"><strong>Esta sección todavía no está disponible.</strong> ' +
      'El servicio de ' + esc(que) + ' aún termina de configurarse. Escríbanos a ' +
      '<a href="mailto:contacto@actascopropiedad.cl">contacto@actascopropiedad.cl</a> si necesita ayuda.</div>';
  }
  function fallo(e, que){
    var c = e && (e.code || e.status);
    if(c === 'PGRST202' || c === '42P01' || c === '404') return noDisponible(que);
    return '<div class="nota">No pudimos cargar sus ' + esc(que) + ' ahora. Vuelva a intentarlo en unos minutos.</div>';
  }
  function saludo(){
    var h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
  }

  // -------------------------------------------------------------------
  //  El mes de servicio (paso 17, 07-10-2026)
  // -------------------------------------------------------------------
  //  Un pago, un mes, un condominio, todas las herramientas. El mes vive en
  //  la base (Cuenta.pase); aqui se muestra, se compra y se corrige el
  //  nombre mientras no se haya usado.
  function enVitrina(){ return document.documentElement.classList.contains('vitrina'); }

  function mesMsg(id, txt, malo){
    var m = $(id);
    if(!m) return;
    m.className = 'msg ' + (txt ? (malo ? 'err' : 'ok') : '');
    m.textContent = txt || '';
  }

  // A donde volver despues de pagar: la herramienta que mando a activar el
  // mes (?volver=/acta). Se guarda en la pestana, porque de Flow se vuelve a
  // /cuenta?pago= y la direccion ya no lo trae. Solo rutas del sitio.
  var VOLVER = 'actaviva_volver';
  function anotarVolver(){
    var m = /[?&]volver=([^&#]+)/.exec(location.search);
    if(!m) return;
    var v = '';
    try { v = decodeURIComponent(m[1]); } catch(e){ return; }
    if(!/^\/(acta|consulta\/|acta-comite|finanzas)(\?|#|$)/.test(v)) return;
    try { sessionStorage.setItem(VOLVER, v); } catch(e){}
  }
  function volverA(){
    try { return sessionStorage.getItem(VOLVER) || ''; } catch(e){ return ''; }
  }

  function pintarMeses(){
    var host = $('p-meses');
    if(!host) return;
    Cuenta.pase.estado(function(e){
      if(!e){
        host.innerHTML = '<div class="nota">No pudimos consultar su servicio ahora. Recargue la página en un momento.</div>';
        return;
      }
      var tit = $('p-activar-tit');
      if(tit) tit.textContent = e.condominios.length ? 'Activar un mes para otro condominio, o renovar' : 'Activar un mes';
      if(!e.condominios.length){
        host.innerHTML = vacio('Todavía no ha activado ningún mes',
          enVitrina() ? 'Cada condominio tiene su mes de servicio, con todas las herramientas.'
                      : 'Escriba el condominio aquí abajo y active el mes: desde ese momento tiene todas las herramientas para ese condominio.');
        return;
      }
      host.innerHTML = lista(e.condominios.map(filaMes).join(''));
      enganchar(host);
    });
  }

  // -------------------------------------------------------------------
  //  Prueba por solicitud (paso 19, 18-10-2026). Solo en vitrina: mientras
  //  el sitio no vende, el acceso se da a quien lo pide y el dueno aprueba.
  // -------------------------------------------------------------------
  var MOTIVOS_PRUEBA = {
    nombre_invalido: 'Escriba su nombre.',
    telefono_invalido: 'Revise el teléfono: solo números, espacios y +.',
    condominio_invalido: 'Escriba el nombre del condominio.',
    comuna_invalida: 'Escriba la comuna.',
    rol_invalido: 'Elija quién es usted.',
    unidades_invalidas: 'Indique el número de unidades del condominio.',
    solicitud_pendiente: 'Ya tiene una solicitud en revisión.',
    demasiados_intentos: 'Demasiados envíos. Intente de nuevo mañana.',
    sesion_requerida: 'Su sesión terminó. Recargue la página y vuelva a entrar.'
  };

  function pintarPrueba(){
    var caja = $('p-prueba');
    if(!caja || !enVitrina()) return;
    var est = $('p-prueba-estado'), form = $('p-prueba-form');
    if(window.DEMO_MES){
      est.innerHTML = '<div class="nota">En la demostración no se envían solicitudes.</div>';
      form.hidden = true;
      return;
    }
    var c = Cuenta.cliente();
    if(!c) return;
    c.rpc('mi_solicitud_prueba').then(function(r){
      var s = (r && !r.error && r.data) || {};
      if(s.estado === 'pendiente'){
        est.innerHTML = '<div class="nota">Recibimos su solicitud para <b>' + esc(s.condominio) + '</b> el ' +
          esc(Cuenta.pase.fecha(s.creada_en)) + '. La revisaremos y le escribiremos.</div>';
        form.hidden = true;
      } else if(s.estado === 'aprobada'){
        est.innerHTML = '<div class="nota">Su prueba para <b>' + esc(s.condominio) + '</b> fue aprobada: el mes aparece más arriba.</div>';
        form.hidden = true;
      } else if(s.estado === 'rechazada'){
        est.innerHTML = '<div class="nota">No pudimos aprobar su solicitud anterior. Puede enviar otra.</div>';
      }
    });
    var btn = $('p-pr-enviar');
    if(btn && !btn._enganchado){ btn._enganchado = true; btn.addEventListener('click', enviarPrueba); }
  }

  function enviarPrueba(){
    var v = function(id){ return ($(id).value || '').trim(); };
    var datos = {
      p_nombre: v('p-pr-nombre'), p_telefono: v('p-pr-tel'), p_condominio: v('p-pr-condo'),
      p_comuna: v('p-pr-comuna'), p_rol: $('p-pr-rol').value, p_unidades: parseInt(v('p-pr-unidades'), 10)
    };
    if(datos.p_nombre.length < 2) return mesMsg('p-prueba-msg', MOTIVOS_PRUEBA.nombre_invalido, true);
    if(!/^[0-9+() -]{6,25}$/.test(datos.p_telefono)) return mesMsg('p-prueba-msg', MOTIVOS_PRUEBA.telefono_invalido, true);
    if(datos.p_condominio.length < 2) return mesMsg('p-prueba-msg', MOTIVOS_PRUEBA.condominio_invalido, true);
    if(datos.p_comuna.length < 2) return mesMsg('p-prueba-msg', MOTIVOS_PRUEBA.comuna_invalida, true);
    if(!(datos.p_unidades >= 1 && datos.p_unidades <= 20000)) return mesMsg('p-prueba-msg', MOTIVOS_PRUEBA.unidades_invalidas, true);
    var btn = $('p-pr-enviar');
    btn.disabled = true; btn.textContent = 'Enviando…';
    mesMsg('p-prueba-msg', '');
    Cuenta.cliente().rpc('solicitar_prueba', datos).then(function(r){
      btn.disabled = false; btn.textContent = 'Enviar solicitud';
      if(r.error){
        var m = String(r.error.message || '');
        var k = Object.keys(MOTIVOS_PRUEBA).filter(function(x){ return m.indexOf(x) >= 0; })[0];
        mesMsg('p-prueba-msg', k ? MOTIVOS_PRUEBA[k] : 'No se pudo enviar la solicitud. Intente de nuevo.', true);
        return;
      }
      mesMsg('p-prueba-msg', 'Solicitud enviada. Le escribiremos pronto.');
      // Aviso al dueno por correo. Si falla, la solicitud igual quedo guardada.
      Cuenta.tokenDeAcceso().then(function(t){
        if(t) fetch('/api/prueba/aviso', { method: 'POST', headers: { authorization: 'Bearer ' + t } }).catch(function(){});
      });
      pintarPrueba();
    });
  }

  // -------------------------------------------------------------------
  //  Revision de solicitudes (paso 20, 19-10-2026). La base decide quien
  //  revisa (public.revisores_prueba); aqui solo se pinta.
  // -------------------------------------------------------------------
  var ROLES_PRUEBA = { administrador: 'Administrador', comite: 'Comité', copropietario: 'Copropietario', otro: 'Otro' };

  function pintarRevision(){
    var caja = $('p-revisar');
    if(!caja || window.DEMO_MES) return;
    var c = Cuenta.cliente();
    if(!c) return;
    c.rpc('es_revisor').then(function(r){
      if(!r || r.error || r.data !== true) return;
      caja.hidden = false;
      cargarRevision();
    });
  }

  function cargarRevision(){
    Cuenta.cliente().rpc('solicitudes_para_revisar').then(function(r){
      if(!r || r.error || !r.data){
        $('p-rev-lista').innerHTML = '<div class="nota">No pudimos cargar las solicitudes. Recargue la página.</div>';
        return;
      }
      var pend = r.data.pendientes || [], hechas = r.data.resueltas || [];
      $('p-rev-lista').innerHTML = pend.length ? lista(pend.map(filaSolicitud).join('')) :
        '<div class="vacio"><b>No hay solicitudes pendientes</b>Cuando alguien pida una prueba, aparecerá aquí.</div>';
      $('p-rev-hechas').innerHTML = hechas.length ?
        '<details style="margin-top:14px"><summary style="cursor:pointer;font-size:14px;color:var(--tx2)">Resueltas (' + hechas.length + ')</summary>' +
        lista(hechas.map(function(x){
          return '<div class="it"><div class="info"><b>' + esc(x.condominio) +
            (x.estado === 'aprobada' ? '<span class="pill ok">APROBADA</span>' : '<span class="pill n">RECHAZADA</span>') +
            '</b><span>' + esc(x.nombre) + ' · ' + esc(x.correo) + ' · ' + esc(fecha(x.resuelta_en)) + '</span></div></div>';
        }).join('')) + '</details>' : '';
      var botones = $('p-rev-lista').querySelectorAll('button[data-sol]');
      for(var i = 0; i < botones.length; i++) botones[i].addEventListener('click', resolverSolicitud);
    });
  }

  function filaSolicitud(x){
    var tel = String(x.telefono || '').replace(/[^0-9+]/g, '');
    var wsp = tel.replace(/^\+/, '');
    return '<div class="it"><div class="info"><b>' + esc(x.condominio) + ' <span style="font-weight:400;color:var(--tx2)">· ' + esc(x.comuna) + '</span></b>' +
      '<span>' + esc(x.nombre) + ' · ' + esc(ROLES_PRUEBA[x.rol] || x.rol) + ' · ' + esc(x.unidades) + ' unidades<br>' +
      '<a href="mailto:' + esc(x.correo) + '">' + esc(x.correo) + '</a> · <a href="tel:' + esc(tel) + '">' + esc(x.telefono) + '</a>' +
      (wsp.length >= 8 ? ' · <a href="https://wa.me/' + esc(wsp) + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
      '<br>Pedida el ' + esc(fechaCorta(x.creada_en)) + '</span></div>' +
      '<div class="acc"><button type="button" class="btn btn-p btn-sm" data-sol="' + esc(x.id) + '" data-aprobar="1">Aprobar</button>' +
      '<button type="button" class="btn btn-s btn-sm" data-sol="' + esc(x.id) + '" data-aprobar="0">Rechazar</button></div></div>';
  }

  function resolverSolicitud(ev){
    var b = ev.currentTarget, aprobar = b.getAttribute('data-aprobar') === '1';
    var fila = b.closest('.it'), condo = fila ? fila.querySelector('b').firstChild.textContent.trim() : '';
    if(!window.confirm(aprobar
      ? '¿Aprobar la prueba para ' + condo + '? La cuenta recibe un mes completo desde hoy.'
      : '¿Rechazar la solicitud de ' + condo + '?')) return;
    var todos = fila.querySelectorAll('button');
    for(var i = 0; i < todos.length; i++) todos[i].disabled = true;
    mesMsg('p-rev-msg', '');
    Cuenta.cliente().rpc('resolver_prueba', { p_id: b.getAttribute('data-sol'), p_aprobar: aprobar }).then(function(r){
      if(r.error){
        var m = String(r.error.message || '');
        mesMsg('p-rev-msg', /ya_resuelta/.test(m) ? 'Esa solicitud ya estaba resuelta.' : 'No se pudo guardar. Intente de nuevo.', true);
      } else {
        mesMsg('p-rev-msg', aprobar
          ? 'Aprobada: ' + condo + ' tiene su mes hasta el ' + fecha(r.data && r.data.hasta) + '. Escríbale para acompañarlo.'
          : 'Rechazada: ' + condo + '.');
      }
      cargarRevision();
    });
  }

  function filaMes(x){
    var estado = x.activo
      ? '<span class="pill ok">activo</span>'
      : '<span class="pill n">vencido</span>';
    var linea = x.activo
      ? 'Vigente hasta el ' + esc(Cuenta.pase.fecha(x.hasta))
      : 'Venció el ' + esc(Cuenta.pase.fecha(x.ultimo)) + '. Lo emitido sigue en su cuenta; para emitir algo nuevo, active otro mes.';
    var acc = '';
    if(!enVitrina()){
      acc += '<button type="button" class="btn ' + (x.activo ? 'btn-s' : 'btn-p') + ' btn-sm" data-renovar="' + esc(x.condominio) + '">' +
        (x.activo ? 'Sumar otro mes' : 'Activar otro mes') + '</button>';
    }
    if(x.corregir){
      acc += '<button type="button" class="btn btn-s btn-sm" data-corregir="' + esc(x.corregir) + '" data-nombre="' + esc(x.condominio) + '">Corregir el nombre</button>';
    }
    return '<div class="it">' +
      '<div class="info"><b>' + esc(x.condominio) + estado + '</b><span>' + linea + '</span></div>' +
      (acc ? '<div class="acc">' + acc + '</div>' : '') +
    '</div>';
  }

  function enganchar(host){
    [].slice.call(host.querySelectorAll('[data-renovar]')).forEach(function(b){
      b.addEventListener('click', function(){
        var campo = $('p-mes-condo');
        if(!campo) return;
        campo.value = b.getAttribute('data-renovar');
        var caja = $('p-activar');
        if(caja && caja.scrollIntoView) caja.scrollIntoView({ block: 'center' });
        var acepta = $('p-acepta-mes');
        (acepta || campo).focus();
        mesMsg('p-mes-pago-msg', b.textContent === 'Sumar otro mes'
          ? 'El mes nuevo empieza cuando termine el que está vigente: no pierde días por pagar antes.' : '');
      });
    });
    [].slice.call(host.querySelectorAll('[data-corregir]')).forEach(function(b){
      b.addEventListener('click', function(){ abrirCorreccion(b); });
    });
  }

  // Corregir un nombre mal escrito: solo mientras el mes no emitio nada.
  function abrirCorreccion(b){
    var fila = b.closest('.it');
    if(!fila || fila.querySelector('.corrige')) return;
    var orden = b.getAttribute('data-corregir');
    var caja = document.createElement('div');
    caja.className = 'corrige';
    caja.style.cssText = 'flex-basis:100%;display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    caja.innerHTML =
      '<label class="campo" style="flex:1;min-width:200px;margin:0"><span style="display:block;font-size:13px;font-weight:600;margin-bottom:5px">Nombre correcto del condominio</span>' +
      '<input type="text" maxlength="100" value="' + esc(b.getAttribute('data-nombre')) + '"></label>' +
      '<button type="button" class="btn btn-p btn-sm">Guardar</button>' +
      '<button type="button" class="btn btn-s btn-sm">Cancelar</button>' +
      '<div class="msg" role="status" style="flex-basis:100%"></div>';
    fila.appendChild(caja);
    var input = caja.querySelector('input'), bts = caja.querySelectorAll('button'), m = caja.querySelector('.msg');
    input.focus();
    bts[1].addEventListener('click', function(){ caja.remove(); });
    bts[0].addEventListener('click', function(){
      bts[0].disabled = true; bts[0].textContent = 'Guardando…';
      Cuenta.pase.corregir(orden, input.value, function(err){
        bts[0].disabled = false; bts[0].textContent = 'Guardar';
        if(err){ m.className = 'msg err'; m.textContent = err; return; }
        pintarMeses();
        pintarPagos();
      });
    });
  }

  function prepararActivar(){
    var caja = $('p-activar');
    if(!caja) return;               // vitrina: el Worker borro la caja
    var ah = $('p-mes-acepta');
    if(ah && !ah.innerHTML) ah.innerHTML = Cuenta.terminos.html('p-acepta-mes');
    var campo = $('p-mes-condo');
    var m = /[?&]activar=([^&#]+)/.exec(location.search);
    if(m && campo && !campo.value){
      try { campo.value = decodeURIComponent(m[1].replace(/\+/g, ' ')).slice(0, 100); } catch(e){}
    }
    var b = $('p-mes-pagar');
    b.addEventListener('click', function(){
      var nombre = String(campo.value || '').replace(/\s+/g, ' ').trim();
      if(nombre.length < 2 || !Cuenta.pase.clave(nombre)){
        mesMsg('p-mes-pago-msg', 'Escriba el nombre del condominio para el que es el mes.', true);
        campo.focus();
        return;
      }
      if(!Cuenta.terminos.aceptados('p-acepta-mes')){
        mesMsg('p-mes-pago-msg', Cuenta.terminos.AVISO, true);
        var c = $('p-acepta-mes'); if(c) c.focus();
        return;
      }
      var t = b.textContent;
      b.disabled = true; b.textContent = 'Conectando…';
      mesMsg('p-mes-pago-msg', '');
      Cuenta.pase.pagar(nombre, function(err){
        b.disabled = false; b.textContent = t;
        mesMsg('p-mes-pago-msg', err.texto, !err.demo);
        if(err.demo){ pintarMeses(); pintarPagos(); }
        if(err.sesion) pedirSesion();
      });
    });
  }

  // Sin sesion no hay pago: el Worker ata la orden a la cuenta. Se abre el
  // cajon para entrar y, ya dentro, el panel se vuelve a pintar.
  function pedirSesion(){
    Cuenta.abrirCajon({ alEntrar: function(){ location.reload(); } });
  }

  // Vuelta desde la pasarela: /cuenta?pago=AV-XXXX. La orden se quita de la
  // direccion recien con una respuesta definitiva; antes, recargar -que es
  // lo que pide el mensaje de espera- tiene que volver a intentarlo.
  function retornoDePago(){
    var m = /[?&]pago=(AV-[A-Z0-9]+)/.exec(location.search);
    if(!m) return;
    var olvidarOrden = function(){ try { history.replaceState(null, '', location.pathname); } catch(e){} };
    var sec = $('s-mes'); if(sec && sec.scrollIntoView) sec.scrollIntoView();
    mesMsg('p-mes-msg', 'Confirmando el pago…');
    Cuenta.pase.confirmar(m[1], function(r){
      if(r.listo){
        olvidarOrden();
        var host = $('p-mes-msg');
        var v = volverA();
        try { sessionStorage.removeItem(VOLVER); } catch(e){}
        host.className = 'msg ok';
        host.innerHTML = 'Listo: su mes para <b>' + esc(r.condominio || 'su condominio') + '</b> está activo hasta el ' +
          esc(Cuenta.pase.fecha(r.hasta)) + '.' +
          (v ? ' <a class="btn btn-p btn-sm" style="margin-left:8px" href="' + esc(v) + '">Volver a lo que estaba haciendo</a>' : '');
        pintarMeses();
        pintarPagos();
        return;
      }
      if(r.definitivo) olvidarOrden();
      mesMsg('p-mes-msg', r.texto, true);
      if(r.sesion) pedirSesion();
    });
  }

  Cuenta.montarNav('nav-cuenta');

  Cuenta.usuario(function(u){
    if(!u){
      $('v-entrar').hidden = false;
      Cuenta.abrirCajon({ alEntrar: function(){ location.reload(); } });
      $('cta-abre').addEventListener('click', function(){
        Cuenta.abrirCajon({ alEntrar: function(){ location.reload(); } });
      });
      return;
    }

    $('v-panel').hidden = false;
    // Si no sabemos como se llama, se saluda sin nombre y se le ofrece
    // completarlo. Inventarlo a partir del correo daba resultados absurdos.
    var pila = (u.nombre || '').split(/\s+/)[0];
    $('p-saludo').textContent = pila ? saludo() + ', ' + pila : saludo();
    if (!u.nombre) {
      $('p-pie-saludo').innerHTML =
        'Elija qué quiere hacer, o retome lo que dejó a medias. ' +
        '<a href="#s-cuenta">Agregue su nombre</a> para que le saludemos como corresponde.';
    }
    $('p-correo').textContent = u.correo;
    $('p-mini-correo').textContent = u.correo;
    $('p-nombre-txt').textContent = u.nombre || 'Sin nombre todavía';
    // la inicial del nombre dice mas que la del correo
    $('p-inicial').textContent = ((u.nombre || u.correo || '?').trim() || '?').charAt(0);

    $('p-salir').addEventListener('click', function(){
      var b = this; b.disabled = true; b.textContent = 'Saliendo…';
      Cuenta.salir(function(){ location.href = '/'; });
    });

    $('p-nombre').value = u.nombre || '';
    $('p-guardar-nombre').addEventListener('click', function(){
      var b = this, m = $('p-nombre-msg');
      m.className = 'msg'; m.textContent = '';
      b.disabled = true; b.textContent = 'Guardando…';
      Cuenta.guardarNombre($('p-nombre').value, function(err){
        b.disabled = false; b.textContent = 'Guardar mi nombre';
        m.className = 'msg ' + (err ? 'err' : 'ok');
        m.textContent = err || 'Listo.';
        if(!err){
          var pila = $('p-nombre').value.trim().split(/\s+/)[0];
          $('p-saludo').textContent = saludo() + ', ' + pila;
          $('p-pie-saludo').textContent = 'Elija qué quiere hacer, o retome lo que dejó a medias.';
          $('p-nombre-txt').textContent = $('p-nombre').value.trim();
          $('p-inicial').textContent = pila.charAt(0);
          // El chip de la cabecera lo repinta cuenta.js: es suyo, y así
          // también se actualiza el nombre, no solo la inicial.
        }
      });
    });

    // La clave actual se pide salvo que la persona acabe de probar que es
    // duena del correo (enlace de recuperacion o codigo): cuenta.js lo decide
    // y aqui solo se muestra u oculta el campo.
    var cajaActual = $('p-clave-actual-caja');
    Cuenta.pideClaveActual(function(pide){ if(cajaActual) cajaActual.hidden = !pide; });

    $('p-guardar-clave').addEventListener('click', function(){
      var b = this, m = $('p-clave-msg'), clave = $('p-clave').value;
      var actual = $('p-clave-actual') ? $('p-clave-actual').value : '';
      m.className = 'msg'; m.textContent = '';
      b.disabled = true; b.textContent = 'Guardando…';
      Cuenta.cambiarClave(clave, function(err){
        b.disabled = false; b.textContent = 'Guardar la clave';
        if(err === 'FALTA_CLAVE_ACTUAL'){
          // Pudo vencer el plazo desde que se pinto el panel: el campo
          // aparece recien ahora.
          if(cajaActual) cajaActual.hidden = false;
          m.className = 'msg err';
          m.textContent = 'Escriba su clave actual.';
          if($('p-clave-actual')) $('p-clave-actual').focus();
          return;
        }
        m.className = 'msg ' + (err ? 'err' : 'ok');
        m.textContent = err === 'CLAVE_FILTRADA'
          ? 'Le sugerimos otra: combine letras, números y símbolos.'
          : (err || 'Listo. La próxima vez puede entrar con su correo y esta clave.');
        if(!err){
          $('p-clave').value = '';
          if($('p-clave-actual')) $('p-clave-actual').value = '';
          Cuenta.pideClaveActual(function(pide){ if(cajaActual) cajaActual.hidden = !pide; });
        }
      }, actual);
    });

    // Vuelta desde el enlace para recuperar la clave (/cuenta?recuperar=1):
    // la persona viene a poner una nueva, asi que se la lleva a ese campo.
    if(/[?&]recuperar=1/.test(location.search)){
      // Se quita solo 'recuperar': si la direccion trae tambien ?pago=, esa
      // orden la necesita retornoDePago() mas abajo.
      try {
        var sp = new URLSearchParams(location.search); sp.delete('recuperar');
        var q = sp.toString();
        history.replaceState(null, '', location.pathname + (q ? '?' + q : ''));
      } catch(e){}
      var sc = $('s-cuenta'); if(sc && sc.scrollIntoView) sc.scrollIntoView();
      var mc = $('p-clave-msg');
      if(mc){ mc.className = 'msg ok'; mc.textContent = 'Escriba su clave nueva y guárdela.'; }
      if($('p-clave')) $('p-clave').focus();
    }

    marcarRail();
    anotarVolver();
    pintarMeses();
    pintarRevision();
    pintarPrueba();
    prepararActivar();
    retornoDePago();
    pintarActas();
    pintarComite();
    pintarSala();
    pintarConsultas();
    pintarPagos();
  });

  // ---- rail: marca la sección en pantalla ----
  function marcarRail(){
    var enlaces = {};
    [].slice.call(document.querySelectorAll('#rail-nav a')).forEach(function(a){
      var id = a.getAttribute('href').slice(1);
      enlaces[id] = a;
      a.addEventListener('click', function(){ marcar(id); });
    });
    function marcar(id){
      for(var k in enlaces) enlaces[k].classList.remove('act');
      if(enlaces[id]) enlaces[id].classList.add('act');
    }
    if(!('IntersectionObserver' in window)) return;
    var obs = new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting && enlaces[e.target.id]) marcar(e.target.id); });
    }, { rootMargin: '-86px 0px -68% 0px', threshold: 0 });
    [].slice.call(document.querySelectorAll('.seccion')).forEach(function(s){ obs.observe(s); });
  }

  // ---- actas cuyo contenido ya se elimino ----
  // C5: la tarea diaria de conservacion reemplaza el contenido de un acta
  // finalizada hace mas de 180 dias por {"purgado": true, ...}. La fila
  // queda -titulo, fecha y folio-, pero ya no hay nada que abrir: ofrecer
  // «Abrir» llevaba a un formulario vacio con apariencia de acta.
  // Se lee la marca con 'purgado:contenido->purgado' para no bajar el padron
  // de cada acta; si la fila trae el contenido entero (el cliente de la
  // demostracion lo hace), se mira ahi.
  var AVISO_PURGADA = 'Contenido eliminado al cumplirse el plazo de conservación; conserve el archivo que descargó.';
  function purgada(f){
    return !!f && (f.purgado === true ||
      !!(f.contenido && typeof f.contenido === 'object' && f.contenido.purgado === true));
  }

  // ac_mis_actas no trae el contenido, asi que la marca se pide aparte y
  // solo si hay actas finalizadas, que son las unicas que se purgan. Si esa
  // consulta falla se pinta igual, sin la marca: abrir una purgada lo
  // explica el propio asistente, y el listado no puede quedar en blanco.
  function marcarPurgadas(c, filas, cb){
    var m = Object.create(null);
    if(!filas.some(function(a){ return a.folio; })){ cb(m); return; }
    var hecho = false;
    var listo = function(){ if(hecho) return; hecho = true; cb(m); };
    try {
      c.from('actas_guardadas').select('id,purgado:contenido->purgado').then(function(r){
        if(r && !r.error && Array.isArray(r.data)) r.data.forEach(function(f){ if(purgada(f)) m[f.id] = true; });
        listo();
      }, listo);
    } catch(e){ listo(); }
  }

  // ---- actas: las guardadas en la cuenta y el borrador de este equipo ----
  function pintarActas(){
    var host = $('p-actas');
    var borrador = leer('sistema_actas_v2');
    var filaLocal = '';
    if(borrador){
      var nom = (borrador.fields && borrador.fields['condo-nombre']) || '';
      filaLocal =
        '<div class="it">' +
          '<div class="info">' +
            '<b>' + esc(nom || 'Acta sin nombre todavía') + '<span class="pill loc">abierta aquí</span></b>' +
            '<span>' + (borrador.savedAt ? 'Guardada el ' + esc(fechaCorta(borrador.savedAt)) : 'Borrador del navegador') + '</span>' +
          '</div>' +
          '<div class="acc">' +
            '<a class="btn btn-p btn-sm" href="/acta">Retomar</a>' +
            '<button type="button" class="btn btn-d btn-sm" id="p-borra-local">Borrar</button>' +
          '</div>' +
        '</div>';
    }

    var c = Cuenta.cliente();
    if(!c){ pintar(noDisponible('actas guardadas')); return; }

    c.rpc('ac_mis_actas').then(function(r){
      if(r.error){ pintar(fallo(r.error, 'actas guardadas'), true); return; }
      var filas = r.data || [];
      marcarPurgadas(c, filas, function(purgadas){
        pintar(filas.map(function(a){ return filaActa(a, !!(a.folio && purgadas[a.id])); }).join(''));
      });
    }, function(e){ pintar(fallo(e, 'actas guardadas'), true); });

    // Una purgada conserva su folio y su borrado, pero no «Abrir». Tampoco
    // dice «Actualizada el»: esa fecha es la de la purga, no un cambio suyo.
    function filaActa(a, sinContenido){
      var sello = a.folio
        ? '<span class="pill ok">' + esc(a.folio) + '</span>'
        : '<span class="pill esp">borrador</span>';
      return '<div class="it" data-id="' + esc(a.id) + '">' +
        '<div class="info">' +
          '<b>' + esc(a.titulo || 'Acta sin nombre') + sello + '</b>' +
          '<span>' + (a.fecha_sesion ? 'Sesión del ' + esc(fecha(a.fecha_sesion)) + ' · ' : '') +
          (sinContenido
            ? 'Finalizada · ' + esc(AVISO_PURGADA)
            : (a.folio ? 'Finalizada' : 'Sin finalizar') + ' · Actualizada el ' + esc(fechaCorta(a.actualizada))) + '</span>' +
        '</div>' +
        '<div class="acc">' +
          (sinContenido ? '' : '<a class="btn btn-p btn-sm" href="/acta?acta=' + encodeURIComponent(a.id) + '">Abrir</a>') +
          '<button type="button" class="btn btn-d btn-sm" data-borrar="' + esc(a.id) + '">Borrar</button>' +
        '</div>' +
      '</div>';
    }

    function pintar(guardadas, esAviso){
      var cuerpo = filaLocal + (esAviso ? '' : guardadas);
      if(!cuerpo){
        host.innerHTML = vacio('Todavía no tiene actas',
          'Empiece una: el asistente le va preguntando lo que la ley pide.',
          { href:'/acta', txt:'Comenzar mi acta' });
      } else {
        host.innerHTML = lista(cuerpo) + (esAviso ? '<div style="margin-top:12px">' + guardadas + '</div>' : '');
      }
      enganchar();
    }

    function enganchar(){
      var bl = $('p-borra-local');
      if(bl) bl.addEventListener('click', function(){
        if(!confirm('¿Borrar el borrador guardado en este equipo?\n\nNo se puede deshacer.')) return;
        try { localStorage.removeItem('sistema_actas_v2'); } catch(e){}
        pintarActas();
      });
      [].slice.call(host.querySelectorAll('[data-borrar]')).forEach(function(b){
        b.addEventListener('click', function(){
          var id = b.getAttribute('data-borrar');
          if(!confirm('¿Borrar esta acta de su cuenta?\n\nSe elimina de nuestros servidores y no se puede deshacer.')) return;
          b.disabled = true; b.textContent = 'Borrando…';
          Cuenta.cliente().from('actas_guardadas').delete().eq('id', id).then(function(r){
            if(r.error){ b.disabled = false; b.textContent = 'Borrar'; alert('No pudimos borrarla. Intente de nuevo.'); return; }
            pintarActas();
          });
        });
      });
    }
  }

  // ---- actas del comité ----
  // No tiene RPC de listado: la tabla se consulta
  // directo, con RLS de por medio (cada quien ve solo lo suyo). La app en
  // /acta-comite retoma sola la más reciente SIN cerrar; por eso el botón de
  // un borrador dice «Continuar» sin llevar id. Un acta cerrada no se puede
  // reabrir —a propósito: es un documento numerado—, así que su única acción
  // aquí es borrarla.
  function pintarComite(){
    var host = $('p-comite');
    var c = Cuenta.cliente();
    if(!c){ host.innerHTML = noDisponible('actas del comité'); return; }

    // La purga de C5 alcanza tambien a las actas del comite: se pide la
    // marca, no el contenido.
    c.from('actas_comite')
      .select('id,condominio,fecha_reunion,folio,actualizada,purgado:contenido->purgado')
      .order('fecha_reunion', { ascending: false, nullsFirst: false })
      .then(function(r){
        if(r.error){ host.innerHTML = fallo(r.error, 'actas del comité'); return; }
        var l = r.data || [];
        if(!l.length){
          host.innerHTML = vacio('El comité aún no tiene actas',
            'Escriba la de su próxima reunión y quedará numerada al cerrarla.',
            { href:'/acta-comite', txt:'Registrar los primeros acuerdos' });
          return;
        }
        host.innerHTML = lista(l.map(function(a){
          var sinContenido = purgada(a);
          var sello = a.folio
            ? '<span class="pill ok">' + esc(a.folio) + '</span>'
            : '<span class="pill esp">borrador</span>';
          // /acta-comite no retoma una purgada: «Continuar» abriria otra
          // en blanco.
          var accion = (a.folio || sinContenido)
            ? ''
            : '<a class="btn btn-p btn-sm" href="/acta-comite">Continuar</a>';
          return '<div class="it">' +
            '<div class="info">' +
              '<b>' + esc(a.condominio || 'Acta sin condominio') + sello + '</b>' +
              '<span>' + (a.fecha_reunion ? 'Reunión del ' + esc(fecha(a.fecha_reunion)) + ' · ' : '') +
              (sinContenido
                ? (a.folio ? 'Cerrada · ' : '') + esc(AVISO_PURGADA)
                : (a.folio ? 'Cerrada' : 'Sin cerrar') + ' · Actualizada el ' + esc(fechaCorta(a.actualizada))) + '</span>' +
            '</div>' +
            '<div class="acc">' + accion +
              '<button type="button" class="btn btn-d btn-sm" data-borrar-comite="' + esc(a.id) + '">Borrar</button>' +
            '</div>' +
          '</div>';
        }).join(''));

        [].slice.call(host.querySelectorAll('[data-borrar-comite]')).forEach(function(b){
          b.addEventListener('click', function(){
            var id = b.getAttribute('data-borrar-comite');
            if(!confirm('¿Borrar esta acta del comité?\n\nSe elimina de nuestros servidores y no se puede deshacer.')) return;
            b.disabled = true; b.textContent = 'Borrando…';
            Cuenta.cliente().from('actas_comite').delete().eq('id', id).then(function(r2){
              if(r2.error){ b.disabled = false; b.textContent = 'Borrar'; alert('No pudimos borrarla. Intente de nuevo.'); return; }
              pintarComite();
            });
          });
        });
      }, function(e){ host.innerHTML = fallo(e, 'actas del comité'); });
  }

  // ---- sala abierta ----
  function pintarSala(){
    var host = $('p-sala');
    var s = leer('acta_sala');
    if(!(s && s.t && (Date.now() - s.t) < 48*60*60*1000)){
      host.innerHTML = vacio('No hay una sala abierta', 'Se abre desde el paso 5 del acta, con la asamblea reunida.');
      return;
    }
    var restan = Math.max(0, Math.round((48*60*60*1000 - (Date.now() - s.t)) / 3600000));
    host.innerHTML = lista(
      '<div class="it">' +
        '<div class="info">' +
          '<b>Sala ' + esc(s.codigo || '—') + '<span class="pill ok">abierta</span></b>' +
          '<span>Se borra sola en unas ' + restan + ' horas.</span>' +
        '</div>' +
        '<div class="acc"><a class="btn btn-p btn-sm" href="/acta">Volver a la sala</a></div>' +
      '</div>');
  }

  // ---- consultas ----
  function pintarConsultas(){
    var host = $('p-consultas');
    var c = Cuenta.cliente();
    if(!c){ host.innerHTML = noDisponible('consultas'); return; }
    c.rpc('cc_mis_consultas').then(function(r){
      if(r.error){ host.innerHTML = fallo(r.error, 'consultas'); return; }
      var l = r.data || [];
      if(!l.length){
        host.innerHTML = vacio('Su cuenta no tiene consultas',
          'Sirve para acordar sin reunir a todos a votar. La ley igual exige una '
          + 'sesión informativa previa y un plazo para responder.',
          { href:'/consulta/', txt:'Crear una consulta' });
        return;
      }
      host.innerHTML = lista(l.map(function(x){
        var e = x.cerrada ? '<span class="pill n">cerrada</span>'
                          : '<span class="pill esp">vence ' + esc(fecha(x.plazo_fin)) + '</span>';
        return '<div class="it"><div class="info">' +
          '<b>' + esc(x.condominio || 'Sin condominio') + e + '</b>' +
          '<span>Código ' + esc(x.codigo) + '</span></div>' +
          '<div class="acc"><a class="btn btn-s btn-sm" href="/consulta/">Abrir</a></div></div>';
      }).join(''));
    }, function(e){ host.innerHTML = fallo(e, 'consultas'); });
  }

  // ---- pagos: un mes por fila ----
  function pintarPagos(){
    var host = $('p-pagos');
    var c = Cuenta.cliente();
    if(!c){ host.innerHTML = noDisponible('pagos'); return; }
    c.rpc('pase_mis_meses').then(function(r){
      if(r.error){ host.innerHTML = fallo(r.error, 'pagos'); return; }
      var l = r.data || [];
      if(!l.length){
        host.innerHTML = vacio('Todavía no hay pagos',
          'Cada pago queda aquí, con su número de orden y el mes que cubre. El comprobante de Flow le llega por correo.');
        return;
      }
      host.innerHTML = lista(l.map(function(x){
        return '<div class="it"><div class="info">' +
          '<b>' + esc(x.condominio || 'Condominio') + '<span class="pill n">' + esc(x.orden) + '</span></b>' +
          '<span>Pagado el ' + esc(fecha(x.pagado_en)) + ' · cubre del ' + esc(fecha(x.desde)) + ' al ' + esc(fecha(x.hasta)) + '</span>' +
          '</div></div>';
      }).join(''));
    }, function(e){ host.innerHTML = fallo(e, 'pagos'); });
  }
})();
