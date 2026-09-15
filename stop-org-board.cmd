@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo [조직보드] Windows 로컬 애플리케이션 종료 준비 중...

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-local.ps1"
set SCRIPT_EXIT=%ERRORLEVEL%

if %SCRIPT_EXIT% NEQ 0 (
    echo.
    echo [오류] 조직보드 종료 스크립트 실행 중 문제가 발생했습니다 (코드 %SCRIPT_EXIT%).
    echo.
    pause
    exit /b %SCRIPT_EXIT%
)

exit /b 0
