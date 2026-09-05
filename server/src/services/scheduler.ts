import { getDb, nowIso } from '../db/connection.js';
import { settleAllPets } from './pets.js';
import { getSetting, setSetting } from '../db/settings.js';
import { getTransport } from '../routes/sync.js';
import { runSync } from '../sync/engine.js';
import { loadConfig, DB_FILE, BACKUP_DIR } from '../config.js';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

/**
 * 后台定时任务：
 *  1. 每日凌晨快照 —— 本地库 VACUUM INTO 一份（即使当天没有同步也留当日备份）
 *  2. 自动拉取 —— 低频轮询云端增量（默认 10 分钟，可在管理端调 0=关闭）
 *
 * 设计要点：
 *  - 全局互斥：自动拉取与手动同步共用一个 running 锁，绝不叠跑
 *  - 静默容错：失败只写 sync_last_error 设置项（供健康面板展示），不惊扰前端
 *  - 测试环境跳过启动
 */

let started = false;
let syncing = false;
let tickTimer: ReturnType<typeof setInterval> | null = null;

export function isSyncBusy(): boolean {
  return syncing;
}

function localHour(): number {
  return new Date().getHours();
}

/** 今日快照目标路径（与 backup.ts 的 snapshotDb 命名保持同目录同风格） */
function snapshotPathForToday(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return join(BACKUP_DIR, `snapshot-${ts}.db`);
}

async function autoPullOnce(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const result = await runSync(getTransport(), { snapshot: false });
    if (result.completed) {
      setSetting('sync_last_error', '');
      setSetting('auto_pull_last_at', String(Date.now()));
    } else {
      setSetting('sync_last_error', `有待裁决冲突 ${result.conflicts.length} 条`);
    }
  } catch (e) {
    setSetting('sync_last_error', ((e as Error).message || '同步失败').slice(0, 300));
  } finally {
    syncing = false;
  }
}

async function tick(): Promise<void> {
  try {
    // ---- 全员宠物经验结算（每小时一次；后台自动，与学生是否查看无关）----
    // PET_DISABLE_SETTLE=1 供多实例联调关闭（避免双端各自结算互相踩踏干扰时序断言）
    if (process.env.PET_DISABLE_SETTLE !== '1') {
      const lastSettle = Number(getSetting('pets_settle_last_at') ?? '0') || 0;
      if (Date.now() - lastSettle >= 3_600_000) {
        setSetting('pets_settle_last_at', String(Date.now()));
        try {
          const r = settleAllPets(getDb());
          if (r.settled > 0) console.log(`[scheduler] 宠物经验结算：${r.settled} 只，共 +${r.expTotal} 经验`);
        } catch (e) {
          console.warn('[scheduler] 宠物经验结算失败:', (e as Error).message);
        }
      }
    }

    const today = nowIso().slice(0, 10);
    // ---- 每日快照（03:00 后首个 tick；date key 幂等）----
    // VACUUM INTO 是同步操作，大库时会阻塞整个事件循环数秒，
    // 导致心跳超时误弹"断连遮罩"。改为派生独立子进程执行，主进程零阻塞。
    const lastSnapDay = getSetting('last_daily_snapshot') ?? '';
    if (localHour() >= 3 && lastSnapDay !== today) {
      setSetting('last_daily_snapshot', today); // 先记账防重复派生；失败明天自动补
      const child = spawn(process.execPath, [
        '-e',
        `const { DatabaseSync } = require('node:sqlite');` +
          `const db = new DatabaseSync(process.env.PET_DB_PATH);` +
          `db.exec("VACUUM INTO '" + process.env.PET_SNAP_PATH.replace(/'/g, "''") + "'");` +
          `db.close(); console.log('[snapshot-child] done');`,
      ], {
        env: { ...process.env, PET_DB_PATH: DB_FILE, PET_SNAP_PATH: snapshotPathForToday() },
        detached: true,
        stdio: 'ignore',
      });
      child.on('exit', (code) => {
        if (code === 0) console.log('[scheduler] 每日快照完成:', today);
        else console.warn('[scheduler] 每日快照子进程退出码', code);
      });
      child.unref();
    }

    // ---- 自动拉取 ----
    const cfg = loadConfig();
    const intervalMin = Math.max(0, Math.round(Number(cfg.autoPullMinutes ?? 10)));
    if (intervalMin === 0) return; // 0 = 关闭自动拉取
    const lastAt = Number(getSetting('auto_pull_last_at') ?? '0') || 0;
    if (Date.now() - lastAt < intervalMin * 60_000) return;
    setSetting('auto_pull_last_at', String(Date.now())); // 先记时间防抖动重入
    await autoPullOnce();
  } catch (e) {
    console.warn('[scheduler] tick 异常:', (e as Error).message);
  }
}

/** 启动后台调度（幂等；测试环境不启动） */
export function startSchedulers(): void {
  if (started || process.env.VITEST) return;
  started = true;
  // 每次程序启动：立即为全体宠物按 `last_tick_at` 补一次经验（后台执行，浮标防重复）。
  // 后续每小时 tick 再继续按最新 last_tick_at 累加，学生无需进入自己的宠物系统。
  if (process.env.PET_DISABLE_SETTLE !== '1') {
    try {
      setSetting('pets_settle_last_at', String(Date.now()));
      const r = settleAllPets(getDb());
      if (r.settled > 0) console.log(`[scheduler] 启动全员经验结算：${r.settled} 只，共 +${r.expTotal} 经验`);
      else console.log('[scheduler] 启动全员经验结算：无新增（浮标未到下一次）');
    } catch (e) {
      console.warn('[scheduler] 启动全员经验结算失败:', (e as Error).message);
    }
  }
  // 启动后 8 秒做首次检查（等服务就绪），之后每分钟 tick 一次判定到期任务
  setTimeout(() => void tick(), 8_000).unref();
  tickTimer = setInterval(() => void tick(), 60_000);
  tickTimer.unref();
}

/** 停止（主要供测试/优雅退出） */
export function stopSchedulers(): void {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  started = false;
}
