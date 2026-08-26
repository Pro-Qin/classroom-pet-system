<template>
  <div class="min-h-screen overflow-y-auto relative">
    <!-- 顶部 -->
    <header class="pt-8 pb-4 text-center relative z-10">
      <h1 class="text-4xl font-bold text-indigo-50 tracking-wide">校园宠物乐园 · 班级荣誉榜</h1>
      <p class="mt-2 text-lg text-indigo-200/70">{{ nowText }} · 自动轮播展示</p>
    </header>

    <!-- 轮播内容 -->
    <Transition name="fade" mode="out-in">
      <main :key="view" class="max-w-6xl mx-auto px-8 pb-36">
        <!-- 排行榜 -->
        <div v-if="view === 'rank'">
          <div class="grid grid-cols-3 gap-6 items-end mb-8">
            <div v-for="p in podium" :key="p.rank" class="text-center">
              <div
                class="rounded-t-3xl relative grid place-items-center mx-auto max-w-56"
                :style="{ height: p.rank === 1 ? '12rem' : p.rank === 2 ? '9.5rem' : '7rem', background: `linear-gradient(180deg, ${podiumColor(p.rank)}88, #1b2447)` }"
              >
                <span class="text-7xl absolute -top-16" :class="p.rank === 1 ? 'animate-bounce-soft' : ''">{{ p.petEmoji }}</span>
                <span
                  class="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full grid place-items-center text-2xl font-black"
                  :class="p.rank === 1 ? 'bg-amber-400 text-amber-950' : p.rank === 2 ? 'bg-slate-300 text-slate-700' : 'bg-orange-400 text-orange-950'"
                >{{ p.rank }}</span>
              </div>
              <p class="mt-4 text-3xl font-bold text-indigo-50">{{ p.name }}</p>
              <p v-if="p.petStageLabel" class="text-base text-fuchsia-300/90 mt-0.5">Lv.{{ (p.petStage ?? 0) + 1 }} {{ p.petStageLabel }}</p>
              <p class="text-2xl text-amber-300 font-bold mt-1">{{ p.points }} {{ pointsUnit }}</p>
            </div>
          </div>
          <div class="glass overflow-hidden">
            <table class="w-full text-lg">
              <tbody>
                <tr v-for="r in board" :key="r.id" class="border-b border-white/5 last:border-0">
                  <td class="px-6 py-4 w-20 text-2xl font-black text-indigo-200/80">{{ r.rank }}</td>
                  <td class="px-6 py-4 font-semibold text-indigo-50 text-xl">{{ r.name }}</td>
                  <td class="px-6 py-4 text-indigo-200/70">{{ r.class_name }}</td>
                  <td class="px-6 py-4 text-indigo-200/70 text-xl">{{ r.petEmoji }} {{ r.petName ?? '' }}<span v-if="r.petStageLabel" class="ml-2 text-base text-fuchsia-300/80">Lv.{{ (r.petStage ?? 0) + 1 }}</span></td>
                  <td class="px-6 py-4 text-right text-2xl font-bold text-amber-300">{{ r.points }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 宠物墙 -->
        <div v-else>
          <h2 class="text-2xl font-bold text-indigo-100 mb-6 text-center">宠物乐园 · 全体宠物</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            <div v-for="p in petWall" :key="p.id" class="text-center animate-fadeUp">
              <div
                class="w-28 h-28 mx-auto rounded-full grid place-items-center text-6xl shadow-glow animate-float"
                :style="{ background: `linear-gradient(135deg, ${p.speciesColorFrom}, ${p.speciesColorTo})` }"
              >
                <img v-if="p.avatarPath" :src="p.avatarPath" class="w-full h-full rounded-full object-cover" alt="" />
                <span v-else>{{ p.petEmoji }}</span>
              </div>
              <p class="mt-3 font-semibold text-indigo-50 text-lg">{{ p.petName }}</p>
              <p class="text-sm text-indigo-200/70">{{ p.name }}</p>
              <span class="pill mt-1.5" :style="{ background: p.stateColor + '33', color: p.stateColor }">{{ p.stateLabel }}</span>
            </div>
          </div>
        </div>
      </main>
    </Transition>

    <!-- 进度指示 -->
    <div class="fixed bottom-24 left-1/2 -translate-x-1/2 flex gap-2 z-10">
      <span v-for="v in views" :key="v" class="w-3 h-3 rounded-full transition-all duration-500" :class="view === v ? 'bg-indigo-300 scale-125' : 'bg-white/15'" />
    </div>

    <!-- 底部退出（一体机大按钮） -->
    <div class="bottom-bar">
      <button class="btn btn-ghost !text-base" @click="exitKiosk">
        <LogOut class="w-5 h-5" /> 退出大屏
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { LogOut } from 'lucide-vue-next';
import { api } from '../api';
import { useSettings } from '../composables/settings';
import { getLocalSetting } from '../composables/useLocalSettings';

interface RankRow { id: string; name: string; class_name: string; points: number; rank: number; petName: string | null; petEmoji: string; petExp: number; petStage: number | null; petStageLabel: string | null; }
interface StudentCard { id: string; name: string; class_name: string; petId: string | null; petName: string | null; petEmoji: string | null; speciesColorFrom: string; speciesColorTo: string; }
interface PetWallItem extends StudentCard {
  petExp: number;
  avatarPath: string | null;
  stateLabel: string;
  stateColor: string;
}

const { pointsUnit } = useSettings();
const view = ref<'rank' | 'pets'>('rank');
const views = ['rank', 'pets'];
const board = ref<RankRow[]>([]);
const petWall = ref<PetWallItem[]>([]);
const nowText = ref('');

const podium = computed(() => board.value.filter((r) => r.rank <= 3));
const podiumColor = (rank: number): string => (rank === 1 ? '#fbbf24' : rank === 2 ? '#94a3b8' : '#fb923c');

let timer: ReturnType<typeof setInterval> | null = null;
let clock: ReturnType<typeof setInterval> | null = null;

const STATE_STYLES: [string, string][] = [
  ['sick', '#ef4444'], ['angry', '#f97316'], ['sleep', '#818cf8'], ['sleepy', '#a5b4fc'],
  ['tired', '#94a3b8'], ['sad', '#60a5fa'], ['hungry', '#fbbf24'], ['dirty', '#b45309'],
  ['excited', '#facc15'], ['happy', '#4ade80'], ['normal', '#94a3b8'],
];

function attrToState(h: number, hu: number, ha: number, c: number): { label: string; color: string } {
  const rules: { cond: boolean; key: string; label: string }[] = [
    { cond: h < 30, key: 'sick', label: '生病' },
    { cond: ha < 20, key: 'angry', label: '生气' },
    { cond: ha < 25 && hu < 45, key: 'sleep', label: '睡觉' },
    { cond: ha < 40, key: 'sleepy', label: '犯困' },
    { cond: h < 55, key: 'tired', label: '疲惫' },
    { cond: ha < 45, key: 'sad', label: '伤心' },
    { cond: hu < 40, key: 'hungry', label: '饿了' },
    { cond: c < 30, key: 'dirty', label: '脏兮兮' },
    { cond: ha >= 90, key: 'excited', label: '兴奋' },
    { cond: ha >= 70, key: 'happy', label: '开心' },
  ];
  const hit = rules.find((r) => r.cond);
  const s = hit ? hit : { key: 'normal', label: '平静' };
  const color = STATE_STYLES.find(([k]) => k === s.key)?.[1] ?? '#94a3b8';
  return { label: s.label, color };
}

async function load(): Promise<void> {
  try {
    const r = await api<{ rows: RankRow[] }>('/leaderboard');
    board.value = r.rows;
  } catch {
    board.value = [];
  }
  try {
    const [stuResp, pets] = await Promise.all([
      api<{ students: StudentCard[] }>('/students'),
      api<{ pets: { student_id: string; name: string; avatar_path: string | null; health: number; hungry: number; happy: number; clean: number; exp: number }[] }>('/pets/all').catch(() => null),
    ]);
    const petMap = new Map((pets?.pets ?? []).map((p) => [p.student_id, p]));
    petWall.value = stuResp.students
      .map((s) => {
        const p = petMap.get(s.id);
        if (!p) return null;
        const st = attrToState(p.health, p.hungry, p.happy, p.clean);
        return { ...s, petExp: p.exp, avatarPath: p.avatar_path, stateLabel: st.label, stateColor: st.color };
      })
      .filter(Boolean) as PetWallItem[];
  } catch {
    /* ignore */
  }
}

function tick(): void {
  nowText.value = new Date().toLocaleString('zh-CN', { hour12: false });
}

// 退出大屏：大屏通常以独立 Edge 应用窗口打开（kiosk.bat 用 --app）。
// 关闭该窗口即可回到原来的浏览器标签页；若 window.close 被拦截（如以普通标签页打开），
// 则回退到登录页。
function exitKiosk(): void {
  window.close();
  // 若窗口未能关闭（普通标签页场景），延迟后导航回登录页作为兜底。
  setTimeout(() => {
    if (!window.closed) {
      window.location.href = '/login';
    }
  }, 120);
}

onMounted(() => {
  load();
  tick();
  clock = setInterval(tick, 1000);
  const intervalSec = Math.max(0, Number(getLocalSetting('kioskInterval', 10)));
  if (intervalSec > 0) {
    timer = setInterval(() => {
      view.value = view.value === 'rank' ? 'pets' : 'rank';
      if (view.value === 'pets') load();
    }, intervalSec * 1000);
  }
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (clock) clearInterval(clock);
});
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.6s ease, transform 0.6s ease;
}
.fade-enter-from {
  opacity: 0;
  transform: translateY(24px);
}
.fade-leave-to {
  opacity: 0;
  transform: translateY(-24px);
}
</style>