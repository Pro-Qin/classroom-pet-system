<template>
  <!-- 全局漂浮光斑与标题水印 -->
  <div class="bg-orb w-72 h-72 left-[-6rem] top-[-4rem] bg-indigo-600/30" />
  <div class="bg-orb w-80 h-80 right-[-8rem] top-[30%] bg-fuchsia-600/25" style="animation-delay:-6s" />
  <div class="bg-orb w-64 h-64 left-[20%] bottom-[-6rem] bg-cyan-500/20" style="animation-delay:-11s" />
  <div class="watermark">Made by Qin_zzq · v.0.1.0 Beta</div>

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
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Loader2 } from 'lucide-vue-next';
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

async function boot(): Promise<void> {
  try {
    const b = await api<Bootstrap>('/meta/bootstrap');
    const path = router.currentRoute.value.path;
    const prepDone = sessionStorage.getItem('prep_done');

    if (!b.firstRunDone) {
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
});
</script>