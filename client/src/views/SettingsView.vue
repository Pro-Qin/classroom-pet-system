<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="glass w-full max-w-lg p-8 animate-fadeUp">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center shadow-glow">
          <SlidersHorizontal class="w-6 h-6 text-white" />
        </div>
        <div class="flex-1">
          <h1 class="text-xl font-bold text-indigo-50">本机设置</h1>
          <p class="text-sm text-indigo-200/70">仅保存在本设备（持久化），不会同步到服务器。</p>
        </div>
      </div>

      <div class="space-y-5">
        <div>
          <label class="label">大屏自动轮播间隔（秒，0 = 关闭自动轮播）</label>
          <input v-model.number="kioskInterval" type="number" class="input !w-32" min="0" max="120" placeholder="10" />
          <p class="text-xs text-indigo-200/50 mt-1">大屏（/screen）在排行榜 / 宠物墙之间自动切换的间隔。</p>
        </div>

        <div>
          <label class="label">浏览器失联后自动停止后端（秒）</label>
          <input v-model.number="heartbeatTimeoutSec" type="number" class="input !w-32" min="30" max="3600" placeholder="120" />
          <p class="text-xs text-indigo-200/50 mt-1">浏览器关闭 / 长时间无心跳超过此秒数，后端自动停止（默认 120 = 2 分钟）。</p>
        </div>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" v-model="autoStart" class="accent-indigo-400 mt-0.5" />
          <span class="text-sm text-indigo-100">开机自动启动本程序（默认不选；此选项仅对本机生效）</span>
        </label>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" v-model="logToFile" class="accent-indigo-400 mt-0.5" />
          <span class="text-sm text-indigo-100">把运行日志写入本地文件（server/data/logs/，便于排错）</span>
        </label>

        <button class="btn btn-primary w-full" @click="save">保存本机设置</button>
        <p v-if="msg" class="text-xs text-center" :class="msgErr ? 'text-rose-300' : 'text-emerald-300'">{{ msg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { SlidersHorizontal } from 'lucide-vue-next';
import { saveLocalSettings, getLocalSettings } from '../composables/useLocalSettings';

const kioskInterval = ref(10);
const heartbeatTimeoutSec = ref(120);
const autoStart = ref(false);
const logToFile = ref(false);
const msg = ref('');
const msgErr = ref(false);

const s = getLocalSettings();
kioskInterval.value = s.kioskInterval;
heartbeatTimeoutSec.value = s.heartbeatTimeoutSec;
autoStart.value = s.autoStart;
logToFile.value = s.logToFile;

function save(): void {
  saveLocalSettings({
    kioskInterval: Math.max(0, Math.round(Number(kioskInterval.value) || 0)),
    heartbeatTimeoutSec: Math.max(30, Math.min(3600, Math.round(Number(heartbeatTimeoutSec.value) || 120))),
    autoStart: autoStart.value,
    logToFile: logToFile.value,
  });
  msg.value = '本机设置已保存';
  msgErr.value = false;
}
</script>
