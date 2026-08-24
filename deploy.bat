@echo off
rem ============================================================
rem 校园宠物乐园 · 官方一键部署脚本（Windows）
rem 适合：已安装 Git 的 Windows 一体机 / 教师机
rem 用法：双击运行，或 cmd 执行 deploy.bat
rem ============================================================
setlocal
cd /d %~dp0

echo [1/4] 检查 Git...
git --version >nul 2>&1
if errorlevel 1 (
  echo 缺少 Git，请先安装：https://git-scm.com/download/win
  pause
  exit /b 1
)

echo [2/4] 安装依赖...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo 依赖安装失败，请检查 Node.js 是否已安装且版本 >= 22
  pause
  exit /b 1
)

echo [3/4] 构建前端 + 后端...
call npm run build
if errorlevel 1 (
  echo 构建失败，请查看上方错误信息
  pause
  exit /b 1
)

echo [4/4] 启动服务器...
echo 启动成功后请访问 http://localhost:3000
npm start
endlocal
