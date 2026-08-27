// Interpretacion de las respuestas que llegan por correo a una consulta
// por escrito (art. 15 Ley 21.442).
//
// Vive en /js porque lo usan dos lados: el Worker, para leer los correos que
// entran, y el simulador de la demostracion, que corre en el navegador. Una
// sola copia: si las reglas cambian, cambian para ambos.
//
// No hay nada reservado aqui. Las palabras que se reconocen son las mismas
// que el correo de convocatoria le pide escribir al copropietario.
//
// Regla que manda: ante la duda NO se computa. Una respuesta ambigua queda
// marcada para que la Mesa la resuelva a mano. Es preferible que la Mesa
// revise diez correos a que el sistema cuente mal un voto.

// Separadores que anteceden al mensaje citado. Todo lo que viene despues
// es el correo original, no la respuesta de la persona.
const CORTES = [
  /^\s*-{2,}\s*mensaje original\s*-{2,}/im,
  /^\s*-{2,}\s*original message\s*-{2,}/im,
  /^\s*-{2,}\s*forwarded message\s*-{2,}/im,
  /^\s*el\s+.{0,80}\bescribi[oó]\s*:/im,
  /^\s*on\s+.{0,80}\bwrote\s*:/im,
  /^\s*de\s*:\s*.+\n\s*enviado\s*:/im,
  /^\s*from\s*:\s*.+\n\s*sent\s*:/im,
  /^\s*_{10,}\s*$/m
];

// \b no sirve con acentos: en "sí" la í no es caracter de palabra, asi que
// \bs[ií]\b nunca calza. Se usan limites por letra Unicode.
const pal = (p) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${p})(?![\\p{L}\\p{N}])`, 'iu');

const APRUEBA = [
  'aprueb[oa]', 'aprobad[oa]', 'acept[oa]', 'aceptad[oa]',
  'estoy de acuerdo', 'de acuerdo', 'a favor', 'conforme',
  's[ií]', 'afirmativo'
].map(pal);

const RECHAZA = [
  'rechaz[oa]', 'rechazad[oa]', 'en contra', 'disiento',
  'me opongo', 'negativo', 'no'
].map(pal);

// Las negaciones se evaluan primero: "no apruebo" contiene "apruebo".
const NEGADAS = [
  'no\\s+(?:estoy\\s+de\\s+acuerdo|apruebo|acepto|conforme)',
  'no\\s+lo\\s+(?:apruebo|acepto)'
].map(pal);

// Dudas y peticiones de mas informacion. Se revisan ANTES que todo: llevan
// un "no" que si no las atajaramos las convertiria en rechazo.
const INDECISO = [
  'no\\s+s[eé]',
  'no\\s+estoy\\s+segur[oa]',
  'no\\s+(?:me\\s+)?(?:queda|esta)\\s+clar[oa]',
  'no\\s+entiendo',
  'no\\s+tengo\\s+clar[oa]',
  'necesito\\s+m[aá]s\\s+(?:informaci[oó]n|antecedentes|detalles)',
  'tengo\\s+(?:una\\s+)?(?:duda|consulta|pregunta)',
  'me\\s+gustar[ií]a\\s+saber',
  'lo\\s+(?:ver[eé]|revisar[eé]|pensar[eé])'
].map(pal);

export function limpiarCitas(texto) {
  let t = String(texto || '').replace(/\r\n/g, '\n');
  let corte = t.length;
  for (const re of CORTES) {
    const m = re.exec(t);
    if (m && m.index < corte) corte = m.index;
  }
  t = t.slice(0, corte);
  // Fuera las lineas citadas con ">"
  t = t.split('\n').filter(l => !/^\s*>/.test(l)).join('\n');
  return t.trim();
}

// Corta la firma para que un "Saludos, No..." o un cargo no confundan.
function sinFirma(texto) {
  const m = /^\s*--\s*$/m.exec(texto);
  return m ? texto.slice(0, m.index).trim() : texto;
}

export function interpretarRespuesta(textoCrudo) {
  const limpio = sinFirma(limpiarCitas(textoCrudo));
  if (!limpio) return { sentido: 'ambigua', motivo: 'sin_texto', texto: '' };

  // Solo se mira el comienzo: la intencion va al principio, no en la despedida.
  const cabeza = limpio.split('\n').slice(0, 6).join('\n');

  if (INDECISO.some(re => re.test(cabeza)))
    return { sentido: 'ambigua', motivo: 'indecisa', texto: limpio };

  const negada = NEGADAS.some(re => re.test(cabeza));
  const rechaza = negada || RECHAZA.some(re => re.test(cabeza));
  const aprueba = !negada && APRUEBA.some(re => re.test(cabeza));

  if (aprueba && rechaza) return { sentido: 'ambigua', motivo: 'contradictoria', texto: limpio };
  if (aprueba) return { sentido: 'aprueba', motivo: null, texto: limpio };
  if (rechaza) return { sentido: 'rechaza', motivo: null, texto: limpio };
  return { sentido: 'ambigua', motivo: 'sin_palabra_clave', texto: limpio };
}
