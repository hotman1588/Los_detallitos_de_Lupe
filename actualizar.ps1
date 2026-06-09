# ============================================================
#  actualizar.ps1
#  Sube los cambios del proyecto a GitHub (rama main).
#
#  Uso:
#    - Doble clic (o clic derecho > "Ejecutar con PowerShell"), o
#    - En la terminal:  .\actualizar.ps1 "mi mensaje de cambio"
#
#  Si no escribes mensaje, usa uno con la fecha y hora actual.
# ============================================================

param(
    [string]$Mensaje = "Actualizacion $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
)

# Ir a la carpeta donde está este script (raíz del proyecto)
Set-Location -Path $PSScriptRoot

Write-Host "==> Verificando tipos (TypeScript)..." -ForegroundColor Cyan
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) {
    Write-Host "X  Hay errores de TypeScript. No se subio nada. Corrigelos y vuelve a intentar." -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}
Write-Host "OK  Sin errores de tipos." -ForegroundColor Green

Write-Host "==> Preparando cambios..." -ForegroundColor Cyan
git add -A

# Si no hay nada que subir, avisar y salir
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No hay cambios nuevos para subir." -ForegroundColor Yellow
    Read-Host "Presiona Enter para salir"
    exit 0
}

Write-Host "==> Creando commit: $Mensaje" -ForegroundColor Cyan
git commit -m $Mensaje

Write-Host "==> Subiendo a GitHub (origin main)..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "X  Fallo el push. Revisa tu conexion o credenciales de GitHub." -ForegroundColor Red
    Read-Host "Presiona Enter para salir"
    exit 1
}

Write-Host ""
Write-Host "LISTO! Repositorio actualizado correctamente." -ForegroundColor Green
Read-Host "Presiona Enter para salir"
