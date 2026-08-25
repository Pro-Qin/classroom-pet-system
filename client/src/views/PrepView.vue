<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="glass w-full max-w-lg p-8 animate-fadeUp">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center shadow-glow">
          <Loader2 class="w-6 h-6 text-white animate-spin" />
        </div>
        <div class="flex-1">
          <h1 class="text-xl font-bold text-indigo-50">准备界面</h1>
          <p class="text-sm text-indigo-200/70">检查更新并同步数据库</p>
        </div>
        <span
          v-if="mode"
          class="pill !py-1.5"
          :class="mode === 'mock' ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/30' : 'bg-sky-500/15 text-sky-200 border border-sky-400/30'"
        >
          <WifiOff v-if="mode === 'mock'" class="w-3.5 h-3.5" />
          <Cloud v-else class="w-3.5 h-3.5" />
          {{ mode === 'mock' ? '离线模式 · 数据仅存本机' : '云端同步已启用' }}
        </span>
      </div>

      <!-- 步骤列表 -->
      <div class="space-y-3">
        <div
          v-for="item in checklist"
          :key="item.key"
          class="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
        >
          <CheckCircle2 v-if="item.state === 'done'" class="w-5 h-5 text-emerald-300 shrink-0" />
          <Loader2 v-else-if="item.state === 'running'" class="w-5 h-5 text-indigo-300 animate-spin shrink-0" />
          <AlertTriangle v-else-if="item.state === 'error'" class="w-5 h-5 text-amber-300 shrink-0" />
          <Circle class="w-5 h-5 text-white/20 shrink-0" />
          <div class="flex-1">
            <p class="text-sm font-medium text-indigo-100">{{ item.label }}</p>
            <p v-if="item.detail" class="text-xs text-indigo-200/60 mt-0.5">{{ item.detail }}</p>
          </div>
        </div>
      </div>

      <!-- 冲突弹窗 -->
      <div v-if="conflicts.length" class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
        <div class="glass w-full max-w-xl p-6 max-h-[80vh] overflow-y-auto">
          <div class="flex items-center gap-3 mb-4">
            <AlertTriangle class="w-7 h-7 text-amber-300" />
            <h2 class="text-lg font-bold text-indigo-50">检测到数据冲突</h2>
          </div>
          <p class="text-sm text-indigo-200/80 mb-4">
            以下数据在<strong>本机</strong>与<strong>云端</strong>都被修改过。请选择保留哪一份（未选中的一方会被覆盖）。
          </p>
          <div class="space-y-3">
            <div
              v-for="c in conflicts"
              :key="c.table + ':' + c.id"
              class="rounded-xl bg-white/5 border border-white/10 p-4"
            >
              <p class="text-sm font-semibold text-indigo-100 mb-2">
                {{ tableLabel(c.table) }} · {{ rowLabel(c) }}
              </p>
              <div class="grid grid-cols-2 gap-3 text-xs">
                <label
                  class="rounded-lg border p-3 cursor-pointer transition-colors"
                  :class="choice(c) === 'local' ? 'border-indigo-400 bg-indigo-500/20' : 'border-white/10 bg-white/5'"
                >
                  <input v-model="choices[c.table + ':' + c.id]" type="radio" value="local" class="hidden" />
                  <p class="font-semibold text-indigo-100 mb-1">保留本机数据</p>
                  <p class="text-indigo-200/60">本机最后更新：{{ fmtTime(c.localUpdatedAt) }}</p>
                </label>
                <label
                  class="rounded-lg border p-3 cursor-pointer transition-colors"
                  :class="choice(c) === 'cloud' ? 'border-fuchsia-400 bg-fuchsia-500/20' : 'border-white/10 bg-white/5'"
                >
                  <input v-model="choices[c.table + ':' + c.id]" type="radio" value="cloud" class="hidden" />
                  <p class="font-semibold text-indigo-100 mb-1">保留云端数据</p>
                  <p class="text-indigo-200/60">云端最后更新：{{ fmtTime(c.cloudUpdatedAt) }}</p>
                </label>
              </div>
            </div>
          </div>
          <button class="btn btn-primary w-full mt-5" :disabled="resolving" @click="resolveConflicts">
            <Loader2 v-if="resolving" class="w-4 h-4 animate-spin" /> 按选择合并数据
          </button>
        </div>
      </div>

      <!-- 更新可用提示 + 安装按钮 -->
      <div v-if="updateInfo && hasUpdate" class="mt-4 rounded-xl bg-indigo-500/10 border border-indigo-400/30 px-4 py-3">
        <div class="flex items-center gap-2 text-sm text-indigo-100">
          <ArrowDownToLine class="w-4 h-4 text-indigo-300 shrink-0" />
          <span>{{ updateInfo }}</span>
        </div>
        <p class="text-xs text-indigo-200/60 mt-1">
          将下载并运行安装器（不删除已安装的依赖与数据，增量更新）。
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="btn btn-primary px-4 py-2 text-sm" :disabled="updating" @click="installUpdate">
            <Loader2 v-if="updating" class="w-4 h-4 animate-spin" />
            <Download v-else class="w-4 h-4" />
            {{ updating ? '正在下载并启动安装器…' : '立即更新' }}
          </button>
          <span v-if="updateError" class="text-xs text-amber-300 self-center">{{ updateError }}</span>
        </div>
      </div>

      <!-- 底部 -->
      <div class="mt-8 text-center">
        <button class="btn btn-primary px-8" :disabled="!ready" @click="goLogin">
          进入登录 <LogIn class="w-4 h-4" />
        </button>
        <p v-if="error" class="mt-3 text-sm text-amber-300">{{ error }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Loader2, CheckCircle2, AlertTriangle, Circle, LogIn, WifiOff, Cloud, Download, ArrowDownToLine } from 'lucide-vue-next';
import { api } from '../api';

interface Conflict {
  table: string;
  id: string;
  local: Record<string, unknown> | null;
  cloud: Record<string, unknown>;
  localUpdatedAt: string;
  cloudUpdatedAt: string;
}
interface SyncResult {
  pulled: number;
  pushed: number;
  conflicts: Conflict[];
  completed: boolean;
  backupFile: string | null;
}
interface CheckItem {
  key: string;
  label: string;
  state: 'pending' | 'running' | 'done' | 'error';
  detail: string;
}

const router = useRouter();
const conflicts = ref<Conflict[]>([]);
const choices = reactive<Record<string, 'local' | 'cloud'>>({});
const resolving = ref(false);
const error = ref('');
const ready = ref(false);
const updateInfo = ref('');
const hasUpdate = ref(false);
const updating = ref(false);
const updateError = ref('');
const mode = ref('');

/** 显示当前同步模式（离线/云端），接口为公开的准备阶段接口 */
async function loadMode(): Promise<void> {
  try {
    const r = await api<{ mode: string }>('/sync/status');
    mode.value = r.mode;
  } catch {
    mode.value = '';
  }
}

const checklist = ref<CheckItem[]>([
  { key: 'update', label: '检查程序更新', state: 'pending', detail: '' },
  { key: 'sync', label: '同步数据库（本机 ↔ 云端）', state: 'pending', detail: '' },
  { key: 'done', label: '准备完成', state: 'pending', detail: '' },
]);

function setState(key: string, state: CheckItem['state'], detail = ''): void {
  const item = checklist.value.find((i) => i.key === key);
  if (item) {
    item.state = state;
    item.detail = detail;
  }
}

/** 下载并启动安装器（调用后端），增量更新、不删已有依赖与数据。 */
async function installUpdate(): Promise<void> {
  updating.value = true;
  updateError.value = '';
  try {
    const r = await api<{ ok: boolean; version: string }>('/updates/install', { method: 'POST' });
    if (r.ok) {
      updateInfo.value = `新版本 ${r.version} 已在下载，安装向导即将启动…`;
      setState('update', 'done', `新版本 ${r.version} 安装器已启动`);
    }
  } catch (e) {
    updateError.value = (e as Error).message;
    setState('update', 'error', updateError.value);
  } finally {
    updating.value = false;
  }
}

const tableLabel = (t: string): string =>
  ({ students: '学生', pets: '宠物', point_events: '积分流水', quick_presets: '快捷理由', species: '宠物种类', items: '道具', state_rules: '状态规则' }[t] ?? t);
const rowLabel = (c: Conflict): string =>
  String((c.cloud as Record<string, unknown>)?.name ?? (c.cloud as Record<string, unknown>)?.label ?? c.id);
const choice = (c: Conflict): string => choices[`${c.table}:${c.id}`] ?? 'local';
const fmtTime = (s: string): string => (s ? new Date(s).toLocaleString('zh-CN', { hour12: false }) : '未知');

async function runPrep(): Promise<void> {
  // 1. 更新检查（Gitee 源；支持"本机/整库"跳过策略）
  setState('update', 'running', '检查更新策略…');
  let skipUpdate = false;
  try {
    const pol = await api<{ deviceDisabled: boolean; dbDisabled: boolean }>('/updates/policy');
    skipUpdate = pol.deviceDisabled || pol.dbDisabled;
  } catch {
    skipUpdate = false;
  }
  if (skipUpdate) {
    setState('update', 'done', '已按设置跳过更新检查');
  } else {
    try {
      const up = await api<{ currentVersion: string; latestVersion: string; hasUpdate: boolean; note: string }>('/updates/check');
      updateInfo.value = up.hasUpdate ? `发现新版本 ${up.latestVersion}` : `当前版本 ${up.currentVersion}`;
      hasUpdate.value = up.hasUpdate;
      setState('update', 'done', updateInfo.value + (up.note ? `（${up.note}）` : ''));
    } catch (e) {
      setState('update', 'error', (e as Error).message);
    }
  }

  // 2. 同步（对节流 429 自动重试；冲突仍须裁决，非冲突错误不锁死入口，本地数据仍在）
  setState('sync', 'running', '快照备份 → 拉取 → 推送…');
  let syncRes: SyncResult | null = null;
  let lastSyncError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      syncRes = await api<SyncResult>('/sync/run', { method: 'POST' });
      break;
    } catch (e) {
      lastSyncError = (e as Error).message;
      if (/频繁|稍后/.test(lastSyncError)) {
        setState('sync', 'running', `同步被节流，稍后自动重试（${attempt + 1}/3）…`);
        await new Promise((r) => setTimeout(r, 5500));
        continue;
      }
      break;
    }
  }
  if (syncRes) {
    if (syncRes.conflicts.length > 0) {
      conflicts.value = syncRes.conflicts;
      for (const c of syncRes.conflicts) {
        if (choices[`${c.table}:${c.id}`] === undefined) choices[`${c.table}:${c.id}`] = 'local';
      }
      setState('sync', 'error', `发现 ${syncRes.conflicts.length} 处冲突，等待裁决`);
      return; // 等待用户裁决
    }
    setState('sync', 'done', `拉取 ${syncRes.pulled} 条，推送 ${syncRes.pushed} 条，已备份本地快照`);
    finish();
  } else {
    setState('sync', 'error', `同步未完成：${lastSyncError}`);
    error.value = `同步未完成（${lastSyncError}），可先进入系统，稍后在管理端重试`;
    finish();
  }
}

async function resolveConflicts(): Promise<void> {
  resolving.value = true;
  try {
    await api('/sync/resolve', { method: 'POST', body: JSON.stringify({ choices }) });
    conflicts.value = [];
    setState('sync', 'done', '冲突已按选择合并');
    finish();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    resolving.value = false;
  }
}

function finish(): void {
  setState('done', 'done', '一切就绪');
  ready.value = true;
}

function goLogin(): void {
  sessionStorage.setItem('prep_done', '1');
  router.replace('/login');
}

onMounted(() => {
  loadMode();
  runPrep();
});
</script>