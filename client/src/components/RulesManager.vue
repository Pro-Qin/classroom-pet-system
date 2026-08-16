<template>
  <div class="glass p-5 animate-fadeUp">
    <div class="flex items-center gap-2 mb-1">
      <Smile class="w-5 h-5 text-pink-300" />
      <h3 class="font-bold text-indigo-50">宠物状态规则</h3>
      <span class="ml-auto pill bg-white/10 text-indigo-200/80">教师 / 管理端共用</span>
    </div>
    <p class="text-xs text-indigo-200/60 mb-4">按规则顺序匹配：每条规则的「全部条件」同时满足才触发。留空条件 = 兜底状态。</p>

    <div class="space-y-2 max-h-[560px] overflow-y-auto pr-1">
      <div v-for="r in rules" :key="r.id" class="rounded-xl bg-white/4 border border-white/10 p-3">
        <div class="flex items-center gap-2 flex-wrap mb-2">
          <input v-model="r.label" class="input !w-32 !py-1.5 text-sm" placeholder="状态名称" />
          <input v-model="r.color" type="color" class="w-8 h-8 rounded-lg bg-transparent border border-white/15 cursor-pointer" :title="r.color" />
          <span class="pill" :style="{ background: r.color + '33', color: r.color }">{{ r.label }}</span>
          <span class="text-[11px] text-indigo-200/50">{{ r.state_key }}</span>
        </div>

        <!-- 条件可视化编辑 -->
        <div class="space-y-1.5">
          <div v-for="(c, i) in condOf(r)" :key="i" class="flex items-center gap-2 text-sm">
            <span class="text-indigo-200/60">属性</span>
            <select v-model="c.attr" class="input !w-28 !py-1 !text-xs">
              <option value="health">健康</option>
              <option value="hungry">饱食</option>
              <option value="happy">心情</option>
              <option value="clean">清洁</option>
            </select>
            <select v-model="c.op" class="input !w-16 !py-1 !text-xs">
              <option value="<">&lt;</option>
              <option value="<=">&le;</option>
              <option value=">">&gt;</option>
              <option value=">=">&ge;</option>
              <option value="==">=</option>
            </select>
            <input v-model.number="c.value" type="number" class="input !w-20 !py-1 !text-xs text-center" />
            <button class="btn btn-ghost !py-0.5 !px-2" @click="removeCond(r, i)"><X class="w-3 h-3" /></button>
          </div>
        </div>
        <div class="mt-2 flex items-center gap-2">
          <button class="btn btn-ghost !py-1 !px-2.5 text-xs" @click="addCond(r)"><Plus class="w-3 h-3" /> 条件</button>
          <button class="btn btn-primary !py-1 text-xs" @click="saveRule(r)"><Check class="w-3 h-3" /> 保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Smile, Plus, X, Check } from 'lucide-vue-next';
import { api } from '../api';
import { toast } from '../composables/toast';

interface Rule {
  id: string;
  state_key: string;
  label: string;
  conditions: string;
  icon: string;
  color: string;
  sort: number;
}
interface Cond { attr: string; op: string; value: number; }

const rules = ref<Rule[]>([]);

function condOf(r: Rule): Cond[] {
  if (!(r as Rule & { __conds?: Cond[] }).__conds) {
    try {
      (r as Rule & { __conds?: Cond[] }).__conds = JSON.parse(r.conditions || '[]') as Cond[];
    } catch {
      (r as Rule & { __conds?: Cond[] }).__conds = [];
    }
  }
  return (r as Rule & { __conds: Cond[] }).__conds;
}
function addCond(r: Rule): void { condOf(r).push({ attr: 'happy', op: '<', value: 40 }); }
function removeCond(r: Rule, i: number): void { condOf(r).splice(i, 1); }

async function load(): Promise<void> {
  const r = await api<{ rules: Rule[] }>('/admin/state-rules');
  rules.value = r.rules;
}

async function saveRule(r: Rule): Promise<void> {
  try {
    await api('/admin/state-rules/' + r.id, {
      method: 'PUT',
      body: JSON.stringify({ label: r.label, conditions: condOf(r), color: r.color }),
    });
    toast('规则已保存', 'success');
  } catch (e) { toast((e as Error).message, 'error'); }
}

onMounted(load);
</script>