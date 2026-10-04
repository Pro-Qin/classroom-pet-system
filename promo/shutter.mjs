// ============================================================================
//  shutter.mjs — 运动模糊的取像计划：给每一输出帧算「快门内要采几张、采在哪几个时刻」
//
//    node shutter.mjs 36 30 4           # dur=36s fps=30 快门采样数=4
//
//  原理：把每帧的快门当成 [t-1/30, t]，在这段窗口里等距采 N 个时刻，渲染器逐张出图，
//  编码时用 ffmpeg 的 tmix=frames=N 把它们平均掉（等价于 180° 快门）。
//  本脚本把计划写成 JSON，render.mjs 与 build.mjs 共用。
// ============================================================================
import fs from 'node:fs';

const dur = parseFloat(process.argv[2] || '36');
const fps = parseInt(process.argv[3] || '30', 10);
const N = parseInt(process.argv[4] || '4', 10);
const total = Math.round(dur * fps);
const plan = [];
for (let k = 0; k < total; k++) {
  const t0 = (k + 1) / fps - 1 / fps;          // 快门开
  const times = [];
  for (let i = 0; i < N; i++) times.push(t0 + (i + 1) / (fps * N));
  plan.push({ k: k, times: times.map((x) => Math.round(x * 10000) / 10000) });
}
fs.writeFileSync(new URL('./out/shutter.json', import.meta.url), JSON.stringify({ dur, fps, samples: N, total, plan }));
console.log('快门计划：' + total + ' 输出帧 × ' + N + ' 采样 = ' + (total * N) + ' 张图 → out/shutter.json');
