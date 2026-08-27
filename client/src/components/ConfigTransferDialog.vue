<template>
  <Transition name="dlg">
    <div v-if="open" class="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/60 backdrop-blur-sm" @click.self="close">
      <div class="glass w-full max-w-lg p-6 animate-fadeUp max-h-[85vh] overflow-y-auto">
        <h3 class="text-lg font-bold text-indigo-50 flex items-center gap-2">
          <component :is="mode === 'export' ? Download : Upload" class="w-5 h-5 text-sky-300" />
          {{ mode === 'export' ? '导出配置' : '导入配置' }}
        </h3>

        <!-- 导出模式：直接勾选要导出的类别 -->
        <template v-if="mode === 'export'">
          <p class="mt-2 text-xs text-indigo-200/70">勾选需要打包的类别（<span class="text-amber-300">云端连接</span> 含密钥，默认不勾，请妥善保管文件）。</p>
          <div class="mt-4 space-y-2">
            <label
              v-for="c in catalog"
              :key="c.key"
              class="flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors"
              :class="picked.has(c.key) ? 'bg-indigo-500/15 border-indigo-400/40' : 'bg-white/5 border-white/10 hover:bg-white/10'"
            >
              <input type="checkbox" class="accent-indigo-400 mt-0.5" :checked="picked.has(c.key)" @change="toggle(c.key)" />
              <span>
                <span class="block text-sm font-medium text-indigo-50">{{ c.label }}</span>
                <span class="block text-xs text-indigo-200/60">{{ c.desc }}</span>
              </span>
            </label>
          </div>
          <button class="btn btn-primary mt-5 w-full justify-center" :disabled="picked.size === 0 || busy" @click="doExport">
            <Loader2 v-if="busy" class="w-4 h-4 animate-spin" /> 导出所选（{{ picked.size }} 类）
          </button>
        </template>

        <!-- 导入模式：先选文件再勾类别 -->
        <template v-else>
          <input ref="fileRef" type="file" accept=".json,application/json" class="hidden" @change="onFile" />
          <div v-if="!parsed" class="mt-4">
            <button class="btn btn-primary w-full justify-center py-6 rounded-2xl border-2 border-dashed border-white/20 !bg-transparent" @click="fileRef?.click()">
              <FileJson class="w-6 h-6 text-sky-300" /> 点击选择配置文件 (.json)
            </button>
          </div>
          <template v-else>
            <div class="mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-indigo-200/70 flex items-center gap-2">
              <CheckCircle2 class="w-4 h-4 text-emerald-300 shrink-0" />
              {{ fileMeta }}
              <button class="ml-auto underline underline-offset-2 hover:text-indigo-100" @click="reset">换一个文件</button>
            </div>
            <p class="mt-4 text-xs text-indigo-200/70">勾选本次要应用的类别（未勾选的不受影响）：</p>
            <div class="mt-2 space-y-2">
              <label
                v-for="c in availableCats"
                :key="c.key"
                class="flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors"
                :class="picked.has(c.key) ? 'bg-indigo-500/15 border-indigo-400/40' : 'bg-white/5 border-white/10 hover:bg-white/10'"
              >
                <input type="checkbox" class="accent-indigo-400 mt-0.5" :checked="picked.has(c.key)" @change="toggle(c.key)" />
                <span>
                  <span class="block text-sm font-medium text-indigo-50">{{ c.label }}</span>
                  <span class="block text-xs text-indigo-200/60">{{ c.desc }}</span>
                </span>
              </label>
            </div>
            <button class="btn btn-primary mt-5 w-full justify-center" :disabled="picked.size === 0 || busy" @click="doImport">
              <Loader2 v-if="busy" class="w-4 h-4 animate-spin" /> 应用所选（{{ picked.size }} 类）
            </button>
          </template>
        </template>

        <!-- 结果摘要 -->
        <ul v-if="results.length" class="mt-4 space-y-1.5 text-xs">
          <li v-for="(r, i) in results" :key="i" class="rounded-lg bg-emerald-500/10 text-emerald-200 px-3 py-1.5">
            {{ labelOf(r.category) }}：{{ r.detail }}
          </li>
        </ul>

        <p v-if="errMsg" class="mt-3 text-sm text-rose-300">{{ errMsg }}</p>

        <button class="btn btn-ghost mt-5 w-full justify-center" @click="close">关闭</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
/**
 * 统一配置迁移对话框：导出/导入共用一套「类别目录」。
 * 服务端 /api/config/catalog 是唯一来源，避免前后端各自维护清单。
 */
import { computed, ref } from 'vue';
import { CheckCircle2, Download, FileJson, Loader2, Upload } from 'lucide-vue-next';
import { api } from '../api';
import { toast } from '../composables/toast';

interface CatalogItem {
  key: string;
  label: string;
  desc: string;
  kind: 'settings' | 'table';
}
interface ImportResult {
  category: string;
  detail: string;
}

const props = defineProps<{ mode: 'export' | 'import'; endpoint?: string }>();
const emit = defineEmits<{ (e: 'done'): void }>();

const open = defineModel<boolean>('open', { default: false });
const catalog = ref<CatalogItem[]>([]);
const picked = ref(new Set<string>());
const parsed = ref<Record<string, unknown> | null>(null);
const presentKeys = ref<string[]>([]);
const busy = ref(false);
const errMsg = ref('');
const results = ref<ImportResult[]>([]);
const fileRef = ref<HTMLInputElement | null>(null);
const rawExportedAt = ref('');

function toggle(key: string): void {
  const next = new Set(picked.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  picked.value = next;
}

const labelOf = (key: string): string => catalog.value.find((c) => c.key === key)?.label ?? key;

/** 默认勾选策略：全部类别，除 cloud（云端密钥类敏感，须显式选择） */
function defaultPick(keys?: string[]): void {
  const base = keys ?? catalog.value.map((c) => c.key);
  picked.value = new Set(base.filter((k) => k !== 'cloud'));
}
async function ensureCatalog(): Promise<void> {
  if (catalog.value.length > 0) return;
  try {
    const r = await api<{ categories: CatalogItem[] }>('/config/catalog');
    catalog.value = r.categories;
  } catch {
    catalog.value = [];
  }
}
async function show(): Promise<void> {
  errMsg.value = '';
  results.value = [];
  await ensureCatalog();
  if (props.mode === 'export') defaultPick();
}

function close(): void {
  open.value = false;
}
function reset(): void {
  parsed.value = null;
  presentKeys.value = [];
  picked.value = new Set<string>();
  fileRef.value && (fileRef.value.value = '');
}

const fileMeta = computed(() =>
  parsed.value ? `已读取：${rawExportedAt.value.slice(0, 19).replace('T', ' ') || '配置包'} · ${presentKeys.value.length} 个类别` : ''
);

const availableCats = computed(() => catalog.value.filter((c) => presentKeys.value.includes(c.key)));

async function onFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    loadFromText(text);
  } catch (err) {
    errMsg.value = (err as Error).message || '文件解析失败';
  } finally {
    (e.target as HTMLInputElement).value = '';
  }
}

/** 外部直接注入配置文本（欢迎向导等自带文件选择的场景复用） */
function loadFromText(text: string): void {
  errMsg.value = '';
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error('不是有效的 JSON 配置文件');
  }
  const meta = data.meta as { tool?: string; exportedAt?: string } | undefined;
  const d = data.data as Record<string, unknown> | undefined;
  if (meta?.tool !== 'classroom-pet-system-config' || !d || typeof d !== 'object') {
    throw new Error('不是本系统的配置导出文件');
  }
  reset();
  parsed.value = data;
  rawExportedAt.value = meta.exportedAt ?? '';
  presentKeys.value = Object.keys(d).filter((k) => catalog.value.some((c) => c.key === k));
  defaultPick(presentKeys.value);
  toast(`已识别 ${presentKeys.value.length} 个可导入类别`, 'success');
}
defineExpose({ show, loadFromText });

async function doExport(): Promise<void> {
  busy.value = true;
  errMsg.value = '';
  try {
    const data = await api<Record<string, unknown>>(`/admin/config/export?keys=${[...picked.value].join(',')}`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pet-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('配置已导出', 'success');
    close();
  } catch (e) {
    errMsg.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}

async function doImport(): Promise<void> {
  if (!parsed.value) return;
  busy.value = true;
  errMsg.value = '';
  results.value = [];
  try {
    const r = await api<{ ok: boolean; results?: ImportResult[]; error?: string }>(props.endpoint ?? '/config/import', {
      method: 'POST',
      body: JSON.stringify({ payload: parsed.value, categories: [...picked.value] }),
    });
    results.value = r.results ?? [];
    toast('配置导入完成', 'success');
    emit('done');
  } catch (e) {
    errMsg.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.dlg-enter-active,
.dlg-leave-active {
  transition: opacity 0.25s ease-out;
}
.dlg-enter-from,
.dlg-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .dlg-enter-active,
  .dlg-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
