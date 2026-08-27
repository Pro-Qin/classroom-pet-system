import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openMemoryDb, setDbForTest, closeDb, getDb, nowIso, type SqliteDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { applyPoints, revertPointEvents } from '../src/services/points.js';
import { buyItem } from '../src/services/pets.js';

/**
 * v0.4.5 新特性回归：
 *  - 积分冲正（追加式反向流水，幂等拒绝重复）
 *  - 背包新结构（id 主键）购买/使用
 *  - 统一配置迁移的导出/导入回路
 */

let db: SqliteDb;

beforeEach(() => {
  db = openMemoryDb();
  setDbForTest(db);
  migrate(db);
  seed(db);
});

afterEach(() => closeDb());

describe('积分冲正', () => {
  it('applyPoints 返回 eventId；revert 后学生积分复原并留下反向流水', () => {
    const stu = db.prepare(`SELECT id FROM students WHERE deleted_at IS NULL LIMIT 1`).get() as { id: string };
    const before = (db.prepare(`SELECT points FROM students WHERE id=?`).get(stu.id) as { points: number }).points;

    const r = applyPoints(getDb(), [stu.id], 8, '课堂表现', 'teacher');
    expect(r.applied).toBe(1);
    expect(r.events[0].eventId).toMatch(/^ev/);
    const mid = (db.prepare(`SELECT points FROM students WHERE id=?`).get(stu.id) as { points: number }).points;
    expect(mid).toBe(before + 8);

    const rev = revertPointEvents(getDb(), [r.events[0].eventId]);
    expect(rev.ok).toBe(true);
    expect(rev.reverted).toHaveLength(1);
    const after = (db.prepare(`SELECT points FROM students WHERE id=?`).get(stu.id) as { points: number }).points;
    expect(after).toBe(before);

    // 反向流水存在且引用原流水
    const row = db.prepare(`SELECT delta, reason, ref_event_id FROM point_events WHERE ref_event_id = ?`).get(r.events[0].eventId) as {
      delta: number;
      reason: string;
      ref_event_id: string;
    };
    expect(row.delta).toBe(-8);
    expect(row.reason).toContain('冲正');
  });

  it('同一流水不可被二次冲正', () => {
    const stu = db.prepare(`SELECT id FROM students WHERE deleted_at IS NULL LIMIT 1`).get() as { id: string };
    const r = applyPoints(getDb(), [stu.id], 5, '举手发言', 'teacher');
    const first = revertPointEvents(getDb(), [r.events[0].eventId]);
    expect(first.ok).toBe(true);
    const second = revertPointEvents(getDb(), [r.events[0].eventId]);
    expect(second.reverted).toHaveLength(0);
    expect(second.alreadyReverted).toContain(r.events[0].eventId);
  });

  it('批量加分的撤回一次性恢复所有学生', () => {
    const stus = (db.prepare(`SELECT id, points FROM students WHERE deleted_at IS NULL ORDER BY id LIMIT 3`).all() as { id: string; points: number }[]);
    if (stus.length < 2) return; // 种子不足则跳过
    const r = applyPoints(getDb(), stus.map((s) => s.id), -3, '纪律提醒', 'admin');
    expect(r.applied).toBe(stus.length);

    const ids = r.events.map((e) => e.eventId);
    const rev = revertPointEvents(getDb(), ids);
    expect(rev.ok).toBe(true);
    expect(rev.reverted).toHaveLength(ids.length);
    for (const s of stus) {
      const now = (db.prepare(`SELECT points FROM students WHERE id=?`).get(s.id) as { points: number }).points;
      expect(now).toBe(s.points);
    }
  });
});

describe('背包新结构（id 主键，可同步）', () => {
  it('同一道具连续购买累计数量且仅一行（带稳定 id）', async () => {
    // 造一个学生 + 宠物
    const ts = nowIso();
    db.prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at)
       VALUES ('bp_stu','BP1','背包生','', '', 1000, ?, ?)`
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO pets (id, student_id, species_id, name, exp, last_tick_at, created_at, updated_at)
       VALUES ('bp_pet','bp_stu','cat','宠','','2026-01-01T00:00:00Z',?,?)`
    ).run(ts, ts);

    const b1 = buyItem(getDb(), 'bp_stu', 'apple');
    expect(b1.ok).toBe(true);
    const b2 = buyItem(getDb(), 'bp_stu', 'apple');
    expect(b2.ok).toBe(true);
    const rows = db.prepare(`SELECT id, qty FROM backpacks WHERE student_id='bp_stu'`).all() as { id: string; qty: number }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('bp_stu|apple');
    expect(rows[0].qty).toBe(2);
  });
});

describe('宠物时间自然成长（后台批量、无离线惩罚）', () => {
  it('settleAllPets：三天没结算的宠物补 24 经验，属性不衰减（无惩罚）；刚结算过的不动', async () => {
    const { settleAllPets } = await import('../src/services/pets.js');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at)
       VALUES ('tick_stu','T99','打卡生','', '', 0, ?, ?)`
    ).run(ts, ts);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const justNow = new Date(Date.now() - 3600_000).toISOString();
    db.prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at)
       VALUES ('tick_stu2','T98','打卡生二号','', '', 0, ?, ?)`
    ).run(ts, ts);
    db.prepare(
      `INSERT INTO pets (id, student_id, species_id, name, exp, health, hungry, happy, clean, last_tick_at, created_at, updated_at)
       VALUES ('tick_pet','tick_stu','cat','钟表匠', 10, 100, 100, 100, 100, ?, ?, ?)`
    ).run(threeDaysAgo, ts, ts);
    db.prepare(
      `INSERT INTO pets (id, student_id, species_id, name, exp, health, hungry, happy, clean, last_tick_at, created_at, updated_at)
       VALUES ('tick_pet2','tick_stu2','cat','小钟', 5, 100, 100, 100, 100, ?, ?, ?)`
    ).run(justNow, ts, ts);

    const r = settleAllPets(getDb());
    expect(r.settled).toBe(1); // 只有超过 4 小时的那只
    expect(r.expTotal).toBe(24); // 3 天 × 8

    const a = db.prepare(`SELECT exp, hungry FROM pets WHERE id='tick_pet'`).get() as { exp: number; hungry: number };
    expect(a.exp).toBe(34); // 10 + 24
    expect(a.hungry).toBe(100); // 无离线惩罚：属性纹丝不动

    const b = db.prepare(`SELECT exp FROM pets WHERE id='tick_pet2'`).get() as { exp: number };
    expect(b.exp).toBe(5);
  });

  it('重复结算不重复计费（last_tick_at 记账位）', async () => {
    const { settleAllPets } = await import('../src/services/pets.js');
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO pets (id, student_id, species_id, name, exp, last_tick_at, created_at, updated_at)
       VALUES ('tick_pet3','tick_stu','cat','记账猫', 0, ?, ?, ?)`
    ).run(threeDaysAgo, ts, ts);
    settleAllPets(getDb());
    const after1 = (db.prepare(`SELECT exp FROM pets WHERE id='tick_pet3'`).get() as { exp: number }).exp;
    settleAllPets(getDb());
    const after2 = (db.prepare(`SELECT exp FROM pets WHERE id='tick_pet3'`).get() as { exp: number }).exp;
    expect(after1).toBe(24);
    expect(after2).toBe(24); // 第二次空转
  });
});

describe('统一配置导出/导入', () => {
  it('按类别导出→清空→导入恢复（数据一致且 updated_at 已刷新为可同步时间）', async () => {
    const { exportConfig, importConfig, CATEGORIES } = await import('../src/services/configTransfer.js');

    const picked = ['presets', 'items', 'rules', 'display', 'system'];
    const payload = exportConfig(picked);
    const snapshot = JSON.parse(JSON.stringify(payload)) as typeof payload;

    // 破坏现场
    getDb().prepare(`DELETE FROM quick_presets`).run();
    getDb().prepare(`UPDATE settings SET value='破坏' WHERE key='points_unit'`);

    const res = importConfig(snapshot.data ? snapshot : payload, []);
    void res;
    const full = importConfig(JSON.parse(JSON.stringify(payload)) as never, picked);
    expect(full.ok).toBe(true);
    const detailMap = Object.fromEntries(full.results.map((r) => [r.category, r.detail]));

    expect(detailMap['presets']).toContain('已应用');
    // 预设恢复
    const presetCount = (db.prepare(`SELECT COUNT(*) c FROM quick_presets`).get() as { c: number }).c;
    const beforeCount = ((payload.data as Record<string, unknown>).presets as unknown[]).length;
    expect(presetCount).toBe(beforeCount);
    // 展示类设置恢复
    const pu = (db.prepare(`SELECT value FROM settings WHERE key='points_unit'`).get() as { value: string }).value;
    expect(pu).toBe(((payload.data as Record<string, unknown>).display as { pointsUnit: string }).pointsUnit);

    // 导入行 updated_at 刷新 → 会被同步推走（与「1 分钟前」的 ISO 字符串比较）
    const freshTs = (db.prepare(`SELECT MAX(updated_at) m FROM quick_presets`).get() as { m: string }).m;
    expect(freshTs >= new Date(Date.now() - 60_000).toISOString()).toBe(true);
    void CATEGORIES;
  });

  it('无效文件被拒绝', async () => {
    const { importConfig } = await import('../src/services/configTransfer.js');
    const bad = importConfig({ meta: { tool: 'other' }, data: {} } as never, ['presets']);
    expect(bad.ok).toBe(false);
    expect(String(bad.error)).toContain('不是有效的配置文件');
  });
});
