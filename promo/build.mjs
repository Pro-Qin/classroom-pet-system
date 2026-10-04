// ============================================================================
//  build.mjs — 一条命令走完全流程：配乐 → 逐帧 → 编码 → 自检
//
//    node build.mjs                 # 低分辨率草稿 960×540（快，约 8 分钟）
//    node build.mjs --final         # 4K 主版本 3840×2160（慢，约 15–25 分钟）
//    node build.mjs --final --w 1920 --h 1080
//
//  前提：headless Edge 已安装；ffmpeg 在 D:\ffmpeg\ffmpeg.exe（可用 FFMPEG 环境变量覆盖）
// ============================================================================
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY = process.env.PY || 'C:\\Users\\Qin_zzq\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';
const FF = process.env.FFMPEG || 'D:\\ffmpeg\\ffmpeg.exe';
const FP = process.env.FFPROBE || 'D:\\ffmpeg\\ffprobe.exe';

const final = process.argv.includes('--final');
const SHUTTER = parseInt(process.argv.find((a) => a.startsWith('--shutter='))?.slice(10) || '0', 10) || 0;
const W = final ? 3840 : 960;
const H = final ? 2160 : 540;
const SH = SHUTTER > 1 ? SHUTTER : 1;
const NAME = process.argv.find((a) => a.startsWith('--name='))?.slice(7) || (final ? 'pet-paradise-4k' : 'pet-paradise-540p');

function run(cmd, args, label) {
  process.stdout.write('→ ' + label + '\n');
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: __dirname });
  if (r.status !== 0) { console.error('失败：' + label); process.exit(1); }
}

fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });

// 1) 配乐
run(PY, [path.join(__dirname, 'score.py'), '-o', 'out/score.wav'], '合成配乐（numpy，无外部素材）');

// 2) 逐帧（site.html 既是官网也是片源；--shutter 打开运动模糊）
const frames = path.join(__dirname, 'out', final ? 'frames4k' : 'frames');
run(process.execPath, [path.join(__dirname, 'render.mjs'),
  '--frames', '--film', 'site.html', '--w', String(W), '--h', String(H),
  '--workers', final ? '3' : '4', '--out', frames, '--dur', '36',
  '--shutter', String(SH),
  '--out', frames, '--dur', '36'],
  'CDP 逐帧 ' + W + '×' + H + (SHUTTER > 1 ? '（' + SHUTTER + '× 快门）' : ''));
const src = SHUTTER > 1
  ? ['-framerate', String(30 * SHUTTER), '-i', path.join(frames, 's%06d.jpg'),
     '-vf', 'tmix=frames=' + SHUTTER + ',fps=30,scale=in_range=full:out_range=tv,format=yuv420p']
  : ['-framerate', '30', '-i', path.join(frames, 'f%06d.jpg'),
     '-vf', 'scale=in_range=full:out_range=tv,format=yuv420p'];

// 3) 编码
const out = path.join(__dirname, 'out', NAME + '.mp4');
run(FF, ['-y', '-hide_banner', '-loglevel', 'error']
  .concat(src)
  .concat(['-i', path.join(__dirname, 'out', 'score.wav'),
  '-c:v', 'libopenh264', '-b:v', final ? '90M' : '20M', '-maxrate', final ? '110M' : '24M',
  '-bufsize', final ? '110M' : '24M', '-g', '60',
  '-color_range', 'tv', '-colorspace', 'bt709',
  // 音频走 aac_mf：实测原生 aac 会把真峰抬 +3 dB（解码即削顶），aac_mf 只抬 +0.4 dB
  '-c:a', 'aac_mf', '-b:a', '256k', '-ar', '48000',
  '-t', '36', '-shortest', '-movflags', '+faststart', out]),
  '编码 H.264 + AAC');

// 4) 自检
console.log('\n—— 自检 ——');
const probe = spawnSync(FP, ['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,nb_frames,r_frame_rate,pix_fmt',
  '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1', out], { encoding: 'utf8' });
console.log(probe.stdout.trim());
const loud = spawnSync(FF, ['-hide_banner', '-i', out, '-af', 'loudnorm=print_format=summary', '-f', 'null', '-'],
  { encoding: 'utf8' });
console.log((loud.stderr.match(/Input Integrated:.*|Input True Peak:.*/g) || []).join('\n'));
console.log('成片：' + out + '  ' + (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
