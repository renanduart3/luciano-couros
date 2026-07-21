@echo off
chcp 65001 >nul
title Reiniciar Sistema - Central de Tecidos
cd /d "%~dp0"

echo ===============================================
echo         REINICIO - CENTRAL DE TECIDOS
echo ===============================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\GerenciarSistema.ps1" -Action Restart
set "RESULTADO=%ERRORLEVEL%"

echo.
if not "%RESULTADO%"=="0" (
    echo O sistema nao foi reiniciado. Leia a mensagem acima.
) else (
    echo O sistema esta rodando em localhost:3000.
)
echo.
pause
exit /b %RESULTADO%
