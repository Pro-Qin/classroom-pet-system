import express from 'express';
import type { Request, RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { getDb, newId, nowIso } from '../db/connection.js';
import { setSetting, getSetting } from '../db/settings.js';
import { loadConfig, updateConfig, UPLOAD_DIR, BACKUP_DIR, DEFAULT_GITEE_REPO, APP_VERSION } from '../config.js';
import { requireRole, verifyToken, TEACHER_PASSWORD } from '../middleware.js';
import { adoptPet, getExpThresholds, setPetAvatar, type PetRow } from '../services/pets.js';
import { isValidSupabaseUrl } from './sync.js';
import { exportConfig, importConfig, CATEGORIES } from '../services/configTransfer.js';
import { uploadAvatarToCloud } from '../services/storage.js';
import { isValidImageFile } from '../utils/upload.js';
import { seed } from '../db/seed.js';
import { getActiveSubject, getSubjectsConfig, saveSubjectsConfig, setActiveSubject } from '../services/subjects.js';
import * as XLSX from 'xlsx';
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

  // ---------- 前端错误上报（公开接口，供一体机远程排查） ----------
  app.post('/api/errors/report', (req, res) => {
    const { level, message, source, stack, url, info } = (req.body ?? {}) as {
      level?: string; message?: string; source?: string; stack?: string; url?: string; info?: unknown;
    };
    if (!message) {
      res.status(400).json({ error: '错误信息不能为空' });
      return;
    }
    const now = nowIso();
    db().prepare(
      `INSERT INTO error_reports (id, level, message, source, stack, url, info, created_at) VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      newId('err'),
      String(level ?? 'error').slice(0, 20),
      String(message).slice(0, 1000),
      String(source ?? '').slice(0, 200),
      String(stack ?? '').slice(0, 4000),
      String(url ?? '').slice(0, 500),
      JSON.stringify(info ?? {}).slice(0, 4000),
      now
    );
    res.json({ ok: true });
  });
  app.get('/api/admin/errors', auth, adminOnly, (_req, res) => {
    res.json({ errors: db().prepare(`SELECT * FROM error_reports ORDER BY created_at DESC LIMIT 100`).all() });
  });
  app.delete('/api/admin/errors', auth, adminOnly, (_req, res) => {
    db().prepare(`DELETE FROM error_reports`).run();
    res.json({ ok: true });
  });
  // ---------- 快捷理由 CRUD ----------
  app.get('/api/admin/presets', auth, adminOnly, (_req, res) => {
    res.json({ presets: db().prepare(`SELECT * FROM quick_presets WHERE deleted_at IS NULL ORDER BY sort`).all() });
  });
  app.post('/api/admin/presets', auth, adminOnly, (req, res) => {
    const { label, delta, reason } = (req.body ?? {}) as { label?: string; delta?: number; reason?: string };
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
  app.post('/api/admin/species/:id/avatar', auth, adminOnly, upload.single('file'), async (req, res) => {
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
    // 头像上云：云端可用则存公开 URL（多设备同步可见），否则回退本地路径
    const cloudUrl = await uploadAvatarToCloud(req.file.path);
    const stored = cloudUrl ?? '/uploads/' + req.file.filename;
    const now = nowIso();
    db()
      .prepare(`UPDATE species SET avatar_path = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(stored, now, req.params.id);
    res.json({ ok: true, url: stored, cloud: !!cloudUrl });
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
    // 同一规则内同属性只允许一条条件（防止"心情>90 与 心情<45"互斥条件并存导致状态判定诡异）
    const condArr = (typeof conditions === 'string' ? (() => { try { return JSON.parse(conditions || '[]'); } catch { return []; } })() : (conditions ?? [])) as { attr?: string }[];
    const seenAttrs = new Set<string>();
    for (const c of condArr) {
      if (c && typeof c.attr === 'string') {
        if (seenAttrs.has(c.attr)) {
          res.status(400).json({ error: `同一规则内「${c.attr}」只能有一条条件` });
          return;
        }
        seenAttrs.add(c.attr);
      }
    }
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
    const { studentNo, name, className, subject, points, petSpeciesId, petName } = (req.body ?? {}) as {
      studentNo?: string; name?: string; className?: string; subject?: string; points?: number;
      petSpeciesId?: string; petName?: string;
    };
    if (!name) {
      res.status(400).json({ error: '姓名必填' });
      return;
    }
    const activeSubject = getActiveSubject();
    const now = nowIso();
    const id = newId('stu');
    try {
      db()
        .prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
        )
        .run(id, String(studentNo ?? '').trim() || null, String(name).trim(), String(className ?? '').trim(), String(subject ?? '').trim() || activeSubject, Math.round(points ?? 0), now, now);
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
    const { studentNo, name, className, subject, points } = (req.body ?? {}) as {
      studentNo?: string; name?: string; className?: string; subject?: string; points?: number;
    };
    const now = nowIso();
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(String(name).trim()); }
      if (className !== undefined) { sets.push('class_name=?'); vals.push(String(className).trim()); }
      if (subject !== undefined) { sets.push('subject=?'); vals.push(String(subject).trim()); }
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

  // CSV / Excel 批量导入学生（文件上传）
  const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post('/api/admin/students/import-file', auth, adminOnly, importUpload.single('file'), (req, res) => {
    if (!req.file || !req.file.buffer) {
      res.status(400).json({ error: '请选择 CSV / Excel 文件' });
      return;
    }
    const activeSubject = getActiveSubject();
    let rows: Record<string, string | number>[] = [];
    const fileExt = (req.file.originalname || '').toLowerCase();
    try {
      if (fileExt.endsWith('.csv')) {
        const csv = req.file.buffer.toString('utf-8');
        const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== '');
        if (lines.length === 0) throw new Error('CSV 为空');
        const header = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
        rows = lines.slice(1).map((line) => {
          const cells = line.split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
          const obj: Record<string, string | number> = {};
          header.forEach((h, idx) => (obj[h] = cells[idx] ?? ''));
          return obj;
        });
      } else {
        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' });
      }
    } catch (e) {
      res.status(400).json({ error: '文件解析失败：' + (e as Error).message });
      return;
    }
    const now = nowIso();
    let added = 0;
    const errors: string[] = [];
    const stmt = db().prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    );
    for (const r of rows) {
      const name = String(r['姓名'] ?? r['name'] ?? '').trim();
      if (!name) {
        errors.push('存在无姓名的学生，已跳过');
        continue;
      }
      const no = String(r['学号'] ?? r['studentNo'] ?? r['student_no'] ?? '').trim();
      const cls = String(r['班级'] ?? r['className'] ?? r['class_name'] ?? '').trim();
      const subj = String(r['科目'] ?? r['subject'] ?? activeSubject).trim();
      const pts = Number(r['初始积分'] ?? r['points'] ?? r['积分'] ?? 0) || 0;
      try {
        stmt.run(newId('stu'), no || null, name, cls, subj, Math.round(pts), now, now);
        added++;
      } catch {
        errors.push(`${name} 导入失败（学号可能重复）`);
      }
    }
    res.json({ ok: true, added, errors, subject: activeSubject });
  });
  app.post('/api/admin/students/import', auth, adminOnly, (req, res) => {
    const { students } = (req.body ?? {}) as {
      students?: { studentNo?: string; name?: string; className?: string; subject?: string; points?: number }[];
    };
    if (!Array.isArray(students) || students.length === 0) {
      res.status(400).json({ error: '请提供学生数组' });
      return;
    }
    const activeSubject = getActiveSubject();
    const now = nowIso();
    let added = 0;
    const errors: string[] = [];
    const stmt = db().prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
    );
    for (const s of students) {
      if (!s.name) {
        errors.push('存在无姓名的学生，已跳过');
        continue;
      }
      try {
        stmt.run(newId('stu'), String(s.studentNo ?? '').trim() || null, String(s.name).trim(), String(s.className ?? '').trim(), String(s.subject ?? '').trim() || activeSubject, s.points ?? 0, now, now);
        added++;
      } catch (e) {
        errors.push(`${s.name} 导入失败（学号可能重复）`);
      }
    }
    res.json({ ok: true, added, errors });
  });

  // 批量上传学生自定义头像：files 与 studentIds 按顺序一一对应
  app.post('/api/admin/students/avatars', auth, adminOnly, upload.array('files', 100), async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    let studentIds: string[] = [];
    try {
      studentIds = JSON.parse((req.body as Record<string, string>).studentIds ?? '[]');
    } catch {
      /* ignore */
    }
    if (files.length === 0 || studentIds.length !== files.length) {
      res.status(400).json({ error: '请选择数量与学生名单一致的图片' });
      return;
    }
    const d = db();
    const okCount: string[] = [];
    const errors: { studentId: string; error: string }[] = [];
    for (let idx = 0; idx < files.length; idx++) {
      const file = files[idx];
      const studentId = studentIds[idx];
      if (!studentId) {
        errors.push({ studentId: '-', error: '缺少学生 ID' });
        continue;
      }
      if (!isValidImageFile(file.path)) {
        try { fs.unlinkSync(file.path); } catch { /* ignore */ }
        errors.push({ studentId, error: '图片文件无效' });
        continue;
      }
      const petRow = d.prepare(`SELECT * FROM pets WHERE student_id = ? AND deleted_at IS NULL`).get(studentId) as PetRow | undefined;
      if (!petRow) {
        try { fs.unlinkSync(file.path); } catch { /* ignore */ }
        errors.push({ studentId, error: '该学生还没有宠物' });
        continue;
      }
      const oldAvatar = petRow.avatar_path;
      const cloudUrl = await uploadAvatarToCloud(file.path);
      setPetAvatar(d, petRow.id, cloudUrl ?? '/uploads/' + file.filename);
      if (!cloudUrl && oldAvatar?.startsWith('/uploads/')) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(oldAvatar))); } catch { /* ignore */ }
      }
      okCount.push(studentId);
    }
    res.json({ ok: true, uploaded: okCount.length, errors });
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
  // 清空全部业务数据（学生/宠物/流水/背包），不恢复演示数据；先生成快照再清空
  app.post('/api/admin/clear-data', auth, adminOnly, (req, res) => {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, 'clear-' + ts + '.db');
    db().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const d = db();
    d.prepare(`DELETE FROM point_events`).run();
    d.prepare(`DELETE FROM item_use_logs`).run();
    d.prepare(`DELETE FROM backpacks`).run();
    d.prepare(`DELETE FROM pets`).run();
    d.prepare(`DELETE FROM students`).run();
    d.prepare(`INSERT INTO audit_logs (id, action, detail, created_at) VALUES (?,?,?,?)`).run(
      newId('aud'),
      'CLEAR_DATA',
      '清空全部业务数据（不恢复演示数据），快照：' + path.basename(file),
      nowIso()
    );
    res.json({ ok: true, message: '已清空学生/宠物/流水/背包（不保留演示数据），快照：' + path.basename(file) });
  });
  // ---------- 统一配置导出 / 导入（分类可选） ----------
  // 说明：旧版散落的 supabase/settings 混合导出已废弃，由 services/configTransfer.ts
  // 统一承载；欢迎向导首次导入走 /api/config/first-import（仅未初始化时开放）。
  app.get('/api/config/catalog', (_req, res) => {
    res.json({ categories: CATEGORIES });
  });

  app.get('/api/admin/config/export', auth, adminOnly, (req, res) => {
    const keys = String(req.query.keys ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter((k) => CATEGORIES.some((c) => c.key === k));
    if (keys.length === 0) {
      res.status(400).json({ error: '请至少选择一个导出类别' });
      return;
    }
    res.json(exportConfig(keys));
  });

  function doImport(req: express.Request, res: express.Response, allowUninitialized: boolean): void {
    const cfg = loadConfig();
    if (!allowUninitialized && cfg.adminPasswordHash) {
      // 管理端入口已由 requireRole 保护，这里兜底欢迎页口的权限边界
    }
    const body = (req.body ?? {}) as { payload?: unknown; categories?: string[] };
    const categories = Array.isArray(body.categories) ? body.categories.filter((k) => typeof k === 'string') : [];
    if (categories.length === 0) {
      res.status(400).json({ error: '请至少选择一个导入类别' });
      return;
    }
    const result = importConfig(body.payload as never, categories);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true, results: result.results });
  }

  /** 欢迎向导专用：仅当系统未初始化（无管理员密码）时允许匿名导入 */
  app.post('/api/config/first-import', (req, res) => {
    if (loadConfig().adminPasswordHash) {
      res.status(403).json({ error: '系统已初始化，请在管理端进行配置导入' });
      return;
    }
    doImport(req, res, true);
  });

  /** 管理端导入（管理员） */
  app.post('/api/config/import', auth, adminOnly, (req, res) => {
    doImport(req, res, false);
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
        cloudBackupRetention: Number(getSetting('cloud_backup_retention')) || 10,
        heartbeatTimeoutSec: loadConfig().heartbeatTimeoutSec || 120,
        autoPullMinutes: loadConfig().autoPullMinutes ?? 10,
        // 教师口令哈希存储后不再回传明文：只告知"是否已自定义"，编辑留空即不修改
        teacherPasswordSet: !!(getSetting('teacher_password') ?? '').match(/^\$2[aby]\$/) || (getSetting('teacher_password') ?? '') !== TEACHER_PASSWORD,
        activeSubject: getSetting('active_subject') ?? '',
        anomalyEffect: getSetting('anomaly_effect') === '1',
        highQuality: getSetting('high_quality') === '1',
        subjects: (() => { try { return JSON.parse(getSetting('subjects_config') ?? '[]'); } catch { return []; } })(),
    });
  });
  app.put('/api/admin/settings', auth, adminOnly, (req, res) => {
      const { pointsUnit, adminName, backupMaxBytes, emergencyPwEnabled, termName, teacherPassword, activeSubject, subjects, cloudBackupRetention, heartbeatTimeoutSec, anomalyEffect, highQuality } = (req.body ?? {}) as {
      pointsUnit?: string; adminName?: string; backupMaxBytes?: number; giteeEnabled?: boolean; giteeRepo?: string;
      emergencyPwEnabled?: boolean; termName?: string; anomalyEffect?: boolean; highQuality?: boolean;
      teacherPassword?: string; activeSubject?: string; subjects?: unknown; cloudBackupRetention?: number; heartbeatTimeoutSec?: number;
    };
    if (pointsUnit !== undefined) setSetting('points_unit', String(pointsUnit).trim() || '积分');
    if (adminName !== undefined) setSetting('admin_name', String(adminName).trim() || '管理员');
    if (emergencyPwEnabled !== undefined) setSetting('emergency_pw_enabled', emergencyPwEnabled ? '1' : '0');
    if (termName !== undefined) setSetting('term_name', String(termName).trim() || '默认学期');
      if (teacherPassword !== undefined) {
        const tp = String(teacherPassword).trim();
        if (tp.length < 4) {
          res.status(400).json({ error: '教师口令至少需要 4 位' });
          return;
        }
        // bcrypt 哈希存储（登录时比对；不强制改密但绝不明文落库）
        setSetting('teacher_password', bcrypt.hashSync(tp, 10));
      }
      if (activeSubject !== undefined) setSetting('active_subject', String(activeSubject).trim());
      if (subjects !== undefined) setSetting('subjects_config', JSON.stringify(subjects));
      if (cloudBackupRetention !== undefined) {
        const n = Math.max(1, Math.min(365, Math.round(Number(cloudBackupRetention) || 10)));
        setSetting('cloud_backup_retention', String(n));
      }
      if (backupMaxBytes !== undefined) {
      const mb = Math.max(1, Math.min(1024 * 1024, Math.round(Number(backupMaxBytes) || 1024)));
      setSetting('backup_max_bytes', String(mb * 1024 * 1024));
    }
    // 后台进程失联超时（秒，默认 120）
    if (heartbeatTimeoutSec !== undefined) {
      const s = Math.max(30, Math.min(3600, Math.round(Number(heartbeatTimeoutSec) || 120)));
      updateConfig({ heartbeatTimeoutSec: s });
    }
    if (anomalyEffect !== undefined) setSetting('anomaly_effect', anomalyEffect ? '1' : '0');
    if (highQuality !== undefined) setSetting('high_quality', highQuality ? '1' : '0');
    // Gitee 更新源为锁定默认值，不接受修改（防被篡改指向恶意源）
    setSetting('gitee_enabled', '1');
    setSetting('gitee_repo', DEFAULT_GITEE_REPO);
    updateConfig({ giteeEnabled: true, giteeRepo: DEFAULT_GITEE_REPO });
    res.json({ ok: true });
  });

  // ---------- 科目隔离与个性化设置 ----------
  app.get('/api/subjects', auth, requireRole(['teacher', 'admin']), (_req, res) => {
    res.json({ activeSubject: getActiveSubject(), subjects: getSubjectsConfig() });
  });
  app.put('/api/subjects', auth, requireRole(['teacher', 'admin']), (req, res) => {
    const { subjects, activeSubject } = (req.body ?? {}) as { subjects?: unknown; activeSubject?: string };
    if (subjects !== undefined) {
      if (!Array.isArray(subjects)) {
        res.status(400).json({ error: 'subjects 必须是数组' });
        return;
      }
      saveSubjectsConfig(subjects as Parameters<typeof saveSubjectsConfig>[0]);
    }
    if (activeSubject !== undefined) setActiveSubject(String(activeSubject).trim());
    res.json({ ok: true, activeSubject: getActiveSubject(), subjects: getSubjectsConfig() });
  });
  app.put('/api/subjects/active', auth, requireRole(['teacher', 'admin']), (req, res) => {
    const { name } = (req.body ?? {}) as { name?: string };
    setActiveSubject(String(name ?? '').trim());
    res.json({ ok: true, activeSubject: getActiveSubject() });
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
