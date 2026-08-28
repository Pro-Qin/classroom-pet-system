const BASE = '/api';

export class ApiError extends Error {
  status?: number;
  retryAfterSec?: number;
  constructor(message: string, status?: number, retryAfterSec?: number) {
    super(message);
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

let pushPending = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;

/** 每次数据操作后【立即】把本地变更推送到云端。
 *  用户可能下一秒就关浏览器（服务端随心跳停止），因此不做秒级去抖：
 *  推送在途时的新写操作合并为 pending，完成后立即补推；被 429 时按
 *  服务端 retryAfterSec 延时补推。极端情况没推完也不会丢数据：
 *  本地 SQLite 已落盘，下次启动会自动补推上云。 */
function scheduleSyncPush(delayMs = 2000): void {
  if (pushInFlight) {
    // 已经有推送在途：标记一个待推送，等本次完成后立即再推一次。
    pushPending = true;
    return;
  }
  if (pushTimer) return; // 已排定，等待去抖窗口
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushInFlight = true;
    fetch(BASE + '/sync/push', { method: 'POST' })
      .then(async (res) => {
        // 被节流/失败：按服务端给的重试秒数补推一轮（只补一轮，防风暴）。
        // 之前这里是静默吞掉——写后推送被 429 丢弃后要等下一次写操作才带出来，
        // 多端场景表现为"我加了分另一端没收到"。
        if (!res.ok) pushPending = true;
      })
      .catch(() => {
        pushPending = true; // 网络抖动同样补推一轮
      })
      .finally(() => {
        pushInFlight = false;
        if (pushPending) {
          pushPending = false;
          scheduleSyncPush(2500);
        }
      });
  }, delayMs);
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string> | undefined),
  };
  const token = localStorage.getItem('pet_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(BASE + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; retryAfterSec?: number };
    throw new ApiError(d.error || `请求失败 (${res.status})`, res.status, d.retryAfterSec);
  }
  // 数据写操作后自动推送云端变更（去抖合并，不阻塞、不循环）
  if (!path.startsWith('/sync')) {
    const m = (opts.method ?? 'GET').toUpperCase();
    if (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
      scheduleSyncPush();
    }
  }
  return data as T;
}

export function setAuth(token: string, role: string, name: string): void {
  localStorage.setItem('pet_token', token);
  localStorage.setItem('pet_role', role);
  localStorage.setItem('pet_name', name);
}

export function clearAuth(): void {
  localStorage.removeItem('pet_token');
  localStorage.removeItem('pet_role');
  localStorage.removeItem('pet_name');
}

export function authInfo(): { role: string | null; name: string | null } {
  return {
    role: localStorage.getItem('pet_role'),
    name: localStorage.getItem('pet_name'),
  };
}

/** 上传文件（图片等） */
export async function upload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  const token = localStorage.getItem('pet_token');
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error || '上传失败');
  return data as T;
}