import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './connection.js';
import { getSetting } from './settings.js';
import { BACKUP_DIR } from '../config.js';

/**
 * 同步前快照本地数据库（VACUUM INTO 生成一致快照，不受 WAL 影响）。
 * 返回快照文件路径；保留最近 MAX_SNAPSHOTS 份，超出自动清理（防磁盘耗尽）。
 */
const MAX_SNAPSHOTS = 10;

/** 默认备份占用上限：1 GB（可在管理端设置） */
export const DEFAULT_BACKUP_MAX_BYTES = 1024 * 1024 * 1024;

export function snapshotDb(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `snapshot-${ts}.db`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  getDb().exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  pruneBackups();
  return file;
}

/** 清理旧快照：数量上限 + 总字节上限（默认 1GB，管理端可调）；至少保留最近 2 份 */
export function pruneBackups(): void {
  const capBytes = Number(getSetting('backup_max_bytes')) || DEFAULT_BACKUP_MAX_BYTES;
  const snaps = listSnapshots(200);
  // 先按数量裁剪
  for (const s of snaps.slice(MAX_SNAPSHOTS)) {
    try {
      fs.unlinkSync(s.file);
    } catch {
      /* ignore */
    }
  }
  // 再按字节上限从最旧开始删（保留最近 2 份兜底）
  let keep = listSnapshots(200);
  let total = keep.reduce((s, x) => s + x.size, 0);
  while (keep.length > 2 && total > capBytes) {
    const oldest = keep[keep.length - 1];
    try {
      fs.unlinkSync(oldest.file);
    } catch {
      break;
    }
    total -= oldest.size;
    keep = listSnapshots(200);
  }
}

/** 列出最近的快照 */
export function listSnapshots(limit = 20): { file: string; size: number; mtime: number }[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const p = path.join(BACKUP_DIR, f);
      const st = fs.statSync(p);
      return { file: p, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}