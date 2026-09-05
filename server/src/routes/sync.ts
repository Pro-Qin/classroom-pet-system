import express from 'express';
import type { RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { loadConfig, updateConfig, APP_VERSION, effectiveGiteeRepo, DEFAULT_GITEE_REPO, DEFAULT_UI_STYLE, resolveUiStyles, type UiStyleConfig } from '../config.js';
import { getDb, nowIso } from '../db/connection.js';
import { getSetting, setSetting } from '../db/settings.js';
import { MockTransport, SupabaseTransport, type SyncTransport } from '../sync/transport.js';
import { runSync, resolveConflicts, pushDirty, type ConflictItem, type ConflictChoice } from '../sync/engine.js';
import { listSnapshots } from '../db/backup.js';
import { requireRole } from '../middleware.js';
import { checkAllSources } from '../services/updateSources.js';
import { SYNC_TABLES } from '../db/migrate.js';

/** 校验 Supabase 地址：必须 https 且域名以 .supabase.co 结尾（防 SSRF 把 service key 发给任意主机） */
export function isValidSupabaseUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'supabase.co' || u.hostname.endsWith('.supabase.co'));
  } catch {
    return false;
  }
}

export function getTransport(): SyncTransport {
  const cfg = loadConfig();
  if (cfg.supabaseUrl && cfg.supabaseServiceKey && isValidSupabaseUrl(cfg.supabaseUrl)) {
    return new SupabaseTransport(cfg.supabaseUrl, cfg.supabaseAnonKey, cfg.supabaseServiceKey);
  }
  return new MockTransport();
}

/**
 * 确保 backups 桶存在（best-effort）：
 * 尝试创建一次，任何失败都不抛错 —— 桶是否可用由随后的对象上传验证。
 * 不能靠错误文案判断"已存在"：Supabase Storage 对重复建桶在不同权限/RLS
 * 配置下会返回 400/403 且文案各不相同（如 row-level security 违例），
 * 匹配文案会导致真实部署中误判失败。
 */
async function ensureBackupsBucket(cfg: { supabaseUrl: string; supabaseAnonKey: string; supabaseServiceKey: string }): Promise<void> {
  try {
    const res = await fetch(cfg.supabaseUrl + '/storage/v1/bucket', {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseServiceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'backups',
        public: false,
      }),
    });
    if (!res.ok) {
      // 已存在或无权建桶等情形一律放行：后续上传会给出真实验证
      const text = (await res.text()).slice(0, 120);
      console.warn('[backup] 建桶尝试未成功（不影响继续）:', res.status, text);
    }
  } catch (e) {
    console.warn('[backup] 建桶请求异常（不影响继续）:', (e as Error).message);
  }
}

/** 异地备份：把最新本地快照上传到 Supabase Storage backups 桶（best-effort） */
export async function uploadBackupToStorage(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const cfg = loadConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseServiceKey || !cfg.supabaseAnonKey) {
    return { ok: false, error: '未配置 Supabase，无法异地备份' };
  }
  try {
    await ensureBackupsBucket(cfg);
    const snaps = listSnapshots(1);
    if (snaps.length === 0) return { ok: false, error: '没有可上传的本地备份' };
    const file = snaps[0].file;
    const name = 'backup-' + path.basename(file);
    const data = fs.readFileSync(file);
    const res = await fetch(cfg.supabaseUrl + '/storage/v1/object/backups/' + encodeURIComponent(name), {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: 'Bearer ' + cfg.supabaseServiceKey,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    });
      if (!res.ok) {
        const text = (await res.text()).slice(0, 160);
        return { ok: false, error: '存储上传失败 HTTP ' + res.status + ' ' + text };
      }
      // 自动保留策略：上传成功后清理云端 backups 桶旧份（只保留最近 N 份，默认 10，best-effort）
      try {
        const retention = Math.max(1, Number(getSetting('cloud_backup_retention')) || 10);
        const listRes = await fetch(cfg.supabaseUrl + '/storage/v1/object/list/backups', {
          method: 'POST',
          headers: {
            apikey: cfg.supabaseAnonKey,
            Authorization: 'Bearer ' + cfg.supabaseServiceKey,
            'Content-Type': 'application/json',
          },
          // prefix 用空串全量列举后客户端过滤：部分 Storage 版本对非空前缀匹配异常
          body: JSON.stringify({ prefix: '', limit: 200 }),
        });
        if (listRes.ok) {
          const all = (await listRes.json()) as { name: string; updated_at?: string }[];
          const items = all.filter((x) => typeof x.name === 'string' && x.name.startsWith('backup-'));
          items.sort((a, b) => (a.updated_at ?? '').localeCompare(b.updated_at ?? ''));
          const expired = items.slice(0, Math.max(0, items.length - retention));
          for (const item of expired) {
            await fetch(cfg.supabaseUrl + '/storage/v1/object/backups/' + encodeURIComponent(item.name), {
              method: 'DELETE',
              headers: {
                apikey: cfg.supabaseAnonKey,
                Authorization: 'Bearer ' + cfg.supabaseServiceKey,
              },
            }).catch(() => {});
          }
        }
      } catch {
        /* 清理失败不影响本次备份成功 */
      }
      return { ok: true, name };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * 简单语义化版本比较：a > b → 1；a < b → -1；相等 → 0。
 * 支持前导 v（v0.2.0）、数字段位数不同（0.2 > 0.1.9）、预发布尾缀忽略（0.2.0-beta 视为 0.2.0）。
 */
export function compareVersions(a: string, b: string): number {
  const seg = (v: string): number[] =>
    String(v)
      .trim()
      .replace(/^v/i, '')
      .split(/[-+]/)[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = seg(a);
  const pb = seg(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** 解析 Gitee 仓库标识：接受 owner/repo 或完整 gitee.com 链接，返回 { owner, repo }；无效返回 null */
export function parseGiteeRepo(raw: string): { owner: string; repo: string } | null {
  let s = String(raw ?? '').trim();
  if (!s) return null;
  s = s.replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = s.match(/^(?:https?:\/\/gitee\.com\/)?([^/\s]+)\/([^/\s]+)$/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

/** 下载任务进度登记表（jobId -> 进度 0..100 + 状态）。 */
const downloadJobs = new Map<string, { pct: number; status: 'downloading' | 'done' | 'error'; error?: string; path?: string }>();
let jobSeq = 0;

/** 下载安装器到临时目录，返回本地路径。流式写盘并回调进度。优先尝试多个镜像。 */
async function downloadInstaller(baseUrl: string, assetName: string, version: string, onPct?: (pct: number) => void): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), 'pet-campus-update');
  fs.mkdirSync(tmpDir, { recursive: true });
  const safeName = assetName || `ClassroomPetSystem-Setup-${version.replace(/^v/i, '')}.exe`;
  const dest = path.join(tmpDir, safeName);
  const urls = candidateUrls(baseUrl);
  let lastErr: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(150_000), redirect: 'follow' });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader();
      const chunks: Buffer[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const b = Buffer.from(value);
        chunks.push(b);
        received += b.length;
        if (total > 0 && onPct) onPct(Math.min(99, Math.round((received / total) * 100)));
      }
      const buf = Buffer.concat(chunks);
      fs.writeFileSync(dest, buf);
      if (onPct) onPct(100);
      return dest;
    } catch (e) {
      lastErr = e as Error;
    }
  }
  throw lastErr ?? new Error('所有镜像下载失败');
}

/** 对 github-mirror 资产，尝试原始 github 地址，随后加各镜像前缀。 */
function candidateUrls(baseUrl: string): string[] {
  const out: string[] = [];
  const MIRRORS = [
    'https://ghfast.top',
    'https://gh-proxy.com',
    'https://ghproxy.net',
    'https://github.moeyy.xyz',
    'https://ghproxy.cc',
    'https://gh.llkk.cc',
    'https://ghps.top',
    'https://ghproxy.link',
  ];
  if (/^https:\/\/github\.com\//.test(baseUrl)) {
    // 先镜像（国内快），最后直连 github
    for (const m of MIRRORS) out.push(`${m}/${baseUrl}`);
    out.push(baseUrl);
  } else if (/^https:\/\/gitee\.com\//.test(baseUrl)) {
    out.push(baseUrl);
  } else {
    out.push(baseUrl);
  }
  return out;
}

/** 启动安装向导（detached），不阻塞服务、不删除已有 node_modules/data。 */
function launchInstaller(installerPath: string): void {
  if (process.platform !== 'win32') {
    // 非 Windows 平台仅提示（本产品为 Windows 一体机场景）。
    console.log('[update] 非 Windows 平台，仅下载到：', installerPath);
    return;
  }
  const child = spawn('cmd', ['/c', 'start', '', installerPath], { detached: true, stdio: 'ignore' });
  child.unref();
}

/**
 * 同步守卫参数（模块级对象：运行时修改属性立即生效，便于部署调优与测试注入）。
 */
export const syncGuards = {
  /** 同一 IP 同一类同步操作的最小间隔（毫秒） */
  throttleMs: 6000,
  /** 全局两次手动同步（run）的最小间隔（毫秒，防多设备放大） */
  globalRunGapMs: 8000,
  /** 待裁决冲突的有效期（毫秒）：放宽到 5 分钟并配合前端倒计时提示 */
  pendingTtlMs: 300_000,
};

/** 待裁决冲突按发起 IP 绑定，有效期见 syncGuards.pendingTtlMs（防匿名串改他人冲突裁决） */
interface PendingSet {
  ip: string;
  at: number;
  conflicts: ConflictItem[];
}

/** 当前待裁决冲突状态（供健康面板 / 前端倒计时读取） */
export function getPendingState(): { count: number; deadlineAt: number } | null {
  if (!pendingRef.pending || pendingRef.pending.conflicts.length === 0) return null;
  return {
    count: pendingRef.pending.conflicts.length,
    deadlineAt: pendingRef.pending.at + syncGuards.pendingTtlMs,
  };
}

const pendingRef: { pending: PendingSet | null } = { pending: null };

export function registerSyncRoutes(app: express.Express, _auth: RequestHandler): void {
  // ============================================================
  // 准备阶段接口（登录前可调，供准备界面检查更新/同步/冲突裁决）：
  //   updates/check、sync/status、sync/run、sync/resolve
  // 说明：同步目标是管理员配置的云端（不可被调用方篡改），
  //       本地库为本机自有数据，LAN 准备流程允许未登录执行。
  // 保留鉴权：sync/config（管理员）、sync/firstrun（已登录）
  // ============================================================

  /** 简单节流：同一 IP 对每种同步操作每 syncGuards.throttleMs 最多 1 次；run 另有全局上限。
   *  按「操作类型+IP」分桶：后台自动推送（push）与手动同步（run）互不干扰，不应撞出 429。 */
  const syncThrottle = new Map<string, number>();
  let lastGlobalRun = 0;
  function throttle(ip: string, kind: 'push' | 'run' | 'resolve'): boolean {
    const key = `${kind}:${ip}`;
    const last = syncThrottle.get(key) ?? 0;
    const now = Date.now();
    if (now - last < syncGuards.throttleMs) return true;
    if (kind === 'run' && now - lastGlobalRun < syncGuards.globalRunGapMs) return true;
    syncThrottle.set(key, now);
    if (kind === 'run') lastGlobalRun = now;
    return false;
  }

  /** 距下次可重试的秒数（供 429 响应与前端倒计时重试按钮使用） */
  function retryAfterSec(ip: string, kind: 'push' | 'run' | 'resolve'): number {
    const key = `${kind}:${ip}`;
    const last = Math.max(syncThrottle.get(key) ?? 0, kind === 'run' ? lastGlobalRun : 0);
    const gap = kind === 'run' ? Math.max(syncGuards.throttleMs, syncGuards.globalRunGapMs) : syncGuards.throttleMs;
    const left = gap - (Date.now() - last);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /** 待裁决冲突有效期与 IP 绑定逻辑见模块级 pendingRef（同 IP、TTL 内方可裁决） */

  // 同步状态（准备界面/管理端共用；只读元数据）
  app.get('/api/sync/status', (_req, res) => {
    const cfg = loadConfig();
    const db = getDb();
    const meta = db.prepare(`SELECT * FROM sync_meta WHERE id = 'global'`).get() as
      | { last_sync_at: string; updated_at: string }
      | undefined;
    // 不返回 deviceId（签名密钥独立且不暴露）；备份只给数量不泄路径
    res.json({
      mode: cfg.supabaseUrl && cfg.supabaseServiceKey ? 'supabase' : 'mock',
      configured: !!(cfg.supabaseUrl && cfg.supabaseServiceKey),
      lastSyncAt: meta?.last_sync_at ?? '',
      backupCount: listSnapshots(5).length,
      lastError: getSetting('sync_last_error') || '',
    });
  });

  // 同步健康小面板（教师/管理端）：游标、脏行积压、云端可达性、备份、自动拉取与冲突倒计时
  app.get('/api/sync/health', _auth, requireRole(['teacher', 'admin']), (_req, res) => {
    const cfg = loadConfig();
    const db = getDb();
    const meta = db.prepare(`SELECT last_sync_at, last_pull_at, last_push_at FROM sync_meta WHERE id='global'`).get() as
      | { last_sync_at: string; last_pull_at: string; last_push_at: string }
      | undefined;
    const cursor = meta?.last_sync_at ?? '';
    const dirty: { table: string; count: number }[] = [];
    let totalDirty = 0;
    for (const t of SYNC_TABLES) {
      try {
        const c = (db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE updated_at > ?`).get(cursor) as { c: number }).c;
        if (c > 0) dirty.push({ table: t, count: c });
        totalDirty += c;
      } catch {
        /* 表未迁移等情况忽略 */
      }
    }
    const snaps = listSnapshots(2);
    const lastSnap = snaps[0]?.mtime ?? 0;
    const pending = getPendingState();
    res.json({
      mode: cfg.supabaseUrl && cfg.supabaseServiceKey ? 'supabase' : 'mock',
      configured: !!(cfg.supabaseUrl && cfg.supabaseServiceKey),
      cursor,
      lastSyncAt: meta?.last_sync_at ?? '',
      totalDirty,
      dirtyTables: dirty,
      cloudReachable: null as boolean | null, // 由前端调用 sync/test 或由最近一次同步结果推断
      lastError: getSetting('sync_last_error') || '',
      autoPullMinutes: cfg.autoPullMinutes ?? 10,
      autoPullLastAt: Number(getSetting('auto_pull_last_at') ?? '0') || 0,
      backupCount: listSnapshots(200).length,
      lastBackupAgeMin: lastSnap ? Math.round((Date.now() - lastSnap) / 60000) : null,
      conflictPending: pending
        ? { count: pending.count, deadlineAt: pending.deadlineAt }
        : null,
      serverTime: Date.now(),
    });
  });

  // 更新检查策略（公开读取）：本设备跳过 / 整库跳过
  app.get('/api/updates/policy', (_req, res) => {    const cfg = loadConfig();
    res.json({
      deviceDisabled: !!cfg.skipUpdateCheckDevice,
      dbDisabled: getSetting('update_check_db_disabled') === '1',
    });
  });
  // 管理端设置更新检查策略
  app.post('/api/updates/policy', _auth, requireRole(['admin']), (req, res) => {
    const { deviceDisabled, dbDisabled } = (req.body ?? {}) as { deviceDisabled?: boolean; dbDisabled?: boolean };
    if (deviceDisabled !== undefined) {
      updateConfig({ skipUpdateCheckDevice: !!deviceDisabled });
    }
    if (dbDisabled !== undefined) {
      setSetting('update_check_db_disabled', dbDisabled ? '1' : '0');
    }
    res.json({ ok: true });
  });

  // 刷新/数据操作后推送本地变更到云端（增量推送，不拉取不产生冲突）
  app.post('/api/sync/push', (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (throttle(ip, 'push')) {
      // 被节流不再报 429：返回已节流标记，前端静默忽略（本地已落盘，稍后由调度器/下次写入补推）
      res.json({ ok: true, pushed: 0, throttled: true });
      return;
    }
    (async () => {
      try {
        const meta = getDb()
          .prepare(`SELECT last_sync_at FROM sync_meta WHERE id = 'global'`)
          .get() as { last_sync_at: string } | undefined;
        const transport = getTransport();
        const pushed = await pushDirty(transport, meta?.last_sync_at ?? '');
        // 本地模式（mock 云端）：推送即完成，直接推进游标，
        // 健康面板的"待推送变更"随之归零（单机没有另一端需要拉取）
        if (transport.name === 'mock') {
          const now = nowIso();
          getDb()
            .prepare(`UPDATE sync_meta SET last_push_at=?, last_sync_at=?, updated_at=? WHERE id='global'`)
            .run(now, now, now);
        }
        setSetting('sync_last_error', '');
        res.json({ ok: true, pushed });
      } catch {
        try { setSetting('sync_last_error', '推送失败（网络或云端配置问题）'); } catch { /* ignore */ }
        res.status(500).json({ error: '推送失败，请稍后重试' });
      }
    })();
  });

  // 执行两路同步（第一阶段）；有冲突时返回 conflicts，等待用户裁决
  app.post('/api/sync/run', (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (throttle(ip, 'run')) {
      // 被节流不报 429：返回节流标记，避免前端控制台/轮询被刷屏
      res.json({ ok: true, throttled: true, conflicts: [], pulled: 0, pushed: 0, completed: false });
      return;
    }
    (async () => {
      try {
        const result = await runSync(getTransport());
        pendingRef.pending = {
          ip,
          at: Date.now(),
          conflicts: result.conflicts,
        };
        // 不返回 backupFile 绝对路径（防路径泄露），只给是否已备份
        const { backupFile: _bf, ...safe } = result;
        // 倒计时提示：前端据此显示"请在 X 分钟内完成裁决"
        const withDeadline =
          result.conflicts.length > 0
            ? { ...safe, resolveDeadline: Date.now() + syncGuards.pendingTtlMs, pendingTtlMs: syncGuards.pendingTtlMs }
            : safe;
        res.json({ ...withDeadline, backup: !!_bf });
        // 异地备份（best-effort，不阻塞响应）
        uploadBackupToStorage()
          .then((u) => {
            if (!u.ok && u.error) console.warn('[backup] 异地备份失败：', u.error);
          })
          .catch(() => {});
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        try { setSetting('sync_last_error', msg.slice(0, 300)); } catch { /* ignore */ }
        console.error('[sync] runSync 失败:', msg);
        if (/Could not find the table/.test(msg)) {
          res.status(500).json({
            error: '云端缺少数据表：请在 Supabase SQL Editor 中执行仓库根目录 supabase/schema.sql（或直接粘贴该文件内容）后再重试',
          });
          return;
        }
        // 云端列缺失（旧版 schema，如缺 subject）：PGRST204
        const colMiss = msg.match(/Could not find the '([^']+)' column of '([^']+)'/i);
        if (colMiss) {
          res.status(500).json({
            error: `云端表 ${colMiss[2]} 缺少列 ${colMiss[1]}：云端结构过旧，请在 Supabase SQL Editor 中执行仓库最新 supabase/schema.sql 后重试`,
          });
          return;
        }
        res.status(500).json({ error: '同步失败，请稍后重试或检查云端配置（' + msg.slice(0, 120) + '）' });
      }
    })();
  });

  // 冲突裁决（第二阶段）：choices = { "table:id": "local"|"cloud" }
  // 安全：仅允许由同一次 sync/run（同 IP、2 分钟内）产生的冲突被裁决；
  //       且每个冲突必须显式给出 local/cloud 选择（空请求默认 local 的隐患已消除）。
  app.post('/api/sync/resolve', (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (throttle(ip, 'resolve')) {
      res.json({ ok: true, throttled: true });
      return;
    }
    const { choices } = (req.body ?? {}) as { choices?: Record<string, ConflictChoice> };
    const p = pendingRef.pending;
    if (!p || p.ip !== ip || Date.now() - p.at > syncGuards.pendingTtlMs) {
      res.status(400).json({ error: '没有待裁决的冲突（或已过期）' });
      return;
    }
    if (p.conflicts.length === 0) {
      res.status(400).json({ error: '没有待裁决的冲突' });
      return;
    }
    // 每个冲突都必须显式选择，防"空请求 = 全部按 local 覆盖云端"
    for (const c of p.conflicts) {
      const key = `${c.table}:${c.id}`;
      const v = choices?.[key];
      if (v !== 'local' && v !== 'cloud') {
        res.status(400).json({ error: `冲突 ${key} 未选择保留本机或云端` });
        return;
      }
    }
    const toResolve = p.conflicts;
    (async () => {
      try {
        const result = await resolveConflicts(getTransport(), toResolve, choices ?? {});
        pendingRef.pending = null;
        res.json(result);
      } catch {
        console.error('[sync] resolveConflicts 失败');
        res.status(500).json({ error: '冲突处理失败，请重试' });
      }
    })();
  });

  // 界面文案风格 - 原始规则（管理端编辑用）：welcome/student/admin 的规则值。
  app.get('/api/ui/style', (_req, res) => {
    const cfg = loadConfig();
    res.json({ ...DEFAULT_UI_STYLE, ...(cfg.uiStyle ?? {}) });
  });

  // 界面文案风格 - 每界面最终生效风格（前端显示用，登录前后均可读）。
  app.get('/api/ui/vibe', (_req, res) => {
    res.json(resolveUiStyles(loadConfig()));
  });

  // 界面文案风格（管理员修改）：保存原始规则，返回解析后结果。
  app.post('/api/ui/style', _auth, requireRole(['admin']), (req, res) => {
    const body = (req.body ?? {}) as Partial<Record<'welcome' | 'student' | 'admin', string>>;
    const cur = (loadConfig().uiStyle ?? {}) as UiStyleConfig;
    const patch: UiStyleConfig = {
      welcome: (['global_formal', 'student_playful', 'global_playful'].includes(body.welcome ?? '') ? body.welcome : cur.welcome) as UiStyleConfig['welcome'],
      student: (['formal', 'playful'].includes(body.student ?? '') ? body.student : cur.student) as UiStyleConfig['student'],
      admin: (['global_formal', 'student_playful', 'global_playful'].includes(body.admin ?? '') ? body.admin : cur.admin) as UiStyleConfig['admin'],
    };
    const cfg = updateConfig({ uiStyle: patch });
    res.json({ ok: true, styles: resolveUiStyles(cfg) });
  });

  // 更新检查（多源：GitHub 镜像 → Gitee → GitHub；10 分钟缓存；公开版本信息，无需登录）
  app.get('/api/updates/check', async (_req, res) => {
    const cfg = loadConfig();
    const repo = effectiveGiteeRepo(cfg);
    if (!cfg.giteeEnabled || !repo) {
      res.json({
        enabled: !!cfg.giteeEnabled,
        source: cfg.giteeEnabled ? effectiveGiteeRepo(cfg) : null,
        currentVersion: APP_VERSION,
        hasUpdate: false,
        latestVersion: APP_VERSION,
        note: '未配置更新源',
        sources: [],
      });
      return;
    }
    const { sources, highest } = await checkAllSources();
    const hasUpdate = !!highest && compareVersions(highest, APP_VERSION) > 0;
    // downloadUrl：优先 GitHub 镜像直链（ghfast 等反代，国内可达），其次 GitHub 直链
    const dl = sources.find((x) => x.kind === 'github-mirror' && x.reachable && x.assetUrl)
      || sources.find((x) => x.kind === 'github' && x.reachable && x.assetUrl);
    res.json({
      enabled: true,
      source: effectiveGiteeRepo(cfg),
      currentVersion: APP_VERSION,
      hasUpdate,
      latestVersion: highest ?? APP_VERSION,
      downloadUrl: hasUpdate ? (dl?.assetUrl ?? '') : '',
      note: highest && hasUpdate ? `发现新版本 ${highest}` : (highest ? '已是最新版本' : '更新源暂无版本信息'),
      sources: sources.map((s) => ({ id: s.id, label: s.label, kind: s.kind, latestVersion: s.latestVersion, assetName: s.assetName, assetUrl: s.assetUrl, reachable: s.reachable })),
    });
  });

  // 下载并启动安装器（增量更新）：从多源中找到可达的安装器地址，
  // 后台下载并报告进度，完成后启动 Inno 安装向导。不删除 node_modules / server/data。
  app.post('/api/updates/install', async (req, res) => {
    const body = (req.body ?? {}) as { sourceId?: string };
    const { sources, highest } = await checkAllSources();
    let assetUrl = '';
    let assetName = '';
    if (body.sourceId) {
      const chosen = sources.find((s) => s.id === body.sourceId);
      if (chosen && chosen.reachable && chosen.assetUrl) {
        assetUrl = chosen.assetUrl;
        assetName = chosen.assetName;
      }
    }
    if (!assetUrl) {
      const firstReachable = sources.find((s) => s.reachable && s.assetUrl);
      if (firstReachable) { assetUrl = firstReachable.assetUrl; assetName = firstReachable.assetName; }
    }
    if (!assetUrl || !highest || compareVersions(highest, APP_VERSION) <= 0) {
      res.status(400).json({ error: '当前已是最新版本或无可用安装器' });
      return;
    }
    // 启动后台下载任务，立即返回 jobId，前端轮询进度。
    const jobId = 'dl-' + Date.now() + '-' + (++jobSeq);
    const job: { pct: number; status: 'downloading' | 'done' | 'error'; error?: string; path?: string } = { pct: 0, status: 'downloading' };
    downloadJobs.set(jobId, job);
    (async () => {
      try {
        const installerPath = await downloadInstaller(assetUrl, assetName, highest, (pct) => { job.pct = pct; });
        job.pct = 100;
        job.status = 'done';
        job.path = installerPath;
        launchInstaller(installerPath);
      } catch (e) {
        job.status = 'error';
        job.error = (e as Error).message;
      }
    })();
    res.json({ ok: true, jobId, version: highest });
  });

  // 下载进度轮询：前端定时查询安装器下载进度。
  app.get('/api/updates/install/status', (req, res) => {
    const jobId = String((req.query.jobId ?? ''));
    const job = downloadJobs.get(jobId);
    if (!job) { res.status(404).json({ error: '任务不存在' }); return; }
    res.json({ pct: job.pct, status: job.status, error: job.error ?? null });
  });

  // 向导/管理端保存同步配置（管理员专属 + 域名白名单）
  app.post('/api/sync/config', _auth, requireRole(['admin']), (req, res) => {
    const body = (req.body ?? {}) as {
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      supabaseServiceKey?: string;
      giteeRepo?: string;
      giteeEnabled?: boolean;
    };
    const patch: Parameters<typeof updateConfig>[0] = {};
    if (body.supabaseUrl !== undefined) {
      patch.supabaseUrl = String(body.supabaseUrl).trim();
      if (patch.supabaseUrl && !isValidSupabaseUrl(patch.supabaseUrl)) {
        res.status(400).json({ error: 'Supabase 地址无效：必须为 https://xxx.supabase.co' });
        return;
      }
    }
    if (body.supabaseAnonKey !== undefined) patch.supabaseAnonKey = String(body.supabaseAnonKey).trim();
    if (body.supabaseServiceKey !== undefined)
      patch.supabaseServiceKey = String(body.supabaseServiceKey).trim();
    // Gitee 更新源为锁定默认值，不接受修改（防被篡改指向恶意源）
    patch.giteeRepo = DEFAULT_GITEE_REPO;
    patch.giteeEnabled = true;
    const cfg = updateConfig(patch);
    // 云端配置变更后重置同步基线：下次同步做全量拉取+推送（保证本地数据完整上云）
    if (cfg.supabaseUrl && cfg.supabaseServiceKey) {
      getDb()
        .prepare(`UPDATE sync_meta SET last_sync_at = '', updated_at = ? WHERE id = 'global'`)
        .run(nowIso());
    }
    res.json({
      ok: true,
      mode: cfg.supabaseUrl && cfg.supabaseServiceKey ? 'supabase' : 'mock',
      giteeEnabled: cfg.giteeEnabled,
    });
  });

  // 连接测试（管理员）：用 anon/publishable key 做一次只读 REST 探测，并报告 service key 是否已配置
  app.post('/api/sync/test', _auth, requireRole(['admin']), async (_req, res) => {
    const cfg = loadConfig();
    if (!cfg.supabaseUrl) {
      res.status(400).json({ ok: false, error: '尚未配置 Supabase 项目地址' });
      return;
    }
    if (!isValidSupabaseUrl(cfg.supabaseUrl)) {
      res.status(400).json({ ok: false, error: 'Supabase 地址无效' });
      return;
    }
    const readKey = cfg.supabaseAnonKey?.trim();
    if (!readKey) {
      res.status(400).json({ ok: false, error: '尚未配置 Anon / Publishable Key' });
      return;
    }
    try {
      const r2 = await fetch(cfg.supabaseUrl + '/rest/v1/students?select=id&limit=1', {
        headers: {
          apikey: readKey,
          Authorization: 'Bearer ' + readKey,
        },
        signal: AbortSignal.timeout(8000),
      });
      const readOk = r2.status === 200 || r2.status === 404;
      res.json({
        ok: readOk,
        readOk,
        writeKeyPresent: !!cfg.supabaseServiceKey,
        status: r2.status,
        note: readOk
          ? (cfg.supabaseServiceKey
              ? '连接成功：可读可写（service role key 已配置）'
              : '连接成功（只读）：还缺少 Service Role Key，写入/同步将不可用，请到 Supabase 后台 Project Settings → API 获取 service_role 密钥')
          : '读取失败：请检查项目地址与 Key 是否正确',
      });
    } catch {
      res.status(500).json({ ok: false, error: '无法连接 Supabase（网络或地址问题）' });
    }
  });

  // 管理员手动备份：本地快照 + 异地备份（Supabase Storage）
  app.post('/api/sync/backup', _auth, requireRole(['admin']), async (_req, res) => {
    try {
      const { snapshotDb } = await import('../db/backup.js');
      snapshotDb();
      const u = await uploadBackupToStorage();
      res.json(u.ok ? { ok: true, name: u.name } : { ok: false, error: u.error ?? '备份失败' });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // 首次配置完成标记
  app.post('/api/sync/firstrun', _auth, (req, res) => {
    setSetting('first_run_done', '1');
    res.json({ ok: true, firstRunDone: true });
  });
}