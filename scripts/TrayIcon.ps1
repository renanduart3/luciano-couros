param()

$ErrorActionPreference = "SilentlyContinue"
$createdNew = $false
$singleInstance = New-Object System.Threading.Mutex($true, "Local\CentralDeTecidosTray", [ref]$createdNew)
if (-not $createdNew) {
    $singleInstance.Dispose()
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TrayNativeMethods {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern bool DestroyIcon(IntPtr handle);
}
"@

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ManagerScript = Join-Path $PSScriptRoot "GerenciarSistema.ps1"
$ServiceName = "CentralDeTecidos"
$SystemUrl = "http://localhost:3000"
$HealthUrl = "http://127.0.0.1:3000/api/health"

function New-StatusIcon([System.Drawing.Color]$Color) {
    $bitmap = New-Object System.Drawing.Bitmap 32, 32
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $shadowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(70, 0, 0, 0))
    $colorBrush = New-Object System.Drawing.SolidBrush $Color
    $borderPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 2
    $graphics.FillEllipse($shadowBrush, 4, 5, 24, 24)
    $graphics.FillEllipse($colorBrush, 3, 3, 24, 24)
    $graphics.DrawEllipse($borderPen, 3, 3, 24, 24)
    $handle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($handle).Clone()
    [TrayNativeMethods]::DestroyIcon($handle) | Out-Null
    $borderPen.Dispose()
    $colorBrush.Dispose()
    $shadowBrush.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
    return $icon
}

function Test-SystemHealthy {
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $service -or $service.Status -ne "Running") { return $false }
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-ManagerAction([string]$Action) {
    if ($script:OperationProcess -and -not $script:OperationProcess.HasExited) {
        [System.Windows.Forms.MessageBox]::Show(
            "Aguarde a operacao atual terminar.",
            "Central de Tecidos",
            "OK",
            "Information"
        ) | Out-Null
        return
    }
    $escapedManager = $ManagerScript.Replace("'", "''")
    $command = "& '$escapedManager' -Action '$Action' -NoBrowser"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($command))
    try {
        $script:OperationProcess = Start-Process powershell.exe -Verb RunAs -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
    } catch {
        $script:OperationProcess = $null
    }
}

$greenIcon = New-StatusIcon ([System.Drawing.Color]::FromArgb(34, 197, 94))
$redIcon = New-StatusIcon ([System.Drawing.Color]::FromArgb(239, 68, 68))
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $redIcon
$notifyIcon.Text = "Central de Tecidos - parado"
$notifyIcon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$statusItem = $menu.Items.Add("Status: verificando...")
$statusItem.Enabled = $false
$menu.Items.Add("-") | Out-Null
$openItem = $menu.Items.Add("Abrir sistema")
$startItem = $menu.Items.Add("Iniciar")
$stopItem = $menu.Items.Add("Parar")
$restartItem = $menu.Items.Add("Reiniciar")
$updateItem = $menu.Items.Add("Atualizar")
$menu.Items.Add("-") | Out-Null
$exitItem = $menu.Items.Add("Sair do icone")
$notifyIcon.ContextMenuStrip = $menu

$openSystem = {
    if (Test-SystemHealthy) {
        Start-Process $SystemUrl
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "O sistema esta parado. Use a opcao Iniciar.",
            "Central de Tecidos",
            "OK",
            "Warning"
        ) | Out-Null
    }
}
$openItem.Add_Click($openSystem)
$notifyIcon.Add_DoubleClick($openSystem)
$startItem.Add_Click({ Start-ManagerAction "Start" })
$stopItem.Add_Click({ Start-ManagerAction "Stop" })
$restartItem.Add_Click({ Start-ManagerAction "Restart" })
$updateItem.Add_Click({ Start-ManagerAction "Update" })
$exitItem.Add_Click({
    $notifyIcon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($null -eq $service) {
        $notifyIcon.Visible = $false
        [System.Windows.Forms.Application]::Exit()
        return
    }
    $serviceRunning = $service.Status -eq "Running"
    $healthy = $serviceRunning -and (Test-SystemHealthy)
    if ($healthy) {
        $notifyIcon.Icon = $greenIcon
        $notifyIcon.Text = "Central de Tecidos - rodando"
        $statusItem.Text = "Status: rodando"
    } else {
        $notifyIcon.Icon = $redIcon
        $notifyIcon.Text = "Central de Tecidos - parado"
        $statusItem.Text = "Status: parado"
    }
    $startItem.Enabled = -not $serviceRunning
    $stopItem.Enabled = $serviceRunning
    if ($script:OperationProcess -and $script:OperationProcess.HasExited) {
        $script:OperationProcess.Dispose()
        $script:OperationProcess = $null
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()

$timer.Dispose()
$notifyIcon.Dispose()
$greenIcon.Dispose()
$redIcon.Dispose()
$singleInstance.ReleaseMutex()
$singleInstance.Dispose()
