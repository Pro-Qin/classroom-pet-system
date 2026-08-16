const BASE = '/api';

export class ApiError extends Error {}

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
    throw new ApiError((data as { error?: string }).error || `请求失败 (${res.status})`);
  }
  // 每次数据操作后自动把本地变更推送到云端（fire-and-forget，不阻塞、不循环）
  if (!path.startsWith('/sync')) {
    const m = (opts.method ?? 'GET').toUpperCase();
    if (m === 'POST' || m === 'PUT' || m === 'DELETE' || m === 'PATCH') {
      try {
        fetch(BASE + '/sync/push', { method: 'POST' }).catch(() => {});
      } catch {
        /* ignore */
      }
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