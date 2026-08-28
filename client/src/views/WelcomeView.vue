<template>
  <div class="min-h-screen flex items-center justify-center p-6">
    <div class="glass w-full max-w-xl p-8 animate-fadeUp">
      <!-- 步骤指示 -->
      <div class="flex items-center gap-2 mb-8">
        <div
          v-for="(s, i) in steps"
          :key="s.key"
          class="flex-1 h-1.5 rounded-full transition-all duration-300"
          :class="i <= step ? 'bg-indigo-400' : 'bg-white/10'"
        />
      </div>

      <!-- Step 0: 欢迎 -->
      <div v-if="step === 0" class="text-center py-4">
        <div class="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center shadow-glow mb-6">
          <PawPrint class="w-10 h-10 text-white" />
        </div>
        <h1 class="text-3xl font-bold text-indigo-50">
          {{ pick('welcome', { formal: '欢迎来到校园宠物乐园', playful: '嗨！欢迎来到校园宠物乐园ヾ(๑╹◡╹)ﾉ' }) }}
        </h1>
        <p class="mt-3 text-indigo-200/80 leading-relaxed">
          <template v-if="vibe('welcome') === 'playful'">
            一套把 <span class="text-amber-300 font-medium">积分管理</span> 和
            <span class="text-fuchsia-300 font-medium">宠物养成</span> 装进一个教室的超级好物！(๑•̀ㅂ•́)و
            <br />第一次启动嘛，先把这个云同步和管理员密码配好，很快就好啦～
          </template>
          <template v-else>
            一套集 <span class="text-amber-300 font-medium">积分管理</span> 与
            <span class="text-fuchsia-300 font-medium">宠物养成</span> 于一体的班级激励系统。
            <br />首次运行，需要完成云端同步与管理员密码的配置。
          </template>
        </p>
        <button class="btn btn-primary mt-8 px-8 py-3 text-base" @click="next">
          {{ pick('welcome', { formal: '开始配置', playful: '开冲吧！' }) }}
          <ArrowRight class="w-4 h-4" />
        </button>
      </div>

      <!-- Step 1: Supabase 云端配置 -->
      <div v-else-if="step === 1">
        <h2 class="text-xl font-bold text-indigo-50 flex items-center gap-2">
          <Cloud class="w-5 h-5 text-sky-300" /> 云端数据库配置（Supabase）
        </h2>
        <p class="mt-2 text-sm text-indigo-200/70">
          用于多台设备间的数据同步（一体机 ↔ 教师机）。留空则使用<strong>本地模式</strong>（数据仅保存在本机，仍可正常使用）。
          没有账号/不会配置？
          <button class="underline text-sky-300 hover:text-sky-200" @click="openSupabaseHelp">看配置教程 →</button>
        </p>
        <div class="mt-6 space-y-4">
          <div>
            <label class="label">Supabase 项目地址（Project URL）</label>
            <input v-model="form.supabaseUrl" class="input" placeholder="https://xxxx.supabase.co" />
          </div>
          <div>
            <label class="label">Anon Key（公开密钥，用于读取）</label>
            <input v-model="form.supabaseAnonKey" class="input" placeholder="eyJhbGciOi..." />
          </div>
          <div>
            <label class="label">Service Role Key（服务端密钥，用于写入，务必保密）</label>
            <input v-model="form.supabaseServiceKey" type="password" class="input" placeholder="eyJhbGciOi...（仅保存在本机配置中）" />
          </div>
        </div>
        <div class="mt-8 flex items-center justify-between gap-2">
          <button class="btn btn-ghost" @click="prev"><ChevronLeft class="w-4 h-4" />上一步</button>
          <button class="btn btn-ghost text-xs flex-1 max-w-xs" @click="openImport"><Download class="w-4 h-4" /> 导入配置</button>
          <button class="btn btn-primary" @click="next">下一步 <ChevronRight class="w-4 h-4" /></button>
        </div>
        <input ref="importFile" type="file" accept=".json,application/json" class="hidden" @change="onImportFile" />
      </div>

      <!-- Step 2: 管理员密码 -->
      <div v-else-if="step === 2">
        <h2 class="text-xl font-bold text-indigo-50 flex items-center gap-2">
          <ShieldCheck class="w-5 h-5 text-emerald-300" /> 设置管理员密码
        </h2>
        <p class="mt-2 text-sm text-indigo-200/70">
          管理系统专用。密码将经过 <strong>bcrypt 哈希</strong> 存储，不会明文保存。教师系统使用固定口令 <code class="px-1.5 py-0.5 rounded bg-white/10 text-amber-300">123456</code>。
        </p>
        <div class="mt-6 space-y-4">
          <div>
            <label class="label">管理员名称</label>
            <input v-model="form.adminName" class="input" placeholder="例如：电教委员 / 班主任" />
          </div>
          <div>
            <label class="label">管理员密码（至少 4 位）</label>
            <input v-model="form.adminPassword" type="password" class="input" placeholder="••••••" />
          </div>
          <div>
            <label class="label">确认密码</label>
            <input v-model="form.confirm" type="password" class="input" placeholder="再次输入" />
          </div>
            <div>
              <label class="label">教师口令（默认 123456，可修改）</label>
              <input v-model="form.teacherPassword" class="input" placeholder="123456" />
            </div>
            <div>
              <label class="label">当前科目名称（可后续在教师/管理端增加）</label>
              <input v-model="form.subjectName" class="input" placeholder="例如：语文 / 数学 / 默认" />
            </div>
            <div class="grid grid-cols-2 gap-2 text-xs text-indigo-200/80">
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.subjectSync" type="checkbox" class="accent-indigo-400" /> 该科目参与云端同步
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.subjectFeatures.points" type="checkbox" class="accent-indigo-400" /> 允许积分
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.subjectFeatures.pets" type="checkbox" class="accent-indigo-400" /> 允许宠物
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.subjectFeatures.shop" type="checkbox" class="accent-indigo-400" /> 允许商店
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.subjectFeatures.rank" type="checkbox" class="accent-indigo-400" /> 允许排行榜
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input v-model="form.subjectFeatures.avatar" type="checkbox" class="accent-indigo-400" /> 允许头像上传
              </label>
            </div>
          <p v-if="pwError" class="text-sm text-rose-300">{{ pwError }}</p>
        </div>
        <div class="mt-8 flex items-center justify-between gap-2">
          <button class="btn btn-ghost" @click="prev"><ChevronLeft class="w-4 h-4" />上一步</button>
          <button class="btn btn-ghost text-xs flex-1 max-w-xs" @click="openImport"><Download class="w-4 h-4" /> 导入配置</button>
          <button class="btn btn-primary" @click="submit" :disabled="saving">
            <Loader2 v-if="saving" class="w-4 h-4 animate-spin" />
            {{ saving ? '正在保存…' : '完成配置' }}
          </button>
        </div>
      </div>

      <!-- Step 3: 完成 -->
      <div v-else class="text-center py-6">
        <div class="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 grid place-items-center mb-6">
          <CheckCircle2 class="w-11 h-11 text-emerald-300" />
        </div>
        <h2 class="text-2xl font-bold text-indigo-50">配置完成！</h2>
        <p class="mt-2 text-indigo-200/80">
          管理员密码已加密保存{{ synced ? '，云端数据已同步' : '（未配置云端，自动进入离线模式）' }}。
          <br />即将进入准备界面，检查更新并同步数据…
        </p>
        <div class="mt-6 h-1.5 w-48 mx-auto rounded-full bg-white/10 overflow-hidden">
          <div class="h-full bg-indigo-400 rounded-full transition-all duration-700" :style="{ width: progress }" />
        </div>
        <div class="mt-6 flex justify-center gap-3">
          <button class="btn btn-ghost" @click="backFromDone"><ChevronLeft class="w-4 h-4" />上一步</button>
        </div>
      </div>
    </div>

    <!-- 统一配置导入对话框（首次导入：仅未初始化时服务端放行） -->
    <ConfigTransferDialog
      ref="cfgDlg"
      mode="import"
      endpoint="/config/first-import"
      v-model:open="dlgOpen"
      @done="onImportDone"
    />
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { PawPrint, ArrowRight, ChevronLeft, ChevronRight, Cloud, ShieldCheck, CheckCircle2, Loader2, Download } from 'lucide-vue-next';
import { api } from '../api';
import { toast } from '../composables/toast';
import { pick, vibe } from '../composables/useCopyStyle';

const router = useRouter();
const step = ref(0);
const saving = ref(false);
const synced = ref(false);
const progress = ref('20%');
const pwError = ref('');
let doneTimer: ReturnType<typeof setTimeout> | null = null;
const form = reactive({
  supabaseUrl: '',
  supabaseAnonKey: '',
  supabaseServiceKey: '',
  adminName: '',
  adminPassword: '',
  confirm: '',
    teacherPassword: '123456',
    subjectName: '默认',
    subjectSync: true,
    subjectFeatures: { points: true, pets: true, shop: true, rank: true, avatar: true },
});

// 统一配置迁移：选择文件后按类别勾选应用；同时用文件内容预填云端连接等表单字段。
import ConfigTransferDialog from '../components/ConfigTransferDialog.vue';
const cfgDlg = ref<InstanceType<typeof ConfigTransferDialog> | null>(null);
const dlgOpen = ref(false);
const importFile = ref<HTMLInputElement | null>(null);
function openImport(): void {
  importFile.value?.click();
}
/** 教程页以新标签打开（不丢向导已填内容），返回时关闭标签即可 */
function openSupabaseHelp(): void {
  const r = router.resolve({ path: '/help/supabase', query: { from: 'wizard' } });
  window.open(r.href, '_blank');
}
async function onImportFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    (e.target as HTMLInputElement).value = '';
    const text = await file.text();
    // 预填云端连接与基础字段（后续分类导入会在服务端覆盖同类配置）
    const data = JSON.parse(text) as {
      data?: {
        cloud?: { supabaseUrl?: string; supabaseAnonKey?: string; supabaseServiceKey?: string };
        display?: { adminName?: string };
        subjects?: { activeSubject?: string };
      };
    };
    if (data.data?.cloud) {
      form.supabaseUrl = data.data.cloud.supabaseUrl ?? '';
      form.supabaseAnonKey = data.data.cloud.supabaseAnonKey ?? '';
      form.supabaseServiceKey = data.data.cloud.supabaseServiceKey ?? '';
    }
    if (data.data?.display?.adminName) form.adminName = data.data.display.adminName;
    if (data.data?.subjects?.activeSubject) form.subjectName = data.data.subjects.activeSubject;
    await cfgDlg.value?.show();
    cfgDlg.value?.loadFromText(text);
  } catch (err) {
    toast((err as Error).message || '导入失败', 'error');
  }
}
function onImportDone(): void {
  toast('所选类别已应用到系统', 'success');
}

const steps = [
  { key: 'welcome' },
  { key: 'cloud' },
  { key: 'admin' },
  { key: 'done' },
];

/** 表单是否有未提交内容（用于关闭/刷新提醒） */
function hasInput(): boolean {
  return Object.values(form).some((v) => String(v).trim() !== '');
}

/** 关闭标签页 / 刷新前提醒（向导未完成且有输入时） */
function onBeforeUnload(e: BeforeUnloadEvent): void {
  if (step.value < 3 && hasInput()) {
    e.preventDefault();
    e.returnValue = '向导尚未完成，确定要离开吗？';
  }
}
onMounted(() => window.addEventListener('beforeunload', onBeforeUnload));
onUnmounted(() => window.removeEventListener('beforeunload', onBeforeUnload));

function next(): void {
  if (step.value < 2) step.value += 1;
}
function prev(): void {
  if (step.value > 0) step.value -= 1;
}

/** 完成步骤的上一步：取消自动跳转，回到云端配置步骤 */
function backFromDone(): void {
  if (doneTimer) {
    clearTimeout(doneTimer);
    doneTimer = null;
  }
  progress.value = '20%';
  step.value = 1;
}

async function submit(): Promise<void> {
  pwError.value = '';
  if (form.adminPassword.length < 4) {
    pwError.value = '管理员密码至少 4 位';
    return;
  }
  if (form.adminPassword !== form.confirm) {
    pwError.value = '两次输入的密码不一致';
    return;
  }
  saving.value = true;
  try {
    const res = await api<{ ok: boolean; synced: boolean }>('/auth/setup', {
      method: 'POST',
      body: JSON.stringify({
        adminPassword: form.adminPassword,
        adminName: form.adminName,
          teacherPassword: form.teacherPassword || '123456',
          activeSubject: form.subjectName.trim() || '默认',
          subjects: [{ name: form.subjectName.trim() || '默认', sync: form.subjectSync, enabled: { ...form.subjectFeatures } }],
        // 三个输入框全空 = 自动离线模式（不发送云端配置）
        ...(form.supabaseUrl.trim() ? { supabaseUrl: form.supabaseUrl.trim() } : {}),
        ...(form.supabaseAnonKey.trim() ? { supabaseAnonKey: form.supabaseAnonKey.trim() } : {}),
        ...(form.supabaseServiceKey.trim() ? { supabaseServiceKey: form.supabaseServiceKey.trim() } : {}),
      }),
    });
    synced.value = !!res.synced;
    step.value = 3;
    // 进度条动画后进入准备界面
    setTimeout(() => (progress.value = '100%'), 100);
    doneTimer = setTimeout(() => router.replace('/prep'), 1500);
  } catch (e) {
    pwError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>
