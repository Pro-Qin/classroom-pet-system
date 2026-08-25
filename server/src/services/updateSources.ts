import { APP_VERSION } from '../config.js';

/**
 * 多源更新检查。
 * 优先级（用户指定）：GitHub 镜像站 → Gitee → GitHub。
 * 学校网络常封外网，GitHub 直连可能慢/不可达，因此先走国内可达的
 * GitHub 镜像（ghproxy 类），其次 Gitee，最后 GitHub 直连。
 *
 * 说明：GitHub 镜像站 = 同一仓库（Pro-Qin/classroom-pet-system）通过
 * ghproxy 一类反代域名访问；Gitee 为镜像仓库（am-zzq/classroom-pet-system，
 * 仅作版本探测，附件不一定存在）；最后 fallback 到 GitHub 直连。
 */

export interface UpdateSource {
  id: string;             // 'github | 'gitee' | 'github-mirror'
  label: string;
  kind: 'github' | 'gitee' | 'github-mirror';
  owner: string;
  repo: string;
}

export const GITHUB_OWNER = 'Pro-Qin';
export const GITHUB_REPO = 'classroom-pet-system';
export const GITEE_OWNER = 'am-zzq';
export const GITEE_REPO = 'classroom-pet-system';

/** GitHub 反代镜像候选（按稳定性排序，逐个探测）。 */
export const GITHUB_MIRRORS = [
  'https://ghfast.top',
  'https://gh-proxy.com',
  'https://ghproxy.net',
  'https://github.moeyy.xyz',
];

/** 多源（按优先级排序）。 */
export function getUpdateSources(): UpdateSource[] {
  return [
    { id: 'github-mirror', label: 'GitHub 镜像', kind: 'github-mirror', owner: GITHUB_OWNER, repo: GITHUB_REPO },
    { id: 'gitee', label: 'Gitee', kind: 'gitee', owner: GITEE_OWNER, repo: GITEE_REPO },
    { id: 'github', label: 'GitHub', kind: 'github', owner: GITHUB_OWNER, repo: GITHUB_REPO },
  ];
}

/** 某 source 的“最新 release” API 地址（git 或 gitee）。 */
function apiUrlFor(src: UpdateSource): string {
  if (src.kind === 'gitee') {
    return `https://gitee.com/api/v5/repos/${encodeURIComponent(src.owner)}/${encodeURIComponent(src.repo)}/releases/latest`;
  }
  return `https://api.github.com/repos/${encodeURIComponent(src.owner)}/${encodeURIComponent(src.repo)}/releases/latest`;
}

interface AssetInfo {
  name: string;
  browserDownloadUrl: string;
  size: number;
}

export interface SourceUpdate {
  id: string;
  label: string;
  kind: UpdateSource['kind'];
  latestVersion: string;
  assetName: string;
  assetUrl: string;      // 可直接下载的安装器地址
  reachable: boolean;
}

interface ApiRelease {
  tag_name?: string;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
}

async function fetchLatestRelease(src: UpdateSource, baseUrl: string): Promise<{ tag: string; assets: AssetInfo[] } | null> {
  try {
    const res = await fetch(baseUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'pet-campus-update' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as ApiRelease;
    if (!data.tag_name) return null;
    const assets = (data.assets ?? [])
      .filter((a) => a.name && a.browser_download_url)
      .map((a) => ({ name: a.name!, browserDownloadUrl: a.browser_download_url!, size: a.size ?? 0 }));
    return { tag: data.tag_name, assets };
  } catch {
    return null;
  }
}

/**
 * 探测一个 source 的最新版本与安装器下载地址。
 * 对 github-mirror：用真实 GitHub API 探测版本，并返回首个镜像可达的资产 URL。
 */
export async function inspectSource(src: UpdateSource): Promise<SourceUpdate | null> {
  const apiBase = apiUrlFor(src);
  // github-mirror 需要先判断某个镜像可达，再用镜像 URL 作为下载地址。
  if (src.kind === 'github-mirror') {
    // 用 GitHub API 查版本（镜像一般不代理 api.github.com，直接查真实源）。
    const rel = await fetchLatestRelease(src, apiBase);
    if (!rel) return null;
    // 找到安装器资产
    const installer = rel.assets.find((a) => a.name!.toLowerCase().endsWith('.exe')) ?? rel.assets[0];
    if (!installer) {
      return {
        id: src.id, label: src.label, kind: src.kind, latestVersion: rel.tag,
        assetName: '', assetUrl: '', reachable: false,
      };
    }
    // 拼接镜像前缀（返回第一个可用的？这里直接返回首个镜像拼接，由客户端兜底多镜像）
    const mirror = GITHUB_MIRRORS[0];
    const assetUrl = `${mirror}/${installer.browserDownloadUrl}`;
    return {
      id: src.id, label: src.label, kind: src.kind, latestVersion: rel.tag,
      assetName: installer.name, assetUrl, reachable: true,
    };
  }
  const rel = await fetchLatestRelease(src, apiBase);
  if (!rel) return null;
  const installer = rel.assets.find((a) => a.name!.toLowerCase().endsWith('.exe')) ?? rel.assets[0];
  return {
    id: src.id, label: src.label, kind: src.kind, latestVersion: rel.tag,
    assetName: installer?.name ?? '', assetUrl: installer?.browserDownloadUrl ?? '', reachable: !!installer,
  };
}

/**
 * 依次探测所有更新源，返回按优先级排序的结果数组。
 * 已缓存：10 分钟内复用，避免每次启动都打外网。
 */
const cache = new Map<string, { at: number; data: SourceUpdate[] }>();
const CACHE_MS = 10 * 60 * 1000;

export async function checkAllSources(): Promise<{ sources: SourceUpdate[]; highest: string | null }> {
  const key = 'multi-source';
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    const highest = highestVersion(hit.data);
    return { sources: hit.data, highest };
  }
  const order = getUpdateSources();
  const results: SourceUpdate[] = [];
  for (const src of order) {
    try {
      const r = await inspectSource(src);
      if (r) results.push(r);
    } catch {
      // 单个源失败不影响其它源
    }
  }
  cache.set(key, { at: Date.now(), data: results });
  return { sources: results, highest: highestVersion(results) };
}

function highestVersion(list: SourceUpdate[]): string | null {
  let best: string | null = null;
  for (const it of list) {
    if (best === null || compareVersions(it.latestVersion, best) > 0) best = it.latestVersion;
  }
  return best;
}

/** 简单语义版本比较（兼容 v 前缀）。 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVer(a);
  const pb = parseVer(b);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

function parseVer(s: string): number[] {
  return String(s ?? '').replace(/^v/i, '').split('.')
    .map((x) => parseInt(x ?? '0', 10))
    .filter((n) => Number.isFinite(n));
}

export const CURRENT_VERSION = APP_VERSION;
