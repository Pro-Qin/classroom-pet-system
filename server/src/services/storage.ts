import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config.js';

/**
 * 头像文件上云：把本地上传的头像同步推送一份到 Supabase Storage 的
 * avatars 公开桶，数据库里存可直接访问的云端 URL。
 * 这样多设备同步 avatar_path 后，任何设备都能显示同一张图。
 *
 * 策略：best-effort —— 云端不可用/未配置时优雅回退本地路径，
 * 绝不让头像上传因网络问题失败。
 */

const AVATAR_BUCKET = 'avatars';

function validCloudUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (u.hostname === 'supabase.co' || u.hostname.endsWith('.supabase.co'));
  } catch {
    return false;
  }
}

/** Supabase 是否已配置可用 */
export function avatarCloudReady(): boolean {
  const cfg = loadConfig();
  return !!(cfg.supabaseUrl && cfg.supabaseAnonKey && cfg.supabaseServiceKey && validCloudUrl(cfg.supabaseUrl));
}

/** 确保 avatars 公开桶存在（best-effort：失败不影响后续上传尝试） */
async function ensureBucket(url: string, anonKey: string, serviceKey: string): Promise<void> {
  try {
    await fetch(url + '/storage/v1/bucket', {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: AVATAR_BUCKET, public: true }),
    });
    // 已存在/RLS 拒绝等情况一律忽略 —— 由实际上传验证
  } catch {
    /* ignore */
  }
}

/**
 * 上传本地图片文件到云端 avatars 桶。
 * 成功返回公开 URL；未配置/失败返回 null（调用方回退本地路径）。
 */
export async function uploadAvatarToCloud(localPath: string): Promise<string | null> {
  if (!avatarCloudReady()) return null;
  const cfg = loadConfig();
  try {
    await ensureBucket(cfg.supabaseUrl, cfg.supabaseAnonKey, cfg.supabaseServiceKey);
    const name = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${path.extname(localPath).toLowerCase() || '.png'}`;
    const res = await fetch(`${cfg.supabaseUrl}/storage/v1/object/${AVATAR_BUCKET}/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseServiceKey}`,
        'Content-Type': 'application/octet-stream',
      },
      body: fs.readFileSync(localPath),
    });
    if (!res.ok) {
      console.warn('[avatar-cloud] 上传失败:', res.status, (await res.text()).slice(0, 120));
      return null;
    }
    return `${cfg.supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/${name}`;
  } catch (e) {
    console.warn('[avatar-cloud] 上传异常:', (e as Error).message);
    return null;
  }
}
