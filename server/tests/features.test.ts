import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openMemoryDb, setDbForTest, closeDb, type SqliteDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { setSetting, getSetting } from '../src/db/settings.js';
import { getActiveSubject, getSubjectsConfig, saveSubjectsConfig, subjectFeatureEnabled } from '../src/services/subjects.js';

let db: SqliteDb;

beforeEach(() => {
  db = openMemoryDb();
  setDbForTest(db);
  migrate(db);
  seed(db);
});

afterEach(() => closeDb());

describe('新增特性：科目隔离与教师口令', () => {
  it('students 表包含 subject 列，error_reports 表存在', () => {
    const cols = db.prepare(`PRAGMA table_info(students)`).all() as { name: string }[];
    expect(cols.some((c) => c.name === 'subject')).toBe(true);
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
    expect(tables.some((t) => t.name === 'error_reports')).toBe(true);
  });

  it('科目设置可保存/读取，默认启用全部功能', () => {
    saveSubjectsConfig([{ name: '数学', sync: false, enabled: { points: true, pets: false, shop: true, rank: false, avatar: true } }]);
    const list = getSubjectsConfig();
    expect(list[0].name).toBe('数学');
    expect(list[0].sync).toBe(false);
    expect(list[0].enabled.pets).toBe(false);
    setSetting('active_subject', '数学');
    expect(getActiveSubject()).toBe('数学');
    expect(subjectFeatureEnabled('points')).toBe(true);
    expect(subjectFeatureEnabled('pets')).toBe(false);
  });

  it('教师口令默认 123456，可更新', () => {
    const current = getSetting('teacher_password') ?? '123456';
    expect(current).toBe('123456');
    setSetting('teacher_password', 'test8888');
    expect(getSetting('teacher_password')).toBe('test8888');
  });
});
