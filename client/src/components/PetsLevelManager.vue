<template>
  <div class="glass p-5 animate-fadeUp">
    <div class="flex items-center gap-2 mb-4">
      <TrendingUp class="w-5 h-5 text-fuchsia-300" />
      <h3 class="font-bold text-indigo-50">宠物等级设置</h3>
      <span class="ml-auto pill bg-white/10 text-indigo-200/80">{{ pets.length }} 只宠物</span>
    </div>
    <p class="text-xs text-indigo-200/60 mb-4">选择等级后宠物经验会直接对齐到该等级的起始经验值。</p>

    <!-- 等级经验要求设置 -->
    <div class="rounded-xl bg-white/5 border border-white/10 p-4 mb-5">
      <p class="text-sm font-semibold text-indigo-100 mb-1 flex items-center gap-2"><Settings2 class="w-4 h-4 text-sky-300" /> 等级经验要求</p>
      <p class="text-xs text-indigo-200/60 mb-3">修改各等级所需的起始经验值（Lv.1 固定为 0，其余可调，需逐级递增）。</p>
      <div class="flex flex-wrap gap-2 items-center">
        <template v-for="(lb, i) in levelLabels" :key="i">
          <div class="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5">
            <span class="text-[11px] text-indigo-200/70">{{ lb }}</span>
            <input
              v-if="i > 0"
              v-model.number="thresholds[i]"
              type="number"
              class="input !w-20 !py-1 !text-xs text-center"
              :disabled="i === 0"
            />
            <span v-else class="text-xs font-bold text-indigo-100">0</span>
          </div>
        </template>
        <button class="btn btn-primary !py-1.5 text-xs" @click="saveThresholds"><Check class="w-3.5 h-3.5" /> 保存等级要求</button>
      </div>
      <p v-if="thresholdMsg" class="text-xs mt-2" :class="thresholdMsgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ thresholdMsg }}</p>
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
            <option v-for="(lb, i) in (p.stageLabels && p.stageLabels.length ? p.stageLabels : ['蛋','破壳','幼年','成长','成熟','进化','传说'])" :key="i" :value="i">
              Lv.{{ i + 1 }} · {{ lb }}
            </option>
          </select>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
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
const thresholds = ref<number[]>([0, 100, 300, 600, 1000, 1500, 2200]);
const thresholdMsg = ref('');
const thresholdMsgType = ref<'ok' | 'err'>('ok');
const levelLabels = ['Lv.1', 'Lv.2', 'Lv.3', 'Lv.4', 'Lv.5', 'Lv.6', 'Lv.7'];

async function loadThresholds(): Promise<void> {
  try {
    const r = await api<{ thresholds: number[] }>('/exp-thresholds');
    thresholds.value = r.thresholds;
  } catch {
    /* keep default */
  }
}

async function saveThresholds(): Promise<void> {
  thresholdMsg.value = '';
  const arr = thresholds.value.map((n) => Math.round(Number(n) || 0));
  arr[0] = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) {
      thresholdMsg.value = '等级经验要求必须逐级递增';
      thresholdMsgType.value = 'err';
      return;
    }
  }
  try {
    await api('/exp-thresholds', { method: 'PUT', body: JSON.stringify({ thresholds: arr }) });
    thresholds.value = arr;
    thresholdMsg.value = '等级经验要求已保存';
    thresholdMsgType.value = 'ok';
    await load();
  } catch (e) {
    thresholdMsg.value = (e as Error).message;
    thresholdMsgType.value = 'err';
  }
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
  loadThresholds();
});
</script>