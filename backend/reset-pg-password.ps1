Write-Host "Buscando instancia de PostgreSQL activa por postmaster.pid..."

$dataDir = $null
$pgBin   = $null

foreach ($v in @("18","17","16")) {
    $d = "C:\Program Files\PostgreSQL\" + $v + "\data"
    $b = "C:\Program Files\PostgreSQL\" + $v + "\bin"
    if (Test-Path ($d + "\postmaster.pid")) {
        $dataDir = $d
        $pgBin   = $b
        Write-Host ("Instancia activa encontrada: PostgreSQL " + $v)
        Write-Host ("Data dir: " + $dataDir)
        break
    }
}

if ($dataDir -eq $null) {
    Write-Host "No se encontro postmaster.pid en ninguna instalacion."
    Write-Host "PostgreSQL no esta corriendo. Inicialo desde Servicios (services.msc) y vuelve a correr este script."
    exit 1
}

$hbaFile = $dataDir + "\pg_hba.conf"
$psql    = $pgBin   + "\psql.exe"
$pgctl   = $pgBin   + "\pg_ctl.exe"
$newPass = "roulette2024"

Write-Host ("hba.conf: " + $hbaFile)

Write-Host "Leyendo pg_hba.conf..."
$original = Get-Content $hbaFile
$modified = $original -replace "scram-sha-256","trust" -replace "\bmd5\b","trust"

Write-Host "Escribiendo pg_hba.conf con trust..."
Set-Content -Path $hbaFile -Value $modified

Write-Host "Recargando configuracion con pg_ctl reload..."
$reloadArg = "-D"
& $pgctl $reloadArg $dataDir
Start-Sleep -Seconds 3

Write-Host "Cambiando password..."
$env:PGPASSWORD = ""
$alterSql = "ALTER USER postgres WITH PASSWORD 'roulette2024';"
& $psql -h 127.0.0.1 -p 5432 -U postgres -c $alterSql

Write-Host "Restaurando pg_hba.conf original..."
Set-Content -Path $hbaFile -Value $original

Write-Host "Recargando configuracion restaurada..."
& $pgctl $reloadArg $dataDir
Start-Sleep -Seconds 3

Write-Host "Verificando conexion con password roulette2024..."
$env:PGPASSWORD = "roulette2024"
& $psql -h 127.0.0.1 -p 5432 -U postgres -c "SELECT 1 AS ok;"
$env:PGPASSWORD = ""

Write-Host "Script terminado."
