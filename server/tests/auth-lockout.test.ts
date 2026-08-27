import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcryptjs from 'bcryptjs';

/**
 * 登录防爆破锁定（HTTP 层）：
 *  连续失败 ≥5 次 → 锁定 5 分钟；锁定期内即使密码正确也拒绝。
 */
vi.mock('../src/config.js', async (importOriginal) => {
  const fsx = await import('node:fs');
  const osx = await import('node:os');
  const px = await import('node:path');
  const orig = await importOriginal<typeof import('../src/config.js')>();
  const dir = fsx.mkdtempSync(px.join(osx.tmpdir(), 'pet-lock-'));
  const cfgFixture = {
    adminPasswordHash: bcryptjs.hashSync('correct-horse', 4),
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceKey: '',
    giteeRepo: orig.DEFAULT_GITEE_REPO,
    giteeEnabled: true,
    deviceId: 'lock-test',
    tokenSecret: 'lock-test-secret',
    skipUpdateCheckDevice: false,
    uiStyle: { ...orig.DEFAULT_UI_STYLE },
    heartbeatTimeoutSec: 120,
    autoPullMinutes: 10,
  };
  return {
    ...orig,
    DATA_DIR: dir,
    CONFIG_FILE: px.join(dir, 'config.json'),
    DB_FILE: px.join(dir, 'unused.db'),
    loadConfig: () => ({ ...cfgFixture }),
  } as typeof orig;
});

import { registerAuthRoutes } from '../src/routes/auth.js';
import { openMemoryDb, setDbForTest, closeDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';

let server: ReturnType<express.Express['listen']>;
let baseUrl = '';

async function login(password: string, role = 'admin'): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, password }),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(() => {
  const db = openMemoryDb();
  setDbForTest(db);
  migrate(db);
  seed(db);
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => {
  server?.close();
  closeDb();
});

describe('登录防爆破', () => {
  it('教师口令 bcrypt 升级：首次成功登录后存储变为哈希且仍可再登录', async () => {
    const r0 = await login('123456', 'teacher');
    expect(r0.status).toBe(200);
    // 存储已从明文升级为 bcrypt 哈希
    const { getSetting } = await import('../src/db/settings.js');
    const stored = getSetting('teacher_password') ?? '';
    expect(stored).toMatch(/^\$2[aby]\$/);
    // 升级后再登录一次，确认校验走的是哈希路径
    const r2 = await login('123456', 'teacher');
    expect(r2.status).toBe(200);
  });

  it('连续输错触发锁定：锁定期内正确密码也被拒（本用例最后执行以避免污染前一用例）', async () => {
    for (let i = 1; i <= 5; i++) {
      const r = await login('wrong-' + i);
      expect(r.status).toBe(401);
      if (i < 5) expect(r.body.remainingAttempts as number).toBe(5 - i);
    }
    // 第 5 次失败已触发锁定 → 正确密码也应 429
    const locked = await login('correct-horse');
    expect(locked.status).toBe(429);
    expect(String(locked.body.error)).toContain('锁定');
  });
});
