@echo off
title 课堂宠物系统 - 启动器

cd /d "%~dp0"
set "STATUS_FILE=setup_status.json"
set "VERSION_FILE=version.json"
set "GITEE_BASE=https://gitee.com/am-zzq/classroom-pet-system"
set "LAST_CHECK=last_update_check.txt"

echo ====================================
echo   课堂宠物系统 - 一键启动
echo ====================================
echo.

:: ======== 步骤1：检查更新 ========
echo [1/4] 检查更新...
set "NEED_UPDATE=0"
powershell -Command "& {
    $checkFile = '%LAST_CHECK%';
    $checkNow = (Get-Date).ToString('yyyy-MM-dd');
    $lastCheck = '';
    if (Test-Path $checkFile) { $lastCheck = Get-Content $checkFile -Raw -ErrorAction SilentlyContinue; }
    $lastCheck = $lastCheck.Trim();
    if ($lastCheck -ne $checkNow) {
        try {
            $wc = New-Object System.Net.WebClient;
            $verJson = $wc.DownloadString('%GITEE_BASE%/raw/master/version.json');
            $remoteVer = ($verJson | ConvertFrom-Json).version;
            $localVer = '';
            if (Test-Path '%VERSION_FILE%') {
                $localJson = Get-Content '%VERSION_FILE%' -Raw -ErrorAction SilentlyContinue;
                if ($localJson) { $localVer = ($localJson | ConvertFrom-Json).version; }
            }
            if ($remoteVer -and $remoteVer -ne $localVer) {
                echo 'UPDATE_AVAILABLE';
                exit 0;
            }
            Set-Content $checkFile $checkNow -NoNewline;
        } catch { }
    }
    exit 1;
}" > "%TEMP%\update_check.tmp" 2>&1

set /p UPDATE_FLAG=<"%TEMP%\update_check.tmp"
if "%UPDATE_FLAG%"=="UPDATE_AVAILABLE" (
    echo   [更新] 发现新版本，正在下载更新...
    echo.
    :: Download update zip
    powershell -Command "& {
        $wc = New-Object System.Net.WebClient;
        $wc.DownloadFile('%GITEE_BASE%/repository/archive/master.zip', 'update.zip');
    }" 2>&1
    
    if exist update.zip (
        echo   解压中...
        powershell -Command "& {
            Add-Type -AssemblyName System.IO.Compression.FileSystem;
            $zip = [System.IO.Compression.ZipFile]::OpenRead('update.zip');
            $entry = $zip.Entries[0];
            $root = $entry.FullName.Split('/')[0];
            $zip.Dispose();
            [System.IO.Compression.ZipFile]::ExtractToDirectory('update.zip', 'update_tmp');
            $src = Join-Path 'update_tmp' $root;
            if (Test-Path $src) {
                Copy-Item -Path (Join-Path $src '*') -Destination '.' -Recurse -Force;
            }
            Remove-Item 'update.zip' -Force -ErrorAction SilentlyContinue;
            Remove-Item 'update_tmp' -Recurse -Force -ErrorAction SilentlyContinue;
        }" 2>&1
        echo   [OK] 更新完成！
        echo   当前日期: > "%LAST_CHECK%"
    ) else (
        echo   [跳过] 下载失败，继续使用当前版本
    )
) else (
    echo   [OK] 已是最新版本
)

echo.

:: ======== 步骤2：检查 Python ========
echo [2/4] 检查运行环境...
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo   [安装] 未检测到 Python，正在安装...
    echo   >>> 安装进度页面已打开，请稍候...
    echo.
    
    :: 写初始进度
    echo {"progress":5,"status":"正在准备 Python 环境...","done":false} > "%STATUS_FILE%"
    
    :: 启动临时服务器（如果还没启动）
    start /b python -m http.server 5500 >nul 2>&1
    ping 127.0.0.1 -n 2 >nul
    start "" http://localhost:5500/setup.html
    
    :: 从清华镜像下载 Python
    echo {"progress":20,"status":"下载 Python 3.12 (清华镜像)...","done":false} > "%STATUS_FILE%"
    powershell -Command "& {
        $wc = New-Object System.Net.WebClient;
        try {
            $wc.DownloadFile('https://mirrors.tuna.tsinghua.edu.cn/python/3.12.3/python-3.12.3-amd64.exe', 'python-installer.exe');
        } catch {
            # fallback to official
            $wc.DownloadFile('https://www.python.org/ftp/python/3.12.3/python-3.12.3-amd64.exe', 'python-installer.exe');
        }
    }" 2>&1
    
    if not exist python-installer.exe (
        echo {"progress":0,"status":"","done":false,"error":"Python 下载失败，请检查网络后重试"} > "%STATUS_FILE%"
        echo   [错误] 下载失败！
        echo   请手动安装 Python 后重试
        echo   或直接打开 index.html 使用（部分功能受限）
        pause
        exit /b
    )
    
    echo {"progress":65,"status":"正在安装 Python...","done":false} > "%STATUS_FILE%"
    start /wait python-installer.exe /quiet InstallAllUsers=0 PrependPath=1 Include_test=0
    
    del python-installer.exe 2>nul
    
    where python >nul 2>&1
    if %errorlevel% neq 0 (
        echo {"progress":0,"status":"","done":false,"error":"Python 安装失败，请手动安装后重试"} > "%STATUS_FILE%"
        echo   [错误] 安装失败！
        pause
        exit /b
    )
    
    echo {"progress":100,"status":"Python 安装成功！正在启动系统...","done":true,"redirect":"index.html"} > "%STATUS_FILE%"
    echo   [OK] Python 安装成功！
    timeout /t 2 /nobreak >nul
    echo.
    echo 请刷新浏览器页面以启动系统
    pause
    exit /b
) else (
    echo   [OK] Python 已就绪
)

echo.

:: ======== 步骤3：启动 ========
echo [3/4] 启动服务器...
echo.
echo   服务器地址: http://localhost:5500/
echo   关闭此窗口即可停止服务器
echo.

:: 打开浏览器
ping 127.0.0.1 -n 3 >nul
start "" http://localhost:5500/

:: 前台运行服务器
python -m http.server 5500

echo.
echo [4/4] 服务器已停止
pause