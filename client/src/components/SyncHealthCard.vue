<template>
  <div class="glass p-5">
    <div class="flex items-center justify-between mb-3">
      <h3 class="font-bold text-indigo-50 flex items-center gap-2"><HeartPulse class="w-5 h-5" :class="modeText === '已连接云端' && !h.lastError ? 'text-emerald-300' : 'text-amber-300'" /> 同步健康</h3>
      <button class="btn btn-ghost !py-1.5 text-xs shrink-0" :disabled="busy" @click="runNow">
        <Loader2 v-if="busy" class="w-4 h-4 animate-spin" /> <RefreshCw v-else class="w-3.5 h-3.5" /> 立即同步
      </button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <div class="rounded-xl bg-white/5 p-3">
        <p class="text-lg font-bold" :class="modeText === '已连接云端' ? 'text-emerald-300' : 'text-indigo-200'">{{ modeText }}</p>
        <p class="text-xs text-indigo-200/60">同步模式</p>
      </div>
      <div class="rounded-xl bg-white/5 p-3">
        <p class="text-lg font-bold" :class="(h.totalDirty ?? 0) > 0 ? 'text-amber-300' : 'text-emerald-300'">{{ h.totalDirty ?? '-' }}</p>
        <p class="text-xs text-indigo-200/60">待推送变更</p>
      </div>
      <div class="rounded-xl bg-white/5 p-3">
        <p class="text-lg font-bold text-indigo-50">{{ h.lastSyncAt ? fmtTime(h.lastSyncAt) : '从未' }}</p>
        <p class="text-xs text-indigo-200/60">上次完整同步</p>
      </div>
      <div class="rounded-xl bg-white/5 p-3">
        <p class="text-lg font-bold text-indigo-50">{{ h.backupCount ?? '-' }} 份<span v-if="lastBackupText" class="text-xs font-normal text-indigo-200/60">（{{ lastBackupText }}）</span></p>
        <p class="text-xs text-indigo-200/60">本地快照</p>
      </div>
    </div>

    <!-- 冲突倒计时横幅 -->
    <div v-if="h.conflictPending && remainSec > 0" class="mt-3 rounded-xl bg-amber-500/15 border border-amber-400/40 px-3 py-2 flex items-center gap-2 text-sm text-amber-200">
      <Timer class="w-4 h-4 animate-pulse shrink-0" />
      有 {{ h.conflictPending.count }} 条冲突待裁决，请在 <strong class="font-mono text-base mx-0.5">{{ countdownText }}</strong> 内到准备界面完成选择，逾期需重新同步。
    </div>

    <!-- 最近一次错误 -->
    <p v-if="h.lastError" class="mt-3 rounded-xl bg-rose-500/10 border border-rose-400/30 px-3 py-2 text-xs text-rose-200 break-all">
      ⚠ 最近同步异常：{{ h.lastError }}
    </p>

    <p class="mt-3 text-xs text-indigo-200/50">
      自动拉取：{{ h.autoPullMinutes === 0 ? '已关闭' : `每 ${h.autoPullMinutes} 分钟` }}
      <template v-if="h.autoPullLastAt"> · 上次 {{ fmtTime(new Date(h.autoPullLastAt).toISOString()) }}</template>
    </p>
    <p v-if="msg" class="mt-1 text-xs" :class="msgType === 'err' ? 'text-rose-300' : 'text-emerald-300'">{{ msg }}</p>
  </div>
</template>

<script setup lang="ts">
/** 同步健康小面板：轮询 /sync/health 汇总展示；冲突倒计时按服务端 deadline 秒级刷新。 */
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { HeartPulse, Loader2, RefreshCw, Timer } from 'lucide-vue-next';
import { api } from '../api';

interface HealthData {
  mode: string;
  configured: boolean;
  lastSyncAt: string;
  totalDirty: number;
  dirtyTables?: { table: string; count: number }[];
  lastError: string;
  autoPullMinutes: number;
  autoPullLastAt: number;
  backupCount: number;
  lastBackupAgeMin: number | null;
  conflictPending: { count: number; deadlineAt: number } | null;
}

const h = reactive<Partial<HealthData>>({});
const busy = ref(false);
const msg = ref('');
const msgType = ref<'ok' | 'err'>('ok');
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

const modeText = computed(() => (h.mode === 'supabase' && h.configured ? '已连接云端' : h.mode === 'supabase' ? '配置不全' : '本地模式'));
const lastBackupText = computed(() =>
  typeof h.lastBackupAgeMin === 'number'
    ? h.lastBackupAgeMin < 60
      ? `${h.lastBackupAgeMin} 分钟前`
      : `${Math.round(h.lastBackupAgeMin / 60)} 小时前`
    : ''
);
const remainMs = computed(() => (h.conflictPending?.deadlineAt ?? 0) - now.value);
const remainSec = computed(() => Math.max(0, Math.ceil(remainMs.value / 1000)));
const countdownText = computed(() => {
  const s = remainSec.value;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});

async function load(): Promise<void> {
  try {
    const r = await api<HealthData>('/sync/health');
    Object.assign(h, r);
  } catch {
    /* 静默轮询 */
  }
}
function fmtTime(s: string): string {
  return new Date(s).toLocaleString('zh-CN', { hour12: false });
}
async function runNow(): Promise<void> {
  busy.value = true;
  msg.value = '';
  try {
    const r = await api<{ conflicts: unknown[]; pulled: number; pushed: number; completed: boolean }>('/sync/run', { method: 'POST' });
    if (!r.completed && r.conflicts.length > 0) {
      msg.value = `发现 ${r.conflicts.length} 条冲突，请在下方倒计时结束前裁决`;
      msgType.value = 'err';
    } else {
      msg.value = `同步完成（拉取 ${r.pulled} / 推送 ${r.pushed}）`;
      msgType.value = 'ok';
    }
    await load();
  } catch (e) {
    msg.value = (e as Error).message;
    msgType.value = 'err';
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void load();
  timer = setInterval(() => {
    void load();
    now.value = Date.now();
  }, 20_000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
