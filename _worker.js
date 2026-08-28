// Worker de actascopropiedad.cl
//
//   GET  /cf-geo                    geolocalizacion aproximada por IP
//   POST /api/pago/crear            crea la orden en Flow y devuelve el checkout
//   POST /api/pago/confirmar        webhook de Flow (servidor a servidor)
//   GET  /api/pago/estado?orden=    la aplicacion consulta si ya se pago
//
// Cualquier otra ruta se delega a los assets estaticos.
//
// El precio y las credenciales viven en variables de entorno: nunca en el
// cliente y nunca en el repositorio. Ver GUIA-PASARELA.md.

import {
  extraerTextoPlano, interpretarRespuesta, codigoDesdeDestino, normalizarCorreo,
  construirRespuestaMime, textoAcuse
} from './consulta.js';

import { enviarCorreo, textoAvisoVoto, correoConfigurado } from './correo.js';

const FLOW = {
  sandbox: 'https://sandbox.flow.cl/api',
  produccion: 'https://www.flow.cl/api'
};

const PRECIO_POR_DEFECTO = 14990;
const PRECIO_CONSULTA_POR_DEFECTO = 7990;

// Los dos productos. El acta incluye la sala de votacion en vivo: sin acta,
// una sala no tiene para que existir. La consulta por escrito se vende sola
// porque reemplaza a la asamblea y ocurre en otra ocasion.
const PRODUCTOS = {
  acta: {
    variable: 'PRECIO_CLP',
    porDefecto: PRECIO_POR_DEFECTO,
    asunto: 'actaviva - acta de asamblea y votacion en vivo',
    vuelve: '/cuenta'
  },
  consulta: {
    variable: 'PRECIO_CONSULTA_CLP',
    porDefecto: PRECIO_CONSULTA_POR_DEFECTO,
    asunto: 'actaviva - consulta por escrito',
    vuelve: '/cuenta'
  }
};
const VIGENCIA_LLAVE_DIAS = 60;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

const enc = new TextEncoder();

async function hmacHex(secreto, mensaje) {
  const llave = await crypto.subtle.importKey(
    'raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', llave, enc.encode(mensaje));
  return [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Flow firma asi: parametros ordenados alfabeticamente, concatenados como
// nombre+valor sin separadores, y HMAC-SHA256 con la secretKey.
async function firmarFlow(params, secretKey) {
  const claves = Object.keys(params).sort();
  let aFirmar = '';
  for (const k of claves) aFirmar += k + params[k];
  return hmacHex(secretKey, aFirmar);
}

// Se exportan solo para las pruebas; el runtime de Workers usa "default".
export { hmacHex, firmarFlow, emitirLlave };

function base(env) {
  return FLOW[env.FLOW_ENTORNO === 'produccion' ? 'produccion' : 'sandbox'];
}

async function flowPost(env, servicio, params) {
  const s = await firmarFlow(params, env.FLOW_SECRET_KEY);
  const cuerpo = new URLSearchParams({ ...params, s });
  const r = await fetch(`${base(env)}/${servicio}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: cuerpo.toString()
  });
  return { ok: r.ok, estado: r.status, datos: await r.json().catch(() => null) };
}

async function flowGet(env, servicio, params) {
  const s = await firmarFlow(params, env.FLOW_SECRET_KEY);
  const q = new URLSearchParams({ ...params, s });
  const r = await fetch(`${base(env)}/${servicio}?${q}`, { method: 'GET' });
  return { ok: r.ok, estado: r.status, datos: await r.json().catch(() => null) };
}

const b64url = s => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// La llave que despues valida Postgres para permitir abrir la sala.
// Formato: <payload en base64url>.<hmac hex>
async function emitirLlave(env, orden, producto) {
  const vence = Math.floor(Date.now() / 1000) + VIGENCIA_LLAVE_DIAS * 86400;
  // 'p' es el producto pagado. Postgres lo lee para no dejar que una llave de
  // consulta abra un acta, ni al reves. Sin 'p' se entiende 'acta', que es lo
  // que valian todas las llaves anteriores a esta separacion.
  const payload = b64url(JSON.stringify({ o: orden, e: vence, p: producto || 'acta' }));
  const firma = await hmacHex(env.PAGO_SECRET, payload);
  return `${payload}.${firma}`;
}

const ordenNueva = () =>
  'AV-' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : String(Date.now()) + Math.random().toString(36).slice(2)).slice(0, 24).toUpperCase();

const correoValido = c => typeof c === 'string' && c.length <= 120 && /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(c);

function faltaConfig(env) {
  return !env.FLOW_API_KEY || !env.FLOW_SECRET_KEY || !env.PAGO_SECRET || !env.PAGOS;
}

async function crearPago(request, env, url) {
  if (faltaConfig(env)) return json({ error: 'pasarela_no_configurada' }, 503);

  let cuerpo = {};
  try { cuerpo = await request.json(); } catch { return json({ error: 'cuerpo_invalido' }, 400); }

  const correo = String(cuerpo.correo || '').trim().toLowerCase();
  if (!correoValido(correo)) return json({ error: 'correo_invalido' }, 400);

  // Que se esta comprando. Cualquier otra cosa se trata como acta.
  const producto = PRODUCTOS[cuerpo.producto] ? cuerpo.producto : 'acta';
  const cfg = PRODUCTOS[producto];

  // El monto lo fija el servidor. Lo que mande el cliente se ignora.
  const monto = Number(env[cfg.variable]) > 0
    ? Math.round(Number(env[cfg.variable]))
    : cfg.porDefecto;
  const orden = ordenNueva();

  const r = await flowPost(env, 'payment/create', {
    apiKey: env.FLOW_API_KEY,
    commerceOrder: orden,
    subject: cfg.asunto,
    currency: 'CLP',
    amount: String(monto),
    email: correo,
    paymentMethod: '9',
    urlConfirmation: `${url.origin}/api/pago/confirmar`,
    urlReturn: `${url.origin}${cfg.vuelve}?pago=${orden}`
  });

  if (!r.ok || !r.datos || !r.datos.url || !r.datos.token) {
    // El detalle de Flow se registra, no se devuelve: al cliente no le sirve
    // y puede describir la configuracion del comercio.
    console.log('flow rechazo la orden', r.estado, JSON.stringify(r.datos || null));
    return json({ error: 'flow_rechazo_la_orden' }, 502);
  }

  await env.PAGOS.put(
    `orden:${orden}`,
    JSON.stringify({ estado: 'pendiente', monto, correo, producto, creada: Date.now() }),
    { expirationTtl: VIGENCIA_LLAVE_DIAS * 86400 }
  );

  return json({ orden, redirigir: `${r.datos.url}?token=${r.datos.token}` });
}

// Flow avisa aqui cuando el pago cambia de estado. No confiamos en lo que
// llega en el cuerpo: solo tomamos el token y le volvemos a preguntar a Flow.
async function confirmarPago(request, env) {
  if (faltaConfig(env)) return new Response('sin configurar', { status: 503 });

  let token = '';
  try {
    const form = await request.formData();
    token = String(form.get('token') || '');
  } catch { /* Flow tambien puede mandarlo por query */ }
  if (!token) token = new URL(request.url).searchParams.get('token') || '';
  if (!token) return new Response('falta token', { status: 400 });

  const r = await flowGet(env, 'payment/getStatus', { apiKey: env.FLOW_API_KEY, token });
  const d = r.datos;
  if (!r.ok || !d || !d.commerceOrder) return new Response('no verificable', { status: 502 });

  const guardado = await env.PAGOS.get(`orden:${d.commerceOrder}`, { type: 'json' });
  if (!guardado) return new Response('orden desconocida', { status: 404 });

  // status 2 = pagado. Ademas exigimos que el monto calce con lo que cobramos.
  const pagado = Number(d.status) === 2 && Number(d.amount) === Number(guardado.monto);

  if (pagado && guardado.estado !== 'pagado') {
    const llave = await emitirLlave(env, d.commerceOrder, guardado.producto);
    await env.PAGOS.put(
      `orden:${d.commerceOrder}`,
      JSON.stringify({ ...guardado, estado: 'pagado', llave, flowOrder: d.flowOrder || null, pagada: Date.now() }),
      { expirationTtl: VIGENCIA_LLAVE_DIAS * 86400 }
    );
  }

  // Flow espera 200 aunque el pago no haya prosperado; si no, reintenta.
  return new Response('ok', { status: 200 });
}

async function estadoPago(env, url) {
  if (faltaConfig(env)) return json({ error: 'pasarela_no_configurada' }, 503);

  const orden = url.searchParams.get('orden') || '';
  if (!/^AV-[A-Z0-9]{1,32}$/.test(orden)) return json({ error: 'orden_invalida' }, 400);

  const g = await env.PAGOS.get(`orden:${orden}`, { type: 'json' });
  if (!g) return json({ estado: 'desconocida' }, 404);

  // El producto viaja de vuelta: el navegador guarda la llave en el casillero
  // que corresponde, y una llave de consulta no queda donde el acta la busca.
  return json(g.estado === 'pagado'
    ? { estado: 'pagado', llave: g.llave, producto: g.producto || 'acta' }
    : { estado: 'pendiente' });
}

// Respuestas a una consulta por escrito que llegan a c-CODIGO@el-dominio.
// La identidad se verifica por casilla: vale porque llega DESDE el correo
// inscrito en el Registro de Copropietarios (art. 17 del reglamento).
// Nunca se descarta una respuesta en silencio: si no se puede registrar, se
// reenvia a una casilla humana. Perder un voto sin que nadie se entere es
// peor que cualquier error visible.
async function aRevisionHumana(message, env, motivo) {
  console.log('consulta: a revision humana —', motivo);
  if (!env.CORREO_FALLBACK) return;
  try { await message.forward(env.CORREO_FALLBACK); }
  catch (e) { console.log('consulta: tampoco se pudo reenviar', e && e.message); }
}

// Acuse de recibo al copropietario. Sin esto, quien responde no sabe si su
// voto se contó — y si su redaccion no fue concluyente, no tiene forma de
// enterarse a tiempo para corregirla dentro del plazo.
// Solo se permite UNA respuesta por evento, asi que se llama una sola vez.
async function acusarRecibo(message, resultado, codigo) {
  const t = textoAcuse(resultado, codigo);
  if (!t) return;
  try {
    const { EmailMessage } = await import('cloudflare:email');
    const crudo = construirRespuestaMime(
      message.to, message.from, t.asunto, t.cuerpo, message.headers.get('message-id')
    );
    await message.reply(new EmailMessage(message.to, message.from, crudo));
  } catch (e) {
    // Un acuse fallido no invalida el voto: ya quedo registrado.
    console.log('consulta: no se pudo acusar recibo —', e && e.message);
  }
}

async function correoEntrante(message, env) {
  const codigo = codigoDesdeDestino(message.to);
  if (!codigo) {
    message.setReject('Dirección no corresponde a una consulta vigente');
    return;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON || !env.CORREO_SECRET) {
    await aRevisionHumana(message, env, 'falta configuracion');
    return;
  }

  const remitente = normalizarCorreo(message.from);

  let texto = '';
  try {
    const bruto = await new Response(message.raw).text();
    texto = extraerTextoPlano(bruto);
  } catch (e) {
    console.log('consulta: no se pudo leer el MIME', e && e.message);
  }

  // Si el texto no se pudo leer o no es concluyente, queda 'ambigua' y la
  // Mesa la resuelve a mano. Nunca se adivina el sentido de un voto.
  const { sentido } = interpretarRespuesta(texto);

  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cc_registrar_respuesta`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_ANON,
      authorization: `Bearer ${env.SUPABASE_ANON}`
    },
    body: JSON.stringify({
      p_codigo: codigo,
      p_correo: remitente,
      p_sentido: sentido,
      p_texto: texto.slice(0, 4000),
      p_message_id: message.headers.get('message-id') || null,
      p_secreto: env.CORREO_SECRET
    })
  });

  const datos = await r.json().catch(() => null);

  // PostgREST responde 200 aunque la funcion diga ok:false (remitente fuera
  // del padron, plazo vencido, consulta cerrada). Todo eso va a un humano.
  if (!r.ok || !datos || datos.ok !== true) {
    const motivo = (datos && datos.motivo) || ('http ' + r.status);
    await aRevisionHumana(message, env, motivo);
    // Si el motivo es explicable se le dice a la persona por que su respuesta
    // no se computo; si fue un fallo nuestro, textoAcuse devuelve null y no
    // se le escribe nada.
    await acusarRecibo(message, motivo, codigo);
    return;
  }

  await acusarRecibo(message, sentido, codigo);

  // No se registra ni el correo del votante ni el sentido de su voto: los
  // logs de Cloudflare tienen su propia retencion, fuera de las purgas que
  // controlamos. Basta con saber que la respuesta entro.
  console.log('consulta', codigo, 'respuesta registrada');
}

// La Mesa pide, al cerrar un punto, que se avise a quienes votaron.
// Va por el servidor y no por el navegador del votante a proposito: si
// dependiera de este, un suplantador simplemente no lo llamaria.
async function avisarVotos(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON || !env.CORREO_SECRET) {
    return json({ error: 'avisos_no_configurados' }, 503);
  }
  if (!correoConfigurado(env)) return json({ error: 'correo_no_configurado' }, 503);

  let cuerpo = {};
  try { cuerpo = await request.json(); } catch { return json({ error: 'cuerpo_invalido' }, 400); }
  const codigo = String(cuerpo.codigo || '').toUpperCase();
  const token  = String(cuerpo.token || '');
  if (!/^[A-Z0-9]{4,12}$/.test(codigo) || token.length < 16) {
    return json({ error: 'parametros_invalidos' }, 400);
  }

  const rpc = async (fn, args) => {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON,
        authorization: `Bearer ${env.SUPABASE_ANON}`
      },
      body: JSON.stringify(args)
    });
    return { ok: r.ok, estado: r.status, datos: await r.json().catch(() => null) };
  };

  const pend = await rpc('vv_avisos_pendientes',
    { p_codigo: codigo, p_token: token, p_secreto: env.CORREO_SECRET });
  if (!pend.ok || !Array.isArray(pend.datos)) return json({ error: 'no_autorizado' }, 403);

  const entregados = [];
  let fallidos = 0;
  for (const a of pend.datos) {
    const t = textoAvisoVoto({
      nombre: a.nombre, unidad: a.unidad, sentido: a.sentido,
      punto: a.punto, condominio: cuerpo.condominio, codigo
    });
    const env_ = await enviarCorreo(env, { para: a.correo, asunto: t.asunto, texto: t.cuerpo });
    if (env_.ok) entregados.push({ rut: a.rut, punto: a.punto });
    else fallidos++;
  }

  // Solo se marca lo que el proveedor acepto: lo demas se reintenta en
  // la proxima llamada, en vez de darse por avisado y perderse.
  if (entregados.length) {
    await rpc('vv_avisos_confirmar', {
      p_codigo: codigo, p_token: token, p_secreto: env.CORREO_SECRET, p_entregados: entregados
    });
  }

  return json({ enviados: entregados.length, fallidos });
}

// ---------------------------------------------------------------------
//  Claves filtradas (HaveIBeenPwned, k-anonimato)
//
//  El navegador manda SOLO los 5 primeros caracteres del SHA-1 de la clave.
//  Con eso HIBP devuelve varios cientos de sufijos, y aqui se busca el que
//  corresponde. La clave completa no viaja nunca, ni a nosotros ni a ellos.
//
//  Supabase trae esto en el plan Pro. El algoritmo es publico, asi que se
//  hace igual y gratis.
// ---------------------------------------------------------------------
async function claveFiltrada(request) {
  let prefijo, sufijo;
  try {
    const b = await request.json();
    prefijo = String(b.prefijo || '').toUpperCase();
    sufijo  = String(b.sufijo  || '').toUpperCase();
  } catch (e) {
    return json({ error: 'cuerpo_invalido' }, 400);
  }

  // Solo un prefijo hexadecimal de 5. Cualquier otra cosa es un intento de
  // usarnos de proxy hacia otro sitio.
  if (!/^[0-9A-F]{5}$/.test(prefijo) || !/^[0-9A-F]{35}$/.test(sufijo)) {
    return json({ error: 'formato_invalido' }, 400);
  }

  let texto;
  try {
    const r = await fetch('https://api.pwnedpasswords.com/range/' + prefijo, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'actaviva' },
      cf: { cacheTtl: 86400, cacheEverything: true }
    });
    if (!r.ok) throw new Error('hibp ' + r.status);
    texto = await r.text();
  } catch (e) {
    // Si el servicio no responde, no se bloquea el registro: se deja pasar.
    // Preferible una clave sin revisar que una persona sin poder entrar.
    return json({ filtrada: false, revisada: false });
  }

  let veces = 0;
  for (const linea of texto.split('\n')) {
    const c = linea.indexOf(':');
    if (c < 0) continue;
    if (linea.slice(0, c).trim().toUpperCase() === sufijo) {
      veces = parseInt(linea.slice(c + 1).trim(), 10) || 0;
      break;
    }
  }

  return json({ filtrada: veces > 0, veces: veces, revisada: true });
}

export default {
  async email(message, env, ctx) {
    ctx.waitUntil(correoEntrante(message, env).catch(e =>
      console.log('consulta: fallo al procesar', e && e.message)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    // Nada viaja en claro. La zona no fuerza HTTPS por si sola (comprobado en
    // vivo el 27-08-2026: http:// entregaba la pagina completa con 200), y el
    // HSTS solo protege a quien ya nos visito. 301 y a otra cosa.
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    // Sitio suspendido. Responde 404 a todo: para quien llegue de fuera, la
    // direccion sencillamente no existe.
    //
    // No se sirve el 404.html del sitio: va con la marca y con diez enlaces
    // que caerian todos aqui mismo. Un cuerpo minimo y a otra cosa.
    //
    // Ojo con el correo: esto solo gobierna fetch(). El email() de arriba
    // sigue recibiendo las respuestas de las consultas por escrito, que es lo
    // que se quiere -no se pierde el voto de nadie mientras el sitio duerme-.
    if (String(env.RECESO) === '1') {
      return new Response('404 — no encontrado', {
        status: 404,
        headers: {
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store'
        }
      });
    }

    if (url.pathname === '/cf-geo') {
      const cf = request.cf || {};
      return json({ pais: cf.country || null, region: cf.region || null, ciudad: cf.city || null });
    }

    if (url.pathname === '/api/pago/crear') {
      if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);
      return crearPago(request, env, url);
    }

    if (url.pathname === '/api/pago/confirmar') {
      if (request.method !== 'POST' && request.method !== 'GET') {
        return new Response('metodo no permitido', { status: 405 });
      }
      return confirmarPago(request, env);
    }

    if (url.pathname === '/api/voto/avisos') {
      if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);
      return avisarVotos(request, env);
    }

    if (url.pathname === '/api/clave/filtrada') {
      if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405);
      return claveFiltrada(request);
    }

    if (url.pathname === '/api/pago/estado') {
      if (request.method !== 'GET') return json({ error: 'metodo_no_permitido' }, 405);
      return estadoPago(env, url);
    }

    return env.ASSETS.fetch(request);
  }
};
