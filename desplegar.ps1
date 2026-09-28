# =====================================================================
#  Despliegue del sitio y del Worker
#
#  Hallazgos CN-006 y CN-013 de la auditoria del 26-09-2026: se publicaba
#  el arbol de trabajo tal cual (con lo que no estaba confirmado), con la
#  version de wrangler que resolviera npx ese dia, sin exigir las pruebas
#  y casi siempre sin --message. Este script es el unico camino:
#
#    1) aborta si hay cambios sin confirmar, aqui o en la carpeta raiz
#       (donde viven las pruebas);
#    2) corre la suite completa y aborta si algo falla;
#    3) exporta HEAD con git archive a una carpeta temporal fuera de
#       OneDrive: se publica lo confirmado, nada mas;
#    4) instala wrangler con npm ci desde package-lock.json (version fija
#       y con su integridad comprobada) y despliega con --no-install y
#       --message "<commit> <asunto>";
#    5) deja el tag deploy-AAAAMMDD-HHMM en el commit publicado.
#
#  Uso, desde esta carpeta:
#
#      powershell -ExecutionPolicy Bypass -File .\desplegar.ps1
#      powershell -ExecutionPolicy Bypass -File .\desplegar.ps1 -Mensaje "codigo del votante"
#
#  Las pruebas no se pueden saltar: no hay opcion para eso, a proposito.
#
#  VOLVER ATRAS. Cada despliegue es una version del Worker. Desde la
#  carpeta temporal que deja este script (la ruta sale al final):
#
#      npx --no-install wrangler deployments list
#      npx --no-install wrangler rollback <version-id>
#
#  El rollback vuelve el codigo y los archivos del sitio, NO la base de
#  datos: si el despliegue iba con una migracion, se vuelve atras a mano.
# =====================================================================

[CmdletBinding()]
param([string]$Mensaje = '')

$ErrorActionPreference = 'Stop'
$sitio = $PSScriptRoot
$raiz = Split-Path $sitio -Parent

function Falla([string]$texto) {
  Write-Host ''
  Write-Host "NO SE DESPLEGO: $texto" -ForegroundColor Red
  exit 1
}

# 1) Nada sin confirmar, ni en el sitio ni en la raiz.
foreach ($repo in @($sitio, $raiz)) {
  $sucio = git -C $repo status --porcelain
  if ($LASTEXITCODE -ne 0) { Falla "git no pudo leer $repo" }
  if ($sucio) { Falla ("hay cambios sin confirmar en $repo`n" + ($sucio -join "`n")) }
}

# 2) La suite completa.
Write-Host 'Corriendo las pruebas...' -ForegroundColor Cyan
node (Join-Path $raiz 'Pruebas\correr.mjs')
if ($LASTEXITCODE -ne 0) { Falla 'las pruebas no pasan' }

# 3) Lo confirmado, en una carpeta temporal fuera de OneDrive.
$sha = (git -C $sitio rev-parse --short HEAD | Out-String).Trim()
$asunto = (git -C $sitio log -1 --format=%s | Out-String).Trim()
$dest = Join-Path $env:TEMP ('actaviva-deploy-' + $sha)
$zip = Join-Path $env:TEMP ('actaviva-deploy-' + $sha + '.zip')
if (Test-Path $dest) { Remove-Item -Recurse -Force $dest }
git -C $sitio archive --format=zip -o $zip HEAD
if ($LASTEXITCODE -ne 0) { Falla 'git archive fallo' }
Expand-Archive -Path $zip -DestinationPath $dest -Force
Remove-Item $zip

# 4) wrangler fijo y despliegue.
$texto = if ($Mensaje) { "$sha $Mensaje" } else { "$sha $asunto" }
if ($texto.Length -gt 100) { $texto = $texto.Substring(0, 100) }
Push-Location $dest
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Falla 'npm ci fallo (revise package-lock.json)' }
  npx --no-install wrangler --version
  if ($LASTEXITCODE -ne 0) { Falla 'wrangler no quedo instalado' }
  npx --no-install wrangler deploy --message $texto
  if ($LASTEXITCODE -ne 0) { Falla 'wrangler deploy fallo' }
} finally {
  Pop-Location
}

# 5) El tag del commit publicado.
$tag = 'deploy-' + (Get-Date -Format 'yyyyMMdd-HHmm')
git -C $sitio tag $tag HEAD
if ($LASTEXITCODE -ne 0) { Write-Host "Desplegado, pero no se pudo crear el tag $tag." -ForegroundColor Yellow; exit 0 }

Write-Host ''
Write-Host "Desplegado $sha como $tag." -ForegroundColor Green
Write-Host "Carpeta del despliegue (para rollback): $dest"
