@echo off
chcp 65001 >nul
title Resetar senha do gerente - Central de Tecidos
cd /d "%~dp0"

echo ===============================================
echo       RESET DE SENHA - CENTRAL DE TECIDOS
echo ===============================================
echo.
echo Este comando redefine a senha do gerente para:
echo Altinopolis
echo.
echo No proximo acesso, o gerente devera cadastrar
echo uma nova senha antes de usar o sistema.
echo.
set /p "CONFIRMA=Digite SIM para continuar: "
if /I not "%CONFIRMA%"=="SIM" (
    echo Operacao cancelada.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$body = @{ senhaPadrao = 'Altinopolis' } | ConvertTo-Json; try { $resultado = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/auth/reset-gerente' -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 15; Write-Host ''; Write-Host $resultado.mensagem -ForegroundColor Green; exit 0 } catch { Write-Host ''; Write-Host 'Nao foi possivel redefinir a senha. Confirme se o sistema esta rodando neste computador.' -ForegroundColor Red; Write-Host $_.Exception.Message -ForegroundColor DarkRed; exit 1 }"
set "RESULTADO=%ERRORLEVEL%"

echo.
pause
exit /b %RESULTADO%
