# Procedencia de las librerías de `vendor/`

El sitio no tiene `package.json` ni proceso de compilación: estas cuatro
librerías son copias servidas desde el propio origen (`script-src 'self'`).
Eso las deja fuera de `npm audit` y de cualquier aviso automático. Este archivo
es el registro de qué versión es cada una y cuál es su huella, y
`Pruebas/prueba-seg-vendor.mjs` falla si un archivo cambia sin que se
actualice aquí (hallazgo A8 de la auditoría del 22-09-2026).

No se publica: está en `.assetsignore`.

| Archivo | Librería y versión | Origen declarado | Bytes | SHA-256 |
|---|---|---|---|---|
| `jszip.min.js` | JSZip 3.10.1 | npm `jszip@3.10.1`, `dist/jszip.min.js` | 97630 | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |
| `qrcode-generator.js` | QR Code Generator (Kazuhiko Arase), sin versión declarada en el archivo | npm `qrcode-generator` | 56694 | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |
| `supabase.min.js` | @supabase/supabase-js 2.108.2 | jsDelivr, `/npm/@supabase/supabase-js@2.108.2/dist/umd/supabase.js` minificado | 204211 | `f06ea3e7d7ab62ccfa27278d02b42d0aabc6ca72db782c89a66e166516e5c6e8` |
| `xlsx.full.min.js` | SheetJS 0.20.3 | `cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` (SheetJS dejó de publicar en npm) | 951904 | `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41` |

## Avisos de seguridad conocidos (revisado el 22-09-2026)

- **SheetJS 0.20.3**: por encima de las dos correcciones conocidas
  (CVE-2023-30533, contaminación de prototipo, corregida en 0.19.3; y
  CVE-2024-22363, ReDoS, corregida en 0.20.2). Es la que más importa vigilar:
  lee el Excel del padrón que sube la Mesa, o sea entrada de un tercero.
  Muchos escáneres la marcan igual, porque la versión de npm quedó congelada en
  0.18.5; si aparece en un informe, es eso.
- **JSZip 3.10.1**: por encima de CVE-2022-48285 (corregida en 3.8.0). Se usa
  para generar archivos, no para leer los del usuario.
- **supabase-js 2.108.2** y **qrcode-generator**: sin avisos conocidos.

## Al actualizar una librería

1. Bajar la versión nueva desde su origen oficial y reemplazar el archivo.
2. Actualizar aquí la versión, los bytes y el SHA-256 (`sha256sum archivo`).
3. Correr `node Pruebas/correr.mjs`: si la huella no calza, la suite lo dice.
4. Revisar sus avisos de seguridad y dejar la fecha arriba.

Las huellas de esta tabla son las de los archivos que había en el
repositorio el 23-09-2026. No se contrastaron contra los originales
descargados en esa fecha.
