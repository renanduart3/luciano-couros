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

# O mutex do TrayIcon.ps1 garante que este comando possa ser usado quantas
# vezes forem necessarias sem criar icones ou processos duplicados.
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-ExecutionPolicy", "Bypass",
    "-File", "`"$trayScript`""
)

exit 0
