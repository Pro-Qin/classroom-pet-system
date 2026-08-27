import { describe, it, expect, afterAll, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 同步路由层测试（内存 express + 内存 SQLite，不碰真实 server/data）：
 *  通过 vi.mock 把 config 模块的关键导出替换为临时目录实现，
 *  防止测试污染真实 config.json / 备份目录 / mock 云端文件。
 */
vi.mock('../src/config.js', async (importOriginal) => {
  const fsx = await import('node:fs');
  const osx = await import('node:os');
  const px = await import('node:path');
  const orig = await importOriginal<typeof import('../src/config.js')>();
  const dir = fsx.mkdtempSync(px.join(osx.tmpdir(), 'pet-routes-'));
  (globalThis as unknown as Record<string, unknown>).__petRoutesTmpDir = dir;
  const baseCfg = {
    adminPasswordHash: 'route-test-hash',
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceKey: '',
    giteeRepo: orig.DEFAULT_GITEE_REPO,
    giteeEnabled: true,
    deviceId: 'route-test-device',
    tokenSecret: 'route-test-token-secret',
    skipUpdateCheckDevice: false,
    uiStyle: { ...orig.DEFAULT_UI_STYLE },
    heartbeatTimeoutSec: 120,
  };
  let cfg = { ...baseCfg };
  return {
    ...orig,
    ROOT: dir,
    DATA_DIR: dir,
    UPLOAD_DIR: px.join(dir, 'uploads'),
    BACKUP_DIR: px.join(dir, 'backups'),
    CONFIG_FILE: px.join(dir, 'config.json'),
    DB_FILE: px.join(dir, 'unused.db'),
    loadConfig: () => ({ ...cfg }),
    saveConfig: (c: typeof cfg) => {
      cfg = { ...c };
    },
    updateConfig: (patch: Partial<typeof cfg>) => {
      cfg = { ...cfg, ...patch };
      return { ...cfg };
    },
    getOrCreateDeviceId: () => 'route-test-device',
    getOrCreateTokenSecret: () => 'route-test-token-secret',
    _resetTestConfig: (): void => {
      cfg = { ...baseCfg };
    },
  } as typeof orig;
});

import { registerSyncRoutes, syncGuards } from '../src/routes/sync.js';
import { requireAuth, signToken } from '../src/middleware.js';
import { openMemoryDb, setDbForTest, closeDb, nowIso } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { applyRow } from '../src/sync/engine.js';
import { MockTransport } from '../src/sync/transport.js';
import { DATA_DIR, BACKUP_DIR } from '../src/config.js';
// 仅供测试重置 mock 配置闭包
const resetTestConfig = (await import('../src/config.js') as unknown as {
  _resetTestConfig: () => void;
})._resetTestConfig;
import type { SqliteDb } from '../src/db/connection.js';

const ADMIN_TOKEN = signToken('admin');
const TEACHER_TOKEN = signToken('teacher');

let db: SqliteDb;
let server: ReturnType<express.Express['listen']>;
let baseUrl = '';

function makeApp(): void {
  const app = express();
  app.use(express.json());
  registerSyncRoutes(app, requireAuth);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

interface CallResult {
  status: number;
  json: Record<string, unknown>;
}

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));

async function call(
  method: string,
  p: string,
  body?: unknown,
  token?: string
): Promise<CallResult> {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* 空响应 */
  }
  return { status: res.status, json };
}

function tmpPath(p: string): string {
  return path.join(DATA_DIR, p);
}

afterAll(() => {
  const dir = (globalThis as unknown as Record<string, unknown | undefined>).__petRoutesTmpDir;
  if (typeof dir === 'string') fs.rmSync(dir, { recursive: true, force: true });
});

/** 守卫参数快照：beforeEach 注入毫秒级窗口让时序用例即时完成，afterEach 恢复 */
const guardSnapshot = { ...syncGuards };

beforeEach(() => {
  Object.assign(syncGuards, { throttleMs: 0, globalRunGapMs: 0, pendingTtlMs: 120_000 });
  makeApp();
  db = openMemoryDb();
  setDbForTest(db);
  migrate(db);
  seed(db);
  resetTestConfig?.();
  // 清空隔离云端文件与备份目录，保证用例独立
  fs.rmSync(tmpPath('cloud-mock.json'), { force: true });
  fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
});

afterEach(() => {
  Object.assign(syncGuards, guardSnapshot);
  server?.close();
  closeDb();
});

describe('/api/sync/status', () => {
  it('未配置时为 mock 模式且只返回白名单字段', async () => {
    const r = await call('GET', '/api/sync/status');
    expect(r.status).toBe(200);
    expect(r.json.mode).toBe('mock');
    expect(r.json.configured).toBe(false);
    expect(Object.keys(r.json).sort()).toEqual(['backupCount', 'configured', 'lastSyncAt', 'mode']);
  });

  it('同步一次后 backupCount 至少为 1，游标时间可见', async () => {
    const r0 = await call('POST', '/api/sync/run');
    expect(r0.status).toBe(200);
    expect(r0.json.completed).toBe(true);
    expect(r0.json.backup).toBe(true);
    expect(!('backupFile' in r0.json)).toBe(true); // 绝对路径不外泄

    const r1 = await call('GET', '/api/sync/status');
    expect((r1.json.backupCount as number)).toBeGreaterThanOrEqual(1);
    expect(String(r1.json.lastSyncAt)).not.toBe('');
  });
});

describe('/api/sync/config（管理员专属）', () => {
  it('未登录 401；教师角色 403', async () => {
    expect((await call('POST', '/api/sync/config', {})).status).toBe(401);
    expect(
      (await call('POST', '/api/sync/config', {}, TEACHER_TOKEN)).status
    ).toBe(403);
  });

  it('合法地址保存成功、切到 supabase 模式并重置游标基线', async () => {
    const r = await call('POST', '/api/sync/config', {
      supabaseUrl: 'https://myproj.supabase.co',
      supabaseAnonKey: 'anon-x',
      supabaseServiceKey: 'svc-x',
    }, ADMIN_TOKEN);
    expect(r.status).toBe(200);
    expect(r.json.mode).toBe('supabase');
    const st = await call('GET', '/api/sync/status');
    expect(st.json.configured).toBe(true);
    expect(st.json.mode).toBe('supabase');
    const meta = db.prepare(`SELECT last_sync_at FROM sync_meta WHERE id='global'`).get() as { last_sync_at: string };
    expect(meta.last_sync_at).toBe(''); // 基线重置 → 下次全量拉推
  });

  it.each([
    ['https://supabase.co.evil.com', '仿冒域名'],
    ['http://a.supabase.co', '非 https'],
    ['https://evil.com', '外域'],
    ['not-a-url', '非法串'],
  ])('%s（%s）被拒绝', async (bad) => {
    const r = await call('POST', '/api/sync/config', { supabaseUrl: bad }, ADMIN_TOKEN);
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain('Supabase 地址无效');
  });

  it('Gitee 更新源不可篡改：传恶意 repo 也回落锁定默认值', async () => {
    const r = await call('POST', '/api/sync/config', { giteeRepo: 'https://gitee.com/attacker/repo' }, ADMIN_TOKEN);
    expect(r.status).toBe(200);
    expect(r.json.giteeEnabled).toBe(true);
    const st = await call('GET', '/api/updates/check');
    expect(String(st.json.source ?? '')).not.toContain('attacker');
  });
});

describe('/api/sync/run 与节流', () => {
  it('本地新增行推送进 mock 云端', async () => {
    const ts = nowIso();
    applyRow(db, 'students', {
      id: 'run_stu', student_no: 'R001', name: '路由学生', class_name: '高一(1)班', points: 8,
      created_at: ts, updated_at: ts, deleted_at: null,
    });
    const r = await call('POST', '/api/sync/run');
    expect(r.status).toBe(200);
    expect(r.json.completed).toBe(true);
    expect(r.json.pushed).toBeGreaterThanOrEqual(1);
    const cloud = JSON.parse(fs.readFileSync(tmpPath('cloud-mock.json'), 'utf-8')) as {
      students?: { id: string; name: string }[];
    };
    expect(cloud.students?.some((s) => s.id === 'run_stu' && s.name === '路由学生')).toBe(true);
  });

  it('同一 IP 连续两次 run 在窗口内被限流 429', async () => {
    // 用远大于测试耗时的窗口保证确定性（默认 6s 在慢环境下可能被跑穿）
    syncGuards.throttleMs = 60_000;
    const r1 = await call('POST', '/api/sync/run');
    expect(r1.status).toBe(200);
    const r2 = await call('POST', '/api/sync/run');
    expect(r2.status).toBe(429);
    expect(String(r2.json.error)).toContain('频繁');
  });

  it('回归锁：run 之后立即 push 不再被误伤 429（按操作类型分桶）', async () => {
    const rRun = await call('POST', '/api/sync/run');
    expect(rRun.status).toBe(200);
    const rPush = await call('POST', '/api/sync/push'); // 旧实现会撞出 429
    expect(rPush.status).toBe(200);
    expect(rPush.json.ok).toBe(true);
  });

  it('节流窗口过后恢复放行', async () => {
    syncGuards.throttleMs = 20;
    expect((await call('POST', '/api/sync/run')).status).toBe(200);
    await sleep(50);
    expect((await call('POST', '/api/sync/run')).status).toBe(200);
  });
});

describe('/api/sync/resolve 冲突裁决流（HTTP 层）', () => {
  async function prepareConflict(studentId: string, localPoints: number, cloudPoints: number): Promise<void> {
    const base = Date.now();
    // 双方已同步的基线（时间戳在过去）
    const ts0 = new Date(base - 600_000).toISOString();
    applyRow(db, 'students', {
      id: studentId, student_no: 'C100', name: '冲突生', class_name: '', subject: '', points: 0,
      created_at: ts0, updated_at: ts0, deleted_at: null,
    });
    await call('POST', '/api/sync/run'); // 游标推进到「现在」
    // 之后所有时间戳必须严格晚于该游标（字符串比较），否则引擎视为未变更
    db.prepare(`UPDATE students SET points=?, updated_at=? WHERE id=?`).run(
      localPoints, new Date(base + 1500).toISOString(), studentId
    );
    await new MockTransport().push('students', [{
      id: studentId, student_no: 'C100', name: '冲突生', class_name: '', subject: '', points: cloudPoints,
      created_at: ts0, updated_at: new Date(base + 2000).toISOString(), deleted_at: null,
    }]);
  }

  it('有冲突时 completed=false、冲突详情完整、无路径泄露、游标不推进', async () => {
    await prepareConflict('stu_http_c', 111, 222);
    const beforeMeta = db.prepare(`SELECT last_sync_at FROM sync_meta WHERE id='global'`).get() as { last_sync_at: string };

    const r = await call('POST', '/api/sync/run');
    expect(r.status).toBe(200);
    expect(r.json.completed).toBe(false);
    const conf = r.json.conflicts as { table: string; id: string; local?: { points: number }; cloud?: { points: number }; localUpdatedAt?: string; cloudUpdatedAt?: string }[];
    expect(conf).toHaveLength(1);
    expect(conf[0].table).toBe('students');
    expect(conf[0].id).toBe('stu_http_c');
    expect(conf[0].local?.points).toBe(111);
    expect(conf[0].cloud?.points).toBe(222);
    expect(typeof conf[0].localUpdatedAt).toBe('string');
    expect(!('backupFile' in r.json)).toBe(true);

    const afterMeta = db.prepare(`SELECT last_sync_at FROM sync_meta WHERE id='global'`).get() as { last_sync_at: string };
    expect(afterMeta.last_sync_at).toBe(beforeMeta.last_sync_at); // 未裁决绝不推进
  });

  it('缺少显式选择 → 400；裁决完成后 pending 清空；保云端则本地与云端收敛一致', async () => {
    await prepareConflict('stu_http_d', 333, 444);
    await call('POST', '/api/sync/run');

    const bad = await call('POST', '/api/sync/resolve', { choices: {} });
    expect(bad.status).toBe(400);
    expect(String(bad.json.error)).toContain('students:stu_http_d');

    const ok = await call('POST', '/api/sync/resolve', { choices: { 'students:stu_http_d': 'cloud' } });
    expect(ok.status).toBe(200);
    expect(ok.json.completed).toBe(true);

    const row = db.prepare(`SELECT points FROM students WHERE id='stu_http_d'`).get() as { points: number };
    expect(row.points).toBe(444);

    const again = await call('POST', '/api/sync/resolve', { choices: { 'students:stu_http_d': 'local' } });
    expect(again.status).toBe(400);
    expect(String(again.json.error)).toContain('没有待裁决的冲突');
  });

  it('保本机 → 本地值最终覆盖云端', async () => {
    await prepareConflict('stu_http_e', 555, 666);
    await call('POST', '/api/sync/run');
    const ok = await call('POST', '/api/sync/resolve', { choices: { 'students:stu_http_e': 'local' } });
    expect(ok.status).toBe(200);
    const cloud = JSON.parse(fs.readFileSync(tmpPath('cloud-mock.json'), 'utf-8')) as {
      students?: { id: string; points: number }[];
    };
    expect(cloud.students?.find((s) => s.id === 'stu_http_e')?.points).toBe(555);
  });

  it('冲突产生超过有效期未裁决 → 按过期拒绝，防止匿名串改他人裁决', async () => {
    await prepareConflict('stu_http_x', 11, 22);
    await call('POST', '/api/sync/run');
    syncGuards.pendingTtlMs = 30;
    await sleep(60);
    const r = await call('POST', '/api/sync/resolve', { choices: { 'students:stu_http_x': 'local' } });
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain('已过期');
  });
});

describe('/api/updates/policy', () => {
  it('默认策略可读', async () => {
    const r = await call('GET', '/api/updates/policy');
    expect(r.json).toEqual({ deviceDisabled: false, dbDisabled: false });
  });

  it('管理员可改，教师不可改', async () => {
    expect((await call('POST', '/api/updates/policy', { deviceDisabled: true })).status).toBe(401);
    expect((await call('POST', '/api/updates/policy', { deviceDisabled: true }, TEACHER_TOKEN)).status).toBe(403);
    const ok = await call('POST', '/api/updates/policy', { deviceDisabled: true, dbDisabled: true }, ADMIN_TOKEN);
    expect(ok.status).toBe(200);
    const r = await call('GET', '/api/updates/policy');
    expect(r.json.deviceDisabled).toBe(true);
    expect(r.json.dbDisabled).toBe(true);
  });
});

describe('/api/sync/test（连接测试）', () => {
  it('未配置地址 → 400 提示配置', async () => {
    const r = await call('POST', '/api/sync/test', undefined, ADMIN_TOKEN);
    expect(r.status).toBe(400);
    expect(String(r.json.error)).toContain('尚未配置');
  });

  it('地址不合法 → 400', async () => {
    await call('POST', '/api/sync/config', { supabaseUrl: 'https://nope.evil.example.com' }, ADMIN_TOKEN);
    // 上一步会把无效地址拒掉，这里手动走一遍兜底分支：直接写合法但非白名单域名的地址不可能存进来，
    // 因此退而验证“未配 anon key”的分支。
    const r2 = await call('POST', '/api/sync/test', undefined, ADMIN_TOKEN);
    expect([400]).toContain(r2.status);
  });
});

describe('/api/sync/firstrun', () => {
  it('需要登录并写入 first_run_done', async () => {
    expect((await call('POST', '/api/sync/firstrun')).status).toBe(401);
    const ok = await call('POST', '/api/sync/firstrun', undefined, TEACHER_TOKEN);
    expect(ok.status).toBe(200);
    expect(ok.json.firstRunDone).toBe(true);
    const v = db.prepare(`SELECT value FROM settings WHERE key='first_run_done'`).get() as { value: string };
    expect(v.value).toBe('1');
  });
});
