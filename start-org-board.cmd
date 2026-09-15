@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo [조직보드] Windows 로컬 애플리케이션 시작 준비 중...

where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [오류] Node.js 런타임을 찾을 수 없습니다.
    echo Node.js 24(또는 호환 버전)와 npm을 설치하고 시스템 PATH에 등록한 후 다시 실행하세요.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
set SCRIPT_EXIT=%ERRORLEVEL%

if %SCRIPT_EXIT% NEQ 0 (
    echo.
    echo [오류] 조직보드 실행 스크립트가 오류 코드(%SCRIPT_EXIT%)로 종료되었습니다.
    echo 자세한 내용은 위 메시지를 확인하세요.
    echo.
    pause
    exit /b %SCRIPT_EXIT%
)

exit /b 0
