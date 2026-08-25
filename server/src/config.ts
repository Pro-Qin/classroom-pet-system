import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** server/ 目录（src 或 dist 都在其下） */
export const ROOT = path.resolve(__dirname, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const DB_FILE = path.join(DATA_DIR, 'pet.db');
export const APP_VERSION = '0.2.3';
/** 默认（锁定）的 Gitee 更新源：管理端不可修改，仅支持此仓库 */
export const DEFAULT_GITEE_REPO = 'https://gitee.com/am-zzq/classroom-pet-system';

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export interface AppConfig {
  adminPasswordHash: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  giteeRepo: string;
  giteeEnabled: boolean;
  deviceId: string;
  /** token 签名密钥：独立随机值，任何接口都不返回（防推导伪造） */
  tokenSecret: string;
  /** 本设备（一体机）是否跳过开机更新检查 */
  skipUpdateCheckDevice: boolean;
}

const DEFAULTS: AppConfig = {
  adminPasswordHash: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseServiceKey: '',
  giteeRepo: DEFAULT_GITEE_REPO,
  giteeEnabled: true,
  deviceId: '',
  tokenSecret: '',
  skipUpdateCheckDevice: false,
};

export function loadConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveConfig(cfg: AppConfig): void {
  // 原子写入（临时文件 + rename）：避免并发写导致 tokenSecret 轮换/配置损坏
  const tmp = `${CONFIG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf-8');
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    /* 平台不支持时忽略 */
  }
  fs.renameSync(tmp, CONFIG_FILE);
}

/** 生效中的 Gitee 更新源：始终使用锁定默认值（管理端不可修改） */
export function effectiveGiteeRepo(cfg: AppConfig): string {
  return cfg.giteeRepo && cfg.giteeRepo !== DEFAULT_GITEE_REPO ? DEFAULT_GITEE_REPO : DEFAULT_GITEE_REPO;
}

export function updateConfig(patch: Partial<AppConfig>): AppConfig {
  const cfg = { ...loadConfig(), ...patch };
  saveConfig(cfg);
  return cfg;
}

export function getOrCreateDeviceId(): string {
  const cfg = loadConfig();
  if (!cfg.deviceId) {
    cfg.deviceId = crypto.randomUUID();
    saveConfig(cfg);
  }
  return cfg.deviceId;
}

/**
 * token 签名密钥：独立于 deviceId 的随机 32 字节（hex），
 * 首次生成后持久化，任何 API 都不会返回它（防离线推导伪造）。
 */
export function getOrCreateTokenSecret(): string {
  const cfg = loadConfig();
  if (!cfg.tokenSecret) {
    cfg.tokenSecret = crypto.randomBytes(32).toString('hex');
    saveConfig(cfg);
  }
  return cfg.tokenSecret;
}