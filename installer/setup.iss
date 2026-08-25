; ============================================================
;  Campus Pet Paradise - Windows Installer (Inno Setup)
;  Build:  ISCC.exe setup.iss  (from installer/ directory)
;  Requires: start.exe already compiled (see scripts/launcher)
; ============================================================

#ifndef AppVersion
  #define AppVersion "0.2.0"
#endif
#ifndef AppPublisher
  #define AppPublisher "Qin_zzq"
#endif

#define AppName "校园宠物乐园"
#define AppNameEn "CampusPetParadise"
#define AppExe "start.exe"
#define AppBat "start.bat"

[Setup]
AppId={{8F6B39D0-3C2E-4A19-9B6E-C0A9F2D7E4B1}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
; Install to a per-user writable folder so the server can write server/data
; (pet.db, uploads, config.json, backups) without admin / UAC.
DefaultDirName={localappdata}\{#AppNameEn}
DisableProgramGroupPage=yes
; Show the welcome/intro page and the "choose install location" page.
DisableWelcomePage=no
DisableDirPage=no
; Do NOT request admin: the app writes to its own data dir under LocalAppData.
PrivilegesRequired=lowest
UsePreviousAppDir=yes
OutputDir=..\release-installer
OutputBaseFilename=ClassroomPetSystem-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
SetupIconFile=app.ico
UninstallDisplayIcon={app}\{#AppExe}
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "languages\ChineseSimplified.isl"

; ============================================================
;  ★ 文案配置区 ★  —— 想改安装向导的任何文字，直接改下面引号里的内容即可。
;  改完重新打包生效。每行 "键=文字"，等号右边就是要显示的文字。
;  占位符：%n=换行，[name]=软件名，[name/ver]=名称 版本，[mb]=磁盘大小。
; ============================================================
[Messages]
; --- 欢迎/介绍页（第一个页面）---
WelcomeLabel1=欢迎使用 校园宠物乐园 安装向导
WelcomeLabel2=即将在您的计算机上安装 [name/ver]。%n%n建议先关闭其他程序，点击“下一步”继续。
; --- “选择安装位置”页 ---
WizardSelectDir=选择目标位置
SelectDirDesc=您想将 [name] 安装在哪里？
SelectDirBrowseLabel=点击“下一步”继续。想换文件夹点“浏览”。
DiskSpaceMBLabel=至少需要 [mb] MB 可用磁盘空间。
; --- “选择附加任务”页 ---
WizardSelectTasks=选择附加任务
SelectTasksDesc=您想让安装程序执行哪些附加任务？
; --- 准备就绪页 ---
ReadyLabel1=准备就绪，现在可以开始安装 [name]。
ReadyLabel2a=点击“安装”继续。想再改改就点“上一步”。
; --- 安装完成页 ---
FinishedHeadingLabel=完成 [name] 安装向导
FinishedLabel=[name] 已安装到您的电脑，可通过桌面/开始菜单快捷方式启动。
FinishedRestartLabel=安装需重启电脑，现在就重启吗？
InstallingLabel=正在安装 [name]，请稍候。
; --- 中途点“取消/X”时弹出的退出提醒窗口 ---
ExitSetupTitle=退出安装程序
ExitSetupMessage=安装还没完成哦～现在退出的话，[name] 就不会装上了。%n%n之后想装可以再运行一次这个安装包。%n%n确定现在退出吗？
; --- 窗口标题 / 顶部 ---
SetupAppTitle=校园宠物乐园 安装
SetupWindowTitle=%1 - 安装向导

; ------------------------------------------------------------
; Files shipped: client/dist + server/dist + launchers + package
; metadata.  node_modules and server/data are deliberately NOT
; listed, so an upgrade over an existing install preserves them
; (incremental update, no re-download of dependencies, user data
; is never wiped).
; ------------------------------------------------------------
[Files]
; Server build output (preserve directory structure)
Source: "..\server\dist\*"; DestDir: "{app}\server\dist"; Flags: recursesubdirs ignoreversion
; Client build output
Source: "..\client\dist\*"; DestDir: "{app}\client\dist"; Flags: recursesubdirs ignoreversion
; Launchers & metadata
Source: "..\scripts\launcher\start.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\kiosk.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\deploy.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\deploy.sh"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package-lock.json"; DestDir: "{app}"; Flags: ignoreversion
; Workspace package.json are REQUIRED so `npm install` (launcher first-run)
; can resolve workspace dependencies (express/vue...). Without them npm only
; installs the 26 root devDependencies -> ERR_MODULE_NOT_FOUND express.
Source: "..\server\package.json"; DestDir: "{app}\server"; Flags: ignoreversion
Source: "..\client\package.json"; DestDir: "{app}\client"; Flags: ignoreversion
; Icon file so desktop / start-menu shortcuts have a real icon.
Source: "..\installer\app.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion

; Make the runtime data directory writable (created lazily; kept empty here).
[Dirs]
Name: "{app}\server\data"; Permissions: users-modify

; ------------------------------------------------------------
; Typed constants for the entry-point choice
; ------------------------------------------------------------
[Code]
var
  EntryPage: TInputOptionWizardPage;
  EntryChoice_Exe: Integer;

{ Return which entry type was selected (0 = start.exe, 1 = start.bat) }
function GetEntryChoice(): Integer;
begin
  if EntryPage <> nil then
    Result := EntryPage.SelectedValueIndex
  else
    Result := EntryChoice_Exe; { default to start.exe }
end;

{ Check used by [Icons]: only the chosen entry gets a desktop shortcut. }
function UseExeEntry(): Boolean;
begin
  Result := (GetEntryChoice() = 0);
end;

function UseBatEntry(): Boolean;
begin
  Result := (GetEntryChoice() = 1);
end;

procedure InitializeWizard();
begin
  EntryPage := CreateInputOptionPage(
    wpSelectTasks,
    '启动方式二选一',
    '桌面/开始菜单的快捷方式点开哪个入口？',
    'start.exe：一键启动服务并自动打开浏览器，最省心（推荐）。' + #13#10 +
    'start.bat：命令行启动，适合喜欢看日志的你（纯英文提示）。',
    True, False);
  EntryPage.Add('start.exe（推荐，一条龙：启动+打开浏览器）');
  EntryPage.Add('start.bat（命令行启动，日志看得更清楚）');
  EntryPage.SelectedValueIndex := 0; { default selected = start.exe }
  EntryChoice_Exe := 0;
end;

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "附加任务:"; Flags: unchecked

[Icons]
; Desktop shortcut -> whichever entry the user chose.  Only one fires.
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon; Check: UseExeEntry; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppBat}"; Tasks: desktopicon; Check: UseBatEntry; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
; Start-menu shortcut -> the app name (default), always created.
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; WorkingDir: "{app}"; IconFilename: "{app}\app.ico"
Name: "{group}\卸载 {#AppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#AppExe}"; Description: "立即启动 {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Only remove what we ship.  Deliberately NOT removing server\data or
; node_modules so a reinstall/upgrade is incremental and never loses data.
Type: filesandordirs; Name: "{app}\server\dist"
Type: filesandordirs; Name: "{app}\client\dist"
