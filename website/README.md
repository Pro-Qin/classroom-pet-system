# 校园宠物乐园 · 官网

产品落地页 + Supabase 配置教程，纯静态（HTML + CSS + 原生 JS），无构建步骤、无 CDN 依赖。整目录拷到任何静态托管即可上线。

    website/
    ├── index.html      落地页
    ├── supabase.html   云端同步配置教程
    ├── styles.css      设计 token、布局、动效（两个页面共用）
    ├── main.js         导航滚动态 + 内容入场
    ├── DESIGN.md       设计系统参考（Linear）
    └── assets/         产品截图与新版权标

## 本地预览

    npx serve website

或者直接双击 `index.html`。用 http 打开更接近线上表现（相对路径和 favicon 都正常）。

## 设计系统

画布沿用产品本体的靛蓝夜色（`#080b1e` → `#0e1330`），强调色取产品主色 `#6366f1` / `#a78bfa`，积分用金色 `#fbbf24`，宠物状态用绿 / 琥珀 / 玫红三档。

结构层的做法参考 Linear 的深色原生体系（见 [DESIGN.md](DESIGN.md)）：靠表面亮度分层而不是堆阴影，描边一律半透明白，全站只有一个彩色色系，展示级标题用负字间距收紧。

规则：

- 间距走 8px 基数（`--sp-*`），不在组件里写零散像素值
- 圆角遵循「外层 = 内层 + 间距」，卡片 20px、按钮 12px、截图框 18px
- 动效只用在入场与状态反馈上，时长 150–550ms，缓动统一 `cubic-bezier(.23,1,.32,1)`
- 正文对比度 ≥ 4.5:1，全部交互元素有 `:focus-visible` 环，`prefers-reduced-motion` 下动画归零
- 正文段落统一开 `text-wrap: pretty`，避免中文长句末行只剩一两个字

## 内容维护

- 版本号出现在四处：落地页 hero 的 eyebrow、部署卡片里的安装包文件名、两个页面的页脚。发版时一起改
- 图标 `assets/icon.png` 从 `installer/app.ico` 的 256×256 帧导出。换图标时重新导出，别手绘
- 截图放在 `assets/`，全部来自真实运行的产品。更新截图后记得同步 `width` / `height` 属性，避免布局抖动
- 下载链接指向 `https://github.com/Pro-Qin/classroom-pet-system/releases`，不需要随版本改动
- 教程页的建表脚本链接指向仓库 `main` 分支的 `supabase/schema.sql`，脚本更新后无需改页面

## 发布

线上地址：**https://pro-qin.github.io/classroom-pet-system/**

`gh-pages` 分支保存的是 `website/` 目录的内容，由 `git subtree push --prefix website origin gh-pages` 生成。改完官网后：

    git add website && git commit -m "docs(site): ..."
    git push origin main
    git subtree push --prefix website origin gh-pages

Pages 设置：仓库 Settings → Pages → Source 选 `Deploy from a branch`，分支 `gh-pages`，目录 `/(root)`。

也可以只把 `website/` 目录推到任意静态托管（Cloudflare Pages、Netlify、校内 Nginx）。
