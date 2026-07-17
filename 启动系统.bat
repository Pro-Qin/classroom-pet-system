@echo off
chcp 65001 >nul
title 课堂电子宠物系统

echo ====================================
echo    课堂电子宠物系统 启动器
echo ====================================
echo.

:: 获取当前目录
set "CURRENT_DIR=%~dp0"

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [!] 未检测到 Python，尝试直接打开 index.html...
    start "" "%CURRENT_DIR%index.html"
    goto :end
)

:: 启动 HTTP 服务器（当前窗口，不另开终端）
echo [1/2] 启动本地服务器（端口 5500）...
echo.
echo    服务器地址: http://localhost:5500/
echo    关闭此窗口即可停止服务器
echo.

:: 启动浏览器（自动打开）
start "" http://localhost:5500/

:: 在前台运行服务器（-m http.server 的简单方式）
python -m http.server 5500 --directory "%CURRENT_DIR%"

:end
echo.
echo 按任意键退出...
pause >nul
