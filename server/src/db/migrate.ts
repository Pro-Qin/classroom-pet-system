import { getDb, nowIso, type SqliteDb } from './connection.js';

/**
 * 数据模型（本地 SQLite，与云端 Supabase 镜像一致）。
 * 同步表（带 updated_at / deleted_at）：
 *   students, species, pets, point_events, quick_presets, items, state_rules
 * 设计原则：
 *   - 所有记录永不硬删：删除 = 设置 deleted_at（同步需要墓碑）
 *   - 业务时间戳用 ISO 字符串，比较安全
 *   - 积分流水（point_events）不可变，追加式
 */
export const SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS students (
    id TEXT PRIMARY KEY,
    student_no TEXT UNIQUE,
    name TEXT NOT NULL,
    class_name TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_name)`,

  `CREATE TABLE IF NOT EXISTS species (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    avatar_path TEXT,
    color_from TEXT NOT NULL DEFAULT '#6366f1',
    color_to TEXT NOT NULL DEFAULT '#8b5cf6',
    stage_labels TEXT NOT NULL DEFAULT '[]',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS pets (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL UNIQUE,
    species_id TEXT NOT NULL,
    name TEXT NOT NULL,
    exp INTEGER NOT NULL DEFAULT 0,
    avatar_path TEXT,
    health INTEGER NOT NULL DEFAULT 100,
    hungry INTEGER NOT NULL DEFAULT 100,
    happy INTEGER NOT NULL DEFAULT 100,
    clean INTEGER NOT NULL DEFAULT 100,
    last_tick_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_pets_student ON pets(student_id)`,

  `CREATE TABLE IF NOT EXISTS point_events (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    operator TEXT NOT NULL DEFAULT 'teacher',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_points_student ON point_events(student_id)`,
  `CREATE INDEX IF NOT EXISTS idx_points_time ON point_events(created_at)`,

  `CREATE TABLE IF NOT EXISTS quick_presets (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    delta INTEGER NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    editable INTEGER NOT NULL DEFAULT 1,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'food',
    cost INTEGER NOT NULL DEFAULT 0,
    effect TEXT NOT NULL DEFAULT '{}',
    desc TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS backpacks (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_backpacks_pair ON backpacks(student_id, item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_backpacks_student ON backpacks(student_id)`,

  `CREATE TABLE IF NOT EXISTS item_use_logs (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    effect TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS item_use_logs (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    effect TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS state_rules (
    id TEXT PRIMARY KEY,
    state_key TEXT NOT NULL,
    label TEXT NOT NULL,
    conditions TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#94a3b8',
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at)`,

  `CREATE TABLE IF NOT EXISTS error_reports (
    id TEXT PRIMARY KEY,
    level TEXT NOT NULL DEFAULT 'error',
    message TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT '',
    stack TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    info TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_error_time ON error_reports(created_at)`,

  `CREATE TABLE IF NOT EXISTS sync_meta (
    id TEXT PRIMARY KEY,
    last_pull_at TEXT NOT NULL DEFAULT '',
    last_push_at TEXT NOT NULL DEFAULT '',
    last_sync_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS tombstones (
    id TEXT PRIMARY KEY,
    table_name TEXT NOT NULL,
    row_id TEXT NOT NULL,
    deleted_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`,
];

/** 需要参与云端同步的表（含 updated_at / deleted_at 列）。
 *  注意顺序：被引用表在前（students → species → pets），
 *  backpacks / item_use_logs 追加在末尾。 */
export const SYNC_TABLES = [
  'students',
  'species',
  'pets',
  'point_events',
  'quick_presets',
  'items',
  'state_rules',
  'backpacks',
  'item_use_logs',
] as const;

export function migrate(db?: SqliteDb): void {
  const d = db ?? getDb();
  for (const stmt of SCHEMA_SQL) d.exec(stmt);
  // 幂等增量迁移：species 增加 avatar_path（旧库升级）
  try {
    d.exec(`ALTER TABLE species ADD COLUMN avatar_path TEXT`);
  } catch {
    /* 列已存在 */
  }

  // 幂等增量迁移：students 增加 subject（旧库升级，按科目隔离）
  try {
    d.exec(`ALTER TABLE students ADD COLUMN subject TEXT NOT NULL DEFAULT ''`);
  } catch {
    /* 列已存在 */
  }

  // 幂等增量迁移：point_events 增加 ref_event_id（冲正引用原流水）
  try {
    d.exec(`ALTER TABLE point_events ADD COLUMN ref_event_id TEXT`);
  } catch {
    /* 列已存在 */
  }

  // 幂等增量迁移：pets 增加性格/每日事件列（本机彩蛋数据，不入云同步面）
  try {
    d.exec(`ALTER TABLE pets ADD COLUMN personality TEXT`);
  } catch {
    /* 列已存在 */
  }
  try {
    d.exec(`ALTER TABLE pets ADD COLUMN last_event_day TEXT`);
  } catch {
    /* 列已存在 */
  }

  // 幂等增量迁移：item_use_logs 补同步所需时间戳列（追加式表，updated_at 回填 created_at）
  try {
    d.exec(`ALTER TABLE item_use_logs ADD COLUMN updated_at TEXT`);
  } catch {
    /* 列已存在 */
  }
  try {
    d.exec(`ALTER TABLE item_use_logs ADD COLUMN deleted_at TEXT`);
  } catch {
    /* 列已存在 */
  }
  d.exec(`UPDATE item_use_logs SET updated_at = COALESCE(updated_at, created_at)`);

  // 幂等增量迁移：backpacks 重建为带 id 主键的同步形态（兼容旧的复合主键结构）
  const bpCols = d.prepare(`PRAGMA table_info(backpacks)`).all() as { name: string }[];
  if (!bpCols.some((c) => c.name === 'id')) {
    d.exec(`
      CREATE TABLE backpacks_new (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        qty INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      );
      INSERT OR REPLACE INTO backpacks_new (id, student_id, item_id, qty, updated_at)
        SELECT student_id || '|' || item_id, student_id, item_id, qty, updated_at FROM backpacks;
      DROP TABLE backpacks;
      ALTER TABLE backpacks_new RENAME TO backpacks;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_backpacks_pair ON backpacks(student_id, item_id);
      CREATE INDEX IF NOT EXISTS idx_backpacks_student ON backpacks(student_id);
    `);
  }
  // 重建后兜底：确保所有行都有 id（异常中断的重建）
  d.exec(`UPDATE backpacks SET id = student_id || '|' || item_id WHERE id IS NULL`);

  // 同步游标比较用的辅助索引（脏行查询免全表扫描）
  d.exec(`CREATE INDEX IF NOT EXISTS idx_students_updated ON students(updated_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_pets_updated ON pets(updated_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_presets_updated ON quick_presets(updated_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_backpacks_updated ON backpacks(updated_at)`);
  d.exec(`CREATE INDEX IF NOT EXISTS idx_uselogs_updated ON item_use_logs(updated_at)`);

  d.prepare(
    `INSERT OR IGNORE INTO migrations (id, name, applied_at) VALUES (1, 'schema_v1', ?)`
  ).run(nowIso());
}