import { reactive } from 'vue';

export interface ToastItem {
  id: number;
  text: string;
  type: 'success' | 'error' | 'info';
}

let seq = 0;
export const toasts = reactive<ToastItem[]>([]);

export function toast(text: string, type: ToastItem['type'] = 'info'): void {
  const id = ++seq;
  toasts.push({ id, text, type });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, 3200);
}
