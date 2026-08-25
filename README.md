# 校园宠物乐园 🐾

集**积分管理**与**宠物养成**于一体的班级激励系统（Web 网页版），为学校一体机/教师机场景设计。

- 学生系统 · 教师系统 · 管理系统（三合一登录）
- 积分：单点/快捷/批量加减分（带理由），快捷理由可自定义
- 宠物：12 种可选、自定义名字、自定义图片（自动裁剪为圆形）
- 宠物状态（睡觉/疲惫/生气/伤心/开心等）随属性自动变化
- 商店 + 道具互动（喂食/玩耍/清洁/医疗/经验）→ 属性 → 状态联动
- 排行榜（领奖台）与**大屏轮播模式**（/screen）
- 两路数据同步（本机 ↔ Supabase 云端），冲突由用户裁决，**绝不丢数据**
- 启动时自动检查 Gitee 版本更新（可配置更新源，离线自动降级不阻塞）

> 明确不做：每日登录奖励、任务系统（积分只由教师/管理端加减，学生仅消费购买）。

---

## 技术栈

| 端 | 技术 |
|----|------|
| 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS + Lucide 图标（无 emoji 装饰） |
| 后端 | Node.js + Express + **node:sqlite**（Node 22.5+ 内建，零原生编译） |
| 密码 | bcrypt 哈希存储（管理员密码绝不明文；教师口令固定 123456 不可改） |
| 同步 | 快照备份 → 增量拉取（冲突检测）→ 增量推送 → 墓碑软删除 |

---

## 快速开始（开发）

```bash
# 需要 Node.js >= 22（node:sqlite 内建）
npm install
npm run dev
# 前端 http://localhost:5173  →  后端 http://localhost:3000
```

首次运行会进入**欢迎向导**：配置 Supabase（可跳过，本地模式）→ 设置管理员密码。
之后每次启动进入**准备界面**：检查更新 + 同步数据库（有冲突时选择保留本机/云端）。

## 一体机一键启动（安装版 / 免安装）

### 方式一：Windows 安装器（推荐，学生/教师机）

在 [Releases](../../releases) 下载 `ClassroomPetSystem-Setup-<版本>.exe`，双击安装：

- 安装后保持原有目录结构（`server` + `client` + 启动器 + `package.json`）
- 安装向导可**选择程序入口**（默认 **start.exe**，也可选 start.bat）：
  - `start.exe`：检测 Node → 首次用国内镜像安装依赖 → 构建（如需）→ 启动服务 → 自动打开浏览器
  - `start.bat`：命令行走同一流程（纯英文提示，避免编码乱码）
- 桌面快捷方式指向你选择的入口：`start.exe` 或 `start.bat`
- 安装到用户本地目录（`%LOCALAPPDATA%\CampusPetParadise`），无需管理员权限
- **增量更新**：升级安装器不会删除已有的 `node_modules` 和 `server/data`（学生/宠物数据、云端密钥等均保留），依赖无需重新下载

### 方式二：免安装（拷贝即用）

1. 在开发机执行 `npm run build`（产物在 `client/dist` + `server/dist`）
2. 整个项目目录拷贝到一体机（无需 node_modules 之外的东西，已含构建产物）
3. 双击 **`start.bat`** 或 **`start.exe`** → 浏览器访问 `http://localhost:3000`
4. 同局域网其他设备访问 `http://一体机IP:3000`

> 学校网络可能封锁外网：构建产物完全本地化（无 CDN 依赖），启动器仅在缺少依赖/构建产物时才联网（使用国内 npm 镜像）。

## 生产模式

```bash
npm run build     # 构建前端 + 后端
npm start         # Node 托管前端产物 + API（localhost:3000）
```

## Supabase 云端同步（多设备共享数据）

1. 在 supabase.com 创建项目
2. SQL Editor 中执行 [`supabase/schema.sql`](supabase/schema.sql)（云端表与本地一致）
3. 欢迎向导或管理端「同步」页填入：Project URL / anon key / **service role key**
   - 写入必须 service_role key（仅保存在本机 `server/data/config.json`，绝不明文入库）
4. 准备界面自动执行：**快照备份 → 拉取 → 推送**；冲突时弹窗展示双方最后更新时间供选择

### 数据安全（P0）

- 每次同步前自动生成本地快照：`server/data/backups/snapshot-*.db`
- 所有删除均为**软删除**（墓碑），可跨端传播，绝不硬删
- 冲突未裁决时**不推进同步游标**，任何一方数据都不会被静默覆盖
- 本地库：`server/data/pet.db`（拷贝即备份）

### 安全加固

- 管理员密码 bcrypt 哈希（另设常驻防忘记口令 `114514`，无论是否修改过密码始终可登录）；token 签名密钥为首次启动生成的 crypto 随机种子（无硬编码回退）
- 系统初始化后 `/api/auth/setup` 需管理员 token；登录失败限流（每 IP 每分钟 10 次）
- Supabase 配置仅管理员可改，且仅接受 `https://*.supabase.co` 域名（防 SSRF/密钥外泄）
- 同步行按表 schema 白名单校验列名（防注入）；头像上传限制图片 MIME + 5MB + 扩展名白名单
- `server/data/config.json`（含密钥）已 gitignore 并收紧文件权限

## 目录结构

```
├── server/                 # Node + Express 后端
│   ├── src/db/             # schema/迁移/种子（幂等）
│   ├── src/sync/           # 两路同步引擎（mock/supabase 双传输）
│   ├── src/routes/         # auth/students/teacher/admin/sync
│   ├── src/services/       # 宠物/积分/更新多源探测
│   └── tests/              # vitest（数据层 + 同步引擎，含冲突/墓碑/快照）
├── client/                 # Vue3 前端
│   └── src/views/          # 欢迎向导/准备/登录/学生/教师/管理/大屏
├── supabase/schema.sql     # 云端建表脚本
├── scripts/smoke.mjs       # 端到端冒烟测试（14 项）
├── scripts/launcher/       # Go 源码，编译产出 start.exe（Windows 启动器）
├── installer/              # Inno Setup 安装器脚本 + 图标生成器
└── start.bat / start.exe   # 一体机一键启动（start.bat 纯英文）
```

## 测试

```bash
npm test          # 服务端 vitest（数据层 + 同步引擎）
node scripts/smoke.mjs   # 端到端冒烟（需服务已启动，14 项断言）
npm run typecheck # 前后端类型检查
```

## 版本

v0.2.0 — 接入真实 Gitee 更新源（准备界面自动检查 releases/latest，10 分钟缓存，离线安全降级）。

---

## v0.2.1+ 更新说明（打包与更新）

- **Windows 安装器**：GitHub Actions 用 Inno Setup 产出 `ClassroomPetSystem-Setup-<版本>.exe`；安装保持原目录结构，入口可选 **start.exe**（默认）/ start.bat，桌面快捷方式跟随选择
- **start.exe（Go）**：检测 Node → 国内镜像安装依赖 → 构建 → 启动服务 → 自动打开浏览器
- **start.bat / kiosk.bat 乱码修复**：改为纯英文（ASCII）提示，cmd 不再出现“不是内部或外部命令”的 GBK/UTF-8 乱码
- **增量更新**：升级安装器不删除 `node_modules` 与 `server/data`（数据、密钥、依赖均保留）
- **多源更新检查**：准备界面按 `GitHub 镜像 → Gitee → GitHub` 顺序探测新版本；发现新版本后可在界面“立即更新”，应用自行下载安装器并启动安装向导
- **集成**：`start.bat` 使用国内 npm 镜像（registry.npmmirror.com）

### v0.2.0+ 更新说明

- **等级经验要求可配置**：教师/管理端「宠物等级」页可修改 7 级起始经验（Lv.1 固定 0，需逐级递增）
- **未领养宠物**：学生系统显示白底黑字「?」头像（带周期性差色特效），可直接在页面选择种类领养
- **数据第一**：
  - 每次刷新页面自动拉取云端增量；每次增删改自动推送本地变更（fire-and-forget）
  - 同步前自动快照，本地备份按总字节上限保留（默认 1GB，管理端可调），至少保留最近 2 份
  - 同步冲突会在刷新时用 Toast 提醒，并在准备界面裁决
- **配置导入/导出**：管理系统「设置 → 配置导出/导入」可一键迁移 Supabase 连接、积分单位、管理员名称、备份上限、等级要求（密钥不入源码；导出文件含云端密钥，请妥善保管并已 gitignore）
- **更新检查策略**：可设置「仅此设备」或「整库所有设备」开机跳过更新检查
- **Gitee 更新源已锁定**：固定为 https://gitee.com/am-zzq/classroom-pet-system，管理端不可修改
- **顶栏/底栏毛玻璃渐变**：顶栏随滚动 0→20px 渐变模糊；底栏大按钮操作（适合一体机触屏）

## 一体机显示（不打包浏览器）

`kiosk.bat` 使用系统自带的 **Microsoft Edge（WebView2）** 以应用窗口模式打开 http://localhost:3000，
无需把 Chromium 打进安装包（Win10/11 自带 Edge）。也可在 Edge 菜单「安装站点为应用」获得桌面图标。

## GitHub 手动打包

仓库已配置 `.github/workflows/release.yml`：在 GitHub 仓库页 Actions → **Release（自动构建安装器并发布）** → Run workflow，
即可在 `windows-latest` 上编译 `start.exe`（Go）、构建 `client/dist` + `server/dist`、生成安装器图标，并用 **Inno Setup** 打出
`ClassroomPetSystem-Setup-<版本>.exe` 安装器并上传到该 tag 的 GitHub Release。

> 说明：
> - 产物为 **Windows 安装器（.exe）**，不再只是 `.zip` 源码包。
> - Gitee 公开 API 无法自动上传 release 二进制附件，因此安装器只在 GitHub Release 提供；应用更新会**优先经 GitHub 镜像**（ghfast.top 等）下载该 `.exe`，Gitee 用于版本号探测。
> - 若需 Gitee 附件，请到 Gitee 仓库 Releases 页面手动上传该 `.exe`。
