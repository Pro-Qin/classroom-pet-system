@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo  校园宠物乐园 - 一体机全屏模式
echo  （使用系统自带的 Edge / WebView2 显示，无需打包浏览器）
echo ============================================
echo.

where msedge >nul 2>nul
if errorlevel 1 (
    echo [提示] 未找到 Edge，将使用默认浏览器打开（按 F11 可全屏）。
    start "" http://localhost:3000
) else (
    start "" msedge --app=http://localhost:3000 --window-size=1366,900
)
exit /b 0
