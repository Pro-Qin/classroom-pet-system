import express from 'express';
import bcrypt from 'bcryptjs';
import { loadConfig, updateConfig } from '../config.js';
import { getDb, newId, nowIso } from '../db/connection.js';
import { setSetting, getSetting } from '../db/settings.js';
import { signToken, verifyToken, TEACHER_PASSWORD } from '../middleware.js';
import { getTransport, isValidSupabaseUrl } from './sync.js';
import { runSync } from '../sync/engine.js';

/**
 * 教师口令存取（bcrypt 哈希）：
 *  - 新写入一律 hashSync；读取用 verifyTeacherPassword 比较
 *  - 旧库遗留的明文口令在首次登录成功后自动升级为哈希（无缝迁移）
 */
export function teacherPasswordLooksHash(stored: string): boolean {
  return /^\$2[aby]\$/.test(stored);
}

function verifyTeacherPassword(input: string, stored: string): boolean {
  if (teacherPasswordLooksHash(stored)) return bcrypt.compareSync(input, stored);
  return input === stored;
}

/** 明文 → 哈希一次性升级（登录成功路径调用，幂等） */
function upgradeTeacherPasswordIfNeeded(stored: string): void {
  if (!teacherPasswordLooksHash(stored)) {
    setSetting('teacher_password', bcrypt.hashSync(stored, 10));
    getDb()
      .prepare(`INSERT INTO audit_logs (id, action, detail, created_at) VALUES (?,?,?,?)`)
      .run(newId('aud'), 'TEACHER_PW_MIGRATED', '检测到明文教师口令，已自动升级为 bcrypt 哈希存储', nowIso());
  }
}

/**
 * 登录防爆破（持久化到 settings 表，跨进程/重启不丢）：
 *  - 连续失败 ≥5 次 → 锁定 5 分钟
 *  - 锁定期内直接拒绝并提示剩余秒数；登录成功即清零
 */
const LOCK_THRESHOLD = 5;
const LOCK_MS = 5 * 60_000;
const LOCK_KEY = 'login_locks';

interface LockRec { count: number; lockedUntil: number }

function readLocks(): Record<string, LockRec> {
  try {
    const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(LOCK_KEY) as { value: string } | undefined;
    if (!row) return {};
    const parsed = JSON.parse(row.value) as Record<string, LockRec>;
    const now = Date.now();
    const out: Record<string, LockRec> = {};
    for (const [ip, rec] of Object.entries(parsed)) {
      // 只清理"曾锁定且早已解除"的陈旧记录；未锁定（lockedUntil=0）的计数中记录必须保留
      if (rec.lockedUntil === 0 || rec.lockedUntil > now - LOCK_MS * 2) out[ip] = rec;
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocks(locks: Record<string, LockRec>): void {
  setSetting(LOCK_KEY, JSON.stringify(locks));
}

function lockRemainingSec(ip: string): number {
  const rec = readLocks()[ip];
  if (!rec) return 0;
  const left = rec.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function recordLoginFail(ip: string): number {
  const locks = readLocks();
  const rec = locks[ip] ?? { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= LOCK_THRESHOLD && Date.now() >= rec.lockedUntil) {
    rec.lockedUntil = Date.now() + LOCK_MS; // 达到阈值再次失败 → 触发/续期锁定
    rec.count = 0;
  }
  locks[ip] = rec;
  writeLocks(locks);
  return Math.max(0, LOCK_THRESHOLD - rec.count);
}

function clearLoginFails(ip: string): void {
  const locks = readLocks();
  if (locks[ip] !== undefined) {
    delete locks[ip];
    writeLocks(locks);
  }
}

export function registerAuthRoutes(app: express.Express): void {
  // 首次运行：欢迎向导保存配置 + 设置管理员密码（bcrypt 哈希，绝不明文）
  app.post('/api/auth/setup', async (req, res) => {
    const body = (req.body ?? {}) as {
      adminPassword?: string;
      adminName?: string;
      supabaseUrl?: string;
      supabaseAnonKey?: string;
      supabaseServiceKey?: string;
      giteeRepo?: string;
      giteeEnabled?: boolean;
        teacherPassword?: string;
        activeSubject?: string;
        subjects?: unknown;
    };
    // 安全：系统已初始化后，重设管理员密码/配置必须持有管理员 token（防局域网任意重置）
    const cfg = loadConfig();
    if (cfg.adminPasswordHash) {
      const h = req.headers.authorization ?? '';
      const token = h.startsWith('Bearer ') ? h.slice(7) : '';
      const session = token ? verifyToken(token) : null;
      if (!session || session.role !== 'admin') {
        res.status(403).json({ error: '系统已初始化，请使用管理员身份登录后修改' });
        return;
      }
    } else {
      // 首次运行：只允许本机（一体机/服务器本身）执行向导，防局域网抢先 claim
      const ip = req.ip ?? '';
      const local =
        ip === '::1' || ip === '::ffff:127.0.0.1' || ip === '127.0.0.1' || ip === 'localhost' || ip === '';
      if (!local) {
        res.status(403).json({ error: '首次配置仅允许在服务器本机执行' });
        return;
      }
    }
    const pw = String(body.adminPassword ?? '');
    if (pw.length < 4) {
      res.status(400).json({ error: '管理员密码至少需要 4 位' });
      return;
    }
    const hash = bcrypt.hashSync(pw, 10);
    const patch: Parameters<typeof updateConfig>[0] = { adminPasswordHash: hash };
    if (body.supabaseUrl !== undefined) {
      const url = String(body.supabaseUrl).trim();
      if (url && !isValidSupabaseUrl(url)) {
        res.status(400).json({ error: 'Supabase 地址无效：必须为 https://xxx.supabase.co' });
        return;
      }
      patch.supabaseUrl = url;
    }
    if (body.supabaseAnonKey !== undefined) patch.supabaseAnonKey = String(body.supabaseAnonKey).trim();
    if (body.supabaseServiceKey !== undefined)
      patch.supabaseServiceKey = String(body.supabaseServiceKey).trim();
    if (body.giteeRepo !== undefined) patch.giteeRepo = String(body.giteeRepo).trim();
    if (body.giteeEnabled !== undefined) patch.giteeEnabled = !!body.giteeEnabled;
    updateConfig(patch);

    setSetting('first_run_done', '1');
    setSetting('admin_name', String(body.adminName ?? '').trim() || '管理员');
    if (body.teacherPassword !== undefined) {
      const teacherPw = String(body.teacherPassword).trim() || '123456';
      if (teacherPw.length < 4) {
        res.status(400).json({ error: '教师口令至少需要 4 位' });
        return;
      }
      setSetting('teacher_password', bcrypt.hashSync(teacherPw, 10));
    }
  if (body.subjects !== undefined && Array.isArray(body.subjects)) {
    setSetting('subjects_config', JSON.stringify(body.subjects));
  }
  if (body.activeSubject !== undefined) setSetting('active_subject', String(body.activeSubject).trim());
    getDb()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('first_run_done','1',?) 
         ON CONFLICT(key) DO UPDATE SET value='1', updated_at=excluded.updated_at`
      )
      .run(new Date().toISOString());

    // 云端已有数据 → 首次即拉取同步
    let synced = false;
    try {
      const result = await runSync(getTransport());
      synced = result.completed;
    } catch {
      synced = false;
    }
    res.json({ ok: true, firstRunDone: true, synced });
  });

  app.post('/api/auth/login', (req, res) => {
    const { role, password } = (req.body ?? {}) as { role?: string; password?: string };
    const ip = req.ip ?? 'unknown';
    const locked = lockRemainingSec(ip);
    if (locked > 0) {
      res.status(429).json({ error: `失败次数过多，已临时锁定，请 ${locked} 秒后再试`, lockedSec: locked });
      return;
    }
    if (role !== 'teacher' && role !== 'admin') {
      res.status(400).json({ error: '不支持的登录类型' });
      return;
    }
    if (role === 'teacher') {
        const stored = getSetting('teacher_password') ?? TEACHER_PASSWORD;
        if (!password || !verifyTeacherPassword(password, stored)) {
        const remainTries = recordLoginFail(ip);
        res.status(401).json({
          error: remainTries > 0 ? `教师口令错误（还可尝试 ${remainTries} 次）` : '教师口令错误，账号已临时锁定 5 分钟',
          remainingAttempts: remainTries,
        });
        return;
      }
      clearLoginFails(ip);
      upgradeTeacherPasswordIfNeeded(stored); // 明文 → 哈希无缝升级
      res.json({ token: signToken('teacher'), role: 'teacher', name: '教师' });
      return;
    }
    // admin：密码为 bcrypt 哈希（向导中设置）
    const db = getDb();
    const cfg = loadConfig();
    if (!cfg.adminPasswordHash) {
      res.status(409).json({ error: '管理员密码尚未初始化，请先完成首次配置' });
      return;
    }
    // 应急口令 114514：可在管理端开关；使用时记录审计日志
    const emergencyEnabled = getSetting('emergency_pw_enabled') !== '0';
    const usedEmergency = password === '114514';
    const ok = (emergencyEnabled && usedEmergency) || bcrypt.compareSync(password ?? '', cfg.adminPasswordHash);
    if (!ok) {
      recordLoginFail(ip);
      const recNow = readLocks()[ip];
      const remainTries = recNow && Date.now() < recNow.lockedUntil ? 0 : Math.max(0, LOCK_THRESHOLD - (recNow?.count ?? 0));
      res.status(401).json({
        error: remainTries > 0 ? `管理员密码错误（还可尝试 ${remainTries} 次）` : '管理员密码错误，账号已临时锁定 5 分钟',
        remainingAttempts: remainTries,
      });
      return;
    }
    clearLoginFails(ip);
    if (usedEmergency && emergencyEnabled) {
      db.prepare(
        `INSERT INTO audit_logs (id, action, detail, created_at) VALUES (?,?,?,?)`
      ).run(newId('aud'), 'EMERGENCY_LOGIN', '管理员使用应急口令 114514 登录', nowIso());
    }
    const nameRow = db
      .prepare(`SELECT value FROM settings WHERE key = 'admin_name'`)
      .get() as { value: string } | undefined;
    res.json({ token: signToken('admin'), role: 'admin', name: nameRow?.value ?? '管理员' });
  });

  // 登录后可查看当前身份
  app.get('/api/auth/me', (req, res) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const session = token ? verifyToken(token) : null;
    if (!session) {
      res.status(401).json({ error: '未登录' });
      return;
    }
    res.json({ role: session.role });
  });
}
