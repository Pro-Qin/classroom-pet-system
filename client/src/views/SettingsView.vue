<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="glass w-full max-w-lg p-8 animate-fadeUp">
      <div class="flex items-center gap-3 mb-6">
        <button class="btn btn-ghost !p-2 shrink-0" title="返回登录" @click="goBack"><ChevronLeft class="w-5 h-5" /></button>
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
          <input v-model.number="heartbeatTimeoutSec" type="number" class="input !w-32" min="30" max="240" placeholder="120" />
          <p class="text-xs text-indigo-200/50 mt-1">允许范围 30-240；推荐 30-120。浏览器关闭 / 长时间无心跳超过此秒数，后端自动停止。</p>
        </div>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" v-model="autoStart" class="accent-indigo-400 mt-0.5" />
          <span class="text-sm text-indigo-100">开机自动启动本程序（仅对本机生效）</span>
        </label>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" v-model="logToFile" class="accent-indigo-400 mt-0.5" />
          <span class="text-sm text-indigo-100">把运行日志写入本地文件，便于排错</span>
        </label>
        <div v-if="logToFile">
          <label class="label">日志最大存储（MB，默认 1024 / 1GB，超出自动删除旧日志）</label>
          <input v-model.number="logCapMB" type="number" class="input !w-32" min="1" max="10240" placeholder="1024" />
        </div>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" v-model="anomalyEffect" class="accent-indigo-400 mt-0.5" />
          <span class="text-sm text-indigo-100">启用宠物头像异常/差色特效（默认关闭，开启后本机也会显示）</span>
        </label>

        <label class="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" v-model="highQuality" class="accent-indigo-400 mt-0.5" />
          <span class="text-sm text-indigo-100">高质量模式（光斑/毛玻璃；默认关闭，开启后更华丽但更吃 GPU）</span>
        </label>

        <button class="btn btn-primary w-full" @click="save">保存本机设置</button>
        <button class="btn btn-ghost w-full" @click="applyOnce">仅本次生效</button>
        <p v-if="msg" class="text-xs text-center" :class="msgErr ? 'text-rose-300' : 'text-emerald-300'">{{ msg }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { SlidersHorizontal, ChevronLeft } from 'lucide-vue-next';
import { saveLocalSettings, getLocalSettings } from '../composables/useLocalSettings';
import { useAnomaly } from '../composables/anomaly';
import { useHighQuality } from '../composables/quality';

const router = useRouter();
const kioskInterval = ref(10);
const heartbeatTimeoutSec = ref(120);
const autoStart = ref(false);
const logToFile = ref(true);
const logCapMB = ref(1024);
const anomalyEffect = ref(false);
const highQuality = ref(false);
const msg = ref('');
const msgErr = ref(false);

const s = getLocalSettings();
kioskInterval.value = s.kioskInterval;
heartbeatTimeoutSec.value = s.heartbeatTimeoutSec;
autoStart.value = s.autoStart;
logToFile.value = s.logToFile;
logCapMB.value = s.logCapMB;
anomalyEffect.value = s.anomalyEffect;
highQuality.value = s.highQuality;

function goBack(): void {
  router.back();
}

/** 把心跳超时写到服务端（本次运行生效）；0 = 不自动停。 */
async function applyHeartbeat(sec: number): Promise<void> {
  try {
    await fetch('/api/heartbeat/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeoutSec: sec }),
    });
  } catch { /* 服务端不可达时忽略 */ }
}

function save(): void {
  const hb = Math.max(30, Math.min(240, Math.round(Number(heartbeatTimeoutSec.value) || 120)));
  saveLocalSettings({
    kioskInterval: Math.max(0, Math.round(Number(kioskInterval.value) || 0)),
    heartbeatTimeoutSec: hb,
    autoStart: autoStart.value,
    logToFile: logToFile.value,
    logCapMB: Math.max(1, Math.min(10240, Math.round(Number(logCapMB.value) || 1024))),
    anomalyEffect: anomalyEffect.value,
    highQuality: highQuality.value,
  });
  void applyHeartbeat(hb);
  void useAnomaly().refresh();
  void useHighQuality().refresh();
  msg.value = '本机设置已保存并已对本次运行生效';
  msgErr.value = false;
}

/** 仅本次生效：把当前输入的失联超时应用到本次运行，不保存为持久默认。 */
function applyOnce(): void {
  const hb = Math.max(30, Math.min(240, Math.round(Number(heartbeatTimeoutSec.value) || 120)));
  heartbeatTimeoutSec.value = hb;
  void applyHeartbeat(hb);
  msg.value = '已对本次运行生效（未写入默认值，下次仍按已保存值）';
  msgErr.value = false;
}
</script>
