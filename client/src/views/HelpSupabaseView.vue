<template>
  <div class="min-h-screen p-6">
    <div class="max-w-3xl mx-auto animate-fadeUp">
      <div class="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h1 class="text-2xl font-bold text-indigo-50 flex items-center gap-2">
          <Cloud class="w-6 h-6 text-sky-300" /> Supabase 云端配置教程
        </h1>
        <button class="btn btn-ghost !py-2 text-sm" @click="goBack">
          <ArrowLeft class="w-4 h-4" /> {{ closeable ? '关闭并返回向导' : '返回' }}
        </button>
      </div>

      <div class="glass p-6 mb-4 text-sm text-indigo-200/80 leading-relaxed">
        配置一次，多台设备（一体机 / 教师机）数据实时互通。全程约 10 分钟，只需要浏览器。
        <div class="mt-2 text-xs text-indigo-200/60">流程：① 注册 → ② 建项目 → ③ 跑建表 SQL → ④ 拿密钥 → ⑤ 填进系统 → ⑥ 验证</div>
      </div>

      <div class="space-y-4">
        <div v-for="(s, i) in steps" :key="i" class="glass p-5">
          <h2 class="font-bold text-indigo-50 mb-2 flex items-center gap-2">
            <span class="w-7 h-7 rounded-lg bg-sky-500/25 grid place-items-center text-sm text-sky-200 shrink-0">{{ i + 1 }}</span>
            {{ s.title }}
          </h2>
          <div class="text-sm text-indigo-200/75 leading-relaxed space-y-1.5">
            <p v-for="(line, j) in s.lines" :key="j">{{ line }}</p>
          </div>
          <div v-if="s.keys" class="mt-3 rounded-xl bg-white/5 border border-white/10 overflow-hidden text-xs">
            <div v-for="k in s.keys" :key="k.field" class="flex items-start gap-2 px-3 py-2 border-b border-white/5 last:border-0">
              <span class="text-indigo-100 font-medium w-36 shrink-0">{{ k.field }}</span>
              <span class="text-indigo-200/70">{{ k.desc }}</span>
            </div>
          </div>
        </div>

        <div class="glass p-5">
          <h2 class="font-bold text-indigo-50 mb-2">常见问题</h2>
          <div class="text-sm space-y-2">
            <div v-for="(f, i) in faqs" :key="i" class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
              <p class="text-indigo-100 font-medium">{{ f.q }}</p>
              <p class="text-indigo-200/70 mt-0.5">{{ f.a }}</p>
            </div>
          </div>
        </div>

        <div class="glass p-5 text-xs text-indigo-200/60 leading-relaxed">
          <p class="font-medium text-indigo-200/80 mb-1">数据安全说明</p>
          <p>所有数据本地全量保存（SQLite），云端只是副本：断网可正常使用，恢复后自动补推。同步冲突不会静默覆盖，会弹窗让你选择保留哪边。每日自动快照 + 每次同步前快照，误操作可回档。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Supabase 配置教程（应用内离线可看）：欢迎向导/管理端均可跳转。
 *  从向导打开时为新标签（window.open），返回即关闭标签，不丢向导状态。 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Cloud } from 'lucide-vue-next';

const router = useRouter();

// 是否由向导以新标签方式打开：URL 带 ?from=wizard 时点返回即关窗
const closeable = computed(() => new URLSearchParams(window.location.search).get('from') === 'wizard');

function goBack(): void {
  if (closeable.value) {
    window.close();
    // window.close 对脚本打开的标签生效；失败则回退到欢迎页
    setTimeout(() => router.push('/welcome'), 200);
  } else {
    router.back();
  }
}

const steps = [
  {
    title: '注册 Supabase',
    lines: [
      '打开 supabase.com，点 Start your project（可用 GitHub 账号直接登录）。',
      '免费版完全够用：500MB 数据库 + 5GB 流量，一个班级绰绰有余。',
    ],
  },
  {
    title: '创建项目',
    lines: [
      '点 New project；Name 随意（如 pet-classroom）。',
      'Database Password 设一个并记下来；Region 选 Southeast Asia (Singapore)，国内延迟最低。',
      '点 Create new project，等待 1~2 分钟初始化完成。',
    ],
  },
  {
    title: '执行建表 SQL（关键，漏了会报"缺少数据表"）',
    lines: [
      '左侧菜单 SQL Editor → New query。',
      '把系统安装目录 supabase/schema.sql 的内容全部复制粘贴进去，点 Run。',
      '显示 Success 即成功；Table Editor 里能看到 students、pets、items 等 10 张表。',
    ],
  },
  {
    title: '拿三串密钥（Project Settings → API）',
    lines: ['对照下表把三个值填进系统：'],
    keys: [
      { field: 'Supabase 项目地址', desc: 'Project URL，形如 https://xxxx.supabase.co' },
      { field: 'Anon Key', desc: 'Project API Keys → anon / publishable（公开密钥，用于读取）' },
      { field: 'Service Role Key', desc: 'service_role（服务端密钥，用于写入，务必保密）' },
    ],
  },
  {
    title: '填进系统',
    lines: [
      '首次安装：欢迎向导第 2 步「云端数据库配置」三个输入框分别填入。',
      '已安装：管理端 → 设置 → 同步与备份 → 云端连接。',
      '批量部署多台：先配好一台，用「配置中心 → 导出配置（勾选云端连接）」生成 json，其他机器导入即可。',
    ],
  },
  {
    title: '验证同步',
    lines: [
      '管理端「测试连接」应显示可读可写；随便加一个学生，概览页"待推送变更"几秒内归 0；',
      '另一台设备打开能看到同一份数据即成功。',
    ],
  },
];

const faqs = [
  { q: '提示"缺少数据表"', a: '第 3 步没做或没跑完：重新执行 schema.sql。' },
  { q: '连接测试显示"只读"', a: '缺 Service Role Key：回第 4 步补齐。' },
  { q: '同步报"云端表缺少列 xxx"', a: '建表 SQL 是旧版：重新执行最新 schema.sql（幂等，不伤数据）。' },
  { q: '想换 Supabase 项目', a: '直接改连接配置，系统会自动做一次全量对账。' },
];
</script>
