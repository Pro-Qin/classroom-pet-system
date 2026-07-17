@echo off
title Classroom Pet System - Launcher

cd /d "%~dp0"
set "PYTHON_URL=https://mirrors.tuna.tsinghua.edu.cn/python/3.12.3/python-3.12.3-amd64.exe"
set "STATUS_FILE=setup_status.json"

echo ====================================
echo   Classroom Pet System Launcher
echo ====================================
echo.

:: Check Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [SETUP] Python not found. Installing Python 3.12...
    echo.
    
    :: Write initial status
    echo {"progress":5,"status":"正在下载 Python 3.12...","done":false} > "%STATUS_FILE%"
    start "" "http://localhost:5500/setup.html"
    
    :: Start a temporary server for the setup page
    start /b python -m http.server 5500 >nul 2>&1
    timeout /t 2 /nobreak >nul
    
    :: Download Python with progress (using PowerShell)
    echo {"progress":15,"status":"下载中 (清华镜像)...","done":false} > "%STATUS_FILE%"
    powershell -Command "& {
        $url = '%PYTHON_URL%';
        $out = 'python-installer.exe';
        $wc = New-Object System.Net.WebClient;
        $wc.DownloadFile($url, $out);
    }" 2>&1
    
    if not exist "python-installer.exe" (
        echo {"progress":0,"status":"","done":false,"error":"下载失败，请检查网络连接后重试"} > "%STATUS_FILE%"
        echo [ERROR] Download failed. Check your internet connection.
        pause
        exit /b
    )
    
    :: Install Python silently
    echo {"progress":60,"status":"正在安装 Python...","done":false} > "%STATUS_FILE%"
    start /wait python-installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    
    :: Clean up
    del python-installer.exe 2>nul
    
    :: Verify
    where python >nul 2>&1
    if %errorlevel% neq 0 (
        echo {"progress":0,"status":"","done":false,"error":"Python 安装失败，请手动安装后重试"} > "%STATUS_FILE%"
        echo [ERROR] Python installation failed.
        pause
        exit /b
    )
    
    echo {"progress":100,"status":"Python 安装成功！正在启动系统...","done":true,"redirect":"index.html"} > "%STATUS_FILE%"
    timeout /t 2 /nobreak >nul
    exit /b
)

:: Start server
echo [1/2] Starting server on http://localhost:5500 ...
echo.
echo   Server: http://localhost:5500/
echo   Close this window to stop the server.
echo.

:: Open browser after short delay
ping 127.0.0.1 -n 3 >nul
start "" http://localhost:5500/

:: Run server (foreground)
python -m http.server 5500

echo.
echo Server stopped.
pause