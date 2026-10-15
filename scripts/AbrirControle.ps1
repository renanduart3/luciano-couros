param()

$ErrorActionPreference = "Stop"
$trayScript = Join-Path $PSScriptRoot "TrayIcon.ps1"

if (-not (Test-Path -LiteralPath $trayScript)) {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "O controlador da bandeja nao foi encontrado.`n$trayScript",
        "Central de Tecidos",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}

# The desktop shortcut also starts the server again after choosing Sair.
$managerScript = Join-Path $PSScriptRoot "GerenciarSistema.ps1"
$command = "& '" + $managerScript.Replace("'", "''") + "' -Action Start"
$encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
try {
    $operation = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
    $operation.Refresh()
    if ($operation.ExitCode -ne 0) { throw "Nao foi possivel iniciar o sistema." }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
        "O sistema nao foi iniciado. Tente abrir o atalho novamente.`n$($_.Exception.Message)",
        "Central de Tecidos", "OK", "Error"
    ) | Out-Null
    exit 1
}

$runtime = Join-Path (Split-Path -Parent $PSScriptRoot) '.runtime'
$heartbeat = Join-Path $runtime 'tray-heartbeat'
# An old tray holds the same mutex but cannot answer folder requests. Replace only
# this installation's tray in this user's session, never unrelated PowerShell apps.
if ((Test-Path -LiteralPath $heartbeat) -and ((Get-Date) - (Get-Item -LiteralPath $heartbeat).LastWriteTime).TotalSeconds -lt 15) { exit 0 }
$currentSession = (Get-Process -Id $PID).SessionId
$existing = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
    $_.SessionId -eq $currentSession -and $_.CommandLine -and $_.CommandLine.Contains('"' + $trayScript + '"')
}
foreach ($process in $existing) { Stop-Process -Id $process.ProcessId -ErrorAction Stop }
if (Test-Path -LiteralPath $heartbeat) { Remove-Item -LiteralPath $heartbeat }
[System.IO.Directory]::CreateDirectory($runtime) | Out-Null
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile", "-STA",
    "-WindowStyle", "Hidden",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$trayScript`""
)

for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path -LiteralPath $heartbeat) { exit 0 }
}
throw "O controlador nao iniciou. Confira se o Windows permite executar scripts desta instalacao."
