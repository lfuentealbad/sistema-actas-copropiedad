# Sistema de Actas de Copropiedad

Herramienta web gratuita para redactar el acta de una asamblea de copropietarios
paso a paso, conforme a la **Ley N° 21.442** sobre Copropiedad Inmobiliaria (Chile).

Funciona **completamente en el navegador**: no envía datos a ningún servidor, no
requiere cuenta y no almacena información en la nube. Toda la información permanece
en el dispositivo de quien la usa.

## Características

- Asistente de 6 pasos (datos, convocatoria, asistencia, tabla, firmas, acta final).
- Cálculo automático de quórum de constitución y de adopción de acuerdos.
- Registro de votación por punto del orden del día.
- Importación del padrón desde Excel/CSV.
- Guardado automático en el navegador y borrador exportable (.json).
- Generación del acta lista para guardar como PDF.

## Estructura del repositorio

```
index.html                 ← la aplicación (un solo archivo, HTML+CSS+JS)
vendor/                    ← librerías de terceros (self-hosted, sin CDN)
  jszip.min.js             ·  JSZip 3.10.1 (MIT)
  xlsx.full.min.js         ·  SheetJS Community 0.18.5 (Apache-2.0)
fonts/                     ← tipografía self-hosted
  source-sans-3.css        ·  Source Sans 3 (SIL OFL 1.1)
  *.woff2
_headers                   ← cabeceras de seguridad/caché para Cloudflare Pages
```

No tiene backend, base de datos ni proceso de build: es 100% estático.

## Despliegue en Cloudflare Pages

1. Subir este repositorio a GitHub.
2. En el panel de Cloudflare → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**, seleccionar el repositorio.
3. Configuración de build:
   - **Framework preset:** None
   - **Build command:** *(vacío)*
   - **Build output directory:** `/`
4. **Save and Deploy.** Cada `git push` vuelve a publicar automáticamente.

## Uso local (sin servidor)

Basta abrir `index.html` en el navegador (doble clic). Todos los recursos son
locales, por lo que funciona sin conexión a internet.

Para servirlo localmente con un servidor estático:

```
python -m http.server 8000
# luego abrir http://localhost:8000/
```

## Privacidad

Esta herramienta no recolecta datos. No hay analítica, ni cookies, ni llamadas a
servidores externos (las librerías y la tipografía están alojadas en el propio sitio).

## Licencias de terceros

- **JSZip** — MIT License
- **SheetJS Community Edition** — Apache License 2.0
- **Source Sans 3** — SIL Open Font License 1.1

El código propio del Sistema de Actas es obra de su autor; su uso institucional es
gratuito. Queda prohibida su reproducción con fines comerciales, su modificación o
su distribución bajo nombre distinto sin autorización expresa del autor.
