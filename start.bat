@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 校园宠物乐园 - 启动器

echo ============================================
echo    校园宠物乐园 启动器
echo    （积分 + 宠物养成 班级激励系统）
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js。
    echo        请先安装 Node.js 18 或更高版本：https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist "server\dist\index.js" (
    echo [首次运行] 未找到构建产物，正在安装依赖并构建（需联网，约 1-3 分钟）...
    echo.
    call npm install --no-audit --no-fund
    if errorlevel 1 goto :fail
    call npm run build
    if errorlevel 1 goto :fail
    echo.
)

echo [启动] 服务地址：http://localhost:3000
echo        本机其他设备（同一局域网）访问：http://本机IP:3000
echo        关闭本窗口即停止服务。
echo.
call npm start
goto :eof

:fail
echo.
echo [错误] 构建失败，请检查上方输出（可能需要代理访问 npm 源）。
echo.
pause
