@echo off
rem ============================================================
rem  Campus Pet Paradise - one-click deploy (Windows)
rem  Requires Git already installed. ASCII-only messages.
rem  Usage: double-click, or run deploy.bat from cmd.
rem ============================================================
setlocal
cd /d %~dp0

echo [1/4] Checking Git...

git --version >nul 2>&1
if errorlevel 1 (
  echo Git not found. Install from https://git-scm.com/download/win
  pause >nul
  exit /b 1
)

echo [2/4] Installing dependencies (China mirror)...
call npm install --registry=https://registry.npmmirror.com --no-audit --no-fund
if errorlevel 1 (
  echo Dependency install failed. Check Node.js is installed and >= 22.
  pause >nul
  exit /b 1
)

echo [3/4] Building frontend + backend...
call npm run build
if errorlevel 1 (
  echo Build failed. See the output above.
  pause >nul
  exit /b 1
)

echo [4/4] Starting server...
echo When ready, open http://localhost:3000
npm start
endlocal
