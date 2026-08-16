import express from 'express';
import type { Request, RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { getDb, newId, nowIso } from '../db/connection.js';
import { setSetting, getSetting } from '../db/settings.js';
import { updateConfig, UPLOAD_DIR, BACKUP_DIR, DEFAULT_GITEE_REPO, APP_VERSION } from '../config.js';
import { requireRole, verifyToken } from '../middleware.js';
import { adoptPet, getExpThresholds } from '../services/pets.js';
import { isValidSupabaseUrl } from './sync.js';
import { isValidImageFile } from '../utils/upload.js';
import { seed } from '../db/seed.js';

/** 通用软删除 */
function softDelete(db: ReturnType<typeof getDb>, table: string, id: string): boolean {
  const now = nowIso();
  const r = db
    .prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
    .run(now, now, id);
  return r.changes > 0;
}

export function registerAdminRoutes(app: express.Express, auth: RequestHandler): void {
  const adminOnly = requireRole(['admin']);
  const db = () => getDb();

  // ---------- 快捷理由 CRUD ----------
  app.get('/api/admin/presets', auth, adminOnly, (_req, res) => {
    res.json({ presets: db().prepare(`SELECT * FROM quick_presets WHERE deleted_at IS NULL ORDER BY sort`).all() });
  });
  app.post('/api/admin/presets', auth, adminOnly, (req, res) => {
    const { label, delta, reason } = (req.body ?? {}) as { label?: string; delta?: number; reason?: string };
    const count = (db().prepare(`SELECT COUNT(*) AS c FROM quick_presets WHERE deleted_at IS NULL`).get() as { c: number }).c;
    if (count >= 5) {
      res.status(400).json({ error: '快捷预设最多保留 5 个，请先删除不需要的预设' });
      return;
    }
    if (!label || !delta) {
      res.status(400).json({ error: '名称与分值必填' });
      return;
    }
    const now = nowIso();
    const id = newId('pre');
    db()
      .prepare(
        `INSERT INTO quick_presets (id, label, delta, reason, editable, sort, created_at, updated_at) VALUES (?,?,?,?,1,(SELECT COALESCE(MAX(sort),0)+1 FROM quick_presets),?,?)`
      )
      .run(id, String(label).trim(), Math.round(delta), String(reason ?? '').trim(), now, now);
    res.json({ ok: true, id });
  });
  app.put('/api/admin/presets/:id', auth, adminOnly, (req, res) => {
    const { label, delta, reason, sort } = (req.body ?? {}) as { label?: string; delta?: number; reason?: string; sort?: number };
    const now = nowIso();
    const stmt = db().prepare(
      `UPDATE quick_presets SET label=?, delta=?, reason=?, sort=?, updated_at=? WHERE id=? AND deleted_at IS NULL`
    );
    stmt.run(
      String(label ?? '').trim(),
      delta !== undefined && delta !== null ? Math.round(delta) : 0,
      String(reason ?? '').trim(),
      sort ?? 0,
      now,
      req.params.id
    );
    res.json({ ok: true });
  });
  app.delete('/api/admin/presets/:id', auth, adminOnly, (req, res) => {
    res.json({ ok: softDelete(db(), 'quick_presets', req.params.id) });
  });

  // ---------- 宠物种类 CRUD ----------
  app.get('/api/admin/species', auth, adminOnly, (_req, res) => {
    res.json({ species: db().prepare(`SELECT * FROM species WHERE deleted_at IS NULL ORDER BY sort`).all() });
  });
  app.post('/api/admin/species', auth, adminOnly, (req, res) => {
    const { id, name, emoji, colorFrom, colorTo, stageLabels, sort } = (req.body ?? {}) as {
      id?: string; name?: string; emoji?: string; colorFrom?: string; colorTo?: string;
      stageLabels?: string[]; sort?: number;
    };
    if (!id || !name) {
      res.status(400).json({ error: 'id 与名称必填' });
      return;
    }
    const now = nowIso();
    try {
      db()
        .prepare(
          `INSERT INTO species (id, name, emoji, color_from, color_to, stage_labels, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
        )
        .run(
          id, String(name).trim(), emoji ?? '🐣', colorFrom ?? '#6366f1', colorTo ?? '#8b5cf6',
          JSON.stringify(stageLabels ?? ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说']),
          sort ?? 0, now, now
        );
    } catch (e) {
      res.status(409).json({ error: `种类 id 已存在：${id}` });
      return;
    }
    res.json({ ok: true });
  });
  app.put('/api/admin/species/:id', auth, adminOnly, (req, res) => {
    const { name, emoji, colorFrom, colorTo, stageLabels, sort } = (req.body ?? {}) as {
      name?: string; emoji?: string; colorFrom?: string; colorTo?: string; stageLabels?: string[]; sort?: number;
    };
    const now = nowIso();
    db()
      .prepare(
        `UPDATE species SET name=?, emoji=?, color_from=?, color_to=?, stage_labels=?, sort=?, updated_at=? WHERE id=?`
      )
      .run(
        String(name ?? '').trim(), emoji ?? '', colorFrom ?? '#6366f1', colorTo ?? '#8b5cf6',
        JSON.stringify(stageLabels ?? ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说']),
        sort ?? 0, now, req.params.id
      );
    res.json({ ok: true });
  });
  app.delete('/api/admin/species/:id', auth, adminOnly, (req, res) => {
    res.json({ ok: softDelete(db(), 'species', req.params.id) });
  });


  // ---------- 宠物种类头像上传（管理员） ----------
  const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const raw = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_EXTS.has(raw) ? raw : '.png';
      cb(null, 'species-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + ext);
    },
  });
  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIMES.has(file.mimetype)) cb(null, true);
      else cb(new Error('仅支持图片文件（png/jpg/gif/webp）'));
    },
  });
  app.post('/api/admin/species/:id/avatar', auth, adminOnly, upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: '缺少图片文件' });
      return;
    }
    if (!isValidImageFile(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: '图片文件无效（文件头校验失败），请重新选择图片' });
      return;
    }
    const now = nowIso();
    db()
      .prepare(`UPDATE species SET avatar_path = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run('/uploads/' + req.file.filename, now, req.params.id);
    res.json({ ok: true, url: '/uploads/' + req.file.filename });
  });

  // ---------- 道具 CRUD ----------
  app.get('/api/admin/items', auth, requireRole(['admin', 'teacher']), (_req, res) => {
    // 按 id 去重（历史数据可能残留重复商品）
    const seen = new Set<string>();
    const items = (db().prepare(`SELECT * FROM items WHERE deleted_at IS NULL ORDER BY sort`).all() as { id: string }[]).filter(
      (i) => (seen.has(i.id) ? false : (seen.add(i.id), true))
    );
    res.json({ items });
  });
  app.post('/api/admin/items', auth, requireRole(['admin', 'teacher']), (req, res) => {
    const { id, name, icon, type, cost, effect, desc, sort } = (req.body ?? {}) as {
      id?: string; name?: string; icon?: string; type?: string; cost?: number;
      effect?: Record<string, number>; desc?: string; sort?: number;
    };
    if (!id || !name) {
      res.status(400).json({ error: 'id 与名称必填' });
      return;
    }
    const now = nowIso();
    try {
      db()
        .prepare(
          `INSERT INTO items (id, name, icon, type, cost, effect, desc, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
        )
        .run(id, String(name).trim(), icon ?? '', type ?? 'food', cost ?? 0, JSON.stringify(effect ?? {}), desc ?? '', sort ?? 0, now, now);
    } catch (e) {
      res.status(409).json({ error: `道具 id 已存在：${id}` });
      return;
    }
    res.json({ ok: true });
  });
  app.put('/api/admin/items/:id', auth, requireRole(['admin', 'teacher']), (req, res) => {
    const { name, icon, type, cost, effect, desc, sort } = (req.body ?? {}) as {
      name?: string; icon?: string; type?: string; cost?: number; effect?: Record<string, number>; desc?: string; sort?: number;
    };
    const now = nowIso();
    db()
      .prepare(`UPDATE items SET name=?, icon=?, type=?, cost=?, effect=?, desc=?, sort=?, updated_at=? WHERE id=?`)
      .run(
        String(name ?? '').trim(), icon ?? '', type ?? 'food', cost ?? 0,
        JSON.stringify(effect ?? {}), desc ?? '', sort ?? 0, now, req.params.id
      );
    res.json({ ok: true });
  });
  app.delete('/api/admin/items/:id', auth, requireRole(['admin', 'teacher']), (req, res) => {
    res.json({ ok: softDelete(db(), 'items', req.params.id) });
  });

  // ---------- 状态规则 CRUD ----------
  app.get('/api/admin/state-rules', auth, requireRole(['admin', 'teacher']), (_req, res) => {
    res.json({ rules: db().prepare(`SELECT * FROM state_rules WHERE deleted_at IS NULL ORDER BY sort`).all() });
  });
  app.put('/api/admin/state-rules/:id', auth, requireRole(['admin', 'teacher']), (req, res) => {
    const { label, conditions, icon, color, sort } = (req.body ?? {}) as {
      label?: string; conditions?: unknown; icon?: string; color?: string; sort?: number;
    };
    const now = nowIso();
    db()
      .prepare(
        `UPDATE state_rules SET label=?, conditions=?, icon=?, color=?, sort=?, updated_at=? WHERE id=?`
      )
      .run(
        String(label ?? '').trim(),
        typeof conditions === 'string' ? conditions : JSON.stringify(conditions ?? []),
        icon ?? '', color ?? '#94a3b8', sort ?? 0, now, req.params.id
      );
    res.json({ ok: true });
  });

  // ---------- 学生管理 ----------
  app.get('/api/admin/students', auth, adminOnly, (_req, res) => {
    res.json({
      students: db()
        .prepare(`SELECT * FROM students WHERE deleted_at IS NULL ORDER BY class_name, student_no`)
        .all(),
    });
  });
  // 新增学生（可选同时领养宠物）
  app.post('/api/admin/students', auth, adminOnly, (req, res) => {
    const { studentNo, name, className, points, petSpeciesId, petName } = (req.body ?? {}) as {
      studentNo?: string; name?: string; className?: string; points?: number;
      petSpeciesId?: string; petName?: string;
    };
    if (!name) {
      res.status(400).json({ error: '姓名必填' });
      return;
    }
    const now = nowIso();
    const id = newId('stu');
    try {
      db()
        .prepare(
          `INSERT INTO students (id, student_no, name, class_name, points, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
        )
        .run(id, String(studentNo ?? '').trim() || null, String(name).trim(), String(className ?? '').trim(), Math.round(points ?? 0), now, now);
    } catch (e) {
      res.status(409).json({ error: `添加失败：${(e as Error).message.includes('UNIQUE') ? '学号已存在' : (e as Error).message}` });
      return;
    }
    let petId: string | null = null;
    if (petSpeciesId) {
      const pet = adoptPet(db(), id, petSpeciesId, petName ?? '');
      petId = pet?.id ?? null;
    }
    res.json({ ok: true, id, petId });
  });
  app.put('/api/admin/students/:id', auth, adminOnly, (req, res) => {
    const { studentNo, name, className, points } = (req.body ?? {}) as {
      studentNo?: string; name?: string; className?: string; points?: number;
    };
    const now = nowIso();
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(String(name).trim()); }
    if (className !== undefined) { sets.push('class_name=?'); vals.push(String(className).trim()); }
    if (studentNo !== undefined) { sets.push('student_no=?'); vals.push(String(studentNo).trim() || null); }
    if (points !== undefined) { sets.push('points=?'); vals.push(Math.round(points)); }
    if (sets.length === 0) {
      res.status(400).json({ error: '没有需要更新的字段' });
      return;
    }
    sets.push('updated_at=?');
    vals.push(now, req.params.id);
    db().prepare(`UPDATE students SET ${sets.join(',')} WHERE id=?`).run(...vals);
    res.json({ ok: true });
  });
  app.delete('/api/admin/students/:id', auth, adminOnly, (req, res) => {
    res.json({ ok: softDelete(db(), 'students', req.params.id) });
  });

  // 批量导入学生：[{ studentNo, name, className, points }]
  app.post('/api/admin/students/import', auth, adminOnly, (req, res) => {
    const { students } = (req.body ?? {}) as {
      students?: { studentNo?: string; name?: string; className?: string; points?: number }[];
    };
    if (!Array.isArray(students) || students.length === 0) {
      res.status(400).json({ error: '请提供学生数组' });
      return;
    }
    const now = nowIso();
    let added = 0;
    const errors: string[] = [];
    const stmt = db().prepare(
      `INSERT INTO students (id, student_no, name, class_name, points, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    );
    for (const s of students) {
      if (!s.name) {
        errors.push('存在无姓名的学生，已跳过');
        continue;
      }
      try {
        stmt.run(newId('stu'), String(s.studentNo ?? '').trim() || null, String(s.name).trim(), String(s.className ?? '').trim(), s.points ?? 0, now, now);
        added++;
      } catch (e) {
        errors.push(`${s.name} 导入失败（学号可能重复）`);
      }
    }
    res.json({ ok: true, added, errors });
  });


  // ---------- 重置所有业务数据（管理员） ----------
  app.post('/api/admin/reset', auth, adminOnly, (_req, res) => {
    const d = db();
    const now = nowIso();
    // 先清子表，再清主表（无外键约束但保持顺序）
    d.prepare(`DELETE FROM point_events`).run();
    d.prepare(`DELETE FROM item_use_logs`).run();
    d.prepare(`DELETE FROM backpacks`).run();
    d.prepare(`DELETE FROM pets`).run();
    d.prepare(`DELETE FROM students`).run();
    d.prepare(`DELETE FROM tombstones`).run();
    // 恢复演示数据（重新 seed 演示学生/宠物）
    d.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('demo_seeded','0',?)`).run(now);
    seed(d);
    res.json({ ok: true, message: '已清空学生/宠物/流水/背包并恢复演示数据' });
  });

  // ---------- 审计日志 / 数据导出 / 学期归档 ----------
  app.get('/api/admin/audit', auth, adminOnly, (_req, res) => {
    res.json({ logs: db().prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100`).all() });
  });

  app.get('/api/admin/data/export', auth, adminOnly, (_req, res) => {
    const d = db();
    const dump = (t: string) => d.prepare(`SELECT * FROM ${t}`).all();
    res.json({
      exportedAt: nowIso(),
      students: dump('students'),
      pets: dump('pets'),
      backpacks: dump('backpacks'),
      pointEvents: dump('point_events'),
      itemUseLogs: dump('item_use_logs'),
      species: dump('species'),
      items: dump('items'),
      stateRules: dump('state_rules'),
      quickPresets: dump('quick_presets'),
    });
  });

  // 多学期归档：生成带学期名的独立快照，随后清空业务数据开始新学期（演示数据不自动恢复）
  app.post('/api/admin/archive', auth, adminOnly, (req, res) => {
    const { termName } = (req.body ?? {}) as { termName?: string };
    const label = String(termName ?? '').trim() || '默认学期';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safe = label.replace(/[\\/:*?"<>|]/g, '_');
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, 'term-' + safe + '-' + ts + '.db');
    db().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    // 清空业务数据
    const d = db();
    d.prepare(`DELETE FROM point_events`).run();
    d.prepare(`DELETE FROM item_use_logs`).run();
    d.prepare(`DELETE FROM backpacks`).run();
    d.prepare(`DELETE FROM pets`).run();
    d.prepare(`DELETE FROM students`).run();
    setSetting('term_name', label);
    d.prepare(`INSERT INTO audit_logs (id, action, detail, created_at) VALUES (?,?,?,?)`).run(
      newId('aud'),
      'TERM_ARCHIVE',
      '归档学期「' + label + '」并清空业务数据，快照：' + path.basename(file),
      nowIso()
    );
    res.json({ ok: true, message: '已归档「' + label + '」并开始新学期', backupFile: path.basename(file) });
  });

  // ---------- 配置导出 / 导入（管理员；便于便携迁移，密钥不入源码） ----------
  app.get('/api/admin/config/export', auth, adminOnly, (_req, res) => {
    const cfg = loadConfig();
    res.json({
      meta: { exportedAt: nowIso(), appVersion: APP_VERSION, tool: 'classroom-pet-system' },
      supabase: { url: cfg.supabaseUrl, anonKey: cfg.supabaseAnonKey, serviceKey: cfg.supabaseServiceKey },
      gitee: { repo: DEFAULT_GITEE_REPO, enabled: true },
      settings: {
        pointsUnit: getSetting('points_unit') ?? '积分',
        adminName: getSetting('admin_name') ?? '管理员',
        backupMaxBytes: Number(getSetting('backup_max_bytes')) || 1073741824,
        expThresholds: getExpThresholds(getDb()),
      },
    });
  });
  app.post('/api/admin/config/import', auth, adminOnly, (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const supabase = (body.supabase ?? {}) as Record<string, unknown>;
    const settings = (body.settings ?? {}) as Record<string, unknown>;
    const patch: Parameters<typeof updateConfig>[0] = {};
    if (typeof supabase.url === 'string') {
      const url = supabase.url.trim();
      if (url && !isValidSupabaseUrl(url)) {
        res.status(400).json({ error: 'Supabase 地址无效：必须为 https://xxx.supabase.co' });
        return;
      }
      patch.supabaseUrl = url;
    }
    if (typeof supabase.anonKey === 'string') patch.supabaseAnonKey = supabase.anonKey.trim();
    if (typeof supabase.serviceKey === 'string') patch.supabaseServiceKey = supabase.serviceKey.trim();
    updateConfig(patch);
    if (typeof settings.pointsUnit === 'string') setSetting('points_unit', settings.pointsUnit.trim() || '积分');
    if (typeof settings.adminName === 'string') setSetting('admin_name', settings.adminName.trim() || '管理员');
    if (typeof settings.backupMaxBytes === 'number' && Number.isFinite(settings.backupMaxBytes)) {
      setSetting('backup_max_bytes', String(Math.max(1, Math.round(settings.backupMaxBytes))));
    }
    if (Array.isArray(settings.expThresholds)) {
      const arr = settings.expThresholds as unknown[];
      if (arr.length === 7 && arr.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        const clean = arr.map((x) => Math.max(0, Math.round(x as number)));
        clean[0] = 0;
        setSetting('exp_thresholds', JSON.stringify(clean));
      }
    }
    res.json({ ok: true, message: '配置已导入' });
  });

  // ---------- 系统设置 ----------
  // GET 公开：仅返回展示类配置（积分单位名/管理员名/Gitee 启用状态），
  // 供登录前页面（学生详情/登录页）显示，避免未登录 401 控制台噪音；
  // giteeRepo 地址（可能含凭据）仅管理员可见；写操作（PUT）保持管理员专属。
  app.get('/api/admin/settings', (req, res) => {
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    const session = token ? verifyToken(token) : null;
    res.json({
      pointsUnit: getSetting('points_unit') ?? '积分',
      adminName: getSetting('admin_name') ?? '管理员',
      giteeEnabled: getSetting('gitee_enabled') === '1',
      giteeRepo: DEFAULT_GITEE_REPO,
      backupMaxMB: Math.round((Number(getSetting('backup_max_bytes')) || 1073741824) / 1024 / 1024),
      emergencyPwEnabled: getSetting('emergency_pw_enabled') !== '0',
      termName: getSetting('term_name') ?? '默认学期',
    });
  });
  app.put('/api/admin/settings', auth, adminOnly, (req, res) => {
    const { pointsUnit, adminName, backupMaxBytes, emergencyPwEnabled, termName } = (req.body ?? {}) as {
      pointsUnit?: string; adminName?: string; backupMaxBytes?: number; giteeEnabled?: boolean; giteeRepo?: string;
      emergencyPwEnabled?: boolean; termName?: string;
    };
    if (pointsUnit !== undefined) setSetting('points_unit', String(pointsUnit).trim() || '积分');
    if (adminName !== undefined) setSetting('admin_name', String(adminName).trim() || '管理员');
    if (emergencyPwEnabled !== undefined) setSetting('emergency_pw_enabled', emergencyPwEnabled ? '1' : '0');
    if (termName !== undefined) setSetting('term_name', String(termName).trim() || '默认学期');
    if (backupMaxBytes !== undefined) {
      const mb = Math.max(1, Math.min(1024 * 1024, Math.round(Number(backupMaxBytes) || 1024)));
      setSetting('backup_max_bytes', String(mb * 1024 * 1024));
    }
    // Gitee 更新源为锁定默认值，不接受修改（防被篡改指向恶意源）
    setSetting('gitee_enabled', '1');
    setSetting('gitee_repo', DEFAULT_GITEE_REPO);
    updateConfig({ giteeEnabled: true, giteeRepo: DEFAULT_GITEE_REPO });
    res.json({ ok: true });
  });

  // 修改管理员密码（需旧密码校验）
  app.post('/api/admin/password', auth, adminOnly, (req, res) => {
    const { oldPassword, newPassword } = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    const currentHash = loadConfig().adminPasswordHash;
    if (!currentHash) {
      res.status(409).json({ error: '管理员密码未初始化' });
      return;
    }
    if (!bcrypt.compareSync(oldPassword ?? '', currentHash)) {
      res.status(401).json({ error: '旧密码错误' });
      return;
    }
    if (!newPassword || newPassword.length < 4) {
      res.status(400).json({ error: '新密码至少 4 位' });
      return;
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    updateConfig({ adminPasswordHash: hash });
    res.json({ ok: true });
  });
}

import { loadConfig } from '../config.js';