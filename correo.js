// Envío de correo saliente. Módulo del Worker, no se sirve al navegador.
//
// El proveedor está aislado en una sola función a propósito: cambiarlo
// no debería tocar nada más que enviarCorreo(). Hoy habla con Resend,
// que es una API JSON simple; sustituirlo por Postmark o Mailgun es
// reescribir el fetch de abajo.

const ETIQUETA = { favor: 'A FAVOR', contra: 'EN CONTRA', abst: 'ABSTENCIÓN' };

export function textoAvisoVoto({ nombre, unidad, sentido, punto, condominio, codigo }) {
  const quien = [nombre, unidad ? 'unidad ' + unidad : ''].filter(Boolean).join(', ');
  const cuerpo =
    'Se deja constancia de su voto en la asamblea' +
    (condominio ? ' de ' + condominio : '') + '.\r\n\r\n' +
    (quien ? 'Copropietario: ' + quien + '\r\n' : '') +
    'Punto: ' + (punto || '—') + '\r\n' +
    'Su voto quedó registrado como: ' + (ETIQUETA[sentido] || sentido) + '\r\n\r\n' +
    'Conserve este correo como respaldo.\r\n\r\n' +
    'Si usted NO emitió este voto, avise de inmediato a la Mesa de la asamblea ' +
    'para que lo deje sin efecto antes de cerrar el acta.' +
    '\r\n\r\n—\r\nMensaje automático de la asamblea ' + (codigo || '') + '.';
  return { asunto: 'Constancia de su voto — ' + (ETIQUETA[sentido] || sentido), cuerpo };
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
      })
    });
    if (!r.ok) {
      const detalle = await r.text().catch(() => '');
      console.log('correo: el proveedor rechazo el envio', r.status, detalle.slice(0, 200));
      return { ok: false, motivo: 'proveedor_' + r.status };
    }
    return { ok: true };
  } catch (e) {
    console.log('correo: fallo de red', e && e.message);
    return { ok: false, motivo: 'red' };
  }
}
