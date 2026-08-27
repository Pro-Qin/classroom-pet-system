import { getDb, nowIso } from '../db/connection.js';
import { getSetting, setSetting } from '../db/settings.js';
import { loadConfig, updateConfig, APP_VERSION } from '../config.js';
import { applyRow } from '../sync/engine.js';
import { getExpThresholds } from './pets.js';

/**
 * 统一配置导出 / 导入（分类可选）
 * ============================================
 * 设计目标：替代散落在各处的多个导入导出入口，一个格式、两个入口
 * （欢迎向导首次导入 + 管理端随时导出/导入）、按类勾选、互不干扰。
 *
 * 安全原则：
 *  - 管理员密码哈希 / tokenSecret / deviceId 永不导出（设备自有凭据不可移植）
 *  - 云端连接（Supabase 地址与密钥）是独立勾选项，默认不勾
 *  - 教师口令不入导出包（各校自行设置）
 */

export interface TransferCategory {
  key: string;
  label: string;
  desc: string;
  kind: 'settings' | 'table';
}

export const CATEGORIES: TransferCategory[] = [
  { key: 'display', label: '展示与文案', desc: '积分单位名、管理员名、界面文案风格（正式/俏皮）', kind: 'settings' },
  { key: 'thresholds', label: '等级经验阈值', desc: '宠物七阶段成长所需经验', kind: 'settings' },
  { key: 'subjects', label: '科目体系', desc: '科目列表、启用开关与当前激活科目', kind: 'settings' },
  { key: 'presets', label: '快捷加减分预设', desc: '教师端一键加分按钮配置', kind: 'table' },
  { key: 'rules', label: '宠物状态规则', desc: '生病/饥饿等状态判定条件', kind: 'table' },
  { key: 'items', label: '商店道具', desc: '道具名称、价格与效果', kind: 'table' },
  { key: 'species', label: '宠物种类', desc: '种类、配色与成长阶段文案（头像文件不含在内）', kind: 'table' },
  {
    key: 'system',
    label: '系统参数',
    desc: '心跳超时、自动拉取间隔、备份容量/保留数等运维项',
    kind: 'settings',
  },
  { key: 'cloud', label: '云端连接', desc: '⚠️ Supabase 地址与密钥（含 service role，请妥善保管导出文件）', kind: 'settings' },
];

type Row = Record<string, unknown>;

function tableRows(table: string): Row[] {
  return getDb().prepare(`SELECT * FROM ${table} WHERE deleted_at IS NULL`).all() as Row[];
}

/** 导出指定类别 */
export function exportConfig(keys: string[]): Record<string, unknown> {
  const want = new Set(keys);
  const cfg = loadConfig();
  const data: Record<string, unknown> = {};

  if (want.has('display')) {
    data.display = {
      pointsUnit: getSetting('points_unit') ?? '积分',
      adminName: getSetting('admin_name') ?? '管理员',
      termName: getSetting('term_name') ?? '默认学期',
      uiStyle: cfg.uiStyle,
    };
  }
  if (want.has('thresholds')) {
    data.thresholds = { expThresholds: getExpThresholds(getDb()) };
  }
  if (want.has('subjects')) {
    data.subjects = {
      activeSubject: getSetting('active_subject') ?? '',
      subjectsConfig: (() => {
        try {
          return JSON.parse(getSetting('subjects_config') ?? '[]');
        } catch {
          return [];
        }
      })(),
    };
  }
  if (want.has('presets')) data.presets = tableRows('quick_presets');
  if (want.has('rules')) data.rules = tableRows('state_rules');
  if (want.has('items')) data.items = tableRows('items');
  if (want.has('species')) data.species = tableRows('species');
  if (want.has('system')) {
    data.system = {
      heartbeatTimeoutSec: cfg.heartbeatTimeoutSec,
      autoPullMinutes: cfg.autoPullMinutes,
      skipUpdateCheckDevice: cfg.skipUpdateCheckDevice,
      cloudBackupRetention: Number(getSetting('cloud_backup_retention')) || 10,
      backupMaxBytes: Number(getSetting('backup_max_bytes')) || 1073741824,
    };
  }
  if (want.has('cloud')) {
    data.cloud = {
      supabaseUrl: cfg.supabaseUrl,
      supabaseAnonKey: cfg.supabaseAnonKey,
      supabaseServiceKey: cfg.supabaseServiceKey,
    };
  }

  return {
    meta: {
      tool: 'classroom-pet-system-config',
      formatVersion: 1,
      appVersion: APP_VERSION,
      exportedAt: nowIso(),
      categories: keys.filter((k) => want.has(k)),
    },
    data,
  };
}

export interface ImportSummary {
  category: string;
  detail: string;
}

interface ImportPayload {
  meta?: { tool?: string; formatVersion?: number; categories?: string[] };
  data?: Record<string, unknown>;
}

const TABLE_OF_CATEGORY: Partial<Record<string, string>> = {
  presets: 'quick_presets',
  rules: 'state_rules',
  items: 'items',
  species: 'species',
};

function importTableRows(category: string, rows: unknown): ImportSummary {
  const table = TABLE_OF_CATEGORY[category];
  if (!table || !Array.isArray(rows)) return { category, detail: '格式无效，已跳过' };
  const db = getDb();
  const ts = nowIso();
  let n = 0;
  for (const r of rows as Row[]) {
    if (!r || typeof r !== 'object' || !r.id) continue;
    // updated_at 提到导入时刻：变更会随同步自动推到云端与其他设备
    applyRow(db, table, { ...r, updated_at: ts, created_at: typeof r.created_at === 'string' ? r.created_at : ts });
    n++;
  }
  return { category, detail: `已应用 ${n} 条` };
}

function importSettingsGroup(key: string, payload: unknown): ImportSummary | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  switch (key) {
    case 'display': {
      if (typeof p.pointsUnit === 'string') setSetting('points_unit', p.pointsUnit.trim() || '积分');
      if (typeof p.adminName === 'string') setSetting('admin_name', p.adminName.trim() || '管理员');
      if (typeof p.termName === 'string') setSetting('term_name', p.termName.trim() || '默认学期');
      if (p.uiStyle && typeof p.uiStyle === 'object') updateConfig({ uiStyle: p.uiStyle as never });
      return { category: key, detail: '展示与文案已更新' };
    }
    case 'thresholds': {
      const arr = (p as { expThresholds?: unknown }).expThresholds;
      if (
        Array.isArray(arr) &&
        arr.length === 7 &&
        arr.every((x) => typeof x === 'number' && Number.isFinite(x))
      ) {
        const clean = arr.map((x) => Math.max(0, Math.round(x as number)));
        clean[0] = 0;
        setSetting('exp_thresholds', JSON.stringify(clean));
        return { category: key, detail: '经验阈值已更新' };
      }
      return { category: key, detail: '格式无效，已跳过' };
    }
    case 'subjects': {
      if (typeof p.activeSubject === 'string') setSetting('active_subject', p.activeSubject.trim());
      if (Array.isArray(p.subjectsConfig)) setSetting('subjects_config', JSON.stringify(p.subjectsConfig));
      return { category: key, detail: '科目体系已更新' };
    }
    case 'system': {
      const patch: Parameters<typeof updateConfig>[0] = {};
      const s = p as {
        heartbeatTimeoutSec?: number; autoPullMinutes?: number; skipUpdateCheckDevice?: boolean;
      };
      if (typeof s.heartbeatTimeoutSec === 'number' && Number.isFinite(s.heartbeatTimeoutSec)) {
        patch.heartbeatTimeoutSec = Math.max(30, Math.min(3600, Math.round(s.heartbeatTimeoutSec)));
      }
      if (typeof s.autoPullMinutes === 'number' && Number.isFinite(s.autoPullMinutes)) {
        patch.autoPullMinutes = Math.max(0, Math.min(1440, Math.round(s.autoPullMinutes)));
      }
      if (typeof s.skipUpdateCheckDevice === 'boolean') patch.skipUpdateCheckDevice = s.skipUpdateCheckDevice;
      updateConfig(patch);
      const sys = p as { cloudBackupRetention?: number; backupMaxBytes?: number };
      if (typeof sys.cloudBackupRetention === 'number' && Number.isFinite(sys.cloudBackupRetention)) {
        setSetting('cloud_backup_retention', String(Math.max(1, Math.min(365, Math.round(sys.cloudBackupRetention)))));
      }
      if (typeof sys.backupMaxBytes === 'number' && Number.isFinite(sys.backupMaxBytes)) {
        setSetting('backup_max_bytes', String(Math.max(1, Math.round(sys.backupMaxBytes))));
      }
      return { category: key, detail: '系统参数已更新' };
    }
    case 'cloud': {
      const c = p as { supabaseUrl?: unknown; supabaseAnonKey?: unknown; supabaseServiceKey?: unknown };
      const patch: Parameters<typeof updateConfig>[0] = {};
      if (typeof c.supabaseUrl === 'string') {
        const url = c.supabaseUrl.trim();
        if (url) {
          try {
            const u = new URL(url);
            if (!(u.protocol === 'https:' && (u.hostname === 'supabase.co' || u.hostname.endsWith('.supabase.co')))) {
              return { category: key, detail: 'Supabase 地址无效（须 https://xxx.supabase.co），已跳过' };
            }
          } catch {
            return { category: key, detail: 'Supabase 地址无效，已跳过' };
          }
        }
        patch.supabaseUrl = url;
      }
      if (typeof c.supabaseAnonKey === 'string') patch.supabaseAnonKey = c.supabaseAnonKey.trim();
      if (typeof c.supabaseServiceKey === 'string') patch.supabaseServiceKey = c.supabaseServiceKey.trim();
      updateConfig(patch);
      return { category: key, detail: '云端连接已更新（下次同步做全量对账）' };
    }
    default:
      return null;
  }
}

/** 应用导入包：只处理 categories 里点名的类别；返回逐类结果摘要 */
export function importConfig(
  payload: ImportPayload,
  categories: string[]
): { ok: boolean; error?: string; results: ImportSummary[] } {
  if (!payload || payload.meta?.tool !== 'classroom-pet-system-config' || !payload.data) {
    return { ok: false, error: '不是有效的配置文件（meta.tool 不匹配或缺少 data）', results: [] };
  }
  const want = new Set(categories);
  const results: ImportSummary[] = [];
  for (const key of categories) {
    const cat = CATEGORIES.find((c) => c.key === key);
    if (!cat) continue;
    const payloadPart = payload.data[key];
    if (payloadPart === undefined) continue; // 包里没有该类，静默跳过
    if (cat.kind === 'table') {
      results.push(importTableRows(key, payloadPart));
    } else {
      const r = importSettingsGroup(key, payloadPart);
      if (r) results.push(r);
    }
  }
  void want;
  return { ok: true, results };
}
