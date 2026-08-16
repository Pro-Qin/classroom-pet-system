import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openMemoryDb, setDbForTest, closeDb, type SqliteDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed, counts } from '../src/db/seed.js';

let db: SqliteDb;

beforeEach(() => {
  db = openMemoryDb();
  setDbForTest(db);
  migrate(db);
});

afterEach(() => {
  closeDb();
});

describe('数据层：迁移与种子', () => {
  it('迁移幂等：执行两次不报错', () => {
    expect(() => migrate(db)).not.toThrow();
    expect(() => migrate(db)).not.toThrow();
  });

  it('种子数据覆盖：宠物种类 / 道具 / 状态规则 / 快捷理由 / 演示学生', () => {
    seed(db);
    const c = counts(db);
    expect(c.species).toBeGreaterThanOrEqual(12);
    expect(c.items).toBeGreaterThanOrEqual(12);
    expect(c.state_rules).toBeGreaterThanOrEqual(10);
    expect(c.quick_presets).toBeGreaterThanOrEqual(6);
    expect(c.students).toBe(6);
    expect(c.pets).toBe(6);
  });

  it('种子幂等：再次 seed 不重复插入', () => {
    seed(db);
    const c1 = counts(db);
    seed(db);
    const c2 = counts(db);
    expect(c2).toEqual(c1);
  });

  it('每名学生恰好一只宠物', () => {
    seed(db);
    const rows = db
      .prepare(
        `SELECT s.id AS sid, p.id AS pid FROM students s LEFT JOIN pets p ON p.student_id = s.id`
      )
      .all();
    expect(rows.length).toBe(6);
    for (const r of rows) expect(r.pid).toBeTruthy();
  });
});
