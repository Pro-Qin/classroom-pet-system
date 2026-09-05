<template>
  <!-- 全屏遮罩：服务端已停止/断连提醒 -->
  <div v-if="serverDown" class="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm grid place-items-center p-6">
    <div class="glass w-full max-w-md p-8 text-center animate-fadeUp">
      <div class="mx-auto w-16 h-16 rounded-full bg-rose-500/20 grid place-items-center mb-4">
        <ServerOff class="w-8 h-8 text-rose-300" />
      </div>
      <h2 class="text-xl font-bold text-indigo-50">与后台服务断开连接</h2>
      <p class="mt-2 text-sm text-indigo-200/70 leading-relaxed">
        服务可能已停止（例如浏览器关闭后自动结束）<br />
        请重新双击启动器来恢复服务
      </p>
    </div>
  </div>

  <!-- 全局漂浮光斑与标题水印 -->
  <div class="bg-orb w-72 h-72 left-[-6rem] top-[-4rem] bg-indigo-600/30" />
  <div class="bg-orb w-80 h-80 right-[-8rem] top-[30%] bg-fuchsia-600/25" style="animation-delay:-6s" />
  <div class="bg-orb w-64 h-64 left-[20%] bottom-[-6rem] bg-cyan-500/20" style="animation-delay:-11s" />
  <div class="watermark">Made by Qin_zzq · v.0.4.23</div>

  <!-- 连接状态常驻提醒 -->
  <div
    v-if="syncPill.visible"
    class="fixed bottom-4 left-4 z-[80] pill !px-3 !py-1.5 pointer-events-none transition-opacity duration-500"
    :class="syncPill.cls"
    :title="syncPill.title"
  >
    <Cloud v-if="syncPill.mode === 'supabase'" class="w-3.5 h-3.5" />
    <WifiOff v-else class="w-3.5 h-3.5" />
    {{ syncPill.text }}
  </div>

  <div v-if="bootState === 'loading'" class="min-h-screen grid place-items-center">
    <div class="text-center">
      <Loader2 class="w-10 h-10 text-indigo-300 animate-spin mx-auto" />
      <p class="mt-3 text-sm text-indigo-200/70">正在启动…</p>
    </div>
  </div>
  <template v-else>
    <router-view />
    <ToastHost />
  </template>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Loader2, Cloud, WifiOff, ServerOff } from 'lucide-vue-next';
import { api } from './api';
import { toast } from './composables/toast';
import ToastHost from './components/ToastHost.vue';

interface Bootstrap {
  firstRunDone: boolean;
  syncMode: string;
  giteeEnabled: boolean;
  appVersion: string;
}

const router = useRouter();
const bootState = ref<'loading' | 'ready'>('loading');

// 连接状态常驻提醒
const syncPill = reactive({ visible: false, mode: '', text: '', cls: '', title: '' });
let syncTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let hbFail = 0;
const serverDown = ref(false);

async function refreshSyncPill(): Promise<void> {
  try {
    const s = await api<{ mode: string; lastSyncAt: string }>('/sync/status');
    if (s.mode !== 'supabase') {
      syncPill.mode = 'local';
      syncPill.visible = true;
      syncPill.cls = 'bg-indigo-500/20 border border-indigo-400/40 text-indigo-100';
      syncPill.text = '本地数据 · 未同步云端';
      syncPill.title = '未配置云端同步：你正在查看的数据仅保存在本机，请放心使用';
      return;
    }
    syncPill.mode = 'supabase';
    syncPill.visible = true;
    if (!s.lastSyncAt) {
      syncPill.cls = 'bg-amber-500/20 border border-amber-400/40 text-amber-200';
      syncPill.text = '云端未同步';
      syncPill.title = '尚未与云端完成过同步，请在准备界面处理';
      return;
    }
    const mins = Math.round((Date.now() - new Date(s.lastSyncAt).getTime()) / 60000);
    if (mins > 15) {
      syncPill.cls = 'bg-amber-500/20 border border-amber-400/40 text-amber-200';
      syncPill.text = '云端 ' + mins + ' 分钟前同步';
      syncPill.title = '距上次同步较久，建议刷新页面拉取';
    } else {
      syncPill.cls = 'bg-emerald-500/15 border border-emerald-400/30 text-emerald-200';
      syncPill.text = mins <= 1 ? '云端已同步' : '云端 ' + mins + ' 分钟前同步';
      syncPill.title = '最近同步于 ' + s.lastSyncAt;
    }
  } catch {
    syncPill.visible = true;
    syncPill.mode = '';
    syncPill.cls = 'bg-rose-500/15 border border-rose-400/30 text-rose-200';
    syncPill.text = '服务未连接';
    syncPill.title = '无法连接服务器';
  }
}

async function boot(): Promise<void> {
  try {
    const b = await api<Bootstrap>('/meta/bootstrap');
    const path = router.currentRoute.value.path;
    const prepDone = sessionStorage.getItem('prep_done');

    // 帮助页（/help/*）永远放行：欢迎向导里点“Supabase 配置教程”会在新标签打开，
    // 不能因为 firstRunDone=false 被弹回欢迎页。
    if (path.startsWith('/help/')) {
      // 帮助页不受门禁限制（欢迎向导可直接跳转查看）
    } else if (!b.firstRunDone) {
      if (path !== '/welcome') router.replace('/welcome');
    } else if (path === '/welcome') {
      router.replace('/login');
    } else if (path === '/' || path === '/login') {
      if (!prepDone) router.replace('/prep');
    }
  } catch {
    // 服务端不可达：停留在当前路由（登录页会展示错误）
  } finally {
    bootState.value = 'ready';
  }
}

/** 每次刷新页面：若启用了云端同步则静默拉取一次（有冲突时提示） */
async function refreshSync(): Promise<void> {
  try {
    const b = await api<{ syncMode: string }>('/meta/bootstrap');
    if (b.syncMode !== 'supabase') return;
    // 客户端节流：页面每次加载不再都打 /sync/run（服务端 6s/8s 节流会 429）。
    // 后台调度器已有 10 分钟自动拉取，这里只作为"刚打开页面"的一次性补拉。
    const LAST_KEY = 'pet_last_auto_sync_run';
    const last = Number(localStorage.getItem(LAST_KEY) ?? '0');
    if (Date.now() - last < 120_000) return;
    localStorage.setItem(LAST_KEY, String(Date.now()));
    const r = await api<{ conflicts: unknown[] }>('/sync/run', { method: 'POST' });
    if (r.conflicts.length > 0) {
      toast('检测到 ' + r.conflicts.length + ' 处数据冲突，请在准备界面处理', 'error');
    }
  } catch {
    /* 网络/限流：静默忽略，不影响使用 */
  }
}

onMounted(() => {
  boot();
  refreshSync();
  refreshSyncPill();
  syncTimer = setInterval(refreshSyncPill, 60_000);
  // 心跳：配合 start.exe 的"浏览器关闭→后端自动结束"。
  // 每 1s 上报；连续 2 次失败即判定服务端停止，弹出全屏遮罩；心跳恢复后自动清除遮罩。
  heartbeatTimer = setInterval(() => {
    fetch('/api/heartbeat', { method: 'POST' })
      .then((r) => {
        if (r.ok) { hbFail = 0; serverDown.value = false; }
        else { hbFail++; }
      })
      .catch(() => { hbFail++; })
      .finally(() => {
        // 连续 4 次失败（约 4s）才判死：抵御快照/大写入造成的瞬时事件循环卡顿
        if (hbFail >= 4) serverDown.value = true;
      });
  }, 1000);
});
onUnmounted(() => {
  if (syncTimer) clearInterval(syncTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
});
</script>