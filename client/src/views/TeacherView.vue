<template>
  <div class="min-h-screen pb-32">
    <header ref="headerEl" class="sticky top-0 z-40 border-b" style="border-bottom-color:rgba(255,255,255,0)">
      <div class="max-w-7xl mx-auto px-5 py-3 text-center">
        <div class="inline-flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/25 grid place-items-center">
            <GraduationCap class="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <h1 class="font-bold text-indigo-50 leading-tight">教师系统</h1>
            <p class="text-xs text-indigo-200/60">加减分 · 排行榜 · 宠物成长</p>
          </div>
        </div>
      </div>
    </header>

    <!-- 数据概览 -->
    <div class="max-w-7xl mx-auto px-5 pt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <Users class="w-6 h-6 text-sky-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.cnt ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">学生总数</p>
        </div>
      </div>
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <Coins class="w-6 h-6 text-amber-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.total ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">总{{ pointsUnit }}</p>
        </div>
      </div>
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <TrendingUp class="w-6 h-6 text-emerald-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.avg ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">平均{{ pointsUnit }}</p>
        </div>
      </div>
      <div class="glass p-4 flex items-center gap-3 animate-fadeUp">
        <PawPrint class="w-6 h-6 text-fuchsia-300" />
        <div>
          <p class="text-2xl font-bold text-indigo-50">{{ stats.pets ?? '-' }}</p>
          <p class="text-xs text-indigo-200/60">宠物总数</p>
        </div>
      </div>
    </div>

    <!-- 标签页 -->
    <div class="max-w-7xl mx-auto px-5 mt-6 flex gap-2 overflow-x-auto pb-1 justify-center">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="pill !px-4 !py-2 !text-sm cursor-pointer transition-colors shrink-0"
        :class="tab === t.key ? 'bg-indigo-500/30 text-indigo-100 border border-indigo-400/50' : 'bg-white/5 text-indigo-200/70 border border-white/10 hover:bg-white/10'"
        @click="switchTab(t.key)"
      >
        <component :is="t.icon" class="w-4 h-4" /> {{ t.label }}
      </button>
    </div>

    <main class="max-w-7xl mx-auto px-5 pt-5">
      <!-- ===== 加减分 ===== -->
      <div v-if="tab === 'points'" class="grid lg:grid-cols-3 gap-6 animate-fadeUp">
        <!-- 学生选择 -->
        <div class="glass p-5 lg:col-span-2">
          <div class="flex items-center justify-between mb-3">
            <h3 class="font-bold text-indigo-50 flex items-center gap-2">
              <Users class="w-5 h-5 text-sky-300" /> 选择学生
              <span class="pill bg-indigo-500/25 text-indigo-200">{{ selected.size }} 人</span>
            </h3>
            <input v-model="searchKey" class="input !w-48 !py-2 text-sm" placeholder="搜索姓名…" />
          </div>
          <p class="text-xs text-indigo-200/50 mb-2">点击学生卡片即可选中 / 取消选中（可多选）</p>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-[400px] overflow-y-auto pr-1">
            <div
              v-for="s in filteredStudents"
              :key="s.id"
              role="checkbox"
              :aria-checked="selected.has(s.id)"
              class="rounded-xl border p-3 flex items-center gap-2.5 cursor-pointer transition-colors select-none"
              :class="selected.has(s.id) ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'"
              @click="toggleSelect(s.id)"
            >
              <span
                class="w-6 h-6 rounded-md grid place-items-center border shrink-0 transition-colors"
                :class="selected.has(s.id) ? 'bg-indigo-500 border-indigo-300 text-white' : 'border-white/25 text-transparent'"
              >
                <Check class="w-4 h-4" />
              </span>
              <span
                class="w-9 h-9 rounded-full grid place-items-center text-base shrink-0"
                :style="{ background: `linear-gradient(135deg, ${s.speciesColorFrom}, ${s.speciesColorTo})` }"
              >
                {{ s.petEmoji || s.name.slice(0, 1) }}
              </span>
              <div class="min-w-0">
                <p class="text-sm font-semibold text-indigo-50 truncate">{{ s.name }}</p>
                <p class="text-xs text-indigo-200/60">{{ s.points }} {{ pointsUnit }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 操作面板 -->
        <div class="space-y-4">
          <!-- 加减分 -->
          <div class="glass p-5">
            <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-1">
              <Plus class="w-5 h-5 text-amber-300" /> 加减分
            </h3>
            <p class="text-xs text-indigo-200/60 mb-3 leading-relaxed">
              ① 点选左侧学生 → ② 用 <b class="text-emerald-300">+5</b> / <b class="text-rose-300">−5</b> 调整分值 →
              ③ 填理由 → ④ 确认
            </p>
            <div class="flex items-stretch gap-2">
              <button
                class="btn btn-danger !px-4 !text-2xl font-black shrink-0"
                title="点击一次，分值减 5"
                @click="adjustDelta(-5)"
              >
                −5
              </button>
              <input v-model.number="delta" type="number" class="input flex-1 text-center !text-2xl font-black !py-2" />
              <button
                class="btn btn-primary !px-4 !text-2xl font-black shrink-0"
                title="点击一次，分值加 5"
                @click="adjustDelta(5)"
              >
                +5
              </button>
            </div>
            <div class="mt-1.5 flex items-center justify-between text-xs text-indigo-200/50">
              <span>扣分方向</span>
              <span>加分方向</span>
            </div>
            <div class="mt-2 flex items-center justify-between text-xs">
              <span class="text-indigo-200/60">当前分值：<b class="text-lg" :class="delta >= 0 ? 'text-emerald-300' : 'text-rose-300'">{{ delta > 0 ? '+' : '' }}{{ delta }}</b></span>
              <button class="btn btn-ghost !py-1 !px-2 text-xs" @click="delta = 5">恢复默认 5</button>
            </div>
            <input v-model="reason" class="input !py-1.5 !text-sm mt-3" placeholder="加减分理由（选填）" @keyup.enter="applyPoints" />
            <p v-if="delta === 0" class="mt-1 text-xs text-amber-300">当前分值为 0，无法提交，请用 +5 / −5 调整</p>
            <button class="btn btn-gold w-full mt-3" :disabled="selected.size === 0 || delta === 0" @click="applyPoints">
              <Send class="w-4 h-4" /> 确认{{ delta > 0 ? '加分' : delta < 0 ? '扣分' : '' }}（{{ selected.size }} 人）
            </button>
          </div>

          <!-- 快捷加减分 -->
          <div class="glass p-5">
            <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-1">
              <Zap class="w-5 h-5 text-yellow-300" /> 快捷加减分
              <span class="text-[11px] text-indigo-200/50 font-normal">最多 5 个</span>
            </h3>
            <p class="text-xs text-indigo-200/60 mb-2">点击预设直接填入分值与理由，也可点「+」添加</p>
            <div class="flex flex-wrap gap-2 items-center">
              <button
                v-for="p in presets"
                :key="p.id"
                class="pill !px-3 !py-1.5 cursor-pointer transition-colors group"
                :class="p.delta >= 0 ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 hover:bg-emerald-500/25' : 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25'"
                @click="usePreset(p)"
              >
                {{ p.label }} {{ p.delta > 0 ? '+' : '' }}{{ p.delta }}
                <X class="w-3 h-3 opacity-40 group-hover:opacity-100 hover:text-rose-200" @click.stop="removePreset(p)" />
              </button>
              <button
                class="pill !px-3 !py-1.5 cursor-pointer border border-dashed border-white/25 text-indigo-200/70 hover:bg-white/10 hover:text-indigo-100 transition-colors"
                @click="presetAddOpen = !presetAddOpen"
              >
                <Plus class="w-3.5 h-3.5" /> 添加
              </button>
            </div>
            <div v-if="presetAddOpen" class="mt-3 rounded-xl bg-white/5 border border-white/10 p-3 animate-fadeUp">
              <p class="text-xs text-indigo-200/70 mb-2">新增快捷预设<template v-if="presets.length >= 5">（已达 5 个上限，请先删除）</template></p>
              <div class="flex gap-2">
                <input v-model="newPreset.label" class="input !py-1.5 !text-sm flex-1" placeholder="名称，如：黑板报加分" @keyup.enter="addPreset" />
                <input v-model.number="newPreset.delta" type="number" class="input !py-1.5 !text-sm !w-20 text-center" placeholder="±分" />
                <button class="btn btn-primary !py-1.5 !px-3 text-xs" :disabled="presets.length >= 5" @click="addPreset">
                  <Plus class="w-3.5 h-3.5" /> 添加
                </button>
              </div>
              <p v-if="presetError" class="text-xs text-rose-300 mt-1.5">{{ presetError }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 排行榜 ===== -->
      <div v-if="tab === 'rank'" class="space-y-6 animate-fadeUp">
        <!-- 领奖台：第2名左、第1名中、第3名右 -->
        <div class="grid grid-cols-3 gap-4 items-end max-w-3xl mx-auto">
          <div v-for="p in podiumOrdered" :key="p.rank" class="text-center">
            <div
              class="mx-auto rounded-t-2xl grid place-items-center relative"
              :style="{
                height: p.rank === 1 ? '9rem' : p.rank === 2 ? '7rem' : '5rem',
                background: `linear-gradient(180deg, ${podiumColor(p.rank)}, #1b2447)`,
              }"
            >
              <span class="text-4xl absolute -top-8" :class="p.rank === 1 ? 'animate-bounce-soft' : ''">{{ p.petEmoji }}</span>
            </div>
            <p class="mt-2 font-bold text-indigo-50">{{ p.name }}</p>
            <p class="text-sm text-amber-300 font-semibold">{{ p.points }} {{ pointsUnit }}</p>
          </div>
        </div>

        <!-- 第 4-5 名左侧漂浮 / 第 6-7 名右侧漂浮 -->
        <div class="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <div class="glass p-4">
            <p class="text-xs text-indigo-200/60 mb-2 flex items-center gap-1.5"><TrendingUp class="w-3.5 h-3.5" /> 第 4 - 5 名</p>
            <div v-for="p in floatingLeft" :key="p.id" class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <span class="w-7 h-7 rounded-lg bg-white/8 grid place-items-center text-xs font-bold text-indigo-200/70">{{ p.rank }}</span>
              <span class="text-xl">{{ p.petEmoji }}</span>
              <span class="font-medium text-indigo-50 truncate">{{ p.name }}</span>
              <span class="ml-auto font-bold text-amber-300">{{ p.points }}</span>
            </div>
          </div>
          <div class="glass p-4">
            <p class="text-xs text-indigo-200/60 mb-2 flex items-center gap-1.5"><TrendingUp class="w-3.5 h-3.5" /> 第 6 - 7 名</p>
            <div v-for="p in floatingRight" :key="p.id" class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
              <span class="w-7 h-7 rounded-lg bg-white/8 grid place-items-center text-xs font-bold text-indigo-200/70">{{ p.rank }}</span>
              <span class="text-xl">{{ p.petEmoji }}</span>
              <span class="font-medium text-indigo-50 truncate">{{ p.name }}</span>
              <span class="ml-auto font-bold text-amber-300">{{ p.points }}</span>
            </div>
          </div>
        </div>

        <!-- 第 8 名起正常列表 -->
        <div v-if="tableRows.length" class="glass overflow-hidden">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-indigo-200/70 border-b border-white/10">
                <th class="px-5 py-3 w-16">名次</th>
                <th class="px-5 py-3">学生</th>
                <th class="px-5 py-3">宠物</th>
                <th class="px-5 py-3 text-right">积分</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in tableRows" :key="r.id" class="border-b border-white/5 last:border-0 hover:bg-white/4">
                <td class="px-5 py-3">
                  <span class="w-7 h-7 inline-grid place-items-center rounded-lg text-xs font-bold bg-white/8 text-indigo-200/70">{{ r.rank }}</span>
                </td>
                <td class="px-5 py-3 font-medium text-indigo-50">{{ r.name }}</td>
                <td class="px-5 py-3 text-indigo-200/70">{{ r.petName ? r.petEmoji + ' ' + r.petName : '—' }}</td>
                <td class="px-5 py-3 text-right font-bold text-amber-300">{{ r.points }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-center text-indigo-200/50 py-6">暂无更多排名</p>
      </div>

      <!-- ===== 宠物经验 ===== -->
      <div v-if="tab === 'exp'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-4">
          <PawPrint class="w-5 h-5 text-fuchsia-300" /> 宠物经验管理
        </h3>
        <div class="flex flex-wrap gap-3 mb-4">
          <input v-model="expAmount" type="number" class="input !w-32" placeholder="经验值" />
          <input v-model="expReason" class="input !w-64" placeholder="加经验理由（可选）" />
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[480px] overflow-y-auto pr-1">
          <div
            v-for="s in students"
            :key="s.id"
            class="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3"
            :class="expFlashId === s.id ? '!border-fuchsia-400/60 exp-flash' : ''"
          >
            <span
              class="w-10 h-10 rounded-full grid place-items-center text-lg shrink-0"
              :style="{ background: `linear-gradient(135deg, ${s.speciesColorFrom}, ${s.speciesColorTo})` }"
            >{{ s.petEmoji || s.name.slice(0, 1) }}</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-indigo-50 truncate">{{ s.name }}</p>
              <p class="text-xs text-indigo-200/60">
                <template v-if="s.petId">
                  宠物 {{ s.petName }} · <b class="text-fuchsia-300">Lv.{{ (s.petStage ?? 0) + 1 }} {{ s.petStageLabel }}</b> · 经验 {{ s.petExp }} / {{ s.petNextExp ?? '—' }}
                </template>
                <template v-else>未领养宠物</template>
              </p>
            </div>
            <button
              class="btn btn-primary !py-1.5 text-xs"
              :disabled="!s.petId || !expAmount"
              @click="giveExp(s)"
            >
              加经验
            </button>
          </div>
        </div>
      </div>

      <!-- ===== 道具管理（下放给教师） ===== -->
      <div v-if="tab === 'items'"><ItemsManager /></div>

      <!-- ===== 状态规则（下放给教师） ===== -->
      <div v-if="tab === 'rules'"><RulesManager /></div>

      <!-- ===== 宠物等级 ===== -->
      <div v-if="tab === 'levels'"><PetsLevelManager /></div>

      <!-- ===== 积分流水 ===== -->
      <div v-if="tab === 'history'" class="glass p-5 animate-fadeUp">
        <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-4">
          <History class="w-5 h-5 text-sky-300" /> 积分流水查询
        </h3>
        <select v-model="historyStudent" class="input !w-72 mb-4" @change="loadHistory">
          <option value="">选择学生…</option>
          <option v-for="s in students" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <div v-if="historyList.length === 0" class="py-8 text-center text-indigo-200/50">暂无记录</div>
        <ul v-else class="space-y-2 max-h-[460px] overflow-y-auto pr-1">
          <li v-for="h in historyList" :key="h.id" class="flex items-center gap-3 rounded-lg bg-white/4 px-4 py-2.5">
            <span class="w-10 text-center font-bold" :class="h.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'">
              {{ h.delta >= 0 ? '+' : '' }}{{ h.delta }}
            </span>
            <span class="flex-1 text-sm text-indigo-100">{{ h.reason || '（无备注）' }}</span>
            <span class="text-xs text-indigo-200/50">{{ fmtTime(h.created_at) }}</span>
          </li>
        </ul>
      </div>
    </main>

    <!-- 底部操作栏（一体机大按钮） -->
    <div class="bottom-bar">
      <button class="btn btn-ghost !text-base" @click="goScreen">
        <MonitorPlay class="w-5 h-5" /> 大屏
      </button>
      <button class="btn btn-danger !text-base" @click="logout">
        <LogOut class="w-5 h-5" /> 退出登录
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  GraduationCap, MonitorPlay, LogOut, Users, Coins, TrendingUp, PawPrint,
  Plus, Zap, Send, History, Check, X, Store, Smile, Gauge, type LucideIcon,
} from 'lucide-vue-next';
import ItemsManager from '../components/ItemsManager.vue';
import RulesManager from '../components/RulesManager.vue';
import PetsLevelManager from '../components/PetsLevelManager.vue';
import { api, clearAuth } from '../api';
import { toast } from '../composables/toast';
import { useSettings } from '../composables/settings';
import { useFrostHeader } from '../composables/useFrostHeader';

interface Student {
  id: string; name: string; class_name: string; points: number;
  petId: string | null; petName: string | null; petExp: number | null;
  petStage: number | null; petStageLabel: string | null; petNextExp: number | null;
  petEmoji: string | null; speciesColorFrom: string; speciesColorTo: string;
}
interface Preset { id: string; label: string; delta: number; reason: string; }
interface RankRow { id: string; name: string; class_name: string; points: number; rank: number; petName: string | null; petEmoji: string; petExp: number; }

const router = useRouter();
const { pointsUnit } = useSettings();
const { headerEl } = useFrostHeader();
const tab = ref<'points' | 'rank' | 'exp' | 'history' | 'items' | 'rules' | 'levels'>('points');
const tabs: { key: 'points' | 'rank' | 'exp' | 'history' | 'items' | 'rules' | 'levels'; label: string; icon: LucideIcon }[] = [
  { key: 'points', label: '加减分', icon: Plus as LucideIcon },
  { key: 'rank', label: '排行榜', icon: TrendingUp as LucideIcon },
  { key: 'exp', label: '宠物经验', icon: PawPrint as LucideIcon },
  { key: 'items', label: '道具管理', icon: Store as LucideIcon },
  { key: 'rules', label: '状态规则', icon: Smile as LucideIcon },
  { key: 'levels', label: '宠物等级', icon: Gauge as LucideIcon },
  { key: 'history', label: '积分流水', icon: History as LucideIcon },
];

const students = ref<Student[]>([]);
const presets = ref<Preset[]>([]);
const board = ref<RankRow[]>([]);
const stats = reactive<Record<string, number>>({});

// 加减分表单
const selected = reactive(new Set<string>());
const searchKey = ref('');
const delta = ref(5);
const reason = ref('');

// 快捷预设（+ 快捷添加）
const presetAddOpen = ref(false);
const presetError = ref('');
const newPreset = reactive({ label: '', delta: 5 });

// 经验表单
const expAmount = ref(30);
const expReason = ref('');
const expTarget = ref('');
const expFlashId = ref('');
let expFlashTimer: ReturnType<typeof setTimeout> | null = null;

// 流水
const historyStudent = ref('');
const historyList = ref<{ id: string; delta: number; reason: string; created_at: string }[]>([]);

const filteredStudents = computed(() =>
  students.value.filter((s) => !searchKey.value || s.name.includes(searchKey.value))
);
const podiumOrdered = computed(() => {
  const byRank = (k: number) => board.value.find((r) => r.rank === k);
  return [byRank(2), byRank(1), byRank(3)].filter(Boolean) as RankRow[];
});
const floatingLeft = computed(() => board.value.filter((r) => r.rank === 4 || r.rank === 5));
const floatingRight = computed(() => board.value.filter((r) => r.rank === 6 || r.rank === 7));
const tableRows = computed(() => board.value.filter((r) => r.rank > 7));
const fmtTime = (s: string): string => new Date(s).toLocaleString('zh-CN', { hour12: false });
const podiumColor = (rank: number): string =>
  rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : '#fb923c';

function switchTab(key: 'points' | 'rank' | 'exp' | 'history' | 'items' | 'rules' | 'levels'): void {
  tab.value = key;
  if (key === 'rank' && board.value.length === 0) loadBoard();
  if (key === 'history') historyList.value = [];
}

function toggleSelect(id: string): void {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
}

function adjustDelta(n: number): void {
  delta.value = Math.round((delta.value || 0) + n);
}

function usePreset(p: Preset): void {
  delta.value = p.delta;
  reason.value = p.reason;
  toast(`已填入：${p.label}（${p.delta > 0 ? '+' : ''}${p.delta} 分）`, 'info');
}

async function addPreset(): Promise<void> {
  presetError.value = '';
  if (!newPreset.label.trim() || !newPreset.delta) {
    presetError.value = '请填写名称与分值';
    return;
  }
  try {
    await api('/presets', {
      method: 'POST',
      body: JSON.stringify({ label: newPreset.label.trim(), delta: newPreset.delta, reason: newPreset.label.trim() }),
    });
    toast('快捷预设已添加', 'success');
    newPreset.label = '';
    newPreset.delta = 5;
    presetAddOpen.value = false;
    await loadPresets();
  } catch (e) {
    presetError.value = (e as Error).message;
  }
}

async function removePreset(p: Preset): Promise<void> {
  if (!confirm(`删除快捷预设「${p.label}」？`)) return;
  try {
    await api(`/presets/${p.id}`, { method: 'DELETE' });
    toast('已删除', 'success');
    await loadPresets();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function applyPoints(): Promise<void> {
  if (selected.size === 0) {
    toast('请选择学生', 'error');
    return;
  }
  if (delta.value === 0) {
    toast('分值为 0，无法提交', 'error');
    return;
  }
  try {
    const r = await api<{ applied: number; totalDelta: number }>('/points', {
      method: 'POST',
      body: JSON.stringify({ studentIds: [...selected], delta: delta.value, reason: reason.value.trim() }),
    });
    toast(`已对 ${r.applied} 名学生${delta.value >= 0 ? '加' : '扣'} ${Math.abs(delta.value)} 分`, 'success');
    selected.clear();
    reason.value = '';
    delta.value = 5;
    await Promise.all([loadStudents(), loadStats(), loadBoard()]);
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function giveExp(s: Student): Promise<void> {
  if (!s.petId) return;
  const beforeStage = s.petStage ?? 0;
  try {
    await api(`/pets/${s.petId}/exp`, { method: 'POST', body: JSON.stringify({ amount: Number(expAmount.value) || 0 }) });
    await loadStudents();
    const updated = students.value.find((x) => x.id === s.id);
    const afterStage = updated?.petStage ?? beforeStage;
    // 反馈：卡片闪烁 + 升级提示动画
    expFlashId.value = s.id;
    if (expFlashTimer) clearTimeout(expFlashTimer);
    expFlashTimer = setTimeout(() => (expFlashId.value = ''), 1600);
    if (afterStage > beforeStage && updated) {
      toast(`🎉 ${s.name} 的宠物升级啦！Lv.${afterStage + 1}「${updated.petStageLabel}」`, 'success');
    } else {
      toast(`已给 ${s.name} 的宠物加 ${expAmount.value} 经验（当前 ${updated?.petExp ?? s.petExp}）`, 'success');
    }
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function loadHistory(): Promise<void> {
  if (!historyStudent.value) return;
  try {
    const r = await api<{ history: { id: string; delta: number; reason: string; created_at: string }[] }>(
      `/points/history?studentId=${historyStudent.value}`
    );
    historyList.value = r.history;
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function loadStudents(): Promise<void> {
  const r = await api<{ students: Student[] }>('/students');
  students.value = r.students;
}
async function loadPresets(): Promise<void> {
  const r = await api<{ presets: Preset[] }>('/presets');
  presets.value = r.presets;
}
async function loadBoard(): Promise<void> {
  const r = await api<{ rows: RankRow[] }>('/leaderboard');
  board.value = r.rows;
}
async function loadStats(): Promise<void> {
  const r = await api<Record<string, number>>('/teacher/stats');
  Object.assign(stats, r);
}

function goScreen(): void {
  window.open('/screen', '_blank');
}
function logout(): void {
  clearAuth();
  router.push('/login');
}

onMounted(async () => {
  await Promise.all([loadStudents(), loadPresets(), loadStats(), loadBoard()]);
});
</script>