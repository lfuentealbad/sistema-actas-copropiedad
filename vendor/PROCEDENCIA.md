# Procedencia de las librerías de `vendor/`

El sitio no tiene `package.json` ni proceso de compilación: estas tres
librerías son copias servidas desde el propio origen (`script-src 'self'`).
Eso las deja fuera de `npm audit` y de cualquier aviso automático. Este archivo
es el registro de qué versión es cada una y cuál es su huella, y
`Pruebas/prueba-seg-vendor.mjs` falla si un archivo cambia sin que se
actualice aquí (hallazgo A8 de la auditoría del 22-09-2026).

No se publica: está en `.assetsignore`.

| Archivo | Librería y versión | Origen declarado | Bytes | SHA-256 |
|---|---|---|---|---|
| `qrcode-generator.js` | QR Code Generator (Kazuhiko Arase), sin versión declarada en el archivo | npm `qrcode-generator` | 56694 | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |
| `supabase.min.js` | @supabase/supabase-js 2.117.2 | npm `@supabase/supabase-js@2.117.2`, `dist/umd/supabase.js` tal cual (ya viene minificado); integridad sha512 del paquete comprobada contra el registro de npm | 217945 | `59d39487c3589843b410322d8a3d562ce022aba1e5ccb16898ef3fb2a0da2ecd` |
| `xlsx.full.min.js` | SheetJS 0.20.3 | `cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (SheetJS dejó de publicar en npm) | 951904 | `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41` |

## Avisos de seguridad conocidos (revisado el 22-09-2026)

- **SheetJS 0.20.3**: por encima de las dos correcciones conocidas
  (CVE-2023-30533, contaminación de prototipo, corregida en 0.19.3; y
  CVE-2024-22363, ReDoS, corregida en 0.20.2). Es la que más importa vigilar:
  lee el Excel del padrón que sube la Mesa, o sea entrada de un tercero.
  Muchos escáneres la marcan igual, porque la versión de npm quedó congelada en
  0.18.5; si aparece en un informe, es eso.
- **JSZip** se quitó el 28-09-2026: la página la cargaba y ningún código la
  usaba (la auditoría del 26-09 lo marcó). Una librería que no se usa es
  superficie sin beneficio.
- **supabase-js 2.117.2** (revisado el 28-09-2026): corrige CVE-2026-56812,
  que traía la 2.108.2 anterior. El defecto está en la Presence de Realtime
  (Phoenix): una clave como `constructor` o `__proto__` devolvía el prototipo
  y tumbaba la sincronización de todos los que miran el canal. El sitio no usa
  Realtime, así que no era alcanzable, pero los escáneres como Acunetix lo
  marcan por versión. `npm audit` no lo muestra: Supabase trae su propia copia
  de Phoenix (`@supabase/phoenix`) y el aviso está sobre el paquete `phoenix`.
  Hasta el 28-09 este registro decía «sin avisos conocidos», y era falso: el
  aviso se publicó el 03-09.
- **qrcode-generator**: sin avisos conocidos.

## Al actualizar una librería

1. Bajar la versión nueva desde su origen oficial y reemplazar el archivo.
2. Actualizar aquí la versión, los bytes y el SHA-256 (`sha256sum archivo`).
3. Correr `node Pruebas/correr.mjs`: si la huella no calza, la suite lo dice.
4. Revisar sus avisos de seguridad y dejar la fecha arriba.

Las huellas de qrcode-generator y SheetJS son las de los archivos
que había en el repositorio el 23-09-2026; el 26-09 se comprobó que
coincidían byte a byte con sus originales publicados. La de supabase.min.js
es la del archivo oficial del paquete de npm, bajado y comprobado el
28-09-2026.
