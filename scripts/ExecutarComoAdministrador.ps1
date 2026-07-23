param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("Install", "Uninstall", "Update", "Start", "Stop", "Restart")]
    [string]$Action
)

$ErrorActionPreference = "Stop"
$managerScript = Join-Path $PSScriptRoot "GerenciarSistema.ps1"
$escapedManager = $managerScript.Replace("'", "''")
$command = "& '$escapedManager' -Action '$Action'"
$encodedCommand = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))

try {
    $process = Start-Process powershell.exe -Verb RunAs -Wait -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encodedCommand"
} catch {
    Write-Host "A permissao de administrador nao foi concedida." -ForegroundColor Red
    exit 1
}

if ($process.ExitCode -eq 0 -and $Action -eq "Install") {
    $trayScript = Join-Path $PSScriptRoot "TrayIcon.ps1"
    Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$trayScript`""
}

exit $process.ExitCode
