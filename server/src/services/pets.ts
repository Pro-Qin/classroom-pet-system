import { getDb, nowIso, newId, tx, type SqliteDb } from '../db/connection.js';

export interface PetRow {
  id: string;
  student_id: string;
  species_id: string;
  name: string;
  exp: number;
  avatar_path: string | null;
  health: number;
  hungry: number;
  happy: number;
  clean: number;
  last_tick_at: string;
  updated_at: string;
  personality?: string | null;
  last_event_day?: string | null;
}

export interface StateResult {
  key: string;
  label: string;
  icon: string;
  color: string;
}

export interface SpeciesRow {
  id: string;
  name: string;
  emoji: string;
  avatar_path: string | null;
  color_from: string;
  color_to: string;
  stage_labels: string;
}

/** 成长经验阈值（7 阶段，与 stage_labels 对齐；可在教师/管理端修改） */
export const EXP_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2200];
export const DEFAULT_EXP_THRESHOLDS = [...EXP_THRESHOLDS];

/** 读取可配置的等级经验阈值（settings 表 exp_thresholds，JSON 数组；异常时回退默认） */
export function getExpThresholds(db?: SqliteDb): number[] {
  const d = db ?? getDb();
  try {
    const row = d
      .prepare(`SELECT value FROM settings WHERE key = 'exp_thresholds'`)
      .get() as { value: string } | undefined;
    if (!row) return [...DEFAULT_EXP_THRESHOLDS];
    const arr = JSON.parse(row.value) as unknown;
    if (
      Array.isArray(arr) &&
      arr.length === DEFAULT_EXP_THRESHOLDS.length &&
      arr.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      return arr.map((n) => Math.max(0, Math.round(n as number)));
    }
  } catch {
    /* fallback */
  }
  return [...DEFAULT_EXP_THRESHOLDS];
}

export function levelOf(exp: number, thresholds: number[] = DEFAULT_EXP_THRESHOLDS): { level: number; label: string; stageLabels: string[] } {
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (exp >= thresholds[i]) level = i;
  }
  return { level, label: '', stageLabels: [] };
}

export function stageIndex(exp: number, thresholds: number[] = DEFAULT_EXP_THRESHOLDS): number {
  let idx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (exp >= thresholds[i]) idx = i;
  }
  return idx;
}

export function getSpecies(db: SqliteDb, speciesId: string): SpeciesRow | undefined {
  return db.prepare(`SELECT * FROM species WHERE id = ? AND deleted_at IS NULL`).get(speciesId) as
    | SpeciesRow
    | undefined;
}

export function stageLabelOf(species: SpeciesRow | undefined, exp: number, thresholds: number[] = DEFAULT_EXP_THRESHOLDS): string {
  if (!species) return '蛋';
  try {
    const labels = JSON.parse(species.stage_labels) as string[];
    return labels[stageIndex(exp, thresholds)] ?? labels[0] ?? '蛋';
  } catch {
    return '蛋';
  }
}

export function stageLabelsOf(species: SpeciesRow | undefined): string[] {
  if (!species) return ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说'];
  try {
    return JSON.parse(species.stage_labels) as string[];
  } catch {
    return ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说'];
  }
}

interface RuleRow {
  id: string;
  state_key: string;
  label: string;
  conditions: string;
  icon: string;
  color: string;
  sort: number;
}

/** 根据属性推导宠物状态：按 sort 顺序匹配第一条满足全部条件的规则 */
export function computeState(pet: Pick<PetRow, 'health' | 'hungry' | 'happy' | 'clean'>, db?: SqliteDb): StateResult {
  const d = db ?? getDb();
  const rules = d
    .prepare(`SELECT * FROM state_rules WHERE deleted_at IS NULL ORDER BY sort ASC`)
    .all() as unknown as RuleRow[];
  const attrs: Record<string, number> = {
    health: pet.health,
    hungry: pet.hungry,
    happy: pet.happy,
    clean: pet.clean,
  };
  for (const rule of rules) {
    let conditions: { attr: string; op: string; value: number }[] = [];
    try {
      conditions = JSON.parse(rule.conditions);
    } catch {
      conditions = [];
    }
    if (conditions.length === 0) {
      // 兜底规则（normal）
      return { key: rule.state_key, label: rule.label, icon: rule.icon, color: rule.color };
    }
    const matched = conditions.every((c) => {
      const v = attrs[c.attr] ?? 0;
      switch (c.op) {
        case '<':
          return v < c.value;
        case '<=':
          return v <= c.value;
        case '>':
          return v > c.value;
        case '>=':
          return v >= c.value;
        case '==':
          return v === c.value;
        default:
          return false;
      }
    });
    if (matched) {
      return { key: rule.state_key, label: rule.label, icon: rule.icon, color: rule.color };
    }
  }
  return { key: 'normal', label: '平静', icon: 'smile', color: '#94a3b8' };
}

const MIN_ATTR = 5;

/**
 * 属性自然衰减（温和版：学生接触系统频率低，绝不惩罚）。
 * 每 24h：hungry -8、happy -6、clean -10；当 hungry<40 或 clean<40 时 health 额外 -5。
 * 低于 4 小时不衰减；属性下限 5（永不死亡）。
 */
export function tickPet(pet: PetRow, db?: SqliteDb): { changed: boolean } {
  const d = db ?? getDb();
  const now = Date.now();
  const last = new Date(pet.last_tick_at).getTime();
  const elapsedH = (now - last) / 3_600_000;
  if (elapsedH < 4) return { changed: false };

  const days = elapsedH / 24;
  const clamp = (v: number): number => Math.max(MIN_ATTR, Math.min(100, Math.round(v)));
  const hungry = clamp(pet.hungry - 8 * days);
  const happy = clamp(pet.happy - 6 * days);
  const clean = clamp(pet.clean - 10 * days);
  let health = pet.health;
  if (hungry < 40 || clean < 40) health = clamp(health - 5 * days);

  const ts = nowIso();
  d.prepare(
    `UPDATE pets SET health=?, hungry=?, happy=?, clean=?, last_tick_at=?, updated_at=? WHERE id=?`
  ).run(health, hungry, happy, clean, ts, ts, pet.id);
  return { changed: true };
}

export interface ItemRow {
  id: string;
  name: string;
  icon: string;
  type: string;
  cost: number;
  effect: string;
  desc: string;
}

export function getItem(db: SqliteDb, itemId: string): ItemRow | undefined {
  return db.prepare(`SELECT * FROM items WHERE id = ? AND deleted_at IS NULL`).get(itemId) as
    | ItemRow
    | undefined;
}

export interface UseItemResult {
  ok: boolean;
  effect: Record<string, number>;
  pet?: PetRow;
  backpackQty?: number;
  error?: string;
}

/** 使用道具：消耗背包数量，作用于属性/经验 */
export function useItem(db: SqliteDb, studentId: string, itemId: string): UseItemResult {
  const pet = db
    .prepare(`SELECT * FROM pets WHERE student_id = ? AND deleted_at IS NULL`)
    .get(studentId) as PetRow | undefined;
  if (!pet) return { ok: false, effect: {}, error: '该学生还没有宠物' };
  const item = getItem(db, itemId);
  if (!item) return { ok: false, effect: {}, error: '道具不存在' };

  const bp = db
    .prepare(`SELECT qty FROM backpacks WHERE student_id = ? AND item_id = ?`)
    .get(studentId, itemId) as { qty: number } | undefined;
  const qty = bp?.qty ?? 0;
  if (qty <= 0) return { ok: false, effect: {}, error: '背包里没有该道具' };

  const effect = JSON.parse(item.effect) as Record<string, number>;
  const clamp = (v: number): number => Math.max(0, Math.min(100, v));

  return tx(db, () => {
    const now = nowIso();
    let exp = pet.exp;
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(effect)) {
      if (k === 'exp') {
        exp += v;
      } else if (['health', 'hungry', 'happy', 'clean'].includes(k)) {
        patch[k] = clamp((pet as unknown as Record<string, number>)[k] + v);
      }
    }
    const setCols = ['exp=?'];
    const vals: number[] = [exp];
    for (const [k, v] of Object.entries(patch)) {
      setCols.push(`${k}=?`);
      vals.push(v);
    }
    db.prepare(`UPDATE pets SET ${setCols.join(',')}, updated_at=? WHERE id=?`).run(...vals, now, pet.id);
    db.prepare(
      `UPDATE backpacks SET qty = qty - 1, updated_at = ? WHERE student_id = ? AND item_id = ?`
    ).run(now, studentId, itemId);
    db.prepare(
      `INSERT INTO item_use_logs (id, student_id, item_id, effect, created_at, updated_at) VALUES (?,?,?,?,?,?)`
    ).run(newId('use'), studentId, itemId, JSON.stringify(effect), now, now);

    const newPet = db
      .prepare(`SELECT * FROM pets WHERE id = ?`)
      .get(pet.id) as unknown as PetRow;
    const newQty = (db
      .prepare(`SELECT qty FROM backpacks WHERE student_id = ? AND item_id = ?`)
      .get(studentId, itemId) as { qty: number }).qty;
    return { ok: true, effect, pet: newPet, backpackQty: newQty };
  });
}

export interface BuyItemResult {
  ok: boolean;
  cost: number;
  points: number;
  qty: number;
  error?: string;
}

/** 用积分购买道具入背包（产生一条 -cost 的积分流水，审计可查） */
export function buyItem(db: SqliteDb, studentId: string, itemId: string): BuyItemResult {
  const item = getItem(db, itemId);
  if (!item) return { ok: false, cost: 0, points: 0, qty: 0, error: '道具不存在' };
  const student = db.prepare(`SELECT points FROM students WHERE id = ?`).get(studentId) as
    | { points: number }
    | undefined;
  if (!student) return { ok: false, cost: 0, points: 0, qty: 0, error: '学生不存在' };
  if (student.points < item.cost)
    return { ok: false, cost: item.cost, points: student.points, qty: 0, error: '积分不足' };

  return tx(db, () => {
    const now = nowIso();
    const newPoints = student.points - item.cost;
    db.prepare(`UPDATE students SET points = ?, updated_at = ? WHERE id = ?`).run(
      newPoints,
      now,
      studentId
    );
    db.prepare(
      `INSERT INTO point_events (id, student_id, delta, reason, operator, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`
    ).run(
      newId('ev'),
      studentId,
      -item.cost,
      `购买道具：${item.name}`,
      'student',
      now,
      now
    );
    db.prepare(
      `INSERT INTO backpacks (id, student_id, item_id, qty, updated_at) VALUES (?,?,?,1,?)
       ON CONFLICT(student_id, item_id) DO UPDATE SET qty = qty + 1, updated_at = excluded.updated_at`
    ).run(`${studentId}|${itemId}`, studentId, itemId, now);
    return { ok: true, cost: item.cost, points: newPoints, qty: 1 };
  });
}

/** 增加宠物经验（教师/管理端） */
export function addPetExp(db: SqliteDb, petId: string, amount: number, operator: string): PetRow | null {
  if (!Number.isFinite(amount) || amount === 0) return null;
  return tx(db, () => {
    const now = nowIso();
    db.prepare(`UPDATE pets SET exp = max(0, exp + ?), updated_at = ? WHERE id = ?`).run(
      Math.round(amount),
      now,
      petId
    );
    return db.prepare(`SELECT * FROM pets WHERE id = ?`).get(petId) as unknown as PetRow;
  });
}

/** 领养宠物：学生选种类 + 自定义名字 */
export function adoptPet(db: SqliteDb, studentId: string, speciesId: string, name: string): PetRow | null {
  const species = getSpecies(db, speciesId);
  if (!species) return null;
  const exists = db.prepare(`SELECT id FROM pets WHERE student_id = ?`).get(studentId);
  if (exists) return null;
  const now = nowIso();
  const pet: PetRow = {
    id: newId('pet'),
    student_id: studentId,
    species_id: speciesId,
    name: name.trim() || species.name,
    exp: 0,
    avatar_path: null,
    health: 100,
    hungry: 100,
    happy: 100,
    clean: 100,
    last_tick_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO pets (id, student_id, species_id, name, exp, avatar_path, health, hungry, happy, clean, last_tick_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    pet.id,
    pet.student_id,
    pet.species_id,
    pet.name,
    pet.exp,
    pet.avatar_path,
    pet.health,
    pet.hungry,
    pet.happy,
    pet.clean,
    pet.last_tick_at,
    now,
    pet.updated_at
  );
  return pet;
}

/** 重命名宠物 */
export function renamePet(db: SqliteDb, petId: string, name: string): PetRow | null {
  const n = name.trim();
  if (!n) return null;
  const now = nowIso();
  db.prepare(`UPDATE pets SET name = ?, updated_at = ? WHERE id = ?`).run(n, now, petId);
  return db.prepare(`SELECT * FROM pets WHERE id = ?`).get(petId) as unknown as PetRow;
}

/** 设置自定义头像路径 */
export function setPetAvatar(db: SqliteDb, petId: string, avatarPath: string): PetRow | null {
  const now = nowIso();
  db.prepare(`UPDATE pets SET avatar_path = ?, updated_at = ? WHERE id = ?`).run(avatarPath, now, petId);
  return db.prepare(`SELECT * FROM pets WHERE id = ?`).get(petId) as unknown as PetRow;
}

/* ============================================================
 * 宠物性格与每日小事件
 * 设计原则：确定性（同一天同一只宠结果固定）、低频（每天至多 1 次、
 * 命中率约 18%）、效果极轻（±2~5），不打扰短时长的使用节奏。
 * ============================================================ */

export const PERSONALITIES = [
  { key: 'lively', label: '活泼', emoji: '🌤️', desc: '精力充沛，爱凑热闹' },
  { key: 'lazy', label: '慵懒', emoji: '🌙', desc: '能躺着绝不站着' },
  { key: 'greedy', label: '贪吃', emoji: '🍢', desc: '对食物毫无抵抗力' },
  { key: 'cool', label: '高冷', emoji: '🧊', desc: '外冷内热的小傲娇' },
] as const;

/** 每日事件池：按性格分组，效果均为小幅增益 */
const DAILY_EVENTS: Record<string, { text: string; attr: 'health' | 'hungry' | 'happy' | 'clean'; add: number; exp: number }[]> = {
  lively: [
    { text: '{name}在花坛边打了三个滚，心情大好！', attr: 'happy', add: 3, exp: 2 },
    { text: '{name}追着自己的尾巴跑了一整圈，运动量达标～', attr: 'health', add: 2, exp: 2 },
  ],
  lazy: [
    { text: '{name}晒着太阳睡了个午觉，醒来精神满满。', attr: 'health', add: 2, exp: 1 },
    { text: '{name}翻了个身继续睡……但梦里也在长经验！', attr: 'happy', add: 2, exp: 3 },
  ],
  greedy: [
    { text: '{name}偷偷闻到了食堂的香味，饱食度小幅回升～', attr: 'hungry', add: 4, exp: 1 },
    { text: '{name}捡到了一颗掉落的水果糖，开心地叼走了。', attr: 'happy', add: 3, exp: 2 },
  ],
  cool: [
    { text: '{name}远远看了主人一眼，尾巴悄悄摇了一下。', attr: 'happy', add: 1, exp: 5 },
    { text: '{name}安静地擦拭自己的爪子，洁净值提升。', attr: 'clean', add: 4, exp: 1 },
  ],
};

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 确定性伪随机（mulberry32）：同一输入序列恒定，保证结果可复现 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EVENT_CHANCE = 0.18; // 每天约 18% 的宠物会遇到一次小事件

/**
 * 学生查看宠物详情时调用：按需分配性格并掷当日事件。
 * 返回今日事件文案（没有则 null）。
 */
export function resolvePetDailyMoment(db: SqliteDb, petId: string): string | null {
  const pet = db.prepare(`SELECT * FROM pets WHERE id = ? AND deleted_at IS NULL`).get(petId) as
    | (PetRow & { personality?: string | null; last_event_day?: string | null })
    | undefined;
  if (!pet) return null;

  const today = nowIso().slice(0, 10);
  const rng = mulberry32(hashStr(`${pet.id}:${today}`));

  // 性格未分配：按宠物 id 确定性分配一次
  if (!pet.personality) {
    const chosen = PERSONALITIES[hashStr(pet.id) % PERSONALITIES.length];
    db.prepare(`UPDATE pets SET personality = ? WHERE id = ?`).run(chosen.key, pet.id);
    pet.personality = chosen.key;
  }

  // 今日已发生过事件 / 未命中概率 → 静默
  if ((pet.last_event_day ?? '') === today) return null;
  if (rng() >= EVENT_CHANCE) return null;

  const pool = DAILY_EVENTS[pet.personality] ?? DAILY_EVENTS.lively;
  const ev = pool[Math.floor(rng() * pool.length)];
  const clamp = (v: number): number => Math.max(0, Math.min(100, v));
  const cur = clamp((pet as unknown as Record<string, number>)[ev.attr]);
  const now = nowIso();
  db.prepare(
    `UPDATE pets SET ${ev.attr} = ?, exp = exp + ?, last_event_day = ?, updated_at = ? WHERE id = ?`
  ).run(clamp(cur + ev.add), ev.exp, today, now, pet.id);
  return ev.text.replaceAll('{name}', pet.name);
}