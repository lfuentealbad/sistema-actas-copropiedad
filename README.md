# actaviva

Sistema para elaborar el acta de una asamblea de copropietarios conforme a la
**Ley N° 21.442** sobre Copropiedad Inmobiliaria (Chile), con votación en vivo
desde el teléfono y consulta por escrito del artículo 15.

Operado por **Soluciones CLB SpA** · [actascopropiedad.cl](https://actascopropiedad.cl)

> **Estado:** el sitio está en receso. El Worker responde 503 a todas las rutas
> mientras `RECESO=1`. Ver [INSTALACION.md](../INSTALACION.md) para publicarlo.

## Qué hace

- **Acta de asamblea.** Asistente de 6 pasos: datos, convocatoria, asistencia,
  tabla, firmas y acta final. Calcula el quórum de constitución y las mayorías
  según el tipo de asamblea, y entrega el documento listo para firmar.
- **Votación en vivo.** Los copropietarios votan desde su teléfono con su RUT;
  el resultado se pondera por los derechos de cada unidad. Si el padrón trae
  correo, cada persona recibe la constancia de su voto.
- **Consulta por escrito.** El acuerdo se adopta sin convocar asamblea: la
  respuesta llega desde el correo inscrito en el Registro de Copropietarios,
  que es el mecanismo de identidad del artículo 17 del reglamento.

## Dónde viven los datos

Conviene ser preciso, porque no es lo mismo en cada parte:

| | Dónde se procesa | Cuánto dura |
|---|---|---|
| **El acta** | Supabase, bajo la cuenta de quien la redacta | Mientras mantenga la cuenta; la borra ella cuando quiera |
| **Votación en vivo** | Supabase | Se borra al cerrar la sala; barrido a las 48 h |
| **Consulta por escrito** | Supabase | Mientras el acuerdo pueda impugnarse (plazo por definir) |
| **Cuenta y compras** | Supabase | Mientras la cuenta esté activa |

La **cuenta es obligatoria** para armar el acta, para la votación en vivo y para
la consulta por escrito. Crearla es gratuita y solo pide el correo. Los
**copropietarios que votan no necesitan cuenta**: se identifican con su RUT
contra el padrón.

Se venden **dos servicios**:

- El **acta de asamblea** ($14.990) incluye la **votación en vivo**: sin acta,
  una sala de votación no tiene para qué existir.
- La **consulta por escrito** ($7.990) va aparte, porque reemplaza a la
  asamblea en vez de ser una forma de votar dentro de ella.

La llave que emite el Worker al pagar dice cuál de los dos se compró, y
Postgres lo verifica: una llave de consulta no abre un acta ni al revés. El
cobro del acta se exige en `ac_finalizar`, que valida el pago y le asigna el
folio; sin folio, el documento sale marcado como borrador.

Detalle completo en `Cumplimiento Ley 21719/registro-actividades-tratamiento.md`.

## Estructura

```
index.html            portada
acta.html             la aplicación del acta
consulta/index.html   consulta por escrito (pantalla de la Mesa)
votacion/index.html   sala de votación (lo que abren los copropietarios)
cuenta.html           panel del cliente
privacidad.html       declaración de privacidad
terminos.html         términos del servicio

js/                   todo el JavaScript de las páginas, en archivos aparte
js/acciones.js        despacha los data-ac= que reemplazaron a los onclick

_worker.js            Cloudflare Worker: pagos, correo entrante, geolocalización
consulta.js           interpreta las respuestas que llegan por correo   (Worker)
correo.js             envío saliente, con el proveedor aislado          (Worker)
cuenta.js             sesión: clave, código por correo o Google      (navegador)

vendor/               librerías de terceros, self-hosted, sin CDN
fonts/                tipografías self-hosted
_headers              cabeceras de seguridad y caché
_assetsignore         qué NO se publica (módulos del Worker, secretos)
wrangler.jsonc        configuración del Worker
```

No hay `package.json` ni proceso de build: las librerías van versionadas en
`vendor/`. Se actualizan a mano, a cambio de no tener superficie de ataque por
dependencias.

**Nada de JavaScript en línea.** El CSP no lleva `'unsafe-inline'` en
`script-src`, así que no funcionan ni los bloques `<script>` dentro del HTML ni
los atributos `onclick=`. Al agregar comportamiento:

- el código va en un archivo de `js/`, nunca dentro del HTML;
- los botones se marcan con `data-ac="miFuncion"` y, si necesitan argumentos,
  `data-args="@|texto|n:5|b:true"` (`@` es el propio elemento);
- la función tiene que ser global (`function miFuncion(){}` en el nivel
  superior del archivo). Si se declara con `const`, el despachador no la
  encuentra.

## Desarrollo

```bash
# solo las páginas
python -m http.server 8971

# con el Worker (pagos, correo)
wrangler dev --local --persist-to C:/wtmp/av --var RECESO:0
```

> En Windows conviene el `--persist-to` con ruta corta: en rutas largas el KV
> local de miniflare falla con un error interno.

Pruebas:

```bash
node ../Pruebas/correr.mjs
```

## Licencias de terceros

- **JSZip** — MIT
- **SheetJS Community Edition** — Apache 2.0
- **Source Sans 3**, **Fraunces** — SIL Open Font License 1.1

El código propio es de Soluciones CLB SpA. Queda prohibida su reproducción con
fines comerciales, su modificación o su distribución bajo nombre distinto sin
autorización expresa.
