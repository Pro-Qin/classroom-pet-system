@echo off
rem ============================================================
rem  Campus Pet Paradise - kiosk / fullscreen mode
rem  Uses built-in Microsoft Edge (WebView2), no bundled browser.
rem  ASCII-only to avoid cmd.exe encoding issues.
rem ============================================================
cd /d "%~dp0"

echo ============================================
echo   Campus Pet Paradise - Fullscreen Kiosk
echo   (uses built-in Edge / WebView2, no browser bundle)
echo ============================================
echo.

where msedge >nul 2>nul
if errorlevel 1 (
    echo [INFO] Edge not found, opening in default browser (press F11 for fullscreen).
    start "" http://localhost:3000
) else (
    start "" msedge --app=http://localhost:3000 --window-size=1366,900
)
exit /b 0
