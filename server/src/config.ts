import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** server/ 目录（src 或 dist 都在其下） */
export const ROOT = path.resolve(__dirname, '..');
/** 数据目录：可用 PET_DATA_DIR 覆盖（双端/多实例联调时各起一套独立数据） */
export const DATA_DIR = process.env.PET_DATA_DIR
  ? path.resolve(process.env.PET_DATA_DIR)
  : path.join(ROOT, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
export const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
export const DB_FILE = path.join(DATA_DIR, 'pet.db');
export const APP_VERSION = '0.4.26';
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
  /** 界面文案风格（正式/俏皮），分欢迎/学生/管理三区。默认全正式。 */
  uiStyle: UiStyleConfig;
  /** 后台进程失联心跳超时（秒）：默认 120（2 分钟），管理端可改。 */
  heartbeatTimeoutSec: number;
  /** 自动拉取云端增量的间隔（分钟）：0=关闭，默认 10。 */
  autoPullMinutes: number;
}

/** 单界面风格：formal=正式（默认），playful=俏皮（颜文字萌系）。 */
export type CopyVibe = 'formal' | 'playful';
/** 欢迎/管理界面的三态规则（用户偏好语义）。 */
export type VibeRule = 'global_formal' | 'student_playful' | 'global_playful';

export interface UiStyleConfig {
  /** 欢迎/首次运行界面规则 */
  welcome: VibeRule;
  /** 学生端界面（二选一） */
  student: CopyVibe;
  /** 管理端界面规则 */
  admin: VibeRule;
}

export const DEFAULT_UI_STYLE: UiStyleConfig = {
  welcome: 'global_formal',
  student: 'formal',
  admin: 'global_formal',
};

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
  uiStyle: DEFAULT_UI_STYLE,
  heartbeatTimeoutSec: 120,
  autoPullMinutes: 10,
};

/** 解析某一界面最终生效的风格（formal / playful）。 */
export function resolveCopyVibe(cfg: AppConfig, screen: 'welcome' | 'student' | 'admin'): CopyVibe {
  const s = { ...DEFAULT_UI_STYLE, ...(cfg.uiStyle ?? {}) };
  // “全局俏皮” = 全界面俏皮
  const globalPlayful = s.welcome === 'global_playful' || s.admin === 'global_playful';
  const studentPlayful = s.student === 'playful' || s.welcome === 'student_playful' || s.admin === 'student_playful';
  if (screen === 'student') return studentPlayful ? 'playful' : 'formal';
  // welcome / admin：global_playful 时俏皮，否则正式（student_playful / global_formal 均正式）
  if (globalPlayful) return 'playful';
  return 'formal';
}

/** 一次性取三区解析后的风格（供前端使用）。 */
export function resolveUiStyles(cfg: AppConfig): Record<'welcome' | 'student' | 'admin', CopyVibe> {
  return {
    welcome: resolveCopyVibe(cfg, 'welcome'),
    student: resolveCopyVibe(cfg, 'student'),
    admin: resolveCopyVibe(cfg, 'admin'),
  };
}

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