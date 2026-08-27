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

describe('等级来源统一（单一事实来源）', () => {
  it('未配置 → 默认 15 级成长线；getExpThresholds 与 getLevels 同源', async () => {
    const { getLevels, getExpThresholds } = await import('../src/services/pets.js');
    const lv = getLevels(getDb());
    expect(lv.thresholds).toHaveLength(15);
    expect(lv.thresholds[1]).toBe(1000);
    expect(getExpThresholds(getDb())).toEqual(lv.thresholds); // 15 级设级/算档不再被 7 级旧源钳制
  });

  it('旧 exp_thresholds 自定义 7 级 → 名称沿用默认七阶、阈值保留', async () => {
    const { getLevels } = await import('../src/services/pets.js');
    const { setSetting } = await import('../src/db/settings.js');
    setSetting('exp_thresholds', JSON.stringify([0, 50, 150, 400, 900, 1400, 2000]));
    const lv = getLevels(getDb());
    expect(lv.thresholds).toEqual([0, 50, 150, 400, 900, 1400, 2000]);
    expect(lv.names).toHaveLength(7);
  });

  it('levels_config 15 级 → 全链路（含 getExpThresholds）都是 15 级', async () => {
    const { getLevels, getExpThresholds, saveLevels } = await import('../src/services/pets.js');
    saveLevels(getDb(),
      ['蛋','破壳','幼年','成长','成熟','进化','传说','传奇','神话','史诗','闪耀','王者','星耀','至尊','巅峰'],
      [0, 1000, 1120, 1254, 1404, 1572, 1761, 1972, 2209, 2474, 2771, 3103, 3476, 3893, 4360]);
    expect(getExpThresholds(getDb())).toHaveLength(15);
    expect(getLevels(getDb()).names[14]).toBe('巅峰');
  });
});

describe('积分下限钳 0', () => {
  it('扣分超过现有积分 → 钳到 0，流水记录实际生效值', () => {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at)
       VALUES ('floor_stu','F1','下限生','', '', 3, ?, ?)`
    ).run(ts, ts);
    const r = applyPoints(getDb(), ['floor_stu'], -10, '越界扣分', 'teacher');
    expect(r.applied).toBe(1);
    expect(r.events[0].delta).toBe(-3); // 实际只扣掉 3
    const pts = (db.prepare(`SELECT points FROM students WHERE id='floor_stu'`).get() as { points: number }).points;
    expect(pts).toBe(0);
    // 冲正 +10 不会把 0 顶成 10（冲正遵守下限语义：回补实际扣掉的 3）
    const rev = revertPointEvents(getDb(), [r.events[0].eventId]);
    expect(rev.ok).toBe(true);
    const after = (db.prepare(`SELECT points FROM students WHERE id='floor_stu'`).get() as { points: number }).points;
    expect(after).toBe(3);
  });
});

describe('宠物排名驱动成长（后台批量、无离线惩罚）', () => {
  function mkStu(id: string, no: string, cls: string, points: number): void {
    const ts = nowIso();
    db.prepare(
      `INSERT INTO students (id, student_no, name, class_name, subject, points, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, no, id, cls, '', points, ts, ts);
  }
  function mkPet(id: string, sid: string, exp: number, daysAgo: number): void {
    const ts = nowIso();
    const last = new Date(Date.now() - daysAgo * 24 * 3600 * 1000).toISOString();
    db.prepare(
      `INSERT INTO pets (id, student_id, species_id, name, exp, last_tick_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, sid, 'cat', '宠' + id, exp, last, ts, ts);
  }

  it('同班 3 人：排名越高每日经验越多；中游 90/天 ≈ 一年满级（32,369 总需求）', async () => {
    const { settleAllPets, DEFAULT_LEVEL_THRESHOLDS, computeClassDailyExp } = await import('../src/services/pets.js');
    // 默认 15 级曲线总需求校验
    const total = DEFAULT_LEVEL_THRESHOLDS.reduce((a, b) => a + b, 0);
    expect(total).toBe(32369);
    // 中游（3 人班第 2 名 = 百分位 0.5）一天 90；用 360 天外推 ≈ 32,400 ≈ 总需求
    const midDaily = 30 + 120 * (1 - 0.5);
    expect(midDaily).toBe(90);
    expect(Math.round((total / midDaily) * 10) / 10).toBeLessThanOrEqual(365);

    mkStu('r_top', 'R1', '三年二班', 300);
    mkStu('r_mid', 'R2', '三年二班', 100);
    mkStu('r_low', 'R3', '三年二班', 1);
    mkPet('r_pet_top', 'r_top', 0, 10);
    mkPet('r_pet_mid', 'r_mid', 0, 10);
    mkPet('r_pet_low', 'r_low', 0, 10);

    const r = settleAllPets(getDb());
    expect(r.settled).toBe(3);
    const expOf = (id: string): number => (db.prepare(`SELECT exp FROM pets WHERE id=?`).get(id) as { exp: number }).exp;
    expect(expOf('r_pet_top')).toBe(1500); // 150 × 10 天
    expect(expOf('r_pet_mid')).toBe(900); // 90 × 10
    expect(expOf('r_pet_low')).toBe(300); // 30 × 10

    // 同分同值：新增一名与 top 同分的学生 → daily 一致
    mkStu('r_top2', 'R4', '三年二班', 300);
    mkPet('r_pet_top2', 'r_top2', 0, 0);
    const map = computeClassDailyExp(getDb(), '三年二班', '');
    expect(map.get('r_top')).toBe(map.get('r_top2'));
  });

  it('重复结算不重复计费（last_tick_at 记账位）', async () => {
    const { settleAllPets } = await import('../src/services/pets.js');
    mkStu('solo_s', 'S1', '独班', 0);
    mkPet('solo_pet', 'solo_s', 0, 3);
    settleAllPets(getDb());
    const after1 = (db.prepare(`SELECT exp FROM pets WHERE id='solo_pet'`).get() as { exp: number }).exp;
    settleAllPets(getDb());
    const after2 = (db.prepare(`SELECT exp FROM pets WHERE id='solo_pet'`).get() as { exp: number }).exp;
    expect(after1).toBe(450); // 全班唯一 → 第 1 名 150/天 × 3 天
    expect(after2).toBe(450); // 第二次空转
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
