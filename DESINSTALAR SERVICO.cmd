@echo off
chcp 65001 >nul
title Desinstalar Servico - Central de Tecidos
cd /d "%~dp0"

echo Solicitando permissao de administrador...
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\ExecutarComoAdministrador.ps1" -Action Uninstall
set "RESULTADO=%ERRORLEVEL%"

echo.
if not "%RESULTADO%"=="0" (
    echo A remocao nao foi concluida.
) else (
    echo Servico removido com sucesso.
)
echo.
pause
exit /b %RESULTADO%
