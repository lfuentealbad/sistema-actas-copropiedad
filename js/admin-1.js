// Panel de administración (paso 22, 19-10-2026). Solo pinta: quién ve qué
// lo decide la base (admin_resumen / admin_cuentas exigen revisor y aal2).
(function(){
  'use strict';
  var $ = function(id){ return document.getElementById(id); };

  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function fecha(v){
    var d = new Date(v);
    return !v || isNaN(d) ? '' : d.toLocaleDateString('es-CL', { day:'2-digit', month:'short', year:'numeric' });
  }
  function haceCuanto(v){
    if(!v) return 'nunca';
    var dias = Math.floor((Date.now() - new Date(v).getTime()) / 86400000);
    if(isNaN(dias)) return '';
    if(dias <= 0) return 'hoy';
    if(dias === 1) return 'ayer';
    if(dias < 30) return 'hace ' + dias + ' días';
    return fecha(v);
  }
  function num(n){ return Number(n || 0).toLocaleString('es-CL'); }

  // Acceso -----------------------------------------------------------------
  function acceso(html){
    $('a-datos').hidden = true;
    $('a-recargar').hidden = true;
    $('a-acceso').hidden = false;
    $('a-acceso').innerHTML = html;
    $('a-hora').textContent = 'Acceso restringido.';
  }

  function empezar(){
    var c = Cuenta.cliente();
    if(!c){ acceso('<p>No hay conexión con el servicio. Recargue la página.</p>'); return; }
    Cuenta.usuario(function(u){
      if(!u){
        acceso('<p>Entre con la cuenta de administración para continuar.</p>');
        // Aqui nadie crea cuentas: el cajon abre en «Entrar».
        Cuenta.abrirCajon({ modo: 'entrar', titulo: 'Entre para continuar', sub: 'Esta página es para la administración del servicio.',
          bloqueante: true, alEntrar: function(){ empezar(); } });
        return;
      }
      // CN-001: la lista de cuentas no puede quedar a la vista de otra sesion.
      if(Cuenta.vigilarSesion) Cuenta.vigilarSesion(u.id);
      c.rpc('revisor_estado').then(function(r){
        var e = r && !r.error ? r.data : null;
        if(e === 'ok') return cargar();
        if(e === 'falta_codigo') return pedirCodigo();
        if(e === 'sin_factor'){
          acceso('<p>Para entrar aquí, primero active la verificación en dos pasos desde su panel, en «Mi servicio».</p>' +
            '<a class="btn btn-p" href="/cuenta#s-mes">Ir a mi panel</a>');
          return;
        }
        acceso('<p>Esta página es solo para la administración del servicio.</p><a class="btn btn-s" href="/cuenta">Volver a mi panel</a>');
      });
    });
  }

  function pedirCodigo(){
    acceso('<p>Escriba el código de 6 cifras que muestra su app de autenticación.</p>' +
      '<div class="campo"><label for="a-codigo">Código de la app</label>' +
      '<input type="text" id="a-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*"></div>' +
      '<button type="button" class="btn btn-p" id="a-verificar">Verificar</button>' +
      '<div id="a-msg" class="msg" role="status" aria-live="polite"></div>');
    var enviar = function(){
      var codigo = ($('a-codigo').value || '').replace(/\s/g, '');
      var m = $('a-msg');
      if(!/^[0-9]{6}$/.test(codigo)){ m.className = 'msg err'; m.textContent = 'Escriba las 6 cifras del código.'; return; }
      var b = $('a-verificar'), c = Cuenta.cliente();
      b.disabled = true;
      c.auth.mfa.listFactors().then(function(r){
        var fac = r && !r.error && r.data && r.data.totp && r.data.totp[0];
        if(!fac) return empezar();
        return c.auth.mfa.challengeAndVerify({ factorId: fac.id, code: codigo }).then(function(v){
          b.disabled = false;
          if(v && v.error){
            m.className = 'msg err';
            m.textContent = 'El código no coincide. Escriba el que muestra la app ahora.';
            return;
          }
          empezar();
        });
      });
    };
    $('a-verificar').addEventListener('click', enviar);
    $('a-codigo').addEventListener('keydown', function(ev){ if(ev.key === 'Enter') enviar(); });
    $('a-codigo').focus();
  }

  // Datos ------------------------------------------------------------------
  var CUENTAS = [];

  function cargar(){
    var c = Cuenta.cliente();
    $('a-hora').textContent = 'Consultando…';
    Promise.all([c.rpc('admin_resumen'), c.rpc('admin_cuentas')]).then(function(rs){
      var falla = rs.filter(function(r){ return !r || r.error; })[0];
      if(falla){
        if(/segundo_factor|no_autorizado/.test(String(falla.error && falla.error.message))) return empezar();
        acceso('<p>No pudimos cargar los datos. Recargue la página.</p>');
        return;
      }
      $('a-acceso').hidden = true;
      $('a-datos').hidden = false;
      $('a-recargar').hidden = false;
      pintarResumen(rs[0].data || {});
      CUENTAS = rs[1].data || [];
      pintarCuentas();
      $('a-hora').textContent = 'Datos al ' + new Date().toLocaleString('es-CL', { day:'2-digit', month:'long', hour:'2-digit', minute:'2-digit' }) + '.';
    });
  }

  function cifra(et, n, d, alerta, enlace){
    return '<div class="cifra' + (alerta ? ' alerta' : '') + '"><div class="et">' + esc(et) + '</div>' +
      '<div class="n">' + num(n) + '</div><div class="d">' + d + '</div>' +
      (enlace ? '<a href="' + enlace.href + '">' + esc(enlace.txt) + '</a>' : '') + '</div>';
  }

  function pintarResumen(d){
    var cu = d.cuentas || {}, so = d.solicitudes || {}, me = d.meses || {}, ac = d.actas || {}, vo = d.votacion || {}, co = d.consultas || {};
    $('a-cifras').innerHTML = [
      cifra('Cuentas', cu.total, num(cu.nuevas_7) + ' nuevas en 7 días · ' + num(cu.nuevas_30) + ' en 30<br>' + num(cu.total - cu.confirmadas) + ' sin confirmar el correo'),
      cifra('Activas', cu.activas_7, 'entraron en los últimos 7 días<br>' + num(cu.activas_30) + ' en los últimos 30'),
      cifra('Solicitudes pendientes', so.pendientes, num(so.aprobadas) + ' aprobadas · ' + num(so.rechazadas) + ' rechazadas',
        so.pendientes > 0, so.pendientes > 0 ? { href: '/cuenta#s-mes', txt: 'Revisarlas en mi panel' } : null),
      cifra('Meses vigentes', me.vigentes, num(me.vigentes_prueba) + ' de prueba · ' + num(me.vigentes - me.vigentes_prueba) + ' pagados<br>' + num(me.vencen_7) + ' vencen en 7 días', me.vencen_7 > 0),
      cifra('Meses activados', (me.pagados_total || 0) + (me.prueba_total || 0), num(me.pagados_total) + ' pagados · ' + num(me.prueba_total) + ' de prueba, desde el inicio'),
      cifra('Actas emitidas', ac.emitidas, num(ac.emitidas_30) + ' en los últimos 30 días<br>' + num(ac.en_curso) + ' en curso · ' + num(ac.comite) + ' actas de comité'),
      cifra('Salas de votación', vo.salas, num(vo.salas_30) + ' abiertas en 30 días<br>' + num(vo.votos) + ' votos registrados'),
      cifra('Consultas por escrito', co.total, num(co.abiertas) + ' con plazo abierto')
    ].join('');
    $('a-semanas').innerHTML = (d.semanas || []).map(function(s){
      return '<tr><td>' + esc(fecha(s.semana)) + '</td><td class="num">' + num(s.cuentas) + '</td><td class="num">' + num(s.solicitudes) +
        '</td><td class="num">' + num(s.actas) + '</td></tr>';
    }).join('');
  }

  var SOLICITUD = { pendiente: '<span class="et-esp">Pendiente</span>', aprobada: '<span class="et-ok">Aprobada</span>', rechazada: '<span class="et-n">Rechazada</span>' };

  function pintarCuentas(){
    var q = ($('a-buscar').value || '').trim().toLowerCase();
    var filas = CUENTAS.filter(function(x){
      if(!q) return true;
      var condos = (x.meses || []).map(function(m){ return m.condominio; }).join(' ');
      return (String(x.correo) + ' ' + String(x.nombre || '') + ' ' + condos).toLowerCase().indexOf(q) >= 0;
    });
    $('a-cuenta-n').textContent = filas.length === CUENTAS.length ? num(CUENTAS.length) + ' cuentas' : num(filas.length) + ' de ' + num(CUENTAS.length);
    $('a-cuentas').innerHTML = filas.length ? filas.map(function(x){
      var meses = (x.meses || []).map(function(m){
        return esc(m.condominio) + '<span class="sec">hasta el ' + esc(fecha(m.hasta)) + (m.prueba ? ' · prueba' : ' · pagado') + '</span>';
      }).join('') || '<span class="et-n">—</span>';
      return '<tr><td><a href="mailto:' + esc(x.correo) + '">' + esc(x.correo) + '</a>' +
        '<span class="sec">' + esc(x.nombre || 'Sin nombre') + (x.confirmada ? '' : ' · <span class="et-esp">sin confirmar</span>') + '</span></td>' +
        '<td>' + esc(fecha(x.creada)) + '</td><td>' + esc(haceCuanto(x.ultimo_ingreso)) + '</td>' +
        '<td>' + meses + '</td><td class="num">' + num(x.actas) + '</td>' +
        '<td>' + (SOLICITUD[x.solicitud] || '<span class="et-n">—</span>') + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="vacio">Ninguna cuenta coincide con la búsqueda.</td></tr>';
  }

  $('a-buscar').addEventListener('input', pintarCuentas);
  $('a-recargar').addEventListener('click', cargar);
  empezar();
})();
