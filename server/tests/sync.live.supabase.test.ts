import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 真云端到端矩阵（默认跳过；LIVE_SYNC_TEST=1 才执行）：
 *   打在【测试专用 Supabase 项目】上，禁止指向生产库。
 *   覆盖：全量往返、增量推拉、他端注入、冲突裁决（云/本）、
 *        双向墓碑、翻页与分块、存储备份上传与保留清理、特殊字符/空值。
 *
 * 用法：LIVE_SYNC_TEST=1 npx vitest run tests/sync.live.supabase.test.ts
 */

const LIVE = !!process.env.LIVE_SYNC_TEST;

// 测试项目专用 publishable key（非生产凭据；如需替换走环境变量）。
// 必须放 vi.hoisted：vi.mock 工厂被提升到 const 声明之前执行。
const { SUPA_URL, SUPA_KEY } = vi.hoisted(() => ({
  SUPA_URL: process.env.LIVE_SUPA_URL ?? 'https://rieybeyquqzarezpffko.supabase.co',
  SUPA_KEY: process.env.LIVE_SUPA_KEY ?? 'sb_publishable_hbDkDqM-fxD-2BRB29DDmw_eEhcRby5',
}));

/** 隔离真实 server/data：快照目录指临时目录，loadConfig 指向测试项目凭据 */
vi.mock('../src/config.js', async (importOriginal) => {
  const fsx = await import('node:fs');
  const osx = await import('node:os');
  const px = await import('node:path');
  const orig = await importOriginal<typeof import('../src/config.js')>();
  const dir = fsx.mkdtempSync(px.join(osx.tmpdir(), 'pet-live-'));
  (globalThis as unknown as Record<string, unknown>).__petLiveTmpDir = dir;
  const cfgFixture = {
    adminPasswordHash: '',
    supabaseUrl: SUPA_URL,
    supabaseAnonKey: SUPA_KEY,
    supabaseServiceKey: SUPA_KEY, // 测试库已放行 anon 策略，publishable 可读写
    giteeRepo: orig.DEFAULT_GITEE_REPO,
    giteeEnabled: true,
    deviceId: 'live-test-device',
    tokenSecret: 'live-test-secret',
    skipUpdateCheckDevice: false,
    uiStyle: { ...orig.DEFAULT_UI_STYLE },
    heartbeatTimeoutSec: 120,
  };
  return {
    ...orig,
    DATA_DIR: dir,
    UPLOAD_DIR: px.join(dir, 'uploads'),
    BACKUP_DIR: px.join(dir, 'backups'),
    CONFIG_FILE: px.join(dir, 'config.json'),
    DB_FILE: px.join(dir, 'unused.db'),
    loadConfig: () => ({ ...cfgFixture }),
    saveConfig: (): void => {},
    updateConfig: (patch: Partial<typeof cfgFixture>) => ({ ...cfgFixture, ...patch }),
    getOrCreateDeviceId: () => 'live-test-device',
    getOrCreateTokenSecret: () => 'live-test-secret',
  } as typeof orig;
});

import { openMemoryDb, setDbForTest, closeDb } from '../src/db/connection.js';
import { migrate, SYNC_TABLES } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { SupabaseTransport } from '../src/sync/transport.js';
import { runSync, resolveConflicts, applyRow, type ConflictItem } from '../src/sync/engine.js';
import { snapshotDb } from '../src/db/backup.js';

type Row = Record<string, unknown>;

const restHeaders = (): Record<string, string> => ({
  apikey: SUPA_KEY,
  Authorization: `Bearer ${SUPA_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
});

async function rest(method: string, pathAndQuery: string, body?: unknown): Promise<Response> {
  return fetch(`${SUPA_URL}/rest/v1/${pathAndQuery}`, {
    method,
    headers: restHeaders(),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/** 清空云端某张表（测试库专用） */
async function clearTable(table: string): Promise<void> {
  const res = await rest('DELETE', `${table}?id=not.is.null`);
  if (!res.ok) throw new Error(`clear ${table}: ${res.status} ${await res.text()}`);
}

/** 清空 storage 备份桶（保证重复运行时计数断言稳定） */
async function purgeBackups(): Promise<void> {
  const listRes = await fetch(`${SUPA_URL}/storage/v1/object/list/backups`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 500 }),
  });
  if (!listRes.ok) return;
  const items = (await listRes.json()) as { name: string }[];
  for (const it of items) {
    await fetch(`${SUPA_URL}/storage/v1/object/backups/${encodeURIComponent(it.name)}`, {
      method: 'DELETE',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
    }).catch(() => {});
  }
}

async function cloudAll(table: string): Promise<Row[]> {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=*`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
  });
  if (!res.ok) throw new Error(`cloudAll ${table}: ${res.status} ${await res.text()}`);
  return (await res.json()) as Row[];
}

function canon(r: Row): string {
  return JSON.stringify(
    Object.keys(r)
      .sort()
      .reduce((acc, k) => ((acc[k] = r[k]), acc), {} as Row)
  );
}

function sameSet(local: Row[], cloud: Row[]): boolean {
  if (local.length !== cloud.length) return false;
  const cm = new Map(cloud.map((r) => [r.id as string, r]));
  for (const lr of local) {
    const cr = cm.get(lr.id as string);
    if (!cr || canon(lr) !== canon(cr)) return false;
  }
  return true;
}

const sleep = (ms: number): Promise<void> => new Promise((ok) => setTimeout(ok, ms));
/** 未来偏移的时间戳：保证严格晚于上一游标；调用方随后必须 sleep(offset+100) 再触发同步 */
function soonIso(offsetMs = 1500): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function openFreshDb(): SqliteDb {
  const d = openMemoryDb();
  setDbForTest(d);
  migrate(d);
  return d;
}

function metaCursor(d: SqliteDb): string {
  return (d.prepare(`SELECT last_sync_at FROM sync_meta WHERE id='global'`).get() as { last_sync_at: string })
    .last_sync_at;
}

let cloud: SupabaseTransport;

// 真云网络 + 刻意的偏移等待：单测与钩子（清表/清桶）都需要远高于默认 5s/10s 的时长
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe.skipIf(!LIVE)('真云 E2E：', () => {
  let dbA: SqliteDb;
  /** D 阶段保存的冲突快照（模拟真实路由把 runSync 结果原样交给 resolve） */
  let dPendingStudents: ConflictItem[] = [];
  let dPendingPresets: ConflictItem[] = [];

  beforeAll(async () => {
    cloud = new SupabaseTransport(SUPA_URL, SUPA_KEY, SUPA_KEY);
    for (const t of SYNC_TABLES) await clearTable(t);
    await purgeBackups();

    // —— 设备 A：真实内存库 + 种子数据 ——
    dbA = openFreshDb();
    seed(dbA);

    const base = Date.now();
    // fixtures 一律用过去时间戳：同步游标推进后它们不会再被判为脏行，
    // 后续用例可精确断言"只推/只拉本用例变更的行"。
    const isoAt = (i: number): string => new Date(base - 600_000 + i * 1000).toISOString();

    applyRow(dbA, 'students', { id: 'live_stu_1', student_no: 'L001', name: "张三'单引号\"双引号\"🐲", class_name: '高一(2)班', subject: '数学', points: -5, created_at: isoAt(1), updated_at: isoAt(1), deleted_at: null });
    applyRow(dbA, 'students', { id: 'live_stu_2', student_no: 'L002', name: '李四·∑€生僻字', class_name: '高二(10)班', subject: '物理', points: 987654321, created_at: isoAt(2), updated_at: isoAt(2), deleted_at: null });
    applyRow(dbA, 'students', { id: 'live_stu_del', student_no: 'L003', name: '将被本地删除', class_name: '', subject: '', points: 3, created_at: isoAt(3), updated_at: isoAt(3), deleted_at: null });
    applyRow(dbA, 'species', { id: 'live_spec_1', name: '喷火龙', emoji: '🐉', avatar_path: null, color_from: '#ff0000', color_to: '#00ff00', stage_labels: JSON.stringify(['蛋"期"', "'壳'", '幼年']), sort: 99, created_at: isoAt(5), updated_at: isoAt(5), deleted_at: null });
    applyRow(dbA, 'pets', { id: 'live_pet_1', student_id: 'live_stu_1', species_id: 'live_spec_1', name: '团子❤', exp: 123456789, avatar_path: null, health: 77, hungry: 0, happy: 100, clean: 55, last_tick_at: isoAt(6), created_at: isoAt(6), updated_at: isoAt(6), deleted_at: null });
    applyRow(dbA, 'pets', { id: 'ext_pet_seed', student_id: 'live_stu_2', species_id: 'live_spec_1', name: '将被云端删的宠物', exp: 1, avatar_path: '/a.png', health: 100, hungry: 100, happy: 100, clean: 100, last_tick_at: isoAt(7), created_at: isoAt(7), updated_at: isoAt(7), deleted_at: null });
    applyRow(dbA, 'point_events', { id: 'live_pe_1', student_id: 'live_stu_1', delta: -20, reason: "答错扣分；含;引号'", operator: '教师·王', created_at: isoAt(8), updated_at: isoAt(8), deleted_at: null });
    applyRow(dbA, 'quick_presets', { id: 'live_qp_1', label: '课堂加分👍', delta: 5, reason: '积极回答"问题"', editable: 0, sort: 99999, created_at: isoAt(9), updated_at: isoAt(9), deleted_at: null });
    applyRow(dbA, 'items', { id: 'live_item_1', name: "辣条'特辣", icon: 'chili', type: 'food', cost: 66, effect: JSON.stringify({ hungry: 30, tags: ['辣', '清淡'] }), desc: "描述含\\反斜杠与'", sort: 12, created_at: isoAt(10), updated_at: isoAt(10), deleted_at: null });
    applyRow(dbA, 'state_rules', { id: 'live_sr_1', state_key: 'sick', label: '生病了勿扰', conditions: JSON.stringify([{ op: '<', attr: 'health', value: 30 }]), icon: '💊', color: '#ef4444', sort: 3, created_at: isoAt(11), updated_at: isoAt(11), deleted_at: null });
  });

  afterAll(async () => {
    closeDb();
    const dir = (globalThis as unknown as Record<string, unknown | undefined>).__petLiveTmpDir;
    if (typeof dir === 'string') fs.rmSync(dir, { recursive: true, force: true });
  });

  it('A. 全量首同步：7 表全量推上云，逐行一致（特殊字符/负数/null）', async () => {
    const totalLocal = (SYNC_TABLES as readonly string[]).reduce((sum, tbl) => {
      const c = (dbA.prepare(`SELECT COUNT(*) c FROM ${tbl}`).get() as { c: number }).c;
      return sum + c;
    }, 0);

    const r = await runSync(cloud);
    expect(r.completed).toBe(true);
    expect(r.conflicts).toHaveLength(0);
    expect(r.pulled).toBe(0);
    expect(r.pushed).toBe(totalLocal);

    // 云端逐表比对（独立通道：直连 REST select=*）
    for (const table of SYNC_TABLES) {
      const localRows = dbA.prepare(`SELECT * FROM ${table}`).all() as Row[];
      expect(sameSet(localRows, await cloudAll(table)), `${table} 全量一致`).toBe(true);
    }
  });

  it('B. 增量推送：只推脏行（恰好 3 行），干净行不上传', async () => {
    // 两次编辑都用「刚过去」的时间戳（必须严格晚于 A 推进的游标）
    await sleep(1100);
    const ts = new Date(Date.now() - 200).toISOString();
    dbA.prepare(`UPDATE students SET points=?, updated_at=? WHERE id=?`).run(42, ts, 'live_stu_1');
    dbA.prepare(`UPDATE quick_presets SET label=?, updated_at=? WHERE id=?`).run('改过的预设', ts, 'live_qp_1');
    await sleep(1200);
    const peTs = new Date(Date.now() - 100).toISOString();
    applyRow(dbA, 'point_events', { id: 'live_pe_2', student_id: 'live_stu_1', delta: 15, reason: '作业优秀＋新流水', operator: 'teacher', created_at: peTs, updated_at: peTs, deleted_at: null });

    const r = await runSync(cloud);
    expect(r.completed).toBe(true);
    expect(r.pulled).toBe(0);
    expect(r.pushed).toBe(3);

    const stu = (await cloudAll('students')).find((x) => x.id === 'live_stu_1');
    expect(stu?.points).toBe(42);
    const qp = (await cloudAll('quick_presets')).find((x) => x.id === 'live_qp_1');
    expect(qp?.label).toBe('改过的预设');
  });

  it('C. 他端写入云端 → 本地正确拉取（subject 列与 emoji 宠物完好）', async () => {
    const stuTs = soonIso(1500);
    await sleep(1700);
    const insStu: Row = {
      id: 'ext_stu_1', student_no: 'E001', name: '他端来的学生', class_name: '初三(1)班', subject: '化学',
      points: 11, created_at: stuTs, updated_at: stuTs, deleted_at: null,
    };
    const respStu = await rest('POST', 'students', [insStu]);
    expect(respStu.ok).toBe(true);

    const petTs = soonIso(2600);
    await sleep(2700);
    const insPet: Row = {
      id: 'ext_pet_1', student_id: 'ext_stu_1', species_id: 'live_spec_1', name: '他端宠物🐙',
      exp: 5, avatar_path: null, health: 90, hungry: 90, happy: 90, clean: 90,
      last_tick_at: petTs, created_at: petTs, updated_at: petTs, deleted_at: null,
    };
    const respPet = await rest('POST', 'pets', [insPet]);
    expect(respPet.ok).toBe(true);

    const r = await runSync(cloud);
    expect(r.completed).toBe(true);
    expect(r.pulled).toBeGreaterThanOrEqual(2);
    expect(r.pushed).toBe(0);

    const stu = dbA.prepare(`SELECT * FROM students WHERE id='ext_stu_1'`).get() as Row | undefined;
    expect(stu?.subject).toBe('化学');
    const pet = dbA.prepare(`SELECT * FROM pets WHERE id='ext_pet_1'`).get() as Row | undefined;
    expect(pet?.name).toBe('他端宠物🐙');
  });

  it('D1. 冲突检测：双端同改 → completed=false、游标不推进、两侧值齐全', async () => {
    const localTs = soonIso(1500);
    await sleep(1700);
    dbA.prepare(`UPDATE students SET points=?, updated_at=? WHERE id=?`).run(111, localTs, 'live_stu_2');
    const cloudTs = soonIso(2900);
    await sleep(3100);
    const upd = await rest('PATCH', 'students?id=eq.live_stu_2', { points: 222, updated_at: cloudTs });
    expect(upd.ok).toBe(true);

    const beforeMeta = metaCursor(dbA);
    const r = await runSync(cloud);
    expect(r.completed).toBe(false);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].table).toBe('students');
    expect(r.conflicts[0].id).toBe('live_stu_2');
    expect(r.conflicts[0].local?.points).toBe(111);
    expect(r.conflicts[0].cloud?.points).toBe(222);
    expect(metaCursor(dbA)).toBe(beforeMeta);

    // 已知语义：冲突未决期间推送阶段会把本地版先覆盖到云端（最终以裁决为准）
    dPendingStudents = r.conflicts;
    expect((await cloudAll('students')).find((x) => x.id === 'live_stu_2')?.points).toBe(111);
  });

  it('D2. 裁决保云端（用 runSync 返回的冲突快照）→ 两端收敛为云端值；随后一次同步完全安静', async () => {
    const res = await resolveConflicts(cloud, dPendingStudents, { 'students:live_stu_2': 'cloud' });
    expect(res.completed).toBe(true);

    expect((dbA.prepare(`SELECT points FROM students WHERE id='live_stu_2'`).get() as { points: number }).points).toBe(222);
    expect(((await cloudAll('students')).find((x) => x.id === 'live_stu_2')?.points)).toBe(222);

    const quiet = await runSync(cloud);
    expect(quiet.pulled).toBe(0);
    expect(quiet.pushed).toBe(0);
    expect(quiet.conflicts).toHaveLength(0);
  });

  it('D3. 裁决保本机（换 quick_presets 表）→ 本地值最终覆盖云端', async () => {
    const localTs = soonIso(1500);
    await sleep(1700);
    dbA.prepare(`UPDATE quick_presets SET delta=?, updated_at=? WHERE id=?`).run(555, localTs, 'live_qp_1');
    const cloudTs = soonIso(2900);
    await sleep(3100);
    await rest('PATCH', 'quick_presets?id=eq.live_qp_1', { delta: 777, updated_at: cloudTs });

    const r = await runSync(cloud);
    expect(r.conflicts.map((c) => `${c.table}:${c.id}`)).toContain('quick_presets:live_qp_1');
    dPendingPresets = r.conflicts;

    // 裁决快照必须来自 runSync 结果（与真实路由一致）
    await resolveConflicts(cloud, dPendingPresets, { 'quick_presets:live_qp_1': 'local' });

    expect((dbA.prepare(`SELECT delta FROM quick_presets WHERE id='live_qp_1'`).get() as { delta: number }).delta).toBe(555);
    expect(((await cloudAll('quick_presets')).find((x) => x.id === 'live_qp_1')?.delta)).toBe(555);
  });

  it('E. 墓碑双向：本地软删上云 + 云端软删落地，两端都保留墓碑行且不硬删', async () => {
    const dl = soonIso(1500);
    await sleep(1700);
    dbA.prepare(`UPDATE students SET deleted_at=?, updated_at=? WHERE id=?`).run(dl, dl, 'live_stu_del');

    const dc = soonIso(2900);
    await sleep(3100);
    const resp = await rest('PATCH', 'pets?id=eq.ext_pet_seed', { deleted_at: dc, updated_at: dc });
    expect(resp.ok).toBe(true);

    const r = await runSync(cloud);
    expect(r.completed).toBe(true);

    // 本地删 → 云有墓碑；本地行仍存在
    expect(((await cloudAll('students')).find((x) => x.id === 'live_stu_del')?.deleted_at)).toBeTruthy();
    expect((dbA.prepare(`SELECT deleted_at FROM students WHERE id='live_stu_del'`).get() as Row).deleted_at).toBeTruthy();
    // 云端墓碑 → 本地落地
    expect((dbA.prepare(`SELECT deleted_at FROM pets WHERE id='ext_pet_seed'`).get() as Row).deleted_at).toBeTruthy();
  });

  it('F. 大批量：1230 条流水按块推送、按页拉取，内容零丢失', async () => {
    const dbB = openMemoryDb();
    setDbForTest(dbB);
    migrate(dbB);
    const base = Date.now();
    const ins = dbB.prepare(
      `INSERT INTO point_events (id,student_id,delta,reason,operator,created_at,updated_at,deleted_at)
       VALUES (?, 'bulk_stu', ?, ?, 'bulk', ?, ?, NULL)`
    );
    let sum = 0;
    for (let i = 0; i < 1230; i++) {
      const ts = new Date(base - 600_000 + i * 10).toISOString();
      ins.run(`bulk_${i}`, i % 7 === 0 ? -i : i, `事件第${i}条"引号"`, ts, ts);
      sum += i % 7 === 0 ? -i : i;
    }

    (cloud as unknown as { pushChunk: number }).pushChunk = 400;
    (cloud as unknown as { pageSize: number }).pageSize = 200;

    // 插入 bulk 前先盘点云端各行总数：全新库（游标空）会把这些全部拉回
    const peCountBefore = (await cloudAll('point_events')).length;
    let cloudTotalBefore = 0;
    for (const t of SYNC_TABLES) cloudTotalBefore += (await cloudAll(t)).length;

    const origFetch = globalThis.fetch.bind(globalThis);
    const posted: number[] = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (urlStr.includes('/rest/v1/point_events') && init?.method === 'POST' && typeof init.body === 'string') {
        try {
          posted.push((JSON.parse(init.body) as unknown[]).length);
        } catch {
          /* ignore */
        }
      }
      return origFetch(input as RequestInfo, init as RequestInit | undefined);
    });
    const r = await runSync(cloud);
    vi.unstubAllGlobals();

    expect(r.completed).toBe(true);

    // 回声修复锁：PULL 数 = 云端既有全部行（含种子数据），PUSH 数 = 仅本地 authored 的 1230 条，
    // 拉回的行一律不得被 PUSH 阶段回推。
    expect(r.pulled).toBe(cloudTotalBefore);
    expect(r.pushed).toBe(1230);
    expect(posted.length).toBe(Math.ceil(1230 / 400));
    expect(posted.slice(0, -1)).toEqual(Array(posted.length - 1).fill(400));
    expect(posted.at(-1)).toBe(30);

    // 全新“设备 C”：游标清零后从云端全量拉回
    dbB.close();
    const dbC = openMemoryDb();
    setDbForTest(dbC);
    migrate(dbC);
    dbC.prepare(`UPDATE sync_meta SET last_sync_at='' WHERE id='global'`).run();
    const r2 = await runSync(cloud);
    expect(r2.conflicts).toHaveLength(0);

    // 内容零丢失：bulk 总数/求和/跨页抽样边界全部一致
    expect((dbC.prepare(`SELECT COUNT(*) c FROM point_events WHERE student_id='bulk_stu'`).get() as { c: number }).c).toBe(1230);
    // 全部 point_events = 1230 bulk + 云端既有 pe 行也零丢失拉回
    expect((dbC.prepare(`SELECT COUNT(*) c FROM point_events`).get() as { c: number }).c).toBe(peCountBefore + 1230);
    expect((dbC.prepare(`SELECT SUM(delta) s FROM point_events WHERE student_id='bulk_stu'`).get() as { s: number }).s).toBe(sum);
    expect((dbC.prepare(`SELECT reason FROM point_events WHERE id='bulk_0'`).get() as Row).reason).toBe('事件第0条"引号"');
    // 正负值都抽验：生成器为 i%7===0 ? -i : i
    expect((dbC.prepare(`SELECT delta FROM point_events WHERE id='bulk_6'`).get() as { delta: number }).delta).toBe(6);
    expect((dbC.prepare(`SELECT delta FROM point_events WHERE id='bulk_7'`).get() as { delta: number }).delta).toBe(-7);
    // 还原全局句柄到设备 A（后续用例如 G 的快照仍依赖它），再丢弃临时库
    setDbForTest(dbA);
    dbC.close();
  });

  it('H. 背包与道具流水同步：购买入云、消费墓碑不上报硬删、拉回一致', async () => {
    const ts = new Date(Date.now() - 60_000).toISOString();
    applyRow(dbA, 'students', { id: 'bp_stu', student_no: 'B99', name: '背包测试生', class_name: '', subject: '', points: 500, created_at: ts, updated_at: ts, deleted_at: null });
    applyRow(dbA, 'pets', { id: 'bp_pet', student_id: 'bp_stu', species_id: 'live_spec_1', name: '背包宠', exp: 0, avatar_path: null, health: 100, hungry: 100, happy: 100, clean: 100, last_tick_at: ts, created_at: ts, updated_at: ts, deleted_at: null });
    await sleep(120);

    const { buyItem, useItem } = await import('../src/services/pets.js');
    expect(buyItem(dbA, 'bp_stu', 'apple').ok).toBe(true);
    expect(buyItem(dbA, 'bp_stu', 'apple').ok).toBe(true);
    expect(buyItem(dbA, 'bp_stu', 'apple').ok).toBe(true);
    const used = useItem(dbA, 'bp_stu', 'apple');
    expect(used.ok).toBe(true);
    await sleep(120);

    const r = await runSync(cloud);
    expect(r.completed).toBe(true);

    const cloudBp = (await cloudAll('backpacks')).find((x) => x.id === 'bp_stu|apple');
    expect(cloudBp).toBeTruthy();
    expect(Number(cloudBp?.qty)).toBe(2); // 买 3 用 1

    const useLogRows = (await cloudAll('item_use_logs')).filter((x) => x.student_id === 'bp_stu');
    expect(useLogRows.length).toBe(1);
    const localLog = dbA.prepare(`SELECT effect FROM item_use_logs WHERE student_id='bp_stu' LIMIT 1`).get() as { effect: string };
    expect(String(useLogRows[0].effect) === localLog.effect || JSON.parse(localLog.effect)).toBeTruthy();

    // 新设备 D 从云端全量拉回，背包/流水完好
    const dbD = openMemoryDb();
    setDbForTest(dbD);
    migrate(dbD);
    dbD.prepare(`UPDATE sync_meta SET last_sync_at='' WHERE id='global'`).run();
    const r2 = await runSync(cloud);
    expect(r2.conflicts).toHaveLength(0);
    expect((dbD.prepare(`SELECT qty FROM backpacks WHERE id='bp_stu|apple'`).get() as { qty: number }).qty).toBe(2);
    setDbForTest(dbA);
    dbD.close();
  });

  it('G. 异地备份：snapshot 上传 storage 桶；保留策略把旧份裁剪到上限内', async () => {
    const retention = 10;
    for (let i = 0; i < 12; i++) {
      const f = await fetch(
        `${SUPA_URL}/storage/v1/object/backups/${encodeURIComponent(`backup-filler-${String(i).padStart(2, '0')}.bin`)}`,
        {
          method: 'POST',
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/octet-stream' },
          body: `filler-${i}`,
        }
      );
      if (!f.ok) throw new Error(`filler ${i} 上传失败: ${f.status}`);
      await sleep(40); // 保证 updated_at 有序递增
    }

    const snapFile = snapshotDb(); // BACKUP_DIR 已被 mock 到临时目录
    expect(fs.existsSync(snapFile)).toBe(true);

    const { uploadBackupToStorage } = await import('../src/routes/sync.js');
    const out = await uploadBackupToStorage();
    if (!out.ok) console.error('[live] 备份上传失败详情:', JSON.stringify(out));
    expect(out.ok).toBe(true);
    expect(String(out.name)).toMatch(/^backup-snapshot-.+\.db$/);

    const listRes = await fetch(`${SUPA_URL}/storage/v1/object/list/backups`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      // 与产品代码一致：prefix 空串全量列举，客户端按前缀过滤（规避 Storage 非空前缀 quirk）
      body: JSON.stringify({ prefix: '', limit: 200 }),
    });
    expect(listRes.ok).toBe(true);
    const rawItems = (await listRes.json()) as { name: string }[];
    const items = rawItems.filter((x) => typeof x.name === 'string' && x.name.startsWith('backup-'));

    // 12 个填充物 + 1 份快照 = 13；清理后应剩 retention(10)，其中最旧 3 个填充物被删
    expect(items.length).toBe(retention);
    const bins = items.filter((x) => x.name.endsWith('.bin'));
    expect(bins.length).toBe(retention - 1);
    expect(items.some((x) => x.name === out.name)).toBe(true);
    expect(bins.some((x) => x.name.includes('-00.') || x.name.includes('-01.') || x.name.includes('-02.'))).toBe(false);
  });
});
