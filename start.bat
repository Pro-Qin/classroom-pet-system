@echo off
rem ============================================================
rem  Campus Pet Paradise - launcher (ASCII-only, no CJK to avoid
rem  GBK/UTF-8 confusion in cmd.exe). All messages in English.
rem ============================================================
setlocal
cd /d "%~dp0"
title Campus Pet Paradise - Launcher

echo ============================================
echo   Campus Pet Paradise  Launcher
echo   (points + pet raising class incentive system)
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js not found.
    echo         Install Node.js 18+ from https://nodejs.org
    echo.
    pause >nul
    exit /b 1
)

if not exist "node_modules" (
    echo [FIRST RUN] Dependencies not found. Installing via China mirror
    echo             (needs internet, about 1-3 min)...
    echo.
    call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
    if errorlevel 1 goto :fail
    echo.
)

if not exist "server\dist\index.js" (
    echo [FIRST RUN] Build output not found. Building...
    echo.
    call npm run build
    if errorlevel 1 goto :fail
    echo.
)

echo [START] Server: http://localhost:3000
echo         Other devices on the same LAN: http://this-PC-IP:3000
echo         Close this window to stop the server.
echo.
call node server\dist\index.js
goto :eof

:fail
echo.
echo [ERROR] Operation failed. Check the output above
echo         (use a mirror / proxy if npm is blocked).
echo.
pause >nul
endlocal
