# 校园宠物乐园 · 产品官网 + 宣传片（代码生成）

**一个文件，两种身份**：`promo/site.html` 正常打开就是**能用的产品官网**（九屏、真实按钮、自己滚自己点）；
加 `?render` / `?t=` 就是**片源**，由 `window.__seek(t)` 驱动，一颗小黄点代替鼠标指针去点真实按钮。

成片：**960×540 · 30 fps · 36.000 s · 带运动模糊**（4× 快门采样），画面与音乐全部由代码产生 ——
没有截图、没有录屏、没有外部素材、没有 AE。

```
promo/
├── site.html                  官网 + 片源（同一份，两种模式）
├── score.py                   配乐合成（numpy，无外部素材）
├── render.mjs                 CDP 逐帧 → JPEG（含 --shutter 运动模糊）
├── build.mjs                  一条命令：配乐 → 逐帧 → 编码 → 自检
├── shutter.mjs                快门取像计划（给渲染器/编码器共用）
├── build_icon.py              新版图标矢量化（量测 + marching squares）
├── icon_check.py              图标重建对照（IoU / 平均色差）
├── STORYBOARD.md              分镜、点击时刻表、音频结构、3D 与运动模糊做法
├── assets/icon.svg            重建的新版图标（628 字节）
├── assets/icon-compare.png    原图 / 重建 / 差异 三连对照
└── out/
    ├── pet-paradise-540p.mp4  成片（960×540 · 30fps · 36.000s）
    ├── sh/                    快门采样帧（1080 输出帧 × 4 采样）
    └── score.wav              母版音频
```

## 图标：这回用的是新版

上一版我用错了图标。事实核对：

| 文件 | 内容 | 日期 |
|---|---|---|
| `installer/app.ico` | 爪印（新版） | 2026-08-25 |
| `client/public/favicon.ico` | 爪印（新版） | 2026-08-27 |
| `website/assets/icon.png` | 爪印（新版） | 2026-09-25 |
| **`client/public/icon.svg`** | **猫脸（旧版，唯一残留）** | 2026-08-24 |

三个 ICO/PNG 的 256×256 帧 **md5 完全相同**，只有那个 SVG 还是旧猫脸 —— 它就是我上一版误用的那份。
现在 `client/public/icon.svg` 已按新版重建：

```bash
python promo/build_icon.py website/assets/icon.png client/public/icon.svg
python promo/icon_check.py        # 重绘对照：IoU 0.954，平均 RGB 差 2.66
```

重建方法（不依赖第三方追踪器）：从 PNG 量出竖向品牌渐变 `#6366F1 → #D946EF`、圆角半径 50/256、
三个趾环的圆心与内外半径（外 ≈24.5 / 内 ≈7.7，描边 ≈16.6），掌垫用 **marching squares** 提轮廓
（逐格查表 → 线段接链成闭环）再做 Douglas-Peucker 简化 + 闭合 Catmull-Rom 转贝塞尔。

## 渲染

```bash
# 草稿（无快门）：约 6 分钟
node render.mjs --frames --film site.html --w 960 --h 540 --workers 4 --out out/frames --dur 36

# 成片（4× 快门 = 180° 运动模糊）：约 35–40 分钟
node render.mjs --frames --film site.html --w 960 --h 540 --workers 4 --out out/sh --dur 36 --shutter 4

# 抽帧审阅
node render.mjs --stills --film site.html --times 6,11,15,19,23,27,31 --w 1920 --h 1080 --out stills

# 编码（快门模式必须走 tmix 平均）
ffmpeg -framerate 120 -i out/sh/s%06d.jpg -i out/score.wav \
  -vf "tmix=frames=4,fps=30,scale=in_range=full:out_range=tv,format=yuv420p" \
  -c:v libopenh264 -b:v 20M -maxrate 24M -bufsize 24M -g 60 \
  -color_range tv -colorspace bt709 -c:a aac_mf -b:a 256k -ar 48000 -t 36 \
  -shortest -movflags +faststart out/pet-paradise-540p.mp4
```

## 运动模糊是怎么准备的

1. `site.html` 暴露 `window.__motion(t0, t1)` —— 两个时刻之间**画面上最大位移（像素）**（滚动 + 光标 + 已知高速元素）。
2. `render.mjs --shutter N`：每输出帧在 `[t-1/30, t]` 里等距采 N 个时刻逐张出图，命名 `s%06d.jpg`。
   **位移 < 2 px 的帧只截一张、其余 N-1 张直接复制**（`fs.copyFileSync`），静态段几乎不花钱。
3. 编码时 `tmix=frames=N` 把连续 N 张平均掉，再 `fps=30` 每 N 张取一张 —— 等价 180° 快门。

> ⚠️ **性能教训（实测差 8 倍）**：一开始给每张 3D 卡加了 `filter:blur(40px)` 的背光和 `blur(12px)` 的投影，
> 结果每帧要重新做 7×2 次大半径模糊，合成开销让渲染慢到 **5.6 s/帧**；换成纯径向渐变后降到 **0.67 s/帧**。
> 逐帧渲染的页面上不要用大面积 `filter:blur()`。

> ⚠️ **采样数决定"拖影"还是"双影"**：交付版用 2× 快门（31 分钟），过渡帧上是**双影**；
> 4× 快门（49 分钟）才是连续拖影。试过用 `minterpolate=blend` 在编码端补帧再平均 —— 没用，
> blend 插出来的仍是同一时刻的两幅图，结果还是双影。多采样只能在渲染端多取几个 `t`。

## 3D

每张产品卡：`perspective(1400px)` + 基底倾角 ±6°/11°，**随光标位置实时偏转**（鼠标往哪边，卡往哪边转，
角度夹在 ±13°/±18° 内），卡面下方一层 `translateZ(-60px)` 背光、`translateZ(-40px)` 投影，
内容层 `translateZ(56px)` 浮在卡面之上。好处是文字仍然矢量化，4K 下不糊。

## 交付自检

| 项目 | 要求 | 实测 |
|---|---|---|
| 帧数 / 时长 | 1080 帧 = 36.000 s @30fps | 见文末实测表 |
| 像素格式 | 不能是 yuvj420p（会被播放器误读成发白） | `yuv420p` / `color_range=tv` |
| 集成响度 | 约 −14 LUFS | −14.0 LUFS |
| 真峰 | ≤ −1.0 dBTP | −2.6 dBTP |
| 近黑帧 | 场景切换不能掉黑场 | 0 帧 < 6/255 |

两条硬规矩（都是被坑出来的）：

- **`__seek` 必须返回 `true`**，渲染器拿到字符串就立刻抛错终止 —— 残帧绝不能被静默收下。
  （上一版正是这里出问题：一个 `querySelector` 返回 null 抛异常被 try/catch 吞掉，**前 4.2 秒每一帧都只画了一半**。）
- **逐帧渲染完做客观自检**：把成片缩到 96×54 求每帧平均亮度，找 <6/255 的近黑帧，能抓出切点黑闪、场景没上屏这类肉眼容易漏掉的问题。
