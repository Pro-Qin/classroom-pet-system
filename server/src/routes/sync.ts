import express from 'express';
import type { RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, updateConfig, APP_VERSION, effectiveGiteeRepo, DEFAULT_GITEE_REPO } from '../config.js';
import { getDb, nowIso } from '../db/connection.js';
import { getSetting, setSetting } from '../db/settings.js';
import { MockTransport, SupabaseTransport, type SyncTransport } from '../sync/transport.js';
import { runSync, resolveConflicts, pushDirty, type ConflictItem, type ConflictChoice } from '../sync/engine.js';
import { listSnapshots } from '../db/backup.js';
import { requireRole } from '../middleware.js';

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

/** 异地备份：把最新本地快照上传到 Supabase Storage backups 桶（best-effort） */
export async function uploadBackupToStorage(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const cfg = loadConfig();
  if (!cfg.supabaseUrl || !cfg.supabaseServiceKey || !cfg.supabaseAnonKey) {
    return { ok: false, error: '未配置 Supabase，无法异地备份' };
  }
  try {
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
    if (res.ok) return { ok: true, name };
    const text = (await res.text()).slice(0, 160);
    return { ok: false, error: '存储上传失败 HTTP ' + res.status + ' ' + text };
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

/** Gitee 更新检查结果缓存：准备界面每次启动都会调用，避免反复打外网（学校网络可能慢/离线） */
const updateCache = new Map<string, { at: number; latest: string | null; note: string }>();
const UPDATE_CACHE_MS = 10 * 60 * 1000; // 10 分钟

async function checkGiteeUpdate(repo: string): Promise<{ latest: string | null; note: string }> {
  const key = String(repo ?? '').trim().toLowerCase();
  const cached = updateCache.get(key);
  if (cached && Date.now() - cached.at < UPDATE_CACHE_MS) {
    return { latest: cached.latest, note: cached.note };
  }
  const parsed = parseGiteeRepo(key);
  if (!parsed) {
    const note = '更新源地址无效（应为 owner/repo 或 gitee.com 链接）';
    updateCache.set(key, { at: Date.now(), latest: null, note });
    return { latest: null, note };
  }
  const apiBase = `https://gitee.com/api/v5/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  try {
    // 优先 releases/latest（语义最准确）
    const relRes = await fetch(`${apiBase}/releases/latest`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (relRes.ok) {
      const data = (await relRes.json()) as { tag_name?: string };
      const latest = data.tag_name ?? null;
      updateCache.set(key, { at: Date.now(), latest, note: '' });
      return { latest, note: '' };
    }
    if (relRes.status === 404) {
      // 很多 Gitee 项目只用 tags 不用 releases：回退到 tags[0]
      const tagRes = await fetch(`${apiBase}/tags`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (tagRes.ok) {
        const tags = (await tagRes.json()) as { name?: string }[];
        const latest = tags[0]?.name ?? null;
        const note = latest ? '' : '更新源暂无版本信息';
        updateCache.set(key, { at: Date.now(), latest, note });
        return { latest, note };
      }
      const note = '更新源仓库不存在或未发布任何版本';
      updateCache.set(key, { at: Date.now(), latest: null, note });
      return { latest: null, note };
    }
    const note = `更新源响应异常（HTTP ${relRes.status}）`;
    updateCache.set(key, { at: Date.now(), latest: null, note });
    return { latest: null, note };
  } catch {
    const note = '无法连接更新源（可能离线，请检查网络）';
    updateCache.set(key, { at: Date.now(), latest: null, note });
    return { latest: null, note };
  }
}

export function registerSyncRoutes(app: express.Express, _auth: RequestHandler): void {
  // ============================================================
  // 准备阶段接口（登录前可调，供准备界面检查更新/同步/冲突裁决）：
  //   updates/check、sync/status、sync/run、sync/resolve
  // 说明：同步目标是管理员配置的云端（不可被调用方篡改），
  //       本地库为本机自有数据，LAN 准备流程允许未登录执行。
  // 保留鉴权：sync/config（管理员）、sync/firstrun（已登录）
  // ============================================================

  /** 简单节流：同一 IP 对 sync/run|resolve 每 3 秒最多 1 次；另加全局上限防多设备放大 */
  const syncThrottle = new Map<string, number>();
  let lastGlobalRun = 0;
  function throttle(ip: string, global = false): boolean {
    const last = syncThrottle.get(ip) ?? 0;
    const now = Date.now();
    if (now - last < 3000) return true;
    if (global && now - lastGlobalRun < 5000) return true;
    syncThrottle.set(ip, now);
    if (global) lastGlobalRun = now;
    return false;
  }

  /** 待裁决冲突按发起 IP 绑定，2 分钟内有效（防匿名串改他人冲突裁决） */
  interface PendingSet {
    ip: string;
    at: number;
    conflicts: ConflictItem[];
  }
  let pending: PendingSet | null = null;

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
    });
  });

  // 更新检查策略（公开读取）：本设备跳过 / 整库跳过
  app.get('/api/updates/policy', (_req, res) => {
    const cfg = loadConfig();
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
    if (throttle(ip)) {
      res.status(429).json({ error: '操作过于频繁，请稍后再试' });
      return;
    }
    (async () => {
      try {
        const meta = getDb()
          .prepare(`SELECT last_sync_at FROM sync_meta WHERE id = 'global'`)
          .get() as { last_sync_at: string } | undefined;
        const pushed = await pushDirty(getTransport(), meta?.last_sync_at ?? '');
        res.json({ ok: true, pushed });
      } catch {
        res.status(500).json({ error: '推送失败，请稍后重试' });
      }
    })();
  });

  // 执行两路同步（第一阶段）；有冲突时返回 conflicts，等待用户裁决
  app.post('/api/sync/run', (req, res) => {
    const ip = req.ip ?? 'unknown';
    if (throttle(ip, true)) {
      res.status(429).json({ error: '操作过于频繁，请稍后再试' });
      return;
    }
    (async () => {
      try {
        const result = await runSync(getTransport());
        pending = {
          ip,
          at: Date.now(),
          conflicts: result.conflicts,
        };
        // 不返回 backupFile 绝对路径（防路径泄露），只给是否已备份
        const { backupFile: _bf, ...safe } = result;
        res.json({ ...safe, backup: !!_bf });
        // 异地备份（best-effort，不阻塞响应）
        uploadBackupToStorage()
          .then((u) => {
            if (!u.ok && u.error) console.warn('[backup] 异地备份失败：', u.error);
          })
          .catch(() => {});
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.error('[sync] runSync 失败:', msg);
        if (/Could not find the table/.test(msg)) {
          res.status(500).json({
            error: '云端缺少数据表：请在 Supabase SQL Editor 中执行仓库根目录 supabase/schema.sql（或直接粘贴该文件内容）后再重试',
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
    if (throttle(ip)) {
      res.status(429).json({ error: '操作过于频繁，请稍后再试' });
      return;
    }
    const { choices } = (req.body ?? {}) as { choices?: Record<string, ConflictChoice> };
    if (!pending || pending.ip !== ip || Date.now() - pending.at > 120_000) {
      res.status(400).json({ error: '没有待裁决的冲突（或已过期）' });
      return;
    }
    if (pending.conflicts.length === 0) {
      res.status(400).json({ error: '没有待裁决的冲突' });
      return;
    }
    // 每个冲突都必须显式选择，防"空请求 = 全部按 local 覆盖云端"
    for (const c of pending.conflicts) {
      const key = `${c.table}:${c.id}`;
      const v = choices?.[key];
      if (v !== 'local' && v !== 'cloud') {
        res.status(400).json({ error: `冲突 ${key} 未选择保留本机或云端` });
        return;
      }
    }
    const toResolve = pending.conflicts;
    (async () => {
      try {
        const result = await resolveConflicts(getTransport(), toResolve, choices ?? {});
        pending = null;
        res.json(result);
      } catch {
        console.error('[sync] resolveConflicts 失败');
        res.status(500).json({ error: '冲突处理失败，请重试' });
      }
    })();
  });

  // 更新检查（Gitee 源：真实查询 releases/latest，10 分钟缓存；公开版本信息，无需登录）
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
      });
      return;
    }
    const { latest, note } = await checkGiteeUpdate(effectiveGiteeRepo(cfg));
    const hasUpdate = !!latest && compareVersions(latest, APP_VERSION) > 0;
    res.json({
      enabled: true,
      source: effectiveGiteeRepo(cfg),
      currentVersion: APP_VERSION,
      hasUpdate,
      latestVersion: latest ?? APP_VERSION,
      note: note || (hasUpdate ? `发现新版本 ${latest}` : '已是最新版本'),
    });
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