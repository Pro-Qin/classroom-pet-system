import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { DB_FILE } from '../config.js';

/**
 * node:sqlite 是 Node 22.5+ 内建模块；Vite/vitest 的 import-analysis 不识别
 * `import ... from 'node:sqlite'`，因此用 createRequire 动态加载（dev/build/test 均兼容）。
 */
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

/** 薄封装：node:sqlite 的 DatabaseSync，API 风格对齐 better-sqlite3 常用方法 */
export type SqliteDb = InstanceType<typeof DatabaseSync>;

let db: SqliteDb | null = null;

/** 测试钩子：用内存库替换全局实例 */
export function setDbForTest(d: SqliteDb): void {
  db = d;
}

export function getDb(): SqliteDb {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    db = new DatabaseSync(DB_FILE);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
  }
  return db;
}

/** 供测试使用：打开内存库 */
export function openMemoryDb(): SqliteDb {
  const d = new DatabaseSync(':memory:');
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = ''): string {
  const rand =
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}_${rand}` : rand;
}

/** 通用查询：select * from t where ... */
export function rows(db: SqliteDb, table: string, where = '1=1'): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${table} WHERE ${where}`).all() as Record<string, unknown>[];
}

export function row(db: SqliteDb, table: string, id: string): Record<string, unknown> | undefined {
  return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
}

/** 事务包装 */
export function tx<T>(db: SqliteDb, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
