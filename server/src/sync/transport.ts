import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../config.js';

/** 云端存储的传输接口：引擎只依赖它，可替换为 mock / supabase */
export interface SyncTransport {
  readonly name: 'mock' | 'supabase';
  /** 拉取某个表在 since 之后更新的行（含已删除的墓碑行） */
  pull(table: string, sinceIso: string): Promise<Record<string, unknown>[]>;
  /** 推送行（upsert，含墓碑行） */
  push(table: string, rows: Record<string, unknown>[]): Promise<void>;
}

/**
 * Mock 传输：用本地 JSON 文件模拟云端数据库。
 * 生产用途：未配置 Supabase 时保证同步流程可走通（数据落在本机另一文件）。
 */
export class MockTransport implements SyncTransport {
  readonly name = 'mock' as const;
  private file: string;
  private store: Record<string, Record<string, unknown>[]> = {};

  constructor(file?: string) {
    this.file = file ?? path.join(DATA_DIR, 'cloud-mock.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.file)) {
        this.store = JSON.parse(fs.readFileSync(this.file, 'utf-8'));
      }
    } catch {
      this.store = {};
    }
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.store, null, 0));
  }

  private table(t: string): Record<string, Record<string, unknown>> {
    this.store[t] = this.store[t] ?? [];
    const map: Record<string, Record<string, unknown>> = {};
    for (const r of this.store[t]) map[r.id as string] = r;
    return map;
  }

  async pull(table: string, sinceIso: string): Promise<Record<string, unknown>[]> {
    const map = this.table(table);
    const out: Record<string, unknown>[] = [];
    for (const r of Object.values(map)) {
      const ua = (r.updated_at as string) ?? '';
      if (sinceIso && ua <= sinceIso) continue;
      out.push({ ...r });
    }
    return out;
  }

  async push(table: string, rows: Record<string, unknown>[]): Promise<void> {
    const map = this.table(table);
    for (const r of rows) map[r.id as string] = { ...r };
    this.store[table] = Object.values(map);
    this.save();
  }

  /** 测试辅助：查看云端当前数据 */
  dump(): Record<string, Record<string, unknown>[]> {
    return this.store;
  }

  /** 测试辅助：清空 */
  clear(): void {
    this.store = {};
    this.save();
  }
}

/**
 * Supabase 传输：REST API（无需额外依赖，Node 22 内置 fetch）。
 * 读用 anon key；写（upsert）需要 service_role key（服务端持有）。
 */
export class SupabaseTransport implements SyncTransport {
  readonly name = 'supabase' as const;
  constructor(
    private url: string,
    private anonKey: string,
    private serviceKey: string
  ) {}

  private headers(write: boolean): Record<string, string> {
    const key = write && this.serviceKey ? this.serviceKey : this.anonKey;
    return {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
  }

  /** 纵深防御：即使配置被绕过也拒绝向非 supabase.co 域名发送密钥 */
  private assertSafeUrl(): void {
    try {
      const u = new URL(this.url);
      const ok = u.protocol === 'https:' && (u.hostname === 'supabase.co' || u.hostname.endsWith('.supabase.co'));
      if (!ok) throw new Error('unsafe');
    } catch {
      throw new Error('Supabase 地址不安全（仅允许 https://*.supabase.co）');
    }
  }

  async pull(table: string, sinceIso: string): Promise<Record<string, unknown>[]> {
    this.assertSafeUrl();
    const q = sinceIso
      ? `${this.url}/rest/v1/${table}?select=*&updated_at=gt.${encodeURIComponent(sinceIso)}&order=updated_at.asc`
      : `${this.url}/rest/v1/${table}?select=*`;
    const res = await fetch(q, { headers: this.headers(false) });
    if (!res.ok) throw new Error(`Supabase pull ${table} 失败: ${res.status} ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>[];
  }

  async push(table: string, rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    this.assertSafeUrl();
    const res = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...this.headers(true), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`Supabase push ${table} 失败: ${res.status} ${await res.text()}`);
  }
}
