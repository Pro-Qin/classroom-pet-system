import express from 'express';
import bcrypt from 'bcryptjs';
import { loadConfig, updateConfig } from '../config.js';
import { getDb, newId, nowIso } from '../db/connection.js';
import { setSetting, getSetting } from '../db/settings.js';
import { signToken, verifyToken, TEACHER_PASSWORD } from '../middleware.js';
import { getTransport, isValidSupabaseUrl } from './sync.js';
import { runSync } from '../sync/engine.js';

/** 登录失败限流：每 IP 每分钟最多 10 次失败尝试（防爆破） */
const loginAttempts = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (loginAttempts.get(ip) ?? []).filter((t) => now - t < 60_000);
  loginAttempts.set(ip, arr);
  return arr.length >= 10;
}
function recordFail(ip: string): void {
  const arr = loginAttempts.get(ip) ?? [];
  arr.push(Date.now());
  loginAttempts.set(ip, arr);
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
  const teacherPw = String(body.teacherPassword ?? '').trim() || '123456';
  if (teacherPw.length < 4) {
    res.status(400).json({ error: '教师口令至少需要 4 位' });
    return;
  }
  setSetting('teacher_password', teacherPw);
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
    if (rateLimited(ip)) {
      res.status(429).json({ error: '尝试过于频繁，请稍后再试' });
      return;
    }
    if (role !== 'teacher' && role !== 'admin') {
      res.status(400).json({ error: '不支持的登录类型' });
      return;
    }
    if (role === 'teacher') {
        const teacherPw = getSetting('teacher_password') ?? TEACHER_PASSWORD;
        if (password !== teacherPw) {
        res.status(401).json({ error: '教师口令错误' });
        return;
      }
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
      recordFail(ip);
      res.status(401).json({ error: '管理员密码错误' });
      return;
    }
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
