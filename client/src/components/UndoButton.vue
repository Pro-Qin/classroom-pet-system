<template>
  <Transition name="undo-pop">
    <button
      v-if="visible"
      class="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all"
      :class="expired ? 'bg-white/10 text-indigo-200/40 cursor-not-allowed' : 'bg-emerald-500/85 text-white hover:bg-emerald-500 active:scale-95'"
      :disabled="busy"
      :aria-label="buttonLabel"
      @click="onUndo"
    >
      <Loader2 v-if="busy" class="w-4 h-4 animate-spin" />
      <Undo2 v-else class="w-4 h-4" />
      {{ buttonLabel }}
    </button>
  </Transition>
</template>

<script setup lang="ts">
/**
 * 全局撤回按钮：底部右侧悬浮。
 * 有可撤回操作时亮起并显示剩余时间；无操作/超时时保持灰显；
 * 点击后向服务端发起积分冲正（追加反向流水，不改历史）。
 */
import { computed, ref } from 'vue';
import { Loader2, Undo2 } from 'lucide-vue-next';
import { undoState, isUndoExpired, clearUndoable } from '../composables/undo';
import { api } from '../api';
import { toast } from '../composables/toast';

const busy = ref(false);

const visible = computed(() => !!undoState.action);
const expired = computed(() => !undoState.action || isUndoExpired());
const buttonLabel = computed(() => (undoState.action ? `撤回：${undoState.action.label}` : '暂无可撤回的操作'));

async function onUndo(): Promise<void> {
  const a = undoState.action;
  if (!a || expired.value || busy.value) return;
  busy.value = true;
  try {
    await api('/points/revert', { method: 'POST', body: JSON.stringify({ eventIds: a.eventIds }) });
    toast(`已撤回：${a.label}`, 'success');
    clearUndoable();
  } catch (e) {
    toast((e as Error).message || '撤回失败', 'error');
    clearUndoable(); // 已不可撤回（如已被冲正），灰掉避免反复报错
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped>
.undo-pop-enter-active,
.undo-pop-leave-active {
  transition: all 0.25s ease-out;
}
.undo-pop-enter-from,
.undo-pop-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
@media (prefers-reduced-motion: reduce) {
  .undo-pop-enter-active,
  .undo-pop-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
