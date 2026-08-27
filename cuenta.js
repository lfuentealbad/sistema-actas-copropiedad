// Cuenta del cliente — compartida por el acta y la consulta por escrito.
//
// Principio: la cuenta NO aparece al entrar. Aparece cuando hay algo que
// resguardar, es decir al momento de pagar. Antes de eso la persona arma su
// acta sin que le pidamos nada.
//
// Dos vias, ambas sobre Supabase Auth:
//   - Google, para quien lo tenga (la mayoria de los administradores)
//   - Codigo de 6 digitos al correo, que funciona siempre y no depende de nadie
//
// Se carga como script clasico (el proyecto no tiene empaquetador):
//   <script src="/vendor/supabase.min.js"></script>
//   <script src="/cuenta.js"></script>

(function (global) {
  'use strict';

  var URL_SB  = 'https://rujwokagmjbqtrcvosye.supabase.co';
  var ANON_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1andva2FnbWpicXRyY3Zvc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDgzNzIsImV4cCI6MjA5NzUyNDM3Mn0.E_p3VdfHrMIHy-yq0Uxoz4wEP_pxqVqE64TBWoyVGV0';

  var sb = null;
  function cliente() {
    if (!sb && global.supabase) sb = global.supabase.createClient(URL_SB, ANON_SB);
    return sb;
  }

  var correoValido = function (c) {
    return typeof c === 'string' && c.length <= 160 &&
           /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(c);
  };

  // -------------------------------------------------------------------
  //  Sesion
  // -------------------------------------------------------------------
  // Google entrega el nombre en full_name o name; el registro propio lo
  // guarda en nombre. Se toma el primero que exista.
  function nombreDe(u) {
    var m = (u && u.user_metadata) || {};
    var n = m.nombre || m.full_name || m.name || '';
    return String(n).trim();
  }

  function usuario(cb) {
    var c = cliente();
    if (!c) { cb(null); return; }
    c.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      cb(s && s.user
        ? { id: s.user.id, correo: s.user.email, nombre: nombreDe(s.user) }
        : null);
    }, function () { cb(null); });
  }

  function guardarNombre(nombre, cb) {
    var n = String(nombre || '').trim();
    if (n.length < 2) { cb('Escriba su nombre.'); return; }
    if (n.length > 80) { cb('El nombre es demasiado largo.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.updateUser({ data: { nombre: n } }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos guardar su nombre.')); return; }
      // La cabecera saluda con el nombre: si no se repinta, sigue mostrando
      // el anterior hasta que la persona recargue.
      refrescarNav();
      cb(null);
    }, function () { cb('No pudimos guardar su nombre.'); });
  }

  function salir(cb) {
    var c = cliente();
    if (!c) { if (cb) cb(); return; }
    c.auth.signOut().then(function () { if (cb) cb(); }, function () { if (cb) cb(); });
  }

  // -------------------------------------------------------------------
  //  Entrada
  // -------------------------------------------------------------------
  function conGoogle(destino, cb) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: destino || global.location.href }
    }).then(function (r) {
      if (r && r.error) cb('No pudimos abrir el inicio con Google. Use el código por correo.');
    }, function () {
      cb('No pudimos abrir el inicio con Google. Use el código por correo.');
    });
  }

  var CLAVE_MIN = 8;

  function claveValida(c) {
    return typeof c === 'string' && c.length >= CLAVE_MIN;
  }

  // Traduce los errores de Supabase a algo que una persona entienda.
  function motivo(e, porDefecto) {
    var m = String((e && e.message) || '').toLowerCase();
    if (/already registered|already exists|user already/.test(m))
      return 'Ese correo ya tiene cuenta. Use «Entrar» o recupere su clave.';
    if (/invalid login|invalid credentials/.test(m))
      return 'El correo o la clave no coinciden.';
    if (/email not confirmed|not confirmed/.test(m))
      return 'Falta confirmar su correo. Busque el mensaje que le enviamos.';
    if (/password should be|at least/.test(m))
      return 'La clave debe tener al menos ' + CLAVE_MIN + ' caracteres.';
    if (/rate|seconds|exceed|often|too many/.test(m))
      return 'Demasiados intentos seguidos. Espere un minuto.';
    return porDefecto;
  }

  // -------------------------------------------------------------------
  //  Claves filtradas
  //  Supabase lo trae en el plan Pro. Aqui se hace igual: se calcula el
  //  SHA-1 en el navegador y solo se mandan los 5 primeros caracteres al
  //  Worker, que consulta HaveIBeenPwned. La clave no sale de aqui.
  // -------------------------------------------------------------------
  function sha1Hex(txt) {
    if (!global.crypto || !global.crypto.subtle) return Promise.resolve(null);
    var datos = new TextEncoder().encode(txt);
    return global.crypto.subtle.digest('SHA-1', datos).then(function (buf) {
      var b = new Uint8Array(buf), s = '';
      for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
      return s.toUpperCase();
    }).catch(function () { return null; });
  }

  // cb(filtrada) — ante cualquier duda devuelve false: nunca deja a alguien
  // sin poder registrarse porque el servicio de terceros fallo.
  function claveFiltrada(clave, cb) {
    sha1Hex(String(clave || '')).then(function (h) {
      if (!h) { cb(false); return; }
      var ctrl = new AbortController();
      var reloj = setTimeout(function () { ctrl.abort(); }, 3000);
      fetch('/api/clave/filtrada', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefijo: h.slice(0, 5), sufijo: h.slice(5) }),
        signal: ctrl.signal
      }).then(function (r) { return r.json(); })
        .then(function (d) { clearTimeout(reloj); cb(!!(d && d.filtrada)); })
        .catch(function () { clearTimeout(reloj); cb(false); });
    });
  }

  function crearCuenta(correo, clave, cb, nombre) {
    var n = String(nombre || '').trim();
    if (n.length < 2) { cb('Escriba su nombre.'); return; }
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    if (!claveValida(clave)) { cb('La clave debe tener al menos ' + CLAVE_MIN + ' caracteres.'); return; }
    claveFiltrada(clave, function (mala) {
      if (mala) { cb('CLAVE_FILTRADA'); return; }
      crearCuentaYa(correo, clave, cb, n);
    });
  }

  function crearCuentaYa(correo, clave, cb, n) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signUp({
      email: correo,
      password: clave,
      options: {
        emailRedirectTo: global.location.origin + '/cuenta',
        data: { nombre: n.slice(0, 80) }
      }
    }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos crear la cuenta.')); return; }
      // Si el proyecto exige confirmar el correo, no hay sesion todavia.
      var haySesion = r && r.data && r.data.session;
      cb(null, !haySesion);
    }, function () { cb('No pudimos crear la cuenta. Revise su conexión.'); });
  }

  function entrarConClave(correo, clave, cb) {
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    if (!clave) { cb('Escriba su clave.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signInWithPassword({ email: correo, password: clave }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos entrar. Intente de nuevo.')); return; }
      cb(null);
    }, function () { cb('No pudimos entrar. Revise su conexión.'); });
  }

  function recuperarClave(correo, cb) {
    if (!correoValido(correo)) { cb('Escriba su correo para enviarle el enlace.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.resetPasswordForEmail(correo, {
      redirectTo: global.location.origin + '/cuenta?recuperar=1'
    }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos enviar el enlace.')); return; }
      cb(null);
    }, function () { cb('No pudimos enviar el enlace.'); });
  }

  function cambiarClave(clave, cb) {
    if (!claveValida(clave)) { cb('La clave debe tener al menos ' + CLAVE_MIN + ' caracteres.'); return; }
    claveFiltrada(clave, function (mala) {
      if (mala) { cb('CLAVE_FILTRADA'); return; }
      cambiarClaveYa(clave, cb);
    });
  }

  function cambiarClaveYa(clave, cb) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.updateUser({ password: clave }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos cambiar la clave.')); return; }
      cb(null);
    }, function () { cb('No pudimos cambiar la clave.'); });
  }

  function pedirCodigo(correo, cb) {
    if (!correoValido(correo)) { cb('Revise el correo electrónico.'); return; }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio. Recargue la página.'); return; }
    c.auth.signInWithOtp({ email: correo }).then(function (r) {
      if (r && r.error) {
        var m = String(r.error.message || '');
        cb(/rate|seconds|exceed|often/i.test(m)
          ? 'Demasiados envíos seguidos. Espere un minuto.'
          : 'No pudimos enviar el código a ese correo.');
      } else cb(null);
    }, function () { cb('No pudimos enviar el código. Revise su conexión.'); });
  }

  // tipo: 'email' para entrar con codigo, 'signup' para confirmar una cuenta
  // recien creada. Son dos verificaciones distintas en Supabase.
  function verificarCodigo(correo, codigo, cb, tipo) {
    if (!/^[0-9]{6,8}$/.test(String(codigo || '').trim())) {
      cb('Ingrese el código que llegó a su correo.'); return;
    }
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.verifyOtp({
      email: correo,
      token: String(codigo).trim(),
      type: tipo || 'email'
    }).then(function (r) {
      if (r && r.error) {
        var m = String(r.error.message || '').toLowerCase();
        cb(/expired/.test(m)
          ? 'El código venció. Pida uno nuevo.'
          : 'Código incorrecto. Revise que lo haya copiado completo.');
      } else cb(null);
    }, function () { cb('No pudimos verificar el código.'); });
  }

  // Reenvia el correo de confirmacion de una cuenta recien creada.
  function reenviarConfirmacion(correo, cb) {
    var c = cliente();
    if (!c) { cb('Sin conexión con el servicio.'); return; }
    c.auth.resend({ type: 'signup', email: correo }).then(function (r) {
      if (r && r.error) { cb(motivo(r.error, 'No pudimos reenviar el código.')); return; }
      cb(null);
    }, function () { cb('No pudimos reenviar el código.'); });
  }

  // -------------------------------------------------------------------
  //  Panel de entrada. Se inyecta donde se le indique y avisa por "alEntrar".
  // -------------------------------------------------------------------
  var CSS_ID = 'cuenta-css';
  var CSS =
    '.cta-box{border:1px solid #CFE1F1;border-radius:12px;padding:18px;background:#F7FAFD}' +
    '.cta-box h4{margin:0 0 4px;font-size:16px;color:#1E3A6E;font-weight:700}' +
    '.cta-box p.cta-sub{margin:0 0 14px;font-size:13.5px;color:#5C6168;line-height:1.5}' +
    '.cta-g{width:100%;display:flex;align-items:center;justify-content:center;gap:10px;' +
      'background:#fff;border:1.5px solid #CDD5DF;border-radius:11px;padding:11px 16px;' +
      'font-family:inherit;font-size:15px;font-weight:600;color:#24282D;cursor:pointer;min-height:46px}' +
    '.cta-g:hover{background:#F2F5F9}' +
    '.cta-o{display:flex;align-items:center;gap:10px;margin:14px 0;color:#8B9094;font-size:12.5px;' +
      'text-transform:uppercase;letter-spacing:.6px;font-weight:600}' +
    '.cta-o::before,.cta-o::after{content:"";flex:1;height:1px;background:#DDE5EE}' +
    '.cta-box label{display:block;font-size:13px;font-weight:600;color:#3B4248;margin-bottom:5px}' +
    '.cta-box input{width:100%;box-sizing:border-box;font-family:inherit;font-size:15px;padding:11px 13px;' +
      'border:1.5px solid #CDCFC9;border-radius:11px;min-height:44px;background:#fff}' +
    '.cta-box input:focus{outline:none;border-color:#0B6BB5;box-shadow:0 0 0 4px rgba(11,107,181,.16)}' +
    '.cta-b{width:100%;margin-top:12px;font-family:inherit;font-size:15px;font-weight:600;color:#fff;' +
      'background:#0B6BB5;border:none;border-radius:11px;padding:12px 18px;min-height:46px;cursor:pointer}' +
    '.cta-b:hover{background:#3E93CE} .cta-b:disabled{opacity:.55;cursor:wait}' +
    '.cta-msg{display:none;margin-top:11px;font-size:13.5px;line-height:1.45}' +
    '.cta-msg.err{display:block;color:#B23A2E} .cta-msg.ok{display:block;color:#1A6B3F}' +
    '#cta-codigo{letter-spacing:9px;text-align:center;font-size:20px;font-weight:700;color:#1E3A6E}' +
    '.cta-pie{margin:12px 0 0;font-size:12.5px;color:#8B9094;line-height:1.45;text-align:center}' +
    '.cta-pie a{color:#0B6BB5;font-weight:600}' +
    /* pestanas entrar / crear */
    /* campo con icono a la izquierda */
    '.cta-campo{position:relative;display:flex;align-items:center}' +
    '.cta-campo .cta-ic{position:absolute;left:13px;width:19px;height:19px;color:#8B9BB0;pointer-events:none}' +
    '.cta-campo input{padding-left:42px}' +
    '.cta-campo .cta-ojo + input,.cta-campo input + .cta-ojo ~ input{padding-right:46px}' +
    '#cta-clave{padding-right:46px}' +
    /* enlace para alternar entre entrar y registrarse */
    '.cta-cambia{margin:16px 0 0;text-align:center;font-size:14.5px;color:#5C6168}' +
    '.cta-cambia a{color:#0B6BB5;font-weight:700;text-decoration:underline}' +
    /* proveedores externos, compactos */
    '.cta-proveedores{display:flex;gap:10px;justify-content:center}' +
    '.cta-prov{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-width:150px;' +
      'background:#fff;border:1.5px solid #CDD5DF;border-radius:999px;padding:11px 22px;min-height:48px;' +
      'font-family:inherit;font-size:15px;font-weight:600;color:#24282D;cursor:pointer}' +
    '.cta-prov:hover{background:#F2F5F9;border-color:#B6C1CF}' +
    '.cta-clave-caja{position:relative;display:flex;align-items:center}' +
    '.cta-clave-caja input{padding-right:46px}' +
    /* 44 px es el minimo tactil (Apple HIG). El icono sigue midiendo 19. */
    '.cta-ojo{position:absolute;right:2px;width:44px;height:44px;border:none;background:none;color:#8B9094;'+
      'cursor:pointer;border-radius:8px;display:flex;align-items:center;justify-content:center}' +
    '.cta-ojo:hover{color:#24282D;background:rgba(20,24,30,.05)}' +
    '.cta-ojo svg{width:19px;height:19px}' +
    '.cta-ojo .tacha{opacity:1} .cta-ojo.abierto .tacha{opacity:0}' +
    '.cta-req{margin:7px 0 0;font-size:12.5px;color:#647188}' +
    '.cta-instr{margin:0 0 16px;font-size:14.5px;line-height:1.55;color:#4B5C74;'+
      'background:#F7FAFD;border-left:3px solid #0B6BB5;border-radius:0 9px 9px 0;padding:12px 15px}' +
    '.cta-instr b{color:#1E3A6E;word-break:break-all}' +
    /* acceso de cuenta del encabezado */
    '.cta-nav{position:relative;display:inline-flex;align-items:center}' +
    '.cta-nav-b{display:inline-flex;align-items:center;gap:8px;font-family:inherit;font-size:14.5px;'+
      'font-weight:600;color:#1E3A6E;background:transparent;border:1.5px solid rgba(30,58,110,.22);'+
      'border-radius:11px;padding:8px 14px;min-height:44px;cursor:pointer;white-space:nowrap;'+
      'transition:background .18s,border-color .18s}' +
    '.cta-nav-b:hover{background:rgba(11,107,181,.07);border-color:rgba(30,58,110,.4)}' +
    '.cta-nav-b svg{width:17px;height:17px;flex-shrink:0}' +
    '.cta-ini{width:26px;height:26px;border-radius:50%;background:#0B6BB5;color:#fff;'+
      'display:inline-flex;align-items:center;justify-content:center;font-size:12.5px;'+
      'font-weight:700;text-transform:uppercase;flex-shrink:0}' +
    '.cta-nav-cor{max-width:15ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '@media(max-width:620px){.cta-nav-cor{display:none}}' +
    '.cta-menu{position:absolute;top:calc(100% + 8px);right:0;min-width:230px;background:#fff;'+
      'border:1px solid #DDE5EE;border-radius:13px;box-shadow:0 14px 40px -12px rgba(20,24,30,.28);'+
      'padding:7px;z-index:400;display:none}' +
    '.cta-menu.abierto{display:block}' +
    '.cta-menu .cab{padding:9px 11px 10px;border-bottom:1px solid #EDF3F9;margin-bottom:5px}' +
    '.cta-menu .cab b{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;'+
      'color:#8B9094;font-weight:700;margin-bottom:2px}' +
    '.cta-menu .cab span{font-size:13.5px;color:#24282D;word-break:break-all;line-height:1.4}' +
    '.cta-menu a,.cta-menu button{display:flex;width:100%;box-sizing:border-box;align-items:center;'+
      'gap:9px;text-align:left;font-family:inherit;font-size:14.5px;color:#24282D;background:none;'+
      'border:none;border-radius:9px;padding:10px 11px;min-height:44px;cursor:pointer;text-decoration:none}' +
    '.cta-menu a:hover,.cta-menu button:hover{background:#F2F5F9;text-decoration:none}' +
    '.cta-menu hr{border:none;border-top:1px solid #EDF3F9;margin:5px 0}' +
    '.cta-menu .sal{color:#B23A2E}' +
    /* variante para encabezados oscuros */
    '.cta-nav.claro .cta-nav-b{color:#fff;border-color:rgba(255,255,255,.28)}' +
    '.cta-nav.claro .cta-nav-b:hover{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.5)}' +
    '.cta-nav.claro .cta-ini{background:#fff;color:#1E3A6E}' +
    /* cajon de sesion */
    '.cta-velo{position:fixed;inset:0;background:rgba(16,24,40,.52);backdrop-filter:blur(3px);'+
      'z-index:9000;opacity:0;transition:opacity .22s ease}' +
    '.cta-velo.ver{opacity:1}' +
    '.cta-cajon{position:fixed;top:0;right:0;bottom:0;width:min(440px,100%);background:#fff;'+
      'z-index:9001;box-shadow:-18px 0 50px -20px rgba(16,24,40,.45);display:flex;'+
      'flex-direction:column;transform:translateX(100%);transition:transform .28s cubic-bezier(.22,.61,.36,1)}' +
    '.cta-cajon.ver{transform:translateX(0)}' +
    '.cta-cajon-int{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 28px 32px}' +
    '.cta-x{position:absolute;top:12px;right:14px;width:44px;height:44px;border:none;background:none;'+
      'font-size:26px;line-height:1;color:#5C6168;cursor:pointer;border-radius:10px}' +
    '.cta-x:hover{background:#F2F5F9;color:#24282D}' +
    '.cta-marca{font-family:Georgia,\'Times New Roman\',serif;font-size:26px;font-weight:600;'+
      'letter-spacing:-.03em;color:#1E3A6E;margin:22px 0 26px;display:block}' +
    '.cta-marca i{font-style:normal;color:#0B6BB5} .cta-marca em{font-style:normal;color:#E5692A}' +
    '.cta-cajon .cta-box{border:none;background:none;padding:0}' +
    '.cta-cajon .cta-box h4{font-size:21px;line-height:1.3;margin-bottom:6px}' +
    '.cta-cajon .cta-box p.cta-sub{font-size:14.5px;margin-bottom:20px}' +
    '.cta-seguro{margin-top:26px;background:#FBF3E3;border:1px solid #E7D3A4;border-radius:11px;'+
      'padding:14px 16px;font-size:13.5px;line-height:1.6;color:#7A5416}' +
    '.cta-seguro b{display:block;color:#9A6B1F;margin-bottom:4px;font-size:14px}' +
    '.cta-volver{display:inline-block;margin-top:22px;font-size:14px;font-weight:600;color:#5C6168;text-decoration:none}' +
    '.cta-volver:hover{color:#1E3A6E}' +
    'body.cta-quieto{overflow:hidden}' +
    '@media (prefers-reduced-motion:reduce){.cta-velo,.cta-cajon{transition:none}}';

  var _ic = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

  var SVG_SOBRE_CH =
    '<svg class="cta-ic" ' + _ic + '><rect x="3" y="5" width="18" height="14" rx="2"/>' +
    '<path d="M3 7l9 6 9-6"/></svg>';

  var SVG_PERSONA_CH =
    '<svg class="cta-ic" ' + _ic + '><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="12" cy="7" r="4"/></svg>';

  var SVG_LLAVE =
    '<svg class="cta-ic" ' + _ic + '><rect x="4" y="10" width="16" height="10" rx="2"/>' +
    '<path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';

  var SVG_OJO =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>' +
    '<path class="tacha" d="M4 20L20 4"/></svg>';

  var SVG_SOBRE =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>';

  var SVG_G =
    '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.4h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.7"/>' +
    '<path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.8 1.3-4.3 2.2-7.6 2.2-5.8 0-10.7-3.8-12.5-9.1l-.3.1-6.8 5.2-.1.3C7.9 41 15.4 46 24 46"/>' +
    '<path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.7-2.9-.7-4.4s.3-3 .7-4.4v-.3l-6.9-5.3-.2.1C2.8 17.1 2 20.4 2 24s.8 6.9 2.4 9.9z"/>' +
    '<path fill="#EA4335" d="M24 10.7c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 4.5 29.9 2 24 2 15.4 2 7.9 7 4.4 14.1l7.1 5.5c1.8-5.3 6.7-8.9 12.5-8.9"/>' +
    '</svg>';

  function inyectarCss() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement('style');
    s.id = CSS_ID; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // opciones: { titulo, sub, alEntrar, alCancelar }
  function panel(contenedor, opciones) {
    var o = opciones || {};
    var host = typeof contenedor === 'string' ? document.getElementById(contenedor) : contenedor;
    if (!host) return;
    inyectarCss();

    host.innerHTML =
      '<div class="cta-box">' +
        '<h4 id="cta-tit">' + (o.titulo || 'Entre a su cuenta') + '</h4>' +
        '<p class="cta-sub" id="cta-subt" role="status" aria-live="polite">' + (o.sub || 'Con su cuenta guarda su avance y vuelve a sus asambleas cuando quiera.') + '</p>' +

        '<div id="cta-form">' +
          '<div id="cta-nombre-caja" style="display:none">' +
            '<label for="cta-nombre">Su nombre</label>' +
            '<div class="cta-campo">' + SVG_PERSONA_CH +
              '<input type="text" id="cta-nombre" autocomplete="name" maxlength="80" placeholder="Nombre y apellido">' +
            '</div>' +
          '</div>' +
          '<label for="cta-correo" id="cta-lbl-correo">Correo electrónico</label>' +
          '<div class="cta-campo">' + SVG_SOBRE_CH +
            '<input type="email" id="cta-correo" inputmode="email" autocomplete="email" placeholder="nombre@correo.cl">' +
          '</div>' +
          '<label for="cta-clave" style="margin-top:13px">Clave</label>' +
          '<div class="cta-campo">' + SVG_LLAVE +
            '<input type="password" id="cta-clave" autocomplete="current-password" placeholder="Su clave">' +
            '<button type="button" class="cta-ojo" id="cta-ojo" aria-label="Mostrar la clave">' + SVG_OJO + '</button>' +
          '</div>' +
          '<p class="cta-req" id="cta-req" style="display:none">Al menos ' + CLAVE_MIN + ' caracteres.</p>' +
          '<button type="button" class="cta-b" id="cta-hacer">Entrar</button>' +
          '<p class="cta-pie" id="cta-olvide-caja"><a href="#" id="cta-olvide">¿Olvidó su clave?</a></p>' +
          '<p class="cta-cambia"><span id="cta-cambia-txt">¿No tiene cuenta?</span> ' +
            '<a href="#" id="cta-cambia">Regístrese</a></p>' +
        '</div>' +

        '<div id="cta-codigo-paso" style="display:none">' +
          '<p class="cta-instr" id="cta-instr">Le enviamos un código a <b id="cta-dest"></b>. ' +
            'Búsquelo en su correo y escríbalo aquí. Si no aparece, revise el spam.</p>' +
          '<label for="cta-codigo">Código de 6 a 8 dígitos</label>' +
          '<input type="text" id="cta-codigo" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="······">' +
          '<button type="button" class="cta-b" id="cta-verificar">Confirmar y entrar</button>' +
          '<p class="cta-pie"><a href="#" id="cta-reenviar">Enviar otro código</a> · ' +
            '<a href="#" id="cta-otro">Volver</a></p>' +
        '</div>' +

        '<div class="cta-msg" id="cta-msg" role="alert"></div>' +

        '<div id="cta-alt">' +
          '<div class="cta-o" id="cta-o-txt">o inicie sesión con</div>' +
          '<div class="cta-proveedores">' +
            '<button type="button" class="cta-prov" id="cta-google" aria-label="Continuar con Google">' + SVG_G + '<span>Google</span></button>' +
          '</div>' +
          '<p class="cta-pie"><a href="#" id="cta-sincl">Prefiero un código por correo</a></p>' +
        '</div>' +

        '<p class="cta-pie">Al continuar acepta los <a href="/terminos" target="_blank" rel="noopener">t&eacute;rminos del servicio</a> ' +
        'y el <a href="/privacidad" target="_blank" rel="noopener">aviso de privacidad</a>.</p>' +
      '</div>';

    var $ = function (id) { return document.getElementById(id); };
    var modo = 'entrar';     // entrar | crear
    var pendiente = null;    // correo esperando su codigo
    var tipoCodigo = 'email';  // 'email' al entrar, 'signup' al confirmar
    var tituloPropio = !!o.titulo;   // lo puso quien abrio el panel

    function aviso(t, clase) {
      var m = $('cta-msg');
      m.innerHTML = t || '';
      m.className = 'cta-msg' + (t ? ' ' + (clase || 'err') : '');
    }
    function ocupado(btn, on, txt) {
      if (!btn) return;
      if (on) { btn.dataset.t = btn.textContent; btn.disabled = true; if (txt) btn.textContent = txt; }
      else { btn.disabled = false; if (btn.dataset.t) btn.textContent = btn.dataset.t; }
    }
    function listo(u) { if (o.alEntrar) o.alEntrar(u); }

    // ---- pestañas
    function verModo(m) {
      modo = m;
      var entrar = m === 'entrar';
      $('cta-cambia-txt').textContent = entrar ? '¿No tiene cuenta?' : '¿Ya tiene cuenta?';
      $('cta-cambia').textContent = entrar ? 'Regístrese' : 'Inicie sesión';
      $('cta-o-txt').textContent = entrar ? 'o inicie sesión con' : 'o regístrese con';
      $('cta-hacer').textContent = entrar ? 'Entrar' : 'Crear mi cuenta';
      $('cta-clave').setAttribute('autocomplete', entrar ? 'current-password' : 'new-password');
      $('cta-clave').setAttribute('placeholder', entrar ? 'Su clave' : 'Invente una clave');
      $('cta-req').style.display = entrar ? 'none' : 'block';
      $('cta-olvide-caja').style.display = entrar ? 'block' : 'none';
      $('cta-nombre-caja').style.display = entrar ? 'none' : 'block';
      $('cta-lbl-correo').style.marginTop = entrar ? '' : '13px';
      if (!tituloPropio) {
        $('cta-tit').textContent = entrar ? 'Entre a su cuenta' : 'Cree su cuenta';
        $('cta-subt').textContent = entrar
          ? 'Con su cuenta guarda su avance y vuelve a sus asambleas cuando quiera.'
          : 'Toma un minuto. Solo necesitamos su nombre, su correo y una clave.';
      }
      aviso('');
    }
    $('cta-cambia').addEventListener('click', function (ev) {
      ev.preventDefault();
      verModo(modo === 'entrar' ? 'crear' : 'entrar');
      var foco = modo === 'crear' ? $('cta-nombre') : $('cta-correo');
      try { foco.focus(); } catch (e) {}
    });

    // ---- ver / ocultar la clave
    $('cta-ojo').addEventListener('click', function () {
      var i = $('cta-clave');
      var oculta = i.type === 'password';
      i.type = oculta ? 'text' : 'password';
      this.setAttribute('aria-label', oculta ? 'Ocultar la clave' : 'Mostrar la clave');
      this.classList.toggle('abierto', oculta);
      i.focus();
    });

    // ---- entrar o crear
    $('cta-hacer').addEventListener('click', function () {
      var btn = this;
      var correo = $('cta-correo').value.trim().toLowerCase();
      var clave = $('cta-clave').value;
      aviso('');
      if (modo === 'entrar') {
        ocupado(btn, true, 'Entrando…');
        entrarConClave(correo, clave, function (err) {
          ocupado(btn, false);
          if (err) { aviso(err); return; }
          usuario(listo);
        });
      } else {
        ocupado(btn, true, 'Creando…');
        crearCuenta(correo, clave, function (err, faltaConfirmar) {
          ocupado(btn, false);
          if (err === 'CLAVE_FILTRADA') { aviso('Le sugerimos otra: combine letras, números y símbolos.'); $('cta-clave').focus(); return; }
          if (err) { aviso(err); return; }
          if (faltaConfirmar) {
            // Supabase manda un codigo, no un enlace: hay que ofrecer donde
            // escribirlo o el camino se corta aqui.
            irAlCodigo(correo, 'signup');
            aviso('Cuenta creada. Ahora confirme su correo con el código que le enviamos.', 'ok');
            return;
          }
          usuario(listo);
        }, $('cta-nombre').value);
      }
    });

    // ---- recuperar la clave
    $('cta-olvide').addEventListener('click', function (ev) {
      ev.preventDefault();
      var correo = $('cta-correo').value.trim().toLowerCase();
      aviso('');
      recuperarClave(correo, function (err) {
        if (err) { aviso(err); return; }
        aviso('Le enviamos un enlace a <b>' + correo + '</b> para poner una clave nueva.', 'ok');
      });
    });

    // Muestra el paso del codigo, venga de crear la cuenta o de pedir uno
    // para entrar. La diferencia esta en tipoCodigo.
    function irAlCodigo(correo, tipo) {
      pendiente = correo;
      tipoCodigo = tipo;
      $('cta-dest').textContent = correo;
      $('cta-instr').innerHTML = tipo === 'signup'
        ? 'Su cuenta quedó creada. Para activarla, escriba el código que enviamos a <b>' + esc(correo) + '</b>. Si no aparece, revise el spam.'
        : 'Le enviamos un código a <b>' + esc(correo) + '</b>. Búsquelo en su correo y escríbalo aquí. Si no aparece, revise el spam.';
      $('cta-tit').textContent = tipo === 'signup' ? 'Confirme su correo' : 'Escriba su código';
      $('cta-subt').style.display = 'none';
      $('cta-verificar').textContent = tipo === 'signup' ? 'Confirmar y entrar' : 'Entrar';
      $('cta-form').style.display = 'none';
      $('cta-alt').style.display = 'none';
      $('cta-codigo-paso').style.display = 'block';
      setTimeout(function () { try { $('cta-codigo').focus(); } catch (e) {} }, 60);
    }

    // ---- alternativa: codigo por correo
    $('cta-sincl').addEventListener('click', function () {
      var btn = this;
      var correo = $('cta-correo').value.trim().toLowerCase();
      aviso('');
      if (!correoValido(correo)) { aviso('Escriba su correo arriba y vuelva a apretar.'); $('cta-correo').focus(); return; }
      ocupado(btn, true, 'Enviando…');
      pedirCodigo(correo, function (err) {
        ocupado(btn, false);
        if (err) { aviso(err); return; }
        irAlCodigo(correo, 'email');
        aviso('');
      });
    });

    $('cta-verificar').addEventListener('click', function () {
      var btn = this;
      aviso('');
      ocupado(btn, true, 'Verificando…');
      verificarCodigo(pendiente, $('cta-codigo').value, function (err) {
        ocupado(btn, false);
        if (err) { aviso(err); return; }
        usuario(listo);
      }, tipoCodigo);
    });

    $('cta-otro').addEventListener('click', function (ev) {
      ev.preventDefault();
      pendiente = null; aviso('');
      $('cta-codigo-paso').style.display = 'none';
      $('cta-form').style.display = 'block';
      $('cta-alt').style.display = 'block';
      $('cta-subt').style.display = '';
      verModo(modo);   // repone titulo y subtitulo del modo en curso
    });

    // ---- reenviar el codigo
    $('cta-reenviar').addEventListener('click', function (ev) {
      ev.preventDefault();
      if (!pendiente) return;
      aviso('Enviando…', 'ok');
      var listoAviso = function (err) {
        if (err) { aviso(err); return; }
        aviso('Le enviamos otro código a ' + esc(pendiente) + '.', 'ok');
      };
      if (tipoCodigo === 'signup') reenviarConfirmacion(pendiente, listoAviso);
      else pedirCodigo(pendiente, listoAviso);
    });

    // ---- Google
    $('cta-google').addEventListener('click', function () {
      aviso('');
      conGoogle(global.location.href, function (err) { if (err) aviso(err); });
    });

    // ---- Enter avanza
    $('cta-nombre').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-correo').focus(); }
    });
    $('cta-correo').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-clave').focus(); }
    });
    $('cta-clave').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-hacer').click(); }
    });
    $('cta-codigo').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('cta-verificar').click(); }
    });

    if (o.modo === 'crear') verModo('crear');
    else verModo('entrar');
  }

  // -------------------------------------------------------------------
  //  Acceso de cuenta del encabezado
  // -------------------------------------------------------------------
  // Se monta en cualquier pagina: si no hay sesion muestra "Entrar", y si la
  // hay muestra la inicial del correo con un menu. El destino tras entrar es
  // /cuenta, que es donde vive el perfil.
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var SVG_PERSONA =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';

  // Cada nav montada deja aquí cómo repintarse. Lo usa refrescarNav() cuando
  // cambia algo que la nav muestra: hoy, el nombre de la persona.
  var navsMontadas = [];

  function refrescarNav() {
    navsMontadas.forEach(function (r) {
      try { r.pintar(); } catch (e) { /* la nav pudo desaparecer del DOM */ }
    });
  }

  function montarNav(contenedor, opciones) {
    var o = opciones || {};
    var host = typeof contenedor === 'string' ? document.getElementById(contenedor) : contenedor;
    if (!host) return;
    inyectarCss();
    host.classList.add('cta-nav');
    if (o.claro) host.classList.add('claro');

    function sinSesion() {
      host.innerHTML =
        '<button type="button" class="cta-nav-b" id="cta-nav-entrar">' +
        SVG_PERSONA + '<span>Entrar</span></button>';
      document.getElementById('cta-nav-entrar').addEventListener('click', function () {
        // Quien entra desde la cabecera va a su panel: es lo que vino a buscar.
        // Recargar la misma pagina lo dejaba donde estaba, sin senal de que
        // algo habia pasado. En /acta y en la consulta no pasa por aqui: ahi
        // el cajon es el portero y se vuelve a lo que se estaba haciendo.
        abrirCajon({ alEntrar: function () { location.href = '/cuenta'; } });
      });
    }

    function conSesion(u) {
      // Se muestra el nombre si lo tenemos; el correo queda en el menu, que es
      // donde sirve para confirmar con que cuenta esta.
      var rotulo = u.nombre || u.correo || '';
      var inicial = (rotulo || '?').charAt(0);
      host.innerHTML =
        '<button type="button" class="cta-nav-b" id="cta-nav-abre" aria-haspopup="menu" aria-expanded="false" ' +
          'aria-label="Su cuenta: ' + esc(rotulo) + '">' +
          '<span class="cta-ini" aria-hidden="true">' + esc(inicial) + '</span>' +
          '<span class="cta-nav-cor">' + esc(rotulo) + '</span>' +
        '</button>' +
        '<div class="cta-menu" id="cta-nav-menu" role="menu">' +
          '<div class="cab"><b>' + (u.nombre ? esc(u.nombre) : 'Su cuenta') + '</b>' +
            '<span>' + esc(u.correo) + '</span></div>' +
          '<a href="/cuenta" role="menuitem">Mi perfil</a>' +
          '<a href="/acta" role="menuitem">Nueva acta</a>' +
          '<a href="/consulta/" role="menuitem">Consulta por escrito</a>' +
          '<hr>' +
          '<button type="button" class="sal" id="cta-nav-salir" role="menuitem">Cerrar sesión</button>' +
        '</div>';

      var boton = document.getElementById('cta-nav-abre');
      var menu = document.getElementById('cta-nav-menu');
      boton.addEventListener('click', function (e) {
        e.stopPropagation();
        var abierto = menu.classList.toggle('abierto');
        boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
      });
      document.getElementById('cta-nav-salir').addEventListener('click', function (b) {
        var el = b.target;
        el.disabled = true; el.textContent = 'Saliendo…';
        salir(function () { location.href = '/'; });
      });
    }

    // Estos van en el contenedor, no en los botones: los botones se
    // reemplazan cada vez que se repinta, y los oyentes se irían acumulando.
    function cerrarMenu() {
      var menu = host.querySelector('.cta-menu');
      var boton = host.querySelector('.cta-nav-b');
      if (menu) menu.classList.remove('abierto');
      if (boton) boton.setAttribute('aria-expanded', 'false');
    }
    document.addEventListener('click', function (e) {
      if (!host.contains(e.target)) cerrarMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') cerrarMenu();
    });

    function pintar() {
      usuario(function (u) { if (u) conSesion(u); else sinSesion(); });
    }

    // Si esta misma nav ya estaba montada, se reemplaza su pintor en vez de
    // agregar otro.
    var yaEstaba = navsMontadas.filter(function (r) { return r.host === host; })[0];
    if (yaEstaba) yaEstaba.pintar = pintar;
    else navsMontadas.push({ host: host, pintar: pintar });

    pintar();
  }

  // -------------------------------------------------------------------
  //  Cajon de sesion
  // -------------------------------------------------------------------
  // Unica superficie de inicio de sesion del sitio. Con bloqueante:true no se
  // puede cerrar: es el portero de /acta y de la consulta por escrito.
  var abiertoCajon = null;

  function cerrarCajon() {
    if (!abiertoCajon) return;
    var c = abiertoCajon; abiertoCajon = null;
    (c.apagados || []).forEach(function (hijo) {
      hijo.removeAttribute('aria-hidden');
      hijo.inert = false;
    });
    c.cajon.classList.remove('ver');
    c.velo.classList.remove('ver');
    document.body.classList.remove('cta-quieto');
    setTimeout(function () {
      if (c.cajon.parentNode) c.cajon.remove();
      if (c.velo.parentNode) c.velo.remove();
    }, 300);
    if (c.foco && c.foco.focus) { try { c.foco.focus(); } catch (e) {} }
  }

  // opciones: { titulo, sub, bloqueante, alEntrar }
  function abrirCajon(opciones) {
    var o = opciones || {};
    if (abiertoCajon) return;
    inyectarCss();

    var foco = document.activeElement;
    var velo = document.createElement('div');
    velo.className = 'cta-velo';

    var cajon = document.createElement('div');
    cajon.className = 'cta-cajon';
    cajon.setAttribute('role', 'dialog');
    cajon.setAttribute('aria-modal', 'true');
    cajon.setAttribute('aria-label', 'Entrar a su cuenta');
    cajon.innerHTML =
      (o.bloqueante ? '' : '<button type="button" class="cta-x" id="cta-cerrar" aria-label="Cerrar">&times;</button>') +
      '<div class="cta-cajon-int">' +
        '<span class="cta-marca">acta<i>viva</i><em>.</em></span>' +
        '<div id="cta-cajon-host"></div>' +
        '<div class="cta-seguro">' +
          '<b>Cuide su cuenta</b>' +
          'Nunca le pediremos su clave por teléfono, por mensaje ni por correo. ' +
          'Los correos que le enviamos solo contienen su código de acceso, su comprobante ' +
          'o la constancia de su voto: jamás le pedimos datos de tarjetas.' +
        '</div>' +
        (o.bloqueante ? '<a class="cta-volver" href="/">← Volver al inicio</a>' : '') +
      '</div>';

    document.body.appendChild(velo);
    document.body.appendChild(cajon);
    document.body.classList.add('cta-quieto');

    var apagados = [];
    [].slice.call(document.body.children).forEach(function (hijo) {
      if (hijo === cajon || hijo === velo) return;
      if (hijo.tagName === 'SCRIPT' || hijo.tagName === 'STYLE') return;
      apagados.push(hijo);
      hijo.setAttribute('aria-hidden', 'true');
      hijo.inert = true;
    });

    abiertoCajon = { cajon: cajon, velo: velo, foco: foco, apagados: apagados, bloqueante: !!o.bloqueante };

    // un cuadro para que la transicion arranque desde fuera de la pantalla
    requestAnimationFrame(function () {
      velo.classList.add('ver');
      cajon.classList.add('ver');
    });

    panel('cta-cajon-host', {
      titulo: o.titulo,
      sub: o.sub,
      alEntrar: function (u) {
        cerrarCajon();
        if (o.alEntrar) o.alEntrar(u);
        else location.reload();
      }
    });

    var campo = document.getElementById('cta-correo');
    if (campo) setTimeout(function () { try { campo.focus(); } catch (e) {} }, 320);

    if (!o.bloqueante) {
      document.getElementById('cta-cerrar').addEventListener('click', cerrarCajon);
      velo.addEventListener('click', cerrarCajon);
      document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape' && abiertoCajon) { cerrarCajon(); document.removeEventListener('keydown', esc); }
      });
    }

    // el foco no se escapa del cajon mientras esta abierto
    cajon.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab') return;
      var f = cajon.querySelectorAll('a[href],button:not([disabled]),input,select,textarea');
      if (!f.length) return;
      var primero = f[0], ultimo = f[f.length - 1];
      if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
    });
  }

  // Portero: deja pasar si hay sesion; si no, abre el cajon sin salida.
  function exigirSesion(opciones, alEntrar) {
    var o = opciones || {};
    usuario(function (u) {
      if (u) { if (alEntrar) alEntrar(u); return; }
      abrirCajon({
        titulo: o.titulo || 'Entre para continuar',
        sub: o.sub || 'Necesita una cuenta para usar esta herramienta. Le enviamos un código a su correo y listo.',
        bloqueante: true,
        alEntrar: function (u2) { if (alEntrar) alEntrar(u2); else location.reload(); }
      });
    });
  }

  global.Cuenta = {
    // Un solo cliente para toda la pagina. Si cada modulo crea el suyo, la
    // sesion que abre uno no la ve el otro y auth.uid() llega nulo a Postgres.
    cliente: cliente,
    usuario: usuario,
    salir: salir,
    panel: panel,
    montarNav: montarNav,
    abrirCajon: abrirCajon,
    cerrarCajon: cerrarCajon,
    exigirSesion: exigirSesion,
    conGoogle: conGoogle,
    pedirCodigo: pedirCodigo,
    verificarCodigo: verificarCodigo,
    correoValido: correoValido,
    claveValida: claveValida,
    crearCuenta: crearCuenta,
    entrarConClave: entrarConClave,
    recuperarClave: recuperarClave,
    cambiarClave: cambiarClave,
    guardarNombre: guardarNombre,
    reenviarConfirmacion: reenviarConfirmacion
  };
})(window);
