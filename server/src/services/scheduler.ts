import { getDb, nowIso } from '../db/connection.js';
import { getSetting, setSetting } from '../db/settings.js';
import { snapshotDb } from '../db/backup.js';
import { getTransport } from '../routes/sync.js';
import { runSync } from '../sync/engine.js';
import { loadConfig } from '../config.js';

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

async function autoPullOnce(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const result = await runSync(getTransport());
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
    const today = nowIso().slice(0, 10);
    // ---- 每日快照（03:00 后首个 tick；date key 幂等）----
    const lastSnapDay = getSetting('last_daily_snapshot') ?? '';
    if (localHour() >= 3 && lastSnapDay !== today) {
      try {
        snapshotDb();
        setSetting('last_daily_snapshot', today);
        console.log('[scheduler] 每日快照完成:', today);
      } catch (e) {
        console.warn('[scheduler] 每日快照失败:', (e as Error).message);
      }
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
