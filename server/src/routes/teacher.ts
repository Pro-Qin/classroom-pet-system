import express from 'express';
import type { Request, RequestHandler } from 'express';
import { getDb, newId, nowIso } from '../db/connection.js';
import { applyPoints, getLeaderboard, getPointHistory } from '../services/points.js';
import { addPetExp, getSpecies, getExpThresholds, DEFAULT_EXP_THRESHOLDS, stageIndex, stageLabelOf, stageLabelsOf, type PetRow } from '../services/pets.js';
import { setSetting, getSetting } from '../db/settings.js';
import { requireRole, type Session } from '../middleware.js';
import { getActiveSubject, subjectFeatureEnabled } from '../services/subjects.js';
import * as XLSX from 'xlsx';

export function registerTeacherRoutes(app: express.Express, auth: RequestHandler): void {
  const teacherOnly = requireRole(['teacher', 'admin']);

  // 修改教师口令（教师或管理员；教师需提供当前口令，管理员可直接设置）
  app.post('/api/teacher/password', auth, teacherOnly, (req, res) => {
    const { oldPassword, newPassword } = (req.body ?? {}) as { oldPassword?: string; newPassword?: string };
    const current = getSetting('teacher_password') ?? '123456';
    const session = (req as Request & { session?: Session }).session;
    if (session?.role !== 'admin' && oldPassword !== current) {
      res.status(401).json({ error: '当前教师口令错误' });
      return;
    }
    const next = String(newPassword ?? '').trim();
    if (next.length < 4) {
      res.status(400).json({ error: '教师口令至少需要 4 位' });
      return;
    }
    setSetting('teacher_password', next);
    getDb().prepare(`INSERT INTO audit_logs (id, action, detail, created_at) VALUES (?,?,?,?)`)
      .run(newId('aud'), 'TEACHER_PASSWORD_CHANGED', `教师口令已由 ${session?.role ?? 'unknown'} 修改`, nowIso());
    res.json({ ok: true });
  });

  // 快捷理由预设（教师/管理端可读）
  app.get('/api/presets', auth, (_req, res) => {
    const rows = getDb()
      .prepare(`SELECT * FROM quick_presets WHERE deleted_at IS NULL ORDER BY sort ASC`)
      .all();
    res.json({ presets: rows });
  });

  // 快捷预设（教师端也可通过 + 快捷添加，无数量上限）
  app.post('/api/presets', auth, teacherOnly, (req, res) => {
    const { label, delta, reason } = (req.body ?? {}) as { label?: string; delta?: number; reason?: string };
    const db = getDb();
    if (!label || !delta) {
      res.status(400).json({ error: '名称与分值必填' });
      return;
    }
    const now = nowIso();
    const id = newId('pre');
    db.prepare(
      `INSERT INTO quick_presets (id, label, delta, reason, editable, sort, created_at, updated_at) VALUES (?,?,?,?,1,(SELECT COALESCE(MAX(sort),0)+1 FROM quick_presets),?,?)`
    ).run(id, String(label).trim(), Math.round(delta), String(reason ?? '').trim(), now, now);
    res.json({ ok: true, id });
  });

  // 删除快捷预设（教师端 + 号面板中顺手删除）
  app.delete('/api/presets/:id', auth, teacherOnly, (req, res) => {
    const now = nowIso();
    const d = getDb()
      .prepare(`UPDATE quick_presets SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(now, now, req.params.id);
    res.json({ ok: d.changes > 0 });
  });

  // 单点/批量加减分：{ studentIds: string[], delta: number, reason: string }
  app.post('/api/points', auth, teacherOnly, (req, res) => {
    const { studentIds, delta, reason } = (req.body ?? {}) as {
      studentIds?: string[];
      delta?: number;
      reason?: string;
    };
      if (!subjectFeatureEnabled('points')) {
        res.status(403).json({ error: '当前科目已禁用积分功能' });
        return;
      }
    const session = (req as Request & { session?: Session }).session;
    try {
      const result = applyPoints(
        getDb(),
        studentIds ?? [],
        delta ?? 0,
        String(reason ?? '').trim(),
        session?.role ?? 'teacher'
      );
      res.json({ ok: true, ...result });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // 排行榜（教师端）
  app.get('/api/leaderboard', auth, (_req, res) => {
    res.json({ rows: getLeaderboard(getDb()) });
  });

  // 积分流水（可按学生过滤）
  app.get('/api/points/history', auth, (req, res) => {
    const sid = req.query.studentId as string | undefined;
    if (!sid) {
      res.status(400).json({ error: '缺少 studentId' });
      return;
    }
    res.json({ history: getPointHistory(getDb(), sid, 200) });
  });

  // 导出全班积分流水为 Excel (.xlsx)
  app.get('/api/teacher/points/xlsx', auth, (req, res) => {
    try {
      const rows = getDb().prepare(`
        SELECT pe.delta, pe.reason, pe.operator, pe.created_at,
               s.name AS student_name, s.class_name, s.points AS current_points
        FROM point_events pe
        JOIN students s ON s.id = pe.student_id
        WHERE pe.deleted_at IS NULL
        ORDER BY pe.created_at DESC
      `).all() as { delta: number; reason: string; operator: string; created_at: string; student_name: string; class_name: string; current_points: number }[];
      const data = rows.map((r) => ({
        学生: r.student_name,
        班级: r.class_name,
        变动: r.delta,
        类型: r.operator === 'student' ? '商店消费' : r.operator === 'admin' ? '管理员' : '教师',
        备注: r.reason || '',
        时间: r.created_at,
        当前积分: r.current_points,
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '积分流水');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="points-${new Date().toISOString().slice(0, 10)}.xlsx"`);
      res.send(Buffer.from(buf));
    } catch (e) {
      res.status(500).json({ error: '导出失败：' + (e as Error).message });
    }
  });

  // 给宠物加经验（教师端也有）
  app.post('/api/pets/:id/exp', auth, teacherOnly, (req, res) => {
    const { amount } = (req.body ?? {}) as { amount?: number };
    const session = (req as Request & { session?: Session }).session;
    const pet = addPetExp(getDb(), req.params.id, Number(amount) || 0, session?.role ?? 'teacher');
    if (!pet) {
      res.status(400).json({ error: '经验值必须为非零数值' });
      return;
    }
    res.json({ ok: true, pet });
  });

  // 宠物等级设置（教师/管理端共用）：列出宠物
  app.get('/api/pets/manage', auth, teacherOnly, (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT p.id, p.student_id, p.species_id, p.name, p.exp, p.avatar_path,
                p.health, p.hungry, p.happy, p.clean,
                s.name AS student_name,
                sp.name AS species_name, sp.emoji AS species_emoji,
                sp.avatar_path AS species_avatar, sp.color_from, sp.color_to, sp.stage_labels
         FROM pets p
         JOIN students s ON s.id = p.student_id AND s.deleted_at IS NULL
         JOIN species sp ON sp.id = p.species_id AND sp.deleted_at IS NULL
         WHERE p.deleted_at IS NULL
         ORDER BY s.name ASC`
      )
      .all() as Record<string, unknown>[];
    const thresholds = getExpThresholds(getDb());
    const list = rows.map((r2) => {
      const species = getSpecies(getDb(), String(r2.species_id));
      const exp = Number(r2.exp ?? 0);
      return {
        ...r2,
        stage: stageIndex(exp, thresholds),
        stageLabel: stageLabelOf(species, exp, thresholds),
        stageLabels: stageLabelsOf(species),
        thresholds,
      };
    });
    res.json({ pets: list });
  });

  // 直接设置宠物等级（0-6 对应 蛋/破壳/幼年/成长/成熟/进化/传说）
  app.post('/api/pets/:id/level', auth, teacherOnly, (req, res) => {
    const { stage } = (req.body ?? {}) as { stage?: number };
    const db = getDb();
    const thresholds = getExpThresholds(db);
    const s = Math.max(0, Math.min(thresholds.length - 1, Math.round(Number(stage) || 0)));
    const now = nowIso();
    const r2 = db
      .prepare(`UPDATE pets SET exp = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
      .run(thresholds[s], now, req.params.id);
    if (r2.changes === 0) {
      res.status(404).json({ error: '宠物不存在' });
      return;
    }
    const pet = db.prepare(`SELECT * FROM pets WHERE id = ?`).get(req.params.id) as unknown as PetRow;
    res.json({ ok: true, pet, stage: s, stageLabel: stageLabelOf(getSpecies(db, pet.species_id), thresholds[s], thresholds), thresholds });
  });

  // 等级经验要求（教师/管理共用：可修改 7 级阈值）
  app.get('/api/exp-thresholds', auth, teacherOnly, (_req, res) => {
    res.json({ thresholds: getExpThresholds(getDb()), defaults: DEFAULT_EXP_THRESHOLDS });
  });
  app.put('/api/exp-thresholds', auth, teacherOnly, (req, res) => {
    const { thresholds } = (req.body ?? {}) as { thresholds?: number[] };
    if (!Array.isArray(thresholds) || thresholds.length !== DEFAULT_EXP_THRESHOLDS.length) {
      res.status(400).json({ error: '需要提供 7 个等级的起始经验值' });
      return;
    }
    if (!thresholds.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      res.status(400).json({ error: '经验值必须为数字' });
      return;
    }
    const arr = thresholds.map((n) => Math.max(0, Math.round(n)));
    arr[0] = 0;
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1]) {
        res.status(400).json({ error: '等级经验要求必须逐级递增' });
        return;
      }
    }
    setSetting('exp_thresholds', JSON.stringify(arr));
    res.json({ ok: true, thresholds: arr });
  });

  // 教师端总览：学生数/总积分/平均分/最高分
  // 教师端积分趋势（最近 30 天，按当前科目）
  app.get('/api/teacher/trend', auth, (_req, res) => {
    const db = getDb();
    const active = getActiveSubject();
    const since = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString();
    const rows = db
      .prepare(
        `SELECT substr(p.created_at,1,10) AS day, COALESCE(SUM(p.delta),0) AS delta
         FROM point_events p
         JOIN students s ON s.id = p.student_id
         WHERE p.deleted_at IS NULL AND s.deleted_at IS NULL
           AND (s.subject = ? OR s.subject = '') AND p.created_at >= ?
         GROUP BY day ORDER BY day ASC`
      )
      .all(active, since) as { day: string; delta: number }[];
    const map = new Map(rows.map((r) => [r.day, r.delta]));
    const trend: { day: string; delta: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 3600 * 1000);
      const key = d.toISOString().slice(0, 10);
      trend.push({ day: key, delta: map.get(key) ?? 0 });
    }
    res.json({ trend });
  });
  app.get('/api/teacher/stats', auth, (_req, res) => {
    const db = getDb();
    const st = db
      .prepare(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(points),0) AS total, COALESCE(AVG(points),0) AS avg, COALESCE(MAX(points),0) AS max
         FROM students WHERE deleted_at IS NULL AND (subject = ? OR subject = '')`
      )
      .get(getActiveSubject()) as { cnt: number; total: number; avg: number; max: number };
    const petCnt = db
      .prepare(`SELECT COUNT(*) AS c FROM pets p JOIN students s ON s.id = p.student_id WHERE p.deleted_at IS NULL AND (s.subject = ? OR s.subject = '')`)
      .get(getActiveSubject()) as { c: number };
    res.json({ ...st, avg: Math.round(st.avg * 10) / 10, pets: petCnt.c });
  });
}
