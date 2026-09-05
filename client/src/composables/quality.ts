import { reactive } from 'vue';
import { getLocalSetting } from './useLocalSettings';
import { api } from '../api';

/**
 * 高质量模式（装饰光斑 + 毛玻璃）默认关闭。
 * 默认关闭是为了降低 GPU 渲染占用；打开后 <html> 加 .hq-on，CSS 才渲染 bg-orb 与玻璃模糊。
 */
const state = reactive({ on: false });
let started = false;

function apply(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('hq-on', state.on);
}

async function refresh(): Promise<void> {
  const local = getLocalSetting('highQuality', false);
  let server = false;
  try {
    const r = await api<{ highQuality?: boolean }>('/admin/settings');
    server = !!r.highQuality;
  } catch {
    /* 未登录/离线：只按本机设置 */
  }
  state.on = local || server;
  apply();
}

export function useHighQuality(): { on: typeof state.on; refresh: () => Promise<void> } {
  if (!started) {
    started = true;
    void refresh();
  }
  return { on: state.on, refresh };
}
