import { getDb, nowIso } from '../db/connection.js';
import { SYNC_TABLES } from '../db/migrate.js';
import { snapshotDb } from '../db/backup.js';
import type { SyncTransport } from './transport.js';

/** 冲突条目：同一行在本地与云端自上次同步后都发生过变更 */
export interface ConflictItem {
  table: string;
  id: string;
  local: Record<string, unknown> | null;
  cloud: Record<string, unknown>;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: ConflictItem[];
  backupFile: string | null;
  completed: boolean;
}

const META_ID = 'global';
/** 比较内容时忽略的元字段 */
const META_COLS = new Set(['updated_at']);
/** 各表允许的列名（PRAGMA 缓存，防云端可控列名注入） */
const tableColsCache = new Map<string, Set<string>>();

function allowedCols(db: ReturnType<typeof getDb>, table: string): Set<string> {
  let set = tableColsCache.get(table);
  if (!set) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    set = new Set(cols.map((c) => c.name));
    tableColsCache.set(table, set);
  }
  return set;
}

function getLastSync(): string {
  const r = getDb()
    .prepare(`SELECT last_sync_at FROM sync_meta WHERE id = ?`)
    .get(META_ID) as { last_sync_at: string } | undefined;
  return r?.last_sync_at ?? '';
}

function sameContent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a).filter((k) => !META_COLS.has(k)).sort();
  const kb = Object.keys(b).filter((k) => !META_COLS.has(k)).sort();
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

function quote(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** 应用云端行到本地（upsert；含 deleted_at 的墓碑行）。列名必须在本表 schema 白名单内。 */
export function applyRow(db: ReturnType<typeof getDb>, table: string, row: Record<string, unknown>): void {
  // 表名白名单：只允许同步表
  if (!(SYNC_TABLES as readonly string[]).includes(table)) {
    throw new Error(`不允许同步表 ${table}`);
  }
  const allowed = allowedCols(db, table);
  // 未知列：跳过并告警（防注入：未知列名永不进入 SQL；防云端先加列导致同步永久失败）
  const unknownCols = Object.keys(row).filter((c) => !allowed.has(c));
  if (unknownCols.length > 0) {
    console.warn(`[sync] ${table} 行含未知列，已跳过：${unknownCols.join(',')}`);
  }
  const cols = Object.keys(row).filter((c) => allowed.has(c));
  if (!cols.includes('id')) throw new Error(`行缺少 id 或列不在白名单: ${table}`);
  // 行只有 id 没有可更新列（如未知列全被跳过）：直接跳过，避免生成非法 SQL
  if (cols.length === 1) return;
  const colSql = cols.join(',');
  const ph = cols.map(() => '?').join(',');
  const upsert = cols
    .map((c) => (c === 'id' ? '' : `${c}=excluded.${c}`))
    .filter(Boolean)
    .join(',');
  const stmt = db.prepare(
    `INSERT INTO ${table} (${colSql}) VALUES (${ph})
     ON CONFLICT(id) DO UPDATE SET ${upsert}`
  );
  stmt.run(...(cols.map((c) => row[c]) as unknown[] as Parameters<typeof stmt.run>));
}

export async function pushDirty(
  transport: SyncTransport,
  sinceIso: string,
  opts?: { skip?: Map<string, Set<string>> }
): Promise<number> {
  const db = getDb();
  let pushed = 0;
  for (const table of SYNC_TABLES) {
    const dirty = db
      .prepare(`SELECT * FROM ${table} WHERE updated_at > ?`)
      .all(sinceIso) as Record<string, unknown>[];
    // 跳过本轮 PULL 刚写入的行：它们的 updated_at 必然晚于游标，
    // 若不排除会被当作"本地脏行"回推云端（回声），并有盲写覆盖他端更新的风险
    const skip = opts?.skip?.get(table);
    const filtered = skip ? dirty.filter((r) => !skip.has(r.id as string)) : dirty;
    if (filtered.length === 0) continue;
    await transport.push(table, filtered);
    pushed += filtered.length;
  }
  return pushed;
}

/**
 * 两路同步（第一阶段）：
 *  1. 同步前快照本地库（P0 兜底）
 *  2. 拉取云端增量（带冲突检测，冲突行暂不应用）
 *  3. 推送本地脏行
 *  4. 若无冲突 → 推进 last_sync_at，完成
 *  有冲突 → 返回 conflicts 等待用户裁决，游标不推进（绝不丢数据）
 */
export async function runSync(transport: SyncTransport): Promise<SyncResult> {
  const db = getDb();
  const backupFile = snapshotDb();
  const lastSync = getLastSync();
  let pulled = 0;
  const conflicts: ConflictItem[] = [];
  /** 本轮 PULL 已应用的行（按表）：PUSH 时跳过，防止"拉回即回推"的回声与盲写覆盖 */
  const skipIds = new Map<string, Set<string>>();

  // ---- PULL（检测冲突，无冲突行直接应用）----
  for (const table of SYNC_TABLES) {
    const cloudRows = await transport.pull(table, lastSync);
    for (const cRow of cloudRows) {
      const id = cRow.id as string;
      const localRow = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id) as
        | Record<string, unknown>
        | undefined;
      const localChanged = !!localRow && (localRow.updated_at as string) > lastSync;
      const cloudChanged = (cRow.updated_at as string) > lastSync;
      const contentSame = localRow && sameContent(localRow, cRow);

      if (localChanged && cloudChanged && !contentSame) {
        conflicts.push({
          table,
          id,
          local: localRow,
          cloud: cRow,
          localUpdatedAt: localRow.updated_at as string,
          cloudUpdatedAt: cRow.updated_at as string,
        });
        continue;
      }
      applyRow(db, table, cRow);
      if (!skipIds.has(table)) skipIds.set(table, new Set());
      skipIds.get(table)!.add(id);
      pulled++;
    }
  }

  // ---- PUSH ----
  const pushed = await pushDirty(transport, lastSync, { skip: skipIds });

  // 存在未裁决冲突：不推进游标，避免覆盖
  if (conflicts.length > 0) {
    return { pulled, pushed, conflicts, backupFile, completed: false };
  }

  const now = nowIso();
  db.prepare(
    `UPDATE sync_meta SET last_pull_at=?, last_push_at=?, last_sync_at=?, updated_at=? WHERE id = ?`
  ).run(now, now, now, now, META_ID);
  return { pulled, pushed, conflicts: [], backupFile, completed: true };
}

export type ConflictChoice = 'local' | 'cloud';

/**
 * 冲突裁决（第二阶段）：按用户选择应用后推送并推进游标。
 * keep=local：忽略云端版本（本地保持 dirty，稍后推送覆盖云端）
 * keep=cloud：用云端版本覆盖本地
 */
export async function resolveConflicts(
  transport: SyncTransport,
  conflicts: ConflictItem[],
  choices: Record<string, ConflictChoice>
): Promise<{ pushed: number; completed: boolean }> {
  const db = getDb();
  const lastSync = getLastSync();

  for (const c of conflicts) {
    const key = `${c.table}:${c.id}`;
    const choice = choices[key] ?? 'local';
    if (choice === 'cloud') {
      applyRow(db, c.table, c.cloud);
    }
  }

  const pushed = await pushDirty(transport, lastSync);
  const now = nowIso();
  db.prepare(
    `UPDATE sync_meta SET last_pull_at=?, last_push_at=?, last_sync_at=?, updated_at=? WHERE id = ?`
  ).run(now, now, now, now, META_ID);
  return { pushed, completed: true };
}

/** 便捷：测试用，构造同步行 */
export function makeSyncRow(
  table: string,
  id: string,
  fields: Record<string, unknown>,
  ts: string
): Record<string, unknown> {
  return { id, created_at: ts, updated_at: ts, deleted_at: null, ...fields };
}

export { META_ID };
