<template>
  <div class="fixed top-5 left-1/2 -translate-x-1/2 z-[100] space-y-2 pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="glass px-4 py-2.5 flex items-center gap-2.5 text-sm font-medium"
        :class="t.type === 'success' ? '!border-emerald-400/40' : t.type === 'error' ? '!border-rose-400/40' : ''"
      >
        <CheckCircle2 v-if="t.type === 'success'" class="w-4.5 h-4.5 text-emerald-300" />
        <AlertCircle v-else-if="t.type === 'error'" class="w-4.5 h-4.5 text-rose-300" />
        <Info v-else class="w-4.5 h-4.5 text-sky-300" />
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { toasts } from '../composables/toast';
import { CheckCircle2, AlertCircle, Info } from 'lucide-vue-next';
</script>

<style scoped>
.toast-enter-active {
  transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}
.toast-leave-active {
  transition: all 0.35s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-16px) scale(0.92);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.94);
}
</style>