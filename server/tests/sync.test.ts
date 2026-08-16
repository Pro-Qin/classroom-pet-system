import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openMemoryDb, setDbForTest, closeDb, getDb, nowIso, type SqliteDb } from '../src/db/connection.js';
import { migrate, SYNC_TABLES } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { MockTransport } from '../src/sync/transport.js';
import { runSync, resolveConflicts, makeSyncRow, applyRow, type ConflictItem } from '../src/sync/engine.js';
import { setSetting } from '../src/db/settings.js';

let db: SqliteDb;
let transport: MockTransport;
let tmpCloud: string;

function t(offsetSec: number): string {
  return new Date(Date.now() + offsetSec * 1000).toISOString();
}

function localStudentRow(id: string) {
  return getDb().prepare(`SELECT * FROM students WHERE id = ?`).get(id);
}

beforeEach(() => {
  db = openMemoryDb();
  setDbForTest(db);
  migrate(db);
  seed(db);
  tmpCloud = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pet-sync-')), 'cloud.json');
  transport = new MockTransport(tmpCloud);
});

afterEach(() => {
  closeDb();
  try {
    fs.rmSync(path.dirname(tmpCloud), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('同步引擎：基础往返', () => {
  it('本地新建行 → 推送云端 → 云端可见', async () => {
    const ts = nowIso();
    applyRow(getDb(), 'students', {
      id: 'stu_a',
      student_no: 'S001',
      name: '张三',
      class_name: '高一(2)班',
      points: 10,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    });
    const res = await runSync(transport);
    expect(res.completed).toBe(true);
    expect(res.conflicts).toHaveLength(0);
    const cloud = transport.dump().students as Record<string, unknown>[];
    const row = cloud.find((r) => r.id === 'stu_a');
    expect(row?.name).toBe('张三');
  });

  it('云端已有数据 → 拉取到本地', async () => {
    const ts = t(-100);
    await transport.push('students', [
      makeSyncRow('students', 'cloud_1', { student_no: 'C001', name: '云端学生', class_name: '高一(3)班', points: 50 }, ts),
    ]);
    const res = await runSync(transport);
    expect(res.completed).toBe(true);
    expect(res.pulled).toBeGreaterThanOrEqual(1);
    expect(localStudentRow('cloud_1')).toBeTruthy();
  });

  it('游标推进：同步过的行不会重复拉取', async () => {
    await transport.push('students', [
      makeSyncRow('students', 'c2', { student_no: 'C2', name: 'x', class_name: '', points: 0 }, t(-50)),
    ]);
    const r1 = await runSync(transport);
    expect(r1.pulled).toBeGreaterThanOrEqual(1);
    const r2 = await runSync(transport);
    expect(r2.pulled).toBe(0);
  });
});

describe('同步引擎：删除墓碑（P0）', () => {
  it('本地删除 → 推送墓碑行（deleted_at 非空），云端不再有活数据', async () => {
    const ts = t(-30);
    applyRow(getDb(), 'students', {
      id: 'stu_del', student_no: 'D1', name: '将被删除', class_name: '', points: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    });
    await runSync(transport);
    // 删除：置 deleted_at（绝不硬删）
    const ts2 = t(5);
    getDb()
      .prepare(`UPDATE students SET deleted_at = ?, updated_at = ? WHERE id = ?`)
      .run(ts2, ts2, 'stu_del');
    await runSync(transport);
    const cloud = transport.dump().students as Record<string, unknown>[];
    const row = cloud.find((r) => r.id === 'stu_del');
    expect(row?.deleted_at).toBeTruthy();
    // 本地行仍存在（软删）
    expect(localStudentRow('stu_del')?.deleted_at).toBeTruthy();
  });

  it('云端墓碑 → 拉取后本地软删', async () => {
    const ts = t(-20);
    await transport.push('students', [
      makeSyncRow('students', 'c_tomb', { student_no: 'T1', name: '云端已删', class_name: '', points: 0 }, ts),
    ]);
    await runSync(transport);
    // 云端标记删除（时间戳必须晚于上次同步游标）
    const ts2 = t(10);
    await transport.push('students', [
      { ...makeSyncRow('students', 'c_tomb', { student_no: 'T1', name: '云端已删', class_name: '', points: 0 }, ts2), deleted_at: ts2 },
    ]);
    await runSync(transport);
    expect(localStudentRow('c_tomb')?.deleted_at).toBeTruthy();
  });
});

describe('同步引擎：冲突检测与裁决（P0）', () => {
  it('双方同改同一行 → 产生冲突，游标不推进，行不被覆盖', async () => {
    const ts = t(-60);
    applyRow(getDb(), 'students', {
      id: 'stu_x', student_no: 'X1', name: '基线', class_name: '', points: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    });
    await runSync(transport);

    // 本地改
    getDb().prepare(`UPDATE students SET points = 100, updated_at = ? WHERE id = 'stu_x'`).run(t(10));
    // 云端改（不同内容）
    const cloudTs = t(20);
    await transport.push('students', [
      { ...makeSyncRow('students', 'stu_x', { student_no: 'X1', name: '基线', class_name: '', points: 999 }, cloudTs), updated_at: cloudTs },
    ]);

    const res = await runSync(transport);
    expect(res.completed).toBe(false);
    expect(res.conflicts).toHaveLength(1);
    const c = res.conflicts[0] as ConflictItem;
    expect(c.local?.points).toBe(100);
    expect(c.cloud?.points).toBe(999);
    // 本地行未被云端覆盖
    expect(localStudentRow('stu_x')?.points).toBe(100);
  });

  it('保留本地 → 本地值推送覆盖云端', async () => {
    const ts = t(-60);
    applyRow(getDb(), 'students', {
      id: 'stu_y', student_no: 'Y1', name: '基线', class_name: '', points: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    });
    await runSync(transport);
    getDb().prepare(`UPDATE students SET points = 7, updated_at = ? WHERE id = 'stu_y'`).run(t(5));
    await transport.push('students', [
      makeSyncRow('students', 'stu_y', { student_no: 'Y1', name: '基线', class_name: '', points: 888 }, t(15)),
    ]);
    const res = await runSync(transport);
    expect(res.conflicts).toHaveLength(1);
    await resolveConflicts(transport, res.conflicts, { 'students:stu_y': 'local' });
    const cloud = transport.dump().students as Record<string, unknown>[];
    expect(cloud.find((r) => r.id === 'stu_y')?.points).toBe(7);
  });

  it('保留云端 → 云端值覆盖本地', async () => {
    const ts = t(-60);
    applyRow(getDb(), 'students', {
      id: 'stu_z', student_no: 'Z1', name: '基线', class_name: '', points: 0,
      created_at: ts, updated_at: ts, deleted_at: null,
    });
    await runSync(transport);
    getDb().prepare(`UPDATE students SET points = 1, updated_at = ? WHERE id = 'stu_z'`).run(t(5));
    await transport.push('students', [
      makeSyncRow('students', 'stu_z', { student_no: 'Z1', name: '基线', class_name: '', points: 777 }, t(15)),
    ]);
    const res = await runSync(transport);
    expect(res.conflicts).toHaveLength(1);
    await resolveConflicts(transport, res.conflicts, { 'students:stu_z': 'cloud' });
    expect(localStudentRow('stu_z')?.points).toBe(777);
  });
});

describe('同步引擎：快照备份（P0）', () => {
  it('每次同步前生成快照文件', async () => {
    await runSync(transport);
    const fsPath = path.resolve(__dirname, '../data/backups');
    const files = fs.existsSync(fsPath) ? fs.readdirSync(fsPath).filter((f) => f.endsWith('.db')) : [];
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});

describe('同步引擎：安全守卫', () => {
  it('非同步表被拒绝', () => {
    const ts = nowIso();
    expect(() =>
      applyRow(getDb(), 'not_a_sync_table', {
        id: 'x',
        created_at: ts,
        updated_at: ts,
        deleted_at: null,
      })
    ).toThrow(/不允许同步表/);
  });

  it('未知列跳过并告警（不中断同步、不进 SQL）', () => {
    const ts = nowIso();
    const before = (getDb().prepare(`SELECT COUNT(*) AS c FROM students`).get() as { c: number }).c;
    // 含一个未知列 + 合法列：应成功插入，未知列被跳过
    applyRow(getDb(), 'students', {
      id: 'stu_guard',
      student_no: 'G1',
      name: '守卫测试',
      class_name: '高一(9)班',
      points: 5,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
      evil_column: "'; DROP TABLE students; --",
    });
    const after = (getDb().prepare(`SELECT COUNT(*) AS c FROM students`).get() as { c: number }).c;
    expect(after).toBe(before + 1);
    const row = localStudentRow('stu_guard');
    expect(row?.name).toBe('守卫测试');
    // students 表仍在（注入未生效）
    expect(getDb().prepare(`SELECT COUNT(*) AS c FROM students`).get()).toBeTruthy();
  });

  it('仅含 id 的行跳过，不生成非法 SQL', () => {
    // 行内除 id 外都是未知列 → 白名单过滤后只剩 id → 守卫应直接跳过
    expect(() =>
      applyRow(getDb(), 'students', { id: 'only_id_row', unknown_col_a: 1, unknown_col_b: 2 })
    ).not.toThrow();
    expect(localStudentRow('only_id_row')).toBeUndefined();
  });
});

describe('同步表覆盖', () => {
  it('SYNC_TABLES 与 schema 表一一对应', () => {
    for (const t of SYNC_TABLES) {
      const r = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(t);
      expect(r, `表 ${t} 应存在`).toBeTruthy();
    }
  });
});
