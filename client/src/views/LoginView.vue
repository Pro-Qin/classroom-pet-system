<template>
  <div class="min-h-screen flex flex-col">
    <header class="pt-10 pb-6 text-center animate-fadeUp">
      <div class="inline-flex items-center gap-3">
        <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 grid place-items-center shadow-glow">
          <PawPrint class="w-6 h-6 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-indigo-50">校园宠物乐园</h1>
      </div>
      <p class="mt-2 text-sm text-indigo-200/70">积分 · 宠物 · 成长</p>
      <p class="mt-1 text-[11px] tracking-[0.3em] text-indigo-200/40">请选择下方系统入口</p>
    </header>

    <main class="flex-1 w-full max-w-5xl mx-auto px-6 pb-12">
      <!-- 三个系统入口 -->
      <div class="grid md:grid-cols-3 gap-5 animate-fadeUp">
        <!-- 学生系统 -->
        <button class="glass p-6 text-left hover:-translate-y-1 transition-transform group" @click="tab = 'student'">
          <div class="flex items-center justify-between">
            <div class="w-11 h-11 rounded-xl bg-sky-500/25 grid place-items-center">
              <Users class="w-6 h-6 text-sky-300" />
            </div>
            <ChevronDown class="w-6 h-6 text-sky-300/70 animate-bounce-soft" />
          </div>
          <h2 class="mt-4 text-lg font-bold text-indigo-50">学生系统</h2>
          <p class="mt-1 text-sm text-indigo-200/70">无需密码，在下方点选学生即可查看宠物与积分</p>
          <p class="mt-2 inline-flex items-center gap-1 text-xs text-sky-300/80"><ChevronDown class="w-3.5 h-3.5" /> 点击下方学生卡片进入</p>
        </button>

        <!-- 教师系统 -->
        <button class="glass p-6 text-left hover:-translate-y-1 transition-transform group" @click="tab = 'teacher'">
          <div class="flex items-center justify-between">
            <div class="w-11 h-11 rounded-xl bg-amber-500/25 grid place-items-center">
              <GraduationCap class="w-6 h-6 text-amber-300" />
            </div>
            <ChevronRight class="w-5 h-5 text-white/30 group-hover:text-amber-300 transition-colors" />
          </div>
          <h2 class="mt-4 text-lg font-bold text-indigo-50">教师系统</h2>
          <p class="mt-1 text-sm text-indigo-200/70">加减分、批量操作、排行榜</p>
        </button>

        <!-- 管理系统 -->
        <button class="glass p-6 text-left hover:-translate-y-1 transition-transform group" @click="tab = 'admin'">
          <div class="flex items-center justify-between">
            <div class="w-11 h-11 rounded-xl bg-emerald-500/25 grid place-items-center">
              <ShieldCheck class="w-6 h-6 text-emerald-300" />
            </div>
            <ChevronRight class="w-5 h-5 text-white/30 group-hover:text-emerald-300 transition-colors" />
          </div>
          <h2 class="mt-4 text-lg font-bold text-indigo-50">管理系统</h2>
          <p class="mt-1 text-sm text-indigo-200/70">宠物种类、状态规则、系统配置</p>
        </button>
      </div>

      <!-- 学生面板 -->
      <div v-if="tab === 'student'" class="mt-6 glass p-6 animate-fadeUp">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-bold text-indigo-100 flex items-center gap-2"><Users class="w-5 h-5 text-sky-300" /> 选择学生</h3>
          <input v-model="keyword" class="input !w-56" placeholder="搜索姓名…" />
        </div>
        <div v-if="students.length === 0" class="py-10 text-center text-indigo-200/60">
          暂无学生数据
        </div>
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            v-for="s in filtered"
            :key="s.id"
            class="glass !rounded-2xl p-4 flex items-center gap-3 text-left hover:border-indigo-400/60 transition-colors"
            @click="enterStudent(s.id)"
          >
            <div
              class="w-11 h-11 rounded-full grid place-items-center text-xl font-bold shrink-0"
              :style="{ background: `linear-gradient(135deg, ${s.speciesColorFrom}, ${s.speciesColorTo})` }"
            >
              {{ s.petEmoji || s.name.slice(0, 1) }}
            </div>
            <div class="min-w-0">
              <p class="font-semibold text-indigo-50 truncate">{{ s.name }}</p>
              <p class="text-xs text-indigo-200/60 truncate"><Star class="w-3 h-3 inline -mt-0.5 text-amber-300" /> {{ s.points }} {{ pointsUnit }}</p>
            </div>
          </button>
        </div>
      </div>

      <!-- 教师/管理面板 -->
      <div v-else-if="tab === 'teacher' || tab === 'admin'" class="mt-6 glass max-w-md mx-auto p-6 animate-fadeUp">
        <h3 class="font-bold text-indigo-100 mb-4 flex items-center gap-2">
          <GraduationCap v-if="tab === 'teacher'" class="w-5 h-5 text-amber-300" />
          <ShieldCheck v-else class="w-5 h-5 text-emerald-300" />
          {{ tab === 'teacher' ? '教师口令' : '管理员密码' }}
        </h3>
        <input
          v-model="password"
          type="password"
          class="input"
          :placeholder="tab === 'teacher' ? '请输入教师口令' : '请输入管理员密码'"
          @keyup.enter="doLogin"
        />
        <p v-if="loginError" class="mt-2 text-sm text-rose-300">{{ loginError }}</p>
        <button class="btn btn-primary w-full mt-4" :disabled="loggingIn" @click="doLogin">
          <Loader2 v-if="loggingIn" class="w-4 h-4 animate-spin" />
          进入{{ tab === 'teacher' ? '教师系统' : '管理系统' }}
        </button>
        <div class="mt-3 text-center">
          <router-link to="/settings" class="text-xs text-indigo-200/50 hover:text-indigo-100 underline underline-offset-2">本机设置（仅存本机，不会同步）</router-link>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { PawPrint, Users, GraduationCap, ShieldCheck, ChevronRight, ChevronDown, Star, Loader2 } from 'lucide-vue-next';
import { api, setAuth, clearAuth } from '../api';
import { useSettings } from '../composables/settings';

interface StudentCard {
  id: string;
  name: string;
  points: number;
  petEmoji: string;
  speciesColorFrom: string;
  speciesColorTo: string;
}
interface StudentsResp {
  students: StudentCard[];
}

const router = useRouter();
const { pointsUnit } = useSettings();
const tab = ref<'student' | 'teacher' | 'admin'>('student');
const students = ref<StudentCard[]>([]);
const keyword = ref('');
const password = ref('');
const loginError = ref('');
const loggingIn = ref(false);

const filtered = computed(() => {
  const k = keyword.value.trim();
  if (!k) return students.value;
  return students.value.filter((s) => s.name.includes(k));
});

async function loadStudents(): Promise<void> {
  try {
    const res = await api<StudentsResp>('/students');
    students.value = res.students ?? [];
  } catch {
    students.value = [];
  }
}

function enterStudent(id: string): void {
  clearAuth();
  router.push(`/students/${id}`);
}

async function doLogin(): Promise<void> {
  if (!password.value) return;
  loginError.value = '';
  loggingIn.value = true;
  try {
    const role = tab.value === 'teacher' ? 'teacher' : 'admin';
    const res = await api<{ token: string; role: string; name: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, password: password.value }),
    });
    setAuth(res.token, res.role, res.name);
    router.push(role === 'teacher' ? '/teacher' : '/admin');
  } catch (e) {
    loginError.value = (e as Error).message;
  } finally {
    loggingIn.value = false;
  }
}

onMounted(loadStudents);
</script>