param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Install", "Uninstall", "Update", "Start", "Stop", "Restart", "Status")]
    [string]$Action,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $ProjectRoot ".runtime"
$DataDir = Join-Path $ProjectRoot "data"
$PidFile = Join-Path $RuntimeDir "server.pid"
$OutputLog = Join-Path $RuntimeDir "server.log"
$ErrorLog = Join-Path $RuntimeDir "server-error.log"
$SystemUrl = "http://localhost:3000"
$HealthUrl = "http://127.0.0.1:3000"
$RepositoryUrl = "https://github.com/renanduart3/luciano-couros.git"
$RepositoryArchiveUrl = "https://github.com/renanduart3/luciano-couros/archive/refs/heads/main.zip"
$ServiceName = "CentralDeTecidos"
$ServiceDisplayName = "Central de Tecidos - Servidor"
$ServiceDir = Join-Path $RuntimeDir "service"
$ServiceExecutable = Join-Path $ServiceDir "$ServiceName.Service.exe"
$ServiceConfig = Join-Path $ServiceDir "$ServiceName.Service.xml"
$WinSwDownloadUrl = "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe"
$TrayScript = Join-Path $PSScriptRoot "TrayIcon.ps1"
$TrayShortcutName = "Central de Tecidos.lnk"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Assert-Administrator {
    if (-not (Test-Administrator)) {
        throw "Esta operacao precisa de permissao de administrador. Use um dos arquivos .cmd da pasta principal e confirme a janela do Windows."
    }
}

function Get-SystemService {
    return Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
}

function Wait-SystemHealth([int]$Attempts = 40) {
    for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
        Start-Sleep -Milliseconds 250
        try {
            $response = Invoke-WebRequest -Uri "$HealthUrl/api/health" -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return $true }
        } catch { }
    }
    return $false
}

function Get-SystemVersion {
    $packageFile = Join-Path $ProjectRoot "package.json"
    if (-not (Test-Path -LiteralPath $packageFile)) { return "desconhecida" }
    try {
        $package = Get-Content -LiteralPath $packageFile -Raw | ConvertFrom-Json
        return [string]$package.version
    } catch {
        return "desconhecida"
    }
}

function Register-UpdateHistory([string]$PreviousVersion, [string]$NewVersion) {
    $historyFile = Join-Path $RuntimeDir "update-history.log"
    $record = "{0} | SUCESSO | v{1} -> v{2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $PreviousVersion, $NewVersion
    Add-Content -LiteralPath $historyFile -Value $record -Encoding utf8
}

function Get-ManagedProcess {
    if (-not (Test-Path -LiteralPath $PidFile)) { return $null }
    $savedPid = (Get-Content -LiteralPath $PidFile -Raw).Trim()
    if ($savedPid -notmatch '^\d+$') {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $savedPid" -ErrorAction SilentlyContinue
    if ($null -eq $processInfo -or $processInfo.Name -ne "node.exe" -or $processInfo.CommandLine -notmatch 'dist[\\/]server\.cjs') {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }
    return Get-Process -Id ([int]$savedPid) -ErrorAction SilentlyContinue
}

function Get-ProjectProcessOnPort {
    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $listener) { return $null }
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" -ErrorAction SilentlyContinue
    if ($null -eq $processInfo -or $processInfo.Name -ne "node.exe") { return $null }
    $escapedRoot = [regex]::Escape($ProjectRoot)
    if ($processInfo.CommandLine -notmatch $escapedRoot -or $processInfo.CommandLine -notmatch '(server\.ts|dist[\\/]server\.cjs)') { return $null }
    return Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
}

function Stop-System {
    $service = Get-SystemService
    if ($null -ne $service) {
        Assert-Administrator
        if ($service.Status -eq "Stopped") {
            Write-Host "O servico ja esta parado."
            return
        }
        Write-Step "Parando o servico $ServiceDisplayName"
        Stop-Service -Name $ServiceName -Force
        (Get-Service -Name $ServiceName).WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
        Write-Host "Sistema parado." -ForegroundColor Yellow
        return
    }

    $managedProcess = Get-ManagedProcess
    if ($null -eq $managedProcess) {
        $managedProcess = Get-ProjectProcessOnPort
    }
    if ($null -eq $managedProcess) {
        Write-Host "O servidor gerenciado nao estava em execucao."
        return
    }
    Write-Step "Encerrando o servidor atual"
    Stop-Process -Id $managedProcess.Id -Force
    $managedProcess.WaitForExit()
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}

function Assert-PortAvailable {
    $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -ne $listener) {
        throw "A porta 3000 ja esta sendo usada pelo processo $($listener.OwningProcess). Feche esse programa e tente novamente."
    }
}

function Start-System {
    $systemVersion = Get-SystemVersion
    Write-Step "Iniciando o sistema v$systemVersion em $SystemUrl"
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null

    $service = Get-SystemService
    if ($null -ne $service) {
        Assert-Administrator
        if ($service.Status -ne "Running") {
            Start-Service -Name $ServiceName
            (Get-Service -Name $ServiceName).WaitForStatus("Running", [TimeSpan]::FromSeconds(30))
        }
        if (-not (Wait-SystemHealth)) {
            throw "O servico foi iniciado, mas o sistema nao respondeu em $HealthUrl. Consulte os logs em $RuntimeDir."
        }
        Write-Host "Sistema iniciado com sucesso." -ForegroundColor Green
        if (-not $NoBrowser) { Start-Process $SystemUrl }
        return
    }

    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) { throw "Node.js nao foi encontrado. Instale o Node.js 22 LTS e tente novamente." }
    $serverFile = Join-Path $ProjectRoot "dist\server.cjs"
    if (-not (Test-Path -LiteralPath $serverFile)) {
        Write-Host "Primeira execucao detectada; preparando o sistema automaticamente." -ForegroundColor Yellow
        Build-System
    }

    $existingProcess = Get-ManagedProcess
    if ($null -ne $existingProcess) {
        Write-Host "O sistema ja esta rodando (processo $($existingProcess.Id))."
        if (-not $NoBrowser) { Start-Process $SystemUrl }
        return
    }

    Assert-PortAvailable
    Remove-Item -LiteralPath $OutputLog, $ErrorLog -Force -ErrorAction SilentlyContinue
    $previousNodeEnv = $env:NODE_ENV
    $env:NODE_ENV = "production"
    try {
        $serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList "dist/server.cjs" -WorkingDirectory $ProjectRoot -WindowStyle Hidden -RedirectStandardOutput $OutputLog -RedirectStandardError $ErrorLog -PassThru
    } finally {
        $env:NODE_ENV = $previousNodeEnv
    }
    Set-Content -LiteralPath $PidFile -Value $serverProcess.Id -Encoding ascii

    $ready = Wait-SystemHealth

    if (-not $ready) {
        if (-not $serverProcess.HasExited) { Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue }
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        $details = if (Test-Path -LiteralPath $ErrorLog) { (Get-Content -LiteralPath $ErrorLog -Tail 15) -join "`n" } else { "Sem detalhes no log." }
        throw "O servidor nao respondeu corretamente.`n$details"
    }

    Write-Host "Sistema iniciado com sucesso." -ForegroundColor Green
    if (-not $NoBrowser) { Start-Process $SystemUrl }
}

function Backup-Databases {
    $databaseFiles = @(Get-ChildItem -LiteralPath $DataDir -File -Filter "database*.db*" -ErrorAction SilentlyContinue)
    if ($databaseFiles.Count -eq 0) { return }
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $backupDir = Join-Path $DataDir "backups\antes-da-atualizacao_$timestamp"
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
    foreach ($databaseFile in $databaseFiles) { Copy-Item -LiteralPath $databaseFile.FullName -Destination $backupDir -Force }
    $configFile = Join-Path $DataDir "mock_config.json"
    if (Test-Path -LiteralPath $configFile) { Copy-Item -LiteralPath $configFile -Destination $backupDir -Force }
    Write-Host "Backup dos dados criado em: $backupDir" -ForegroundColor Green
}

function Apply-UpdatePackage {
    $zipFile = Join-Path $ProjectRoot "atualizacao.zip"
    if (-not (Test-Path -LiteralPath $zipFile)) {
        $gitHead = Join-Path $ProjectRoot ".git\HEAD"
        $gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
        $hasCommit = $false
        if ((Test-Path -LiteralPath $gitHead) -and $null -ne $gitCommand) {
            & $gitCommand.Source -C $ProjectRoot rev-parse --verify HEAD 2>$null | Out-Null
            $hasCommit = $LASTEXITCODE -eq 0
        }

        if ($hasCommit) {
            Write-Step "Baixando a versao mais recente"
            & $gitCommand.Source -C $ProjectRoot pull --ff-only $RepositoryUrl main
            if ($LASTEXITCODE -eq 0) { return }
            Write-Host "Atualizacao pelo Git indisponivel; tentando o pacote da branch main." -ForegroundColor Yellow
        }

        Write-Step "Baixando a versao mais recente do GitHub"
        try {
            Invoke-WebRequest -Uri $RepositoryArchiveUrl -OutFile $zipFile -UseBasicParsing
        } catch {
            Remove-Item -LiteralPath $zipFile -Force -ErrorAction SilentlyContinue
            Write-Host "Nao foi possivel baixar $RepositoryUrl." -ForegroundColor Yellow
            Write-Host "Continuando com os arquivos locais desta instalacao." -ForegroundColor Yellow
            return
        }
    }

    Write-Step "Aplicando o pacote atualizacao.zip"
    $extractDir = Join-Path $RuntimeDir "update-extract"
    if (Test-Path -LiteralPath $extractDir) { Remove-Item -LiteralPath $extractDir -Recurse -Force }
    New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
    Expand-Archive -LiteralPath $zipFile -DestinationPath $extractDir -Force

    $sourceDir = $extractDir
    if (-not (Test-Path -LiteralPath (Join-Path $sourceDir "package.json"))) {
        $topDirectories = @(Get-ChildItem -LiteralPath $extractDir -Directory)
        if ($topDirectories.Count -eq 1 -and (Test-Path -LiteralPath (Join-Path $topDirectories[0].FullName "package.json"))) {
            $sourceDir = $topDirectories[0].FullName
        } else {
            throw "O atualizacao.zip nao possui um projeto valido (package.json nao encontrado)."
        }
    }

    $robocopyArgs = @($sourceDir, $ProjectRoot, "/E", "/R:2", "/W:1", "/XD", ".git", "node_modules", "dist", ".runtime", "backups", "data", "/XF", "database*.db*", "mock_config.json", ".env", "atualizacao.zip")
    & robocopy.exe @robocopyArgs | Out-Host
    if ($LASTEXITCODE -gt 7) { throw "Falha ao copiar os arquivos da atualizacao (codigo $LASTEXITCODE)." }

    $appliedPackagesDir = Join-Path $ProjectRoot "backups\pacotes-aplicados"
    New-Item -ItemType Directory -Path $appliedPackagesDir -Force | Out-Null
    $appliedZip = Join-Path $appliedPackagesDir ("atualizacao_" + (Get-Date -Format "yyyy-MM-dd_HH-mm-ss") + ".zip")
    Move-Item -LiteralPath $zipFile -Destination $appliedZip -Force
    Remove-Item -LiteralPath $extractDir -Recurse -Force
}

function Build-System {
    $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if ($null -eq $npmCommand) { throw "npm nao foi encontrado. Instale o Node.js 22 LTS e tente novamente." }

    Write-Step "Instalando as dependencias"
    & $npmCommand.Source install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Falha na instalacao das dependencias." }
    Write-Step "Compilando a nova versao"
    & $npmCommand.Source run build
    if ($LASTEXITCODE -ne 0) { throw "Falha na compilacao do sistema." }
}

function Write-ServiceConfig {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($null -eq $nodeCommand) { throw "Node.js nao foi encontrado. Instale o Node.js 22 LTS e tente novamente." }

    $escapedNode = [Security.SecurityElement]::Escape($nodeCommand.Source)
    $escapedRoot = [Security.SecurityElement]::Escape($ProjectRoot)
    $escapedRuntime = [Security.SecurityElement]::Escape($RuntimeDir)
    $xml = @"
<service>
  <id>$ServiceName</id>
  <name>$ServiceDisplayName</name>
  <description>Mantem o sistema Central de Tecidos disponivel nesta maquina.</description>
  <executable>$escapedNode</executable>
  <arguments>dist/server.cjs</arguments>
  <workingdirectory>$escapedRoot</workingdirectory>
  <env name="NODE_ENV" value="production" />
  <startmode>Automatic</startmode>
  <delayedAutoStart>true</delayedAutoStart>
  <stoptimeout>15 sec</stoptimeout>
  <logpath>$escapedRuntime</logpath>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>4</keepFiles>
  </log>
  <onfailure action="restart" delay="5 sec" />
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
</service>
"@
    Set-Content -LiteralPath $ServiceConfig -Value $xml -Encoding utf8
}

function Install-TrayShortcut {
    if (-not (Test-Path -LiteralPath $TrayScript)) {
        throw "O controlador da bandeja nao foi encontrado em $TrayScript."
    }
    $startupDir = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupDir $TrayShortcutName
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $shortcut.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$TrayScript`""
    $shortcut.WorkingDirectory = $ProjectRoot
    $shortcut.IconLocation = (Join-Path $ProjectRoot "src\img\favicon.ico")
    $shortcut.Save()
}

function Install-SystemService {
    Assert-Administrator
    if ($null -ne (Get-SystemService)) {
        Write-Host "O servico $ServiceDisplayName ja esta instalado." -ForegroundColor Yellow
        Install-TrayShortcut
        Start-System
        return
    }

    Stop-System
    Build-System
    New-Item -ItemType Directory -Path $ServiceDir -Force | Out-Null
    if (-not (Test-Path -LiteralPath $ServiceExecutable)) {
        Write-Step "Baixando o componente do servico do Windows"
        Invoke-WebRequest -Uri $WinSwDownloadUrl -OutFile $ServiceExecutable -UseBasicParsing
    }
    Write-ServiceConfig

    Write-Step "Registrando $ServiceDisplayName"
    & $ServiceExecutable install
    if ($LASTEXITCODE -ne 0) { throw "O Windows nao conseguiu registrar o servico (codigo $LASTEXITCODE)." }
    & sc.exe failure $ServiceName "reset=" "86400" "actions=" "restart/5000/restart/10000/restart/30000" | Out-Null
    Install-TrayShortcut
    Start-System
    Write-Host "Servico instalado e configurado para iniciar com o Windows." -ForegroundColor Green
}

function Uninstall-SystemService {
    Assert-Administrator
    $service = Get-SystemService
    if ($null -ne $service) {
        Stop-System
        Write-Step "Removendo o servico $ServiceDisplayName"
        if (-not (Test-Path -LiteralPath $ServiceExecutable)) {
            throw "O executavel de manutencao do servico nao foi encontrado em $ServiceExecutable."
        }
        & $ServiceExecutable uninstall
        if ($LASTEXITCODE -ne 0) { throw "O Windows nao conseguiu remover o servico (codigo $LASTEXITCODE)." }
    } else {
        Write-Host "O servico nao estava instalado."
    }
    $shortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) $TrayShortcutName
    Remove-Item -LiteralPath $shortcutPath -Force -ErrorAction SilentlyContinue
    Write-Host "Servico e inicializacao automatica do icone removidos." -ForegroundColor Green
}

function Show-SystemStatus {
    $service = Get-SystemService
    if ($null -eq $service) {
        Write-Host "Servico: nao instalado" -ForegroundColor Red
        exit 2
    }
    $healthy = Wait-SystemHealth -Attempts 1
    $color = if ($service.Status -eq "Running" -and $healthy) { "Green" } else { "Red" }
    Write-Host "Servico: $($service.Status) | API: $(if ($healthy) { 'respondendo' } else { 'indisponivel' })" -ForegroundColor $color
}

function Update-System {
    $previousVersion = Get-SystemVersion
    Write-Host "Versao instalada: v$previousVersion" -ForegroundColor Gray
    Stop-System
    Backup-Databases
    Apply-UpdatePackage
    Build-System
    $newVersion = Get-SystemVersion
    Start-System
    Register-UpdateHistory -PreviousVersion $previousVersion -NewVersion $newVersion
    Write-Host "Sistema atualizado: v$previousVersion -> v$newVersion" -ForegroundColor Green
}

try {
    Set-Location -LiteralPath $ProjectRoot
    New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
    switch ($Action) {
        "Install" { Install-SystemService }
        "Uninstall" { Uninstall-SystemService }
        "Update" { Update-System }
        "Start" { Start-System }
        "Stop" { Stop-System }
        "Restart" { Stop-System; Start-System }
        "Status" { Show-SystemStatus }
    }
    Write-Host "`nOperacao concluida." -ForegroundColor Green
    exit 0
} catch {
    Write-Host "`nERRO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Consulte os logs em: $RuntimeDir" -ForegroundColor Yellow
    exit 1
}
