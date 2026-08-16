<template>
  <div class="glass p-5 animate-fadeUp">
    <div class="flex items-center gap-2 mb-4">
      <Store class="w-5 h-5 text-amber-300" />
      <h3 class="font-bold text-indigo-50">道具管理</h3>
      <span class="ml-auto pill bg-white/10 text-indigo-200/80">教师 / 管理端共用</span>
    </div>

    <div class="rounded-xl bg-white/5 border border-white/10 p-4 mb-5">
      <p class="font-semibold text-indigo-100 mb-3">新增道具</p>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <input v-model="form.id" class="input !py-2 text-sm" placeholder="id（英文）" />
        <input v-model="form.name" class="input !py-2 text-sm" placeholder="名称" />
        <select v-model="form.type" class="input !py-2 text-sm">
          <option value="food">食物</option>
          <option value="clean">清洁</option>
          <option value="toy">玩具</option>
          <option value="heal">医疗</option>
          <option value="exp">经验</option>
        </select>
        <input v-model.number="form.cost" type="number" class="input !py-2 text-sm" placeholder="价格" />
      </div>

      <p class="text-xs text-indigo-200/70 mt-4 mb-1.5">道具效果（可视化编辑）</p>
      <div class="space-y-2">
        <div v-for="(row, i) in effectRows" :key="i" class="flex gap-2 items-center">
          <select v-model="row.key" class="input !w-32 !py-1.5 text-sm">
            <option value="health">健康</option>
            <option value="hungry">饱食</option>
            <option value="happy">心情</option>
            <option value="clean">清洁</option>
            <option value="exp">经验</option>
          </select>
          <input v-model.number="row.value" type="number" class="input !w-24 !py-1.5 text-sm text-center" placeholder="数值" />
          <span class="text-xs text-indigo-200/60">效果 +{{ row.value || 0 }}</span>
          <button class="btn btn-ghost !py-1 !px-2" @click="removeEffect(i)"><X class="w-3.5 h-3.5" /></button>
        </div>
      </div>
      <button class="btn btn-ghost !py-1.5 text-xs mt-2" @click="addEffect">
        <Plus class="w-3.5 h-3.5" /> 添加一条效果
      </button>

      <input v-model="form.desc" class="input !py-2 text-sm mt-3" placeholder="描述，如：饱食 +20，心情 +5" />
      <p v-if="formError" class="text-xs text-rose-300 mt-2">{{ formError }}</p>
      <button class="btn btn-primary mt-3" @click="saveItem"><Plus class="w-4 h-4" /> 保存道具</button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
      <div v-for="it in items" :key="it.id" class="rounded-xl bg-white/5 border border-white/10 p-3 glass-hover">
        <div class="flex items-center justify-between">
          <p class="text-sm font-semibold text-indigo-50">{{ it.name }}</p>
          <span class="pill bg-amber-400/15 text-amber-300 text-xs">{{ it.cost }} 分</span>
        </div>
        <p class="text-xs text-indigo-200/60 mt-1">{{ it.desc }}</p>
        <p class="text-xs text-indigo-200/40 mt-1">{{ typeLabel(it.type) }} · {{ effectText(it.effect) }}</p>
        <button class="btn btn-danger !py-1 text-xs mt-2" @click="delItem(it)"><Trash2 class="w-3.5 h-3.5" /> 删除</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Store, Plus, X, Trash2 } from 'lucide-vue-next';
import { api } from '../api';
import { toast } from '../composables/toast';

interface Item { id: string; name: string; icon: string; type: string; cost: number; effect: string; desc: string; }

const items = ref<Item[]>([]);
const formError = ref('');
const form = reactive({ id: '', name: '', type: 'food', cost: undefined as number | undefined, desc: '' });
const effectRows = reactive<{ key: string; value: number }[]>([]);

const TYPE_LABEL: Record<string, string> = { food: '食物', clean: '清洁', toy: '玩具', heal: '医疗', exp: '经验' };
const typeLabel = (t: string): string => TYPE_LABEL[t] ?? t;
function effectText(effect: string): string {
  try {
    const o = JSON.parse(effect) as Record<string, number>;
    return Object.entries(o).map(([k, v]) => k + ' +' + v).join('，') || '无效果';
  } catch {
    return effect || '无效果';
  }
}

function addEffect(): void { effectRows.push({ key: 'hungry', value: 10 }); }
function removeEffect(i: number): void { effectRows.splice(i, 1); }

async function load(): Promise<void> {
  const r = await api<{ items: Item[] }>('/admin/items');
  items.value = r.items;
}

async function saveItem(): Promise<void> {
  formError.value = '';
  if (!form.id.trim() || !form.name.trim()) { formError.value = 'id 与名称必填'; return; }
  const effect: Record<string, number> = {};
  for (const row of effectRows) {
    if (row.key && row.value) effect[row.key] = Math.round(row.value);
  }
  try {
    await api('/admin/items', {
      method: 'POST',
      body: JSON.stringify({ ...form, cost: Number(form.cost) || 0, effect }),
    });
    toast('道具已添加', 'success');
    Object.assign(form, { id: '', name: '', type: 'food', cost: undefined, desc: '' });
    effectRows.splice(0);
    await load();
  } catch (e) { formError.value = (e as Error).message; }
}

async function delItem(it: Item): Promise<void> {
  if (!confirm('删除道具「' + it.name + '」？')) return;
  try {
    await api('/admin/items/' + it.id, { method: 'DELETE' });
    toast('已删除', 'success');
    await load();
  } catch (e) { toast((e as Error).message, 'error'); }
}

onMounted(load);
</script>