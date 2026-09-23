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
  //  El pago, que ahora es el primer paso
  // -------------------------------------------------------------------
  //  La llave que devuelve la pasarela cubre TODA la asamblea: el acta, la
  //  sala de votacion y la consulta por escrito. Por eso basta pedirla una
  //  vez, aqui, y las dos ramas quedan abiertas.
  //  Dos llaves, porque son dos servicios: la del acta cubre tambien su sala
  //  de votacion; la de la consulta abre una consulta y nada mas.
  var LLAVE_PAGO = 'acta_pago_llave';
  var LLAVE_CONSULTA = 'consulta_pago_llave';
  // Ver la nota en acta-1.js y sinPagos() mas abajo: la marca que dejaba la
  // demostracion no es un pago. Sin esto, quien habia visitado /acta-demo o
  // /consulta/demo veia aqui «Comenzar mi acta» y «Crear consulta» como si
  // hubiera pagado, y el acta recien le pedia el pago al entrar.
  function guardado(k){
    var v = '';
    try { v = localStorage.getItem(k) || ''; } catch(e){ return ''; }
    return (v === 'DEMO-PAGO-SIMULADO' &&
      !/(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname)) ? '' : v;
  }
  function llavePago(){ return guardado(LLAVE_PAGO); }
  function llaveConsulta(){ return guardado(LLAVE_CONSULTA); }

  function pagoMsg(txt, malo, cual){
    var m = $(cual === 'consulta' ? 'p-pago-consulta-msg' : 'p-pago-msg');
    if(!m) return;
    m.hidden = !txt;
    m.className = 'msg ' + (malo ? 'err' : 'ok');
    m.textContent = txt || '';
  }

  function pintarServicios(){
    var pagado = !!llavePago();
    var host = $('p-cta-acta');
    if(host){
      host.innerHTML = pagado
        ? '<a class="btn btn-p" href="/acta">Comenzar mi acta</a>'
        : Cuenta.terminos.html('p-acepta-acta') +
          '<button type="button" class="btn btn-p" id="p-pagar">Pagar y comenzar</button>';
      var b = $('p-pagar');
      if(b) b.addEventListener('click', function(){ irAPagar(this, 'acta', 'p-acepta-acta'); });
    }

    var nota = $('p-ramas-nota');
    if(nota) nota.textContent = pagado ? '— va incluida' : '— va incluida en el pago del acta';

    [].slice.call(document.querySelectorAll('.rama-cta')).forEach(function(sp){
      sp.innerHTML = pagado
        ? '<a class="btn btn-s" href="' + sp.getAttribute('data-href') + '">' +
            esc(sp.getAttribute('data-txt')) + '</a>'
        : '<span class="muted" style="font-size:13px">Se habilita al pagar</span>';
    });

    // La consulta va por su cuenta.
    var hostC = $('p-cta-consulta');
    if(hostC){
      hostC.innerHTML = llaveConsulta()
        ? '<a class="btn btn-p" href="/consulta/">Crear consulta</a>'
        : Cuenta.terminos.html('p-acepta-consulta') +
          '<button type="button" class="btn btn-p" id="p-pagar-consulta">Pagar y crear consulta</button>';
      var bc = $('p-pagar-consulta');
      if(bc) bc.addEventListener('click', function(){ irAPagar(this, 'consulta', 'p-acepta-consulta'); });
    }
  }

  // La URL de la pasarela la arma el Worker con lo que contesta Flow. Antes
  // de mandar a la persona a pagar se comprueba que de verdad sea Flow: si
  // algun dia llegara otra cosa, no se sigue.
  function esPasarela(u){
    return typeof u === 'string' && /^https:\/\/(www|sandbox)\.flow\.cl\//.test(u);
  }

  // Sin sesion no hay pago: el Worker ata la orden a la cuenta. Se abre el
  // cajon para entrar y, ya dentro, el panel se vuelve a pintar.
  function pedirSesion(){
    Cuenta.abrirCajon({ alEntrar: function(){ location.reload(); } });
  }

  function irAPagar(btn, producto, idCasilla){
    producto = producto || 'acta';
    if(idCasilla && !Cuenta.terminos.aceptados(idCasilla)){
      pagoMsg(Cuenta.terminos.AVISO, true, producto);
      var c = $(idCasilla); if(c) c.focus();
      return;
    }
    btn.disabled = true; var t = btn.textContent; btn.textContent = 'Conectando…';
    pagoMsg('', false, producto);
    var correo = ($('p-correo') && $('p-correo').textContent) || '';
    Cuenta.tokenDeAcceso().then(function(token){
      if(!token){
        pagoMsg('Su sesión terminó. Vuelva a entrar para pagar.', true, producto);
        btn.disabled = false; btn.textContent = t;
        pedirSesion();
        return;
      }
      return fetch('/api/pago/crear', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + token },
        body: JSON.stringify({ correo: correo, producto: producto, acepta: Cuenta.terminos.VERSION })
      }).then(function(r){ return r.json().catch(function(){ return null; }).then(function(d){ return { ok: r.ok, estado: r.status, d: d }; }); })
        .then(function(x){
          if(!x.ok || !x.d || !esPasarela(x.d.redirigir)){
            var sinSesion = x.estado === 401;
            pagoMsg(sinSesion
              ? 'Su sesión terminó. Vuelva a entrar para pagar.'
              : x.d && x.d.error === 'pasarela_no_configurada'
                ? 'El pago en línea todavía no está habilitado. Escríbanos a contacto@actascopropiedad.cl.'
                : 'No pudimos iniciar el pago. Inténtelo nuevamente en unos minutos.', true, producto);
            btn.disabled = false; btn.textContent = t;
            if(sinSesion) pedirSesion();
            return;
          }
          location.href = x.d.redirigir;
        });
    }).then(null, function(){
      pagoMsg('No pudimos conectar con el medio de pago. Revise su conexión.', true, producto);
      btn.disabled = false; btn.textContent = t;
    });
  }

  // Vuelta desde la pasarela: /cuenta?pago=AV-XXXX
  // Corre ya con la sesion abierta: el Worker entrega la llave solo a la
  // cuenta que pidio la orden. La orden se quita de la direccion recien
  // cuando hay una respuesta definitiva; antes, recargar -que es lo que el
  // mensaje de espera recomienda- tiene que volver a intentarlo.
  function retornoDePago(){
    var m = /[?&]pago=(AV-[A-Z0-9]+)/.exec(location.search);
    if(!m) return;
    var orden = m[1], intentos = 0;
    var olvidarOrden = function(){ try { history.replaceState(null, '', location.pathname); } catch(e){} };
    pagoMsg('Confirmando el pago…');
    Cuenta.tokenDeAcceso().then(function(token){
      if(!token){ pagoMsg('Entre a su cuenta para confirmar el pago.', true); return; }
      (function revisar(){
        intentos++;
        fetch('/api/pago/estado?orden=' + encodeURIComponent(orden), {
          headers: { 'authorization': 'Bearer ' + token }
        })
          .then(function(r){ return r.json().then(function(d){ return { estado: r.status, d: d }; }); })
          .then(function(x){
            var d = x.d;
            if(d && d.estado === 'pagado' && d.llave){
              olvidarOrden();
              // La llave se guarda en el casillero del servicio que se pago.
              var esConsulta = d.producto === 'consulta';
              try { localStorage.setItem(esConsulta ? LLAVE_CONSULTA : LLAVE_PAGO, d.llave); } catch(e){}
              pagoMsg(esConsulta
                ? 'Pago confirmado. Ya puede crear su consulta.'
                : 'Pago confirmado. Ya puede comenzar su acta.', false, esConsulta ? 'consulta' : 'acta');
              pintarServicios();
              return;
            }
            // 404: la orden no existe o es de otra cuenta. El Worker no dice
            // cual de las dos, y esperar no la va a hacer aparecer.
            // Se anota el numero en el equipo antes de quitarlo de la
            // direccion: si se pago con otra cuenta, al entrar con ella
            // Cuenta.recuperarPagos lo entrega.
            if(x.estado === 404){
              if(typeof Cuenta.anotarPago === 'function') Cuenta.anotarPago(orden);
              olvidarOrden();
              pagoMsg('No encontramos ese pago en esta cuenta. Si pagó con otra, entre con ella en este equipo y se lo entregaremos.', true);
              return;
            }
            if(x.estado === 401){ pagoMsg('Su sesión terminó. Vuelva a entrar para confirmar el pago.', true); pedirSesion(); return; }
            if(intentos < 10){ setTimeout(revisar, 2000); return; }
            pagoMsg('Todavía no recibimos la confirmación. Si ya pagó, recargue esta página en un momento.', true);
          })
          .catch(function(){
            if(intentos < 10){ setTimeout(revisar, 2000); return; }
            pagoMsg('No pudimos verificar el pago.', true);
          });
      })();
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
    pintarServicios();
    retornoDePago();
    // Si al cerrar sesion quedo un pago sin usar, vuelve a su casillero y los
    // servicios se pintan de nuevo. Sin nada anotado no hace nada.
    Cuenta.recuperarPagos(function(n){ if(n) pintarServicios(); });
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
  // El servicio es gratis y no tiene RPC de listado: la tabla se consulta
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
            'Es gratis: escriba la de su próxima reunión y quedará numerada al cerrarla.',
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
    if(!(s && s.t && (Date.now() - s.t) < 48*60*60*1000)){ host.innerHTML = ''; return; }
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

  // ---- asambleas pagadas ----
  function pintarPagos(){
    var host = $('p-pagos');
    var c = Cuenta.cliente();
    if(!c){ host.innerHTML = noDisponible('pagos'); return; }
    c.rpc('vv_mis_pagos').then(function(r){
      if(r.error){ host.innerHTML = fallo(r.error, 'asambleas'); return; }
      var l = r.data || [];
      if(!l.length){ host.innerHTML = sinPagos(); return; }
      host.innerHTML = lista(l.map(function(x){
        return '<div class="it"><div class="info">' +
          '<b>' + esc(x.titulo || 'Asamblea') +
          (x.activa ? '<span class="pill ok">sala abierta</span>' : '<span class="pill n">finalizada</span>') + '</b>' +
          '<span>Activada el ' + esc(fecha(x.creado)) + '</span></div></div>';
      }).join(''));
    }, function(e){ host.innerHTML = fallo(e, 'asambleas'); });
  }

  function sinPagos(){
    // Ver la nota en acta-1.js. Sin esto, quien solo visito /acta-demo veia
    // aqui "Una asamblea activada - disponible", que no es cierto.
    var llave = '';
    try { llave = localStorage.getItem('acta_pago_llave') || ''; } catch(e){}
    if(llave === 'DEMO-PAGO-SIMULADO' &&
       !/(^|\/)([\w-]+-)?demo(\.html)?\/?$/.test(location.pathname)) llave = '';
    if(llave){
      return lista('<div class="it"><div class="info">' +
        '<b>Una asamblea activada<span class="pill ok">disponible</span></b>' +
        '<span>Guardada en este equipo. Se usa al abrir la sala de votación.</span></div>' +
        '<div class="acc"><a class="btn btn-p btn-sm" href="/acta">Ir al acta</a></div></div>');
    }
    return vacio('Todavía no ha activado ninguna asamblea',
      'Armar el acta está incluido. Solo se paga la votación en vivo, y se paga por asamblea.',
      { href:'/acta', txt:'Comenzar mi acta' });
  }
})();
