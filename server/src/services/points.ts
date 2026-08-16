import { getDb, newId, tx, nowIso, type SqliteDb } from '../db/connection.js';
import { getExpThresholds, stageIndex, stageLabelOf } from './pets.js';

export interface PointApplyResult {
  applied: number;
  skipped: string[];
  totalDelta: number;
  events: { studentId: string; delta: number; newPoints: number }[];
}

/**
 * 给一名或多名学生加/扣积分（事务保证原子性）。
 * 单点与批量走同一入口：studentIds 长度 ≥1。
 * 每次操作都产生一条 point_events 流水（含理由、操作者、时间）。
 */
export function applyPoints(
  db: SqliteDb,
  studentIds: string[],
  delta: number,
  reason: string,
  operator: 'teacher' | 'admin' | 'student'
): PointApplyResult {
  const d = Math.round(Number(delta));
  if (!Number.isFinite(d) || d === 0) {
    throw new Error('分值必须为非零整数');
  }
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (ids.length === 0) throw new Error('请至少选择一名学生');

  return tx(db, () => {
    const now = nowIso();
    const events: PointApplyResult['events'] = [];
    const skipped: string[] = [];
    for (const sid of ids) {
      // 原子更新：points = points + d（并发加减分不丢更新）
      const r = db
        .prepare(`UPDATE students SET points = points + ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`)
        .run(d, now, sid);
      if (r.changes === 0) {
        skipped.push(sid);
        continue;
      }
      const newPoints = (db.prepare(`SELECT points FROM students WHERE id = ?`).get(sid) as { points: number }).points;
      db.prepare(
        `INSERT INTO point_events (id, student_id, delta, reason, operator, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
      ).run(newId('ev'), sid, d, reason, operator, now, now);
      events.push({ studentId: sid, delta: d, newPoints });
    }
    return {
      applied: events.length,
      skipped,
      totalDelta: d * events.length,
      events,
    };
  });
}

export interface LeaderboardRow {
  id: string;
  name: string;
  class_name: string;
  points: number;
  rank: number;
  petName: string | null;
  petEmoji: string;
  petExp: number;
}

/** 积分排行榜（并列名次），教师端/大屏用 */
export function getLeaderboard(db: SqliteDb, limit = 50): LeaderboardRow[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.class_name, s.points,
              p.name AS petName, p.exp AS petExp,
              sp.emoji AS petEmoji, sp.stage_labels AS species_stage_labels
       FROM students s
       LEFT JOIN pets p ON p.student_id = s.id AND p.deleted_at IS NULL
       LEFT JOIN species sp ON sp.id = p.species_id
       WHERE s.deleted_at IS NULL
       ORDER BY s.points DESC, s.name ASC
       LIMIT ?`
    )
    .all(limit) as {
    id: string;
    name: string;
    class_name: string;
    points: number;
    petName: string | null;
    petExp: number;
    petEmoji: string;
    species_stage_labels: string | null;
  }[];

  // 并列名次：同分同名次
  const thresholds = getExpThresholds(db);
  let rank = 0;
  let prev: number | null = null;
  return rows.map((r, i) => {
    if (r.points !== prev) {
      rank = i + 1;
      prev = r.points;
    }
    const speciesLike = { stage_labels: r.species_stage_labels ?? '[]' } as Parameters<typeof stageLabelOf>[0];
    const stage = stageIndex(r.petExp ?? 0, thresholds);
    return {
      ...r,
      rank,
      petEmoji: r.petEmoji ?? '🐣',
      petStage: r.petName ? stage : null,
      petStageLabel: r.petName ? stageLabelOf(speciesLike, r.petExp ?? 0, thresholds) : null,
    };
  });
}

export interface HistoryRow {
  id: string;
  delta: number;
  reason: string;
  operator: string;
  created_at: string;
}

export function getPointHistory(db: SqliteDb, studentId: string, limit = 100): HistoryRow[] {
  return db
    .prepare(
      `SELECT id, delta, reason, operator, created_at FROM point_events
       WHERE student_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT ?`
    )
    .all(studentId, limit) as unknown as HistoryRow[];
}