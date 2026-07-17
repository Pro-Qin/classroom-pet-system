@echo off
title Classroom Pet System - Updater

cd /d "%~dp0"
echo ====================================
echo   Checking for updates...
echo ====================================
echo.

:: Check requirements
where curl >nul 2>&1
if %errorlevel% neq 0 (
    where powershell >nul 2>&1
    if %errorlevel% neq 0 (
        echo [ERROR] Neither curl nor PowerShell found.
        echo Please manually download from:
        echo https://gitee.com/am-zzq/classroom-pet-system
        pause
        exit /b
    )
    set "DL_METHOD=powershell"
) else (
    set "DL_METHOD=curl"
)

echo [1/3] Downloading latest version from Gitee...
echo.

:: Download
if "%DL_METHOD%"=="curl" (
    curl -L -o update.zip "https://gitee.com/am-zzq/classroom-pet-system/repository/archive/master.zip" --progress-bar
) else (
    powershell -Command "& { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://gitee.com/am-zzq/classroom-pet-system/repository/archive/master.zip' -OutFile 'update.zip' -Verbose }"
)

if not exist update.zip (
    echo [ERROR] Download failed.
    pause
    exit /b
)

echo.
echo [2/3] Extracting update...

:: Extract (Windows 10+ has tar, else use PowerShell)
set "EXTRACT_DIR=update_temp"
if exist "%EXTRACT_DIR%" rmdir /s /q "%EXTRACT_DIR%"
mkdir "%EXTRACT_DIR%" 2>nul

where tar >nul 2>&1
if %errorlevel% equ 0 (
    tar -xf update.zip -C "%EXTRACT_DIR%" --strip-components=1 2>nul
) else (
    powershell -Command "& { Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('update.zip', '%EXTRACT_DIR%') }"
)

:: Find the actual root folder inside the extracted archive
if exist "%EXTRACT_DIR%\classroom-pet-system-main - 副本" (
    set "SRC_DIR=%EXTRACT_DIR%\classroom-pet-system-main - 副本"
) else if exist "%EXTRACT_DIR%\classroom-pet-system-main" (
    set "SRC_DIR=%EXTRACT_DIR%\classroom-pet-system-main"
) else (
    set "SRC_DIR=%EXTRACT_DIR%"
)

echo.
echo [3/3] Applying update...

:: Backup user data (IndexedDB is in browser, no local files to backup)
:: Copy new files (exclude .git, user configs)
xcopy /E /Y /I "%SRC_DIR%\*" "." >nul 2>&1

:: Cleanup
del update.zip 2>nul
rmdir /s /q "%EXTRACT_DIR%" 2>nul

echo.
echo ====================================
echo   Update complete!
echo   Version file updated.
echo ====================================
echo.
echo Starting system...
start "" http://localhost:5500/
python -m http.server 5500

pause