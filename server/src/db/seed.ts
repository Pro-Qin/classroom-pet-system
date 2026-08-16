import { getDb, nowIso, newId, type SqliteDb } from './connection.js';
import { migrate } from './migrate.js';

interface Row {
  id: string;
}

function countRows(d: SqliteDb, table: string): number {
  const r = d.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
  return r.c;
}

function seedIfEmpty(d: SqliteDb, table: string, rows: unknown[][], insertSql: string): void {
  if (countRows(d, table) > 0) return;
  const stmt = d.prepare(insertSql);
  for (const r of rows) {
    stmt.run(...(r as unknown[] as Parameters<typeof stmt.run>));
  }
}

const STAGE_LABELS = JSON.stringify(['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说']);

const SPECIES_ROWS: unknown[][] = [
  ['dragon', '小火龙', '🐲', '#6366f1', '#8b5cf6', STAGE_LABELS, 1],
  ['cat', '喵星人', '🐱', '#f472b6', '#fb7185', STAGE_LABELS, 2],
  ['dog', '汪星人', '🐶', '#f59e0b', '#f97316', STAGE_LABELS, 3],
  ['bunny', '兔宝宝', '🐰', '#a78bfa', '#c084fc', STAGE_LABELS, 4],
  ['fox', '小狐狸', '🦊', '#fb923c', '#ef4444', STAGE_LABELS, 5],
  ['panda', '大熊猫', '🐼', '#10b981', '#34d399', STAGE_LABELS, 6],
  ['penguin', '小企鹅', '🐧', '#06b6d4', '#3b82f6', STAGE_LABELS, 7],
  ['owl', '智慧猫头鹰', '🦉', '#8b5cf6', '#6366f1', STAGE_LABELS, 8],
  ['whale', '蓝鲸', '🐳', '#38bdf8', '#0284c7', STAGE_LABELS, 9],
  ['unicorn', '独角兽', '🦄', '#e879f9', '#c084fc', STAGE_LABELS, 10],
  ['octopus', '小章鱼', '🐙', '#fb7185', '#f43f5e', STAGE_LABELS, 11],
  ['robot', '小机械兽', '🤖', '#94a3b8', '#64748b', STAGE_LABELS, 12],
];

const ITEM_ROWS: unknown[][] = [
  ['apple', '苹果', 'apple', 'food', 10, JSON.stringify({ hungry: 20, happy: 5 }), '饱食 +20，心情 +5', 1],
  ['cake', '蛋糕', 'cake', 'food', 30, JSON.stringify({ hungry: 50, happy: 15 }), '饱食 +50，心情 +15', 2],
  ['milk', '牛奶', 'milk', 'food', 15, JSON.stringify({ hungry: 30, health: 10 }), '饱食 +30，健康 +10', 3],
  ['fish', '小鱼干', 'fish', 'food', 25, JSON.stringify({ hungry: 40, happy: 20 }), '饱食 +40，心情 +20', 4],
  ['soap', '沐浴露', 'sparkles', 'clean', 10, JSON.stringify({ clean: 30 }), '清洁 +30', 5],
  ['shampoo', '香波', 'shower-head', 'clean', 20, JSON.stringify({ clean: 50, happy: 10 }), '清洁 +50，心情 +10', 6],
  ['ball', '皮球', 'volleyball', 'toy', 15, JSON.stringify({ happy: 25 }), '心情 +25', 7],
  ['yarn', '毛线团', 'circle-dot', 'toy', 20, JSON.stringify({ happy: 35 }), '心情 +35', 8],
  ['medicine', '急救药', 'cross', 'heal', 20, JSON.stringify({ health: 30 }), '健康 +30', 9],
  ['potion', '魔法药水', 'flask-conical', 'heal', 50, JSON.stringify({ health: 60, happy: 10 }), '健康 +60，心情 +10', 10],
  ['book', '成长之书', 'book-open', 'exp', 40, JSON.stringify({ exp: 30 }), '宠物经验 +30', 11],
  ['star', '幸运星', 'star', 'exp', 60, JSON.stringify({ exp: 60 }), '宠物经验 +60', 12],
];

const STATE_RULE_ROWS: unknown[][] = [
  ['rule_sick', 'sick', '生病', JSON.stringify([{ attr: 'health', op: '<', value: 30 }]), 'thermometer', '#ef4444', 1],
  ['rule_angry', 'angry', '生气', JSON.stringify([{ attr: 'happy', op: '<', value: 20 }]), 'flame', '#f97316', 2],
  ['rule_sleep', 'sleep', '睡觉', JSON.stringify([{ attr: 'happy', op: '<', value: 25 }, { attr: 'hungry', op: '<', value: 45 }]), 'moon', '#818cf8', 3],
  ['rule_sleepy', 'sleepy', '犯困', JSON.stringify([{ attr: 'happy', op: '<', value: 40 }]), 'moon-star', '#a5b4fc', 4],
  ['rule_tired', 'tired', '疲惫', JSON.stringify([{ attr: 'health', op: '<', value: 55 }]), 'battery-low', '#94a3b8', 5],
  ['rule_sad', 'sad', '伤心', JSON.stringify([{ attr: 'happy', op: '<', value: 45 }]), 'cloud-rain', '#60a5fa', 6],
  ['rule_hungry', 'hungry', '饿了', JSON.stringify([{ attr: 'hungry', op: '<', value: 40 }]), 'utensils', '#fbbf24', 7],
  ['rule_dirty', 'dirty', '脏兮兮', JSON.stringify([{ attr: 'clean', op: '<', value: 30 }]), 'shirt', '#b45309', 8],
  ['rule_excited', 'excited', '兴奋', JSON.stringify([{ attr: 'happy', op: '>=', value: 90 }]), 'zap', '#facc15', 9],
  ['rule_happy', 'happy', '开心', JSON.stringify([{ attr: 'happy', op: '>=', value: 70 }]), 'smile', '#4ade80', 10],
  ['rule_normal', 'normal', '平静', '[]', 'smile-plus', '#94a3b8', 99],
];

const QUICK_PRESET_ROWS: unknown[][] = [
  ['p1', '课堂表现优秀', 5, '课堂表现优秀', 1, 1],
  ['p2', '作业完成出色', 5, '作业完成出色', 1, 2],
  ['p3', '乐于助人', 5, '乐于助人', 1, 3],
  ['p4', '纪律表扬', 3, '纪律表扬', 1, 4],
  ['p5', '迟到', -2, '迟到', 1, 5],
  ['p6', '未交作业', -3, '未交作业', 1, 6],
];

const DEMO_STUDENTS: unknown[][] = [
  ['s_demo1', 'D2026001', '林小满', '高一(1)班', 320],
  ['s_demo2', 'D2026002', '周子昂', '高一(1)班', 580],
  ['s_demo3', 'D2026003', '陈思远', '高一(1)班', 180],
  ['s_demo4', 'D2026004', '王一诺', '高一(1)班', 440],
  ['s_demo5', 'D2026005', '赵可欣', '高一(1)班', 260],
  ['s_demo6', 'D2026006', '刘俊杰', '高一(1)班', 150],
];

const DEMO_PETS: unknown[][] = [
  ['p_demo1', 's_demo1', 'dragon', '小龙', 220, 75, 60, 80, 70],
  ['p_demo2', 's_demo2', 'cat', '星星', 530, 90, 70, 95, 85],
  ['p_demo3', 's_demo3', 'bunny', '棉花', 150, 55, 30, 40, 50],
  ['p_demo4', 's_demo4', 'fox', '阿狐', 420, 85, 65, 88, 92],
  ['p_demo5', 's_demo5', 'owl', '夜枭', 250, 70, 55, 65, 75],
  ['p_demo6', 's_demo6', 'penguin', '小胖', 100, 60, 40, 55, 45],
];

/** 幂等种子：各表为空时才写入 */
export function seed(db?: SqliteDb): void {
  const d = db ?? getDb();
  migrate(d);
  const ts = nowIso();

  const withTs = <T,>(rows: T[][]): T[][] => rows.map((r) => [...r, ts, ts] as T[]);

  seedIfEmpty(
    d,
    'species',
    withTs(SPECIES_ROWS),
    `INSERT INTO species (id, name, emoji, color_from, color_to, stage_labels, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  seedIfEmpty(
    d,
    'items',
    withTs(ITEM_ROWS),
    `INSERT INTO items (id, name, icon, type, cost, effect, desc, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  seedIfEmpty(
    d,
    'state_rules',
    withTs(STATE_RULE_ROWS),
    `INSERT INTO state_rules (id, state_key, label, conditions, icon, color, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  seedIfEmpty(
    d,
    'quick_presets',
    withTs(QUICK_PRESET_ROWS),
    `INSERT INTO quick_presets (id, label, delta, reason, editable, sort, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`
  );

  // 演示学生 + 宠物（仅当 students 为空且未标记过）
  const demoFlag = d.prepare(`SELECT value FROM settings WHERE key = 'demo_seeded'`).get() as
    | { value: string }
    | undefined;
  if (!demoFlag && countRows(d, 'students') === 0) {
    const insS = d.prepare(
      `INSERT INTO students (id, student_no, name, class_name, points, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    );
    for (const s of DEMO_STUDENTS) {
      const [id, no, name, cls, pts] = s as [string, string, string, string, number];
      insS.run(id, no, name, cls, pts, ts, ts);
    }
    const insP = d.prepare(
      `INSERT INTO pets (id, student_id, species_id, name, exp, health, hungry, happy, clean, last_tick_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    for (const p of DEMO_PETS) {
      const [id, sid, sp, name, exp, h, hu, ha, c] = p as [
        string,
        string,
        string,
        string,
        number,
        number,
        number,
        number,
        number,
      ];
      insP.run(id, sid, sp, name, exp, h, hu, ha, c, ts, ts, ts);
    }
    d.prepare(`INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('demo_seeded','1',?)`).run(ts);
  }

  // sync_meta 默认行
  d.prepare(`INSERT OR IGNORE INTO sync_meta (id, updated_at) VALUES ('global', ?)`).run(ts);
}

/** 生成一条新 id 的辅助（供测试/导入用） */
export function makeId(): string {
  return newId('r');
}

/** 供测试：种子行数计数 */
export function counts(d: SqliteDb): Record<string, number> {
  return {
    species: countRows(d, 'species'),
    items: countRows(d, 'items'),
    state_rules: countRows(d, 'state_rules'),
    quick_presets: countRows(d, 'quick_presets'),
    students: countRows(d, 'students'),
    pets: countRows(d, 'pets'),
  };
}

export type { Row };
