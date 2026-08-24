import express from 'express';
import type { RequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { getDb, newId, nowIso } from '../db/connection.js';
import { UPLOAD_DIR } from '../config.js';
import {
  getSpecies,
  getExpThresholds,
  stageLabelOf,
  stageLabelsOf,
  stageIndex,
  computeState,
  tickPet,
  useItem,
  buyItem,
  adoptPet,
  renamePet,
  setPetAvatar,
  type PetRow,
} from '../services/pets.js';
import { getPointHistory, type LeaderboardRow } from '../services/points.js';
import { isValidImageFile } from '../utils/upload.js';
import { getActiveSubject } from '../services/subjects.js';

/** 学生列表卡片（登录页/学生系统共用），公开访问 */
function listStudents(db: ReturnType<typeof getDb>) {
  const rows = db
    .prepare(
      `SELECT s.id, s.student_no, s.name, s.class_name, s.points,
              p.id AS pet_id, p.name AS pet_name, p.exp AS pet_exp,
              sp.emoji AS pet_emoji, sp.color_from, sp.color_to, sp.stage_labels AS species_stage_labels
       FROM students s
       LEFT JOIN pets p ON p.student_id = s.id AND p.deleted_at IS NULL
       LEFT JOIN species sp ON sp.id = p.species_id
        WHERE s.deleted_at IS NULL AND (s.subject = ? OR s.subject = '')
       ORDER BY s.class_name ASC, s.student_no ASC`
    )
    .all(getActiveSubject()) as unknown as {
    id: string;
    student_no: string;
    name: string;
    class_name: string;
    points: number;
    pet_id: string | null;
    pet_name: string | null;
    pet_exp: number | null;
    pet_emoji: string | null;
    color_from: string | null;
    color_to: string | null;
    species_stage_labels: string | null;
  }[];
  const thresholds = getExpThresholds(db);
  return rows.map((r) => {
    const speciesLike = { stage_labels: r.species_stage_labels ?? '[]' } as Parameters<typeof stageLabelOf>[0];
    const stage = stageIndex(r.pet_exp ?? 0, thresholds);
    return {
      id: r.id,
      student_no: r.student_no,
      name: r.name,
      class_name: r.class_name,
      points: r.points,
      petId: r.pet_id,
      petName: r.pet_name,
      petExp: r.pet_exp,
      petStage: r.pet_id ? stage : null,
      petStageLabel: r.pet_id ? stageLabelOf(speciesLike, r.pet_exp ?? 0, thresholds) : null,
      petNextExp: r.pet_id ? (thresholds[stage + 1] ?? thresholds[stage]) : null,
      petEmoji: r.pet_emoji,
      speciesColorFrom: r.color_from ?? '#6366f1',
      speciesColorTo: r.color_to ?? '#8b5cf6',
    };
  });
}

function getStudentDetail(db: ReturnType<typeof getDb>, studentId: string) {
  const s = db
    .prepare(`SELECT * FROM students WHERE id = ? AND deleted_at IS NULL`)
    .get(studentId) as Record<string, unknown> | undefined;
  if (!s) return null;
    // 科目隔离：当前科目不匹配且不是未分科学生时视为不存在
    const active = getActiveSubject();
    if (s.subject && s.subject !== active) return null;
  const petRow = db
    .prepare(`SELECT * FROM pets WHERE student_id = ? AND deleted_at IS NULL`)
    .get(studentId) as PetRow | undefined;
  let pet = null;
  if (petRow) {
    tickPet(petRow);
    const refreshed = db
      .prepare(`SELECT * FROM pets WHERE id = ?`)
      .get(petRow.id) as unknown as PetRow;
    const species = getSpecies(db, refreshed.species_id);
    const thresholds = getExpThresholds(db);
    pet = {
      id: refreshed.id,
      speciesId: refreshed.species_id,
      name: refreshed.name,
      exp: refreshed.exp,
      stage: stageIndex(refreshed.exp, thresholds),
      stageLabel: stageLabelOf(species, refreshed.exp, thresholds),
      stageLabels: stageLabelsOf(species),
      thresholds,
      avatarPath: refreshed.avatar_path ?? species?.avatar_path ?? null,
      health: refreshed.health,
      hungry: refreshed.hungry,
      happy: refreshed.happy,
      clean: refreshed.clean,
      state: computeState(refreshed),
      species: species
        ? {
            id: species.id,
            name: species.name,
            emoji: species.emoji,
            colorFrom: species.color_from,
            colorTo: species.color_to,
          }
        : null,
    };
  }
  const backpack = db
    .prepare(
      `SELECT b.item_id, b.qty, i.name, i.icon, i.type, i.effect, i.desc
       FROM backpacks b JOIN items i ON i.id = b.item_id
       WHERE b.student_id = ? AND b.qty > 0 AND i.deleted_at IS NULL
       ORDER BY i.sort ASC`
    )
    .all(studentId);
  // 按 id 去重（历史数据可能残留重复商品，避免商店重复显示）
  const seenItems = new Set<string>();
  const items = (db
    .prepare(`SELECT * FROM items WHERE deleted_at IS NULL ORDER BY sort ASC`)
    .all() as { id: string }[]).filter((i) => (seenItems.has(i.id) ? false : (seenItems.add(i.id), true)));
  // 积分趋势（最近 30 天，按天累计）
  const since = new Date(Date.now() - 29 * 24 * 3600 * 1000).toISOString();
  const trendRows = db
    .prepare(
      `SELECT substr(created_at,1,10) AS day, COALESCE(SUM(delta),0) AS delta
       FROM point_events WHERE student_id = ? AND deleted_at IS NULL AND created_at >= ?
       GROUP BY day ORDER BY day ASC`
    )
    .all(studentId, since) as { day: string; delta: number }[];
  const trendMap = new Map(trendRows.map((r) => [r.day, r.delta]));
  const trend: { day: string; delta: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
    trend.push({ day: d, delta: trendMap.get(d) ?? 0 });
  }
  return {
    student: {
      id: s.id,
      student_no: s.student_no,
      name: s.name,
      class_name: s.class_name,
      points: s.points,
      created_at: s.created_at,
    },
    pet,
    backpack,
    items,
    history: getPointHistory(db, studentId, 60),
      trend,
  };
}


export function registerStudentRoutes(app: express.Express, auth: RequestHandler): void {
  // 大屏模式：全体宠物（公开）
  app.get('/api/pets/all', (_req, res) => {
    const rows = getDb()
      .prepare(
        `SELECT p.student_id, p.name, p.avatar_path, p.exp, p.health, p.hungry, p.happy, p.clean,
                sp.avatar_path AS species_avatar
         FROM pets p
         LEFT JOIN species sp ON sp.id = p.species_id
         WHERE p.deleted_at IS NULL`
      )
      .all() as unknown as {
      student_id: string;
      name: string;
      avatar_path: string | null;
      species_avatar: string | null;
      exp: number;
      health: number;
      hungry: number;
      happy: number;
      clean: number;
    }[];
    res.json({ pets: rows.map((p) => ({ ...p, avatar_path: p.avatar_path ?? p.species_avatar })) });
  });

  // 学生列表（公开：登录页/学生系统直接展示）
  app.get('/api/students', (_req, res) => {
    res.json({ students: listStudents(getDb()) });
  });

  // 学生详情（公开：点击进入，学生/教师都看这个）
  app.get('/api/students/:id', (req, res) => {
    const detail = getStudentDetail(getDb(), req.params.id);
    if (!detail) {
      res.status(404).json({ error: '学生不存在' });
      return;
    }
    res.json(detail);
  });

  // 可领养的宠物种类（公开）
  app.get('/api/species', (_req, res) => {
    const rows = getDb()
      .prepare(`SELECT * FROM species WHERE deleted_at IS NULL ORDER BY sort ASC`)
      .all();
    res.json({ species: rows });
  });

  // 领养宠物（学生选种类 + 自定义名）
  app.post('/api/students/:id/pet/adopt', (req, res) => {
    const { speciesId, name } = (req.body ?? {}) as { speciesId?: string; name?: string };
    if (!speciesId) {
      res.status(400).json({ error: '请选择宠物种类' });
      return;
    }
    const pet = adoptPet(getDb(), req.params.id, speciesId, name ?? '');
    if (!pet) {
      res.status(409).json({ error: '领养失败：学生不存在或已有宠物' });
      return;
    }
    res.json({ ok: true, pet });
  });

  // 重命名宠物
  app.post('/api/students/:id/pet/rename', (req, res) => {
    const { name } = (req.body ?? {}) as { name?: string };
    const db = getDb();
    const petRow = db
      .prepare(`SELECT * FROM pets WHERE student_id = ?`)
      .get(req.params.id) as PetRow | undefined;
    if (!petRow) {
      res.status(404).json({ error: '该学生还没有宠物' });
      return;
    }
    const pet = renamePet(db, petRow.id, name ?? '');
    res.json({ ok: true, pet });
  });

  // 使用道具
  app.post('/api/students/:id/pet/use-item', (req, res) => {
    const { itemId } = (req.body ?? {}) as { itemId?: string };
    if (!itemId) {
      res.status(400).json({ error: '缺少道具 id' });
      return;
    }
    const result = useItem(getDb(), req.params.id, itemId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // 积分购买道具
  app.post('/api/students/:id/pet/buy-item', (req, res) => {
    const { itemId } = (req.body ?? {}) as { itemId?: string };
    if (!itemId) {
      res.status(400).json({ error: '缺少道具 id' });
      return;
    }
    const result = buyItem(getDb(), req.params.id, itemId);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json(result);
  });

  // 自定义头像上传（前端已裁剪为圆形透明 PNG；学生机 kiosk 模式无 token，故不鉴权）
  const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
  const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const raw = path.extname(file.originalname || '').toLowerCase();
      const ext = ALLOWED_EXTS.has(raw) ? raw : '.png';
      cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
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
  const avatarUpload = (req: express.Request, res: express.Response): Promise<unknown> =>
    new Promise((resolve) => {
      upload.single('file')(req, res, (err) => {
        if (err) resolve({ multerError: err });
        else resolve(null);
      });
    });
  app.post('/api/students/:id/pet/avatar', async (req, res) => {
    const upErr = await avatarUpload(req, res);
    if (upErr && (upErr as { multerError?: Error }).multerError) {
      res.status(400).json({ error: (upErr as { multerError: Error }).multerError.message });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: '缺少图片文件' });
      return;
    }
    // 文件头校验（magic bytes），防伪装图片
    if (!isValidImageFile(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* ignore */
      }
      res.status(400).json({ error: '图片文件无效（文件头校验失败），请重新选择图片' });
      return;
    }
    const db = getDb();
    const petRow = db
      .prepare(`SELECT * FROM pets WHERE student_id = ?`)
      .get(req.params.id) as PetRow | undefined;
    if (!petRow) {
      try {
        fs.unlinkSync(req.file.path);
      } catch {
        /* 清理失败忽略 */
      }
      res.status(404).json({ error: '该学生还没有宠物' });
      return;
    }
    const oldAvatar = petRow.avatar_path;
    // 先写库，成功后清理旧头像文件（避免 DB 指向已删除文件）
    const pet = setPetAvatar(db, petRow.id, `/uploads/${req.file.filename}`);
    if (oldAvatar?.startsWith('/uploads/')) {
      const oldFile = path.join(UPLOAD_DIR, path.basename(oldAvatar));
      try {
        fs.unlinkSync(oldFile);
      } catch {
        /* 旧文件不存在则忽略 */
      }
    }
    res.json({ ok: true, pet, url: `/uploads/${req.file.filename}` });
  });

  // 教师端用：按班级分组列表（带宠物概要）
  app.get('/api/students/grouped', auth, (_req, res) => {
    const students = listStudents(getDb());
    const byClass = new Map<string, typeof students>();
    for (const s of students) {
      const k = s.class_name || '未分班';
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(s);
    }
    const groups = [...byClass.entries()].map(([className, list]) => ({
      className,
      students: list,
    }));
    res.json({ groups });
  });
}
