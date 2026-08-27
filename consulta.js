// Interpretacion de las respuestas que llegan por correo.
//
// La logica vive en ./js/interprete-respuestas.js y se re-exporta desde aqui
// para no cambiar lo que importa el Worker. Esta en /js porque el simulador
// de la demostracion la carga desde el navegador, y no queremos dos copias
// de las mismas reglas.
export { limpiarCitas, interpretarRespuesta } from './js/interprete-respuestas.js';

// El codigo de la consulta viaja en la casilla de respuesta:
//   c-ABC123@actascopropiedad.cl
export function codigoDesdeDestino(destino) {
  const m = /^c-([A-Za-z0-9]{4,12})@/.exec(String(destino || '').trim());
  return m ? m[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------
//  Extraccion del texto desde el MIME crudo.
//  No usa libreria externa: el proyecto no tiene npm ni empaquetado.
//  Regla de seguridad: ante cualquier problema devuelve '' y el
//  interprete lo marca 'ambigua'. Un fallo de parseo manda el correo a
//  revision de la Mesa; nunca computa un voto equivocado.
// ---------------------------------------------------------------------

function partirCabeceras(bloque) {
  const corte = bloque.search(/\r?\n\r?\n/);
  if (corte < 0) return { cab: bloque, cuerpo: '' };
  const salto = /\r\n\r\n/.test(bloque.slice(corte, corte + 4)) ? 4 : 2;
  return { cab: bloque.slice(0, corte), cuerpo: bloque.slice(corte + salto) };
}

function cabecera(cab, nombre) {
  // Las cabeceras pueden venir plegadas en varias lineas.
  const desplegado = cab.replace(/\r?\n[ \t]+/g, ' ');
  const re = new RegExp(`^${nombre}\\s*:\\s*(.*)$`, 'im');
  const m = re.exec(desplegado);
  return m ? m[1].trim() : '';
}

function decodificarQP(texto) {
  return texto
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function aBytes(binario) {
  const b = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) b[i] = binario.charCodeAt(i) & 0xff;
  return b;
}

function decodificarCharset(binario, charset) {
  const cs = (charset || 'utf-8').toLowerCase().replace(/"/g, '');
  try {
    return new TextDecoder(cs, { fatal: false }).decode(aBytes(binario));
  } catch {
    try { return new TextDecoder('utf-8', { fatal: false }).decode(aBytes(binario)); }
    catch { return binario; }
  }
}

function decodificarCuerpo(cuerpo, codificacion, charset) {
  const c = (codificacion || '').toLowerCase();
  let bruto = cuerpo;
  if (c === 'quoted-printable') bruto = decodificarQP(cuerpo);
  else if (c === 'base64') {
    try { bruto = atob(cuerpo.replace(/[\r\n\s]/g, '')); } catch { return ''; }
  }
  return decodificarCharset(bruto, charset);
}

function aTextoDesdeHtml(html) {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, ' ')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}

function recorrer(bloque, profundidad, hallazgos) {
  if (profundidad > 8) return;
  const { cab, cuerpo } = partirCabeceras(bloque);
  // El boundary distingue mayusculas: se conserva el valor original y solo
  // se minusculiza una copia para comparar el tipo.
  const tipoOrig = cabecera(cab, 'Content-Type');
  const tipo = tipoOrig.toLowerCase();
  const cod = cabecera(cab, 'Content-Transfer-Encoding');
  const disp = cabecera(cab, 'Content-Disposition').toLowerCase();
  if (/attachment/.test(disp)) return;

  if (tipo.startsWith('multipart/')) {
    const mb = /boundary\s*=\s*("([^"]+)"|([^;\s]+))/i.exec(tipoOrig);
    const limite = mb ? (mb[2] || mb[3]) : null;
    if (!limite) return;
    const partes = cuerpo.split(new RegExp(`--${limite.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(--)?\\r?\\n?`));
    for (const p of partes) if (p && p.trim()) recorrer(p, profundidad + 1, hallazgos);
    return;
  }

  const cs = /charset\s*=\s*("?[^";\s]+"?)/i.exec(tipoOrig);
  const texto = decodificarCuerpo(cuerpo, cod, cs ? cs[1] : 'utf-8');
  if (!texto) return;

  if (tipo.startsWith('text/plain') || (!tipo && profundidad === 0)) hallazgos.plano.push(texto);
  else if (tipo.startsWith('text/html')) hallazgos.html.push(texto);
}

export function extraerTextoPlano(rawMime) {
  try {
    const hallazgos = { plano: [], html: [] };
    recorrer(String(rawMime || ''), 0, hallazgos);
    if (hallazgos.plano.length) return hallazgos.plano.join('\n').trim();
    if (hallazgos.html.length) return aTextoDesdeHtml(hallazgos.html.join('\n')).trim();
    return '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------
//  Acuse de recibo. Se construye el MIME a mano: el proyecto no usa npm y
//  un correo de texto plano no justifica introducir un empaquetador.
// ---------------------------------------------------------------------

// Los asuntos con tilde deben ir codificados (RFC 2047) o llegan rotos.
function asuntoCodificado(texto) {
  const s = String(texto || '');
  if (/^[\x20-\x7E]*$/.test(s)) return s;
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return '=?UTF-8?B?' + btoa(bin) + '?=';
}

function cuerpoBase64(texto) {
  const bytes = new TextEncoder().encode(String(texto || ''));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return (b64.match(/.{1,76}/g) || []).join('\r\n');
}

export function construirRespuestaMime(de, para, asunto, cuerpo, messageId) {
  const lineas = [
    'From: ' + de,
    'To: ' + para,
    'Subject: ' + asuntoCodificado(asunto),
    'Message-ID: <' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '@actascopropiedad.cl>'
  ];
  if (messageId) {
    lineas.push('In-Reply-To: ' + messageId);
    lineas.push('References: ' + messageId);
  }
  lineas.push('MIME-Version: 1.0');
  lineas.push('Content-Type: text/plain; charset="utf-8"');
  lineas.push('Content-Transfer-Encoding: base64');
  lineas.push('');
  lineas.push(cuerpoBase64(cuerpo));
  return lineas.join('\r\n');
}

// Qué se le dice a quien respondió, según lo que se pudo hacer con su correo.
export function textoAcuse(resultado, codigo) {
  const pie = '\r\n\r\n—\r\nEste es un mensaje automático de la consulta ' + codigo +
              '.\r\nSi tiene dudas, comuníquese con la administración de su condominio.';
  switch (resultado) {
    case 'aprueba':
      return { asunto: 'Su respuesta quedó registrada: APRUEBA',
               cuerpo: 'Recibimos su respuesta y quedó registrada como APRUEBA.' + pie };
    case 'rechaza':
      return { asunto: 'Su respuesta quedó registrada: RECHAZA',
               cuerpo: 'Recibimos su respuesta y quedó registrada como RECHAZA.' + pie };
    case 'ambigua':
      return { asunto: 'No pudimos interpretar su respuesta',
               cuerpo: 'Recibimos su correo, pero no pudimos determinar si aprueba o rechaza.\r\n\r\n' +
                       'Si desea que su voto se compute, responda este mensaje escribiendo una sola ' +
                       'palabra: APRUEBO o RECHAZO.\r\n\r\n' +
                       'Su correo quedó a la vista de la Mesa, que puede calificarlo manualmente.' + pie };
    case 'plazo_vencido':
      return { asunto: 'El plazo de la consulta ya venció',
               cuerpo: 'Recibimos su correo, pero el plazo para responder esta consulta ya venció, ' +
                       'por lo que no fue posible computar su respuesta.' + pie };
    case 'consulta_cerrada':
      return { asunto: 'La consulta ya fue cerrada',
               cuerpo: 'Recibimos su correo, pero la consulta ya fue cerrada por la Mesa, ' +
                       'por lo que no fue posible computar su respuesta.' + pie };
    case 'remitente_no_esta_en_el_padron':
      return { asunto: 'No pudimos identificar su casilla',
               cuerpo: 'Recibimos su correo, pero la casilla desde la que escribe no figura en el ' +
                       'padrón de esta consulta.\r\n\r\n' +
                       'La ley exige que la respuesta se envíe desde el correo inscrito en el Registro ' +
                       'de Copropietarios. Si cambió de correo, avise a la administración.' + pie };
    default:
      return null;
  }
}

export function normalizarCorreo(dir) {
  const s = String(dir || '').trim().toLowerCase();
  const m = /<([^>]+)>/.exec(s);          // "Nombre <correo@x.cl>"
  return (m ? m[1] : s).trim();
}
