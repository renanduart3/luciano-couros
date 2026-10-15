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
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Start-ManagerAction([string]$Action, [bool]$ExitAfterStop = $false) {
    if ($script:ExitAfterStop -or ($script:OperationProcess -and -not $script:OperationProcess.HasExited)) {
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
        $script:OperationProcess = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -PassThru -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $encoded"
        $script:ExitAfterStop = $ExitAfterStop
        $exitItem.Enabled = -not $ExitAfterStop
    } catch {
        $script:OperationProcess = $null
        $script:ExitAfterStop = $false
    }
}

$greenIcon = New-StatusIcon ([System.Drawing.Color]::FromArgb(34, 197, 94))
$redIcon = New-StatusIcon ([System.Drawing.Color]::FromArgb(239, 68, 68))
$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
$notifyIcon.Icon = $redIcon
$notifyIcon.Text = "Central de Tecidos - parado"
$notifyIcon.Visible = $true

function Get-ExplorerIdentity {
    $explorer = Get-Process explorer -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $explorer) { return $null }
    try {
        return "$($explorer.Id):$($explorer.StartTime.Ticks)"
    } catch {
        return "$($explorer.Id)"
    }
}

$explorerIdentity = Get-ExplorerIdentity

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
$exitItem = $menu.Items.Add("Sair")
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
$exitItem.Add_Click({ Start-ManagerAction "Stop" $true })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({
    # UI is opened by this interactive tray, never by the Windows service in session 0.
    $runtime = Join-Path $ProjectRoot '.runtime'
    $requestFile = Join-Path $runtime 'folder-picker-request.json'
    $responseFile = Join-Path $runtime 'folder-picker-response.json'
    try {
        [System.IO.Directory]::CreateDirectory($runtime) | Out-Null
        [System.IO.File]::WriteAllText((Join-Path $runtime 'tray-heartbeat'), 'ready')
        if (Test-Path -LiteralPath $requestFile) {
            $request = Get-Content -LiteralPath $requestFile -Raw | ConvertFrom-Json
            $epoch = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            if ($request.id -match '^[a-f0-9-]{36}$' -and $request.expiresAt -gt $epoch) {
                Remove-Item -LiteralPath $requestFile
                $folder = $null
                $pickerError = $null
                try { $folder = & (Join-Path $PSScriptRoot 'SelecionarPasta.ps1') }
                catch { $pickerError = 'Nao foi possivel abrir o seletor de pastas.' }
                $result = @{ id = $request.id; folder = $folder; error = $pickerError } | ConvertTo-Json -Compress
                [System.IO.File]::WriteAllText($responseFile, $result, (New-Object System.Text.UTF8Encoding($false)))
            }
        }
    } catch { }

    # Quando o Explorer do Windows reinicia, a area de notificacao e recriada.
    # Registrar novamente o NotifyIcon faz o controle reaparecer sem reiniciar
    # o servico ou criar outra instancia do tray.
    $currentExplorerIdentity = Get-ExplorerIdentity
    if ($null -ne $currentExplorerIdentity -and $currentExplorerIdentity -ne $script:explorerIdentity) {
        $script:explorerIdentity = $currentExplorerIdentity
        $notifyIcon.Visible = $false
        $notifyIcon.Visible = $true
    } elseif ($null -eq $currentExplorerIdentity) {
        $script:explorerIdentity = $null
    }

    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    $healthy = Test-SystemHealthy
    $serviceRunning = ($null -ne $service -and $service.Status -eq "Running") -or $healthy
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
        $operationSucceeded = $script:OperationProcess.ExitCode -eq 0
        $shouldExit = $script:ExitAfterStop
        $script:ExitAfterStop = $false
        $exitItem.Enabled = $true
        $script:OperationProcess.Dispose()
        $script:OperationProcess = $null
        if ($shouldExit) {
            if ($operationSucceeded) {
                $timer.Stop()
                $notifyIcon.Visible = $false
                [System.Windows.Forms.Application]::Exit()
            } else {
                [System.Windows.Forms.MessageBox]::Show(
                    "Nao foi possivel parar o sistema. Tente Sair novamente.",
                    "Central de Tecidos", "OK", "Error"
                ) | Out-Null
            }
        }
    }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()

$heartbeat = Join-Path $ProjectRoot '.runtime\tray-heartbeat'
Remove-Item -LiteralPath $heartbeat -Force -ErrorAction SilentlyContinue
$timer.Dispose()
$notifyIcon.Dispose()
$greenIcon.Dispose()
$redIcon.Dispose()
$singleInstance.ReleaseMutex()
$singleInstance.Dispose()
