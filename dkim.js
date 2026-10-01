// Verificacion DKIM (RFC 6376) de un correo entrante. Modulo del Worker, no
// se sirve al navegador (.assetsignore).
//
// Para que sirve (hallazgo CN-011 de la auditoria del 26-09-2026): la
// consulta por escrito atribuia cada voto al remitente del sobre SMTP, que
// escribe libremente quien envia. Cloudflare Email Routing, al entregar el
// correo a un Worker, hoy NO agrega los veredictos SPF/DKIM/DMARC
// (github.com/cloudflare/workerd/issues/6740), asi que no hay de quien
// fiarse: la firma se verifica aqui.
//
// Un correo cuenta como autenticado solo si trae una firma DKIM que:
//   * es rsa-sha256 (rsa-sha1 esta roto, RFC 8301) y sin l= (con l= se
//     puede agregar texto despues de lo firmado);
//   * firma la cabecera From;
//   * verifica: el hash del cuerpo calza con bh= y la firma RSA calza con la
//     clave publica que el dominio publica en DNS, de al menos 1024 bits;
//   * es del dominio del From, o de uno del que el From es subdominio
//     (alineacion relajada, la de DMARC);
//   * no esta vencida (x=).
// Cualquier otra cosa -sin firma, firma de un tercero, DNS caido, un
// formato raro- devuelve ok:false con el motivo. Quien llama decide: en la
// consulta, el voto va a revision de la Mesa y nunca se computa solo.
//
// Sin librerias: el proyecto no tiene npm. Todo con WebCrypto.

const enc = new TextEncoder();

// Los bytes del correo como "cadena binaria": un caracter por byte, sin
// decodificar. DKIM firma bytes, y decodificar UTF-8 (o latin1, que en el
// navegador es windows-1252) cambiaria lo que se firmo.
export function aBinario(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return s;
}

function aBytes(binario) {
  const b = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) b[i] = binario.charCodeAt(i) & 0xff;
  return b;
}

function b64aBytes(b64) {
  const limpio = String(b64 || '').replace(/[\s]/g, '');
  const bin = atob(limpio);
  return aBytes(bin);
}

function bytesAb64(bytes) {
  return btoa(aBinario(bytes));
}

// Separa cabeceras y cuerpo. SMTP entrega CRLF; si viniera LF a secas, se
// lleva a CRLF, que es sobre lo que se define la canonicalizacion.
function partir(binario) {
  const t = /\r\n/.test(binario) ? binario : binario.replace(/\n/g, '\r\n');
  const corte = t.indexOf('\r\n\r\n');
  if (corte < 0) return { cabeceras: t, cuerpo: '' };
  return { cabeceras: t.slice(0, corte + 2), cuerpo: t.slice(corte + 4) };
}

// Los campos de cabecera, en orden, cada uno con su texto exacto (plegado
// incluido, sin el CRLF final) y su nombre en minusculas.
export function camposDeCabecera(cabeceras) {
  const campos = [];
  const lineas = cabeceras.split('\r\n');
  for (const l of lineas) {
    if (l === '') continue;
    if (/^[ \t]/.test(l) && campos.length) {
      campos[campos.length - 1].crudo += '\r\n' + l;
    } else {
      const dos = l.indexOf(':');
      if (dos <= 0) continue;
      campos.push({ nombre: l.slice(0, dos).trim().toLowerCase(), crudo: l });
    }
  }
  return campos;
}

// --- Canonicalizacion (RFC 6376 §3.4) -------------------------------------

function cabeceraRelajada(crudo) {
  const dos = crudo.indexOf(':');
  const nombre = crudo.slice(0, dos).trim().toLowerCase();
  const valor = crudo.slice(dos + 1)
    .replace(/\r\n(?=[ \t])/g, '')      // desplegar
    .replace(/[ \t]+/g, ' ')            // secuencias de espacio -> un espacio
    .replace(/^ +| +$/g, '');           // sin espacio al comienzo ni al final
  return nombre + ':' + valor;
}

function cabeceraSimple(crudo) {
  return crudo;
}

function cuerpoRelajado(cuerpo) {
  let lineas = cuerpo.split('\r\n');
  lineas = lineas.map(l => l.replace(/[ \t]+/g, ' ').replace(/ +$/, ''));
  // Sin lineas vacias al final.
  while (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
  return lineas.length ? lineas.join('\r\n') + '\r\n' : '';
}

function cuerpoSimple(cuerpo) {
  let t = cuerpo;
  while (t.endsWith('\r\n\r\n')) t = t.slice(0, -2);
  if (t === '' || t === '\r\n') return '\r\n';
  return t.endsWith('\r\n') ? t : t + '\r\n';
}

// --- Etiquetas -------------------------------------------------------------

export function etiquetas(valor) {
  const t = {};
  for (const parte of String(valor || '').split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    const k = parte.slice(0, i).replace(/\s+/g, '').toLowerCase();
    if (!k) continue;
    t[k] = parte.slice(i + 1).trim();
  }
  return t;
}

// El From de la cabecera: la direccion, en minusculas.
export function direccionFrom(campos) {
  const f = campos.filter(c => c.nombre === 'from');
  if (f.length !== 1) return null;           // dos From: sospechoso, no se decide
  const valor = f[0].crudo.slice(f[0].crudo.indexOf(':') + 1).replace(/\r\n(?=[ \t])/g, '');
  const m = /<\s*([^<>\s]+@[^<>\s]+)\s*>/.exec(valor) || /([^\s<>"(),;:]+@[^\s<>"(),;:]+)/.exec(valor);
  if (!m) return null;
  const dir = m[1].trim().toLowerCase();
  return /^[^@\s]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(dir) ? dir : null;
}

function alineado(dominioFirma, dominioFrom) {
  const d = String(dominioFirma || '').toLowerCase().replace(/\.$/, '');
  const f = String(dominioFrom || '').toLowerCase();
  if (!d || !f || !d.includes('.')) return false;
  return f === d || f.endsWith('.' + d);
}

// --- La clave publica ------------------------------------------------------

function derLargo(n) {
  if (n < 0x80) return [n];
  const b = [];
  while (n > 0) { b.unshift(n & 0xff); n >>= 8; }
  return [0x80 | b.length, ...b];
}

// Una clave RSAPublicKey (PKCS#1) envuelta en SubjectPublicKeyInfo, que es
// lo que WebCrypto importa. La mayoria de los dominios publican SPKI, pero
// algunos publican PKCS#1 a secas.
function spkiDesdePkcs1(pkcs1) {
  const algoritmo = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  const bits = [0x03, ...derLargo(pkcs1.length + 1), 0x00, ...pkcs1];
  const cuerpo = [...algoritmo, ...bits];
  return new Uint8Array([0x30, ...derLargo(cuerpo.length), ...cuerpo]);
}

async function importarClave(p) {
  const der = b64aBytes(p);
  const algoritmo = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  let clave;
  try {
    clave = await crypto.subtle.importKey('spki', der, algoritmo, true, ['verify']);
  } catch {
    clave = await crypto.subtle.importKey('spki', spkiDesdePkcs1(der), algoritmo, true, ['verify']);
  }
  const bits = clave.algorithm && clave.algorithm.modulusLength;
  if (!bits || bits < 1024) throw new Error('clave_corta');
  return clave;
}

// --- La verificacion -------------------------------------------------------

// Quita el valor de b= (y solo de b=, no de bh=) del campo DKIM-Signature,
// conservando todo lo demas tal cual: es lo que se firmo.
function sinFirma(crudo) {
  const dos = crudo.indexOf(':');
  const nombre = crudo.slice(0, dos + 1);
  const valor = crudo.slice(dos + 1);
  const partes = valor.split(';');
  const salida = partes.map(p => {
    const i = p.indexOf('=');
    if (i < 0) return p;
    const k = p.slice(0, i).replace(/\s+/g, '').toLowerCase();
    return k === 'b' ? p.slice(0, i + 1) : p;
  });
  return nombre + salida.join(';');
}

async function verificarUna(firma, campos, cuerpo, dominioFrom, opciones) {
  const t = etiquetas(firma.crudo.slice(firma.crudo.indexOf(':') + 1).replace(/\r\n(?=[ \t])/g, ''));
  if (t.v !== '1') return 'version';
  if ((t.a || '').toLowerCase() !== 'rsa-sha256') return 'algoritmo';
  if ('l' in t) return 'con_largo';
  if (!t.b || !t.bh || !t.d || !t.s || !t.h) return 'incompleta';
  const firmadas = t.h.split(':').map(h => h.trim().toLowerCase()).filter(Boolean);
  if (!firmadas.includes('from')) return 'from_sin_firmar';
  if (!alineado(t.d, dominioFrom.split('@')[1])) return 'no_alineada';
  if (t.x && /^\d+$/.test(t.x.replace(/\s+/g, '')) &&
      Number(t.x.replace(/\s+/g, '')) < Math.floor((opciones.ahora || Date.now()) / 1000)) return 'vencida';
  if (!/^[a-z0-9._-]+$/i.test(t.s) || !/^[a-z0-9.-]+$/i.test(t.d)) return 'selector_invalido';

  const [ccab, ccue] = (t.c || 'simple/simple').toLowerCase().split('/');
  const canCab = ccab === 'relaxed' ? cabeceraRelajada : ccab === 'simple' ? cabeceraSimple : null;
  const canCue = (ccue || 'simple') === 'relaxed' ? cuerpoRelajado : (ccue || 'simple') === 'simple' ? cuerpoSimple : null;
  if (!canCab || !canCue) return 'canonicalizacion';

  // 1) El cuerpo.
  const hashCuerpo = new Uint8Array(await crypto.subtle.digest('SHA-256', aBytes(canCue(cuerpo))));
  if (bytesAb64(hashCuerpo) !== t.bh.replace(/\s+/g, '')) return 'cuerpo_alterado';

  // 2) Las cabeceras firmadas: de abajo hacia arriba cuando el nombre se
  //    repite (§5.4.2), y una que no existe no aporta nada. Se anota el
  //    valor de cada instancia que entro en la firma: es lo unico de las
  //    cabeceras que el dominio respalda (CN-002: una cabecera To agregada
  //    encima de la firmada no cuenta).
  const usadas = new Set();
  const valores = {};
  let datos = '';
  for (const nombre of firmadas) {
    for (let i = campos.length - 1; i >= 0; i--) {
      if (campos[i].nombre === nombre && !usadas.has(i)) {
        usadas.add(i);
        datos += canCab(campos[i].crudo) + '\r\n';
        (valores[nombre] = valores[nombre] || []).push(valorDe(campos[i].crudo));
        break;
      }
    }
  }
  datos += canCab(sinFirma(firma.crudo));

  // 3) La clave del dominio y la firma.
  let txt;
  try { txt = await opciones.resolverTxt(`${t.s}._domainkey.${t.d}`); } catch { txt = null; }
  if (!txt) return 'sin_clave';
  const k = etiquetas(txt);
  if (k.v && k.v !== 'DKIM1') return 'clave_invalida';
  if (k.k && k.k.toLowerCase() !== 'rsa') return 'clave_invalida';
  if (!k.p) return 'clave_revocada';
  let clave;
  try { clave = await importarClave(k.p); } catch { return 'clave_invalida'; }
  let ok = false;
  try {
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, b64aBytes(t.b), aBytes(datos));
  } catch { ok = false; }
  if (!ok) return 'firma_invalida';
  const ts = /^\d{1,12}$/.test(String(t.t || '').replace(/\s+/g, '')) ? Number(t.t.replace(/\s+/g, '')) : null;
  return { firmadas: valores, t: ts };
}

// El valor de un campo de cabecera, desplegado y sin espacios en los bordes.
function valorDe(crudo) {
  return crudo.slice(crudo.indexOf(':') + 1).replace(/\r\n(?=[ \t])/g, '').trim();
}

// crudo: los bytes del correo (Uint8Array) o su cadena binaria.
// opciones.resolverTxt(nombre) -> Promise<string|null>: el TXT de la clave.
// Devuelve { ok, desde, dominio, motivo }, y si ok, tambien:
//   firmadas: { nombre: [valores] } de las cabeceras que la firma cubre
//             (to, cc, subject, date, message-id...), en minusculas;
//   t:        la marca de tiempo de la firma (segundos), si la trae.
export async function verificarDkim(crudo, opciones) {
  const o = opciones || {};
  if (typeof o.resolverTxt !== 'function') return { ok: false, motivo: 'sin_resolver' };
  const binario = typeof crudo === 'string' ? crudo : aBinario(crudo || new Uint8Array(0));
  const { cabeceras, cuerpo } = partir(binario);
  const campos = camposDeCabecera(cabeceras);
  const desde = direccionFrom(campos);
  if (!desde) return { ok: false, motivo: 'sin_from' };
  const firmas = campos.filter(c => c.nombre === 'dkim-signature').slice(0, 5);
  if (!firmas.length) return { ok: false, desde, motivo: 'sin_firma' };
  let motivo = 'sin_firma';
  for (const f of firmas) {
    const m = await verificarUna(f, campos, cuerpo, desde, o);
    if (m && typeof m === 'object') {
      return { ok: true, desde, dominio: etiquetas(f.crudo.slice(f.crudo.indexOf(':') + 1)).d.toLowerCase(),
               firmadas: m.firmadas, t: m.t };
    }
    motivo = m;
  }
  return { ok: false, desde, motivo };
}

// El TXT de un nombre, por DNS sobre HTTPS (Cloudflare). Un TXT largo viene
// partido en varias cadenas entre comillas: se juntan.
export async function txtPorDoh(nombre, espera = 5000) {
  const r = await fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(nombre) + '&type=TXT', {
    headers: { accept: 'application/dns-json' },
    signal: AbortSignal.timeout(espera)
  });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  if (!j || j.Status !== 0 || !Array.isArray(j.Answer)) return null;
  const textos = j.Answer.filter(a => a && a.type === 16 && typeof a.data === 'string').map(a => {
    const trozos = a.data.match(/"((?:[^"\\]|\\.)*)"/g);
    return trozos ? trozos.map(x => x.slice(1, -1).replace(/\\(.)/g, '$1')).join('') : a.data;
  });
  return textos.find(x => /(^|;)\s*p=/.test(x)) || null;
}
