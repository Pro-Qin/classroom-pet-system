// ============================================================================
//  render.mjs — 用 headless Edge + CDP 把 film.html 逐帧画成图片
//  低分辨率草稿：node render.mjs --frames --w 960 --h 540 --workers 4
//  4K 主版本：   node render.mjs --frames --w 3840 --h 2160 --workers 3
//  抽帧审阅：    node render.mjs --stills --times 0.5,2.4,4.4 --out stills
// ============================================================================
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FILM = pathToFileURL(path.join(__dirname, arg('film', 'film.html'))).href;

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return (v === undefined || v.startsWith('--')) ? true : v;
}

const W = parseInt(arg('w', 960), 10);
const H = parseInt(arg('h', 540), 10);
const WORKERS = parseInt(arg('workers', 4), 10);
const OUT = path.resolve(__dirname, String(arg('out', 'out/frames')));
const MODE = arg('stills', false) ? 'stills' : 'frames';
const TIMES = String(arg('times', '0.5,2.4,4.4,6.2,9.9,12.7,16.0,20.4,24.6,28.4,33.6')).split(',').map(Number);
const FPS = parseFloat(arg('fps', 30));   // 30 = 草稿；60 = 交付（1080p60）
const DUR = parseFloat(arg('dur', 36));       // 片长（秒）—— 必须与 site.html 的 __meta.duration 一致
const TOTAL = Math.round(DUR * FPS);          // 36s → 1080 帧 @30 / 2160 帧 @60
const FROM = parseInt(arg('from', 0), 10);
const TO = parseInt(arg('to', TOTAL - 1), 10);
const QUALITY = parseInt(arg('q', 92), 10);
const SHUTTER = parseInt(arg('shutter', 1), 10);   // >1 = 快门多采样（运动模糊）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CDP 小客户端
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString()); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
  }
  static async connect(url, timeoutMs = 20000) {
    const t0 = Date.now();
    for (;;) {
      try {
        const ws = new WebSocket(url);
        await new Promise((res, rej) => {
          ws.addEventListener('open', res, { once: true });
          ws.addEventListener('error', rej, { once: true });
        });
        return new CDP(ws);
      } catch (e) {
        if (Date.now() - t0 > timeoutMs) throw e;
        await sleep(200);
      }
    }
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('timeout ' + method)); }
      }, 120000);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

// ---------------------------------------------------------------- 一个渲染工人
class Worker {
  constructor(idx, port) {
    this.idx = idx;
    this.port = port;
    this.profile = path.join(os.tmpdir(), 'petfilm-' + port);
  }
  async start() {
    fs.rmSync(this.profile, { recursive: true, force: true });
    this.proc = spawn(EDGE, [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--allow-file-access-from-files',
      '--disable-features=Translate,MediaRouter',
      '--force-device-scale-factor=1',
      '--window-size=' + W + ',' + H,
      '--user-data-dir=' + this.profile,
      '--remote-debugging-port=' + this.port,
      'about:blank',
    ], { stdio: 'ignore', windowsHide: true });

    const base = 'http://127.0.0.1:' + this.port;
    let list = null;
    for (let i = 0; i < 120; i++) {
      try {
        const r = await fetch(base + '/json/list');
        list = await r.json();
        if (list && list.length) break;
      } catch {}
      await sleep(150);
    }
    if (!list || !list.length) throw new Error('worker ' + this.idx + ': edge 没起来');
    const page = list.find((t) => t.type === 'page') || list[0];
    this.cdp = await CDP.connect(page.webSocketDebuggerUrl);
    await this.cdp.send('Page.enable');
    await this.cdp.send('Runtime.enable');
    await this.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: W, height: H, deviceScaleFactor: 1, mobile: false,
    });
    await this.cdp.send('Page.navigate', { url: FILM + '?render' });
    // 等 __seek 就绪
    for (let i = 0; i < 200; i++) {
      const r = await this.cdp.send('Runtime.evaluate', {
        expression: 'typeof window.__seek === "function" && typeof window.__meta !== "undefined"',
        returnByValue: true,
      });
      if (r.result && r.result.value === true) return;
      await sleep(80);
    }
    throw new Error('worker ' + this.idx + ': film.html 没就绪');
  }
  async shot(t, file, fmt) {
    // 一次往返同时做 seek + 等两帧合成：__seek 返回 true 才算这一帧成立
    const r0 = await this.cdp.send('Runtime.evaluate', {
      expression: '(function(){var r=window.__seek(' + t.toFixed(4) + ');if(r!==true)return r;' +
        'return new Promise(function(res){requestAnimationFrame(function(){requestAnimationFrame(function(){res(true);});});});})()',
      awaitPromise: true, returnByValue: true,
    });
    if (r0.result && r0.result.value !== true) {
      const err = String(r0.result.value).split('\n').slice(0, 3).join(' | ');
      throw new Error('frame t=' + t.toFixed(2) + ' 渲染失败：' + err);
    }
    const p = { format: fmt === 'png' ? 'png' : 'jpeg', captureBeyondViewport: false };
    if (p.format === 'jpeg') p.quality = QUALITY;
    const res = await this.cdp.send('Page.captureScreenshot', p);
    fs.writeFileSync(file, Buffer.from(res.data, 'base64'));
  }
  async probeMotion(t) {
    const r = await this.cdp.send('Runtime.evaluate', {
      expression: '(function(){window.__seek(' + t.toFixed(4) + ');return (window.__motion?window.__motion(' +
        (t - 1 / 60).toFixed(4) + ',' + (t + 1 / 60).toFixed(4) + '):9999)||0;})()',
      returnByValue: true,
    });
    return (r && r.result && typeof r.result.value === 'number') ? r.result.value : 9999;
  }
  stop() {
    if (this.cdp) this.cdp.close();
    if (this.proc) { try { this.proc.kill(); } catch {} }
    setTimeout(() => { try { fs.rmSync(this.profile, { recursive: true, force: true }); } catch {} }, 800);
  }
}

// ---------------------------------------------------------------- 主线
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();

  if (MODE === 'stills') {
    const w = new Worker(0, 9311);
    await w.start();
    for (const t of TIMES) {
      const f = path.join(OUT, 't' + t.toFixed(2).replace('.', '_') + '.png');
      await w.shot(t, f, 'png');
      console.log('  ✓ ' + t.toFixed(2) + 's → ' + path.basename(f));
    }
    w.stop();
    console.log('抽帧完成 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    return;
  }

  // 帧序列：按 worker 分块（轮转，负载均衡）
  const jobs = [];
  for (let f = FROM; f <= TO; f++) jobs.push(f);
  const chunks = Array.from({ length: WORKERS }, () => []);
  jobs.forEach((f, i) => chunks[i % WORKERS].push(f));

  let done = 0;
  const total = jobs.length;
  await Promise.all(chunks.map(async (chunk, idx) => {
    const w = new Worker(idx, 9311 + idx);
    await w.start();
    for (const f of chunk) {
      const t = f / FPS;
      if (SHUTTER > 1) {
        // 快门模式：一输出帧 = N 张子采样，命名 s000000.. ，编码时用 tmix 平均
        const files = [];
        for (let i = 0; i < SHUTTER; i++) {
          files.push(path.join(OUT, 's' + String(f * SHUTTER + i).padStart(6, '0') + '.jpg'));
        }
        if (files.every((x) => fs.existsSync(x) && fs.statSync(x).size > 2000)) { done++; continue; }
        // 动静判断：位移小于 2px 的帧不需要多采样，直接复制，省 3/4 截图
        let mov = 999;
        try { mov = await w.probeMotion(t); } catch (e) { /* 没有 __motion 就整帧多采样 */ }
        if (mov < 2) {
          await w.shot(t, files[0], 'jpg');
          for (let i = 1; i < SHUTTER; i++) fs.copyFileSync(files[0], files[i]);
        } else {
          // 180° 快门：曝光窗口 1/(2*FPS)，N 个采样均布在窗口里（首尾各占一端）
          const W_ = 1 / (2 * FPS);
          for (let i = 0; i < SHUTTER; i++) {
            const off = SHUTTER > 1 ? (i / (SHUTTER - 1) - 0.5) * W_ : 0;
            await w.shot(t + off, files[i], 'jpg');
          }
        }
      } else {
        const file = path.join(OUT, 'f' + String(f).padStart(6, '0') + '.jpg');
        if (fs.existsSync(file) && fs.statSync(file).size > 2000) { done++; continue; }
        await w.shot(t, file, 'jpg');
      }
      done++;
      if (done % 30 === 0) {
        const el = (Date.now() - t0) / 1000;
        const eta = el / done * (total - done);
        process.stdout.write('\r  ' + done + '/' + total + ' 帧  ' + el.toFixed(0) + 's  预计还要 ' + eta.toFixed(0) + 's   ');
      }
    }
    w.stop();
  }));
  process.stdout.write('\n');
  console.log('渲染 ' + total + ' 帧 @ ' + W + '×' + H + ' 用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
}

main().catch((e) => { console.error('失败：', e.message); process.exit(1); });
