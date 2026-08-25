<template>
  <div class="min-h-screen pb-28">
    <header ref="headerEl" class="sticky top-0 z-40 border-b" style="border-bottom-color:rgba(255,255,255,0)">
      <div class="max-w-6xl mx-auto px-5 py-3 text-center">
        <h1 class="font-bold text-indigo-50">学生系统<span v-if="detail" class="text-indigo-200/60 font-normal"> · {{ detail.student.name }}</span></h1>
        <p class="text-xs text-indigo-200/50">查看宠物 · 商店购物 · 积分流水</p>
          <a v-if="updateInfo.hasUpdate" :href="updateInfo.url" target="_blank" class="inline-flex items-center gap-1 mt-1 pill !px-2.5 !py-1 text-[10px] bg-amber-500/20 text-amber-200 border border-amber-400/30 hover:bg-amber-500/30">
            <Download class="w-3 h-3" /> 发现新版本 {{ updateInfo.latestVersion }}
          </a>
      </div>
    </header>

    <main v-if="detail" class="max-w-6xl mx-auto px-5 pt-6 grid lg:grid-cols-3 gap-6">
      <!-- ===== 左侧：学生信息栏 + 宠物卡 ===== -->
      <section class="lg:col-span-1 space-y-6 h-fit">
        <!-- 学生信息栏 -->
        <div class="glass p-6 animate-fadeUp">
          <div class="flex items-center gap-4">
            <div
              class="w-16 h-16 rounded-2xl grid place-items-center text-2xl font-bold shrink-0 shadow-glow"
              :style="{ background: `linear-gradient(135deg, #6366f1, #8b5cf6)` }"
            >
              {{ pet?.species?.emoji ?? detail.student.name.slice(0, 1) }}
            </div>
            <div class="min-w-0">
              <p class="text-lg font-bold text-indigo-50 truncate">{{ detail.student.name }}</p>
              <p class="text-xs text-indigo-200/60">{{ pet ? pet.name : '尚未领养宠物' }}</p>
            </div>
          </div>

          <div class="mt-5 flex items-end justify-between rounded-2xl bg-gradient-to-r from-amber-500/15 to-orange-500/10 border border-amber-400/25 px-4 py-3">
            <div>
              <p class="text-xs text-amber-200/70 flex items-center gap-1"><Coins class="w-3.5 h-3.5" /> 我的{{ pointsUnit }}</p>
              <p class="text-4xl font-black text-amber-300 points-glow leading-tight">{{ detail.student.points }}</p>
            </div>
            <Trophy class="w-8 h-8 text-amber-300/60" />
          </div>

          <div class="mt-3 grid grid-cols-3 gap-2 text-center">
            <div class="rounded-xl bg-white/5 border border-white/10 py-2.5">
              <p class="text-lg font-bold text-indigo-50">{{ rank || '—' }}</p>
              <p class="text-[11px] text-indigo-200/60">积分排名</p>
            </div>
            <div class="rounded-xl bg-white/5 border border-white/10 py-2.5">
              <p class="text-lg font-bold text-indigo-50">{{ historyStats.count }}</p>
              <p class="text-[11px] text-indigo-200/60">流水条数</p>
            </div>
            <div class="rounded-xl bg-white/5 border border-white/10 py-2.5">
              <p class="text-lg font-bold text-emerald-300">+{{ historyStats.gained }}</p>
              <p class="text-[11px] text-indigo-200/60">累计获得</p>
            </div>
          </div>

          <button class="btn btn-gold w-full mt-3" @click="scrollToHistory">
            <History class="w-4 h-4" /> 查看我的积分流水
          </button>
        </div>

        <!-- 宠物卡 -->
        <div class="glass p-6 animate-fadeUp">
          <div class="flex items-center justify-between">
            <h2 class="font-bold text-indigo-50 flex items-center gap-2">
              <PawPrint class="w-5 h-5 text-fuchsia-300" /> {{ detail.student.name }} 的宠物
            </h2>
            <span v-if="pet" class="pill" :style="{ background: pet.state.color + '33', color: pet.state.color }">
              <component :is="iconOf(pet.state.icon)" class="w-3.5 h-3.5" /> {{ pet.state.label }}
            </span>
          </div>

          <template v-if="pet">
            <div class="relative mt-5 flex flex-col items-center">
              <div
                class="relative w-40 h-40 rounded-full grid place-items-center animate-float shadow-glow cursor-pointer"
                :style="{ background: `linear-gradient(135deg, ${pet.species?.colorFrom ?? '#6366f1'}, ${pet.species?.colorTo ?? '#8b5cf6'})` }"
                @click="petInteract"
                title="摸摸它！"
              >
                <div class="absolute inset-0 pointer-events-none overflow-visible">
                  <TransitionGroup name="burst">
                    <span
                      v-for="b in bursts"
                      :key="b.id"
                      class="absolute text-2xl burst-emoji"
                      :style="{ left: b.x + '%', top: b.y + '%' }"
                    >{{ b.emoji }}</span>
                  </TransitionGroup>
                </div>
                <img
                  v-if="pet.avatarPath"
                  :src="pet.avatarPath"
                  class="w-full h-full rounded-full object-cover"
                  alt="宠物头像"
                />
                <span v-else class="text-6xl drop-shadow-lg">{{ pet.species?.emoji }}</span>
                <button
                  class="absolute bottom-1 right-1 w-11 h-11 rounded-full bg-emerald-500/30 border border-emerald-300/50 grid place-items-center shadow-glow hover:scale-110 transition-transform z-10"
                  title="打开背包"
                  @click.stop="backpackOpen = true"
                >
                  <Backpack class="w-5 h-5 text-emerald-200" />
                  <span v-if="backpackCount" class="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-amber-400 text-amber-950 text-[11px] font-bold grid place-items-center">{{ backpackCount }}</span>
                </button>
              </div>
              <span class="pill mt-3 bg-white/10 text-indigo-200">
                Lv.{{ pet.stage + 1 }} · {{ pet.stageLabel }}
              </span>
              <p class="mt-1 text-lg font-bold text-indigo-50">{{ pet.name }}</p>
              <p class="text-xs text-indigo-200/60">
                经验 {{ pet.exp }} / 下一阶段 {{ nextExp }}
              </p>
              <div class="mt-2 w-48 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400 transition-all duration-500"
                  :style="{ width: expPercent + '%' }"
                />
              </div>
              <p v-if="petBubble" class="mt-2 text-xs text-fuchsia-200/90 animate-fadeUp">{{ petBubble }}</p>
            </div>

            <div class="mt-5 grid grid-cols-2 gap-3">
              <button class="btn btn-ghost !py-2 text-sm" @click="renameOpen = !renameOpen">
                <Edit3 class="w-4 h-4" /> 改名
              </button>
              <label class="btn btn-ghost !py-2 text-sm cursor-pointer">
                <ImagePlus class="w-4 h-4" /> 换头像
                <input type="file" accept="image/*" class="hidden" @change="onAvatarChange" />
              </label>
            </div>
            <div v-if="renameOpen" class="mt-3 flex gap-2">
              <input v-model="newName" class="input !py-2 text-sm" placeholder="新名字" @keyup.enter="doRename" />
              <button class="btn btn-primary !py-2" @click="doRename">确定</button>
            </div>

            <div class="mt-6 space-y-3">
              <div v-for="attr in attrs" :key="attr.key" class="flex items-center gap-3">
                <span class="w-16 text-xs text-indigo-200/80">{{ attr.label }}</span>
                <div class="flex-1 h-2.5 rounded-full bg-white/10 overflow-hidden relative">
                  <div
                    class="h-full rounded-full transition-all duration-700"
                    :style="{ width: pet[attr.key] + '%', background: attrColor(attr.key, pet[attr.key]) }"
                  />
                  <div
                    v-if="previewEffect && previewEffect[attr.key]"
                    class="absolute inset-y-0 left-0 rounded-full bg-emerald-300/70 attr-flash"
                    :style="{ width: projectedAttr(attr.key) + '%' }"
                  />
                </div>
                <span class="w-16 text-right text-xs font-semibold" :class="previewEffect && previewEffect[attr.key] ? 'text-emerald-300' : 'text-indigo-100'">
                  {{ pet[attr.key] }}<span v-if="previewEffect && previewEffect[attr.key]" class="attr-flash-text"> +{{ previewEffect[attr.key] }}</span>
                </span>
              </div>
              <p v-if="previewEffect" class="text-[11px] text-emerald-200/80 animate-fadeUp">↑ 使用该道具后的预览效果（点击其他物品可切换）</p>
            </div>
          </template>

          <template v-else>
            <!-- 未领养：白底黑字问号 + 差色特效 -->
            <div class="relative mt-5 flex flex-col items-center">
              <div class="w-40 h-40 rounded-full bg-white grid place-items-center animate-float shadow-glow overflow-hidden">
                <span class="no-pet-avatar text-6xl font-black text-black select-none">?</span>
              </div>
              <p class="mt-3 text-sm font-bold text-indigo-50">还没有宠物</p>
              <p class="text-xs text-indigo-200/60 text-center">选择下方种类，领养你的宠物伙伴吧！</p>
            </div>
            <div class="mt-5 grid grid-cols-3 gap-2 max-h-[240px] overflow-y-auto pr-1">
              <button
                v-for="sp in speciesList"
                :key="sp.id"
                class="rounded-xl border p-2.5 text-center transition-colors cursor-pointer"
                :class="adoptSpeciesId === sp.id ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 bg-white/5 hover:bg-white/10'"
                @click="adoptSpeciesId = sp.id"
              >
                <div
                  class="w-10 h-10 mx-auto rounded-full grid place-items-center text-xl overflow-hidden"
                  :style="{ background: `linear-gradient(135deg, ${sp.color_from}, ${sp.color_to})` }"
                >
                  <img v-if="sp.avatar_path" :src="sp.avatar_path" class="w-full h-full object-cover" alt="" />
                  <span v-else>{{ sp.emoji }}</span>
                </div>
                <p class="text-xs font-medium text-indigo-50 mt-1 truncate">{{ sp.name }}</p>
              </button>
              <p v-if="speciesList.length === 0" class="col-span-3 text-center text-xs text-indigo-200/50 py-4">暂无可用宠物种类，请联系老师添加</p>
            </div>
            <div class="mt-3 flex gap-2">
              <input v-model="adoptName" class="input !py-2 text-sm flex-1" placeholder="给宠物起个名字（可留空）" @keyup.enter="doAdopt" />
              <button class="btn btn-primary !py-2 shrink-0" :disabled="!adoptSpeciesId" @click="doAdopt">
                <PawPrint class="w-4 h-4" /> 领养
              </button>
            </div>
          </template>
        </div>

      </section>

      <!-- ===== 右侧：商店 / 背包 / 流水 ===== -->
      <section class="lg:col-span-2 space-y-6">
        <!-- 商店 -->
        <div class="glass p-6 animate-fadeUp">
          <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-4">
            <Store class="w-5 h-5 text-amber-300" /> 道具商店
            <span class="ml-auto pill bg-white/10 text-indigo-200/80">{{ detail.items.length }} 件商品</span>
          </h3>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div
              v-for="item in detail.items"
              :key="item.id"
              class="rounded-xl bg-white/5 border border-white/10 p-3 flex flex-col glass-hover"
            >
              <div class="flex items-center justify-between">
                <span class="w-9 h-9 rounded-lg bg-indigo-500/20 grid place-items-center">
                  <component :is="iconOf(item.icon)" class="w-5 h-5 text-indigo-200" />
                </span>
                <span class="pill bg-amber-400/15 text-amber-300 text-xs">
                  <Coins class="w-3 h-3" /> {{ item.cost }}
                </span>
              </div>
              <p class="mt-2 text-sm font-semibold text-indigo-50">{{ item.name }}</p>
              <p class="text-xs text-indigo-200/60 mt-0.5 flex-1">{{ item.desc }}</p>
              <div class="flex gap-1.5 mt-2">
                <button
                  class="btn btn-gold !py-1.5 text-xs flex-1"
                  :disabled="detail.student.points < item.cost"
                  @click="buyAndUse(item)"
                >
                  <Sparkles class="w-3.5 h-3.5" /> 购买并使用
                </button>
                <button
                  class="btn btn-ghost !py-1.5 !px-2.5 text-xs shrink-0"
                  title="仅购买，放入背包"
                  :disabled="detail.student.points < item.cost"
                  @click="buy(item)"
                >
                  <Backpack class="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 积分流水 -->
        <div id="history-section" class="glass p-6 animate-fadeUp scroll-mt-20">
          <h3 class="font-bold text-indigo-50 flex items-center gap-2 mb-4">
            <History class="w-5 h-5 text-sky-300" /> 我的积分流水
            <span class="ml-auto pill bg-white/10 text-indigo-200/80">共 {{ detail.history.length }} 条</span>
          </h3>
            <div v-if="detail.trend && detail.trend.length" class="mb-4 h-20 flex items-end gap-[2px] overflow-hidden">
              <div
                v-for="p in detail.trend"
                :key="p.day"
                class="flex-1 min-w-[3px] rounded-t bg-gradient-to-t from-sky-500/50 to-fuchsia-400/70"
                :style="{ height: Math.max(3, (Math.abs(p.delta) / Math.max(1, ...detail.trend.map(x => Math.abs(x.delta)))) * 100) + '%' }"
                :title="p.day + ' ' + p.delta"
              />
            </div>
          <div v-if="detail.history.length === 0" class="py-6 text-center text-indigo-200/50">暂无记录</div>
          <ul v-else class="space-y-2 max-h-80 overflow-y-auto pr-1">
            <li
              v-for="(h, i) in detail.history"
              :key="h.id"
              class="flex items-center gap-3 rounded-lg bg-white/4 border border-white/8 px-3.5 py-2.5"
            >
              <span
                class="w-10 text-center font-bold text-sm shrink-0"
                :class="h.delta >= 0 ? 'text-emerald-300' : 'text-rose-300'"
              >
                {{ h.delta >= 0 ? '+' : '' }}{{ h.delta }}
              </span>
              <div class="flex-1 min-w-0">
                <p class="text-sm text-indigo-100 truncate">{{ h.reason || '（无备注）' }}</p>
                <p class="text-xs text-indigo-200/50">
                  {{ h.operator === 'student' ? '商店消费' : h.operator === 'admin' ? '管理员' : '教师' }} ·
                  {{ fmtTime(h.created_at) }}
                </p>
              </div>
              <span class="w-12 text-right text-xs text-indigo-200/60">余额 {{ balanceOf(i) }}</span>
            </li>
          </ul>
        </div>
      </section>
    </main>

    <div v-else class="min-h-[60vh] grid place-items-center">
      <p class="text-indigo-200/70">{{ loadError || '加载中…' }}</p>
    </div>

    <!-- 背包侧栏（不遮挡背景） -->
    <Transition name="panel">
      <aside
        v-if="backpackOpen"
        class="fixed top-0 right-0 bottom-0 w-[min(26rem,94vw)] z-50 glass !rounded-none border-y-0 border-r-0 flex flex-col"
      >
        <div class="flex items-center gap-2 px-5 py-4 border-b border-white/10 shrink-0">
          <Backpack class="w-5 h-5 text-emerald-300" />
          <h3 class="font-bold text-indigo-50">背包</h3>
          <span class="ml-auto pill bg-white/10 text-indigo-200/80">{{ backpackCount }} 件</span>
          <button class="btn btn-ghost !py-1 !px-2" @click="backpackOpen = false"><X class="w-4 h-4" /></button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <p v-if="!detail?.backpack.length" class="text-center text-indigo-200/50 py-10">背包空空如也，去商店买点东西吧～</p>
          <div
            v-for="b in detail?.backpack ?? []"
            :key="b.item_id"
            class="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3 cursor-pointer glass-hover"
            @click="previewItemEffect(b)"
          >
            <template v-if="confirmItemId === b.item_id">
              <div class="flex-1 text-center py-1">
                <p class="text-sm font-semibold text-indigo-50 mb-2">确定使用「{{ b.name }}」？</p>
                <div class="flex gap-2 justify-center">
                  <button class="btn btn-gold !py-1 !px-4 text-xs" @click.stop="confirmUse(b)"><Check class="w-3.5 h-3.5" /> 使用</button>
                  <button class="btn btn-ghost !py-1 !px-4 text-xs" @click.stop="confirmItemId = ''"><X class="w-3.5 h-3.5" /> 取消</button>
                </div>
              </div>
            </template>
            <template v-else>
              <div class="w-10 h-10 rounded-lg bg-emerald-500/15 grid place-items-center shrink-0">
                <component :is="iconOf(b.icon)" class="w-5 h-5 text-emerald-200" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-indigo-50 truncate">{{ b.name }}</p>
                <p class="text-xs text-indigo-200/60">x{{ b.qty }} · {{ effectText(b.effect) }}</p>
              </div>
              <span class="text-[11px] text-emerald-200/60 shrink-0">点击使用</span>
            </template>
          </div>
        </div>
      </aside>
    </Transition>

    <!-- 底部返回（一体机大按钮） -->
    <div class="bottom-bar">
      <button class="btn btn-ghost !text-base" @click="router.push('/login')">
        <ChevronLeft class="w-5 h-5" /> 返回登录
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ChevronLeft, Star, PawPrint, Edit3, ImagePlus, Store, Coins, Backpack, History, Trophy, X, Check,
  Apple, Cake, Milk, Fish, Sparkles, ShowerHead, Volleyball, CircleDot, Cross, FlaskConical,
  BookOpen, Smile, Moon, MoonStar, Flame, BatteryLow, CloudRain, Utensils, Shirt, Zap, SmilePlus,
  Thermometer, Download, type LucideIcon,
} from 'lucide-vue-next';
import { api, upload } from '../api';
import { toast } from '../composables/toast';
import { pick, vibe } from '../composables/useCopyStyle';
import { cropToCircleBlob } from '../utils/avatar';
import { useSettings } from '../composables/settings';
import { useFrostHeader } from '../composables/useFrostHeader';

interface PetState {
  key: string;
  label: string;
  icon: string;
  color: string;
}
interface PetDetail {
  id: string;
  speciesId: string;
  name: string;
  exp: number;
  stage: number;
  stageLabel: string;
  stageLabels: string[];
  thresholds: number[];
  avatarPath: string | null;
  health: number;
  hungry: number;
  happy: number;
  clean: number;
  state: PetState;
  species: { id: string; name: string; emoji: string; colorFrom: string; colorTo: string } | null;
}
interface Detail {
  student: { id: string; student_no: string; name: string; class_name: string; points: number };
  pet: PetDetail | null;
  backpack: { item_id: string; qty: number; name: string; icon: string; type: string; effect: string; desc: string }[];
  items: { id: string; name: string; icon: string; type: string; cost: number; effect: string; desc: string }[];
  history: { id: string; delta: number; reason: string; operator: string; created_at: string }[];
    trend?: { day: string; delta: number }[];
}

const route = useRoute();
const router = useRouter();
const { pointsUnit } = useSettings();
const { headerEl } = useFrostHeader();
const detail = ref<Detail | null>(null);
const loadError = ref('');
const updateInfo = ref<{ hasUpdate: boolean; latestVersion: string; url: string }>({ hasUpdate: false, latestVersion: '', url: '' });
const renameOpen = ref(false);
const newName = ref('');
const studentId = route.params.id as string;
const students = ref<{ id: string; points: number }[]>([]);
const speciesList = ref<{ id: string; name: string; emoji: string; avatar_path: string | null; color_from: string; color_to: string }[]>([]);
const adoptSpeciesId = ref('');
const adoptName = ref('');
const backpackOpen = ref(false);
const confirmItemId = ref('');
const previewItem = ref<(Detail['backpack'][number]) | null>(null);

// 宠物互动小彩蛋
const bursts = ref<{ id: number; x: number; y: number; emoji: string }[]>([]);
const petBubble = ref('');
let burstSeq = 0;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
const BURST_EMOJIS = ['❤️', '🍖', '⚽', '✨', '🎈', '💤', '🐾'];
const BURST_TEXTS = ['啾～', '好开心！', '摸摸头～', '汪！', '喵～', '嘿嘿~', '咕噜咕噜…'];
function petInteract(): void {
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    burstSeq += 1;
    bursts.value.push({
      id: now + i,
      x: 15 + Math.random() * 70,
      y: 10 + Math.random() * 70,
      emoji: BURST_EMOJIS[Math.floor(Math.random() * BURST_EMOJIS.length)],
    });
  }
  setTimeout(() => {
    bursts.value = bursts.value.filter((b) => b.id !== now && b.id !== now + 1 && b.id !== now + 2);
  }, 1100);
  petBubble.value = BURST_TEXTS[Math.floor(Math.random() * BURST_TEXTS.length)];
  if (bubbleTimer) clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (petBubble.value = ''), 1600);
}

const pet = computed(() => detail.value?.pet ?? null);

const rank = computed(() => {
  if (!detail.value) return 0;
  const sorted = [...students.value].sort((a, b) => b.points - a.points);
  const idx = sorted.findIndex((s) => s.id === detail.value!.student.id);
  return idx >= 0 ? idx + 1 : 0;
});
const historyStats = computed(() => {
  const h = detail.value?.history ?? [];
  const gained = h.filter((x) => x.delta > 0).reduce((s, x) => s + x.delta, 0);
  const spent = Math.abs(h.filter((x) => x.delta < 0).reduce((s, x) => s + x.delta, 0));
  return { count: h.length, gained, spent };
});
const backpackCount = computed(() => (detail.value?.backpack ?? []).reduce((s, b) => s + b.qty, 0));
const previewEffect = computed<Record<string, number> | null>(() => {
  const b = previewItem.value;
  if (!b) return null;
  try { return JSON.parse(b.effect) as Record<string, number>; } catch { return null; }
});
function effectText(effect: string): string {
  try {
    const o2 = JSON.parse(effect) as Record<string, number>;
    return Object.entries(o2).map(([k, v]) => k + ' +' + v).join('，');
  } catch { return ''; }
}
function projectedAttr(key: string): number {
  const eff = previewEffect.value?.[key] ?? 0;
  const cur = (pet.value?.[key as keyof PetDetail] as number) ?? 0;
  return Math.max(0, Math.min(100, cur + eff));
}
function previewItemEffect(b: Detail['backpack'][number]): void {
  previewItem.value = b;
  confirmItemId.value = b.item_id;
}
async function confirmUse(b: Detail['backpack'][number]): Promise<void> {
  confirmItemId.value = '';
  previewItem.value = null;
  await useItem(b.item_id);
}
function balanceOf(i: number): number {
  const h = detail.value?.history ?? [];
  const base = detail.value?.student.points ?? 0;
  let sum = 0;
  for (let k = 0; k <= i; k++) sum += h[k].delta;
  return base - sum;
}
function scrollToHistory(): void {
  document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const attrs = [
  { key: 'health', label: '健康' },
  { key: 'hungry', label: '饱食' },
  { key: 'happy', label: '心情' },
  { key: 'clean', label: '清洁' },
] as const;

const DEFAULT_EXP_STEPS = [0, 100, 300, 600, 1000, 1500, 2200];
const expSteps = computed(() => {
  const t = pet.value?.thresholds;
  return t && t.length === 7 ? t : DEFAULT_EXP_STEPS;
});
const nextExp = computed(() => {
  if (!pet.value) return 0;
  const steps = expSteps.value;
  const stage = pet.value.stage;
  return steps[stage + 1] ?? steps[stage];
});
const expPercent = computed(() => {
  if (!pet.value) return 0;
  const steps = expSteps.value;
  const stage = pet.value.stage;
  const lo = steps[stage];
  const hi = steps[stage + 1] ?? lo + 1;
  return Math.min(100, Math.round(((pet.value.exp - lo) / (hi - lo)) * 100));
});

function attrColor(key: string, v: number): string {
  if (v < 30) return '#f43f5e';
  if (v < 55) return '#f59e0b';
  if (v < 80) return '#facc15';
  return '#4ade80';
}

const iconMap: Record<string, LucideIcon> = {
  apple: Apple, cake: Cake, milk: Milk, fish: Fish, sparkles: Sparkles, 'shower-head': ShowerHead,
  volleyball: Volleyball, 'circle-dot': CircleDot, cross: Cross, 'flask-conical': FlaskConical,
  'book-open': BookOpen, star: Star, smile: Smile, moon: Moon, 'moon-star': MoonStar, flame: Flame,
  'battery-low': BatteryLow, 'cloud-rain': CloudRain, utensils: Utensils, shirt: Shirt, zap: Zap,
  'smile-plus': SmilePlus, thermometer: Thermometer,
};
const iconOf = (name: string): LucideIcon => iconMap[name] ?? Sparkles;

const fmtTime = (s: string): string => new Date(s).toLocaleString('zh-CN', { hour12: false });

async function load(): Promise<void> {
  try {
    detail.value = await api<Detail>(`/students/${studentId}`);
    if (!detail.value.pet && speciesList.value.length === 0) await loadSpecies();
  } catch (e) {
    loadError.value = (e as Error).message;
  }
}
async function loadRankBase(): Promise<void> {
  try {
    const r = await api<{ students: { id: string; points: number }[] }>('/students');
    students.value = r.students;
  } catch {
    students.value = [];
  }
}

async function buy(item: { id: string }): Promise<void> {
  try {
    const r = await api<{ ok: boolean; cost: number }>(`/students/${studentId}/pet/buy-item`, {
      method: 'POST',
      body: JSON.stringify({ itemId: item.id }),
    });
    toast(`购买成功，消耗 ${r.cost} ${pointsUnit.value}`, 'success');
    await load();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function buyAndUse(item: { id: string; name: string }): Promise<void> {
  try {
    const r = await api<{ ok: boolean; cost: number }>('`/students/${studentId}/pet/buy-item`', {
      method: 'POST',
      body: JSON.stringify({ itemId: item.id }),
    });
    await api('`/students/${studentId}/pet/use-item`', {
      method: 'POST',
      body: JSON.stringify({ itemId: item.id }),
    });
    toast('已购买并使用「' + item.name + '」（消耗 ' + r.cost + ' ' + pointsUnit.value + '）', 'success');
    await load();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function useItem(itemId: string): Promise<void> {
  try {
    await api(`/students/${studentId}/pet/use-item`, { method: 'POST', body: JSON.stringify({ itemId }) });
    toast(pick('student', { formal: '道具使用成功', playful: '道具用起来咯！效果杠杠的(๑•̀ㅂ•́)و' }), 'success');
    await load();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function doRename(): Promise<void> {
  if (!newName.value.trim()) return;
  try {
    await api(`/students/${studentId}/pet/rename`, { method: 'POST', body: JSON.stringify({ name: newName.value }) });
    toast(pick('student', { formal: '改名成功', playful: '改名成功！新的名字好好听(´▽`)' }), 'success');
    renameOpen.value = false;
    newName.value = '';
    await load();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

async function onAvatarChange(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const blob = await cropToCircleBlob(file);
    const f = new File([blob], 'avatar.png', { type: 'image/png' });
    const r = await upload<{ url: string }>(`/students/${studentId}/pet/avatar`, f);
    toast('头像已更新', 'success');
    await load();
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

async function loadSpecies(): Promise<void> {
  try {
    const r = await api<{ species: { id: string; name: string; emoji: string; avatar_path: string | null; color_from: string; color_to: string }[] }>('/species');
    speciesList.value = r.species;
  } catch {
    speciesList.value = [];
  }
}

async function doAdopt(): Promise<void> {
  if (!adoptSpeciesId.value) return;
  try {
    await api('/students/' + studentId + '/pet/adopt', {
      method: 'POST',
      body: JSON.stringify({ speciesId: adoptSpeciesId.value, name: adoptName.value.trim() }),
    });
    toast(pick('student', { formal: '领养成功，欢迎新伙伴！', playful: '欢迎新伙伴加入！(๑>◡<๑) 以后也要好好照顾它哦～' }), 'success');
    adoptSpeciesId.value = '';
    adoptName.value = '';
    await load();
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
async function checkUpdate(): Promise<void> {
  try {
    const r = await api<{ hasUpdate: boolean; latestVersion: string; downloadUrl?: string }>('/updates/check');
    updateInfo.value = { hasUpdate: !!r.hasUpdate, latestVersion: r.latestVersion, url: r.downloadUrl || 'https://gitee.com/am-zzq/classroom-pet-system/releases' };
  } catch {
    updateInfo.value = { hasUpdate: false, latestVersion: '', url: '' };
  }
}

onMounted(() => {
  load();
  loadRankBase();
  checkUpdate();
});
</script>
