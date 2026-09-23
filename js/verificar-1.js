/* =====================================================================
 *  Verificar un acta  —  página pública (/verificar)
 *
 *  Un acta descargada es un archivo en el disco de quien la bajó: se abre
 *  con un editor, se cambia el quórum y el folio sigue ahí. Lo único que
 *  el archivo no puede cambiar es lo que quedó registrado en el servidor al
 *  finalizarla: el folio, el código que sale de la huella del contenido y
 *  un resumen sin datos de personas (ac_finalizar -> actas_emitidas).
 *
 *  Esta página le pregunta eso a la base con ac_verificar(folio, código) y
 *  muestra el resumen para que quien tiene el documento en la mano lo
 *  compare. La base no distingue "ese folio no existe" de "ese código no
 *  es el suyo", y aquí tampoco: sería regalarle a quien prueba folios la
 *  mitad de la respuesta.
 *
 *  Reglas de la página:
 *   - Todo lo que viene del servidor se pinta con textContent. Nada de
 *     innerHTML con datos: el resumen lo escribió una persona y viaja a la
 *     pantalla de un tercero.
 *   - Un folio DEMO- se contesta aquí mismo, sin preguntarle a nadie: sale
 *     de la demostración y no existe en la base.
 *   - La llamada va con la clave anon, siempre. Con el cliente de la cuenta
 *     iría con la sesión de quien mira, si la tiene, y ac_verificar es de
 *     acceso público: el resultado no puede depender de quién pregunta.
 *
 *  Sin JavaScript en línea: la CSP real es script-src 'self'.
 * ===================================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  var URL_SB = 'https://rujwokagmjbqtrcvosye.supabase.co';
  // La clave anon es pública por diseño -la misma de cuenta.js-: solo abre
  // lo que las políticas y las funciones SECURITY DEFINER dejan abrir.
  var ANON_SB = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1andva2FnbWpicXRyY3Zvc3llIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE5NDgzNzIsImV4cCI6MjA5NzUyNDM3Mn0.E_p3VdfHrMIHy-yq0Uxoz4wEP_pxqVqE64TBWoyVGV0';
  var PLAZO_MS = 12000;

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
               'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var RESULTADOS = {
    'aprobado': 'Aprobado', 'rechazado': 'Rechazado',
    'pendiente': 'Pendiente', 'sin votacion': 'Sin votación'
  };

  function $(id) { return doc.getElementById(id); }

  // --- Normalización -----------------------------------------------------
  // Igual que la base: el folio sin espacios y en mayúscula; el código, solo
  // sus caracteres hexadecimales. Así da lo mismo "abcd ef01 2345" que
  // "ABCD-EF01-2345".
  function normalizarFolio(t) {
    return String(t == null ? '' : t).replace(/\s+/g, '').toUpperCase();
  }
  function normalizarCodigo(t) {
    return String(t == null ? '' : t).toUpperCase().replace(/[^0-9A-F]/g, '');
  }
  // "DEMO" tiene letras que no son hexadecimales: un código real nunca
  // empieza así, y un folio real empieza por AV-.
  function esDemo(folio, codigoCrudo) {
    return /^DEMO-/.test(folio) || /^DEMO/.test(String(codigoCrudo || '').replace(/\s+/g, '').toUpperCase());
  }

  // --- Formatos ----------------------------------------------------------
  function texto(v, tope) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return tope && s.length > tope ? s.slice(0, tope) + '…' : s;
  }
  // 'YYYY-MM-DD' se lee a mano: con new Date() la zona horaria la corre un día.
  function fechaLarga(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m || +m[2] < 1 || +m[2] > 12) return '';
    return (+m[3]) + ' de ' + MESES[+m[2] - 1] + ' de ' + m[1];
  }
  function momento(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    try {
      return d.toLocaleString('es-CL', {
        timeZone: 'America/Santiago', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false
      });
    } catch (e) { return d.toISOString(); }
  }
  function tipoDe(t) {
    if (t === 'ordinaria') return 'Ordinaria';
    if (t === 'extraordinaria') return 'Extraordinaria';
    return texto(t, 40);
  }

  // --- La consulta -------------------------------------------------------
  // Devuelve siempre una promesa que se resuelve (nunca se rechaza) con
  // { tipo: 'valido'|'no_valido'|'limite'|'red'|'servicio', datos }.
  function consultar(folio, codigo) {
    if (typeof global.fetch !== 'function') return Promise.resolve({ tipo: 'servicio' });
    var ctrl = typeof global.AbortController === 'function' ? new global.AbortController() : null;
    var reloj = ctrl ? setTimeout(function () { ctrl.abort(); }, PLAZO_MS) : null;
    var fin = function (x) { if (reloj) clearTimeout(reloj); return x; };

    return global.fetch(URL_SB + '/rest/v1/rpc/ac_verificar', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': ANON_SB,
        'authorization': 'Bearer ' + ANON_SB
      },
      body: JSON.stringify({ p_folio: folio, p_codigo: codigo }),
      credentials: 'omit',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().then(null, function () { return null; }).then(function (d) {
        return fin(interpretar(r.status, r.ok, d));
      });
    }, function () { return fin({ tipo: 'red' }); });
  }

  // El límite de tasa (30 consultas cada 10 minutos por IP) lo impone la
  // base. Se reconoce por el 429 o por el motivo, venga como error de
  // PostgREST o dentro de la respuesta.
  function esLimite(estado, d) {
    if (estado === 429) return true;
    if (!d || typeof d !== 'object') return false;
    if (d.limite === true) return true;
    var m = [d.motivo, d.error, d.message, d.hint, d.details].map(function (x) {
      return x == null ? '' : String(x);
    }).join(' ');
    return /l[ií]mite|tasa|rate.?limit|demasiad|too many/i.test(m);
  }

  function interpretar(estado, ok, d) {
    if (esLimite(estado, d)) return { tipo: 'limite' };
    if (!ok) return { tipo: 'servicio' };
    if (d && d.valido === true) return { tipo: 'valido', datos: d };
    return { tipo: 'no_valido' };
  }

  // --- Pintar ------------------------------------------------------------
  // Un solo constructor de nodos, y siempre con textContent.
  function el(etiqueta, clase, contenido) {
    var n = doc.createElement(etiqueta);
    if (clase) n.className = clase;
    if (contenido != null) n.textContent = contenido;
    return n;
  }

  function tarjeta(clase, titulo) {
    var t = el('div', 'res res-' + clase);
    var h = el('h2', null, titulo);
    h.setAttribute('tabindex', '-1');
    t.appendChild(h);
    return { caja: t, titulo: h };
  }

  function mostrar(r) {
    var zona = $('v-resultado');
    if (!zona) return;
    zona.textContent = '';
    zona.appendChild(r.caja);
    // El foco va al resultado: quien navega con teclado o lector de pantalla
    // llega directo a la respuesta, sin tener que buscarla.
    try { r.titulo.focus(); } catch (e) {}
  }

  function fila(dl, rotulo, valor) {
    if (!valor) return;
    dl.appendChild(el('dt', null, rotulo));
    dl.appendChild(el('dd', null, valor));
  }

  function pintarValido(d, folioPedido) {
    var r = tarjeta('valido', 'Acta verificada');
    var res = (d.resumen && typeof d.resumen === 'object' && !Array.isArray(d.resumen)) ? d.resumen : {};
    var folio = texto(d.folio || folioPedido, 40);
    var cuando = momento(d.emitida_en);

    var p = el('p');
    p.appendChild(el('span', null, 'El folio '));
    p.appendChild(el('strong', null, folio));
    p.appendChild(el('span', null,
      ' y su código corresponden a un acta emitida en actascopropiedad.cl' +
      (cuando ? ' el ' + cuando + '.' : '.')));
    r.caja.appendChild(p);

    var dl = el('dl', 'ficha');
    fila(dl, 'Folio', folio);
    fila(dl, 'Emitida', cuando);
    fila(dl, 'Condominio', texto(res.condominio, 200));
    fila(dl, 'Fecha de la sesión', fechaLarga(res.fecha_sesion) || texto(res.fecha_sesion, 20));
    fila(dl, 'Tipo de asamblea', tipoDe(res.tipo));
    fila(dl, 'Quórum de asistencia', texto(res.quorum, 40));
    r.caja.appendChild(dl);

    // La huella completa, si la base la entrega. El código son solo sus doce
    // primeros caracteres; con la huella entera, quien tenga la copia .html
    // original puede rehacer la cuenta él mismo (SHA-256 del texto entre las
    // marcas acta:cuerpo) sin fiarse de esta página. Solo se muestra si
    // tiene la forma de una: 64 hexadecimales.
    var huella = String(d.huella || '');
    if (/^[0-9a-f]{64}$/i.test(huella)) {
      var ph = el('p', 'huella');
      ph.appendChild(el('span', null, 'Huella SHA-256 registrada: '));
      ph.appendChild(el('code', null, huella.toLowerCase()));
      ph.appendChild(el('span', null,
        '. Debe ser idéntica a la que el documento trae impresa en letra chica al pie.'));
      r.caja.appendChild(ph);
    }

    var acuerdos = Array.isArray(res.acuerdos) ? res.acuerdos.slice(0, 60).filter(function (a) {
      return a && typeof a === 'object';
    }) : [];
    if (acuerdos.length) {
      r.caja.appendChild(el('h3', null, 'Acuerdos registrados'));
      var envoltura = el('div', 'tabla');
      var tabla = el('table');
      var cab = el('thead');
      var trc = el('tr');
      ['N°', 'Materia', 'Resultado', 'A favor'].forEach(function (c) {
        var th = el('th', null, c);
        th.setAttribute('scope', 'col');
        trc.appendChild(th);
      });
      cab.appendChild(trc);
      tabla.appendChild(cab);
      var cuerpo = el('tbody');
      acuerdos.forEach(function (a, i) {
        var tr = el('tr');
        tr.appendChild(el('td', 'num', String(i + 1)));
        tr.appendChild(el('td', null, texto(a.materia, 300) || '—'));
        tr.appendChild(el('td', null, RESULTADOS[a.resultado] || texto(a.resultado, 30) || '—'));
        tr.appendChild(el('td', 'num', texto(a.favor, 20) || '—'));
        cuerpo.appendChild(tr);
      });
      tabla.appendChild(cuerpo);
      envoltura.appendChild(tabla);
      r.caja.appendChild(envoltura);
    }

    r.caja.appendChild(el('p', 'comparar',
      'Compare estos datos con el documento que tiene en la mano. Si el condominio, la fecha, ' +
      'el quórum o algún acuerdo no coinciden, el documento se modificó después de emitirse ' +
      'y no es el acta registrada.'));
    r.caja.appendChild(el('p', null,
      'Esta verificación confirma que el acta se emitió en este sistema y qué se registró al ' +
      'emitirla. No certifica la validez legal de la asamblea ni la exactitud de lo que el acta ' +
      'declara. Por diseño no muestra nombres, RUT ni votos de personas.'));
    mostrar(r);
  }

  function pintarNoValido() {
    var r = tarjeta('no-valido', 'No encontramos un acta con ese folio y ese código');
    r.caja.appendChild(el('p', null,
      'Revise que ambos estén escritos tal como aparecen en el documento. Si están bien ' +
      'copiados, este sistema no emitió un acta con esos datos.'));
    mostrar(r);
  }

  function pintarDemo(folio) {
    var r = tarjeta('demo', 'Documento de demostración');
    r.caja.appendChild(el('p', null,
      (/^DEMO-/.test(folio) ? 'El folio ' + texto(folio, 40) : 'Ese código') +
      ' salió de la demostración de actascopropiedad.cl, que se recorre con datos de ejemplo. ' +
      'No corresponde a ninguna asamblea y el documento no tiene ninguna validez.'));
    r.caja.appendChild(el('p', null,
      'Las actas emitidas de verdad llevan un folio que empieza por «AV-» y un código de ' +
      'doce números y letras.'));
    mostrar(r);
  }

  function pintarLimite() {
    var r = tarjeta('limite', 'Demasiadas consultas seguidas');
    r.caja.appendChild(el('p', null,
      'Para proteger el registro, cada conexión puede hacer un número limitado de verificaciones ' +
      'en pocos minutos. Espere un momento y vuelva a intentarlo.'));
    mostrar(r);
  }

  function pintarRed() {
    var r = tarjeta('red', 'No pudimos conectar');
    r.caja.appendChild(el('p', null,
      'No logramos comunicarnos con el servicio de verificación. Revise su conexión a internet ' +
      'y vuelva a intentarlo.'));
    mostrar(r);
  }

  function pintarServicio() {
    var r = tarjeta('servicio', 'La verificación no está disponible');
    var p = el('p', null, 'El servicio no respondió como esperábamos. Inténtelo más tarde o escríbanos a ');
    var a = el('a', null, 'contacto@actascopropiedad.cl');
    a.setAttribute('href', 'mailto:contacto@actascopropiedad.cl');
    p.appendChild(a);
    p.appendChild(el('span', null, '.'));
    r.caja.appendChild(p);
    mostrar(r);
  }

  // --- El formulario -----------------------------------------------------
  function avisar(msj, campo) {
    var aviso = $('v-aviso');
    ['v-folio', 'v-codigo'].forEach(function (id) {
      var c = $(id);
      if (c) c.removeAttribute('aria-invalid');
    });
    if (aviso) {
      aviso.textContent = msj || '';
      aviso.hidden = !msj;
    }
    if (msj && campo) {
      campo.setAttribute('aria-invalid', 'true');
      try { campo.focus(); } catch (e) {}
    }
  }

  var ocupado = false;

  function enviar() {
    if (ocupado) return Promise.resolve(null);
    var cFolio = $('v-folio'), cCodigo = $('v-codigo'), boton = $('v-enviar');
    var zona = $('v-resultado');
    var folio = normalizarFolio(cFolio && cFolio.value);
    var crudo = String((cCodigo && cCodigo.value) || '');
    var codigo = normalizarCodigo(crudo);

    if (!folio) { avisar('Escriba el folio del acta.', cFolio); return Promise.resolve(null); }
    if (esDemo(folio, crudo)) {
      avisar('');
      pintarDemo(folio);
      return Promise.resolve('demo');
    }
    if (!/^[A-Z0-9-]{3,40}$/.test(folio)) {
      avisar('Revise el folio: lleva solo letras, números y guiones, como AV-2026-000123.', cFolio);
      return Promise.resolve(null);
    }
    if (codigo.length !== 12) {
      avisar('El código de verificación tiene 12 caracteres: números y letras de la A a la F. ' +
             'Puede escribirlo con o sin guiones.', cCodigo);
      return Promise.resolve(null);
    }
    avisar('');

    ocupado = true;
    var rotulo = boton ? boton.textContent : '';
    if (boton) { boton.disabled = true; boton.textContent = 'Verificando…'; }
    if (zona) zona.setAttribute('aria-busy', 'true');

    return consultar(folio, codigo).then(function (x) {
      ocupado = false;
      if (boton) { boton.disabled = false; boton.textContent = rotulo || 'Verificar'; }
      if (zona) zona.removeAttribute('aria-busy');
      if (x.tipo === 'valido') pintarValido(x.datos, folio);
      else if (x.tipo === 'no_valido') pintarNoValido();
      else if (x.tipo === 'limite') pintarLimite();
      else if (x.tipo === 'red') pintarRed();
      else pintarServicio();
      return x.tipo;
    });
  }

  var API = {
    normalizarFolio: normalizarFolio,
    normalizarCodigo: normalizarCodigo,
    esDemo: esDemo,
    enviar: enviar,
    ultima: null
  };

  function montar() {
    var form = $('v-form');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      if (e && e.preventDefault) e.preventDefault();
      API.ultima = enviar();
    });
  }

  global.VerificarActa = API;
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', montar);
  else montar();

})(window);
