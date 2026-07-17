@echo off
title Classroom Pet System - Launcher

echo ====================================
echo   Classroom Pet System Launcher
echo ====================================
echo.

cd /d "%~dp0"

:: Check requirements
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Python not found. Opening index.html directly...
    echo Some features (sync, update check) may not work.
    echo.
    start "" "index.html"
    echo Press any key to exit...
    pause >nul
    exit /b
)

:: Start HTTP server in current directory
echo [1/2] Starting server on http://localhost:5500 ...
echo.
echo   Server: http://localhost:5500/
echo   Close this window to stop the server.
echo.

:: Wait a moment then open browser
ping 127.0.0.1 -n 3 >nul
start "" http://localhost:5500/

:: Run server (foreground, single window)
python -m http.server 5500

echo.
echo Server stopped. Press any key to exit...
pause >nul