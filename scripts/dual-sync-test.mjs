#!/usr/bin/env node
/**
 * 双端同步真机联调：同一台机器起两个真实服务实例（各自独立数据目录），
 * 共同连接【测试专用】Supabase，模拟一体机 ↔ 教师机两台设备。
 *
 * 用法：node scripts/dual-sync-test.mjs
 * 前置：server/dist 已构建（npm run build -w server）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const REPO = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const SERVER_ENTRY = path.join(REPO, 'server', 'dist', 'index.js');

// 测试专用云（生产绝不可用在这里）
const CLOUD_URL = process.env.LIVE_SUPA_URL ?? 'https://rieybeyquqzarezpffko.supabase.co';
const CLOUD_KEY = process.env.LIVE_SUPA_KEY ?? 'sb_publishable_hbDkDqM-fxD-2BRB29DDmw_eEhcRby5';

const PORT_A = 4301;
const PORT_B = 4302;
const results = [];
let tokenA = '';
let tokenB = '';

function record(name, pass, detail = '') {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? '  —— ' + detail : ''}`);
}

function base(port) {
  return `http://127.0.0.1:${port}/api`;
}

let VERBOSE = true;
async function call(port, method, p, body, token) {
  const res = await fetch(base(port) + p, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (VERBOSE && (p === '/sync/push' || p === '/sync/run' || p === '/sync/resolve')) {
    console.log(`    [sync] ${port} ${p} -> ${res.status} ${JSON.stringify(json).slice(0, 160)}`);
  }
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/**
 * 在指定端反复 run 直至条件满足（处理 429 节流重试与冲突裁决）。
 * conflicts 策略：一律保本机（local）——与前端默认一致。
 */
async function runUntil(port, token, condFn, tries = 6, label = '', conflictChoice = 'local') {
  let last = null;
  for (let i = 0; i < tries; i++) {
    const r = await call(port, 'POST', '/sync/run');
    last = r;
    if (r.status === 429) {
      const sec = Number(r.json.retryAfterSec) || 3;
      if (label) console.log(`    [retry] ${label} 被节流 ${sec}s`);
      await sleep((sec + 0.4) * 1000);
      continue;
    }
    if (r.status >= 500) {
      if (label) console.log(`    [retry] ${label} 服务端错误 ${r.status}`);
      await sleep(1200);
      continue;
    }
    if (r.json.conflicts?.length > 0) {
      const choices = {};
      for (const c of r.json.conflicts) choices[`${c.table}:${c.id}`] = conflictChoice;
      await call(port, 'POST', '/sync/resolve', { choices }, token);
      await sleep(600);
      continue;
    }
    if (condFn(r)) return r;
    await sleep(1200);
  }
  return last;
}

async function waitHealth(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(base(port) + '/health');
      if (r.ok) return true;
    } catch { /* not up yet */ }
    await sleep(400);
  }
  return false;
}

async function clearTestCloud() {
  const tables = ['students', 'species', 'pets', 'point_events', 'quick_presets', 'items', 'state_rules', 'backpacks', 'item_use_logs', 'app_settings'];
  for (const t of tables) {
    for (let i = 0; i < 4; i++) {
      try {
        await fetch(`${CLOUD_URL}/rest/v1/${t}?id=not.is.null`, {
          method: 'DELETE',
          headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${CLOUD_KEY}`, Prefer: 'return=minimal' },
          signal: AbortSignal.timeout(15000),
        });
        break;
      } catch (e) {
        if (i === 3) throw e;
        await sleep(2000);
      }
    }
  }
}

async function run() {
  console.log('== 双端同步真机联调 ==');
  await clearTestCloud();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-dual-'));
  const dirs = { [PORT_A]: path.join(root, 'deviceA'), [PORT_B]: path.join(root, 'deviceB') };
  const children = [];

  for (const [portStr, dir] of Object.entries(dirs)) {
    fs.mkdirSync(dir, { recursive: true });
    const config = {
      adminPasswordHash: '',
      supabaseUrl: CLOUD_URL,
      supabaseAnonKey: CLOUD_KEY,
      supabaseServiceKey: CLOUD_KEY,
      autoPullMinutes: 0, // 测试期间关掉自动拉取，保证步骤时序确定
      heartbeatTimeoutSec: 3600,
    };
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config, null, 2));
    const port = Number(portStr);
    const child = spawn(process.execPath, [SERVER_ENTRY], {
      cwd: REPO,
      env: { ...process.env, PET_PORT: String(port), PET_DATA_DIR: dir, PET_DISABLE_SETTLE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', () => {});
    child.stderr.on('data', (d) => process.stderr.write('[inst' + port + '] ' + d));
    children.push(child);
  }

  try {
    for (const port of [PORT_A, PORT_B]) {
      if (!(await waitHealth(port))) throw new Error(`实例 ${port} 未启动`);
    }
    console.log('两个实例已就绪');

    // ---- 初始化（欢迎向导等价）：设管理员密码；setup 内部会做首次 runSync ----
    const setupA = await call(PORT_A, 'POST', '/auth/setup', { adminPassword: 'dual-test-123', adminName: 'A端' });
    const setupB = await call(PORT_B, 'POST', '/auth/setup', { adminPassword: 'dual-test-123', adminName: 'B端' });
    const loginA = await call(PORT_A, 'POST', '/auth/login', { role: 'admin', password: 'dual-test-123' });
    const loginB = await call(PORT_B, 'POST', '/auth/login', { role: 'admin', password: 'dual-test-123' });
    tokenA = loginA.json.token;
    tokenB = loginB.json.token;
    record('双端初始化（setup+首次同步+登录）', setupA.status === 200 && setupB.status === 200 && setupA.json.synced === true && !!tokenA && !!tokenB);

    // ---- S1 首次全量互通：A 的种子数据应出现在 B ----
    await sleep(1000);
    await call(PORT_B, 'POST', '/sync/run');
    const s1 = await call(PORT_B, 'GET', '/students');
    const s1pass = Array.isArray(s1.json.students) && s1.json.students.length > 0;
    record('S1 首次全量：B 能看到 A 的种子数据', s1pass, `B 端学生数=${s1.json.students?.length ?? 0}`);

    // ---- S2 A 新增学生+加分 → push → B run → B 可见 ----
    const stu = await call(PORT_A, 'POST', '/admin/students', { studentNo: 'D001', name: '双端学生', className: '测试班', points: 50 }, tokenA);
    record('S2.1 A 新增学生', stu.status === 200 && !!stu.json.id, stu.json.error ?? '');
    const sid = stu.json.id;
    const p1 = await call(PORT_A, 'POST', '/points', { studentIds: [sid], delta: 20, reason: '双端联调加分' }, tokenA);
    record('S2.2 A 加 20 分', p1.status === 200, JSON.stringify(p1.json.error ?? ''));
    const pushA1 = await call(PORT_A, 'POST', '/sync/push');
    await sleep(600);
    await runUntil(PORT_B, tokenB, () => true, 6, 'B S2');
    const s2b = await call(PORT_B, 'GET', `/students/${sid}`);
    const s2pass = s2b.status === 200 && s2b.json.student?.points === 70;
    record('S2.3 B 拉到新学生且积分=70', s2pass, `push=${pushA1.status} B 端 points=${s2b.json?.student?.points}`);

    // ---- S3 双端同改 → 冲突 → 裁决收敛 ----
    await call(PORT_A, 'POST', '/points', { studentIds: [sid], delta: 5, reason: 'A端改' }, tokenA);
    await sleep(1100);
    const pB = await call(PORT_B, 'POST', '/points', { studentIds: [sid], delta: 7, reason: 'B端改' }, tokenB);
    record('S3.1 B 端加 7 分（本地先行）', pB.status === 200);
    // A 推（可能被节流：重试直到 200）
    for (let i = 0; i < 5; i++) {
      const r = await call(PORT_A, 'POST', '/sync/push');
      if (r.status === 200) break;
      await sleep((Number(r.json.retryAfterSec) || 3) * 1000 + 300);
    }
    await sleep(600);
    const runB = await call(PORT_B, 'POST', '/sync/run'); // B：本地(改) vs 云端(A改) → 冲突
    const conflicts = runB.json.conflicts ?? [];
    const detectedAtB = runB.json.completed === false && conflicts.length > 0;
    if (detectedAtB) {
      const choices = {};
      for (const c of conflicts) choices[`${c.table}:${c.id}`] = 'local'; // B 保本机(+7)
      await call(PORT_B, 'POST', '/sync/resolve', { choices }, tokenB);
    }
    console.log(`    [info] S3.2 冲突检出端：${detectedAtB ? 'B' : 'A（时序决定，裁决语义一致）'}`);
    await call(PORT_B, 'POST', '/sync/push');
    await sleep(600);
    // A 收敛：可能直接拉到，也可能检出冲突（云端 77 vs 本地 75）——冲突时保云端(77)
    for (let i = 0; i < 6; i++) {
      const r = await call(PORT_A, 'POST', '/sync/run');
      if (r.status === 429) { await sleep((Number(r.json.retryAfterSec) || 3) * 1000 + 300); continue; }
      if (r.json.conflicts?.length > 0) {
        const choices = {};
        for (const c of r.json.conflicts) choices[`${c.table}:${c.id}`] = 'cloud'; // 云端是 B 胜出值
        await call(PORT_A, 'POST', '/sync/resolve', { choices }, tokenA);
        continue;
      }
      break;
    }
    const s3a = await call(PORT_A, 'GET', `/students/${sid}`);
    // A 端 70+5=75；B 端 70+7=77 胜出 → A 收敛到 77
    record('S3.4 双端收敛到胜出值 77', s3a.json?.student?.points === 77, `A 端 points=${s3a.json?.student?.points}`);

    // ---- S4 A 软删 → B 同步后同样软删（墓碑）----
    await call(PORT_A, 'DELETE', `/admin/students/${sid}`, undefined, tokenA);
    for (let i = 0; i < 5; i++) {
      const r = await call(PORT_A, 'POST', '/sync/push');
      if (r.status === 200) break;
      await sleep((Number(r.json.retryAfterSec) || 3) * 1000 + 300);
    }
    await sleep(600);
    await runUntil(PORT_B, tokenB, () => true, 6, 'B S4', 'cloud');
    const s4 = await call(PORT_B, 'GET', `/students/${sid}`);
    const tombstoned = s4.status === 404 || s4.json?.student === null;
    record('S4 墓碑传播：B 端同步删除', tombstoned, `status=${s4.status}`);

    // ---- S5 商店跨端：B 建学生领宠买道具 → A 拉到背包/流水 ----
    const stuB = await call(PORT_B, 'POST', '/admin/students', { studentNo: 'D002', name: '商店学生', className: '测试班', points: 100 }, tokenB);
    const sidB = stuB.json.id;
    await call(PORT_B, 'POST', `/students/${sidB}/pet/adopt`, { speciesId: 'cat', name: '跨端宠' });
    const buy = await call(PORT_B, 'POST', `/students/${sidB}/pet/buy-item`, { itemId: 'apple' });
    record('S5.1 B 端购买道具', buy.status === 200, JSON.stringify(buy.json.error ?? ''));
    for (let i = 0; i < 5; i++) {
      const r = await call(PORT_B, 'POST', '/sync/push');
      if (r.status === 200) break;
      await sleep((Number(r.json.retryAfterSec) || 3) * 1000 + 300);
    }
    await sleep(600);
    await runUntil(PORT_A, tokenA, () => true, 6, 'A S5');
    const s5a = await call(PORT_A, 'GET', `/students/${sidB}`);
    const bp = (s5a.json?.backpack ?? []).find((x) => x.item_id === 'apple');
    record('S5.2 A 拉到背包（苹果 ≥1）与积分扣减', !!bp && bp.qty >= 1 && s5a.json?.student?.points === 90, `qty=${bp?.qty} points=${s5a.json?.student?.points}`);

    // ---- S6 等级配置跨端同步 ----
    const CUSTOM_THRESHOLDS = [0, 555, 1110, 1665, 2220, 2775, 3330, 3885, 4440, 4995, 5550, 6105, 6660, 7215, 7770];
    const lv = await call(PORT_A, 'PUT', '/levels', {
      names: ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说', '传奇', '神话', '史诗', '闪耀', '王者', '星耀', '至尊', '巅峰'],
      thresholds: CUSTOM_THRESHOLDS,
    }, tokenA);
    let pushA6 = null;
    for (let i = 0; i < 5; i++) {
      pushA6 = await call(PORT_A, 'POST', '/sync/push');
      if (pushA6.status === 200) break;
      await sleep((Number(pushA6.json.retryAfterSec) || 3) * 1000 + 300);
    }
    await sleep(600);
    // 云端 app_settings 应有 levels_config 行
    const cloudAs = await fetch(`${CLOUD_URL}/rest/v1/app_settings?select=key,value`, {
      headers: { apikey: CLOUD_KEY, Authorization: `Bearer ${CLOUD_KEY}` },
    }).then((r) => r.json()).catch(() => []);
    const cloudHas = (cloudAs ?? []).some((x) => x.key === 'levels_config' && JSON.parse(x.value).thresholds?.[1] === 555);
    await runUntil(PORT_B, tokenB, () => true, 6, 'B S6');
    const lvB = await call(PORT_B, 'GET', '/levels', undefined, tokenB);
    const lvOk = lv.status === 200 && lvB.json?.names?.length === 15 && lvB.json?.thresholds?.[1] === 555;
    record('S6 自定义 15 级阈值跨端生效', lvOk, `push=${pushA6?.status}/${pushA6?.json?.pushed} 云端app_settings=${cloudHas} B端级数=${lvB.json?.names?.length} lv2=${lvB.json?.thresholds?.[1]}`);

    // ---- S7 幂等：先 drain 在途变更至 0/0，再连续两轮（间隔 9s 避开节流）验证无回声 ----
    await sleep(9000);
    for (let i = 0; i < 8; i++) {
      const r = await call(i % 2 === 0 ? PORT_A : PORT_B, 'POST', '/sync/run');
      if (r.status === 429) { await sleep((Number(r.json.retryAfterSec) || 3) * 1000 + 300); continue; }
      if (r.json.pulled === 0 && r.json.pushed === 0 && i >= 1) break;
    }
    await sleep(9000);
    const q1a = await call(PORT_A, 'POST', '/sync/run');
    await sleep(9000);
    const q1b = await call(PORT_B, 'POST', '/sync/run');
    const quiet1 = q1a.json.pulled === 0 && q1a.json.pushed === 0 && q1b.json.pulled === 0 && q1b.json.pushed === 0;
    record('S7 双端收敛后完全安静（无回声）', quiet1, `A(${q1a.json.pulled}/${q1a.json.pushed}) B(${q1b.json.pulled}/${q1b.json.pushed})`);

    // ---- S8 限流：立即连发第二次 run → 429 + retryAfterSec ----
    await sleep(9000); // 等 S7 的 run 节流窗口过去，保证 first 必定 200
    const first = await call(PORT_A, 'POST', '/sync/run');
    const second = await call(PORT_A, 'POST', '/sync/run');
    record('S8 限流 429 带 retryAfterSec', first.status === 200 && second.status === 429 && Number(second.json.retryAfterSec) >= 1, `retryAfterSec=${second.json.retryAfterSec}`);

    // ---- S9 云端配置导入（管理员 API，模拟教师机导入生产连接）----
    const imp = await call(PORT_B, 'POST', '/config/import', {
      payload: {
        meta: { tool: 'classroom-pet-system-config', formatVersion: 1, categories: ['cloud'] },
        data: { cloud: { supabaseUrl: CLOUD_URL, supabaseAnonKey: CLOUD_KEY, supabaseServiceKey: CLOUD_KEY } },
      },
      categories: ['cloud'],
    }, tokenB);
    record('S9 云端配置导入接口', imp.status === 200 && Array.isArray(imp.json.results), JSON.stringify(imp.json.error ?? ''));
  } catch (e) {
    record('测试执行异常', false, String(e));
  } finally {
    for (const c of children) {
      try { c.kill(); } catch { /* ignore */ }
    }
    await clearTestCloud();
    setTimeout(() => {
      fs.rmSync(root, { recursive: true, force: true });
      const pass = results.filter((r) => r.pass).length;
      console.log(`\n== 结果：${pass}/${results.length} 通过 ==`);
      for (const r of results.filter((x) => !x.pass)) console.log('  ✗', r.name, r.detail);
      process.exit(0);
    }, 500);
  }
}

run();
