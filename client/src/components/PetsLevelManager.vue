<template>
  <div class="glass p-5 animate-fadeUp">
    <div class="flex items-center gap-2 mb-4">
      <TrendingUp class="w-5 h-5 text-fuchsia-300" />
      <h3 class="font-bold text-indigo-50">宠物等级设置</h3>
      <span class="ml-auto pill bg-white/10 text-indigo-200/80">{{ pets.length }} 只宠物</span>
    </div>
    <p class="text-xs text-indigo-200/60 mb-4">选择等级后宠物经验会直接对齐到该等级的起始经验值。</p>

    <!-- 等级体系编辑：数量 / 名称 / 经验 一体（最多 15 级） -->
    <div class="rounded-xl bg-white/5 border border-white/10 p-4 mb-5">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        <p class="text-sm font-semibold text-indigo-100 flex items-center gap-2"><Settings2 class="w-4 h-4 text-sky-300" /> 等级体系（Lv.1 ~ Lv.{{ form.names.length }}）</p>
        <div class="ml-auto flex items-center gap-2 text-xs">
          <button class="btn btn-ghost !py-1 !px-2" :disabled="form.names.length <= 1" @click="removeLevel">− 减一级</button>
          <button class="btn btn-ghost !py-1 !px-2" :disabled="form.names.length >= maxLevels" @click="addLevel">＋ 加一级</button>
          <span class="text-indigo-200/50">共 {{ form.names.length }}/{{ maxLevels }} 级</span>
        </div>
      </div>
      <p class="text-xs text-indigo-200/60 mb-3">
        每级可改名称与起始经验（Lv.1 固定 0，需逐级递增）；保存后全局生效。加级时经验默认为上一级 ×1.12。每日成长按班级排名：第 1 名 150/天（约 7 个月满级）、中游 90/天（约 1 年满级）、末位 30/天，后台自动结算、无任何惩罚。
      </p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div
          v-for="(name, i) in form.names"
          :key="i"
          class="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5"
        >
          <span class="text-[11px] text-indigo-200/50 w-12 shrink-0">Lv.{{ i + 1 }}</span>
          <input v-model="form.names[i]" class="input !py-1 !text-xs flex-1" placeholder="等级名" maxlength="12" />
          <input
            v-if="i > 0"
            v-model.number="form.thresholds[i]"
            type="number"
            class="input !w-24 !py-1 !text-xs text-center"
            min="0"
          />
          <span v-else class="text-xs font-bold text-indigo-100 w-24 text-center">0（起始）</span>
          <span class="text-[10px] text-indigo-200/40 w-8 text-right">经验</span>
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2 flex-wrap">
        <button class="btn btn-primary !py-1.5 text-xs" @click="saveLevels"><Check class="w-3.5 h-3.5" /> 保存等级体系</button>
        <button v-if="custom" class="btn btn-ghost !py-1.5 text-xs" @click="resetDefaults">恢复默认 7 级</button>
      </div>
      <p v-if="levelMsg" class="text-xs mt-2" :class="levelMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ levelMsg }}</p>
    </div>

    <div v-if="pets.length === 0" class="py-8 text-center text-indigo-200/50">暂无宠物</div>
    <div v-else class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[540px] overflow-y-auto pr-1">
      <div v-for="p in pets" :key="p.id" class="rounded-xl bg-white/5 border border-white/10 p-3 glass-hover">
        <div class="flex items-center gap-3">
          <div
            class="w-12 h-12 rounded-full grid place-items-center text-xl shrink-0 overflow-hidden"
            :style="{ background: 'linear-gradient(135deg, ' + p.color_from + ', ' + p.color_to + ')' }"
          >
            <img v-if="p.avatar_path || p.species_avatar" :src="(p.avatar_path || p.species_avatar) || undefined" class="w-full h-full object-cover" alt="" />
            <span v-else>{{ p.species_emoji }}</span>
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-indigo-50 truncate">{{ p.name }}</p>
            <p class="text-xs text-indigo-200/60 truncate">{{ p.student_name }} · {{ p.species_name }}</p>
          </div>
        </div>
        <div class="mt-3 flex items-center gap-2">
          <span class="pill shrink-0 bg-white/10 text-indigo-200">Lv.{{ p.stage + 1 }} {{ p.stageLabel }}</span>
          <select
            v-model.number="p.stage"
            class="input !flex-1 !py-1 text-xs"
            @change="setLevel(p)"
          >
            <option v-for="(lb, i) in form.names" :key="i" :value="i">
              Lv.{{ i + 1 }} · {{ lb }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { TrendingUp, Settings2, Check } from 'lucide-vue-next';
import { api } from '../api';
import { toast } from '../composables/toast';

interface PetManage {
  id: string;
  student_id: string;
  student_name: string;
  species_id: string;
  species_name: string;
  species_emoji: string;
  species_avatar: string | null;
  avatar_path: string | null;
  color_from: string;
  color_to: string;
  name: string;
  exp: number;
  stage: number;
  stageLabel: string;
  stageLabels: string[];
}

const pets = ref<PetManage[]>([]);
const maxLevels = 15;
const custom = ref(false);
const levelMsg = ref('');
const levelMsgType = ref<'ok' | 'err'>('ok');
const form = reactive<{ names: string[]; thresholds: number[] }>({
  names: ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说'],
  thresholds: [0, 100, 300, 600, 1000, 1500, 2200],
});

async function loadLevels(): Promise<void> {
  try {
    const r = await api<{ names: string[]; thresholds: number[]; maxLevels: number; custom: boolean }>('/levels');
    form.names = [...r.names];
    form.thresholds = [...r.thresholds];
    custom.value = r.custom;
  } catch {
    /* keep defaults */
  }
}

/** 1~15 级的预设名称池：加级时按序取用（前 7 级与默认等级名一致） */
const PRESET_LEVEL_NAMES = [
  '蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说',
  '传奇', '神话', '史诗', '闪耀', '王者', '星耀', '至尊', '巅峰',
];

/**
 * 默认经验：上一级 ×1.12（取整、严格递增；Lv.1 固定 0，Lv.2 起始 1000）。
 * 15 级总需求约 32,369 —— 中游学生（每日约 90 经验，按班级排名）约一年满级。
 */
function presetExp(prev: number): number {
  if (prev <= 0) return 1000;
  return Math.max(prev + 1, Math.round(prev * 1.12));
}

function addLevel(): void {
  if (form.names.length >= maxLevels) return;
  const prevExp = form.thresholds[form.thresholds.length - 1] ?? 0;
  form.names.push(PRESET_LEVEL_NAMES[form.names.length] ?? `Lv.${form.names.length + 1}级`);
  form.thresholds.push(presetExp(prevExp));
}

function removeLevel(): void {
  if (form.names.length <= 1) return;
  form.names.pop();
  form.thresholds.pop();
}

async function saveLevels(): Promise<void> {
  levelMsg.value = '';
  const names = form.names.map((n) => String(n ?? '').trim());
  const th = form.thresholds.map((n) => Math.round(Number(n) || 0));
  if (names.some((n) => !n)) {
    levelMsg.value = '每个等级都需要名称';
    levelMsgType.value = 'err';
    return;
  }
  for (let i = 1; i < th.length; i++) {
    if (th[i] <= th[i - 1]) {
      levelMsg.value = `Lv.${i + 1} 的经验必须大于 Lv.${i}（逐级递增）`;
      levelMsgType.value = 'err';
      return;
    }
  }
  try {
    const r = await api<{ names: string[]; thresholds: number[] }>('/levels', {
      method: 'PUT',
      body: JSON.stringify({ names, thresholds: th }),
    });
    form.names = [...r.names];
    form.thresholds = [...r.thresholds];
    custom.value = true;
    levelMsg.value = '等级体系已保存，全局生效';
    levelMsgType.value = 'ok';
    await load();
  } catch (e) {
    levelMsg.value = (e as Error).message;
    levelMsgType.value = 'err';
  }
}

async function resetDefaults(): Promise<void> {
  form.names = ['蛋', '破壳', '幼年', '成长', '成熟', '进化', '传说', '传奇', '神话', '史诗', '闪耀', '王者', '星耀', '至尊', '巅峰'];
  form.thresholds = [0, 1000, 1120, 1254, 1404, 1572, 1761, 1972, 2209, 2474, 2771, 3103, 3476, 3893, 4360];
  await saveLevels();
}

async function load(): Promise<void> {
  try {
    const r = await api<{ pets: PetManage[] }>('/pets/manage');
    pets.value = r.pets;
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function setLevel(p: PetManage): Promise<void> {
  try {
    await api('/pets/' + p.id + '/level', { method: 'POST', body: JSON.stringify({ stage: p.stage }) });
    toast(p.name + ' 已设置为 Lv.' + (p.stage + 1), 'success');
    await load();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

onMounted(() => {
  load();
  loadLevels();
});
</script>
