import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseTransport } from '../src/sync/transport.js';

/**
 * 传输层回归（stub 全局 fetch，不发真实网络请求）：
 *  - pull 翻页（Supabase REST 默认 max-rows 截断问题）
 *  - 读优先 service key（RLS 无匿名策略时不被致盲）
 *  - push 分块上传
 *  - 非 supabase 域名拒绝（防密钥外泄）
 */

interface Call {
  url: string;
  init: RequestInit;
}

const URL_ = 'https://unitproj.supabase.co';
const ANON = 'anon-unit-key';
const SVC = 'svc-unit-key';

let calls: Call[] = [];

/** 安装假 fetch；responder 决定每个请求返回什么 */
function install(responder?: (url: string, init: RequestInit) => { status: number; body: unknown }): void {
  calls = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const initReq = (init ?? {}) as RequestInit;
    const r = responder?.(url, initReq) ?? { status: 200, body: [] };
    calls.push({ url, init: initReq });
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  };
  vi.stubGlobal('fetch', fake);
}

function hdr(init: RequestInit): Record<string, string> {
  return init.headers as Record<string, string>;
}

function makeRangeRows(from: number, n: number): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `row_${from + i}`,
    name: `r${from + i}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-02T00:00:00.000Z',
    deleted_at: null,
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SupabaseTransport：地址安全守卫', () => {
  it.each([
    ['http://unitproj.supabase.co', '非 https'],
    ['https://unitproj.supabase.co.evil.com', '仿冒后缀'],
    ['https://evil.com', '外域'],
    ['ftp://unitproj.supabase.co', '其他协议'],
  ])('%s（%s）拒绝且不发出任何请求', async (bad) => {
    install();
    const t = new SupabaseTransport(bad, ANON, SVC);
    await expect(t.pull('students', '')).rejects.toThrow(/不安全|unsafe/i);
    await expect(t.push('students', [{ id: 'x' }])).rejects.toThrow(/不安全|unsafe/i);
    expect(calls).toHaveLength(0);
  });

  it('合法 *.supabase.co 放行', async () => {
    install();
    const t = new SupabaseTransport(URL_, ANON, SVC);
    await t.pull('students', '');
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].url.startsWith(`${URL_}/rest/v1/students`)).toBe(true);
  });
});

describe('SupabaseTransport：pull 翻页与鉴权', () => {
  it('超过单页上限时带 Range 继续翻页，直到短页结束', async () => {
    install((url, init) => {
      const m = /Range: (\d+)-(\d+)/.exec(`${hdr(init)?.['Range'] ?? ''}`);
      // 兜底从 URL 解析不了就从 headers 直接拿（上面正则针对日志风格，实际读 header 对象）
      const range = hdr(init)?.['Range'] ?? '';
      const [f] = range.split('-').map((n) => parseInt(n, 10));
      void m;
      const page = f === 0 ? 3 : f === 3 ? 3 : 1; // 共 7 行：3+3+1
      return { status: 206, body: makeRangeRows(f, page) };
    });
    const t = new SupabaseTransport(URL_, ANON, SVC);
    (t as unknown as { pageSize: number }).pageSize = 3;
    const rows = await t.pull('students', '');
    expect(rows.map((r) => r.id)).toEqual(['row_0', 'row_1', 'row_2', 'row_3', 'row_4', 'row_5', 'row_6']);
    expect(calls.map((c) => hdr(c.init)['Range'])).toEqual(['0-2', '3-5', '6-8']);
    // 时间过滤参数存在且排序固定（分页稳定性）
    expect(new URL(calls[0].url).searchParams.get('updated_at')).toBeNull();
    expect(calls[0].url).toContain('order=updated_at.asc');
  });

  it('since 游标以 updated_at=gt 过滤并正确编码', async () => {
    install();
    const t = new SupabaseTransport(URL_, ANON, SVC);
    await t.pull('point_events', '2026-08-27T03:04:05.000Z');
    const u = new URL(calls[0].url);
    expect(u.searchParams.get('updated_at')).toBe('gt.2026-08-27T03:04:05.000Z');
    expect(u.searchParams.get('select')).toBe('*');
  });

  it('读优先 service key（绕过 RLS 致盲），未配置时回退 anon', async () => {
    install();
    const t1 = new SupabaseTransport(URL_, ANON, SVC);
    await t1.pull('students', '');
    expect(hdr(calls[0].init)['apikey']).toBe(SVC);
    expect(hdr(calls[0].init)['Authorization']).toBe(`Bearer ${SVC}`);

    const t2 = new SupabaseTransport(URL_, ANON, '');
    await t2.pull('students', '');
    expect(hdr(calls[1].init)['apikey']).toBe(ANON);
  });

  it('非 2xx 抛错且错误包含状态码与响应片段', async () => {
    install(() => ({ status: 401, body: { message: 'Invalid API key' } }));
    const t = new SupabaseTransport(URL_, ANON, SVC);
    await expect(t.pull('students', '')).rejects.toThrow(/Supabase pull students 失败: 401/);
    await expect(t.pull('students', '')).rejects.toThrow(/Invalid API key/);
  });
});

describe('SupabaseTransport：push 分块', () => {
  it('按 500 行一块拆分成多个 POST（1200 行 → 3 个请求）', async () => {
    install();
    const t = new SupabaseTransport(URL_, ANON, SVC);
    const rows = Array.from({ length: 1200 }, (_, i) => ({ id: `e${i}`, delta: i }));
    await t.push('point_events', rows);
    expect(calls).toHaveLength(3);
    const sizes = calls.map((c) => (JSON.parse(String(c.init.body)) as unknown[]).length);
    expect(sizes).toEqual([500, 500, 200]);
    for (const c of calls) {
      expect(c.init.method).toBe('POST');
      expect(hdr(c.init)['Prefer']).toContain('merge-duplicates');
      expect(c.url).toBe(`${URL_}/rest/v1/point_events`);
    }
  });

  it('空数组直接返回，不发起请求', async () => {
    install();
    const t = new SupabaseTransport(URL_, ANON, SVC);
    await t.push('students', []);
    expect(calls).toHaveLength(0);
  });

  it('中途某块失败抛错并带上状态码', async () => {
    let seq = 0;
    install(() => (++seq === 2 ? { status: 413, body: 'payload too large' } : { status: 201, body: [] }));
    const t = new SupabaseTransport(URL_, ANON, SVC);
    (t as unknown as { pushChunk: number }).pushChunk = 2;
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    await expect(t.push('students', rows)).rejects.toThrow(/Supabase push students 失败: 413/);
  });
});
