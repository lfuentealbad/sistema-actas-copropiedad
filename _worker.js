// Worker de actascopropiedad.cl
//
//   GET  /cf-geo                    geolocalizacion aproximada por IP
//   POST /api/pago/crear            crea la orden de un mes en Flow y devuelve el checkout (con sesion)
//   POST /api/pago/confirmar        webhook de Flow (servidor a servidor): registra el mes en Postgres
//   GET  /api/pago/estado?orden=    la aplicacion consulta si ya se pago y hasta cuando (con sesion)
//   POST /api/voto/avisos           constancia de voto por correo; la pide la Mesa
//   POST /api/voto/codigo           codigo de un solo uso al correo del votante
//   POST /api/clave/filtrada        clave filtrada, por k-anonimato contra HIBP
//   POST /api/csp                   informes de violacion de la CSP
//
// Cualquier otra ruta se delega a los assets estaticos.
//
// El precio y las credenciales viven en variables de entorno: nunca en el
// cliente y nunca en el repositorio. Ver GUIA-PASARELA.md.

import {
  extraerTextoPlano, interpretarRespuesta, codigoDesdeDestino, normalizarCorreo,
  construirRespuestaMime, textoAcuse, contextoDeRespuesta
} from './consulta.js';

import { enviarCorreo, textoAvisoVoto, textoCodigoVoto, correoConfigurado, sinEnlaces } from './correo.js';

import { verificarDkim, txtPorDoh } from './dkim.js';

const FLOW = {
  sandbox: 'https://sandbox.flow.cl/api',
  produccion: 'https://www.flow.cl/api'
};

// Adonde puede mandar Flow al comprador. Si la respuesta de payment/create
// trajera otra cosa, no se le entrega al navegador: redirigir a alguien a
// una direccion que no controlamos, con nuestro nombre, es peor que un error.
const PASARELA = /^https:\/\/(www|sandbox)\.flow\.cl\//;

const PRECIO_POR_DEFECTO = 14990;

// Un solo producto desde el 07-10-2026: un mes de servicio para UN
// condominio, con todas las herramientas (el acta con folio, la votacion en
// vivo, la consulta por escrito, el acta del comite y las cuentas). El
// administrador que lleva varios condominios paga un mes por cada uno: el
// nombre del condominio viaja firmado en la llave y Postgres compara con el
// los documentos que emite (paso 17, pase_exigir).
const MES = {
  variable: 'PRECIO_CLP',
  porDefecto: PRECIO_POR_DEFECTO,
  asunto: 'actaviva - un mes de servicio',
  vuelve: '/cuenta'
};
// La llave sirve para registrar el mes durante 60 dias: Flow reintenta el
// aviso, y la persona puede volver con el numero de orden.
const VIGENCIA_LLAVE_DIAS = 60;

// Fecha desde la que rigen los terminos publicados en /terminos. Es lo que el
// navegador declara haber aceptado y lo que queda guardado con cada orden.
// Si se publican terminos nuevos, cambia aqui, en terminos.html y en el
// TERMINOS_VERSION de cuenta.js: hay una prueba que no los deja separarse.
const TERMINOS_VERSION = '2026-10-20';

// El sitio tiene un solo nombre. Las URL que se le entregan a Flow salen de
// aqui y no de la peticion: asi da lo mismo por que nombre se entro y que
// otros nombres apunten a este Worker (un *.workers.dev, una vista previa).
const HOST = 'actascopropiedad.cl';
const ORIGEN = 'https://' + HOST;
// En desarrollo (wrangler dev) el sitio vive en localhost y ahi si vale el
// origen de la peticion: si no, Flow devolveria al comprador a produccion.
const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1']);

// Cuanto puede pesar el cuerpo de cada ruta. Ninguno necesita mas de un par
// de kilobytes; el de /api/csp es el que fija el navegador y trae la muestra
// del codigo bloqueado, por eso es el mas holgado.
const TOPE = { crear: 2048, confirmar: 4096, avisos: 4096, codigo: 1024, clave: 1024, csp: 8192 };

// Un correo de respuesta a una consulta cabe en unas lineas. Del mensaje se
// lee solo el primer mega: el interprete trabaja con expresiones regulares
// sobre el cuerpo entero y no hay por que darle diez megas de adjuntos.
const TOPE_CORREO = 1024 * 1024;

// Ninguna llamada a un tercero puede quedarse colgada mas que esto. Sin
// tope, un proveedor lento se come el tiempo del Worker y el que espera es
// el copropietario o la Mesa.
const ESPERA = { flow: 10000, supabase: 8000, hibp: 5000, dns: 5000 };

// Constancias de voto por invocacion. Cada una es una subpeticion y el
// Worker tiene un tope por invocacion (50 en el plan gratuito): 1 consulta
// de pendientes + 40 envios + 2 confirmaciones por lote quedan bajo el tope.
// El lote cuenta votos, no correos: todo voto que se confirma tuvo al menos
// un envio, asi que con 40 envios no hay mas de 40 votos por confirmar.
const MAX_AVISOS = 40;
const LOTE_AVISOS = 20;

// ---------------------------------------------------------------------
//  Respuestas propias del Worker
//
//  _headers solo lo aplica la capa de assets. Lo que el Worker arma a mano
//  -JSON, texto plano, redirecciones, el 404 del receso- no pasa por ahi y
//  salia sin HSTS, sin nosniff y sin CSP (comprobado en vivo el 22-09-2026
//  en /cf-geo). Por eso TODA respuesta propia sale de responder(): la
//  prueba prueba-seg-worker.mjs se queja si aparece otro new Response.
//
//  La CSP es la minima que existe porque estas respuestas no son documentos
//  y no cargan nada. HSTS y Permissions-Policy dicen lo mismo que _headers;
//  la segunda faltaba y Acunetix la marca en cada respuesta que no la trae
//  (comprobado en vivo el 28-09-2026 en /api/* y /cf-geo).
// ---------------------------------------------------------------------
const CABECERAS_SEGURIDAD = {
  'x-content-type-options': 'nosniff',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'permissions-policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), browsing-topics=()',
  'x-frame-options': 'DENY'
};

function responder(cuerpo, status, extra) {
  const h = new Headers(CABECERAS_SEGURIDAD);
  for (const k of Object.keys(extra || {})) h.set(k, extra[k]);
  return new Response(cuerpo, { status, headers: h });
}

const json = (obj, status = 200, extra) =>
  responder(JSON.stringify(obj), status,
    { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra });

const textoPlano = (t, status) =>
  responder(t, status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });

// Sin no-store: un 301 es permanente a proposito, y que el navegador lo
// recuerde ahorra la vuelta en claro la proxima vez.
const redirigir = destino => responder(null, 301, { location: destino });

// Lo que va al log: sin saltos ni caracteres de control -una linea es una
// linea- y con tope, porque parte de esto lo escribe quien llama.
const paraLog = (v, max) =>
  String(v == null ? '' : v).replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ').slice(0, max);

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

// El entorno de Flow: solo "produccion" cobra de verdad. Cualquier otro
// valor, o ninguno, es el sandbox.
const entornoFlow = env => env.FLOW_ENTORNO === 'produccion' ? 'produccion' : 'sandbox';

function base(env) {
  return FLOW[entornoFlow(env)];
}

// Sin red o sin respuesta a tiempo, para quien llama es lo mismo que un
// rechazo de Flow: la orden no se crea y el webhook responde 502, que hace
// que Flow reintente.
async function flowPost(env, servicio, params) {
  const s = await firmarFlow(params, env.FLOW_SECRET_KEY);
  const cuerpo = new URLSearchParams({ ...params, s });
  try {
    const r = await fetch(`${base(env)}/${servicio}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: cuerpo.toString(),
      signal: AbortSignal.timeout(ESPERA.flow)
    });
    return { ok: r.ok, estado: r.status, datos: await r.json().catch(() => null) };
  } catch (e) {
    return { ok: false, estado: 0, datos: null };
  }
}

async function flowGet(env, servicio, params) {
  const s = await firmarFlow(params, env.FLOW_SECRET_KEY);
  const q = new URLSearchParams({ ...params, s });
  try {
    const r = await fetch(`${base(env)}/${servicio}?${q}`, {
      method: 'GET', signal: AbortSignal.timeout(ESPERA.flow)
    });
    return { ok: r.ok, estado: r.status, datos: await r.json().catch(() => null) };
  } catch (e) {
    return { ok: false, estado: 0, datos: null };
  }
}

// base64url de los BYTES UTF-8 del texto. btoa() a secas toma cada caracter
// como un byte latin-1: «Ñuñoa» salia en latin-1 y Postgres, que lee UTF-8,
// rechazaba la llave. Para ASCII da exactamente lo mismo que antes.
const b64url = s => {
  let bin = '';
  for (const b of new TextEncoder().encode(s)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// La llave con que Postgres registra el mes (pase_registrar).
// Formato: <payload en base64url>.<hmac hex>
//   o  la orden            e  hasta cuando sirve para registrarlo
//   p  'mes', el producto  s  el entorno de Flow en que se pago (CN-005: la
//   u  la cuenta              del sandbox no vale en produccion)
//   t  cuando se pago      c  el condominio para el que se compro
// La cuenta, el momento y el condominio van firmados: por eso Postgres puede
// registrarla sin sesion, y tenerla solo sirve para darle el mes a quien pago.
async function emitirLlave(env, orden, datos) {
  const vence = Math.floor(Date.now() / 1000) + VIGENCIA_LLAVE_DIAS * 86400;
  const payload = b64url(JSON.stringify({
    o: orden, e: vence, p: 'mes', s: entornoFlow(env),
    u: datos.uid, t: Math.floor(datos.pagada / 1000), c: datos.condominio
  }));
  const firma = await hmacHex(env.PAGO_SECRET, payload);
  return `${payload}.${firma}`;
}

// El nombre del condominio tal como se va a guardar: sin espacios de mas ni
// caracteres de control, de 2 a 100 caracteres y con al menos una letra o
// un numero (Postgres compara por letras y numeros: sin ninguno no hay con
// que comparar). '' si no sirve.
function condominioValido(v) {
  const s = String(v == null ? '' : v)
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > 100) return '';
  return /[\p{L}\p{N}]/u.test(s) ? s : '';
}

// Registra el mes en Postgres. Nunca lanza: { ok, estado, datos }. Lo llaman
// el aviso de Flow y la consulta de la orden; la base devuelve lo mismo si
// el mes ya estaba (ya_estaba), asi que da igual quien llegue primero.
async function registrarMes(env, llave) {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/pase_registrar`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON,
        authorization: `Bearer ${env.SUPABASE_ANON}`
      },
      body: JSON.stringify({ p_llave: llave }),
      signal: AbortSignal.timeout(ESPERA.supabase)
    });
    const datos = await r.json().catch(() => null);
    return { ok: r.ok && !!datos && !!datos.hasta, estado: r.status, datos };
  } catch (e) {
    return { ok: false, estado: 0, datos: null };
  }
}

// 12 bytes de getRandomValues: 96 bits, los 24 hexadecimales de siempre.
// Antes se recortaba un randomUUID, que trae dos cifras fijas (la version y
// la variante), con una rama de reserva sobre Math.random que en Workers no
// corria nunca pero que cualquier analizador marcaba.
function ordenNueva() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return 'AV-' + [...b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const correoValido = c => typeof c === 'string' && c.length <= 120 && /^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(c);

function faltaConfig(env) {
  return !env.FLOW_API_KEY || !env.FLOW_SECRET_KEY || !env.PAGO_SECRET || !env.PAGOS;
}

// ---------------------------------------------------------------------
//  Lectura acotada del cuerpo (W-13)
//
//  Se mira el content-length declarado y ADEMAS se cuenta lo que llega de
//  verdad: la cabecera la escribe el cliente y puede faltar (chunked) o
//  mentir. Lo que pase del tope no se lee.
// ---------------------------------------------------------------------
// Bytes -> cadena binaria (un caracter por byte, 0-255), lo que espera
// extraerTextoPlano. Por tramos: apply con un arreglo de un mega revienta la
// pila.
export function binarioDe(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return s;
}

async function leerHasta(flujo, max) {
  if (!flujo) return { bytes: new Uint8Array(0), excedido: false };
  const lector = flujo.getReader();
  const partes = [];
  let total = 0, excedido = false;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      const trozo = value instanceof Uint8Array ? value : new Uint8Array(value);
      if (total + trozo.byteLength > max) {
        partes.push(trozo.subarray(0, max - total));
        total = max;
        excedido = true;
        break;
      }
      partes.push(trozo);
      total += trozo.byteLength;
    }
  } finally {
    // Se suelta el flujo sin cancelarlo: en el correo entrante, el mismo
    // mensaje puede tener que reenviarse despues a una persona.
    try { lector.releaseLock(); } catch { /* ya estaba suelto */ }
  }
  const bytes = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { bytes.set(p, i); i += p.byteLength; }
  return { bytes, excedido };
}

async function cuerpoAcotado(request, max) {
  const declarado = Number(request.headers.get('content-length') || 0);
  if (declarado > max) return { grande: true };
  const { bytes, excedido } = await leerHasta(request.body, max);
  if (excedido) return { grande: true };
  return { texto: new TextDecoder().decode(bytes) };
}

// Un objeto JSON o una respuesta de error lista para devolver. Un "null" o
// un arreglo tambien son JSON valido, y antes reventaban mas abajo con un
// 500 al leer cuerpo.acepta.
async function jsonAcotado(request, max) {
  const c = await cuerpoAcotado(request, max);
  if (c.grande) return { respuesta: json({ error: 'cuerpo_demasiado_grande' }, 413) };
  let v = null;
  try { v = JSON.parse(c.texto); } catch { v = null; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return { respuesta: json({ error: 'cuerpo_invalido' }, 400) };
  }
  return { datos: v };
}

// ---------------------------------------------------------------------
//  Limite de tasa (W-03, contrato C7)
//
//  Dos bindings de Rate Limiting de Cloudflare (wrangler.jsonc), por IP:
//    LIMITE_ESTRICTO  pago y clave filtrada: cada llamada crea una orden en
//                     Flow, pregunta a Supabase Auth o sale a HIBP.
//    LIMITE_GENERAL   /cf-geo, /api/csp, los avisos de voto y el webhook.
//  El webhook de Flow va en el general y no en el estricto: lo llama Flow
//  desde unas pocas IP, y un 429 ahi atrasaria la confirmacion de pagos
//  reales. Si el binding no existe (pruebas, wrangler dev) o falla, se deja
//  pasar: un contador caido no puede apagar el sitio.
// ---------------------------------------------------------------------
function limiteDe(ruta) {
  if (ruta === '/api/pago/confirmar') return 'LIMITE_GENERAL';
  // /api/voto/codigo manda un correo por llamada: va en el estricto, como el
  // pago y la clave filtrada.
  if (ruta.startsWith('/api/pago/') || ruta === '/api/clave/filtrada' || ruta === '/api/voto/codigo' ||
      ruta === '/api/prueba/aprobada' || ruta === '/api/prueba/aviso') {
    return 'LIMITE_ESTRICTO';
  }
  if (ruta === '/cf-geo' || ruta.startsWith('/api/')) return 'LIMITE_GENERAL';
  return null;
}

async function dentroDelLimite(env, nombre, request) {
  const limitador = env[nombre];
  if (!limitador || typeof limitador.limit !== 'function') return true;
  try {
    const { success } = await limitador.limit({ key: request.headers.get('cf-connecting-ip') || 'desconocida' });
    return success !== false;
  } catch (e) {
    console.log('limite: el contador fallo, se deja pasar', paraLog(e && e.message, 120));
    return true;
  }
}

// ---------------------------------------------------------------------
//  Sesion (contrato C1)
//
//  La orden de pago queda atada a la cuenta que la crea. Antes el numero de
//  orden era un secreto al portador: quien lo viera -en la URL de vuelta,
//  en el comprobante reenviado al tesorero, en el historial- se llevaba la
//  llave. El token no lo interpreta este Worker: lo valida Supabase Auth,
//  que en /auth/v1/user responde con el usuario solo si el token es vigente
//  y esta firmado por el proyecto.
// ---------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sesionDe(request, env) {
  const cab = (request.headers.get('authorization') || '').trim();
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec(cab);
  if (!m) return { estado: 'sin_sesion' };
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON) return { estado: 'sin_config' };
  let r;
  try {
    r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON, authorization: `Bearer ${m[1]}` },
      signal: AbortSignal.timeout(ESPERA.supabase)
    });
  } catch (e) {
    return { estado: 'no_verificable' };
  }
  // Un token vencido, adulterado o de otro proyecto. Cualquier otra cosa
  // -un 5xx, un 429 de Supabase- no es culpa del token, y pedirle a la
  // persona que vuelva a entrar no lo arreglaria.
  if ([400, 401, 403, 404].includes(r.status)) return { estado: 'sin_sesion' };
  if (!r.ok) return { estado: 'no_verificable' };
  const u = await r.json().catch(() => null);
  if (!u || !UUID.test(String(u.id || ''))) return { estado: 'sin_sesion' };
  return { estado: 'ok', uid: String(u.id).toLowerCase(), correo: String(u.email || '').trim().toLowerCase() };
}

// ---------------------------------------------------------------------
//  Prueba por solicitud (paso 19, 18-10-2026)
// ---------------------------------------------------------------------
// El panel guarda la solicitud con la RPC solicitar_prueba y despues llama
// aqui. El Worker la lee con la sesion de la propia persona (no confia en
// nada que venga en el cuerpo) y le escribe al dueno a CORREO_FALLBACK, una
// sola vez por solicitud (marca en KV). Si el correo no esta configurado,
// la solicitud igual queda en la base: el dueno la ve con
//   select * from public.solicitudes_prueba where estado = 'pendiente';
async function avisoPrueba(request, env) {
  const s = await sesionDe(request, env);
  if (s.estado !== 'ok') return sinSesion(s);
  const token = /^Bearer\s+(\S+)$/.exec((request.headers.get('authorization') || '').trim())[1];
  let d;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/mi_solicitud_prueba`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(ESPERA.supabase)
    });
    if (!r.ok) return json({ ok: false }, 502);
    d = await r.json();
  } catch (e) {
    return json({ ok: false }, 502);
  }
  if (!d || d.estado !== 'pendiente' || !UUID.test(String(d.id || ''))) return json({ ok: true, enviado: false });
  const marca = 'aviso-prueba:' + d.id;
  if (env.PAGOS && await env.PAGOS.get(marca)) return json({ ok: true, enviado: false });
  const limpio = v => sinEnlaces(String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ')).slice(0, 200);
  const texto = [
    'Llegó una solicitud de prueba a actaviva.',
    '',
    'Nombre: ' + limpio(d.nombre),
    'Correo: ' + limpio(d.correo),
    'Teléfono: ' + limpio(d.telefono),
    'Condominio: ' + limpio(d.condominio),
    'Comuna: ' + limpio(d.comuna),
    'Rol: ' + limpio(d.rol),
    'Unidades: ' + limpio(d.unidades),
    '',
    // Paso 20: se aprueba o rechaza desde el panel de la cuenta revisora.
    'Para aprobarla o rechazarla, entre a su panel:',
    ORIGEN + '/cuenta#s-mes'
  ].join('\n');
  const envio = await enviarCorreo(env, { para: env.CORREO_FALLBACK, asunto: 'actaviva: solicitud de prueba', texto });
  if (envio.ok && env.PAGOS) await env.PAGOS.put(marca, '1', { expirationTtl: 60 * 60 * 24 * 30 });
  if (!envio.ok) console.log('prueba', 'aviso no enviado', paraLog(envio.motivo || '', 60));
  return json({ ok: true, enviado: !!envio.ok });
}

// Al aprobar una prueba, la persona recibe un correo (20-10-2026): sin
// aviso, quien la pidio tenia que volver a mirar el panel y podia perder el
// interes. Lo pide el panel de la cuenta revisora despues de resolver_prueba.
// El Worker no confia en lo que le mandan: lee la solicitud con la sesion de
// quien pide (solicitudes_para_revisar exige revisor y segundo factor) y
// solo escribe al correo que la base tiene para esa solicitud aprobada.
async function avisoAprobada(request, env) {
  const s = await sesionDe(request, env);
  if (s.estado !== 'ok') return sinSesion(s);
  const leido = await jsonAcotado(request, TOPE.codigo);
  if (leido.respuesta) return leido.respuesta;
  const id = String(leido.datos.id || '');
  if (!UUID.test(id)) return json({ error: 'solicitud_invalida' }, 400);
  const token = /^Bearer\s+(\S+)$/.exec((request.headers.get('authorization') || '').trim())[1];
  let d;
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/solicitudes_para_revisar`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_ANON, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(ESPERA.supabase)
    });
    if (r.status === 400 || r.status === 401 || r.status === 403) return json({ error: 'no_autorizado' }, 403);
    if (!r.ok) return json({ ok: false }, 502);
    d = await r.json();
  } catch (e) {
    return json({ ok: false }, 502);
  }
  const x = ((d && d.resueltas) || []).find(f => f && f.id === id && f.estado === 'aprobada');
  if (!x) return json({ ok: true, enviado: false });
  const marca = 'aviso-aprobada:' + id;
  if (env.PAGOS && await env.PAGOS.get(marca)) return json({ ok: true, enviado: false });
  const limpio = v => sinEnlaces(String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ')).slice(0, 200);
  const nombre = limpio(x.nombre).split(' ')[0];
  const texto = [
    (nombre ? 'Hola, ' + nombre + ':' : 'Hola:'),
    '',
    'Aprobamos su solicitud de prueba en actaviva. Su cuenta tiene un mes completo de servicio para «' + limpio(x.condominio) + '», con todas las herramientas: el acta de asamblea con folio, la votación en vivo, la consulta por escrito, el acta del comité y las cuentas del condominio.',
    '',
    'Entre a su panel para empezar. En «Mi servicio» verá hasta qué día está vigente el mes:',
    ORIGEN + '/cuenta',
    '',
    'Pronto lo contactaremos para acompañarlo durante la prueba.',
    '',
    '—',
    'actaviva · actascopropiedad.cl'
  ].join('\n');
  const envio = await enviarCorreo(env, { para: x.correo, asunto: 'actaviva: su prueba fue aprobada', texto });
  if (envio.ok && env.PAGOS) await env.PAGOS.put(marca, '1', { expirationTtl: 60 * 60 * 24 * 30 });
  if (!envio.ok) console.log('prueba', 'aviso de aprobacion no enviado', paraLog(envio.motivo || '', 60));
  return json({ ok: true, enviado: !!envio.ok });
}

function sinSesion(s) {
  if (s.estado === 'sin_sesion') return json({ error: 'sesion_requerida' }, 401);
  if (s.estado === 'sin_config') return json({ error: 'pasarela_no_configurada' }, 503);
  return json({ error: 'sesion_no_verificable' }, 503);
}

// CN-005 (28-09-2026). En el sandbox de Flow cualquiera paga con las
// tarjetas de prueba publicadas. Fuera de desarrollo, la pasarela solo
// atiende en produccion, salvo que PAGOS_PRUEBA=1 lo pida a proposito para
// ensayar (y aun asi Postgres no acepta esas llaves si no se le dice).
function sandboxVedado(env, url) {
  return entornoFlow(env) !== 'produccion' && !HOSTS_LOCALES.has(url.hostname) && String(env.PAGOS_PRUEBA) !== '1';
}

async function crearPago(request, env, url) {
  const leido = await jsonAcotado(request, TOPE.crear);
  if (leido.respuesta) return leido.respuesta;
  const cuerpo = leido.datos;

  // Ley 19.496 art. 12 A: el proveedor tiene que poder acreditar que hubo
  // aceptacion. Esto no le cierra el paso a quien lea el codigo -la version
  // esta publicada en cuenta.js y basta con mandarla-; lo que hace es dejar
  // constancia, con la orden y con la cuenta que la crea, de que version
  // del texto se declaro aceptar y cuando. Es prueba, no control de acceso.
  if (String(cuerpo.acepta || '') !== TERMINOS_VERSION) {
    return json({ error: 'terminos_no_aceptados' }, 400);
  }

  // La sesion va despues de lo que no pide red: validarla cuesta una
  // subpeticion a Supabase, y una peticion mal formada no la merece.
  const s = await sesionDe(request, env);
  if (s.estado !== 'ok') return sinSesion(s);

  // Lo que falte de configuracion se dice recien a quien tiene sesion
  // (CN-032): antes, cualquiera sabia por esta ruta que faltaban los
  // secretos de la pasarela.
  if (faltaConfig(env)) return json({ error: 'pasarela_no_configurada' }, 503);
  if (sandboxVedado(env, url)) return json({ error: 'pasarela_en_pruebas' }, 503);

  // El comprobante de Flow va al correo de la cuenta. El que venga en el
  // cuerpo ya no cuenta: era la unica forma de amarrar la orden a alguien,
  // y ahora la amarra la sesion.
  const correo = s.correo;
  if (!correoValido(correo)) return json({ error: 'correo_invalido' }, 400);

  // Para que condominio es el mes. Lo que venga en 'producto' ya no
  // importa: hay uno solo.
  const condominio = condominioValido(cuerpo.condominio);
  if (!condominio) return json({ error: 'condominio_invalido' }, 400);
  const cfg = MES;

  // El monto lo fija el servidor. Lo que mande el cliente se ignora.
  const monto = Number(env[cfg.variable]) > 0
    ? Math.round(Number(env[cfg.variable]))
    : cfg.porDefecto;
  const orden = ordenNueva();
  const origen = HOSTS_LOCALES.has(url.hostname) ? url.origin : ORIGEN;

  const r = await flowPost(env, 'payment/create', {
    apiKey: env.FLOW_API_KEY,
    commerceOrder: orden,
    subject: cfg.asunto,
    currency: 'CLP',
    amount: String(monto),
    email: correo,
    paymentMethod: '9',
    urlConfirmation: `${origen}/api/pago/confirmar`,
    urlReturn: `${origen}${cfg.vuelve}?pago=${orden}`
  });

  // El flowOrder es el numero con que Flow conoce este pago: se guarda con
  // la orden y el aviso de pago tiene que traer el mismo (confirmarPago).
  const flowOrder = r.datos && /^\d{1,20}$/.test(String(r.datos.flowOrder ?? '')) ? String(r.datos.flowOrder) : '';
  if (!r.ok || !r.datos || !r.datos.url || !r.datos.token || !PASARELA.test(String(r.datos.url)) || !flowOrder) {
    // Del error de Flow se registra el codigo y el mensaje, nada mas: el
    // objeto entero puede traer el correo del comprador, y los logs de
    // Cloudflare tienen su propia retencion. Al cliente no se le devuelve:
    // no le sirve y puede describir la configuracion del comercio.
    const d = r.datos || {};
    console.log('flow rechazo la orden', r.estado, paraLog(d.code, 20), paraLog(d.message, 200));
    return json({ error: 'flow_rechazo_la_orden' }, 502);
  }

  await env.PAGOS.put(
    `orden:${orden}`,
    // La aceptacion queda con la orden: es lo que permite acreditar despues
    // que la hubo, cuando, y sobre que version del texto. El uid es de quien
    // la creo: solo esa cuenta puede despues recoger la llave.
    JSON.stringify({
      estado: 'pendiente', monto, correo, producto: 'mes', condominio, uid: s.uid, flowOrder, creada: Date.now(),
      terminos: { version: TERMINOS_VERSION, aceptados: new Date().toISOString() }
    }),
    { expirationTtl: VIGENCIA_LLAVE_DIAS * 86400 }
  );

  return json({ orden, redirigir: `${r.datos.url}?token=${encodeURIComponent(r.datos.token)}` });
}

// Flow avisa aqui cuando el pago cambia de estado. No confiamos en lo que
// llega en el cuerpo: solo tomamos el token y le volvemos a preguntar a Flow.
async function confirmarPago(request, env) {
  if (faltaConfig(env)) return textoPlano('sin configurar', 503);

  let token = '';
  const c = await cuerpoAcotado(request, TOPE.confirmar);
  if (c.grande) return textoPlano('demasiado grande', 413);
  if (c.texto) {
    try {
      const tipo = request.headers.get('content-type') || '';
      if (/multipart\/form-data/i.test(tipo)) {
        const form = await new Request('https://flow.invalid/', {
          method: 'POST', headers: { 'content-type': tipo }, body: c.texto
        }).formData();
        token = String(form.get('token') || '');
      } else {
        token = new URLSearchParams(c.texto).get('token') || '';
      }
    } catch { /* Flow tambien puede mandarlo por query */ }
  }
  if (!token) token = new URL(request.url).searchParams.get('token') || '';
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(token)) return textoPlano('falta token', 400);

  const r = await flowGet(env, 'payment/getStatus', { apiKey: env.FLOW_API_KEY, token });
  const d = r.datos;
  if (!r.ok || !d || !/^AV-[A-Z0-9]{1,32}$/.test(String(d.commerceOrder || ''))) {
    return textoPlano('no verificable', 502);
  }

  const guardado = await env.PAGOS.get(`orden:${d.commerceOrder}`, { type: 'json' });
  if (!guardado) return textoPlano('orden desconocida', 404);

  // status 2 = pagado. Ademas tiene que calzar con lo que se cobro: el monto,
  // la moneda (la orden se crea en CLP) y el flowOrder que Flow dio al crearla
  // (punto 7 de la revision del 30-09-2026). Una orden sin flowOrder anotado
  // -creada antes de este cambio- no calza: sus pagos se revisan a mano.
  const calza = Number(d.amount) === Number(guardado.monto)
    && String(d.currency || '').toUpperCase() === 'CLP'
    && !!guardado.flowOrder && String(d.flowOrder ?? '') === String(guardado.flowOrder);
  const pagado = Number(d.status) === 2 && calza;
  if (Number(d.status) === 2 && !calza) {
    // Sin el correo ni el monto: la orden basta para buscarla en Flow.
    console.log('flow: pago que no calza con su orden', paraLog(d.commerceOrder, 40));
  }

  if (!pagado) {
    // Flow espera 200 aunque el pago no haya prosperado; si no, reintenta.
    return textoPlano('ok', 200);
  }

  // Una orden de antes del paso 17 (sin cuenta o sin condominio) no se
  // puede registrar como mes: se revisa a mano con su numero.
  if (!guardado.uid || !guardado.condominio) {
    console.log('flow: orden pagada sin cuenta o sin condominio', paraLog(d.commerceOrder, 40));
    return textoPlano('ok', 200);
  }

  let g = guardado;
  if (g.estado !== 'pagado') {
    const pagada = Date.now();
    const llave = await emitirLlave(env, d.commerceOrder, { uid: g.uid, condominio: g.condominio, pagada });
    g = { ...g, estado: 'pagado', llave, pagada };
    await env.PAGOS.put(`orden:${d.commerceOrder}`, JSON.stringify(g), { expirationTtl: VIGENCIA_LLAVE_DIAS * 86400 });
  }
  const reg = await asegurarMes(env, d.commerceOrder, g);
  // Si la base no contesto, Flow tiene que volver a avisar: con un 200 el
  // pago quedaria cobrado y el mes sin registrar hasta que la persona
  // consultara la orden. Un rechazo de la base (4xx) no se arregla
  // reintentando: queda en el log para revisarlo.
  if (!reg.ok && (reg.estado === 0 || reg.estado >= 500)) return textoPlano('reintentar', 503);
  return textoPlano('ok', 200);
}

// El mes de una orden pagada, registrado en Postgres una sola vez. Lo que
// devolvio la base queda con la orden: las consultas siguientes no vuelven
// a llamarla.
async function asegurarMes(env, orden, g) {
  if (g.mes && g.mes.hasta) return { ok: true, datos: g.mes };
  const r = await registrarMes(env, g.llave);
  if (r.ok) {
    const mes = { condominio: r.datos.condominio, desde: r.datos.desde, hasta: r.datos.hasta };
    await env.PAGOS.put(`orden:${orden}`, JSON.stringify({ ...g, mes }), { expirationTtl: VIGENCIA_LLAVE_DIAS * 86400 });
    return { ok: true, datos: mes };
  }
  console.log('pase_registrar no registro el mes', paraLog(orden, 40), r.estado,
    paraLog(r.datos && (r.datos.message || r.datos.code), 120));
  return r;
}

async function estadoPago(request, env, url) {
  const s = await sesionDe(request, env);
  if (s.estado !== 'ok') return sinSesion(s);
  if (faltaConfig(env)) return json({ error: 'pasarela_no_configurada' }, 503);

  // Una orden que no existe, una de otra cuenta y un numero mal formado
  // responden exactamente lo mismo (contrato C1). Si no, esta ruta serviria
  // para saber que numeros existen, y la pagina tendria que distinguir tres
  // casos que para ella son uno: no hay llave que recoger. Las ordenes sin
  // uid -anteriores a la atadura- tampoco se entregan.
  const noEncontrada = () => json({ error: 'orden_no_encontrada' }, 404);
  const orden = url.searchParams.get('orden') || '';
  if (!/^AV-[A-Z0-9]{1,32}$/.test(orden)) return noEncontrada();

  const g = await env.PAGOS.get(`orden:${orden}`, { type: 'json' });
  if (!g || !g.uid || g.uid !== s.uid) return noEncontrada();

  if (g.estado !== 'pagado') return json({ estado: 'pendiente' });

  // La llave ya no sale al navegador: el mes vive en la base, atado a la
  // cuenta. Si el aviso de Flow no alcanzo a registrarlo, se registra aqui;
  // si la base no contesta, la pagina sigue preguntando ('activando').
  if (!g.llave || !g.condominio) return json({ estado: 'pendiente' });
  const reg = await asegurarMes(env, orden, g);
  if (!reg.ok) return json({ estado: 'activando' });
  return json({ estado: 'pagado', condominio: reg.datos.condominio, desde: reg.datos.desde, hasta: reg.datos.hasta });
}

// Respuestas a una consulta por escrito que llegan a c-CODIGO@el-dominio.
// La identidad se verifica por casilla: vale porque llega DESDE el correo
// inscrito en el Registro de Copropietarios (art. 17 del reglamento), y
// desde el 28-09-2026 "desde" quiere decir firmado por el dominio de esa
// casilla (DKIM, ver registrarRespuesta), no solo declarado en el sobre.
// Nunca se descarta una respuesta en silencio: si no se puede registrar, se
// reenvia a una casilla humana. Perder un voto sin que nadie se entere es
// peor que cualquier error visible.
async function aRevisionHumana(message, env, motivo) {
  console.log('consulta: a revision humana —', paraLog(motivo, 200));
  if (!env.CORREO_FALLBACK) return;
  try { await message.forward(env.CORREO_FALLBACK); }
  catch (e) { console.log('consulta: tampoco se pudo reenviar', paraLog(e && e.message, 200)); }
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
    console.log('consulta: no se pudo acusar recibo —', paraLog(e && e.message, 200));
  }
}

// El unico camino del correo entrante. Todo lo que lance -Supabase caido,
// un timeout, el tope de subpeticiones- termina en revision humana. Antes
// la excepcion subia hasta el catch de email(), que solo escribia una linea
// de log: el voto se perdia en silencio, justo lo que el comentario de
// arriba promete que no pasa.
async function correoEntrante(message, env) {
  try {
    await registrarRespuesta(message, env);
  } catch (e) {
    await aRevisionHumana(message, env, 'excepcion: ' + (e && e.message));
  }
}

async function registrarRespuesta(message, env) {
  const codigo = codigoDesdeDestino(message.to);
  if (!codigo) {
    message.setReject('Dirección no corresponde a una consulta vigente');
    return;
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_ANON || !env.CORREO_SECRET) {
    await aRevisionHumana(message, env, 'falta configuracion');
    return;
  }

  // CN-011 (28-09-2026). El remitente del sobre SMTP lo escribe quien envia,
  // y Cloudflare hoy no le entrega al Worker los veredictos SPF/DKIM/DMARC.
  // Por eso la firma DKIM se verifica aqui (dkim.js): el voto se atribuye a
  // la casilla del From solo si su dominio firmo el mensaje. Lo que no se
  // puede verificar llega a la base como no autenticado: nunca pisa una
  // respuesta y, si es la primera, queda 'ambigua' para que la Mesa la
  // confirme con la persona.
  let texto = '';
  let firma = { ok: false, motivo: 'no_leido' };
  try {
    // Un correo truncado que no se entiende queda 'ambigua' y va a la Mesa,
    // que es exactamente lo que se quiere con uno de varios megas. Truncado,
    // ademas, la firma no se puede verificar.
    const { bytes, excedido } = await leerHasta(message.raw, TOPE_CORREO);
    // Auditoria CN-010 (20-10-2026): el interprete decodifica cada parte MIME
    // con su charset y espera los bytes tal cual (un caracter por byte).
    // Antes se le pasaba el correo ya convertido desde UTF-8 y lo volvia a
    // decodificar: en una parte 8bit, «Sí» quedaba «S�» y «No sé», «No s�»,
    // que se leia como rechazo.
    texto = extraerTextoPlano(binarioDe(bytes));
    firma = excedido
      ? { ok: false, motivo: 'demasiado_grande' }
      : await verificarDkim(bytes, { resolverTxt: n => txtPorDoh(n, ESPERA.dns) });
  } catch (e) {
    console.log('consulta: no se pudo leer el MIME', paraLog(e && e.message, 200));
  }
  // CN-002 (30-09-2026). La firma dice quien escribio, no a que consulta
  // contesto: el codigo sale del sobre SMTP. Cuenta como autenticada solo si
  // algo firmado la ata a esta consulta y trae fecha firmada (consulta.js,
  // contextoDeRespuesta). Si no, va como no autenticada: nunca pisa una
  // respuesta y, si es la primera, queda para la Mesa.
  const contexto = contextoDeRespuesta(firma, codigo, message.to, texto);
  const autenticado = contexto.ok === true;
  const remitente = firma.ok === true ? firma.desde : normalizarCorreo(message.from);
  if (!autenticado) console.log('consulta', codigo, 'respuesta sin autenticar:', paraLog(contexto.motivo, 40));

  // Si el texto no se pudo leer o no es concluyente, queda 'ambigua' y la
  // Mesa la resuelve a mano. Nunca se adivina el sentido de un voto.
  const { sentido } = interpretarRespuesta(texto);

  const parametros = {
    p_codigo: codigo,
    p_correo: remitente,
    p_sentido: sentido,
    p_texto: texto.slice(0, 4000),
    // El Message-ID firmado, si lo hay: con el, la base reconoce un mismo
    // correo entregado dos veces y no lo vuelve a computar.
    p_message_id: (contexto.mensaje || message.headers.get('message-id') || '').slice(0, 998) || null,
    p_secreto: env.CORREO_SECRET,
    p_autenticado: autenticado,
    // La fecha firmada del correo: una respuesta mas vieja no pisa una
    // mas nueva, aunque llegue despues.
    p_fecha: autenticado ? contexto.fecha : null
  };
  const registrar = cuerpo => fetch(`${env.SUPABASE_URL}/rest/v1/rpc/cc_registrar_respuesta`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_ANON,
      authorization: `Bearer ${env.SUPABASE_ANON}`
    },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(ESPERA.supabase)
  });
  let r = await registrar(parametros);
  let datos = await r.json().catch(() => null);
  // Mientras la base no tenga el paso 15, la funcion de ocho argumentos no
  // existe (PostgREST: 404, PGRST202) y nada se registro: se repite con la de
  // siete. Asi el Worker y la migracion se pueden aplicar en cualquier orden,
  // y la atadura a la consulta, que vive aqui, rige desde el despliegue.
  if (r.status === 404 && datos && datos.code === 'PGRST202') {
    const { p_fecha, ...sinFecha } = parametros;
    r = await registrar(sinFecha);
    datos = await r.json().catch(() => null);
  }

  // El mismo correo entregado otra vez: ya esta en el expediente, no cambia
  // nada y no hay nada que revisar ni que acusar (el acuse le llegaria a
  // quien lo envio la primera vez, por un reenvio que no hizo).
  if (r.ok && datos && datos.ok !== true && datos.motivo === 'mensaje_repetido') {
    console.log('consulta', codigo, 'mensaje repetido: sin cambios');
    return;
  }

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

// El nombre del condominio que va en la constancia. Vale el que guarda la
// base (contrato C8): la constancia sale de un dominio verificado del sitio
// hacia las casillas del padron, y no puede llevar el texto que quiera quien
// llama. Solo si la base no lo trae se usa el que manda la Mesa, recortado
// y sin caracteres de control.
//
// vv_avisos_pendientes sigue devolviendo un arreglo, y con C8 cada aviso
// trae "condominio" (Seguridad/endurecimiento-2026-09-22.sql). Se acepta
// tambien un objeto con "condominio" y el arreglo al lado, y el arreglo sin
// nombre de antes: asi el Worker y la base se despliegan en cualquier orden.
function leerPendientes(datos, delCuerpo) {
  let avisos = null, condominio = '';
  if (Array.isArray(datos)) {
    avisos = datos;
    const conNombre = datos.find(a => a && typeof a.condominio === 'string' && a.condominio.trim());
    if (conNombre) condominio = conNombre.condominio;
  } else if (datos && typeof datos === 'object') {
    avisos = Array.isArray(datos.avisos) ? datos.avisos : (Object.values(datos).find(Array.isArray) || null);
    if (typeof datos.condominio === 'string') condominio = datos.condominio;
  }
  if (!condominio.trim()) condominio = typeof delCuerpo === 'string' ? delCuerpo : '';
  condominio = condominio.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
  return { avisos, condominio };
}

// La Mesa pide, al cerrar un punto, que se avise a quienes votaron.
// Va por el servidor y no por el navegador del votante a proposito: si
// dependiera de este, un suplantador simplemente no lo llamaria.
async function avisarVotos(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON || !env.CORREO_SECRET) {
    return json({ error: 'avisos_no_configurados' }, 503);
  }
  if (!correoConfigurado(env)) return json({ error: 'correo_no_configurado' }, 503);

  const leido = await jsonAcotado(request, TOPE.avisos);
  if (leido.respuesta) return leido.respuesta;
  const cuerpo = leido.datos;
  const codigo = String(cuerpo.codigo || '').toUpperCase();
  const token  = String(cuerpo.token || '');
  if (!/^[A-Z0-9]{4,12}$/.test(codigo) || token.length < 16 || token.length > 200) {
    return json({ error: 'parametros_invalidos' }, 400);
  }

  // Nunca lanza: si Supabase no contesta, el que llama recibe un estado 0 y
  // decide. Antes una excepcion aqui dejaba sin confirmar todo lo enviado.
  const rpc = async (fn, args) => {
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.SUPABASE_ANON,
          authorization: `Bearer ${env.SUPABASE_ANON}`
        },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(ESPERA.supabase)
      });
      return { ok: r.ok, estado: r.status, datos: await r.json().catch(() => null) };
    } catch (e) {
      return { ok: false, estado: 0, datos: null };
    }
  };

  const pend = await rpc('vv_avisos_pendientes',
    { p_codigo: codigo, p_token: token, p_secreto: env.CORREO_SECRET });
  if (!pend.ok) {
    return pend.estado === 0 || pend.estado >= 500
      ? json({ error: 'base_no_disponible' }, 503)
      : json({ error: 'no_autorizado' }, 403);
  }
  const { avisos, condominio } = leerPendientes(pend.datos, cuerpo.condominio);
  if (!avisos) return json({ error: 'no_autorizado' }, 403);

  // La base entrega un aviso por (rut, punto, correo) -un RUT con dos
  // unidades puede tener dos correos para el mismo voto- pero marca como
  // avisado por (rut, punto). Si se confirmara el voto con uno solo de sus
  // correos entregado, el otro no saldria nunca: ni el que fallo ni el que
  // el tope dejo para la llamada siguiente. Por eso el voto se trata entero:
  // no se parte entre dos llamadas y se confirma solo si salio todo.
  const grupos = [];
  const porVoto = new Map();
  for (const x of avisos) {
    const a = x || {};
    const clave = JSON.stringify([a.rut, a.punto]);
    let g = porVoto.get(clave);
    if (!g) { g = { rut: a.rut, punto: a.punto, avisos: [] }; porVoto.set(clave, g); grupos.push(g); }
    g.avisos.push(a);
  }

  // Se confirma cada LOTE_AVISOS votos y no al final: si algo se cae a
  // mitad de camino, lo ya entregado queda marcado y el reintento no le
  // manda a nadie una segunda constancia. Solo se marca lo que el proveedor
  // acepto: lo demas se reintenta en la proxima llamada.
  let porConfirmar = [];
  let enviados = 0, fallidos = 0, salidas = 0, quedan = 0, g = 0, sinConfirmar = false;
  const sinArreglo = m => m === 'destinatario_invalido' || m === 'proveedor_400' || m === 'proveedor_422';
  const confirmar = async () => {
    if (!porConfirmar.length) return true;
    const lote = porConfirmar;
    porConfirmar = [];
    const c = await rpc('vv_avisos_confirmar', {
      p_codigo: codigo, p_token: token, p_secreto: env.CORREO_SECRET, p_entregados: lote
    });
    if (!c.ok) console.log('avisos: no se pudo confirmar un lote de', lote.length, 'estado', c.estado);
    return c.ok;
  };

  // El tope cuenta los envios que salen a la red. Una direccion invalida no
  // gasta subpeticion y no puede dejar sin turno a las que si sirven. Un voto
  // se mide por todos sus correos, que es lo mas que puede gastar: si no
  // cabe en lo que queda, espera entero a la proxima llamada.
  for (; g < grupos.length; g++) {
    const grupo = grupos[g];
    if (grupo.avisos.length > MAX_AVISOS) {
      // No cabria ni en una llamada vacia, asi que esperar no lo arregla, y
      // si se parara aqui taparia a todos los que vienen detras en cada
      // llamada. Se deja pendiente sin tocarlo y se sigue con los demas.
      quedan += grupo.avisos.length;
      console.log('avisos: un voto con', grupo.avisos.length, 'correos no cabe en una llamada; queda pendiente');
      continue;
    }
    if (salidas + grupo.avisos.length > MAX_AVISOS) break;

    let entregados = 0, caidos = 0;
    for (const a of grupo.avisos) {
      const t = textoAvisoVoto({
        nombre: a.nombre, unidad: a.unidad, sentido: a.sentido,
        punto: a.punto, condominio, codigo
      });
      const env_ = await enviarCorreo(env, { para: a.correo, asunto: t.asunto, texto: t.cuerpo });
      if (env_.motivo !== 'destinatario_invalido') salidas++;
      if (env_.ok) { entregados++; enviados++; }
      else {
        fallidos++;
        // Una direccion que no es correo no va a salir nunca: esperarla
        // dejaria el voto pendiente para siempre y al otro correo le
        // llegaria la constancia repetida en cada cierre de punto. Lo que
        // si retiene el voto es un fallo que al reintentar puede salir.
        // Lo mismo vale para la direccion que pasa nuestro filtro y que el
        // proveedor rechaza por mal escrita (400 o 422, p. ej.
        // "juan@gmail.com."): reintentarla da el mismo rechazo. Un 401 o
        // 403 es de la cuenta o del dominio, no de la direccion, y se
        // arregla; ese si retiene el voto.
        if (!sinArreglo(env_.motivo)) caidos++;
      }
    }
    // Con un correo caido el voto queda pendiente con todos sus correos, y
    // al reintentar el que ya salio recibe su constancia dos veces. Se
    // prefiere eso a que el otro no la reciba nunca. Sin ninguno entregado
    // tampoco se marca: un voto no queda avisado sin constancia.
    if (entregados > 0 && caidos === 0) porConfirmar.push({ rut: grupo.rut, punto: grupo.punto });

    if (porConfirmar.length >= LOTE_AVISOS && !(await confirmar())) {
      // Si la base no confirma, seguir enviando solo agranda lo que se va
      // a repetir. Se para aqui y la Mesa vuelve a llamar.
      g++;
      sinConfirmar = true;
      break;
    }
  }
  if (!sinConfirmar && !(await confirmar())) sinConfirmar = true;
  for (; g < grupos.length; g++) quedan += grupos[g].avisos.length;

  // "quedan" son los avisos que no se alcanzaron a intentar en esta llamada
  // (los votos enteros que no cupieron): si es mayor que cero, la pagina
  // vuelve a llamar.
  const res = { enviados, fallidos, quedan };
  if (sinConfirmar) res.sin_confirmar = true;
  return json(res);
}

// ---------------------------------------------------------------------
//  Codigo de un solo uso para el votante (CN-010, 28-09-2026)
//
//  El telefono pide un codigo para su RUT en la sala. La base (con
//  correo_secret) lo genera, guarda su huella y le devuelve al Worker el
//  codigo y el correo que el padron tiene para ese RUT; el Worker lo envia.
//  Ni el codigo ni la direccion completa llegan nunca al navegador: este
//  solo sabe si salio y a que casilla enmascarada.
//
//  El texto del correo no lleva nada que escriba la Mesa ni el votante
//  (correo.js): solo el codigo, sus minutos y el codigo de la sala. Y los
//  topes viven en la base -3 por RUT cada 15 minutos, 10 por casilla por
//  hora, y por sala 2 por fila del padron mas 20 al dia-, ademas del limite
//  estricto por IP de este Worker.
// ---------------------------------------------------------------------
async function codigoVotante(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON || !env.CORREO_SECRET || !correoConfigurado(env)) {
    return json({ enviado: false, motivo: 'correo_no_configurado' }, 503);
  }
  const leido = await jsonAcotado(request, TOPE.codigo);
  if (leido.respuesta) return leido.respuesta;
  const d = leido.datos;
  const codigo = String(d.codigo || '').toUpperCase();
  const rut = String(d.rut || '');
  const dispositivo = String(d.dispositivo || '');
  if (!/^[A-Z0-9]{4,12}$/.test(codigo) || !/^[0-9kK.\- ]{2,20}$/.test(rut) || !/^[0-9a-f]{32}$/.test(dispositivo)) {
    return json({ error: 'parametros_invalidos' }, 400);
  }

  let r, datos;
  try {
    r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/vv_codigo_correo`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_ANON,
        authorization: `Bearer ${env.SUPABASE_ANON}`
      },
      body: JSON.stringify({ p_codigo: codigo, p_rut: rut, p_dispositivo: dispositivo, p_secreto: env.CORREO_SECRET }),
      signal: AbortSignal.timeout(ESPERA.supabase)
    });
    datos = await r.json().catch(() => null);
  } catch (e) {
    return json({ enviado: false, motivo: 'base_no_disponible' }, 503);
  }
  if (!r.ok) {
    // Un secreto que no calza con el de la base, o la base sin configurar:
    // para quien vota es lo mismo, y el mensaje no le cuenta cual de los dos.
    const m = String((datos && datos.message) || '');
    if (/correo_no_configurado|no autorizado/.test(m)) {
      console.log('codigo: la base rechazo el secreto del correo o no lo tiene', paraLog(m, 60));
      return json({ enviado: false, motivo: 'correo_no_configurado' }, 503);
    }
    return json({ enviado: false, motivo: 'base_no_disponible' }, 503);
  }
  if (!datos || datos.ok !== true) {
    const motivo = String((datos && datos.motivo) || 'desconocido');
    const estado = motivo === 'demasiados_codigos' ? 429 : motivo === 'sin_correo' ? 200 : 404;
    return json({ enviado: false, motivo }, estado);
  }

  const t = textoCodigoVoto({ clave: datos.clave, minutos: datos.minutos, sala: codigo });
  const envio = await enviarCorreo(env, { para: datos.para, asunto: t.asunto, texto: t.cuerpo });
  if (!envio.ok) return json({ enviado: false, motivo: 'envio_fallido' }, 502);
  return json({ enviado: true, correo: String(datos.correo || ''), minutos: Number(datos.minutos) || 10 });
}

// ---------------------------------------------------------------------
//  Claves filtradas (HaveIBeenPwned, k-anonimato)
//
//  El navegador manda SOLO los 5 primeros caracteres del SHA-1 de la clave,
//  y recibe los sufijos filtrados que empiezan asi: la comparacion la hace
//  el navegador. Ni nosotros ni HIBP vemos el hash completo.
//
//  Hasta el 28-09-2026 el navegador mandaba tambien el sufijo y aqui se
//  buscaba (CN-021): prefijo y sufijo juntos son el SHA-1 entero, y el
//  comentario decia lo contrario. Si un navegador con la pagina vieja lo
//  sigue mandando, se ignora.
//
//  Supabase trae esto en el plan Pro. El algoritmo es publico, asi que se
//  hace igual y gratis.
// ---------------------------------------------------------------------
async function claveFiltrada(request) {
  const leido = await jsonAcotado(request, TOPE.clave);
  if (leido.respuesta) return leido.respuesta;
  const prefijo = String(leido.datos.prefijo || '').toUpperCase();

  // Solo un prefijo hexadecimal de 5. Cualquier otra cosa es un intento de
  // usarnos de proxy hacia otro sitio.
  if (!/^[0-9A-F]{5}$/.test(prefijo)) {
    return json({ error: 'formato_invalido' }, 400);
  }

  let texto;
  try {
    const r = await fetch('https://api.pwnedpasswords.com/range/' + prefijo, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'actaviva' },
      cf: { cacheTtl: 86400, cacheEverything: true },
      signal: AbortSignal.timeout(ESPERA.hibp)
    });
    if (!r.ok) throw new Error('hibp ' + r.status);
    texto = await r.text();
  } catch (e) {
    // Si el servicio no responde, no se bloquea el registro: se deja pasar.
    // Preferible una clave sin revisar que una persona sin poder entrar.
    return json({ revisada: false });
  }

  // Los sufijos que de verdad se filtraron. Con Add-Padding, HIBP agrega
  // lineas de relleno con cuenta 0 para que el tamano de la respuesta no
  // delate el prefijo: esas se dejan fuera.
  const sufijos = [];
  for (const linea of texto.split('\n')) {
    const c = linea.indexOf(':');
    if (c < 0) continue;
    const suf = linea.slice(0, c).trim().toUpperCase();
    const veces = parseInt(linea.slice(c + 1).trim(), 10) || 0;
    if (veces > 0 && /^[0-9A-F]{35}$/.test(suf)) sufijos.push(suf);
  }

  return json({ revisada: true, sufijos });
}

// ---------------------------------------------------------------------
//  Informes de la CSP (DAST-08)
//
//  Sin esto, si la CSP bloquea un script inyectado nadie se entera, y
//  tampoco de que un cambio propio la rompio. _headers le dice al navegador
//  que informe aqui (report-uri y report-to), y queda UNA linea en el log
//  de observabilidad: la directiva, lo bloqueado y la pagina. Sin consulta
//  ni fragmento -la URL de vuelta del pago lleva el numero de orden- y
//  nunca el cuerpo entero, que trae una muestra del codigo bloqueado.
// ---------------------------------------------------------------------
const sinConsulta = u => String(u == null ? '' : u).split(/[?#]/)[0];

async function informeCsp(request) {
  const tipo = (request.headers.get('content-type') || '').toLowerCase();
  if (!tipo.startsWith('application/csp-report') && !tipo.startsWith('application/reports+json')) {
    return json({ error: 'tipo_no_admitido' }, 415);
  }
  const c = await cuerpoAcotado(request, TOPE.csp);
  if (c.grande) return json({ error: 'cuerpo_demasiado_grande' }, 413);
  let datos;
  try { datos = JSON.parse(c.texto); } catch { return json({ error: 'cuerpo_invalido' }, 400); }

  // report-uri manda {"csp-report": {...}} con guiones; report-to manda un
  // arreglo de informes con el detalle en "body" y en camelCase.
  let directiva = '', bloqueada = '', pagina = '', mas = 0;
  if (Array.isArray(datos)) {
    const csp = datos.filter(x => x && x.type === 'csp-violation');
    const b = (csp[0] && csp[0].body) || {};
    directiva = b.effectiveDirective || b.violatedDirective;
    bloqueada = b.blockedURL;
    pagina = b.documentURL || (csp[0] && csp[0].url);
    mas = Math.max(0, csp.length - 1);
  } else if (datos && typeof datos === 'object' && datos['csp-report']) {
    const r = datos['csp-report'];
    directiva = r['effective-directive'] || r['violated-directive'];
    bloqueada = r['blocked-uri'];
    pagina = r['document-uri'];
  }
  if (directiva || bloqueada || pagina) {
    console.log('csp', paraLog(directiva, 60) || '-', paraLog(sinConsulta(bloqueada), 200) || '-',
      paraLog(sinConsulta(pagina), 200) || '-', mas ? '(+' + mas + ' en el mismo envio)' : '');
  }
  return responder(null, 204, { 'cache-control': 'no-store' });
}

export default {
  async email(message, env) {
    // Se espera aqui y no en ctx.waitUntil: la suerte del mensaje (rechazo
    // SMTP con setReject, reenvio a la casilla humana) se decide mientras
    // dura el evento. Despues de devolver, el servidor que lo entrego ya
    // recibio su "aceptado", y un setReject tardio no rechaza nada.
    //
    // correoEntrante ya deriva a revision humana ante cualquier excepcion.
    // Este catch es la ultima red: si fallara la derivacion misma, se
    // intenta otra vez en vez de quedarse con una linea de log.
    try {
      await correoEntrante(message, env);
    } catch (e) {
      await aRevisionHumana(message, env, 'fallo al procesar: ' + (e && e.message));
    }
  },

  async fetch(request, env) {
    // Un error no previsto sale como JSON con las cabeceras de siempre, no
    // como la pagina 1101 de Cloudflare con el detalle de la excepcion.
    try {
      return await atender(request, env);
    } catch (e) {
      console.log('worker: error no controlado', paraLog(e && e.message, 200));
      return json({ error: 'error_interno' }, 500);
    }
  }
};

async function atender(request, env) {
  const url = new URL(request.url);
  const local = HOSTS_LOCALES.has(url.hostname);

  // Nada viaja en claro. La zona no fuerza HTTPS por si sola (comprobado en
  // vivo el 27-08-2026: http:// entregaba la pagina completa con 200), y el
  // HSTS solo protege a quien ya nos visito. 301 y a otra cosa.
  //
  // Y el sitio tiene un solo nombre: www y cualquier otro Host que llegue
  // hasta aqui van al apex con la misma ruta y la misma consulta. Las URL de
  // vuelta de Supabase Auth y de Google se declaran por origen, y dos
  // nombres sirviendo lo mismo obligarian a declarar los dos.
  if (!local && (url.protocol === 'http:' || url.hostname !== HOST)) {
    return redirigir(ORIGEN + url.pathname + url.search);
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
    return textoPlano('404 — no encontrado', 404);
  }

  const limite = limiteDe(url.pathname);
  if (limite && !(await dentroDelLimite(env, limite, request))) {
    return json({ error: 'demasiadas_solicitudes' }, 429, { 'retry-after': '60' });
  }

  if (url.pathname === '/cf-geo') {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: 'metodo_no_permitido' }, 405, { allow: 'GET' });
    }
    const cf = request.cf || {};
    return json({ pais: cf.country || null, region: cf.region || null, ciudad: cf.city || null });
  }

  if (url.pathname === '/api/pago/crear') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return crearPago(request, env, url);
  }

  if (url.pathname === '/api/pago/confirmar') {
    if (request.method !== 'POST' && request.method !== 'GET') {
      return textoPlano('metodo no permitido', 405);
    }
    return confirmarPago(request, env);
  }

  if (url.pathname === '/api/voto/avisos') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return avisarVotos(request, env);
  }

  if (url.pathname === '/api/voto/codigo') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return codigoVotante(request, env);
  }

  if (url.pathname === '/api/clave/filtrada') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return claveFiltrada(request);
  }

  if (url.pathname === '/api/prueba/aviso') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return avisoPrueba(request, env);
  }

  if (url.pathname === '/api/prueba/aprobada') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return avisoAprobada(request, env);
  }

  if (url.pathname === '/api/pago/estado') {
    if (request.method !== 'GET') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'GET' });
    return estadoPago(request, env, url);
  }

  if (url.pathname === '/api/csp') {
    if (request.method !== 'POST') return json({ error: 'metodo_no_permitido' }, 405, { allow: 'POST' });
    return informeCsp(request);
  }

  return conVitrina(await env.ASSETS.fetch(request), env);
}

// ---------------------------------------------------------------------
//  Modo vitrina
//
//  VITRINA=1 esconde TODO lo comercial mientras se muestra el sistema:
//  precios, botones de pago y la puerta que cierra el asistente del acta.
//  Se hace aqui y no en el navegador por dos razones: no hay parpadeo -el
//  precio nunca llega a pintarse- y funciona igual con JavaScript apagado.
//
//  Dos atributos gobiernan esto en el HTML, y ninguno hace nada con el modo
//  apagado:
//
//    data-pago     se borra en vitrina. Precios, botones de pago, la puerta.
//    data-vitrina  aparece en vitrina. Va con "hidden" en el archivo, y aqui
//                  se le quita: sirve para el texto que reemplaza al que se
//                  fue, por ejemplo "Comenzar" donde decia "Pagar y comenzar".
//
//  Ademas se agrega la clase "vitrina" al <html>, que es de donde acta-1.js
//  saca que la puerta va abierta. No se puede inyectar un <script> en linea:
//  la CSP real (script-src 'self') lo bloquearia.
//
//  Lo que este modo NO hace, a proposito: tocar el cobro de verdad. Sigue
//  siendo Postgres quien exige la llave del pago para poner folio a un acta.
//  Esconder un precio no regala el producto.
// ---------------------------------------------------------------------
function conVitrina(respuesta, env) {
  if (String(env.VITRINA) !== '1') return respuesta;
  const tipo = respuesta.headers.get('content-type') || '';
  if (!tipo.includes('text/html')) return respuesta;

  return new HTMLRewriter()
    .on('html', {
      element(el) {
        const clases = el.getAttribute('class');
        el.setAttribute('class', clases ? clases + ' vitrina' : 'vitrina');
      }
    })
    .on('[data-pago]', { element(el) { el.remove(); } })
    .on('[data-vitrina]', { element(el) { el.removeAttribute('hidden'); } })
    .transform(respuesta);
}
