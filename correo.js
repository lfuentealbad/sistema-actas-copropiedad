// Envío de correo saliente. Módulo del Worker, no se sirve al navegador.
//
// El proveedor está aislado en una sola función a propósito: cambiarlo
// no debería tocar nada más que enviarCorreo(). Hoy habla con Resend,
// que es una API JSON simple; sustituirlo por Postmark o Mailgun es
// reescribir el fetch de abajo.

const ETIQUETA = { favor: 'A FAVOR', contra: 'EN CONTRA', abst: 'ABSTENCIÓN' };

// Cuánto se espera al proveedor. Sin tope, uno lento se come el tiempo del
// Worker a mitad del cierre de un punto de la asamblea.
const ESPERA_MS = 10000;

// Lo que entra al cuerpo del correo: sin caracteres de control y con tope.
// El condominio es el único campo que puede venir de quien llama (ver
// leerPendientes en _worker.js); los demás los devuelve Postgres, pero la
// constancia sale de un dominio verificado hacia el padrón y no conviene
// que lleve lo que sea aunque la fuente sea nuestra.
function limpio(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\r\n]+/g, ' ').trim().slice(0, max);
}

// CN-024 (28-09-2026). El punto y el nombre del condominio los escribe
// quien paga, y la constancia sale del dominio verificado del sitio hacia
// cada casilla del padron: con un enlace adentro es un correo de phishing
// con nuestra firma. Todo lo que parezca direccion web se reemplaza.
const ENLACE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:cl|com|net|org|io|app|link|xyz|info|co|me|ly|site|online|top|click|live|shop|store|biz|us|ru|cn|tk)\b\S*/gi;
export function sinEnlaces(t) {
  return String(t == null ? '' : t).replace(ENLACE, '[enlace omitido]');
}

export function textoAvisoVoto({ nombre, unidad, sentido, punto, condominio, codigo }) {
  nombre = sinEnlaces(limpio(nombre, 120));
  unidad = sinEnlaces(limpio(unidad, 40));
  punto = sinEnlaces(limpio(punto, 300));
  condominio = sinEnlaces(limpio(condominio, 120));
  const quien = [nombre, unidad ? 'unidad ' + unidad : ''].filter(Boolean).join(', ');
  const cuerpo =
    'Se deja constancia de su voto en la asamblea' +
    (condominio ? ' de ' + condominio : '') + '.\r\n\r\n' +
    (quien ? 'Copropietario: ' + quien + '\r\n' : '') +
    'Punto: ' + (punto || '—') + '\r\n' +
    'Su voto quedó registrado como: ' + (ETIQUETA[sentido] || limpio(sentido, 20)) + '\r\n\r\n' +
    'Conserve este correo como respaldo.\r\n\r\n' +
    'Si usted NO emitió este voto, avise de inmediato a la Mesa de la asamblea ' +
    'para que lo deje sin efecto antes de cerrar el acta.' +
    '\r\n\r\n—\r\nMensaje automático de la asamblea ' + limpio(codigo, 12) + '.';
  return { asunto: 'Constancia de su voto — ' + (ETIQUETA[sentido] || limpio(sentido, 20)), cuerpo };
}

// El codigo con que el votante ata su telefono a su RUT (CN-010). Nada de lo
// que escriben la Mesa o el votante entra aqui: solo el codigo, cuanto dura
// y el codigo de la sala, que la persona ve en la pantalla de la sala y le
// sirve para reconocer que el correo es de la asamblea en la que esta.
export function textoCodigoVoto({ clave, minutos, sala }) {
  const c = String(clave == null ? '' : clave).replace(/\D/g, '').slice(0, 6);
  const m = Math.max(1, Math.min(60, Number(minutos) || 10));
  const s = String(sala == null ? '' : sala).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  return {
    asunto: 'Su código para votar: ' + c,
    cuerpo:
      'Su código para votar en la sala ' + s + ' es:\r\n\r\n' +
      '    ' + c + '\r\n\r\n' +
      'Escríbalo en el teléfono desde el que lo pidió. Vence en ' + m + ' minutos y sirve una sola vez.\r\n\r\n' +
      'Si usted no lo pidió, no haga nada: sin el código nadie puede votar por usted. ' +
      'Si alguien se lo pide, no lo entregue.' +
      '\r\n\r\n—\r\nMensaje automático de la sala de votación ' + s + '.'
  };
}

export function correoConfigurado(env) {
  return !!(env && env.CORREO_API_KEY && env.CORREO_DESDE);
}

// Devuelve { ok, motivo }. Nunca lanza: un aviso que falla no puede
// tumbar el cierre de un punto de la asamblea.
export async function enviarCorreo(env, { para, asunto, texto }) {
  if (!correoConfigurado(env)) return { ok: false, motivo: 'correo_no_configurado' };
  if (!para || !/^[^@\s]+@[^@\s.]+\.[^@\s]{2,}$/.test(para)) {
    return { ok: false, motivo: 'destinatario_invalido' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + env.CORREO_API_KEY
      },
      body: JSON.stringify({
        from: env.CORREO_DESDE,
        to: [para],
        subject: asunto,
        text: texto
      }),
      signal: AbortSignal.timeout(ESPERA_MS)
    });
    if (!r.ok) {
      // Del error se registra el nombre y el mensaje, nada más: el cuerpo
      // entero puede repetir la dirección del destinatario, y los logs de
      // Cloudflare tienen su propia retención, fuera de nuestras purgas.
      const d = (await r.json().catch(() => null)) || {};
      console.log('correo: el proveedor rechazo el envio', r.status,
        limpio(d.name || d.code, 60), limpio(d.message, 200));
      return { ok: false, motivo: 'proveedor_' + r.status };
    }
    return { ok: true };
  } catch (e) {
    console.log('correo: fallo de red', limpio(e && e.message, 200));
    return { ok: false, motivo: 'red' };
  }
}
