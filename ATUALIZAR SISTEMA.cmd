@echo off
chcp 65001 >nul
title Atualizar Sistema - Central de Tecidos
cd /d "%~dp0"

echo ===============================================
echo       ATUALIZACAO - CENTRAL DE TECIDOS
echo ===============================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\GerenciarSistema.ps1" -Action Update
set "RESULTADO=%ERRORLEVEL%"

echo.
if not "%RESULTADO%"=="0" (
    echo A atualizacao nao foi concluida. Leia a mensagem acima.
) else (
    echo O sistema foi atualizado e esta rodando em localhost:3000.
)
echo.
pause
exit /b %RESULTADO%
